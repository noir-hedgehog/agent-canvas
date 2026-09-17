import { createContext, useContext, useState, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  NodeToolbar,
  useViewport,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import {
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  ImageOff,
  ImagePlus,
  Trash2,
  MessageSquare,
  GitBranch,
  Workflow,
  ListTodo,
  Link2,
  CheckCheck,
  Ellipsis,
  CornerDownRight,
} from "lucide-react";
import { Editable } from "./Editable";
import { CardImages } from "./CardImages";
import { CardFiles } from './CardFiles';
import { DiagramPreview } from "./DiagramPreview";
import { useEditor } from "./state";
import { type Entity, updateOp, statusLabels, cardBackgrounds } from "../shared/model";
import type { CardTarget } from "../shared/conversion";
export type Actions = {
  referenceFile: (entity?: Entity, replaceId?: string) => void;
  deleteCard: () => void;
  uploadImages: (e: Entity, files: File[]) => Promise<void>;
  convert: (e: Entity, target: CardTarget) => void;
  relate: (placement: Entity) => void;
  clearReveal: (id: string) => void;
  enter: (e: Entity) => void;
  branch: (e: Entity, sibling?: boolean) => void;
  task: (e: Entity, item?: any) => void;
  toTask: (e: Entity) => void;
  replaceImage: (e: Entity) => void;
  focus: (e: Entity) => void;
};
export const ActionContext = createContext<Actions>(null!);
export type CanvasNodeType = Node<
  {
    entity: Entity;
    placement: Entity;
    broken?: boolean;
    revealed?: boolean;
    changed?: boolean;
    annotationCount?: number;
  },
  "content"
>;
const labels: Record<string, string> = {
  mind: "思维导图",
  flow: "流程节点",
  note: "便签",
  text: "文本",
  tasks: "任务",
  image: "卡片",
  status: "卡片",
  diagram: "图卡片",
  card: "空白卡片",
  space: "画布卡片",
};
export function CanvasNode({ data, selected, isConnectable }: NodeProps<CanvasNodeType>) {
  const [resizing, setResizing] = useState(false);
  const viewport=useViewport();
  const { entity: e, placement: p } = data,
    d = e.data;
  const actions = useContext(ActionContext);
  const run = useEditor((s) => s.run),
    patch = useEditor((s) => s.patch),
    entities = useEditor((s) => s.snapshot?.entities || []);

  const graphNode = e.kind === "mind" || e.kind === "flow";
  const referenced = e.canvasId !== p.canvasId;
  const updateTask = (id: string, change: Record<string, any>) =>
    patch(
      e,
      {
        items: d.items.map((t: any) => (t.id === id ? { ...t, ...change } : t)),
      },
      "更新任务",
    );
  const moveTask = (id: string, status: string, beforeId?: string) => {
    const source = d.items.find((t: any) => t.id === id);
    if (!source) return;
    const items = d.items.filter((t: any) => t.id !== id);
    let i = beforeId ? items.findIndex((t: any) => t.id === beforeId) : -1;
    if (i < 0) i = items.length;
    items.splice(i, 0, { ...source, status });
    void patch(e, { items }, "移动任务");
  };
  const drop = (ev: React.DragEvent, status: string, beforeId?: string) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      const x = JSON.parse(
        ev.dataTransfer.getData("application/agentcanvas-task"),
      );
      if (x.collectionId === e.id) moveTask(x.taskId, status, beforeId);
    } catch {}
  };
  const taskRow = (t: any, kanban = false) => (
    <div
      key={t.id}
      className={`task-row nodrag nopan ${kanban ? "kanban-task" : ""}`}
      draggable
      onDragStart={(ev) => {
        ev.stopPropagation();
        ev.dataTransfer.setData(
          "application/agentcanvas-task",
          JSON.stringify({ collectionId: e.id, taskId: t.id }),
        );
      }}
      onDragOver={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      }}
      onDrop={(ev) => drop(ev, t.status, t.id)}
    >
      <button
        className={`task-check ${t.status}`}
        aria-label={`${t.status === "done" ? "取消完成" : "完成"} ${t.title}`}
        onClick={() =>
          void updateTask(t.id, {
            status: t.status === "done" ? "todo" : "done",
          })
        }
      >
        {t.status === "done" ? (
          <Check size={12} />
        ) : t.status === "doing" ? (
          <span />
        ) : null}
      </button>
      <button
        className={`task-title ${t.status === "done" ? "completed" : ""}`}
        onClick={() => actions.task(e, t)}
      >
        {t.title}
        {kanban && t.description && <small>{t.description}</small>}
      </button>
      {t.sourceId && (
        <button
          className="icon-button"
          aria-label={`查看 ${t.title} 的来源`}
          disabled={!entities.some((x) => x.id === t.sourceId && !x.deleted)}
          onClick={() => {
            const source = entities.find(
              (x) => x.id === t.sourceId && !x.deleted,
            );
            if (source) actions.focus(source);
          }}
        >
          <Link2 size={12} />
        </button>
      )}
      {!kanban && (
        <select
          className="task-status"
          aria-label={`${t.title}状态`}
          value={t.status}
          onChange={(ev) => void updateTask(t.id, { status: ev.target.value })}
        >
          {Object.entries(statusLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </div>
  );
  if (data.broken)
    return (
      <div className="canvas-card broken">
        <ImageOff size={22} />
        <strong>原对象已删除</strong>
        <span>{d.title}</span>
        <small>在变更记录中撤销删除，或移除此引用。</small>
      </div>
    );
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={e.kind === "tasks" ? 280 : 160}
        minHeight={graphNode ? 110 : 100}
        onResizeStart={() => setResizing(true)}
        onResizeEnd={async (_ev, params) => {
          await run(
            [
              updateOp(p, {
                width: params.width,
                height: params.height,
                heightMode: 'fixed',
                x: params.x,
                y: params.y,
              }),
            ],
            "调整尺寸",
          );
          setResizing(false);
        }}
      />
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        align={p.data.x*viewport.zoom+viewport.x>window.innerWidth*.65?"end":p.data.x*viewport.zoom+viewport.x<220?"start":"center"}
        className="node-toolbar nodrag nopan"
      >
        <span>{labels[e.kind] || e.kind}</span>
        {!graphNode && <select aria-label="卡片类型" value={e.kind === "diagram" ? d.diagramType : ["image","status"].includes(e.kind) ? "card" : e.kind} onChange={ev => actions.convert(e, ev.target.value as CardTarget)}>
          <option value="card">普通卡片</option><option value="space">画布</option><option value="text">文本</option><option value="note">便签</option><option value="mind">思维导图</option><option value="flow">流程图</option><option value="tasks">Todo / Kanban</option>
        </select>}
        <div className="card-backgrounds" role="group" aria-label="卡片背景颜色">{Object.entries(cardBackgrounds).map(([color, value]) => <button key={color} aria-label={`背景${({white:"白色",yellow:"黄色",pink:"粉色",blue:"蓝色",green:"绿色",purple:"紫色"})[color as keyof typeof cardBackgrounds]}`} aria-pressed={(d.background || (e.kind === "note" ? d.color : "white")) === color} style={{background:value}} onClick={() => void patch(e, { background: color }, "修改卡片背景")} />)}</div>
        <button aria-label="删除卡片" onClick={actions.deleteCard}><Trash2 size={14}/>删除</button>
        {p.data.heightMode === 'fixed' && <button onClick={() => void patch(p, { heightMode: 'auto' }, '恢复内容自适应高度')}>自适应高度</button>}
        {e.kind === "diagram" && <button onClick={() => actions.enter(e)}><ArrowUpRight size={14} />进入编辑</button>}
        {graphNode && (
          <>
            <button onClick={() => actions.enter(e)}>
              <ArrowUpRight size={14} />
              进入
            </button>
            <button onClick={() => actions.branch(e)}>
              <Plus size={14} />
              {e.kind === "mind" ? "子节点" : "下一步"}
            </button>
            {e.kind === "mind" && (
              <button onClick={() => actions.branch(e, true)}>同级</button>
            )}
          </>
        )}
        <button onClick={() => actions.replaceImage(e)}><ImagePlus size={14}/>添加图片</button>
        <button title="引用文件" aria-label="引用文件" onClick={() => actions.referenceFile(e)}><Link2 size={14}/></button>
      </NodeToolbar>
      {(
        <>
          <Handle
            id="in"
            type="target"
            position={Position.Left}
            isConnectable={isConnectable}
          />
          <Handle
            id="out"
            type="source"
            position={Position.Right}
            isConnectable={isConnectable}
          />
        </>
      )}
      <div
        onDragOver={ev => { if (ev.dataTransfer.types.includes('Files')) {ev.preventDefault(); ev.stopPropagation();} }}
        onDrop={ev => { const files = Array.from(ev.dataTransfer.files).filter(f => f.type.startsWith('image/')); if (files.length) {ev.preventDefault(); ev.stopPropagation(); void actions.uploadImages(e, files);} }}
        style={d.background ? { background: cardBackgrounds[d.background as keyof typeof cardBackgrounds] } : undefined}
        className={`canvas-card ${p.data.heightMode !== 'fixed' && !resizing ? 'auto-height' : ''} kind-${e.kind} ${e.kind === "note" ? "note-" + (d.color || "yellow") : ""} ${selected ? "is-selected" : ""}  ${e.kind === "flow" ? "flow-" + d.shape : ""}`}
      >

        {(["card", "space", "image", "status"].includes(e.kind)) && <>
          <Editable entity={e} field="title" multiline={false} placeholder="无标题" className="blank-card-title" />
          <Editable entity={e} placeholder="写下想法…" className="blank-card-body" autoFocus={e.kind === "card" && selected && !d.title && !d.body} />
        </>}
        <CardImages entity={e} selected={selected}/>
        <CardFiles entity={e} selected={selected}/>
        {!graphNode && e.kind !== "diagram" && d.childCanvasId && <button className="card-enter-space nodrag nopan" onClick={() => actions.enter(e)}><ArrowUpRight size={14} />进入画布</button>}
        {data.annotationCount! > 0 && (
          <span className="annotation-dot">
            <MessageSquare size={11} />
            {data.annotationCount}
          </span>
        )}
        {e.kind === "diagram" && <>
          <div className="diagram-card-heading">{d.diagramType === "mind" ? <GitBranch size={16} /> : <Workflow size={16} />}<span>{d.diagramType === "mind" ? "思维导图" : "流程图"}</span></div>
          <Editable entity={e} field="title" multiline={false} className="graph-title" />
          {d.body && <Editable entity={e} className="converted-card-description" />}
          <button className="diagram-preview-button nodrag nopan" aria-label={`进入 ${d.title}`} onClick={() => actions.enter(e)}><DiagramPreview card={e} entities={entities} /></button>
          <div className="diagram-card-footer"><span>{entities.filter(x => !x.deleted && x.kind === "placement" && x.canvasId === d.childCanvasId).length} 张内部卡片</span><button className="nodrag" onClick={() => actions.enter(e)}>进入编辑 <ArrowUpRight size={13} /></button></div>
        </>}
        {e.kind === "note" && (
          <>
            <div className="note-top">
              <span className="tiny-dot" />
              <Editable entity={e} field="title" multiline={false} />
            </div>
            <Editable
              entity={e}
              className="note-body"
              placeholder="记下一个想法…"
            />

          </>
        )}
        {e.kind === "text" && (
          <>
            <Editable
              entity={e}
              field="title"
              multiline={false}
              className="text-heading"
            />
            <Editable
              entity={e}
              className="text-body"
              placeholder="写下说明、方案或结果…"
            />

          </>
        )}
        {graphNode && (
          <>
            <div className="graph-label">
              {e.kind === "mind" ? (
                <GitBranch size={12} />
              ) : (
                <Workflow size={12} />
              )}
              <span>
                {e.kind === "mind"
                  ? d.parentId
                    ? "想法"
                    : "核心主题"
                  : (
                      {
                        terminal: "开始 / 结束",
                        decision: "判断",
                        process: "处理",
                      } as Record<string, string>
                    )[d.shape]}
              </span>
            </div>
            <Editable
              entity={e}
              field="title"
              multiline={false}
              className="graph-title"
            />
            <div className="graph-footer">
              <Editable entity={e} className="graph-body" placeholder="继续展开这个想法"/>
              <div>
                {e.kind === "mind" && (
                  <button
                    aria-label={
                      d.collapsed && !data.revealed ? "展开分支" : "折叠分支"
                    }
                    className="nodrag icon-button"
                    onClick={() =>
                      data.revealed && d.collapsed
                        ? actions.clearReveal(e.id)
                        : void patch(
                            e,
                            { collapsed: !d.collapsed },
                            "折叠导图分支",
                          )
                    }
                  >
                    {d.collapsed && !data.revealed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                )}
                <button
                  className="enter-canvas nodrag"
                  aria-label={`进入 ${d.title}`}
                  onClick={() => actions.enter(e)}
                >
                  {d.childCanvasId ? "进入" : "展开"}
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
        {e.kind === "tasks" && (
          <>
            <div className="collection-heading">
              <ListTodo size={17} />
              <Editable entity={e} field="title" multiline={false} />
              {referenced && (
                <button
                  aria-label="跳转任务来源"
                  className="icon-button nodrag"
                  onClick={() => actions.focus(e)}
                >
                  <Link2 size={14} />
                </button>
              )}
            </div>
            {d.body && <Editable entity={e} className="converted-card-description" />}
            <div className="collection-controls nodrag nopan">
              <div className="segmented">
                <button
                  className={p.data.view !== "board" ? "active" : ""}
                  onClick={() =>
                    void patch(
                      p,
                      { view: "list", width: p.data.listWidth || 350 },
                      "切换列表视图",
                    )
                  }
                >
                  列表
                </button>
                <button
                  className={p.data.view === "board" ? "active" : ""}
                  onClick={() =>
                    void patch(
                      p,
                      {
                        view: "board",
                        listWidth:
                          p.data.view === "board"
                            ? p.data.listWidth || 350
                            : p.data.width,
                        width: Math.max(620, p.data.width),
                        height: Math.max(340, p.data.height),
                      },
                      "切换看板视图",
                    )
                  }
                >
                  看板
                </button>
              </div>
              <span>
                {d.items.filter((t: any) => t.status === "done").length} /{" "}
                {d.items.length} 已完成
              </span>
            </div>
            {p.data.view === "board" ? (
              <div className="kanban-columns nodrag nopan nowheel">
                {Object.entries(statusLabels).map(([status, label]) => (
                  <section
                    key={status}
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                    }}
                    onDrop={(ev) => drop(ev, status)}
                  >
                    <h4>
                      <i className={status} />
                      {label}
                      <span>
                        {d.items.filter((t: any) => t.status === status).length}
                      </span>
                    </h4>
                    {d.items
                      .filter((t: any) => t.status === status)
                      .map((t: any) => taskRow(t, true))}
                    <button
                      className="column-add"
                      onClick={() => actions.task(e, { status })}
                    >
                      <Plus size={13} />
                      添加
                    </button>
                  </section>
                ))}
              </div>
            ) : (
              <div className="task-list nowheel">
                {d.items.map((t: any) => taskRow(t))}
              </div>
            )}
            <button className="add-task nodrag" onClick={() => actions.task(e)}>
              <Plus size={14} />
              添加任务
            </button>
          </>
        )}

      </div>
    </>
  );
}
