import type { Entity } from "./model.ts";
export type CanvasTreeEntry = {
  id: string;
  title: string;
  kind: string;
  canvasId: string;
  objectId?: string;
  referenced?: boolean;
  broken?: boolean;
  children: CanvasTreeEntry[];
};
const cardKinds = new Set([
  "mind",
  "flow",
  "note",
  "text",
  "tasks",
  "image",
  "status",
  "diagram",
  "card",
  "space",
]);
export function buildCanvasTree(
  entities: Entity[],
  rootCanvasId: string,
): CanvasTreeEntry | undefined {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const projectId = byId.get(rootCanvasId)?.projectId;
  const visited = new Set<string>();
  function canvas(id: string): CanvasTreeEntry | undefined {
    const c = byId.get(id);
    if (
      !c ||
      c.deleted ||
      c.kind !== "canvas" ||
      c.projectId !== projectId ||
      visited.has(id)
    )
      return;
    visited.add(id);
    const placements = entities.filter(
      (p) =>
        !p.deleted &&
        p.kind === "placement" &&
        p.canvasId === id &&
        p.projectId === projectId &&
        cardKinds.has(byId.get(p.data.objectId)?.kind || ""),
    );
    const entries = new Map<string, CanvasTreeEntry>();
    const firstPlacement = new Map<string, string>();
    for (const p of placements) {
      const e = byId.get(p.data.objectId)!;
      if (e.projectId !== projectId) continue;
      firstPlacement.set(e.id, firstPlacement.get(e.id) || p.id);
      entries.set(p.id, {
        id: p.id,
        title: e.data.title || "未命名卡片",
        kind: e.kind,
        canvasId: id,
        objectId: e.id,
        referenced: e.canvasId !== id,
        broken: e.deleted,
        children: [],
      });
    }
    const roots: CanvasTreeEntry[] = [];
    for (const p of placements) {
      const entry = entries.get(p.id);
      if (!entry) continue;
      const e = byId.get(entry.objectId!)!;
      const ancestors = new Set([e.id]);
      let parent = byId.get(e.data.parentId);
      let cyclic = false;
      while (parent) {
        if (ancestors.has(parent.id)) {
          cyclic = true;
          break;
        }
        ancestors.add(parent.id);
        parent = byId.get(parent.data.parentId);
      }
      const parentEntry =
        e.kind === "mind" && !cyclic
          ? entries.get(firstPlacement.get(e.data.parentId) || "")
          : undefined;
      if (parentEntry) parentEntry.children.push(entry);
      else roots.push(entry);
      if (!e.deleted && e.data.childCanvasId && e.canvasId === id) {
        const child = canvas(e.data.childCanvasId);
        if (child) entry.children.push(child);
      }
    }
    return {
      id: c.id,
      title: c.data.title || "画布",
      kind: "canvas",
      canvasId: c.id,
      children: roots,
    };
  }
  return canvas(rootCanvasId);
}

export function filterCanvasTree(
  entry: CanvasTreeEntry,
  query: string,
): CanvasTreeEntry | undefined {
  const term = query.trim().toLocaleLowerCase();
  if (!term || entry.title.toLocaleLowerCase().includes(term)) return entry;
  const children = entry.children
    .map((e) => filterCanvasTree(e, term))
    .filter(Boolean) as CanvasTreeEntry[];
  return children.length ? { ...entry, children } : undefined;
}
