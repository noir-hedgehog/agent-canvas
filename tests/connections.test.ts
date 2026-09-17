import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createApplication } from "../server/app.ts";

test("project grants persist, enforce HTTP and real MCP scope, support read-only and revoke without fallback", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ac-connections-"));
  const http = createServer();
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as any).port;
  const options = { dataDir: dir, workspace: process.cwd(), port, seed: false };
  let service = createApplication(options);
  http.on("request", service.app);
  const base = `http://127.0.0.1:${port}`;
  const clients: Client[] = [];
  const session = await fetch(base + "/api/session");
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  async function req(route: string, body?: any, code?: string, extra = {}) {
    return fetch(base + route, { method: body ? "POST" : "GET", headers: {
      ...(code ? { Authorization: `Bearer ${code}` } : { Cookie: cookie }),
      "Content-Type": "application/json", ...extra,
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function client(code?: string) {
    const c = new Client({ name: "grant-test", version: "1" }); clients.push(c);
    await c.connect(new StdioClientTransport({ command: process.execPath,
      args: ["--import", path.resolve("node_modules/tsx/dist/loader.mjs"), path.resolve("server/mcp.ts")],
      env: { PATH: process.env.PATH!, AGENTCANVAS_URL: base, AGENTCANVAS_DATA_DIR: dir,
        ...(code ? { AGENTCANVAS_ACCESS_CODE: code } : {}) }, stderr: "pipe" }));
    return c;
  }
  async function invoke(c: Client, name: string, args = {}) {
    const r: any = await c.callTool({ name, arguments: args });
    assert.ok(!r.isError, `${name} should succeed`);
    return JSON.parse(r.content[0].text);
  }
  try {
    assert.equal((await req("/api/projects", { name: " " })).status, 400);
    const p = await (await req("/api/projects", { name: "持久化项目" })).json();
    const other = await (await req("/api/projects", { name: "另一个项目" })).json();
    assert.ok(p.createdAt);
    const endpoint = `/api/projects/${p.id}/connections`;
    const edit = await (await req(endpoint, { name: "编辑助手", permission: "edit" })).json();
    const read = await (await req(endpoint, { name: "观察助手", permission: "read" })).json();
    const renameBody={name:"改名测试",expectedVersion:1,requestId:"rename-access"};
    assert.equal((await req(`/api/projects/${p.id}/rename`,renameBody,read.accessCode)).status,403);
    assert.equal((await req(`/api/projects/${other.id}/rename`,renameBody,edit.accessCode)).status,403);
    const saved = service.store.db.prepare("SELECT * FROM agent_connections").all();
    assert.ok(!JSON.stringify(saved).includes(edit.accessCode));
    assert.ok(!JSON.stringify(await (await req(endpoint)).json()).includes(read.accessCode));
    assert.equal((await req(`/api/projects/${other.id}`, undefined, edit.accessCode)).status, 403);
    assert.equal((await req(`/api/projects/${other.id}/assets/absent`, undefined, edit.accessCode)).status, 403);
    assert.equal((await req(`/assets-file/${other.id}/absent`, undefined, edit.accessCode)).status, 403);
    assert.equal((await req("/api/runtime", undefined, edit.accessCode)).status, 403);
    assert.equal((await req(endpoint, { name: "提权", permission: "edit" }, edit.accessCode)).status, 403);
    assert.equal((await req("/api/batch", { projectId: other.id }, edit.accessCode)).status, 403);
    assert.equal((await req("/api/undo", { projectId: p.id }, read.accessCode)).status, 403);
    assert.equal((await req("/api/assets", { projectId: p.id }, read.accessCode)).status, 403);
    assert.equal((await req("/api/projects", undefined, "invalid", { Cookie: cookie })).status, 401);
    const c = await client();
    assert.ok((await c.listTools()).tools.some(t => t.name === "connect_project"));
    const connected = await invoke(c, "connect_project", { accessCode: edit.accessCode });
    assert.equal(connected.project.id, p.id);
    assert.deepEqual((await invoke(c, "list_projects")).map((x: any) => x.id), [p.id]);
    assert.ok((await c.callTool({ name: "read_canvas", arguments: { projectId: other.id } })).isError);
    await invoke(c, "create_content", { projectId: p.id, canvasId: p.rootCanvasId, kind: "note",
      data: { title: "重启仍在" }, requestId: "persistent-note" });
    const renamed=await invoke(c,"rename_project",{projectId:p.id,name:"持久化改名",expectedVersion:1,requestId:"rename-project"});
    assert.equal(renamed.name,"持久化改名");
    assert.equal((await invoke(c,"rename_project",{projectId:p.id,name:"持久化改名",expectedVersion:1,requestId:"rename-project"})).version,2);
    await invoke(c, "connect_project", { accessCode: read.accessCode });
    assert.ok((await c.callTool({ name: "create_content", arguments: { projectId: p.id, canvasId: p.rootCanvasId,
      kind: "note", data: { title: "不应写入" }, requestId: "denied" } })).isError);
    // Real database and credentials survive recreating the local application.
    http.removeListener("request", service.app); service.close();
    service = createApplication(options); http.on("request", service.app);
    assert.equal(service.store.project(p.id).name,"持久化改名");
    const canvas = await invoke(c, "read_canvas", { projectId: p.id });
    assert.ok(canvas.objects.some((e: any) => e.data.title === "重启仍在"));
    const list = await (await req(endpoint)).json();
    assert.ok(list.find((g: any) => g.id === read.grant.id).lastUsedAt);
    const envClient = await client(edit.accessCode);
    assert.equal((await invoke(envClient, "list_projects")).length, 1);
    assert.equal((await req(`${endpoint}/${edit.grant.id}/revoke`, {})).status, 200);
    assert.ok((await envClient.callTool({ name: "list_projects", arguments: {} })).isError);
    assert.equal((await req(`${endpoint}/${read.grant.id}/revoke`, {})).status, 200);
    assert.ok((await c.callTool({ name: "list_projects", arguments: {} })).isError);
    assert.equal((await req(`/api/projects/${p.id}`, undefined, edit.accessCode)).status, 401);
    assert.ok((await req(`/api/projects/${p.id}`)).ok);
  } finally {
    await Promise.all(clients.map(c => c.close()));
    service.close(); http.closeAllConnections();
    await new Promise<void>(resolve => http.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
