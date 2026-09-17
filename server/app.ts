import express from "express";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Store, AppError } from "./store.ts";
import { seed } from "./seed.ts";
import { createOp } from "../shared/model.ts";
import { Connections } from "./connections.ts";
import { FileReferences } from './fileReferences';

export function createApplication(options: {
  dataDir: string;
  workspace: string;
  port: number;
  seed?: boolean;
  distDir?: string;
}) {
  const { dataDir, workspace, port } = options;
  mkdirSync(path.join(dataDir, "assets"), { recursive: true });
  const tokenFile = path.join(dataDir, "token");
  if (!existsSync(tokenFile))
    writeFileSync(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  const token = readFileSync(tokenFile, "utf8").trim();
  const store = new Store(path.join(dataDir, "workspace.sqlite"));
  const connections = new Connections(store);
  const references = new FileReferences(store, workspace, dataDir);
  if (options.seed !== false) seed(store);
  const app = express();
  app.disable("x-powered-by");
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    "http://127.0.0.1:4318",
  ]);
  app.use((req, res, next) => {
    if (
      ![`127.0.0.1:${port}`, "127.0.0.1:4318"].includes(req.headers.host || "")
    )
      return res.status(403).json({ error: "Host 不受信任" });
    if (req.headers.origin && !origins.has(req.headers.origin))
      return res.status(403).json({ error: "Origin 不受信任" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "不接受跨站请求" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(express.json({ limit: "20mb" }));
  app.get("/api/session", (_req, res) => {
    res.cookie("ac_session", token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    res.json({ ok: true });
  });
  const equal = (v: string) => {
    const a = Buffer.from(v),
      b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  app.use(["/api", "/assets-file"], (req, res, next) => {
    const bearer = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("ac_session="))
        ?.slice(11) || "";
    const grant = bearer && !equal(bearer) ? connections.authenticate(bearer) : undefined;
    // A supplied bearer never falls back to the browser owner's cookie.
    if (bearer ? !equal(bearer) && !grant : !equal(cookie))
      return res
        .status(401)
        .json({
          error: "本地会话已失效，请重新打开画布",
          code: "UNAUTHENTICATED",
        });
    res.locals.actor = bearer ? "agent" : "human";
    res.locals.grant = grant;
    if (grant) {
      const route = req.originalUrl.split("?")[0];
      const discovery = req.method === "GET" && ["/api/projects", "/api/connection"].includes(route);
      const match = route.match(/^\/(?:api\/projects|assets-file)\/([^/]+)(?:\/|$)/);
      const target = match ? decodeURIComponent(match[1])
        : ["/api/batch", "/api/undo", "/api/assets"].includes(route) ? req.body?.projectId : undefined;
      if (!discovery && (target !== grant.projectId || route.includes("/connections")))
        return res.status(403).json({ error: "口令只允许访问授权项目", code: "PROJECT_FORBIDDEN" });
      if (req.method !== "GET" && grant.permission !== "edit")
        return res.status(403).json({ error: "此口令为只读，不能修改画布", code: "READ_ONLY" });
    }
    next();
  });
  app.get("/api/connection", (_req, res) => {
    const grant = res.locals.grant;
    if (!grant) throw new AppError(400, "请使用项目连接口令");
    res.json({ grant, project: store.project(grant.projectId) });
  });
  app.use("/api/projects/:projectId/connections", (_req, res, next) => {
    if (res.locals.actor !== "human")
      return res.status(403).json({ error: "请在画布界面管理连接", code: "OWNER_ONLY" });
    next();
  });
  app.get("/api/projects/:projectId/connections", (req, res) =>
    res.json(connections.list(String(req.params.projectId))));
  app.post("/api/projects/:projectId/connections", (req, res) => {
    const b = z.object({ name: z.string().trim().min(1).max(80), permission: z.enum(["read", "edit"]) }).parse(req.body);
    res.status(201).json(connections.create(String(req.params.projectId), b.name, b.permission));
  });
  app.post("/api/projects/:projectId/connections/:id/revoke", (req, res) =>
    res.json(connections.revoke(String(req.params.projectId), String(req.params.id))));
  const clients = new Set<{ projectId: string; res: express.Response }>();
  store.onChange = (projectId, id) => {
    for (const c of clients)
      if (c.projectId === projectId)
        c.res.write(
          `event: change\ndata: ${JSON.stringify({ projectId, changeId: id })}\n\n`,
        );
  };
  app.get("/api/events", (req, res) => {
    const projectId = String(req.query.projectId || "");
    store.project(projectId);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: ready\ndata: {}\n\n");
    const client = { projectId, res };
    clients.add(client);
    const timer = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    req.on("close", () => {
      clearInterval(timer);
      clients.delete(client);
    });
  });
  app.get("/api/projects", (_req, res) => res.json(res.locals.grant
    ? [store.project(res.locals.grant.projectId)] : store.projects()));
  app.get("/api/runtime", (_req, res) =>
    res.json({ pid: process.pid, workspace: path.resolve(workspace),
      mcp: { command: process.execPath, args: ["--import", path.resolve(workspace, "node_modules/tsx/dist/loader.mjs"), path.resolve(workspace, "server/mcp.ts")],
        env: { AGENTCANVAS_URL: `http://127.0.0.1:${port}` } } }),
  );
  app.post("/api/projects", (req, res) =>
    res.status(201).json(store.newProject(z.string().parse(req.body.name))),
  );
  app.post("/api/projects/:projectId/rename", (req,res)=>{
    const b=z.object({name:z.string(),expectedVersion:z.number().int().positive(),requestId:z.string().min(1)}).parse(req.body);
    res.json(store.renameProject(String(req.params.projectId),b.name,b.expectedVersion,b.requestId));
  });
  app.get("/api/projects/:projectId", (req, res) =>
    res.json(store.snapshot(String(req.params.projectId))),
  );
  app.post('/api/projects/:projectId/files', (req, res) => {
    const b = z.object({ source: z.string().trim().min(1).max(4096), requestId: z.string().uuid() }).parse(req.body);
    res.json(references.register(String(req.params.projectId), b.source, res.locals.actor, b.requestId));
  });
  app.get('/api/projects/:projectId/files/:id', (req, res) => res.json(references.current(String(req.params.projectId), String(req.params.id))));
  app.get('/api/projects/:projectId/files/:id/read', (req, res) => res.json(references.read(String(req.params.projectId), String(req.params.id))));
  app.get('/api/projects/:projectId/files/:id/content', (req, res) => {
    const file = references.current(String(req.params.projectId), String(req.params.id));
    if (file.remote) throw new AppError(400, '外部文件请通过原始链接预览');
    if (file.mediaType === 'markdown' && file.size! > 2 * 1024 * 1024) throw new AppError(413, 'Markdown 文件上限为 2 MB');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'no-cache');
    res.type(file.mime).sendFile(file.source, { dotfiles: 'allow' });
  });
  app.get("/api/projects/:projectId/entities/:id", (req, res) =>
    res.json(store.get(String(req.params.projectId), String(req.params.id))),
  );
  app.get("/api/projects/:projectId/changes", (req, res) =>
    res.json(store.changes(String(req.params.projectId))),
  );
  app.get(
    "/api/projects/:projectId/changes/by-request/:requestId",
    (req, res) => {
      store.project(String(req.params.projectId));
      const row = store.db
        .prepare("SELECT json FROM changes WHERE project_id=? AND request_id=?")
        .get(String(req.params.projectId), String(req.params.requestId));
      res.json(row ? JSON.parse(row.json as string) : null);
    },
  );
  app.post("/api/batch", (req, res) =>
    res.json(store.apply(req.body, res.locals.actor)),
  );
  app.post("/api/undo", (req, res) => {
    const b = z
      .object({
        projectId: z.string(),
        changeId: z.string(),
        requestId: z.string(),
      })
      .parse(req.body);
    res.json(
      store.undo(b.projectId, b.changeId, b.requestId, res.locals.actor),
    );
  });
  app.get("/api/projects/:projectId/context", (req, res) => {
    const all = store.all(String(req.params.projectId)),
      ids = String(req.query.ids || "").split(",");
    const objects = ids
      .map((id) => all.find((e) => e.id === id))
      .filter(Boolean);
    const summaries = objects.flatMap((e) =>
      e?.data.childCanvasId
        ? [
            {
              canvasId: e.data.childCanvasId,
              objects: all
                .filter(
                  (x) =>
                    x.canvasId === e.data.childCanvasId &&
                    !x.deleted &&
                    x.kind !== "placement",
                )
                .map((x) => ({
                  id: x.id,
                  kind: x.kind,
                  title: x.data.title,
                  version: x.version,
                })),
            },
          ]
        : [],
    );
    res.json({ objects, childCanvasSummaries: summaries });
  });
  function imageMime(buffer: Buffer) {
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return "image/png";
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
      return "image/jpeg";
    if (buffer.subarray(0, 6).toString().startsWith("GIF8")) return "image/gif";
    if (
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
    )
      return "image/webp";
    throw new AppError(400, "支持 PNG、JPEG、WebP、GIF 图片");
  }
  app.post("/api/assets", (req, res) => {
    const b = z
      .object({
        projectId: z.string(),
        name: z.string().max(200),
        base64: z.string().optional(),
        workspacePath: z.string().optional(),
      })
      .parse(req.body);
    store.project(b.projectId);
    let buffer: Buffer;
    if (b.workspacePath) {
      const root = realpathSync(workspace),
        file = realpathSync(path.resolve(workspace, b.workspacePath));
      if (
        !file.startsWith(root + path.sep) ||
        file.startsWith(realpathSync(dataDir) + path.sep)
      )
        throw new AppError(403, "只允许导入工作区中的图片");
      if (statSync(file).size > 6 * 1024 * 1024)
        throw new AppError(413, "单张图片上限为 6 MB");
      buffer = readFileSync(file);
    } else if (b.base64) buffer = Buffer.from(b.base64, "base64");
    else throw new AppError(400, "缺少图片内容");
    if (buffer.length > 6 * 1024 * 1024)
      throw new AppError(413, "单张图片上限为 6 MB");
    const mime = imageMime(buffer),
      id = randomUUID(),
      filename =
        id +
        "." +
        {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/gif": "gif",
          "image/webp": "webp",
        }[mime];
    writeFileSync(path.join(dataDir, "assets", filename), buffer);
    store.apply(
      {
        projectId: b.projectId,
        requestId: randomUUID(),
        summary: "导入图片资产",
        operations: [
          createOp(
            "asset",
            null,
            {
              title: b.name,
              name: b.name,
              file: filename,
              mime,
              size: buffer.length,
            },
            id,
          ),
        ],
      },
      res.locals.actor,
    );
    res.json(store.get(b.projectId, id));
  });
  app.get("/api/projects/:projectId/assets/:id", (req, res) => {
    const e = store.get(String(req.params.projectId), String(req.params.id));
    if (e.kind !== "asset" || e.deleted)
      throw new AppError(404, "图片资产不存在");
    const file = path.join(dataDir, "assets", e.data.file);
    if (!existsSync(file))
      throw new AppError(404, "图片文件缺失，可重新上传关联");
    res.json({
      id: e.id,
      mime: e.data.mime,
      name: e.data.name,
      base64: readFileSync(file).toString("base64"),
    });
  });
  app.get("/assets-file/:projectId/:id", (req, res) => {
    const e = store.get(String(req.params.projectId), String(req.params.id));
    if (e.kind !== "asset" || e.deleted)
      throw new AppError(404, "图片资产不存在");
    res
      .type(e.data.mime)
      .sendFile(path.resolve(dataDir, "assets", e.data.file), {
        dotfiles: "allow",
      });
  });
  if (options.distDir) {
    app.use(express.static(options.distDir));
    app.get(["/", "/embed"], (_req, res) =>
      res.sendFile(path.join(options.distDir!, "index.html")),
    );
  }
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(
          error instanceof AppError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : error.status || 500,
        )
        .json({
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("；")
              : error.message || "服务错误",
          code: error.code || "SERVER_ERROR",
        });
    },
  );
  return {
    app,
    store,
    close() {
      for (const c of clients) c.res.end();
      store.close();
    },
  };
}
