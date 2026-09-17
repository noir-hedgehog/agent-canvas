import { createOp, placementOp, type Operation } from "./model.ts";

/** One transaction creates the card, its owned canvas and editable starter graph. */
export function diagramOperations(canvasId: string, type: "mind" | "flow", id: string,
  title: string, x: number, y: number, width = 350, height = 270): Operation[] {
  const child = `${id}:canvas`, graph = `${id}:graph`;
  const ops: Operation[] = [
    createOp("diagram", canvasId, { title, body: "", diagramType: type, childCanvasId: child, graphId: graph }, id),
    placementOp(canvasId, id, x, y, width, height, undefined, `${id}:placement`),
    createOp("canvas", null, { title, ownerNodeId: id }, child),
    createOp("graph", child, { title, graphType: type }, graph),
  ];
  const titles = type === "mind" ? ["中心主题", "分支一", "分支二"] : ["开始", "处理事项", "结束"];
  titles.forEach((name, index) => {
    const node = `${id}:node-${index}`;
    ops.push(createOp(type, child, { title: name, body: "", graphId: graph,
      ...(type === "mind" ? { parentId: index ? `${id}:node-0` : null }
        : { shape: index === 1 ? "process" : "terminal" }) }, node));
    ops.push(placementOp(child, node, type === "mind" ? (index ? 440 : 100) : 100 + index * 330,
      type === "mind" ? (index === 2 ? 320 : 150) : 150, 240, 130, undefined, `${id}:node-${index}:placement`));
    if (type === "flow" && index) ops.push(createOp("edge", child,
      { graphId: graph, source: `${id}:node-${index - 1}`, target: node, label: "" }, `${id}:edge-${index}`));
  });
  return ops;
}
