import { createOp, type Entity, type Operation, type Kind } from "./model.ts";
import { diagramOperations } from "./diagram.ts";
export type CardTarget = "card" | "space" | "note" | "text" | "tasks" | "status" | "image" | "mind" | "flow";
export function conversionOperations(e: Entity, target: CardTarget, requestId: string, extra: Record<string, any> = {}): Operation[] {
  const kind = target === "mind" || target === "flow" ? "diagram" : target;
  const patch: Record<string, any> = { ...extra };
  const ops: Operation[] = [];
  let child = e.data.childCanvasId;
  if (target === "space" && !child) {
    child = `${requestId}:canvas`;
    ops.push(createOp("canvas", null, { title: e.data.title || "未命名画布", ownerNodeId: e.id }, child));
    patch.childCanvasId = child;
  }
  if (target === "mind" || target === "flow") {
    const savedGraphs = { ...e.data.diagramGraphs, ...(e.data.graphId && e.data.diagramType ? {[e.data.diagramType]: e.data.graphId} : {}) };
    if (savedGraphs[target]) {
      Object.assign(patch, {diagramType:target, graphId:savedGraphs[target], diagramGraphs:savedGraphs});
    } else {
      const templateId = `${requestId}:inner`;
      const template = diagramOperations(e.canvasId!, target, templateId, e.data.title || "未命名图", 0, 0);
      const templateCanvas = `${templateId}:canvas`;
      child ||= templateCanvas;
      for (const op of template) {
        if (op.op !== "create" || op.id === templateId || op.id === `${templateId}:placement`) continue;
        if (op.id === templateCanvas) {
          if (!e.data.childCanvasId) ops.push({ ...op, data: { ...op.data, ownerNodeId: e.id } });
        } else ops.push({ ...op, canvasId: op.canvasId === templateCanvas ? child : op.canvasId,
          data: op.kind === "placement" && e.data.childCanvasId ? {...op.data, y:op.data.y + 600 * Math.max(1, Object.keys(savedGraphs).length)} : op.data });
      }
      Object.assign(patch, { diagramType: target, graphId: `${templateId}:graph`, childCanvasId: child, diagramGraphs: {...savedGraphs, [target]:`${templateId}:graph`} });
    }
  }
  if (target === "tasks" && !e.data.items) patch.items = [];
  if (target === "note" && !e.data.color) patch.color = "yellow";
  if (target === "status" && !e.data.state) patch.state = "待开始";
  // Preserve identity, every content field, layout, links, and any owned canvas.
  return [{ op: "convert", id: e.id, expectedVersion: e.version, kind, patch }, ...ops];
}
