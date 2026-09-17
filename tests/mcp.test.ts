import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createApplication } from "../server/app.ts";
import { createOp, placementOp } from "../shared/model.ts";

test("real STDIO MCP + local HTTP: discover, read, edit, nested canvas, reply, image, SSE and isolation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agentcanvas-mcp-"));
  const http = createServer();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const port = (http.address() as any).port;
  const service = createApplication({
    dataDir: path.join(dir, ".data"),
    workspace: dir,
    port,
    seed: false,
  });
  http.on("request", service.app);
  const base = `http://127.0.0.1:${port}`,
    token = readFileSync(path.join(dir, ".data/token"), "utf8").trim();
  const p = service.store.newProject("协议验收");
  const c = p.rootCanvasId;
  service.store.apply({
    projectId: p.id,
    requestId: "setup",
    summary: "准备协议测试",
    operations: [
      createOp("graph", c, { title: "导图", graphType: "mind" }, "graph"),
      createOp(
        "mind",
        c,
        {
          title: "需要修改的节点",
          body: "原说明",
          graphId: "graph",
          parentId: null,
        },
        "node",
      ),
      placementOp(c, "node", 80, 100),
      createOp(
        "annotation",
        c,
        {
          body: "请补充研究计划",
          targets: [{ id: "node", version: 1 }],
          state: "open",
        },
        "annotation",
      ),
      createOp(
        "request",
        c,
        {
          instruction: "请补充研究计划",
          targets: [{ id: "node", version: 1 }],
          annotationId: "annotation",
          state: "pending",
          replies: [],
        },
        "request",
      ),
    ],
  });
  const client = new Client({
    name: "agentcanvas-protocol-tests",
    version: "1.0.0",
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const invoke = async (name: string, args: Record<string, any>) => {
    const r: any = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, JSON.stringify(r));
    return JSON.parse(r.content[0].text);
  };
  try {
    const denied = await fetch(base + "/api/projects");
    assert.equal(denied.status, 401);
    assert.equal(
      (
        await fetch(base + "/api/session", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    const session = await fetch(base + "/api/session");
    assert.match(session.headers.get("set-cookie") || "", /HttpOnly/);
    assert.match(session.headers.get("set-cookie") || "", /SameSite=Strict/);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          "--import",
          path.resolve("node_modules/tsx/dist/loader.mjs"),
          path.resolve("server/mcp.ts"),
        ],
        env: {
          ...(Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined),
          ) as Record<string, string>),
          AGENTCANVAS_DATA_DIR: path.join(dir, ".data"),
          AGENTCANVAS_URL: base,
        },
        stderr: "pipe",
      }),
    );
    assert.match(client.getInstructions() || "", /GitHub-flavored Markdown/);
    assert.match(client.getInstructions() || "", /Mermaid/);
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "apply_changes"));
    assert.ok(list.tools.some((t) => t.name === "read_image"));
    assert.ok(list.tools.length >= 12);
    for (const name of ['create_content','update_content']) {
      const description=list.tools.find(t=>t.name===name)!.description!;
      assert.match(description,/GitHub-flavored Markdown/);assert.match(description,/Mermaid/);assert.match(description,/inline file preview/);
    }
    const mermaidBody='## 迭代计划\n\n- [ ] 验证\n\n```mermaid\nflowchart LR\n A[想法] --> B[实现]\n```';
    await invoke('create_content',{projectId:p.id,canvasId:c,kind:'note',data:{title:'Mermaid 协议测试',body:mermaidBody,color:'yellow'},requestId:'mermaid-create'});
    assert.equal(service.store.get(p.id,'mermaid-create:content').data.body,mermaidBody);

    assert.ok(list.tools.some(t => t.name === "convert_card"));
    await invoke("create_content", {projectId:p.id,canvasId:c,kind:"card",data:{title:"空白",body:"保留文字"},requestId:"blank-create"});
    const convertArgs = {projectId:p.id,id:"blank-create:content",expectedVersion:1,target:"mind",requestId:"blank-convert"};
    const firstConversion = await invoke("convert_card",convertArgs);
    assert.equal((await invoke("convert_card",convertArgs)).id, firstConversion.id);
    assert.equal(service.store.get(p.id,"blank-create:content").data.body,"保留文字");
    const rejectedConversion:any = await client.callTool({name:"convert_card",arguments:{...convertArgs,target:"flow"}});
    assert.ok(rejectedConversion.isError);
    await invoke("create_relation",{projectId:p.id,canvasId:c,sourcePlacementId:"blank-create:placement",targetPlacementId:service.store.all(p.id).find(e => e.kind === "placement" && e.data.objectId === "node")!.id,lineStyle:"containment",label:"包括",requestId:"typed-relation"});
    assert.equal(service.store.get(p.id,"typed-relation:relation").data.lineStyle,"containment");

    assert.equal((await invoke("list_projects", {}))[0].id, p.id);
    const canvas = await invoke("read_canvas", {
      projectId: p.id,
      canvasId: c,
    });
    assert.equal(canvas.canvas.id, c);
    assert.equal(
      (
        await invoke("read_requests", { projectId: p.id, requestId: "request" })
      )[0].data.instruction,
      "请补充研究计划",
    );
    const events = await fetch(`${base}/api/events?projectId=${p.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    reader = events.body!.getReader();
    await reader.read();
    const changed = await invoke("update_content", {
      projectId: p.id,
      id: "node",
      expectedVersion: 1,
      patch: { body: "已补充访谈研究计划" },
      summary: "补充研究计划",
      requestId: "update-1",
    });
    assert.equal(changed.entries[0].version, 2);
    const notification = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SSE change not received")), 2000),
      ),
    ]);
    assert.match(new TextDecoder().decode(notification.value), /event: change/);
    const repeated = await invoke("update_content", {
      projectId: p.id,
      id: "node",
      expectedVersion: 1,
      patch: { body: "已补充访谈研究计划" },
      summary: "补充研究计划",
      requestId: "update-1",
    });
    assert.equal(repeated.id, changed.id);
    const conflict: any = await client.callTool({
      name: "update_content",
      arguments: {
        projectId: p.id,
        id: "node",
        expectedVersion: 1,
        patch: { body: "旧的" },
        summary: "旧版",
        requestId: "stale",
      },
    });
    assert.equal(conflict.isError, true);
    assert.match(conflict.content[0].text, /VERSION_CONFLICT/);
    const child = await invoke("create_child_canvas", {
      projectId: p.id,
      nodeId: "node",
      expectedVersion: 2,
      requestId: "child-1",
    });
    assert.ok(child.canvasId);
    const content = await invoke("create_content", {
      projectId: p.id,
      canvasId: child.canvasId,
      kind: "note",
      data: { title: "访谈计划", body: "招募三位用户" },
      requestId: "note-1",
    });
    assert.ok(content.entries.some((e: any) => e.kind === "note"));
    const childRead = await invoke("read_canvas", {
      projectId: p.id,
      canvasId: child.canvasId,
    });
    assert.equal(
      childRead.objects.filter((e: any) => e.kind === "note").length,
      1,
    );
    await invoke("reply_request", {
      projectId: p.id,
      requestId: "request",
      expectedVersion: 1,
      body: "已更新原节点，并在子画布添加访谈计划。",
      operationId: "reply-1",
    });
    assert.equal(service.store.get(p.id, "request").data.state, "replied");
    assert.equal(service.store.get(p.id, "annotation").data.state, "open");
    await invoke("reply_request", {
      projectId: p.id,
      requestId: "request",
      expectedVersion: 1,
      body: "已更新原节点，并在子画布添加访谈计划。",
      operationId: "reply-1",
    });
    assert.equal(service.store.get(p.id, "request").data.replies.length, 1);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7sAAAAASUVORK5CYII=",
      "base64",
    );
    writeFileSync(path.join(dir, "test.png"), bytes);
    const asset = await invoke("import_image", {
      projectId: p.id,
      workspacePath: "test.png",
      name: "test.png",
    });
    await invoke("create_content", {projectId:p.id,canvasId:c,kind:"card",data:{title:"图文卡片",body:"保留说明",imageIds:[asset.id]},requestId:"image-card"});
    const imageCard = service.store.get(p.id,"image-card:content");
    assert.equal(imageCard.kind,"card");
    await invoke("convert_card",{projectId:p.id,id:imageCard.id,expectedVersion:1,target:"note",requestId:"image-to-note"});
    assert.deepEqual(service.store.get(p.id,imageCard.id).data.imageIds,[asset.id]);
    const cardImage:any = await client.callTool({name:"read_image",arguments:{projectId:p.id,id:imageCard.id}});
    assert.equal(cardImage.content[1].data,bytes.toString("base64"));
    const invalidImage:any = await client.callTool({name:"update_content",arguments:{projectId:p.id,id:imageCard.id,expectedVersion:2,patch:{imageIds:["missing"]},summary:"无效图片",requestId:"bad-card-image"}});
    assert.ok(invalidImage.isError);
    assert.deepEqual(service.store.get(p.id,imageCard.id).data.imageIds,[asset.id]);
    const image: any = await client.callTool({
      name: "read_image",
      arguments: { projectId: p.id, id: asset.id },
    });
    assert.equal(image.content[1].type, "image");
    assert.equal(image.content[1].data, bytes.toString("base64"));
    const served = await fetch(`${base}/assets-file/${p.id}/${asset.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes);
    const deniedFile: any = await client.callTool({
      name: "import_image",
      arguments: {
        projectId: p.id,
        workspacePath: "../not-allowed.png",
        name: "no.png",
      },
    });
    assert.equal(deniedFile.isError, true);
    const updates = await invoke("read_changes", { projectId: p.id });
    const diagram = await invoke("create_diagram_card", { projectId: p.id, canvasId: c, diagramType: "mind", title: "卡片中的导图", x: 1200, y: 90, requestId: "diagram-card" });
    assert.ok(diagram.entries.some((e: any) => e.kind === "diagram"));
    const inner = await invoke("read_canvas", { projectId: p.id, canvasId: "diagram-card:diagram:canvas" });
    assert.equal(inner.objects.filter((e: any) => e.kind === "mind").length, 3);
    const nodePlace = service.store.all(p.id).find(e => e.kind === "placement" && e.data.objectId === "node")!;
    const relation = await invoke("create_relation", { projectId: p.id, canvasId: c,
      sourcePlacementId: nodePlace.id, targetPlacementId: "diagram-card:diagram:placement", label: "展开研究", requestId: "relation" });
    assert.equal(relation.entries[0].kind, "relation");
    await invoke("update_content", { projectId: p.id, id: "relation:relation", expectedVersion: 1, patch: { label: "共同推进" }, summary: "编辑关联", requestId: "edit-relation" });
    assert.ok(updates.some((e: any) => e.actor === "agent"));
    assert.equal(
      service.store
        .all(p.id)
        .find((e) => e.kind === "placement" && e.data.objectId === "node")!.data
        .x,
      80,
    );
  } finally {
    await reader?.cancel();
    await client.close();
    service.close();
    http.closeAllConnections();
    await new Promise<void>((r) => http.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  }
});
