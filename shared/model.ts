export const kinds = [
  "canvas",
  "note",
  "text",
  "image",
  "tasks",
  "graph",
  "mind",
  "flow",
  "edge",
  "placement",
  "annotation",
  "request",
  "status",
  "diagram",
  "card",
  "space",
  "relation",
  "asset",
] as const;
export type Kind = (typeof kinds)[number];
export const cardKinds = ["card", "space", "note", "text", "image", "tasks", "status", "diagram", "mind", "flow"] as const;
export const convertibleKinds = ["card", "space", "note", "text", "image", "tasks", "status", "diagram"] as const;
export const cardBackgrounds = { white: "#ffffff", yellow: "#fff2bc", pink: "#f9dfeb", blue: "#e2effa", green: "#e3f1e7", purple: "#ede4f9" };
export interface Entity {
  id: string;
  projectId: string;
  canvasId: string | null;
  kind: Kind;
  data: Record<string, any>;
  version: number;
  deleted: boolean;
}
export interface Project {
  version?: number;
  createdAt?: string;
  id: string;
  name: string;
  rootCanvasId: string;
  example: boolean;
}
export interface Change {
  id: string;
  projectId: string;
  actor: string;
  summary: string;
  requestId: string;
  createdAt: string;
  entries: { before: Entity | null; after: Entity }[];
  undoOf?: string;
}
export interface Snapshot {
  project: Project;
  entities: Entity[];
  changes: Change[];
}
export type Operation =
  | { op: "convert"; id: string; expectedVersion: number; kind: (typeof convertibleKinds)[number]; patch: Record<string, any> }
  | {
      op: "create";
      id: string;
      kind: Kind;
      canvasId: string | null;
      data: Record<string, any>;
    }
  | {
      op: "update";
      id: string;
      expectedVersion: number;
      patch: Record<string, any>;
    }
  | { op: "delete" | "restore"; id: string; expectedVersion: number };
export interface Batch {
  projectId: string;
  requestId: string;
  summary: string;
  operations: Operation[];
}
export const statuses = ["todo", "doing", "done"] as const;
export const statusLabels: Record<string, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
};
export function createOp(
  kind: Kind,
  canvasId: string | null,
  data: Record<string, any>,
  id: string = crypto.randomUUID(),
): Operation {
  return { op: "create", id, kind, canvasId, data };
}
export function updateOp(e: Entity, patch: Record<string, any>): Operation {
  return { op: "update", id: e.id, expectedVersion: e.version, patch };
}
export function placementOp(
  canvasId: string,
  objectId: string,
  x: number,
  y: number,
  width = 260,
  height = 180,
  view?: string,
  id?: string,
): Operation {
  return createOp("placement", canvasId, {
    objectId,
    x,
    y,
    width,
    height,
    ...(view ? { view } : {}),
  }, id);
}
export function linkTo(projectId: string, canvasId: string, objectId?: string) {
  return `/?project=${encodeURIComponent(projectId)}&canvas=${encodeURIComponent(canvasId)}${objectId ? "&object=" + encodeURIComponent(objectId) : ""}`;
}
