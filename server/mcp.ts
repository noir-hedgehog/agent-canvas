import {readUsageGuide,usageGuideTopics} from "../shared/usageGuide";
import {createSection,moveSection} from "../shared/sections";
import { markdownGuide } from "../shared/markdownGuide.ts";
import { batchSchema } from "../shared/schema.ts";
import { diagramOperations } from "../shared/diagram.ts";
import { conversionOperations } from "../shared/conversion.ts";
import { archiveOperations, isArchived, isCard, matchesArchive } from '../shared/archive.ts';
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  createOp,
  placementOp,
  updateOp,
  linkTo,
  type Entity,
  type Snapshot,
  type Operation,
} from "../shared/model.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir =
  process.env.AGENTCANVAS_DATA_DIR || path.join(root, ".agentcanvas");
const base = process.env.AGENTCANVAS_URL || "http://127.0.0.1:4317";
if (new URL(base).hostname !== "127.0.0.1")
  throw new Error("AgentCanvas local adapter requires 127.0.0.1");
let accessCode = process.env.AGENTCANVAS_ACCESS_CODE;
async function call(endpoint: string, body?: unknown, credential = accessCode) {
  let token: string;
  try {
    token = credential ?? readFileSync(path.join(dataDir, "token"), "utf8").trim();
  } catch {
    throw new Error("请先启动 AgentCanvas 本地服务。");
  }
  const r = await fetch(base + endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(`${result.code || r.status}: ${result.error}`);
  return result;
}
const projectSchema = z.object({ projectId: z.string() });
const snapshot = (id: string): Promise<Snapshot> =>
  call(`/api/projects/${encodeURIComponent(id)}`);
const entity = (p: string, id: string): Promise<Entity> =>
  call(
    `/api/projects/${encodeURIComponent(p)}/entities/${encodeURIComponent(id)}`,
  );
const resultLinks = (change: any) => ({
  ...change,
  entries: change.entries.map((x: any) => ({
    id: x.after.id,
    kind: x.after.kind,
    version: x.after.version,
    deleted: x.after.deleted,
    archived: isArchived(x.after),
    canvasId: x.after.canvasId,
    link: x.after.canvasId
      ? base + linkTo(change.projectId, x.after.canvasId, x.after.id)
      : undefined,
  })),
});
const commit = async (
  projectId: string,
  operations: Operation[],
  summary: string,
  requestId = randomUUID(),
) =>
  resultLinks(
    await call("/api/batch", { projectId, operations, summary, requestId }),
  );
function makeServer() {
  const server = new McpServer(
    { name: "agentcanvas", version: "0.1.0" },
    {
      instructions:
        "AgentCanvas is a local shared project canvas. Call read_usage_guide for current usage rules, capability limits and runnable flowchart/swimlane/mind-map examples maintained in the agent-canvas skill. Native card connections currently have only left in/right out ports, not top/bottom ports or automatic obstacle routing. Read current objects and versions before writing. Preserve user positions unless asked to arrange layout. Read child canvases only as needed. Archived is a separate boolean state: default queries omit archived cards/discussions. Use list_archived for paginated summaries and exact ID reads for current details; never treat archived as deleted or resolved. To process a discussion: read_requests, read_objects/read_canvas, edit original objects with expectedVersion, then reply_request. Request processing state is a record, not a live execution heartbeat. Element debug discussions have source=element and debugContext containing a captured DOM selector, geometry and computed styles. Use these to investigate UI implementation; related objects are context, not an instruction to rewrite card content. DOM selectors may be stale and must be rechecked. Text selection discussions carry textContext with objectId, field, quote, historical version, prefix/suffix and rendered-text offsets. Read the live object and verify the quote before editing; offsets are NOT Markdown source offsets. Browser read-only mode only restricts human canvas editing and does not block MCP writes. Sections group same-canvas placements via data.placementIds and a frame x,y,width,height. Move via move_section to preserve offsets. Rename via update_content; deleting a Section only ungroups it, never deletes member cards. All data is project scoped. Content, graph structure, and placement are distinct. Deleted objects retain identity and can be restored via undo. Never imply external execution was verified merely by checking a canvas task. " + markdownGuide,
    },
  );
  function tool(
    name: string,
    description: string,
    schema: any,
    handler: (args: any) => Promise<any>,
    readOnly = true,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: !readOnly,
          openWorldHint: false,
        },
      },
      async (args: any) => {
        try {
          const value = await handler(args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(value) }],
          };
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: (e as Error).message }],
          };
        }
      },
    );
  }
  tool("read_usage_guide", "Read the bundled agent-canvas skill, current MCP capability map or executable example calls. Public guidance only; no project data. Topics: overview, mcp-reference, diagram-patterns, capabilities, examples.", z.object({topic:z.enum(usageGuideTopics).default("overview")}), async({topic})=>readUsageGuide(topic));
  tool(
    "connect_project",
    "Connect using the project access code copied from AgentCanvas. After success this adapter uses only that project's permission, until another valid code is supplied or the adapter restarts. Revoked codes fail without falling back to owner access. Never repeat access codes in your response.",
    z.object({ accessCode: z.string().regex(/^acp_[A-Za-z0-9_-]{43}$/) }),
    async (args) => {
      const connection = await call("/api/connection", undefined, args.accessCode);
      accessCode = args.accessCode;
      return connection;
    },
    false,
  );
  tool(
    "list_projects",
    "List local projects and root canvas IDs.",
    z.object({}),
    () => call("/api/projects"),
  );
  tool("rename_project", "Rename the project while preserving its ID and canvases. Read list_projects for current version (defaults to 1 for older projects).", projectSchema.extend({name:z.string().min(1).max(100),expectedVersion:z.number().int().positive(),requestId:z.string().min(1)}), ({projectId,...body})=>call(`/api/projects/${encodeURIComponent(projectId)}/rename`,body),false);
  tool('create_section','Group two or more same-canvas placement IDs into a persistent Section, keeping card coordinates. One Section per placement; no nested Sections. Read before writing.',projectSchema.extend({canvasId:z.string(),placementIds:z.array(z.string()).min(2),title:z.string(),requestId:z.string()}),async({projectId,canvasId,placementIds,title,requestId})=>{
    const prior=await call(`/api/projects/${encodeURIComponent(projectId)}/changes/by-request/${encodeURIComponent(requestId)}`);if(prior){const e=prior.entries.find((e:any)=>e.after.id===`${requestId}:section`)?.after;if(!e||e.canvasId!==canvasId||e.data.title!==(title.trim()||'Section')||JSON.stringify(e.data.placementIds)!==JSON.stringify([...new Set(placementIds)]))throw new Error('requestId already used with different arguments');return prior;}
    const snapshot=await call(`/api/projects/${encodeURIComponent(projectId)}`);
    return commit(projectId,[createSection(snapshot.entities,canvasId,placementIds,title,`${requestId}:section`)],'Agent 创建 Section',requestId);
  },false);
  tool('move_section','Move a Section and all member placements atomically, retaining relative coordinates. Read current Section version first. Browser read-only does not block this tool.',projectSchema.extend({id:z.string(),expectedVersion:z.number().int().positive(),x:z.number(),y:z.number(),requestId:z.string()}),async({projectId,id,expectedVersion,x,y,requestId})=>{
    const prior=await call(`/api/projects/${encodeURIComponent(projectId)}/changes/by-request/${encodeURIComponent(requestId)}`);if(prior){const e=prior.entries.find((e:any)=>e.after.id===id);if(!e||e.before?.version!==expectedVersion||e.after.data.x!==x||e.after.data.y!==y)throw new Error('requestId already used with different arguments');return prior;}
    const snapshot=await call(`/api/projects/${encodeURIComponent(projectId)}`),section=snapshot.entities.find((e:any)=>e.id===id&&!e.deleted&&e.kind==='section');
    if(!section||section.version!==expectedVersion)throw new Error('Section version changed; read again');
    const ops=moveSection(section,snapshot.entities,x,y);
    if(!ops.length)return {unchanged:true,id,version:section.version};
    return commit(projectId,ops,'Agent 移动 Section',requestId);
  },false);
  tool(
    "read_canvas",
    "Read one canvas, direct objects and child summaries, without expanding descendants. archive defaults to active; use archived or all to read archived cards and their placements/connections dynamically. Exact read_objects always includes archived objects. Use cursor to page.",
    projectSchema.extend({
      canvasId: z.string().optional(),
      archive: z.enum(['active', 'archived', 'all']).default('active'),
      cursor: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    async ({ projectId, canvasId, cursor, limit, archive }) => {
      const s = await snapshot(projectId);
      const id = canvasId || s.project.rootCanvasId;
      const canvas = s.entities.find(
        (e) => e.id === id && e.kind === "canvas" && !e.deleted,
      );
      if (!canvas) throw new Error("Canvas not found");
      const all = s.entities.filter((e) => e.canvasId === id && !e.deleted && matchesArchive(e, s.entities, archive));
      const page = all.slice(cursor, cursor + limit);
      const referenceIds = page
        .filter((e) => e.kind === "placement")
        .map((e) => e.data.objectId);
      return {
        project: s.project,
        canvas,
        objects: page,
        references: s.entities.filter(
          (e) => referenceIds.includes(e.id) && e.canvasId !== id,
        ),
        childCanvases: s.entities
          .filter(
            (e) =>
              e.kind === "canvas" &&
              !e.deleted &&
              all.some((p) => p.id === e.data.ownerNodeId),
          )
          .map((e) => ({
            id: e.id,
            title: e.data.title,
            ownerNodeId: e.data.ownerNodeId,
          })),
        nextCursor: cursor + limit < all.length ? cursor + limit : null,
        link: base + linkTo(projectId, id),
      };
    },
  );
  tool(
    "read_objects",
    "Read exact objects including versions and direct child canvas summaries. Include a discussion request ID to inspect its saved target snapshots.",
    projectSchema.extend({ ids: z.array(z.string()).min(1).max(50) }),
    ({ projectId, ids }) =>
      call(
        `/api/projects/${encodeURIComponent(projectId)}/context?ids=${ids.map(encodeURIComponent).join(",")}`,
      ),
  );
  tool(
    "read_requests",
    "Read active discussion queue, or filter archive=archived/all. Exact requestId reads include archived requests regardless of archive filter. Targets contain historical versions; read live objects before editing. Archiving is independent of resolution and processing state.",
    projectSchema.extend({
      requestId: z.string().optional(),
      state: z.enum(["pending", "processing", "replied", "failed"]).optional(),
      archive: z.enum(['active', 'archived', 'all']).default('active'),
    }),
    async ({ projectId, requestId, state, archive }) => {
      const s = await snapshot(projectId);
      return s.entities.filter(
        (e) =>
          e.kind === "request" &&
          !e.deleted &&
          (!requestId || e.id === requestId) &&
          (requestId || matchesArchive(e, s.entities, archive)) &&
          (!state || e.data.state === state),
      );
    },
  );
  tool('list_archived', 'Read archived card/discussion summaries on demand, without loading full bodies or child canvases. Use read_objects/read_requests and read_canvas for details. Cards are shared objects: archiving affects all their placements; layouts and descendants remain intact.', projectSchema.extend({canvasId:z.string().optional(),type:z.enum(['cards','discussions','all']).default('all'),cursor:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(50)}), async ({projectId,canvasId,type,cursor,limit}) => {
    const s=await snapshot(projectId);
    const all=s.entities.filter(e=>!e.deleted&&isArchived(e)&&(type!=='discussions'&&isCard(e)||type!=='cards'&&e.kind==='request')&&(!canvasId||e.canvasId===canvasId||s.entities.some(p=>!p.deleted&&p.kind==='placement'&&p.canvasId===canvasId&&p.data.objectId===e.id)));
    return {total:all.length,items:all.slice(cursor,cursor+limit).map(e=>({id:e.id,kind:e.kind,version:e.version,archived:true,canvasId:e.canvasId,title:e.data.title,instruction:e.kind==='request'?e.data.instruction.slice(0,160):undefined,state:e.data.state,childCanvasId:e.data.childCanvasId,link:base+linkTo(projectId,e.canvasId||s.project.rootCanvasId,e.id)})),nextCursor:cursor+limit<all.length?cursor+limit:null};
  });
  tool('set_archived', 'Archive or restore a card or discussion using the latest version. Discussion and annotation update atomically. This preserves content, layout, children and processing/resolution state. Shared cards affect all placements. Retries must reuse requestId.', projectSchema.extend({id:z.string(),expectedVersion:z.number().int().positive(),archived:z.boolean(),requestId:z.string().min(1)}), async ({projectId,id,expectedVersion,archived,requestId})=>{
    const prior=await call(`/api/projects/${encodeURIComponent(projectId)}/changes/by-request/${encodeURIComponent(requestId)}`);
    if(prior) {
      const target=prior.entries.find((e:any)=>e.after.id===id);
      if(target?.before?.version!==expectedVersion || target.after.data.archived!==archived || prior.summary!==(archived?'Agent 归档':'Agent 恢复归档')) throw new Error('请求 ID 已用于不同内容');
      return resultLinks(prior);
    }
    const s=await snapshot(projectId), ops=archiveOperations(s.entities,[id],archived);
    const target=ops.find(op=>op.id===id)!;
    if(target.op==='update')target.expectedVersion=expectedVersion;
    return commit(projectId,ops,archived?'Agent 归档':'Agent 恢复归档',requestId);
  },false);
  tool(
    "create_diagram_card",
    "Create a mind-map or flowchart card, its owned child canvas and editable starter nodes atomically. The outer card can be related to any other card. Read childCanvasId for detailed editing. Retries use the same requestId.",
    projectSchema.extend({ canvasId: z.string(), diagramType: z.enum(["mind", "flow"]), title: z.string(),
      x: z.number().default(100), y: z.number().default(100), requestId: z.string() }),
    ({ projectId, canvasId, diagramType, title, x, y, requestId }) => commit(projectId,
      diagramOperations(canvasId, diagramType, `${requestId}:diagram`, title, x, y), "Agent 创建图卡片", requestId),
    false,
  );
  tool(
    "create_relation",
    "Relate two existing card placements on the same canvas. Relations do not change hierarchy, ownership or layout. sourcePlacementId and targetPlacementId are placement IDs, including local task-reference instances. direction none is undirected; forward adds an arrow. Edit label/direction with update_content, remove with apply_changes.",
    projectSchema.extend({ canvasId: z.string(), sourcePlacementId: z.string(), targetPlacementId: z.string(),
      label: z.string().max(200).default(""), direction: z.enum(["none", "forward"]).default("none"), lineStyle: z.enum(["association", "arrow", "containment"]).optional(), requestId: z.string() }),
    ({ projectId, canvasId, sourcePlacementId, targetPlacementId, label, direction, lineStyle, requestId }) => commit(projectId,
      [createOp("relation", canvasId, { sourcePlacementId, targetPlacementId, label, direction: lineStyle ? (lineStyle === "association" ? "none" : "forward") : direction, ...(lineStyle ? {lineStyle} : {}) }, `${requestId}:relation`)], "Agent 关联卡片", requestId),
    false,
  );
  tool(
    "create_content",
    'Create content and its placement. For tasks use data.items=[{id,title,description,status:"todo"|"doing"|"done"}]. For mind/flow, creates a graph if graphId omitted; flow data.shape="process"|"decision"|"terminal". Every graph node can later own a child canvas. Images are content on any card: data.imageIds contains asset IDs from import_image. Text/note use title,body; notes support color yellow/pink/blue/green/purple. ' + markdownGuide,
    projectSchema.extend({
      canvasId: z.string(),
      kind: z.enum([
        "card",
        "note",
        "text",
        "tasks",
        "mind",
        "flow",

      ]),
      data: z.record(z.string(), z.any()),
      x: z.number().default(100),
      y: z.number().default(100),
      width: z.number().default(260),
      height: z.number().default(180),
      requestId: z.string(),
    }),
    async ({
      projectId,
      canvasId,
      kind,
      data,
      x,
      y,
      width,
      height,
      requestId,
    }) => {
      // Stable IDs derived from request ID make high-level operations safely retryable.
      const id = `${requestId}:content`,
        ops: Operation[] = [];
      if (["mind", "flow"].includes(kind)) {
        if (!data.graphId) {
          data = { ...data, graphId: `${requestId}:graph` };
          ops.push(
            createOp(
              "graph",
              canvasId,
              { title: data.title || "图", graphType: kind },
              data.graphId,
            ),
          );
        }
        if (kind === "mind") data = { parentId: null, ...data };
        else data = { shape: "process", ...data };
      }
      data = {
        title: "未命名",
        ...(kind === "tasks" ? { items: [] } : { body: "" }),
        ...data,
      };
      ops.push(
        createOp(kind, canvasId, data, id),
        createOp(
          "placement",
          canvasId,
          { objectId: id, x, y, width, height, view: "list" },
          `${requestId}:placement`,
        ),
      );
      return commit(projectId, ops, "Agent 创建内容", requestId);
    },
    false,
  );
  tool(
    "convert_card",
    "Convert an existing card in place, preserving its ID, text, placements, relations and owned canvas. target space creates an empty child canvas if needed; mind/flow creates an editable diagram. Images are card content: attach imported assets via data.imageIds. Read the current version before editing. Shared task collections cannot convert while referenced on other canvases.",
    projectSchema.extend({ id: z.string(), expectedVersion: z.number().int().positive(), target: z.enum(["card", "space", "note", "text", "tasks", "mind", "flow"]), assetId: z.string().optional(), requestId: z.string() }),
    async ({projectId, id, expectedVersion, target, assetId, requestId}) => {
      const prior = await call(`/api/projects/${encodeURIComponent(projectId)}/changes/by-request/${encodeURIComponent(requestId)}`);
      const current = prior?.entries.find((entry: any) => entry.before?.id === id)?.before || await entity(projectId, id);
      return commit(projectId, conversionOperations({...current, version:expectedVersion}, target, requestId, assetId ? {assetId} : {}), "Agent 转换卡片", requestId);
    },
    false,
  );
  tool(
    "update_content",
    "Patch content data of an existing object using its current expectedVersion. Does not modify placements. Also supports request state updates. Read before editing. " + markdownGuide,
    projectSchema.extend({
      id: z.string(),
      expectedVersion: z.number().int(),
      patch: z.record(z.string(), z.any()),
      summary: z.string(),
      requestId: z.string(),
    }),
    ({ projectId, id, expectedVersion, patch, summary, requestId }) =>
      commit(
        projectId,
        [{ op: "update", id, expectedVersion, patch }],
        summary,
        requestId,
      ),
    false,
  );
  tool(
    "set_layout",
    "Change only a placement position/size/view. Use a placement ID and its version from read_canvas. Do not move content unless the user asks.",
    projectSchema.extend({
      placementId: z.string(),
      expectedVersion: z.number().int(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      view: z.enum(["list", "board"]).optional(),
      requestId: z.string(),
    }),
    ({ projectId, placementId, expectedVersion, requestId, ...patch }) =>
      commit(
        projectId,
        [{ op: "update", id: placementId, expectedVersion, patch }],
        "Agent 调整布局",
        requestId,
      ),
    false,
  );
  tool(
    "create_child_canvas",
    "Open an existing child canvas of a diagram card or a mind/flow node; atomically create one for a mind/flow node if absent. Read the owner version first.",
    projectSchema.extend({
      nodeId: z.string(),
      expectedVersion: z.number().int(),
      requestId: z.string(),
    }),
    async ({ projectId, nodeId, expectedVersion, requestId }) => {
      const node = await entity(projectId, nodeId);
      if (!["card", "space", "note", "text", "tasks", "image", "status", "mind", "flow", "diagram"].includes(node.kind) || node.deleted)
        throw new Error("Requires an active card");
      if (node.data.childCanvasId)
        return {
          canvasId: node.data.childCanvasId,
          link: base + linkTo(projectId, node.data.childCanvasId),
        };
      const id = `${requestId}:canvas`;
      const change = await commit(
        projectId,
        [
          createOp(
            "canvas",
            null,
            { title: node.data.title, ownerNodeId: node.id },
            id,
          ),
          {
            op: "update",
            id: nodeId,
            expectedVersion,
            patch: { childCanvasId: id },
          },
        ],
        "Agent 展开子画布",
        requestId,
      );
      return { canvasId: id, change, link: base + linkTo(projectId, id) };
    },
    false,
  );
  tool(
    "apply_changes",
    "Atomic advanced batch for graph edges, task references, content, annotations, placements, deletion and restoration. Each ID may appear once. update/delete/restore require expectedVersion. create requires kind,canvasId,data. Mind node data={title,graphId,parentId,childCanvasId?}; flow={title,graphId,shape}; edge={graphId,source,target,label}; placement={objectId,x,y,width,height,view?}. To create a child canvas include both canvas(ownerNodeId) and owner update(childCanvasId) in one batch. Ownership deletion cascades; references survive. Retry identical requests with the same requestId.",
    batchSchema,
    async (b) => resultLinks(await call("/api/batch", b)),
    false,
  );
  tool(
    "reply_request",
    "Reply to a discussion after editing. Request state becomes replied or failed; annotation resolved state is unchanged. Include current request version to avoid overwriting another reply.",
    projectSchema.extend({
      requestId: z.string(),
      expectedVersion: z.number().int(),
      body: z.string().min(1),
      state: z.enum(["replied", "failed"]).default("replied"),
      operationId: z.string(),
    }),
    async ({
      projectId,
      requestId,
      expectedVersion,
      body,
      state,
      operationId,
    }) => {
      const prior = await call(
        `/api/projects/${encodeURIComponent(projectId)}/changes/by-request/${encodeURIComponent(operationId)}`,
      );
      if (prior) {
        const x = prior.entries.find((x: any) => x.after.id === requestId);
        if (
          !x ||
          x.before?.version !== expectedVersion ||
          x.after.data.state !== state ||
          x.after.data.replies?.at(-1)?.body !== body
        )
          throw new Error(
            "IDEMPOTENCY_CONFLICT: operationId has different content",
          );
        return resultLinks(prior);
      }
      const request = await entity(projectId, requestId);
      if (request.kind !== "request")
        throw new Error("Not a discussion request");
      return commit(
        projectId,
        [
          {
            op: "update",
            id: request.id,
            expectedVersion,
            patch: {
              state,
              replies: [
                ...(request.data.replies || []),
                { body, actor: "agent", operationId },
              ],
            },
          },
        ],
        "Agent 回复批注",
        operationId,
      );
    },
    false,
  );
  tool(
    "import_image",
    "Import a real image from a path within the AgentCanvas workspace. Copies the asset into managed storage. Attach the returned asset ID to a card data.imageIds array using update_content, or create_content with kind card and imageIds.",
    projectSchema.extend({ workspacePath: z.string(), name: z.string() }),
    (args) => call("/api/assets", args),
    false,
  );
  tool('reference_file', 'Register a file link without copying the original. Supports workspace-relative paths for images, videos and Markdown, or HTTP(S) direct file links. Attach returned id to card data.fileReferenceIds. Files outside the workspace must first be registered by the user in the canvas. Retry with the same requestId.', projectSchema.extend({source:z.string(),requestId:z.string().uuid()}), ({projectId,...args})=>call(`/api/projects/${encodeURIComponent(projectId)}/files`,args), false);
  server.registerTool('read_file_reference', {
    description:'Read a registered file by reference ID or card ID (first fileReferenceIds entry). Returns metadata and Markdown text or actual local image. Video returns metadata; use read_image on discussion mediaContext.screenshotAssetId for captured frames. Does not fetch remote URLs.',
    inputSchema:projectSchema.extend({id:z.string()}), annotations:{readOnlyHint:true,openWorldHint:false},
  }, async ({projectId,id})=>{
    try {
      let refId=id;
      try {const e=await entity(projectId,id);refId=e.data.fileReferenceIds?.[0]||id;}catch{}
      const r=await call(`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(refId)}/read`);
      return {content:[{type:'text' as const,text:JSON.stringify({reference:r.reference,text:r.text})},...(r.base64?[{type:'image' as const,data:r.base64,mimeType:r.reference.mime}]:[])]};
    }catch(e){return {isError:true,content:[{type:'text' as const,text:(e as Error).message}]};}
  });
  server.registerTool(
    "read_image",
    {
      description:
        "Read an image asset as actual image content. Accepts an asset ID or card ID. A card returns its first image; read other images by their IDs in data.imageIds.",
      inputSchema: projectSchema.extend({ id: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, id }) => {
      try {
        const e = await entity(projectId, id),
          assetId = e.kind === "asset" ? e.id : e.data.mediaContext?.screenshotAssetId || e.data.assetId || e.data.imageIds?.[0];
        if (!assetId) throw new Error("这张卡片尚未添加图片");
        const result = await call(
          `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                id: result.id,
                name: result.name,
                mime: result.mime,
              }),
            },
            {
              type: "image" as const,
              data: result.base64,
              mimeType: result.mime,
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: (e as Error).message }],
        };
      }
    },
  );
  tool(
    "read_changes",
    "Read the latest 50 change batches, including actor and before/after evidence.",
    projectSchema,
    ({ projectId }) =>
      call(`/api/projects/${encodeURIComponent(projectId)}/changes`),
  );
  tool(
    "undo_change",
    "Undo a complete change batch without overwriting newer edits. Fails with VERSION_CONFLICT if affected objects changed after that batch. Undoing the resulting batch performs redo.",
    projectSchema.extend({ changeId: z.string(), requestId: z.string() }),
    (args) => call("/api/undo", args),
    false,
  );
  return server;
}
serveStdio(makeServer, { onerror: (e) => console.error(e.message) });
