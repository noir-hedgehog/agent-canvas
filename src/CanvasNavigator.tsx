import { useMemo, useState } from "react";
import { MiniMap, useReactFlow, useViewport } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  File,
  Search,
  X,
  Maximize,
} from "lucide-react";
import type { Entity } from "../shared/model";
import {
  buildCanvasTree,
  filterCanvasTree,
  type CanvasTreeEntry,
} from "../shared/canvasTree";
import type { CanvasNodeType } from "./CanvasNode";
const kindLabels: Record<string, string> = {
  mind: "导图",
  flow: "流程",
  note: "便签",
  text: "文本",
  tasks: "任务",
  image: "图片",
  status: "状态",
  diagram: "图卡片",
  card: "卡片",
  space: "画布",
  canvas: "画布",
};
export function CanvasNavigator(props: {
  entities: Entity[];
  rootCanvasId: string;
  canvasId: string;
  selected: string[];
  zoomLocked?: boolean;
  onLocate: (entry: CanvasTreeEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set([props.rootCanvasId]));
  const flow = useReactFlow<CanvasNodeType>();
  const viewport = useViewport();
  const tree = useMemo(
    () => buildCanvasTree(props.entities, props.rootCanvasId),
    [props.entities, props.rootCanvasId],
  );
  const filtered = tree && filterCanvasTree(tree, query);
  const current = props.entities.find((e) => e.id === props.canvasId);
  function render(entry: CanvasTreeEntry, depth = 0) {
    const open = !!query.trim() || expanded.has(entry.id);
    const active =
      entry.kind === "canvas"
        ? props.canvasId === entry.id
        : props.selected.includes(entry.id) &&
          entry.canvasId === props.canvasId;
    return (
      <li key={entry.id}>
        <div
          className={`directory-row ${active ? "active" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {entry.children.length ? (
            <button
              className="directory-toggle"
              aria-label={`${open ? "收起" : "展开"}目录 ${entry.title}`}
              aria-expanded={open}
              onClick={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(entry.id)) next.delete(entry.id);
                  else next.add(entry.id);
                  return next;
                })
              }
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="directory-spacer" />
          )}
          <button
            className="directory-target"
            aria-label={`定位${entry.kind === "canvas" ? "画布" : "卡片"} ${entry.title}`}
            aria-current={active ? "location" : undefined}
            disabled={entry.broken}
            title={entry.title}
            onClick={() => props.onLocate(entry)}
          >
            {entry.kind === "canvas" ? (
              <Folder size={13} />
            ) : (
              <File size={13} />
            )}
            <span>{entry.title}</span>
            <small>
              {entry.broken
                ? "已删除"
                : entry.referenced
                  ? "引用"
                  : kindLabels[entry.kind]}
            </small>
          </button>
        </div>
        {!!entry.children.length && open && (
          <ul>{entry.children.map((e) => render(e, depth + 1))}</ul>
        )}
      </li>
    );
  }
  return (
    <section
      className="canvas-navigator nodrag nopan nowheel"
      aria-label="项目全景导航"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") props.onClose();
      }}
    >
      <header>
        <strong>项目全景</strong>
        <button aria-label="关闭全景导航" onClick={props.onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="navigator-map-title">
        <span>当前画布 · {current?.data.title}</span>
        <button
          aria-label="小地图适应画布"
          disabled={props.zoomLocked}
          onClick={() => void flow.fitView({ padding: 0.15, duration: 250 })}
        >
          <Maximize size={14} />
        </button>
      </div>
      <MiniMap<CanvasNodeType>
        className="navigation-minimap"
        style={{
          position: "relative",
          width: 280,
          height: 155,
          margin: 0,
          inset: "auto",
        }}
        ariaLabel="当前画布小地图"
        pannable
        zoomable={!props.zoomLocked}
        bgColor="#f7f6fb"
        maskColor="#e2dcef88"
        maskStrokeColor="#9779c2"
        maskStrokeWidth={2}
        nodeColor={(n) =>
          (
            ({
              note: "#f0d78d",
              mind: "#cbbce4",
              diagram: "#cbbce4",
              flow: "#a9c7e4",
              tasks: "#a9d3c2",
              image: "#e6b5cc",
            }) as Record<string, string>
          )[n.data.entity.kind] || "#d4d3de"
        }
        nodeStrokeColor={(n) => (n.selected ? "#73549e" : "#ffffff")}
        nodeStrokeWidth={2}
        onClick={(_event, pos) =>
          void flow.setCenter(pos.x, pos.y, {
            zoom: viewport.zoom,
            duration: 180,
          })
        }
        onNodeClick={(_event, node) =>
          props.onLocate({
            id: node.id,
            title: node.data.entity.data.title,
            kind: node.data.entity.kind,
            canvasId: props.canvasId,
            objectId: node.data.entity.id,
            children: [],
          })
        }
      />
      <p className="navigator-map-caption">
        紫框是当前视口 · 点击或拖动小地图移动
      </p>
      <output className="navigator-position">
        缩放 {Math.round(viewport.zoom * 100)}% · 视口左上{" "}
        {Math.round(-viewport.x / viewport.zoom)},{" "}
        {Math.round(-viewport.y / viewport.zoom)}
      </output>
      <div className="navigator-directory-title">
        <strong>卡片目录</strong>
        <small>整个项目</small>
      </div>
      <label className="directory-search">
        <Search size={14} />
        <input
          aria-label="搜索卡片目录"
          placeholder="搜索卡片或子画布…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="清空目录搜索" onClick={() => setQuery("")}>
            <X size={12} />
          </button>
        )}
      </label>
      <nav className="directory-scroll" aria-label="卡片目录">
        {filtered ? (
          <ul>{render(filtered)}</ul>
        ) : (
          <p className="panel-empty">没有匹配的卡片</p>
        )}
      </nav>
    </section>
  );
}
