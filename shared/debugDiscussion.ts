import { createOp, type Entity, type Operation } from "./model.ts";

export type ElementInspection = {
  selector: string;
  tag: string;
  classes: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  placementId?: string;
  objectId?: string;
};

export function debugDiscussionOperations(
  target: Entity,
  canvasId: string,
  inspection: ElementInspection,
  instruction: string,
  requestId: string,
  path: string[],
): Operation[] {
  const targets = [
    {
      id: target.id,
      version: target.version,
      canvasId: target.canvasId,
      title: target.data.title,
      content: structuredClone(target.data),
    },
  ];
  const debugContext = {
    ...structuredClone(inspection),
    capturedAt: new Date().toISOString(),
    selectorScope: "CanvasEditor root",
    canvasId,
    projectId: target.projectId,
  };
  return [
    createOp(
      "annotation",
      canvasId,
      {
        source: "element",
        targets,
        body: instruction.trim(),
        state: "open",
        replies: [],
        debugContext,
      },
      `${requestId}:annotation`,
    ),
    createOp(
      "request",
      canvasId,
      {
        source: "element",
        annotationId: `${requestId}:annotation`,
        targets,
        instruction: instruction.trim(),
        state: "pending",
        replies: [],
        path,
        debugContext,
      },
      requestId,
    ),
  ];
}

export function discussionHandoffText(request: Entity): string {
  const instruction = `请使用 agentcanvas MCP 处理项目 ${request.projectId} 的讨论请求 ${request.id}：先读取请求与引用对象的最新版本，按需展开子画布，完成后回复批注。保留用户布局。`;
  if (request.data.mediaContext) return `${instruction}\n\n这是文件批注。请根据文件引用、时间点与截图排查。可使用 read_file_reference 读取文件元数据或 Markdown，使用 read_image 读取截图资产。截图记录批注时的文件状态；原文件可能已变化，请核对。不要把文件问题直接改写为卡片内容。\n\n用户批注：${request.data.instruction}\n\n文件上下文：\n${JSON.stringify(request.data.mediaContext, null, 2)}`;
  if (!request.data.debugContext) return instruction;
  return `${instruction}\n\n这是界面元素的调试批注。请根据元素定位和样式快照排查界面实现；关联内容对象用于定位上下文，请勿将界面问题直接改写为卡片内容。DOM 选择器可能因界面变化失效，使用前请重新核对。\n\n用户批注：${request.data.instruction}\n\n元素快照：\n${JSON.stringify(request.data.debugContext, null, 2)}`;
}
