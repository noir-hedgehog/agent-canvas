import { useId } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Trash2, X, ArrowLeftRight } from "lucide-react";
import type { Entity } from "../shared/model";
import { useEditor, useEditorApi } from "./state";
import { Editable } from "./Editable";
import { taperedPath } from "../shared/relations";
export function RelationEdge(props: EdgeProps) {
  const data = props.data as { entity: Entity; active: boolean; reverse: boolean; editable: boolean; onSelect: () => void; onClose: () => void };
  const e = data.entity;
  const store = useEditorApi();
  const patch = useEditor(s => s.patch), run = useEditor(s => s.run);
  const marker = useId().replace(/:/g, "");
  const style = e.data.lineStyle || (e.data.direction === "forward" || e.kind === "edge" ? "arrow" : "association");
  const [bezier, bx, by] = getBezierPath(props);
  const cx = (props.sourceX + props.targetX) / 2;
  const path = style === "containment" ? `M${props.sourceX},${props.sourceY} C${cx},${props.sourceY} ${cx},${props.targetY} ${props.targetX},${props.targetY}` : bezier;
  const x = style === "containment" ? cx : bx, y = style === "containment" ? (props.sourceY + props.targetY) / 2 : by;
  return <>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#9380b0" /></marker></defs>
    {style === "containment" && <path d={taperedPath(props.sourceX, props.sourceY, props.targetX, props.targetY, data.reverse)} fill="#a08bbd" opacity={data.active ? 1 : .75} pointerEvents="none" />}
    <BaseEdge id={props.id} path={path} interactionWidth={24} style={{stroke: style === "containment" ? "transparent" : "#9380b0", strokeWidth: data.active ? 2.6 : 1.8, strokeDasharray: style === "association" ? "5 4" : undefined}}
      markerEnd={style === "arrow" && !data.reverse ? `url(#${marker})` : undefined} markerStart={style === "arrow" && data.reverse ? `url(#${marker})` : undefined} />
    <EdgeLabelRenderer><div className="relation-inline nodrag nopan" style={{transform:`translate(-50%, -50%) translate(${x}px,${y}px)`}} onClick={ev => ev.stopPropagation()} onPointerDown={ev => ev.stopPropagation()} onKeyDown={ev => {ev.stopPropagation(); if(ev.key === "Escape") data.onClose();}}>
      {data.active && data.editable ? <>
        <div className="relation-line-toolbar" role="toolbar" aria-label="关系线操作">
          {([['association','普通关联'],['arrow','下一步（箭头）'],['containment','包含（粗到细）']] as const).map(([value, title]) => <button key={value} aria-label={title} aria-pressed={style === value} onClick={() => void patch(e, {lineStyle:value, direction:value === "association" ? "none" : "forward"}, "更改关系线样式")}><svg width="28" height="16" viewBox="0 0 28 16">{value === "containment" ? <path d="M2 3 Q14 5 26 8 Q14 10 2 13Z" fill="currentColor" /> : <><path d="M2 8H25" stroke="currentColor" strokeWidth="1.8" strokeDasharray={value === "association" ? "3 3" : undefined} />{value === "arrow" && <path d="M20 3L26 8L20 13" fill="none" stroke="currentColor" strokeWidth="1.8" />}</>}</svg></button>)}
          {style !== "association" && <button aria-label={style === "containment" ? "反转包含方向" : "反转箭头方向"} title={style === "containment" ? "交换包含方与被包含方" : "交换起点与终点"} onClick={() => void patch(e, e.kind === "relation" ? {sourcePlacementId:e.data.targetPlacementId,targetPlacementId:e.data.sourcePlacementId} : {source:e.data.target,target:e.data.source}, "反转连线方向")}><ArrowLeftRight size={16}/></button>}
          <button aria-label="删除关系线" onClick={async () => { await store.getState().settleEdits(e.id); const latest = store.getState().snapshot?.entities.find(x => x.id === e.id); if(latest && await run([{op:"delete",id:e.id,expectedVersion:latest.version}],"删除关系线")) data.onClose(); }}><Trash2 size={14}/></button>

        </div>
        <Editable entity={e} field="label" multiline={false} autoFocus label="关系标签" placeholder="添加关系标签…" />
      </> : <button className={`relation-label ${e.data.label ? "" : "is-empty"}`} aria-label={e.data.label || "编辑连线标签"} disabled={!data.editable} onClick={data.onSelect}>{e.data.label || ""}</button>}
    </div></EdgeLabelRenderer>
  </>;
}
