import {DEMO_MODE,assetUrl} from "./runtime";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  SelectionMode,
  MarkerType,
  useReactFlow,
  type Edge,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import {
  Archive,
  LayoutTemplate,
  ArchiveRestore,
  MousePointer2,
  Hand,
  StickyNote,
  Type,
  ImagePlus,
  GitBranch,
  Workflow,
  ListTodo,
  Plus,
  Minus,
  Maximize,
  Undo2,
  Redo2,
  MessageSquare,
  History,
  Settings2,
  X,
  ChevronRight,
  ArrowUpRight,
  Link2,
  Copy,
  Trash2,
  Check,
  PanelRightClose,
  Layers,
  ArrowLeft,
  FolderPlus,
  Search,
  RefreshCw,
  CornerDownRight,
  Crosshair,
  Settings,
  LockKeyhole,
  UnlockKeyhole,
  MessagesSquare,
  MessageSquarePlus,
} from "lucide-react";
import { ElementPicker, type InteractionMode } from "./ElementPicker";
import { CanvasNavigator } from "./CanvasNavigator";
import { AgentConnection } from "./AgentConnection";
import { diagramOperations } from "../shared/diagram";
import { conversionOperations, type CardTarget } from "../shared/conversion";
import { nodeHandles, gridOperations, pointerInRectangle } from "../shared/canvasGeometry";
import {AutoLayoutPanel} from './AutoLayoutPanel';
import {createLayoutPlan,layoutSignature,type LayoutPlan,type LayoutMode,type LayoutSpacing} from '../shared/autoLayout';
import { RelationEdge } from "./RelationEdge";
import type { CanvasTreeEntry } from "../shared/canvasTree";
import { archiveOperations, isArchived, isCard, matchesArchive } from "../shared/archive";
import { discussionHandoffText } from "./demoHandoff";
import { EditorProvider, useEditor, useEditorApi, api } from "./state";
import {
  CanvasNode,
  ActionContext,
  type CanvasNodeType,
  type Actions,
} from "./CanvasNode";
import {GlobalSync} from "./GlobalSync";
import {ImagePreview} from "./ImagePreview";
import { FilePreview } from './FilePreview';
import { timeLabel, type FileReference } from '../shared/fileReferences';
import { Editable } from "./Editable";
import { DiscussionText } from "./DiscussionText";
import { SettingsPage } from './SettingsPage';
import { usePreferences } from './preferences';
import { fontOptions } from '../shared/preferences';
import { discussionStates, discussionStatusOperations, unresolvedDiscussions, discussionsHandoffText } from '../shared/discussionEdit';
import {
  type Entity,
  type Operation,
  type Project,
  createOp,
  placementOp,
  updateOp,
  linkTo,
} from "../shared/model";
import "@xyflow/react/dist/style.css";
import "./style.css";

export interface CanvasEditorProps {
  projectId?: string;
  canvasId?: string;
  objectId?: string;
  embedded?: boolean;
  onSelectionChange?: (context: {
    projectId: string;
    canvasId: string;
    objectIds: string[];
  }) => void;
  onDiscussionRequest?: (request: Entity) => void;
  onSendToConversation?: (request: Entity) => Promise<void> | void;
}
export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <EditorProvider>
      <ReactFlowProvider>
        <EditorSurface {...props} />
      </ReactFlowProvider>
    </EditorProvider>
  );
}
type Dialog = {
  title: string;
  description?: string;
  fields: {
    name: string;
    label: string;
    value?: string;
    type?: "textarea" | "select";
    options?: { value: string; label: string }[];
  }[];
  submit?: string;
  danger?: boolean;
  onDelete?: () => Promise<boolean>;
  onSubmit: (
    v: Record<string, string>,
  ) => Promise<boolean | void> | boolean | void;
};
function DialogView({
  dialog,
  onClose,
}: {
  dialog: Dialog;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(dialog.fields.map((f) => [f.name, f.value || ""])),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await dialog.onSubmit(values);
            if (result !== false) onClose();
            else
              setError(
                "保存未完成，可能存在版本冲突。输入已保留，请查看提示并重新读取最新内容。",
              );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-heading">
          <h2>{dialog.title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {dialog.description && <p>{dialog.description}</p>}
        {dialog.fields.map((f, i) => (
          <label key={f.name}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                autoFocus={i === 0}
                value={values[f.name]}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
              />
            ) : f.type === "select" ? (
              <select
                value={values[f.name]}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus={i === 0}
                value={values[f.name]}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
              />
            )}
          </label>
        ))}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <footer>
          {dialog.onDelete && (
            <button
              type="button"
              className="danger-text"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (await dialog.onDelete!()) onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              删除
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className={dialog.danger ? "danger" : "primary"}
            disabled={busy}
          >
            {busy ? "保存中…" : dialog.submit || "保存"}
          </button>
        </footer>
      </form>
    </div>
  );
}
const nodeTypes = { content: CanvasNode };
const edgeTypes = { relation: RelationEdge };
const visibleKinds = [
  "card", "space",
  "note",
  "text",
  "tasks",
  "mind",
  "flow",
  "image",
  "status",
  "diagram",
];
function EditorSurface(props: CanvasEditorProps) {
  const preferences = usePreferences(s => s.preferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lockedZoom, setLockedZoom] = useState<number | null>(null);
  const store = useEditorApi(),
    s = useEditor((x) => x),
    { snapshot, canvasId, selected } = s;
  const [nodes, setNodes] = useState<CanvasNodeType[]>([]),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [activeLine, setActiveLine] = useState<string | null>(null),
    [hand, setHand] = useState(false),
    [navigationOpen, setNavigationOpen] = useState(false),
    [archiveOpen, setArchiveOpen] = useState(false),
    [archiveHover, setArchiveHover] = useState(false),
    [showArchivedDiscussions, setShowArchivedDiscussions] = useState(false),
    [revealedBranches, setRevealedBranches] = useState<Set<string>>(
      () => new Set(),
    ),
    [mode, setMode] = useState<InteractionMode>("edit"),
    [projectMenu, setProjectMenu] = useState(false),
    [connectionOpen, setConnectionOpen] = useState(false),
    [zoom, setZoom] = useState(100),
    [comment, setComment] = useState(""),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  const flow = useReactFlow<CanvasNodeType>(),
    fileInput = useRef<HTMLInputElement>(null),
    replaceTarget = useRef<Entity | null>(null),
    dropPosition = useRef<{ x: number; y: number } | null>(null),
    archiveBin = useRef<HTMLButtonElement>(null),
    surface = useRef<HTMLDivElement>(null),
    editorRoot = useRef<HTMLDivElement>(null),
    commentInput = useRef<HTMLTextAreaElement>(null),
    lastCanvas = useRef(""),
    focusDone = useRef("");
  const [layoutOpen,setLayoutOpen]=useState(false);
  const [layoutMode,setLayoutMode]=useState<LayoutMode>('smart');
  const [layoutSpacing,setLayoutSpacing]=useState<LayoutSpacing>('standard');
  const [layoutPlan,setLayoutPlan]=useState<LayoutPlan|null>(null);
  const [layoutError,setLayoutError]=useState('');
  const [layoutBusy,setLayoutBusy]=useState(false);
  const layoutViewport=useRef<Viewport|null>(null);
  const layoutMeasurements=useRef<Map<string,{width:number;height:number}>>(new Map());
  const pendingLocation = useRef<{ id: string; canvasId: string } | null>(null);
  const entities = snapshot?.entities || [],
    live = entities.filter((e) => !e.deleted),
    byId = new Map(entities.map((e) => [e.id, e]));
  const project = snapshot?.project;
  const places = live.filter(
      (e) => e.kind === "placement" && e.canvasId === canvasId && !isArchived(byId.get(e.data.objectId)),
    ),
    chosen = places
      .filter((p) => selected.includes(p.id))
      .map((p) => byId.get(p.data.objectId))
      .filter(Boolean) as Entity[];
  const selectedEntity = chosen[0];
  const current = byId.get(canvasId);
  const crumbs: Entity[] = [];
  let cursor = current;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    crumbs.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.data.ownerNodeId
      ? byId.get(byId.get(cursor.data.ownerNodeId)?.canvasId || "")
      : undefined;
  }
  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };
  useEffect(() => { setActiveLine(null); setArchiveOpen(false); setArchiveHover(false); }, [canvasId, mode]);
  useEffect(() => { setShowArchivedDiscussions(false); }, [project?.id]);
  useEffect(() => {
    void store.getState().init(props.projectId, props.canvasId);
  }, [props.projectId]);
  useEffect(() => {
    if (
      props.canvasId &&
      snapshot?.entities.some((e) => e.id === props.canvasId && !e.deleted)
    )
      s.navigate(props.canvasId);
  }, [props.canvasId]);
  useEffect(() => {
    if (!project) return;
    if (DEMO_MODE) {
      const update=()=>void store.getState().refresh();window.addEventListener('storage',update);return()=>window.removeEventListener('storage',update);
    }
    const es = new EventSource(`/api/events?projectId=${project.id}`);
    es.addEventListener("ready", () => {
      void store.getState().refresh();
    });
    es.addEventListener("change", () => {
      void store.getState().refresh();
    });
    es.onerror = () => store.setState({ connected: false });
    return () => es.close();
  }, [project?.id]);
  useEffect(() => {
    if (project && !props.embedded)
      history.replaceState(
        null,
        "",
        DEMO_MODE ? location.pathname + linkTo(project.id, canvasId, props.objectId).slice(1) : linkTo(project.id, canvasId, props.objectId),
      );
  }, [project?.id, canvasId]);
  useEffect(() => {
    if (project)
      props.onSelectionChange?.({
        projectId: project.id,
        canvasId,
        objectIds: chosen.map((e) => e.id),
      });
  }, [selected.join(","), canvasId]);
  const hiddenMind = (e: Entity) => {
    let parent = byId.get(e.data.parentId);
    const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      if (parent.data.collapsed && !revealedBranches.has(parent.id))
        return true;
      seen.add(parent.id);
      parent = byId.get(parent.data.parentId);
    }
    return false;
  };
  useEffect(() => {
    const next: CanvasNodeType[] = places.flatMap((p) => {
      const e = byId.get(p.data.objectId);
      if (!e || !visibleKinds.includes(e.kind)) return [];
      return [
        {
          id: p.id,
          type: "content",
          position: { x: p.data.x, y: p.data.y },
          handles: nodeHandles(p.data.width, p.data.height),
          width: p.data.width,
          height: p.data.heightMode === 'fixed' ? p.data.height : undefined,
          style: { width: p.data.width, height: p.data.heightMode === 'fixed' ? p.data.height : undefined },
          selected: selected.includes(p.id),
          hidden: e.kind === "mind" && hiddenMind(e),
          data: {
            entity: e,
            placement: p,
            broken: e.deleted,
            revealed: revealedBranches.has(e.id),
            changed: s.highlight.includes(e.id),
            annotationCount: live.filter(
              (a) =>
                a.kind === "annotation" && !isArchived(a) &&
                a.data.state === "open" &&
                a.data.targets?.some((t: any) => t.id === e.id),
            ).length,
          },
        },
      ];
    });
    setNodes((previous) =>
      next.map((n) => {
        const existing = previous.find((x) => x.id === n.id);
        const merged = { ...existing, ...n };
        if (n.data.placement.data.heightMode !== 'fixed') {
          merged.handles = nodeHandles(n.data.placement.data.width, existing?.measured?.height || n.data.placement.data.height);
        }
        return existing?.dragging
          ? { ...merged, position: existing.position, dragging: true }
          : merged;
      }),
    );
    if (lastCanvas.current !== canvasId) {
      lastCanvas.current = canvasId;
      const key = `ac-view:${project?.id}:${canvasId}`;
      let saved: any;
      try {
        saved = JSON.parse(localStorage.getItem(key) || "null");
      } catch {}
      const hasExplicitLocation = pendingLocation.current?.canvasId === canvasId;
      requestAnimationFrame(() => {
        if (saved && preferences.rememberViewport) {
          void flow.setViewport({ ...saved.viewport, zoom: lockedZoom ?? saved.viewport.zoom });
          if (!hasExplicitLocation)
            store.setState({ selected: saved.selected || [] });
        } else void flow.setViewport({ x: 60, y: 45, zoom: lockedZoom ?? preferences.defaultZoom / 100 });
      });
    }
  }, [
    snapshot,
    canvasId,
    selected.join(","),
    s.highlight.join(","),
    revealedBranches,
  ]);
  useEffect(() => {
    const target = pendingLocation.current;
    if (
      !target ||
      target.canvasId !== canvasId ||
      !nodes.some((n) => n.id === target.id && !n.hidden)
    )
      return;
    pendingLocation.current = null;
    store.setState({ selected: [target.id] });
    requestAnimationFrame(
      () =>
        void flow.fitView({
          nodes: [{ id: target.id }],
          minZoom: lockedZoom ?? 0.2,
          maxZoom: lockedZoom ?? 1,
          duration: 250,
        }),
    );
  }, [nodes, canvasId]);
  useEffect(() => {
    if (!props.objectId || !snapshot || focusDone.current === props.objectId)
      return;
    if (isArchived(byId.get(props.objectId))) { focusDone.current = props.objectId; setArchiveOpen(true); return; }
    const p = places.find((p) => p.data.objectId === props.objectId);
    if (p) {
      focusDone.current = props.objectId;
      store.setState({ selected: [p.id] });
      setTimeout(
        () =>
          void flow.fitView({
            nodes: [{ id: p.id }],
            minZoom: lockedZoom ?? 0.2,
            maxZoom: lockedZoom ?? 1,
            duration: 250,
          }),
        150,
      );
    }
  }, [snapshot, canvasId, props.objectId]);
  const edges: Edge[] = useMemo(
    () =>
      live.flatMap<Edge>((e) => {
        if (e.canvasId !== canvasId || !matchesArchive(e, entities, "active")) return [];
        if (e.kind === "relation") {
          const a = byId.get(e.data.sourcePlacementId), b = byId.get(e.data.targetPlacementId);
          if (!a || !b) return [];
          const reverse = (layoutPlan?.positions[a.id]?.x ?? a.data.x) > (layoutPlan?.positions[b.id]?.x ?? b.data.x);
          return [{ id: e.id, source: reverse ? b.id : a.id, target: reverse ? a.id : b.id, sourceHandle: "out", targetHandle: "in",
            type: "relation", data: { entity: e, reverse, active: activeLine === e.id, editable: mode === "edit", onSelect: () => { setActiveLine(e.id); store.setState({selected: []}); }, onClose: () => setActiveLine(null) },
            hidden: [a, b].some(p => { const object = byId.get(p.data.objectId); return object?.kind === "mind" && hiddenMind(object); }),
            style: { stroke: "#9483b0", strokeWidth: 1.8, strokeDasharray: "5 4" },
            labelStyle: { fill: "#746387", fontSize: 12 }, labelBgStyle: { fill: "#faf7ff" } }];
        }
        const sourceId =
            e.kind === "mind"
              ? e.data.parentId
              : e.kind === "edge"
                ? e.data.source
                : null,
          targetId =
            e.kind === "mind" ? e.id : e.kind === "edge" ? e.data.target : null;
        if (!sourceId) return [];
        const source = places.find((p) => p.data.objectId === sourceId),
          target = places.find((p) => p.data.objectId === targetId);
        if (!source || !target) return [];
        return [
          {
            id: e.kind === "mind" ? "mind-edge-" + e.id : e.id,
            source: source.id,
            target: target.id,
            sourceHandle: "out",
            targetHandle: "in",
            type: e.kind === "edge" ? "relation" : "smoothstep",
            data: e.kind === "edge" ? { entity: e, reverse: false, active: activeLine === e.id, editable: mode === "edit", onSelect: () => { setActiveLine(e.id); store.setState({selected: []}); }, onClose: () => setActiveLine(null) } : undefined,
            label: e.kind === "edge" ? e.data.label : undefined,
            hidden: e.kind === "mind" && hiddenMind(e),
            style: {
              stroke: e.kind === "mind" ? "#aca5c8" : "#969bad",
              strokeWidth: 1.7,
            },
            markerEnd:
              e.kind === "edge"
                ? { type: MarkerType.ArrowClosed, color: "#969bad" }
                : undefined,
            labelStyle: { fill: "#585a69", fontSize: 12 },
            labelBgStyle: { fill: "#f8f9fb" },
          },
        ];
      }),
    [snapshot, canvasId, revealedBranches, activeLine, mode, layoutPlan],
  );
  const nodesChanged = useCallback(
    (changes: NodeChange<CanvasNodeType>[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns).map(n => ({
        ...n, handles: nodeHandles(n.measured?.width || n.data.placement.data.width, n.measured?.height || n.data.placement.data.height),
      })));
      if (mode !== "edit") return;
      // Only user selection changes write back to the editor. Mirroring
      // onSelectionChange also echoes controlled updates during navigation.
      const selectionChanges = changes.filter((change) => change.type === "select");
      if (!selectionChanges.length) return;
      const selectedIds = new Set(store.getState().selected);
      for (const change of selectionChanges) {
        if (change.selected) selectedIds.add(change.id);
        else selectedIds.delete(change.id);
      }
      store.setState({ selected: [...selectedIds] });
    },
    [store, mode],
  );
  const exitMode = useCallback(() => setMode("edit"), []);
  const pickCommentCard = useCallback(
    (placementId: string) => {
      store.setState({ selected: [placementId], panel: "comments" });
      requestAnimationFrame(() => commentInput.current?.focus());
    },
    [store],
  );
  const objectForPlacement = useCallback(
    (id: string) =>
      store.getState().snapshot?.entities.find((e) => e.id === id)?.data
        .objectId as string | undefined,
    [store],
  );
  function switchMode(next: InteractionMode) {
    const active = mode === next ? "edit" : next;
    setMode(active);
    setNavigationOpen(false);
    setHand(false);
    setProjectMenu(false);
    setSearchOpen(false);
    if (active !== "edit")
      store.setState({
        selected: [],
        panel: active === "comment" ? "comments" : null,
      });
  }
  function remember() {
    if (project && canvasId && usePreferences.getState().preferences.rememberViewport)
      localStorage.setItem(
        `ac-view:${project.id}:${canvasId}`,
        JSON.stringify({
          viewport: flow.getViewport(),
          selected: store.getState().selected,
        }),
      );
  }
  function renameProject() {
    setProjectMenu(false);
    setDialog({title:"项目改名",fields:[{name:"name",label:"项目名称",value:project!.name}],onSubmit:async v=>{
      store.setState({saveState:"saving"});
      try { await api(`/api/projects/${project!.id}/rename`,{name:v.name,expectedVersion:project!.version||1,requestId:crypto.randomUUID()}); await s.refresh();store.setState({saveState:"saved"});return true; }
      catch(error){store.setState({saveState:"failed",error:(error as Error).message});return false;}
    }});
  }
  function newProject() {
    remember();
    setProjectMenu(false);
    setDialog({
      title: "新建项目",
      description: "创建独立的空白画布，项目内容自动保存到本机，刷新或重启后仍然保留。",
      fields: [{ name: "name", label: "项目名称" }],
      submit: "创建项目",
      onSubmit: async (v) => {
        const p = await api<Project>("/api/projects", { name: v.name });
        await s.init(p.id);
      },
    });
  }
  function navigate(id: string) {
    remember();
    s.navigate(id);
  }
  function locateDirectory(entry: CanvasTreeEntry) {
    if (entry.kind === "canvas") {
      navigate(entry.canvasId);
      return;
    }
    const placement = byId.get(entry.id);
    if (!placement || placement.deleted || byId.get(entry.objectId!)?.deleted) {
      flash("这张卡片已移除，请重新选择。");
      return;
    }
    const ancestors = new Set<string>();
    let parent = byId.get(byId.get(entry.objectId!)?.data.parentId);
    while (parent && !ancestors.has(parent.id)) {
      ancestors.add(parent.id);
      parent = byId.get(parent.data.parentId);
    }
    setRevealedBranches((previous) => new Set([...previous, ...ancestors]));
    pendingLocation.current = { id: entry.id, canvasId: entry.canvasId };
    if (entry.canvasId !== canvasId) navigate(entry.canvasId);
    // Force a node pass for a same-canvas target without relying on a timer.
    setNodes((previous) => [...previous]);
  }
  const center = () => {
    const rect = surface.current?.getBoundingClientRect();
    return rect
      ? flow.screenToFlowPosition({
          x: rect.left + rect.width * 0.42,
          y: rect.top + rect.height * 0.37,
        })
      : { x: 180, y: 160 };
  };
  async function insert(kind: "card" | "note" | "text" | "tasks" | "mind" | "flow" | "status", internalNode = false) {
    const id = crypto.randomUUID(),
      pos = center(),
      ops: Operation[] = [];
    if ((kind === "mind" || kind === "flow") && !internalNode) {
      const result = await s.run(diagramOperations(canvasId, kind, id,
        kind === "mind" ? "新的思维导图" : "新的流程图", pos.x, pos.y), "添加图卡片");
      if (result) store.setState({ selected: [`${id}:placement`] });
      return;
    }
    let width = 260,
      height = 190;
    if (kind === "mind" || kind === "flow") {
      const graph =
        internalNode || kind === "flow"
          ? live.find(
              (e) =>
                e.kind === "graph" &&
                e.canvasId === canvasId &&
                e.data.graphType === kind,
            )
          : undefined;
      const graphId = graph?.id || crypto.randomUUID();
      if (!graph)
        ops.push(
          createOp(
            "graph",
            canvasId,
            {
              title: kind === "mind" ? "新的思维导图" : "新的流程图",
              graphType: kind,
            },
            graphId,
          ),
        );
      ops.push(
        createOp(
          kind,
          canvasId,
          {
            title: kind === "mind" ? "新的想法" : "新的步骤",
            body: "",
            graphId,
            ...(kind === "mind" ? { parentId: null } : { shape: "process" }),
          },
          id,
        ),
      );
      height = 130;
    } else if (kind === "tasks") {
      ops.push(
        createOp(kind, canvasId, { title: "新的任务清单", items: [] }, id),
      );
      width = 350;
      height = 320;
    } else
      ops.push(
        createOp(
          kind,
          canvasId,
          {
            title: kind === "card" ? "" : kind === "note" ? "一个新想法" : kind === "status" ? "工作状态" : "新的文本",
            body: "",
            ...(kind === "note" ? { color: "yellow" } : {}),
            ...(kind === "status" ? { state: "待开始", resultUrl: "" } : {}),
          },
          id,
        ),
      );
    const placement = placementOp(
      canvasId,
      id,
      pos.x,
      pos.y,
      width,
      height,
      kind === "tasks" ? "list" : undefined,
    );
    ops.push(placement);
    const result = await s.run(
      ops,
      "添加" +
        {
          card: "空白卡片",
          note: "便签",
          text: "文本",
          tasks: "任务清单",
          mind: "思维导图",
          flow: "流程图",
          status: "状态卡片",
        }[kind],
    );
    if (result) store.setState({ selected: [placement.id] });
  }
  function editRelation(source: Entity, target?: Entity, relation?: Entity) {
    if (relation) { setActiveLine(relation.id); store.setState({selected: []}); return; }
    const create = async (targetPlacementId: string) => {
      const op = createOp("relation", canvasId, {sourcePlacementId: source.id, targetPlacementId, label: "", direction: "none", lineStyle: "association"});
      const result = await s.run([op], "关联卡片");
      if (result) { setActiveLine(op.id); store.setState({selected: []}); }
      return !!result;
    };
    if (target) { void create(target.id); return; }
    const candidates = places.filter(p => p.id !== source.id && !byId.get(p.data.objectId)?.deleted);
    if (!candidates.length) { flash("先添加另一张卡片，再建立关联"); return; }
    setDialog({ title: "关联卡片", description: "选好卡片后，在线上选择样式、填写标签。",
      fields: [{ name: "targetPlacementId", label: "关联到", type: "select", value: candidates[0].id,
        options: candidates.map(p => ({value:p.id, label:byId.get(p.data.objectId)?.data.title || "无标题卡片"})) }],
      onSubmit: v => create(v.targetPlacementId),
    });
  }
  async function convertCard(e: Entity, target: CardTarget, extra: Record<string, any> = {}) {
    await s.settleEdits(e.id);
    if (store.getState().draftKeys.some(key => key.startsWith(`ac-draft:${project!.id}:${e.id}:`))) {
      flash("文字尚未保存，请先处理保存提示，再转换卡片"); return;
    }
    const latest = store.getState().snapshot?.entities.find(x => x.id === e.id);
    if (!latest || latest.deleted) return;
    if (target === "image" && !extra.assetId && !latest.data.assetId) {
      replaceTarget.current = latest; fileInput.current?.click(); return;
    }
    await s.run(conversionOperations(latest, target, crypto.randomUUID(), extra), "转换卡片类型");
  }
  async function upload(file: File, replace?: Entity) {
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      for (const byte of new Uint8Array(buffer))
        binary += String.fromCharCode(byte);
      const asset = await api<Entity>("/api/assets", {
        projectId: project!.id,
        name: file.name,
        base64: btoa(binary),
      });
      if (replace) {
        await s.settleEdits(replace.id);
        const latest = store.getState().snapshot?.entities.find(e => e.id === replace.id);
        if (latest && !latest.deleted) await s.patch(latest, {imageIds:[...new Set([...(latest.data.imageIds || []), asset.id])]}, "添加卡片图片");
        return;
      }
      const id = crypto.randomUUID(),
        pos = dropPosition.current || center();
      dropPosition.current = null;
      const p = placementOp(canvasId, id, pos.x, pos.y, 320, 260);
      await s.run(
        [
          createOp(
            "card",
            canvasId,
            { title: file.name, body: "", imageIds: [asset.id] },
            id,
          ),
          p,
        ],
        "添加图片",
      );
      store.setState({ selected: [p.id] });
    } catch (e) {
      store.setState({ error: (e as Error).message });
    }
  }
  function referenceFile(entity?: Entity, replaceId?: string) {
    const requestId = crypto.randomUUID();
    const pos = center();
    setMode('edit');
    setDialog({title:replaceId?'重新关联文件':'引用文件',description:'输入本地绝对路径、工作区相对路径或 HTTP(S) 文件直链。仅保存引用；移动原文件后需要重新关联。',fields:[{name:'source',label:'文件路径或链接'}],submit:'添加引用',onSubmit:async values=>{
      const reference=await api<FileReference>(`/api/projects/${project!.id}/files`,{source:values.source,requestId});
      const latest=entity?store.getState().snapshot?.entities.find(e=>e.id===entity.id&&!e.deleted):undefined;
      if(entity&&!latest)throw new Error('原卡片已删除');
      const ops:Operation[]=latest?[updateOp(latest,{fileReferenceIds:[...new Set([...(latest.data.fileReferenceIds||[]).filter((id:string)=>id!==replaceId),reference.id])]})]:[
        createOp('card',canvasId,{title:reference.name,body:'',fileReferenceIds:[reference.id]},`${requestId}:card`),
        placementOp(canvasId,`${requestId}:card`,pos.x,pos.y,320,150,undefined,`${requestId}:placement`),
      ];
      const result=await s.run(ops,replaceId?'重新关联文件':'引用文件');
      if(result&&!latest)store.setState({selected:[`${requestId}:placement`]});
      return !!result;
    }});
  }
  const actions: Actions = {
    referenceFile,
    deleteCard: deleteSelection,
    uploadImages: async (e, files) => { for (const file of files) await upload(file, e); },
    convert: (e, target) => { void convertCard(e, target); },
    relate: (placement) => editRelation(placement),
    clearReveal(id) {
      setRevealedBranches((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    },
    async enter(e) {
      if (e.data.childCanvasId) {
        navigate(e.data.childCanvasId);
        return;
      }
      const id = crypto.randomUUID();
      const c = await s.run(
        [
          createOp(
            "canvas",
            null,
            { title: e.data.title, ownerNodeId: e.id },
            id,
          ),
          updateOp(e, { childCanvasId: id }),
        ],
        "展开节点工作空间",
      );
      if (c) navigate(id);
    },
    async branch(e, sibling) {
      const id = crypto.randomUUID(),
        source = places.find((p) => p.data.objectId === e.id)!;
      const parentId = sibling ? e.data.parentId : e.id;
      const siblings = live.filter(
        (x) =>
          x.kind === "mind" &&
          x.data.graphId === e.data.graphId &&
          x.data.parentId === parentId,
      );
      const x = sibling ? source.data.x : source.data.x + 330,
        y = sibling
          ? source.data.y + 160
          : source.data.y + siblings.length * 155;
      const node = createOp(
          e.kind,
          canvasId,
          {
            title: e.kind === "mind" ? "新的想法" : "下一步",
            body: "",
            graphId: e.data.graphId,
            ...(e.kind === "mind" ? { parentId } : { shape: "process" }),
          },
          id,
        ),
        p = placementOp(canvasId, id, x, y, 240, 130);
      const ops = [node, p];
      if (e.kind === "flow")
        ops.push(
          createOp("edge", canvasId, {
            graphId: e.data.graphId,
            source: e.id,
            target: id,
            label: "",
          }),
        );
      if (e.data.collapsed) ops.push(updateOp(e, { collapsed: false }));
      if (await s.run(ops, "添加图节点")) store.setState({ selected: [p.id] });
    },
    task(e, item) {
      setDialog({
        title: item?.id ? "编辑任务" : "添加任务",
        onDelete: item?.id
          ? async () => {
              const latest = e;
              return !!(await s.patch(
                latest,
                {
                  items: latest.data.items.filter((t: any) => t.id !== item.id),
                },
                "删除任务",
              ));
            }
          : undefined,
        fields: [
          { name: "title", label: "任务名称", value: item?.title || "" },
          {
            name: "description",
            label: "描述",
            type: "textarea",
            value: item?.description || "",
          },
          {
            name: "status",
            label: "状态",
            type: "select",
            value: item?.status || "todo",
            options: [
              { value: "todo", label: "待办" },
              { value: "doing", label: "进行中" },
              { value: "done", label: "已完成" },
            ],
          },
        ],
        onSubmit: async (v) => {
          if (!v.title.trim()) throw new Error("请输入任务名称");
          const latest = e;
          const task = { id: item?.id || crypto.randomUUID(), ...v };
          return !!(await s.patch(
            latest,
            {
              items: item?.id
                ? latest.data.items.map((t: any) =>
                    t.id === item.id ? { ...t, ...task } : t,
                  )
                : [...latest.data.items, task],
            },
            item?.id ? "编辑任务" : "添加任务",
          ));
        },
      });
    },
    async toTask(e) {
      const collection = live.find(
          (x) => x.kind === "tasks" && x.canvasId === canvasId,
        ),
        item = {
          id: crypto.randomUUID(),
          title: e.data.title,
          description: e.data.body || "",
          status: "todo",
          sourceId: e.id,
        };
      if (collection)
        await s.patch(
          collection,
          { items: [...collection.data.items, item] },
          "从想法生成任务",
        );
      else {
        const id = crypto.randomUUID(),
          pos = center();
        await s.run(
          [
            createOp(
              "tasks",
              canvasId,
              { title: "从想法到行动", items: [item] },
              id,
            ),
            placementOp(canvasId, id, pos.x + 280, pos.y, 350, 320, "list"),
          ],
          "从想法生成任务",
        );
      }
      flash("已保留来源，并添加到任务清单");
    },
    replaceImage(e) {
      replaceTarget.current = e;
      fileInput.current?.click();
    },
    focus(e) {
      if (isArchived(e)) { setArchiveOpen(true); if (e.canvasId && e.canvasId !== canvasId) { navigate(e.canvasId); setTimeout(() => setArchiveOpen(true), 0); } flash("此卡片已归档，可在收纳箱恢复后定位。"); return; }
      if (e.canvasId !== canvasId) navigate(e.canvasId!);
      setTimeout(() => {
        const p = store
          .getState()
          .snapshot?.entities.find(
            (x) =>
              !x.deleted &&
              x.kind === "placement" &&
              x.canvasId === e.canvasId &&
              x.data.objectId === e.id,
          );
        if (p) {
          store.setState({ selected: [p.id] });
          void flow.fitView({
            nodes: [{ id: p.id }],
            minZoom: lockedZoom ?? 0.2,
            maxZoom: lockedZoom ?? 1,
            duration: 300,
          });
        }
      }, 120);
    },
  };
  function overArchiveBin(event: MouseEvent | TouchEvent) {
    const bin = archiveBin.current?.getBoundingClientRect();
    return !!bin && pointerInRectangle(event,bin);
  }
  async function changeArchive(ids: string[], archived: boolean) {
    try {
      for (const id of ids) await store.getState().settleEdits(id);
      if (archived && store.getState().draftKeys.some(key => ids.some(id => key.startsWith(`ac-draft:${project!.id}:${id}:`)))) { flash("卡片还有未同步文字，请先在全局存储状态中处理后再归档。"); return; }
      const latest = store.getState().snapshot?.entities || [];
      const result = await store.getState().run(archiveOperations(latest, ids, archived), archived ? '归档内容' : '恢复归档内容');
      if (result) { if (archived) store.setState({selected:store.getState().selected.filter(id => !result.entries.some(e => e.after.id === byId.get(id)?.data.objectId))}); flash(archived ? '已归档，可在收纳箱或归档批注中恢复。' : '已恢复，原内容和布局已保留。'); }
    } catch (error) { flash((error as Error).message); }
  }
  function deleteSelection() {
    if (!chosen.length) return;
    const owns = [
      ...new Map(
        chosen.filter((e) => e.canvasId === canvasId).map((e) => [e.id, e]),
      ).values(),
    ];
    const targets = new Set(owns.map((e) => e.id));
    let previous = -1;
    while (targets.size !== previous) {
      previous = targets.size;
      for (const e of live)
        if (
          targets.has(e.canvasId || "") ||
          targets.has(e.data.ownerNodeId) ||
          targets.has(e.data.parentId) ||
          targets.has(e.data.graphId)
        )
          targets.add(e.id);
    }
    const nested = live.filter(
      (e) => e.kind === "canvas" && targets.has(e.id),
    ).length;
    setDialog({
      title: "删除选中的内容",
      description: `将删除 ${chosen.length} 项内容${nested ? `及其 ${nested} 个子画布` : "或引用展示"}。可以在变更记录中撤销；其他画布中的引用将标记为失效。`,
      fields: [],
      submit: "删除",
      danger: true,
      onSubmit: async () => {
        await Promise.all(owns.map(e=>s.settleEdits(e.id)));
        const latest = new Map(store.getState().snapshot!.entities.map(e=>[e.id,e]));
        const ops: Operation[] = owns.map((old) => { const e=latest.get(old.id)!; return ({
          op: "delete",
          id: e.id,
          expectedVersion: e.version,
        }); });
        for (const p of places.filter((p) => selected.includes(p.id)))
          ops.push({ op: "delete", id: p.id, expectedVersion: p.version });
        const ok = !!(await s.run(ops, "删除画布内容"));
        if (ok) store.setState({ selected: [] });
        return ok;
      },
    });
  }
  function addReference() {
    const collections = live.filter(
      (e) => e.kind === "tasks" && e.canvasId !== canvasId,
    );
    if (!collections.length) {
      flash("其他画布还没有任务集合");
      return;
    }
    setDialog({
      title: "引用任务集合",
      description: "任务内容保持同步，当前画布的摆放位置独立保存。",
      fields: [
        {
          name: "id",
          label: "选择任务集合",
          type: "select",
          value: collections[0].id,
          options: collections.map((e) => ({
            value: e.id,
            label:
              e.data.title +
              " · " +
              (byId.get(e.canvasId!)?.data.title || "画布"),
          })),
        },
      ],
      submit: "添加引用",
      onSubmit: async (v) => {
        const pos = center();
        return !!(await s.run(
          [placementOp(canvasId, v.id, pos.x, pos.y, 350, 320, "list")],
          "引用任务集合",
        ));
      },
    });
  }
  const layoutStale=!!layoutPlan && (layoutPlan.canvasId!==canvasId || layoutPlan.signature!==layoutSignature(entities,canvasId) || nodes.some(n=>{
    const original=layoutMeasurements.current.get(n.id);
    return original && (Math.abs(original.width-(n.measured?.width||n.data.placement.data.width))>1 || Math.abs(original.height-(n.measured?.height||n.data.placement.data.height))>1);
  }));
  function clearLayoutPreview(restoreViewport=true) {
    setLayoutPlan(null);setLayoutError('');
    if(restoreViewport&&layoutViewport.current)void flow.setViewport(layoutViewport.current);
  }
  function closeLayout() {
    if(layoutBusy)return;
    clearLayoutPreview();setLayoutOpen(false);layoutViewport.current=null;
  }
  async function previewLayout() {
    setLayoutBusy(true);setLayoutError('');
    try {
      for(const e of chosen)await store.getState().settleEdits(e.id);
      if(store.getState().pendingWrites||store.getState().draftKeys.length)throw new Error('请先保存未提交的修改，再预览布局');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      const latest=store.getState();
      if(latest.canvasId!==canvasId||latest.snapshot?.project.id!==project?.id)return;
      const measured=flow.getNodes().map(n=>({id:n.id,width:n.measured?.width||n.data.placement.data.width,height:n.measured?.height||n.data.placement.data.height,hidden:n.hidden}));
      layoutMeasurements.current=new Map(measured.map(n=>[n.id,n]));
      const plan=createLayoutPlan(latest.snapshot!.entities,canvasId,latest.selected,measured,layoutMode,layoutSpacing);
      setLayoutPlan(plan);
      if(!plan.operations.length)setLayoutError('卡片已处于该布局，无需保存。');
    } catch(error){setLayoutError((error as Error).message);}
    finally{setLayoutBusy(false);}
  }
  async function applyLayout() {
    if(!layoutPlan||layoutStale||layoutBusy)return;
    if(layoutPlan.signature!==layoutSignature(store.getState().snapshot?.entities||[],canvasId)){setLayoutError('内容已变化，请重新预览。');return;}
    setLayoutBusy(true);
    const result=await store.getState().run(layoutPlan.operations,'自动布局');
    setLayoutBusy(false);
    if(result){setLayoutPlan(null);setLayoutOpen(false);layoutViewport.current=null;flash('已应用布局，可以一次撤销。');}
    else setLayoutError(store.getState().error||'保存失败，请重新预览后重试');
  }
  useEffect(()=>{
    setLayoutPlan(null);setLayoutOpen(false);layoutViewport.current=null;
  },[canvasId,project?.id]);
  useEffect(()=>{
    if(!layoutPlan)return;
    const frame=requestAnimationFrame(()=>{void flow.fitView({nodes:Object.keys(layoutPlan.positions).map(id=>({id})),padding:.3,minZoom:lockedZoom??.1,maxZoom:lockedZoom??1});});
    return()=>cancelAnimationFrame(frame);
  },[layoutPlan]);
  function layoutGraph() {
    const ops = gridOperations(places, selected);
    if (ops.length) void s.run(ops, "卡片对齐网格");
    else flash(places.length ? "卡片已对齐网格" : "先添加卡片，再对齐网格");
  }
  async function submitComment() {
    if (!comment.trim() || !chosen.length) return;
    const id = crypto.randomUUID(),
      requestId = crypto.randomUUID();
    const targets = chosen.map((e) => ({
      id: e.id,
      version: e.version,
      canvasId: e.canvasId,
      title: e.data.title,
      content: e.data,
    }));
    const instruction = comment.trim();
    const request = createOp(
      "request",
      canvasId,
      {
        annotationId: id,
        targets,
        instruction,
        state: "pending",
        replies: [],
        path: crumbs.map((c) => c.data.title),
      },
      requestId,
    );
    const result = await s.run(
      [
        createOp(
          "annotation",
          canvasId,
          { targets, body: instruction, state: "open", replies: [] },
          id,
        ),
        request,
      ],
      "创建批注与讨论请求",
    );
    if (result) {
      setComment("");
      localStorage.removeItem(`ac-comment:${project!.id}:${canvasId}`);
      props.onDiscussionRequest?.(
        result.entries.find((e) => e.after.id === requestId)!.after,
      );
      flash("已保存到待处理队列");
    }
  }
  async function copyRequest(e: Entity) {
    await copyHandoff(discussionHandoffText(e));
  }
  async function copyHandoff(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(DEMO_MODE ? "已复制演示批注文本，未连接 Agent" : "已复制，请粘贴到 Codex 会话");
    } catch {
      setDialog({
        title: "复制交接指令",
        fields: [
          { name: "text", label: "请手动复制", type: "textarea", value: text },
        ],
        submit: "完成",
        onSubmit: () => true,
      });
    }
  }
  useEffect(() => {
    setComment(
      localStorage.getItem(`ac-comment:${project?.id}:${canvasId}`) || "",
    );
  }, [canvasId]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if(layoutOpen){if(e.key==="Escape"){e.preventDefault();closeLayout();}return;}
      if(store.getState().imagePreview || store.getState().filePreview || settingsOpen)return;
      if (e.key === "Escape" && archiveOpen) { setArchiveOpen(false); return; }
      if (e.key === "Escape" && navigationOpen) {
        setNavigationOpen(false);
        return;
      }
      if (e.key === "Escape" && mode !== "edit") {
        setMode("edit");
        return;
      }
      if (mode === "debug") return;
      if (
        dialog ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName,
        ) ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        void (e.shiftKey ? s.redo() : s.undo());
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "Escape") {
        setMode("edit");
        store.setState({ selected: [], panel: null });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [selected.join(","), snapshot, dialog, mode, navigationOpen, archiveOpen, settingsOpen, layoutOpen, layoutBusy]);
  if (!snapshot)
    return (
      <div className="loading-screen">
        <div className="brand-symbol">
          a<span>↗</span>
        </div>
        <h2>AgentCanvas</h2>
        <p>{s.error || "正在展开你的工作空间…"}</p>
        {s.error && (
          <button
            className="primary"
            onClick={() => void s.init(props.projectId, props.canvasId)}
          >
            重新连接
          </button>
        )}
      </div>
    );
  const discussions = live.filter((e) => e.kind === "request" && isArchived(e) === showArchivedDiscussions).reverse();
  const archivedCards = live.filter(e => isCard(e) && isArchived(e) && (e.canvasId === canvasId || live.some(p => p.kind === "placement" && p.canvasId === canvasId && p.data.objectId === e.id)));
  const unresolved = unresolvedDiscussions(live);
  return (
    <div
      ref={editorRoot}
      style={{ '--card-font-family': fontOptions[preferences.font].family, '--card-font-size': `${preferences.fontSize}px`, '--card-font-scale': preferences.fontSize / 14 } as CSSProperties}
      className={`agentcanvas mode-${mode} ${props.embedded ? "embedded" : ""}`}
      onPointerDownCapture={event => { if(activeLine && !(event.target as Element).closest('.relation-inline, .react-flow__edge')) setActiveLine(null); }}
    >
      <header className="app-header">
        <div className="brand-symbol">
          a<span>↗</span>
        </div>
        <div className="project-picker">
          <button
            className="project-name"
            onClick={() => setProjectMenu(!projectMenu)}
          >
            <span className="project-name-text">{project!.name}</span>
            <ChevronRight
              size={14}
              className={projectMenu ? "rotate-down" : ""}
            />
          </button>
          <div className="project-subtitle">
            {project!.example ? (
              <span className="example-label">示例项目</span>
            ) : (
              <span>{DEMO_MODE ? "浏览器演示" : "本地工作区"}</span>
            )}
            <span>人与 Agent 的共同工作平面</span>
          </div>
          {projectMenu && (
            <div className="project-menu">
              {s.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    remember();
                    void s.init(p.id);
                    setProjectMenu(false);
                  }}
                >
                  <Layers size={15} />
                  {p.name}
                  {p.id === project!.id && <Check size={14} />}
                </button>
              ))}
              <hr />
              <button onClick={renameProject}>项目改名</button>
              <button onClick={newProject}>
                <FolderPlus size={15} />
                新建空白项目
              </button>
            </div>
          )}
        </div>
        <div className="header-space" />
        <GlobalSync/>
        <button className="connect-agent-button" onClick={() => { setMode("edit"); setConnectionOpen(true); }}>连接 Agent</button>
        <div
          className="interaction-modes"
          role="group"
          aria-label="交互模式"
          data-picker-ignore="true"
        >
          <button
            aria-label="批注模式"
            title="批注模式"
            aria-pressed={mode === "comment"}
            onClick={() => switchMode("comment")}
          >
            <MessageSquarePlus size={18} />
          </button>
          <button
            aria-label="调试模式"
            title="调试模式"
            aria-pressed={mode === "debug"}
            onClick={() => switchMode("debug")}
          >
            <Crosshair size={18} />
          </button>
        </div>
        <button
          className={`header-icon ${s.panel === "history" ? "active" : ""}`}
          aria-label="变更记录"
          disabled={mode === "debug"}
          onClick={() =>
            store.setState({ panel: s.panel === "history" ? null : "history" })
          }
        >
          <History size={18} />
        </button>
        <button
          className={`header-icon ${s.panel === "properties" ? "active" : ""}`}
          aria-label="对象属性"
          disabled={mode === "debug"}
          onClick={() =>
            store.setState({
              panel: s.panel === "properties" ? null : "properties",
            })
          }
        >
          <Settings2 size={18} />
        </button>
        <button
          className={`header-icon ${s.panel === 'comments' ? 'active' : ''}`}
          aria-label="批注列表"
          title={`批注列表 · ${unresolved.length} 条未解决`}
          aria-pressed={s.panel === 'comments'}
          disabled={mode === "debug"}
          onClick={() =>
            store.setState({
              panel: s.panel === "comments" ? null : "comments",
            })
          }
        >
          <MessagesSquare size={18} />
        </button>
        <button className="header-icon" aria-label="设置" title="设置" onClick={() => { setMode('edit'); setSettingsOpen(true); }}><Settings size={18}/></button>
        <div className="avatar">我</div>
      </header>
      {layoutOpen&&<><div className="auto-layout-shield" data-picker-ignore="true"/>
        <AutoLayoutPanel mode={layoutMode} spacing={layoutSpacing} plan={layoutPlan} stale={layoutStale} busy={layoutBusy} error={layoutError} selectedCount={selected.length}
          onMode={value=>{clearLayoutPreview();setLayoutMode(value);}} onSpacing={value=>{clearLayoutPreview();setLayoutSpacing(value);}}
          onPreview={()=>void previewLayout()} onApply={()=>void applyLayout()} onClose={closeLayout}/></>}
      {settingsOpen && <SettingsPage zoomLocked={lockedZoom !== null} onClose={() => setSettingsOpen(false)} onApplyZoom={async zoom => { if (lockedZoom !== null) return; await flow.zoomTo(zoom); remember(); setSettingsOpen(false); }} />}
      <div className="workspace">
        <main
          className="canvas-main"
          ref={surface}
          onPointerDownCapture={(e) => {
            if (
              navigationOpen &&
              !(e.target as Element).closest(
                ".canvas-navigator, .overview-trigger",
              )
            )
              setNavigationOpen(false);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (mode !== "edit") {
              e.preventDefault();
              return;
            }
            if (e.dataTransfer.files.length) {
              e.preventDefault();
              dropPosition.current = flow.screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
              });
              for (const file of e.dataTransfer.files) void upload(file);
            }
          }}
        >
          <div className="canvas-topbar">
            <nav className="breadcrumbs" aria-label="画布路径">
              <button className="overview-trigger" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(!navigationOpen)}><Layers size={14} />项目导航</button>
              {crumbs.map((c, i) => <span key={c.id}>
                <ChevronRight size={13} />
                <button className={i === crumbs.length - 1 ? "current" : ""} aria-current={i === crumbs.length - 1 ? "page" : undefined} onClick={() => navigate(c.id)}>{i === 0 ? "主画布" : c.data.title || "未命名画布"}</button>
              </span>)}
            </nav>
            <div className="canvas-top-actions">
              {byId.get(current?.data.ownerNodeId)?.kind === "diagram" && <button onClick={() => void insert(byId.get(current?.data.ownerNodeId)!.data.diagramType, true)}><Plus size={14} />添加内部节点</button>}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="查找内容"
              >
                <Search size={16} />
              </button>
              <button aria-label="自动布局" onClick={()=>{setMode('edit');setActiveLine(null);setNavigationOpen(false);setArchiveOpen(false);setLayoutError('');layoutViewport.current=flow.getViewport();setLayoutOpen(true);}}><LayoutTemplate size={14}/>自动布局</button>
              <button onClick={layoutGraph} title="选中时对齐所选卡片，未选中时对齐本层全部卡片">
                <GitBranch size={14} />
                对齐网格
              </button>

            </div>
          </div>
          {navigationOpen && (
            <CanvasNavigator
              key={project!.id}
              entities={entities.filter(e => matchesArchive(e, entities, "active"))}
              rootCanvasId={project!.rootCanvasId}
              canvasId={canvasId}
              selected={selected}
              zoomLocked={lockedZoom !== null}
              onLocate={locateDirectory}
              onClose={() => setNavigationOpen(false)}
            />
          )}
          {searchOpen && (
            <div className="search-panel">
              <input
                autoFocus
                placeholder="查找项目里的内容…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {live.filter(e => !isArchived(e))
                .filter(
                  (e) =>
                    visibleKinds.includes(e.kind) &&
                    e.data.title?.includes(search),
                )
                .slice(0, 12)
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      actions.focus(e);
                      setSearchOpen(false);
                    }}
                  >
                    <span>{e.data.title}</span>
                    <small>{byId.get(e.canvasId!)?.data.title}</small>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
            </div>
          )}
          <ActionContext.Provider value={actions}>
            <ReactFlow<CanvasNodeType>
              nodes={layoutPlan ? nodes.map(n=>layoutPlan.positions[n.id]?{...n,position:layoutPlan.positions[n.id],draggable:false,selectable:false}:n) : nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={nodesChanged}
              onNodeDrag={(event) => setArchiveHover(overArchiveBin(event))}
              onNodeDragStop={(event, _node, dragged) => {
                const archive = overArchiveBin(event);
                setArchiveHover(false);
                if (archive) {
                  // Keep stored geometry: dropping in the bin changes only archive state.
                  setNodes(ns => ns.map(n => ({...n, dragging:false, position:{x:n.data.placement.data.x,y:n.data.placement.data.y}})));
                  void changeArchive([...new Set(dragged.map(n => n.data.entity.id))], true);
                  return;
                }
                const ops = dragged.map(n => updateOp(n.data.placement, {x:n.position.x,y:n.position.y}));
                if (ops.length) void s.run(ops, "移动画布内容");
              }}
              onMove={(_event, v) => setZoom(Math.round(v.zoom * 100))}
              onMoveEnd={remember}
              onConnect={(connection) => {
                const a = nodes.find((n) => n.id === connection.source)?.data
                    .entity,
                  b = nodes.find((n) => n.id === connection.target)?.data
                    .entity;
                if (!a || !b || !connection.source || !connection.target) return;
                if (connection.source === connection.target) { flash("请选择另一张卡片"); return; }
                if (a.kind !== "flow" || b.kind !== "flow" || a.data.graphId !== b.data.graphId) {
                  editRelation(byId.get(connection.source)!, byId.get(connection.target)!);
                  return;
                }
                void s.run(
                  [
                    createOp("edge", canvasId, {
                      graphId: a.data.graphId,
                      source: a.id,
                      target: b.id,
                      label: "",
                    }),
                  ],
                  "连接流程节点",
                );
              }}
              onEdgeClick={(_ev, edge) => {
                if (mode === "edit" && byId.has(edge.id)) { setActiveLine(edge.id); store.setState({selected: []}); }
              }}
              onPaneClick={() => setActiveLine(null)}
              onNodeClick={() => setActiveLine(null)}
              minZoom={lockedZoom ?? 0.2}
              maxZoom={lockedZoom ?? 2}
              zoomOnScroll={lockedZoom === null}
              zoomOnPinch={lockedZoom === null}
              zoomOnDoubleClick={lockedZoom === null}
              panOnScroll={lockedZoom !== null}
              nodesDraggable={mode === "edit"}
              nodesConnectable={mode === "edit"}
              elementsSelectable={mode === "edit"}
              panOnDrag={hand ? [0, 1, 2] : [1, 2]}
              selectionOnDrag={mode === "edit" && !hand}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={null}
              multiSelectionKeyCode="Shift"
              panActivationKeyCode="Space"
              fitView={false}
              defaultViewport={{ x: 60, y: 45, zoom: preferences.defaultZoom / 100 }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.25}
                color="#d8d9e1"
              />
              {!places.length && (
                <div className="empty-canvas">
                  <div>
                    <Layers size={30} />
                  </div>
                  <h2>一个新的空间，一种新的可能。</h2>
                  <p>
                    先创建空白卡片，写下想法，再选择合适的类型。
                    <br />
                    这里的内容可以和 Agent 一起慢慢展开。
                  </p>
                  <button
                    className="primary"
                    onClick={() => void insert("card")}
                  >
                    <Plus size={16} />
                    创建空白卡片
                  </button>
                </div>
              )}
            </ReactFlow>
          </ActionContext.Provider>
          <div className="canvas-bottom-left">
            <button
              aria-label="撤销"
              disabled={!s.undoStack.length}
              onClick={() => void s.undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="重做"
              disabled={!s.redoStack.length}
              onClick={() => void s.redo()}
            >
              <Redo2 size={17} />
            </button>
            <span />
            <button aria-label="缩小" disabled={lockedZoom !== null} onClick={() => void flow.zoomOut()}>
              <Minus size={15} />
            </button>
            <button className="zoom-label" aria-label="重置缩放为100%" disabled={lockedZoom !== null} onClick={() => void flow.zoomTo(1)}>
              {zoom}%
            </button>
            <button className="zoom-lock" aria-label={lockedZoom === null ? '锁定缩放' : '解锁缩放'} title={lockedZoom === null ? '锁定当前缩放比例' : '缩放已锁定，点击解锁'} aria-pressed={lockedZoom !== null} onClick={() => {
              const viewport = flow.getViewport();
              void flow.setViewport(viewport);
              setLockedZoom(lockedZoom === null ? viewport.zoom : null);
            }}>{lockedZoom === null ? <UnlockKeyhole size={15}/> : <LockKeyhole size={15}/>}</button>
            <button aria-label="放大" disabled={lockedZoom !== null} onClick={() => void flow.zoomIn()}>
              <Plus size={15} />
            </button>
            <button
              aria-label="适应画布"
              disabled={lockedZoom !== null}
              onClick={() =>
                void flow.fitView({ padding: 0.15, duration: 250 })
              }
            >
              <Maximize size={15} />
            </button>
          </div>
          <div className="insert-toolbar" role="toolbar" aria-label="画布工具">
            <Tool
              icon={<MousePointer2 />}
              label="选择"
              active={!hand && mode === "edit"}
              onClick={() => {
                setMode("edit");
                setHand(false);
              }}
            />
            <Tool
              icon={<Hand />}
              label="拖动画布"
              active={hand}
              onClick={() => {
                setMode("edit");
                setHand(true);
              }}
            />
            <i />
            <Tool icon={<Plus />} label="空白卡片" onClick={() => void insert("card")} />
            <Tool icon={<Link2 />} label="引用文件" onClick={() => referenceFile()} />
            <Tool
              icon={<StickyNote />}
              label="便签"
              onClick={() => void insert("note")}
            />
            <Tool
              icon={<Type />}
              label="文本"
              onClick={() => void insert("text")}
            />
            <Tool
              icon={<ImagePlus />}
              label="添加图片"
              onClick={() => {
                replaceTarget.current = selectedEntity || null;
                fileInput.current?.click();
              }}
            />
            <i />
            <Tool
              icon={<GitBranch />}
              label="思维导图"
              onClick={() => void insert("mind")}
            />
            <Tool
              icon={<Workflow />}
              label="流程图"
              onClick={() => void insert("flow")}
            />
            <Tool
              icon={<ListTodo />}
              label="任务卡片（Todo / Kanban）"
              onClick={() => void insert("tasks")}
            />

          </div>
          <button ref={archiveBin} data-picker-ignore="true" className={`canvas-archive-bin ${archiveHover ? 'drag-over' : ''}`} aria-label="卡片收纳箱" title="拖动时将鼠标移入收纳箱后松手归档；点击查看并恢复。共享卡片的所有引用视图同步归档。" aria-expanded={archiveOpen} onClick={() => setArchiveOpen(!archiveOpen)}><Archive size={22}/>{archivedCards.length > 0 && <span>{archivedCards.length}</span>}</button>
          {archiveOpen && <section data-picker-ignore="true" className="canvas-archive-panel" aria-label="已归档卡片">
            <header><strong>收纳箱 · 当前画布</strong><button aria-label="关闭收纳箱" onClick={() => setArchiveOpen(false)}><X size={16}/></button></header>
            <small>归档保留内容、连线和子画布；恢复回到原位置。</small>
            {chosen.length > 0 && <button onClick={() => void changeArchive([...new Set(chosen.map(e => e.id))], true)} disabled={s.saveState === "saving"}>归档所选 {chosen.length} 张卡片</button>}
            {!archivedCards.length && <p>将卡片拖到右下角收纳箱，即可归档。</p>}
            {archivedCards.map(e => <article key={e.id}><div><strong>{e.data.title || '未命名卡片'}</strong><small>{e.data.childCanvasId ? '含子画布 · ' : ''}已归档</small></div><button aria-label={`恢复卡片：${e.data.title || '未命名卡片'}`} title="恢复到原位置" disabled={s.saveState === 'saving'} onClick={() => void changeArchive([e.id],false)}><ArchiveRestore size={17}/></button></article>)}
          </section>}
          <div className="canvas-footnote">
            {mode === "comment"
              ? "批注模式 · 点击卡片创建批注 · Esc 退出"
              : mode === "debug"
                ? "调试模式 · 悬停检查 div，点击锁定 · Esc 退出"
                : selected.length
                  ? `${selected.length} 项已选择 · Shift 多选`
                  : "空格拖动 · 滚轮缩放 · 框选后批注"}
          </div>
        </main>
        <ElementPicker
          key={`${project!.id}:${canvasId}:${mode}`}
          root={editorRoot}
          mode={mode}
          projectId={project!.id}
          canvasId={canvasId}
          onPickCard={pickCommentCard}
          onExit={exitMode}
          objectForPlacement={objectForPlacement}
          path={crumbs.map((c) => c.data.title)}
          discussionTarget={(id) => {
            const target = byId.get(id || canvasId);
            return target?.deleted ? undefined : target;
          }}
          onSaveDiscussion={async (operations, requestId) => {
            // Reloaded drafts may refer to a request whose save succeeded before disconnecting.
            const existing = store
              .getState()
              .snapshot?.entities.find((e) => e.id === requestId && !e.deleted);
            if (existing) return existing;
            const result = await store
              .getState()
              .run(operations, "创建元素调试批注与讨论请求");
            if (!result) return null;
            const request = result.entries.find(
              (e) => e.after.id === requestId,
            )!.after;
            try {
              props.onDiscussionRequest?.(request);
            } catch {
              flash("批注已保存，宿主通知失败；可在批注列表继续交接。");
            }
            return request;
          }}
          onSendToConversation={props.onSendToConversation}
        />
        {s.panel && (
          <aside className="side-panel">
            <header>
              <div>
                <small>共同推进</small>
                <h2>
                  {
                    {
                      comments: "批注与讨论",
                      properties: "内容与关系",
                      history: "变更记录",
                    }[s.panel]
                  }
                </h2>
              </div>
              <button
                aria-label="收起侧栏"
                onClick={() => store.setState({ panel: null })}
              >
                <PanelRightClose size={18} />
              </button>
            </header>
            <div className="panel-scroll">
              {s.panel === "comments" && (
                <>
                  <div className="comment-compose">
                    <div className="selection-caption">
                      <span className="tiny-dot" />
                      {chosen.length
                        ? `已引用 ${chosen.length} 项内容`
                        : "选择画布内容，开始一次讨论"}
                    </div>
                    {chosen.map((e) => (
                      <span key={e.id} className="reference-chip">
                        {e.data.title}
                      </span>
                    ))}
                    <textarea
                      ref={commentInput}
                      aria-label="批注内容"
                      placeholder="你希望继续讨论或修改什么？"
                      value={comment}
                      onChange={(e) => {
                        setComment(e.target.value);
                        localStorage.setItem(
                          `ac-comment:${project!.id}:${canvasId}`,
                          e.target.value,
                        );
                      }}
                    />
                    <button
                      className="primary"
                      disabled={!chosen.length || !comment.trim()}
                      onClick={() => void submitComment()}
                    >
                      保存讨论请求
                      <ArrowUpRight size={14} />
                    </button>
                    <small>保存后复制指令到 Codex，由 Agent 读取并处理。</small>
                  </div>
                  <div className="panel-section-title">
                    项目讨论 <span>{discussions.length}</span>
                    <button aria-label={showArchivedDiscussions ? '返回未归档批注' : '查看已归档批注'} title={showArchivedDiscussions ? '返回未归档批注' : '查看已归档批注'} aria-pressed={showArchivedDiscussions} onClick={() => setShowArchivedDiscussions(v => !v)}><Archive size={15}/></button>
                    <button className="copy-unresolved" aria-label="复制全部未解决批注" title={`复制全部未解决批注（${unresolved.length} 条）`} disabled={!unresolved.length} onClick={() => void copyHandoff(DEMO_MODE ? unresolved.map(discussionHandoffText).join("\n\n---\n\n") : discussionsHandoffText(unresolved))}><Copy size={15}/></button>
                  </div>
                  {showArchivedDiscussions && <p className="archive-list-label">已归档批注 · 处理状态保留，可随时恢复</p>}
                  {discussions.length === 0 && (
                    <div className="panel-empty">
                      <MessageSquare size={26} />
                      <p>{showArchivedDiscussions ? "暂无归档批注" : "一个批注，就是下一步的起点。"}</p>
                    </div>
                  )}
                  {discussions.map((r) => {
                    const a = byId.get(r.data.annotationId);
                    return (
                      <article className="discussion-card" key={r.id}>
                        <div className="discussion-top">
                          <span className="mini-avatar">我</span>
                          <strong>
                            {r.data.source === "element"
                              ? "元素调试批注"
                              : r.data.source === 'file' ? '文件批注' : "画布批注"}
                          </strong>
                          <select aria-label="批注状态" title="切换批注状态" className={`request-state ${a?.data.state === 'resolved' ? 'resolved' : r.data.state}`} value={a?.data.state === 'resolved' ? 'resolved' : r.data.state} disabled={!a || a.deleted || s.saveState === 'saving'} onChange={ev => a && void s.run(discussionStatusOperations(r, a, ev.target.value as keyof typeof discussionStates), '切换批注状态')}>
                            {Object.entries(discussionStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <button className="discussion-archive" aria-label={isArchived(r) ? '恢复批注' : '归档批注'} title={isArchived(r) ? '恢复批注' : '归档批注'} disabled={s.saveState === 'saving'} onClick={event => { if (event.currentTarget.closest("article")?.querySelector(".discussion-edit")) { flash("请先保存或取消正在编辑的批注，再归档。"); return; } void changeArchive([r.id],!isArchived(r)); }}>{isArchived(r) ? <ArchiveRestore size={15}/> : <Archive size={15}/>}</button>
                        </div>
                        <div className="discussion-targets">
                          {r.data.targets.map((t: any) => (
                            <button
                              key={t.id}
                              onClick={() => {
                                const e = byId.get(t.id);
                                if (e && !e.deleted) actions.focus(e);
                              }}
                            >
                              <CornerDownRight size={12} />
                              {byId.get(t.id)?.deleted
                                ? "原对象已删除"
                                : t.title}
                            </button>
                          ))}
                        </div>
                        <DiscussionText request={r} annotation={a} onCopy={() => void copyRequest(r)} />
                        {r.data.mediaContext && <div className="discussion-file-context"><button title="打开引用文件" onClick={()=>{const target=r.data.targets.find((t:any)=>r.data.mediaContext.inlineSource ? byId.has(t.id)&&!byId.get(t.id)?.deleted : byId.get(t.id)?.data.fileReferenceIds?.includes(r.data.mediaContext.reference.id));if(target)store.setState({filePreview:{entityId:target.id,referenceId:r.data.mediaContext.reference.id,timeSeconds:r.data.mediaContext.timeSeconds,inlineSource:r.data.mediaContext.inlineSource}});else flash('文件已从原卡片移除；批注截图仍保留。');}}><Link2 size={13}/>{r.data.mediaContext.reference.name}{r.data.mediaContext.timeSeconds!==undefined?` · ${timeLabel(r.data.mediaContext.timeSeconds)}`:''}</button>{r.data.mediaContext.screenshotAssetId&&<button className="discussion-screenshot" aria-label="预览批注截图" onClick={()=>store.setState({imagePreview:{src:assetUrl(project!.id,r.data.mediaContext.screenshotAssetId),title:'批注截图'}})}><img src={assetUrl(project!.id,r.data.mediaContext.screenshotAssetId)} alt="批注截图"/></button>}</div>}
                        {r.data.debugContext && (
                          <details className="debug-discussion-context">
                            <summary>查看元素快照</summary>
                            <p>
                              此选择器相对于批注时的编辑器根元素；界面更新后需重新核对。
                            </p>
                            <pre>
                              {JSON.stringify(r.data.debugContext, null, 2)}
                            </pre>
                          </details>
                        )}
                        {r.data.replies?.map((reply: any, i: number) => (
                          <div className="agent-reply" key={i}>
                            <strong>Agent</strong>
                            <p>{reply.body}</p>
                          </div>
                        ))}
                        {r.data.state === "processing" && (
                          <small>处理状态不代表 Agent 实时连接。</small>
                        )}
                        {props.onSendToConversation && <footer>
                          {props.onSendToConversation && (
                            <button
                              onClick={async () => {
                                try {
                                  await props.onSendToConversation!(r);
                                  flash("已交给宿主会话，等待 Agent 处理。");
                                } catch (error) {
                                  flash(
                                    `发送失败，可重试：${(error as Error).message}`,
                                  );
                                }
                              }}
                            >
                              <ArrowUpRight size={13} />
                              发送到会话
                            </button>
                          )}
                        </footer>}
                      </article>
                    );
                  })}
                </>
              )}
              {s.panel === "properties" &&
                (!selectedEntity ? (
                  <div className="panel-empty">
                    <MousePointer2 size={26} />
                    <p>选择一个对象，查看它的内容与关系。</p>
                  </div>
                ) : (
                  <>
                    <div className="property-label">标题</div>
                    <Editable
                      entity={selectedEntity}
                      field="title"
                      multiline={false}
                      className="property-input"
                    />
                    {selectedEntity.kind !== "tasks" && (
                      <>
                        <div className="property-label">说明</div>
                        <Editable
                          entity={selectedEntity}
                          className="property-body"
                        />
                      </>
                    )}
                    <div className="property-meta">
                      <span>内容版本</span>
                      <strong>v{selectedEntity.version}</strong>
                      <span>所属画布</span>
                      <button onClick={() => actions.focus(selectedEntity)}>
                        {byId.get(selectedEntity.canvasId!)?.data.title}
                      </button>
                    </div>
                    {selectedEntity.kind === "flow" && (
                      <label className="property-label">
                        节点形状
                        <select
                          value={selectedEntity.data.shape}
                          onChange={(e) =>
                            void s.patch(
                              selectedEntity,
                              { shape: e.target.value },
                              "调整流程节点形状",
                            )
                          }
                        >
                          <option value="process">处理</option>
                          <option value="decision">判断</option>
                          <option value="terminal">开始 / 结束</option>
                        </select>
                      </label>
                    )}
                    {selectedEntity.kind === "mind" && (
                      <label className="property-label">
                        父节点
                        <select
                          value={selectedEntity.data.parentId || ""}
                          onChange={(e) =>
                            void s.patch(
                              selectedEntity,
                              { parentId: e.target.value || null },
                              "调整导图层级",
                            )
                          }
                        >
                          <option value="">作为根节点</option>
                          {live
                            .filter(
                              (e) =>
                                e.kind === "mind" &&
                                e.id !== selectedEntity.id &&
                                e.data.graphId === selectedEntity.data.graphId,
                            )
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.data.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {["mind", "flow", "diagram"].includes(selectedEntity.kind) && (
                      <button
                        className="wide-secondary"
                        onClick={() => actions.enter(selectedEntity)}
                      >
                        <Layers size={16} />
                        进入子画布
                        <ArrowUpRight size={14} />
                      </button>
                    )}

                    {live.filter(e => e.kind === "relation" && e.canvasId === canvasId && [e.data.sourcePlacementId, e.data.targetPlacementId].includes(selected[0])).map(e => {
                      const otherId = e.data.sourcePlacementId === selected[0] ? e.data.targetPlacementId : e.data.sourcePlacementId;
                      const other = byId.get(byId.get(otherId)?.data.objectId);
                      return <button key={e.id} className="wide-secondary relation-property" onClick={() => editRelation(byId.get(e.data.sourcePlacementId)!, byId.get(e.data.targetPlacementId)!, e)}><Link2 size={14} />{e.data.label || "关联"} · {other?.data.title || "卡片"}</button>;
                    })}
                    {selectedEntity.kind === "status" && <label className="property-label">当前状态<Editable entity={selectedEntity} field="state" multiline={false} /></label>}
                    <button
                      className="wide-secondary"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(
                            location.origin +
                              linkTo(
                                project!.id,
                                selectedEntity.canvasId!,
                                selectedEntity.id,
                              ),
                          )
                          .then(() => flash("已复制内容链接"));
                      }}
                    >
                      <Link2 size={16} />
                      复制内容链接
                    </button>
                    <button
                      className="wide-secondary danger-text"
                      onClick={deleteSelection}
                    >
                      <Trash2 size={16} />
                      删除选中内容
                    </button>
                  </>
                ))}
              {s.panel === "history" && (
                <>
                  <p className="panel-description">
                    人和 Agent 的修改都保存在这里。撤销会保留完整记录。
                  </p>
                  {snapshot.changes.map((c) => (
                    <article className="change-card" key={c.id}>
                      <div className="change-icon">
                        {c.actor === "agent" ? "a↗" : "我"}
                      </div>
                      <div>
                        <strong>{c.summary}</strong>
                        <small>
                          {c.actor === "agent"
                            ? "Agent"
                            : c.actor === "system"
                              ? "示例初始化"
                              : "你"}{" "}
                          ·{" "}
                          {new Date(c.createdAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {c.entries.length} 项变更
                        </small>
                        <button
                          onClick={async () => {
                            try {
                              const result = await api("/api/undo", {
                                projectId: project!.id,
                                changeId: c.id,
                                requestId: crypto.randomUUID(),
                              });
                              await s.refresh();
                              store.setState({
                                redoStack: [...s.redoStack, result.id],
                              });
                              flash("已撤销此批修改");
                            } catch (e) {
                              store.setState({ error: (e as Error).message });
                            }
                          }}
                        >
                          <Undo2 size={12} />
                          撤销这次修改
                        </button>
                      </div>
                    </article>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f, replaceTarget.current || undefined);
          e.target.value = "";
        }}
      />
      {dialog && <DialogView dialog={dialog} onClose={() => setDialog(null)} />}
      <ImagePreview/>
      <FilePreview onRelink={referenceFile}/>
      {connectionOpen && project && <AgentConnection key={project.id} project={project} onClose={() => setConnectionOpen(false)} />}
    </div>
  );
}
function Tool({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "active" : ""}
      aria-label={label}
      aria-pressed={!!active}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
