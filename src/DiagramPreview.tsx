import type { Entity } from "../shared/model";
import { useId } from "react";
export function DiagramPreview({ card, entities }: { card: Entity; entities: Entity[] }) {
  const marker = useId().replace(/:/g, "");
  const live = entities.filter(e => !e.deleted && e.canvasId === card.data.childCanvasId);
  const byId = new Map(entities.filter(e => !e.deleted).map(e => [e.id, e]));
  const places = live.filter(e => e.kind === "placement" && byId.has(e.data.objectId));
  if (!places.length) return <div className="diagram-preview-empty">进入卡片，添加第一个节点</div>;
  const left = Math.min(...places.map(p => p.data.x)), top = Math.min(...places.map(p => p.data.y));
  const width = Math.max(...places.map(p => p.data.x + p.data.width)) - left;
  const height = Math.max(...places.map(p => p.data.y + p.data.height)) - top;
  const lines = live.flatMap(e => {
    const source = e.kind === "mind" ? e.data.parentId : e.kind === "edge" ? e.data.source : undefined;
    const target = e.kind === "mind" ? e.id : e.data.target;
    const a = places.find(p => p.data.objectId === source), b = places.find(p => p.data.objectId === target);
    return a && b ? [{ id: e.id, a: a.data, b: b.data }] : [];
  });
  return <svg className="diagram-preview" viewBox={`${left - 35} ${top - 35} ${width + 70} ${height + 70}`} role="img" aria-label={`${card.data.title}内部缩略图`}>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#b3a7cb" /></marker></defs>
    {lines.map(l => <path key={l.id} d={`M${l.a.x + l.a.width},${l.a.y + l.a.height / 2} L${l.b.x},${l.b.y + l.b.height / 2}`} fill="none" stroke="#b3a7cb" strokeWidth={4} markerEnd={card.data.diagramType === "flow" ? `url(#${marker})` : undefined} />)}
    {places.map(p => { const e = byId.get(p.data.objectId)!; return <g key={p.id}>
      {e.kind === "flow" && e.data.shape === "decision" ? <polygon points={`${p.data.x + p.data.width / 2},${p.data.y} ${p.data.x + p.data.width},${p.data.y + p.data.height / 2} ${p.data.x + p.data.width / 2},${p.data.y + p.data.height} ${p.data.x},${p.data.y + p.data.height / 2}`} fill="#e3edf7" stroke="#c5b7dd" strokeWidth={3} /> : <rect x={p.data.x} y={p.data.y} width={p.data.width} height={p.data.height} rx={e.data.shape === "terminal" ? 55 : 14} fill={e.kind === "note" ? "#fff1ba" : card.data.diagramType === "flow" ? "#e3edf7" : "#eee7f8"} stroke="#c5b7dd" strokeWidth={3} />}
      <text x={p.data.x + p.data.width / 2} y={p.data.y + p.data.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={21} fill="#5c5070">{String(e.data.title || "卡片").slice(0, 10)}</text>
    </g>; })}
  </svg>;
}
