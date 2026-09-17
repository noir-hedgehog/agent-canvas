import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../server/store.ts";
import { seed } from "../server/seed.ts";
import { conversionOperations } from "../shared/conversion.ts";
import { diagramOperations } from "../shared/diagram.ts";
import { buildCanvasTree } from "../shared/canvasTree.ts";
import {
  createOp,
  placementOp,
  updateOp,
  type Operation,
} from "../shared/model.ts";
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "agentcanvas-store-"));
  const s = new Store(path.join(dir, "db.sqlite"));
  const p = s.newProject("测试项目");
  return {
    s,
    p,
    done() {
      s.close();
      rmSync(dir, { recursive: true, force: true });
    },
    apply(ops: Operation[], id: string = crypto.randomUUID()) {
      return s.apply({
        projectId: p.id,
        requestId: id,
        summary: "测试修改",
        operations: ops,
      });
    },
  };
}
test("diagram cards own editable canvases and restore contents plus external relations without deleting peers", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    const ops = [...diagramOperations(c, "mind", "map", "想法图", 50, 80),
      ...diagramOperations(c, "flow", "process", "执行流程", 650, 80),
      createOp("relation", c, { sourcePlacementId: "map:placement", targetPlacementId: "process:placement", label: "落地方案", direction: "forward" }, "r")];
    const created = f.apply(ops, "cards");
    assert.equal(f.apply(ops, "cards").id, created.id);
    const original = f.s.get(f.p.id, "process:placement");
    const tree = buildCanvasTree(f.s.all(f.p.id), c)!;
    assert.equal(tree.children.find(e => e.objectId === "map")!.children[0].id, "map:canvas");
    const deleted = f.apply([{ op: "delete", id: "map", expectedVersion: 1 }]);
    assert.ok(f.s.get(f.p.id, "map:node-1").deleted);
    assert.ok(f.s.get(f.p.id, "r").deleted);
    assert.deepEqual(f.s.get(f.p.id, "process:placement"), original);
    f.s.undo(f.p.id, deleted.id, "restore-map");
    assert.ok(!f.s.get(f.p.id, "map:node-1").deleted);
    assert.ok(!f.s.get(f.p.id, "r").deleted);
    const owner = f.s.get(f.p.id, "map");
    assert.throws(() => f.apply([updateOp(owner, { diagramType: "flow" })]), /图类型不匹配/);
    assert.throws(() => f.apply([updateOp(owner, { childCanvasId: "process:canvas" })]), /不匹配/);
  } finally { f.done(); }
});
test("relations use exact local placements, reject self/cross-canvas targets and restore deleted task-reference links", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([...diagramOperations(c, "flow", "d", "流程", 0, 0),
      createOp("tasks", c, { title: "任务", items: [] }, "t"), placementOp(c, "t", 500, 0, 350, 320, "list", "tp"),
      placementOp("d:canvas", "t", 500, 400, 350, 320, "list", "ref"),
      createOp("relation", "d:canvas", { sourcePlacementId: "d:node-0:placement", targetPlacementId: "ref", label: "参考", direction: "none" }, "r")]);
    const r = f.s.get(f.p.id, "r");
    assert.throws(() => f.apply([updateOp(r, { targetPlacementId: "tp" })]), /当前画布/);
    assert.throws(() => f.apply([updateOp(r, { targetPlacementId: "d:node-0:placement" })]), /不同卡片/);
    assert.throws(() => f.apply([updateOp(r, { direction: "invalid" })]), /方向无效/);
    assert.equal(f.s.get(f.p.id, "r").version, 1);
    const removed = f.apply([{ op: "delete", id: "t", expectedVersion: 1 }]);
    assert.ok(!f.s.get(f.p.id, "ref").deleted);
    assert.ok(f.s.get(f.p.id, "r").deleted);
    f.s.undo(f.p.id, removed.id, "restore-t");
    assert.ok(!f.s.get(f.p.id, "r").deleted);
  } finally { f.done(); }
});
test("transactions roll back every object when a reference is invalid", () => {
  const f = fixture();
  try {
    assert.throws(() =>
      f.apply([
        createOp("note", f.p.rootCanvasId, { title: "不应保存" }, "n"),
        placementOp(f.p.rootCanvasId, "missing", 0, 0),
      ]),
    );
    assert.equal(f.s.all(f.p.id).length, 1);
    assert.equal(f.s.changes(f.p.id).length, 0);
  } finally {
    f.done();
  }
});
test("same request retries once; different payload with same ID is rejected", () => {
  const f = fixture();
  try {
    const ops = [createOp("note", f.p.rootCanvasId, { title: "灵感" }, "n")],
      requestId = crypto.randomUUID();
    const a = f.apply(ops, requestId),
      b = f.apply(ops, requestId);
    assert.equal(a.id, b.id);
    assert.equal(f.s.changes(f.p.id).length, 1);
    assert.throws(
      () =>
        f.apply(
          [createOp("note", f.p.rootCanvasId, { title: "别的" }, "m")],
          requestId,
        ),
      /不同内容/,
    );
  } finally {
    f.done();
  }
});
test("stale edits cannot overwrite new content, layout edits preserve content", () => {
  const f = fixture();
  try {
    const place = placementOp(f.p.rootCanvasId, "n", 10, 20);
    f.apply([
      createOp("note", f.p.rootCanvasId, { title: "原始" }, "n"),
      place,
    ]);
    const n = f.s.get(f.p.id, "n");
    f.apply([updateOp(n, { title: "新的" })]);
    assert.throws(
      () => f.apply([updateOp(n, { title: "旧的" })]),
      /已有新修改/,
    );
    f.apply([updateOp(f.s.get(f.p.id, place.id), { x: 100 })]);
    assert.equal(f.s.get(f.p.id, "n").data.title, "新的");
  } finally {
    f.done();
  }
});
test("undo and redo preserve identities; newer changes prevent undo", () => {
  const f = fixture();
  try {
    const c = f.apply([
      createOp("note", f.p.rootCanvasId, { title: "想法" }, "n"),
    ]);
    const undo = f.s.undo(f.p.id, c.id, crypto.randomUUID());
    assert.equal(f.s.get(f.p.id, "n").deleted, true);
    f.s.undo(f.p.id, undo.id, crypto.randomUUID());
    assert.equal(f.s.get(f.p.id, "n").deleted, false);
    assert.throws(
      () => f.s.undo(f.p.id, c.id, crypto.randomUUID()),
      /后又有修改/,
    );
  } finally {
    f.done();
  }
});
test("Todo and Kanban are projections of one collection with independent positions", () => {
  const f = fixture();
  try {
    const a = placementOp(f.p.rootCanvasId, "t", 0, 0, 350, 300, "list"),
      b = placementOp(f.p.rootCanvasId, "t", 500, 0, 650, 300, "board");
    f.apply([
      createOp(
        "tasks",
        f.p.rootCanvasId,
        {
          title: "任务",
          items: [
            { id: "one", title: "访谈", description: "", status: "todo" },
          ],
        },
        "t",
      ),
      a,
      b,
    ]);
    f.apply([
      updateOp(f.s.get(f.p.id, "t"), {
        items: [{ id: "one", title: "访谈", description: "", status: "done" }],
      }),
      updateOp(f.s.get(f.p.id, a.id), { x: 40 }),
    ]);
    assert.equal(f.s.get(f.p.id, b.id).data.x, 500);
    assert.equal(
      f.s.get(f.p.id, a.id).data.objectId,
      f.s.get(f.p.id, b.id).data.objectId,
    );
    assert.equal(f.s.get(f.p.id, "t").data.items[0].status, "done");
  } finally {
    f.done();
  }
});
test("mind graph rejects cycles and cross-project references", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([
      createOp("graph", c, { title: "导图", graphType: "mind" }, "g"),
      createOp("mind", c, { title: "A", graphId: "g", parentId: null }, "a"),
      createOp("mind", c, { title: "B", graphId: "g", parentId: "a" }, "b"),
    ]);
    assert.throws(
      () => f.apply([updateOp(f.s.get(f.p.id, "a"), { parentId: "b" })]),
      /循环/,
    );
    const other = f.s.newProject("另一个");
    assert.throws(
      () => f.apply([createOp("note", other.rootCanvasId, { title: "越界" })]),
      /引用/,
    );
  } finally {
    f.done();
  }
});
test("flow loops are legal; edge graph membership is enforced", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([
      createOp("graph", c, { title: "流程", graphType: "flow" }, "g"),
      ...["a", "b"].map((id) =>
        createOp("flow", c, { title: id, graphId: "g", shape: "process" }, id),
      ),
      createOp("edge", c, { graphId: "g", source: "a", target: "b" }),
      createOp("edge", c, { graphId: "g", source: "b", target: "a" }),
    ]);
    assert.equal(f.s.all(f.p.id).filter((e) => e.kind === "edge").length, 2);
  } finally {
    f.done();
  }
});
test("node deletion restores complete child canvas via undo and preserves outside references", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    const rootP = placementOp(c, "a", 0, 0),
      childP = placementOp("child", "t", 0, 0),
      reference = placementOp(c, "t", 500, 0);
    f.apply([
      createOp("graph", c, { title: "导图", graphType: "mind" }, "g"),
      createOp(
        "mind",
        c,
        { title: "A", graphId: "g", parentId: null, childCanvasId: "child" },
        "a",
      ),
      createOp("canvas", null, { title: "子画布", ownerNodeId: "a" }, "child"),
      createOp("tasks", "child", { title: "子任务", items: [] }, "t"),
      rootP,
      childP,
      reference,
    ]);
    const del = f.apply([{ op: "delete", id: "a", expectedVersion: 1 }]);
    assert.equal(f.s.get(f.p.id, "child").deleted, true);
    assert.equal(f.s.get(f.p.id, "t").deleted, true);
    assert.equal(f.s.get(f.p.id, rootP.id).deleted, true);
    assert.equal(f.s.get(f.p.id, reference.id).deleted, false);
    f.s.undo(f.p.id, del.id, crypto.randomUUID());
    assert.equal(f.s.get(f.p.id, "child").deleted, false);
    assert.equal(f.s.get(f.p.id, "t").deleted, false);
    assert.equal(f.s.get(f.p.id, rootP.id).deleted, false);
  } finally {
    f.done();
  }
});
test("parent and child ownership must match; no cyclic nesting", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    assert.throws(() =>
      f.apply([
        createOp(
          "canvas",
          null,
          { title: "子画布", ownerNodeId: "missing" },
          "child",
        ),
      ]),
    );
    assert.equal(f.s.all(f.p.id).length, 1);
    assert.throws(
      () => f.apply([{ op: "delete", id: c, expectedVersion: 1 }]),
      /根画布/,
    );
  } finally {
    f.done();
  }
});
test("sample initialization is idempotent and contains three navigation levels", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agentcanvas-seed-"));
  const s = new Store(path.join(dir, "db.sqlite"));
  try {
    seed(s);
    const p = s.projects()[0],
      before = s.all(p.id).length;
    seed(s);
    assert.equal(s.projects().length, 1);
    assert.equal(s.all(p.id).length, before);
    assert.equal(s.all(p.id).filter((e) => e.kind === "canvas").length, 4);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("persisted objects survive closing and reopening database", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agentcanvas-persist-")),
    file = path.join(dir, "db.sqlite");
  let s = new Store(file);
  try {
    const p = s.newProject("持久化");
    s.apply({
      projectId: p.id,
      requestId: crypto.randomUUID(),
      summary: "保存",
      operations: [
        createOp(
          "note",
          p.rootCanvasId,
          { title: "保留", body: "原文" },
          "persistent",
        ),
      ],
    });
    s.close();
    s = new Store(file);
    assert.equal(s.get(p.id, "persistent").data.body, "原文");
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("element discussions preserve DOM snapshot, retry once and support canvas-only targets", async () => {
  const { debugDiscussionOperations, discussionHandoffText } = await import(
    "../shared/debugDiscussion.ts"
  );
  const f = fixture();
  try {
    const target = f.s.all(f.p.id).find((e) => e.id === f.p.rootCanvasId)!;
    const inspection = {
      selector: ":scope > div",
      tag: "div",
      classes: "canvas-topbar",
      rect: { x: 10, y: 20, width: 100, height: 30 },
      styles: { display: "flex" },
    };
    const ops = debugDiscussionOperations(
      target,
      target.id,
      inspection,
      "标题栏文字重叠，请修复",
      "element-request",
      ["项目全景"],
    );
    const original = structuredClone(ops);
    inspection.styles.display = "grid";
    assert.deepEqual(
      ops,
      original,
      "capture must not follow live style changes",
    );
    const batchId = crypto.randomUUID();
    const first = f.apply(ops, batchId);
    assert.equal(f.apply(ops, batchId).id, first.id);
    const request = f.s.all(f.p.id).find((e) => e.id === "element-request")!;
    assert.equal(request.data.state, "pending");
    assert.equal(request.data.targets[0].id, target.id);
    assert.equal(request.data.debugContext.styles.display, "flex");
    assert.match(discussionHandoffText(request), /标题栏文字重叠/);
    assert.match(discussionHandoffText(request), /CanvasEditor root/);
    assert.equal(
      request.data.state,
      "pending",
      "handoff text does not imply delivery",
    );
  } finally {
    f.done();
  }
});

test("blank card conversions preserve identity, text, placements, relationships and owned contents", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([createOp("card", c, {title:"原想法",body:"不丢失的文字",background:"pink"}, "blank"),
      placementOp(c,"blank",720,390,260,190,undefined,"bp"),
      createOp("text", c, {title:"另一张卡片"}, "peer"), placementOp(c,"peer",0,0,260,190,undefined,"pp"),
      createOp("relation",c,{sourcePlacementId:"bp",targetPlacementId:"pp",direction:"forward",lineStyle:"containment",label:"包含"},"br")]);
    const placement = f.s.get(f.p.id,"bp"), relation = f.s.get(f.p.id,"br");
    const original = f.s.get(f.p.id,"blank");
    const converted = f.apply(conversionOperations(original,"space","space"));
    const space = f.s.get(f.p.id,"blank");
    assert.equal(space.kind,"space");
    assert.equal(space.data.body,original.data.body);
    const child = space.data.childCanvasId;
    f.apply([createOp("note",child,{title:"内部内容"},"inside")]);
    f.apply(conversionOperations(f.s.get(f.p.id,"blank"),"mind","map-convert"));
    const map = f.s.get(f.p.id,"blank");
    const graph = map.data.graphId;
    f.apply(conversionOperations(map,"flow","flow-convert"));
    f.apply(conversionOperations(f.s.get(f.p.id,"blank"),"mind","map-again"));
    assert.equal(f.s.get(f.p.id,"blank").data.graphId,graph);
    for (const target of ["tasks","text","note","status","card"] as const) {
      f.apply(conversionOperations(f.s.get(f.p.id,"blank"),target,`convert-${target}`));
      const card = f.s.get(f.p.id,"blank");
      assert.equal(card.data.body, original.data.body);
      assert.equal(card.data.childCanvasId,child);
      assert.equal(card.data.background,"pink");
    }
    assert.deepEqual(f.s.get(f.p.id,"bp"),placement);
    assert.deepEqual(f.s.get(f.p.id,"br"),relation);
    assert.ok(!f.s.get(f.p.id,"inside").deleted);
    assert.throws(() => f.apply(conversionOperations(original,"tasks","stale")), /版本/);
    assert.throws(() => f.apply(conversionOperations(f.s.get(f.p.id,"blank"),"image","bad-image")), /引用|图片/);
    assert.equal(f.s.get(f.p.id,"blank").kind,"card");
    assert.throws(() => f.s.undo(f.p.id,converted.id,"old-undo"), /修改|版本/);
    const deletion = f.apply([{op:"delete",id:"blank",expectedVersion:f.s.get(f.p.id,"blank").version}]);
    assert.ok(f.s.get(f.p.id,"inside").deleted);
    f.s.undo(f.p.id,deletion.id,"restore-converted");
    assert.ok(!f.s.get(f.p.id,"inside").deleted);
  } finally { f.done(); }
});
test("conversions undo atomically and shared tasks cannot lose reference semantics", () => {
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([createOp("card",c,{title:""},"card")]);
    const change = f.apply(conversionOperations(f.s.get(f.p.id,"card"),"mind","convert"));
    f.s.undo(f.p.id,change.id,"undo-convert");
    assert.equal(f.s.get(f.p.id,"card").kind,"card");
    assert.ok(f.s.get(f.p.id,"convert:inner:canvas").deleted);
    f.apply([createOp("canvas",null,{title:"另一层"},"canvas2"),createOp("tasks",c,{title:"任务",items:[]},"task"),placementOp("canvas2","task",0,0)]);
    assert.throws(() => f.apply(conversionOperations(f.s.get(f.p.id,"task"),"card","ref-convert")), /任务/);
    assert.equal(f.s.get(f.p.id,"task").kind,"tasks");
    assert.throws(() => f.apply([{op:"convert",id:c,expectedVersion:1,kind:"card",patch:{}}]), /转换/);
  } finally { f.done(); }
});

test('relation reversal swaps semantic endpoints without modifying cards or placements', () => {
  const f = fixture();
  try {
    const c=f.p.rootCanvasId;
    f.apply([createOp('card',c,{title:'A'},'a'),createOp('card',c,{title:'B'},'b'),placementOp(c,'a',0,0,260,190,undefined,'ap'),placementOp(c,'b',500,0,260,190,undefined,'bp'),createOp('relation',c,{sourcePlacementId:'ap',targetPlacementId:'bp',direction:'forward',lineStyle:'containment',label:'包括'},'rel')]);
    const before=f.s.get(f.p.id,'ap');
    const changed=f.apply([updateOp(f.s.get(f.p.id,'rel'),{sourcePlacementId:'bp',targetPlacementId:'ap'})]);
    assert.equal(f.s.get(f.p.id,'rel').data.sourcePlacementId,'bp');
    assert.equal(f.s.get(f.p.id,'rel').data.lineStyle,'containment');
    assert.deepEqual(f.s.get(f.p.id,'ap'),before);
    f.s.undo(f.p.id,changed.id,'undo-direction');
    assert.equal(f.s.get(f.p.id,'rel').data.sourcePlacementId,'ap');
  } finally {f.done();}
});

test('project rename persists, retries once, rejects stale names, and leaves canvases untouched',()=>{
 const f=fixture();
 try {
  const entities=f.s.all(f.p.id), notices:string[]=[];
  f.s.onChange=id=>notices.push(id);
  const renamed=f.s.renameProject(f.p.id,'新项目名称',1,'rename-once');
  assert.equal(renamed.name,'新项目名称');assert.equal(renamed.version,2);
  assert.deepEqual(f.s.renameProject(f.p.id,'新项目名称',1,'rename-once'),renamed);
  assert.equal(notices.length,1);
  assert.throws(()=>f.s.renameProject(f.p.id,'另一名称',1,'rename-stale'),/重新读取/);
  assert.throws(()=>f.s.renameProject(f.p.id,'',2,'rename-empty'),/名称/);
  assert.throws(()=>f.s.renameProject(f.p.id,'更换参数',1,'rename-once'),/不同内容/);
  assert.equal(f.s.project(f.p.id).name,'新项目名称');
  assert.deepEqual(f.s.all(f.p.id),entities);
 } finally {f.done();}
});

test('editing a discussion atomically updates the annotation and request, preserving replies and rejecting stale edits', async () => {
  const { discussionEditOperations } = await import('../shared/discussionEdit');
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([
      createOp('annotation', c, { targets: [], body: '原批注', state: 'resolved' }, 'a'),
      createOp('request', c, { targets: [], annotationId: 'a', instruction: '原批注', state: 'replied', replies: [{ body: '历史回复', actor: 'agent' }] }, 'q'),
    ]);
    const a = f.s.get(f.p.id, 'a'), q = f.s.get(f.p.id, 'q');
    assert.throws(() => discussionEditOperations(q, a, '  '), /不能为空/);
    const result = f.apply(discussionEditOperations(q, a, ' 修改后的批注 '));
    assert.equal(f.s.get(f.p.id, 'a').data.body, '修改后的批注');
    assert.equal(f.s.get(f.p.id, 'q').data.instruction, '修改后的批注');
    assert.equal(f.s.get(f.p.id, 'q').data.state, 'pending');
    assert.equal(f.s.get(f.p.id, 'a').data.state, 'open');
    assert.deepEqual(f.s.get(f.p.id, 'q').data.replies, q.data.replies);
    const latestA = f.s.get(f.p.id, 'a');
    assert.throws(() => f.apply(discussionEditOperations(q, latestA, '过期草稿')));
    assert.deepEqual(f.s.get(f.p.id, 'a'), latestA);
    f.s.undo(f.p.id, result.id, 'undo-comment');
    assert.equal(f.s.get(f.p.id, 'a').data.body, '原批注');
    assert.equal(f.s.get(f.p.id, 'q').data.state, 'replied');
  } finally { f.done(); }
});

test('discussion status menu preserves processing records on resolve and bulk handoff includes every open discussion', async () => {
  const { discussionStatusOperations, unresolvedDiscussions, discussionsHandoffText } = await import('../shared/discussionEdit');
  const f = fixture();
  try {
    const c = f.p.rootCanvasId;
    f.apply([
      createOp('annotation', c, { targets: [], body: '已回复但未解决', state: 'open' }, 'a1'),
      createOp('request', c, { targets: [], annotationId: 'a1', instruction: '已回复但未解决', state: 'replied', replies: [{ body: '历史回复' }] }, 'q1'),
      createOp('annotation', c, { targets: [], body: '已解决', state: 'resolved' }, 'a2'),
      createOp('request', c, { targets: [], annotationId: 'a2', instruction: '已解决', state: 'pending', replies: [] }, 'q2'),
      createOp('annotation', c, { targets: [], body: '界面修复', state: 'open' }, 'a3'),
      createOp('request', c, { targets: [], annotationId: 'a3', instruction: '界面修复', state: 'failed', source: 'element', debugContext: { selector: '.project-picker' } }, 'q3'),
    ]);
    const before = f.s.all(f.p.id);
    const open = unresolvedDiscussions(before);
    assert.deepEqual(open.map(e => e.id).sort(), ['q1', 'q3']);
    const text = discussionsHandoffText(open);
    assert.ok(text.includes('讨论请求 q1'));
    assert.ok(text.includes('讨论请求 q3'));
    assert.ok(!text.includes('讨论请求 q2'));
    assert.ok(text.includes('.project-picker') && text.includes('请勿将界面问题直接改写为卡片内容'));
    assert.deepEqual(f.s.all(f.p.id), before);
    const q = f.s.get(f.p.id, 'q1');
    f.apply(discussionStatusOperations(q, f.s.get(f.p.id, 'a1'), 'resolved'));
    assert.deepEqual(f.s.get(f.p.id, 'q1'), q);
    assert.deepEqual(unresolvedDiscussions(f.s.all(f.p.id)).map(e => e.id), ['q3']);
    f.apply(discussionStatusOperations(q, f.s.get(f.p.id, 'a1'), 'processing'));
    assert.equal(f.s.get(f.p.id, 'q1').data.state, 'processing');
    assert.equal(f.s.get(f.p.id, 'a1').data.state, 'open');
    assert.deepEqual(f.s.get(f.p.id, 'q1').data.replies, q.data.replies);
  } finally { f.done(); }
});
