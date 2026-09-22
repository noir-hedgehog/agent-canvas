import {validateConnectionPorts} from "../shared/connectionPorts";
import {validateSections} from "../shared/sections";
import { batchSchema } from "../shared/schema.ts";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Entity,
  type Project,
  type Change,
  type Batch,
  type Operation,
  cardKinds,
  convertibleKinds,
  cardBackgrounds,
} from "../shared/model.ts";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "INVALID_OPERATION",
  ) {
    super(message);
  }
}
const fail = (message: string) => {
  throw new AppError(400, message);
};
export class Store {
  db: DatabaseSync;
  onChange: ((projectId: string, changeId: string) => void) | undefined;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS entity_project ON entities(project_id);
      CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,json TEXT NOT NULL,UNIQUE(project_id,request_id));
      CREATE TABLE IF NOT EXISTS project_requests(project_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(project_id,request_id));
      CREATE TABLE IF NOT EXISTS file_references(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,json TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  projects(): Project[] {
    return this.db
      .prepare("SELECT json FROM projects ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(r.json as string));
  }
  project(id: string): Project {
    const r = this.db.prepare("SELECT json FROM projects WHERE id=?").get(id);
    if (!r) throw new AppError(404, "项目不存在", "NOT_FOUND");
    return JSON.parse(r.json as string);
  }
  all(projectId: string): Entity[] {
    this.project(projectId);
    return this.db
      .prepare("SELECT json FROM entities WHERE project_id=? ORDER BY rowid")
      .all(projectId)
      .map((r) => JSON.parse(r.json as string));
  }
  get(projectId: string, id: string): Entity {
    const r = this.db
      .prepare("SELECT json FROM entities WHERE project_id=? AND id=?")
      .get(projectId, id);
    if (!r) throw new AppError(404, "对象不存在", "NOT_FOUND");
    return JSON.parse(r.json as string);
  }
  changes(projectId: string, limit = 50): Change[] {
    return this.db
      .prepare(
        "SELECT json FROM changes WHERE project_id=? ORDER BY rowid DESC LIMIT ?",
      )
      .all(projectId, limit)
      .map((r) => JSON.parse(r.json as string));
  }
  snapshot(projectId: string) {
    return {
      project: this.project(projectId),
      entities: this.all(projectId),
      changes: this.changes(projectId),
    };
  }
  put(e: Entity) {
    this.db
      .prepare(
        "INSERT INTO entities(id,project_id,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
      )
      .run(e.id, e.projectId, JSON.stringify(e));
  }
  renameProject(id:string,name:string,expectedVersion:number,requestId:string):Project {
    if(!name.trim() || name.trim().length>100) fail("项目名称需为 1–100 字符");
    const fingerprint=JSON.stringify({name:name.trim(),expectedVersion});
    this.db.exec("BEGIN IMMEDIATE");
    let project:Project;
    try {
      const prior=this.db.prepare("SELECT fingerprint,json FROM project_requests WHERE project_id=? AND request_id=?").get(id,requestId);
      if(prior){if(prior.fingerprint!==fingerprint)throw new AppError(409,"请求 ID 已用于不同内容");this.db.exec("COMMIT");return JSON.parse(prior.json as string);}
      const previous=this.project(id);
      if((previous.version||1)!==expectedVersion)throw new AppError(409,"项目名称已更新，请重新读取后修改");
      project={...previous,name:name.trim(),version:expectedVersion+1};
      this.db.prepare("UPDATE projects SET json=? WHERE id=?").run(JSON.stringify(project),id);
      this.db.prepare("INSERT INTO project_requests VALUES(?,?,?,?)").run(id,requestId,fingerprint,JSON.stringify(project));
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    this.onChange?.(id,"project-renamed");return project;
  }
  newProject(name: string, example = false): Project {
    if (!name.trim() || name.length > 100) fail("项目名称需为 1–100 字符");
    const project = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      name: name.trim(),
      rootCanvasId: randomUUID(),
      example,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO projects VALUES(?,?)")
        .run(project.id, JSON.stringify(project));
      this.put({
        id: project.rootCanvasId,
        projectId: project.id,
        kind: "canvas",
        canvasId: null,
        data: { title: "项目全景", ownerNodeId: null },
        version: 1,
        deleted: false,
      });
      this.db.exec("COMMIT");
      return project;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  apply(input: Batch, actor = "human"): Change {
    const batch = batchSchema.parse(input);
    this.project(batch.projectId);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(batch))
      .digest("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db
        .prepare(
          "SELECT json,fingerprint FROM changes WHERE project_id=? AND request_id=?",
        )
        .get(batch.projectId, batch.requestId);
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new AppError(
            409,
            "请求 ID 已用于不同内容",
            "IDEMPOTENCY_CONFLICT",
          );
        this.db.exec("COMMIT");
        return JSON.parse(prior.json as string);
      }
      const old = new Map(this.all(batch.projectId).map((e) => [e.id, e]));
      const next = new Map(structuredClone([...old]));
      const touched = new Set<string>();
      for (const op of batch.operations) {
        if (touched.has(op.id)) fail("一个批次内每个对象只能修改一次");
        if (op.op === "create") {
          if (this.db.prepare("SELECT id FROM entities WHERE id=?").get(op.id))
            throw new AppError(409, "对象 ID 已存在", "ID_CONFLICT");
          next.set(op.id, {
            id: op.id,
            projectId: batch.projectId,
            kind: op.kind,
            canvasId: op.canvasId,
            data: op.data,
            version: 1,
            deleted: false,
          });
        } else {
          const e = next.get(op.id);
          if (!e) throw new AppError(404, "对象不存在", "NOT_FOUND");
          if (e.version !== op.expectedVersion)
            throw new AppError(
              409,
              `「${e.data.title || e.kind}」已有新修改，请读取最新版本。`,
              "VERSION_CONFLICT",
            );
          if ((op.op === "update" || op.op === "convert") && e.deleted)
            throw new AppError(409, "原对象已删除，请先恢复", "OBJECT_DELETED");
          if (
            op.op === "delete" &&
            e.id === this.project(batch.projectId).rootCanvasId
          )
            fail("不能删除项目根画布");
          if (op.op === "convert" && !(convertibleKinds as readonly string[]).includes(e.kind))
            fail("仅普通内容卡片可转换类型，图内节点请通过节点属性编辑");
          if (op.op === "convert" && e.data.childCanvasId && op.patch.childCanvasId !== undefined && op.patch.childCanvasId !== e.data.childCanvasId)
            fail("类型转换必须保留已有内部画布");
          next.set(e.id, {
            ...e,
            kind: op.op === "convert" ? op.kind : e.kind,
            version: e.version + 1,
            data: op.op === "update" || op.op === "convert" ? { ...e.data, ...op.patch } : e.data,
            deleted:
              op.op === "delete"
                ? true
                : op.op === "restore"
                  ? false
                  : e.deleted,
          });
        }
        touched.add(op.id);
      }
      // Ownership cascades only; reference placements and annotations survive as visible broken references.
      let again = true;
      while (again) {
        again = false;
        for (const e of next.values()) {
          if (e.deleted) continue;
          const owner =
            e.kind === "canvas"
              ? e.data.ownerNodeId
              : e.kind === "mind"
                ? e.data.parentId
                : null;
          const goneOwner = owner && next.get(owner)?.deleted;
          const goneCanvas = e.canvasId && next.get(e.canvasId)?.deleted;
          const goneGraph =
            ["mind", "flow", "edge"].includes(e.kind) &&
            next.get(e.data.graphId)?.deleted;
          const goneEdge =
            e.kind === "edge" &&
            (next.get(e.data.source)?.deleted ||
              next.get(e.data.target)?.deleted);
          const goneRelation = e.kind === "relation" &&
            [e.data.sourcePlacementId, e.data.targetPlacementId].some(id => {
              const p = next.get(id);
              return p?.deleted || next.get(p?.data.objectId)?.deleted;
            });
          const source =
            e.kind === "placement" ? next.get(e.data.objectId) : undefined;
          const goneLocalSource =
            source?.deleted && source.canvasId === e.canvasId;
          if (
            goneOwner ||
            goneCanvas ||
            goneGraph ||
            goneEdge ||
            goneRelation ||
            goneLocalSource
          ) {
            if (!touched.has(e.id)) e.version++;
            e.deleted = true;
            touched.add(e.id);
            again = true;
          }
        }
      }
      this.validate(next, batch.projectId);
      const entries = [...touched].map((id) => ({
        before: old.get(id) || null,
        after: next.get(id)!,
      }));
      const change: Change = {
        id: randomUUID(),
        projectId: batch.projectId,
        requestId: batch.requestId,
        actor,
        summary: batch.summary,
        createdAt: new Date().toISOString(),
        entries,
      };
      this.commitChange(change, fingerprint);
      this.db.exec("COMMIT");
      this.onChange?.(batch.projectId, change.id);
      return change;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  validate(map: Map<string, Entity>, projectId: string) {
    const active = [...map.values()].filter((e) => !e.deleted);
    const ref = (id: any, kind?: string) => {
      const e = map.get(id);
      if (
        !e ||
        e.deleted ||
        e.projectId !== projectId ||
        (kind && e.kind !== kind)
      )
        fail(`无效的${kind || "对象"}引用：${String(id)}`);
      return e!;
    };
    try { validateSections([...map.values()]); validateConnectionPorts([...map.values()]); } catch(error) { fail((error as Error).message); }
    for (const e of active) {
      const d = e.data;
      if (e.kind !== "canvas" && e.kind !== "asset" && !e.canvasId)
        fail("内容必须属于画布");
      if (e.canvasId) ref(e.canvasId, "canvas");
      if (
        d.title !== undefined &&
        (typeof d.title !== "string" || d.title.length > 1000)
      )
        fail("标题格式无效");
      if (
        [
          "note",
          "text",
          "mind",
          "flow",
          "tasks",
          "canvas",
          "graph",
          "status",
          "diagram",
          "card",
          "space",
        ].includes(e.kind) &&
        typeof d.title !== "string"
      )
        fail("缺少标题");
      if (d.body !== undefined && typeof d.body !== "string")
        fail("正文必须是文本");
      if (d.background !== undefined && !Object.hasOwn(cardBackgrounds, d.background)) fail("卡片背景颜色无效");
      if (["edge", "relation"].includes(e.kind) && d.lineStyle !== undefined && !["association", "arrow", "containment"].includes(d.lineStyle)) fail("关系线样式无效");
      if ((cardKinds as readonly string[]).includes(e.kind) && d.childCanvasId) {
        const child = ref(d.childCanvasId, "canvas");
        if (child.data.ownerNodeId !== e.id) fail("内部画布所属关系不匹配");
      }
      if (e.kind === "space" && !d.childCanvasId) fail("画布卡片缺少内部画布");
      if (
        e.kind === "note" &&
        d.color !== undefined &&
        !["yellow", "pink", "blue", "green", "purple"].includes(d.color)
      )
        fail("便签颜色无效");
      if (
        e.kind === "status" &&
        ((d.state !== undefined && typeof d.state !== "string") ||
          (d.resultUrl !== undefined && typeof d.resultUrl !== "string"))
      )
        fail("状态卡片格式无效");
      if (e.kind === "placement") {
        // Tombstoned targets remain addressable so references can be repaired or restored.
        if (!map.has(d.objectId)) fail("展示对象不存在");
        for (const k of ["x", "y", "width", "height"])
          if (typeof d[k] !== "number" || !Number.isFinite(d[k]))
            fail("布局数值无效");
        if (d.width < 80 || d.height < 50 || d.width > 5000 || d.height > 5000)
          fail("尺寸超出范围");
        if (d.view !== undefined && !["list", "board"].includes(d.view))
          fail("任务视图无效");
        const obj = map.get(d.objectId)!;
        if (obj.kind !== "tasks" && obj.canvasId !== e.canvasId)
          fail("首版仅支持任务集合跨层展示");
      }
      if (["mind", "flow"].includes(e.kind)) {
        const g = ref(d.graphId, "graph");
        if (g.canvasId !== e.canvasId || g.data.graphType !== e.kind)
          fail("图节点所属图不匹配");
        if (e.kind === "mind" && d.parentId) {
          const p = ref(d.parentId, "mind");
          if (p.data.graphId !== d.graphId) fail("父节点必须属于同一导图");
        }
        if (d.childCanvasId) {
          const c = ref(d.childCanvasId, "canvas");
          if (c.data.ownerNodeId !== e.id) fail("子画布所属关系不匹配");
        }
      }
      if (e.kind === "diagram") {
        if (!["mind", "flow"].includes(d.diagramType)) fail("图卡片类型无效");
        const child = ref(d.childCanvasId, "canvas");
        const graph = ref(d.graphId, "graph");
        if (child.data.ownerNodeId !== e.id || graph.canvasId !== child.id || graph.data.graphType !== d.diagramType)
          fail("图卡片内部画布或图类型不匹配");
      }
      if (e.kind === "relation") {
        const a = ref(d.sourcePlacementId, "placement"), b = ref(d.targetPlacementId, "placement");
        if (a.id === b.id || a.canvasId !== e.canvasId || b.canvasId !== e.canvasId)
          fail("关联需要当前画布中的两张不同卡片");
        for (const p of [a, b])
          if (!(cardKinds as readonly string[]).includes(ref(p.data.objectId).kind)) fail("只能关联内容卡片");
        if (typeof d.label !== "string" || d.label.length > 200 || !["none", "forward"].includes(d.direction))
          fail("关联说明或方向无效");
        if (d.lineStyle !== undefined && !["association", "arrow", "containment"].includes(d.lineStyle)) fail("关系线样式无效");
      }
      if (e.kind === "canvas" && d.ownerNodeId) {
        const owner = ref(d.ownerNodeId);
        if (
          !(cardKinds as readonly string[]).includes(owner.kind) ||
          owner.data.childCanvasId !== e.id
        )
          fail("子画布必须由一个图节点持有");
      }
      if (e.kind === "mind") {
        const seen = new Set([e.id]);
        let id = d.parentId;
        while (id) {
          if (seen.has(id)) fail("思维导图不能形成循环");
          seen.add(id);
          id = ref(id, "mind").data.parentId;
        }
      }
      if (e.kind === "canvas") {
        const seen = new Set([e.id]);
        let owner = d.ownerNodeId;
        while (owner) {
          const node = ref(owner);
          const parent = ref(node.canvasId, "canvas");
          if (seen.has(parent.id)) fail("子画布不能包含自己的祖先");
          seen.add(parent.id);
          owner = parent.data.ownerNodeId;
        }
      }
      if (e.kind === "edge") {
        const g = ref(d.graphId, "graph");
        const a = ref(d.source, "flow"),
          b = ref(d.target, "flow");
        if (
          g.data.graphType !== "flow" ||
          a.data.graphId !== g.id ||
          b.data.graphId !== g.id ||
          e.canvasId !== g.canvasId
        )
          fail("流程连线必须在同一流程图内");
        if (d.label !== undefined && typeof d.label !== "string")
          fail("连线标签必须是文本");
      }
      if (
        e.kind === "flow" &&
        !["process", "decision", "terminal"].includes(d.shape)
      )
        fail("流程节点类型无效");
      if (e.kind === "graph" && !["mind", "flow"].includes(d.graphType))
        fail("图类型无效");
      if (e.kind === "tasks") {
        if (!Array.isArray(d.items)) fail("任务集合缺少 items");
        const ids = new Set();
        for (const t of d.items) {
          if (
            typeof t.id !== "string" ||
            ids.has(t.id) ||
            typeof t.title !== "string" ||
            !["todo", "doing", "done"].includes(t.status) ||
            typeof (t.description ?? "") !== "string"
          )
            fail("任务字段或 ID 无效");
          ids.add(t.id);
        }
      }
      if (e.kind === "image") ref(d.assetId, "asset");
      if (d.assetId && e.kind !== "image") ref(d.assetId, "asset");
      if (d.imageIds !== undefined) {
        if (!Array.isArray(d.imageIds) || d.imageIds.length > 100 || new Set(d.imageIds).size !== d.imageIds.length) fail("图片内容列表无效");
        for (const id of d.imageIds) ref(id, "asset");
      }
      if (d.archived !== undefined && typeof d.archived !== 'boolean') fail('归档状态必须是布尔值');
      if (d.fileReferenceIds !== undefined) {
        if (!Array.isArray(d.fileReferenceIds) || d.fileReferenceIds.length > 100 || new Set(d.fileReferenceIds).size !== d.fileReferenceIds.length) fail('文件引用列表无效');
        for (const id of d.fileReferenceIds) if (typeof id !== 'string' || !this.db.prepare('SELECT id FROM file_references WHERE id=? AND project_id=?').get(id, e.projectId)) fail('文件引用不存在或不属于当前项目');
      }
      if (d.mediaContext !== undefined) {
        const m = d.mediaContext;
        if (!m?.reference || !this.db.prepare('SELECT id FROM file_references WHERE id=? AND project_id=?').get(m.reference.id, e.projectId)) fail('批注文件引用无效');
        if (m.timeSeconds !== undefined && (typeof m.timeSeconds !== 'number' || !Number.isFinite(m.timeSeconds) || m.timeSeconds < 0)) fail('视频时间点无效');
        if (m.screenshotAssetId) ref(m.screenshotAssetId, 'asset');
        if (!Array.isArray(m.marks) || m.marks.length > 100 || m.marks.some((r:any) => !r || ['x','y','width','height'].some(k => typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 1) || r.x + r.width > 1.00001 || r.y + r.height > 1.00001)) fail('截图标记范围无效');
      }
      if (
        e.kind === "asset" &&
        (typeof d.file !== "string" ||
          d.file.includes("/") ||
          d.file.includes("\\") ||
          d.file === ".." ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            d.mime,
          ))
      )
        fail("图片资产无效");
      if (
        e.kind === "annotation" &&
        (!Array.isArray(d.targets) ||
          !["open", "resolved"].includes(d.state) ||
          typeof d.body !== "string")
      )
        fail("批注数据无效");
      if (
        e.kind === "request" &&
        (!["pending", "processing", "replied", "failed"].includes(d.state) ||
          !Array.isArray(d.targets) ||
          typeof d.instruction !== "string")
      )
        fail("讨论请求无效");
      if (e.kind === "request") {
        ref(d.annotationId, "annotation");
        if ((d.archived === true) !== (map.get(d.annotationId)?.data.archived === true)) fail('批注与请求必须同时归档或恢复');
      }
      if (["annotation", "request"].includes(e.kind)) {
        for (const t of d.targets) {
          if (
            !t ||
            typeof t.id !== "string" ||
            !Number.isInteger(t.version) ||
            t.version < 1 ||
            !map.has(t.id) ||
            (t.title !== undefined && typeof t.title !== "string")
          )
            fail("批注目标引用无效");
        }
        if (
          d.replies !== undefined &&
          (!Array.isArray(d.replies) ||
            d.replies.some((r: any) => !r || typeof r.body !== "string"))
        )
          fail("批注回复必须是文本");
      }
    }
  }
  commitChange(change: Change, fingerprint: string) {
    for (const x of change.entries) this.put(x.after);
    this.db
      .prepare("INSERT INTO changes VALUES(?,?,?,?,?)")
      .run(
        change.id,
        change.projectId,
        change.requestId,
        fingerprint,
        JSON.stringify(change),
      );
  }
  undo(
    projectId: string,
    id: string,
    requestId: string,
    actor = "human",
  ): Change {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const fingerprint = `undo:${id}`;
      const prior = this.db
        .prepare(
          "SELECT json,fingerprint FROM changes WHERE project_id=? AND request_id=?",
        )
        .get(projectId, requestId);
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new AppError(409, "请求 ID 冲突");
        this.db.exec("COMMIT");
        return JSON.parse(prior.json as string);
      }
      const row = this.db
        .prepare("SELECT json FROM changes WHERE project_id=? AND id=?")
        .get(projectId, id);
      if (!row) throw new AppError(404, "变更不存在");
      const source: Change = JSON.parse(row.json as string);
      const map = new Map(this.all(projectId).map((e) => [e.id, e]));
      const entries = source.entries.map(({ before, after }) => {
        const current = map.get(after.id)!;
        if (current.version !== after.version)
          throw new AppError(
            409,
            "对象在本次变更后又有修改，无法直接撤销。",
            "VERSION_CONFLICT",
          );
        const result = {
          ...(before || current),
          deleted: before ? before.deleted : true,
          version: current.version + 1,
        };
        map.set(result.id, result);
        return { before: current, after: result };
      });
      this.validate(map, projectId);
      const change: Change = {
        id: randomUUID(),
        projectId,
        requestId,
        actor,
        summary: `撤销：${source.summary}`,
        createdAt: new Date().toISOString(),
        entries,
        undoOf: id,
      };
      this.commitChange(change, fingerprint);
      this.db.exec("COMMIT");
      this.onChange?.(projectId, change.id);
      return change;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
