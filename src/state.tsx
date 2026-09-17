import {DEMO_MODE} from "./runtime";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  type Snapshot,
  type Project,
  type Operation,
  type Change,
  type Entity,
  updateOp,
} from "../shared/model";

export async function api<T = any>(url: string, body?: unknown): Promise<T> {
  if (DEMO_MODE) return (await import("./demoApi")).demoApi(url,body);
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  }).catch(() => {
    throw new Error("本地服务连接中断，输入草稿已保留。");
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result;
}
import {allowedInReadOnly} from "./readOnly";
type State = {
  readOnly: boolean;
  snapshot: Snapshot | null;
  projects: Project[];
  canvasId: string;
  selected: string[];
  saveState: "saved" | "saving" | "failed";
  lastSyncedAt: number | null;
  pendingWrites: number;
  imagePreview: {src:string;title:string} | null;
  filePreview: {entityId:string;referenceId:string;timeSeconds?:number;inlineSource?:string} | null;
  connected: boolean;
  error: string;
  panel: "comments" | "properties" | "history" | null;
  undoStack: string[];
  redoStack: string[];
  highlight: string[];
  draftKeys: string[];
  init: (projectId?: string, canvasId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  navigate: (canvasId: string) => void;
  run: (ops: Operation[], summary: string) => Promise<Change | null>;
  patch: (
    e: Entity,
    patch: Record<string, any>,
    summary?: string,
  ) => Promise<Change | null>;
  undo: () => Promise<void>;
  settleEdits: (id: string) => Promise<void>;
  redo: () => Promise<void>;
};
export function makeStore() {
  let refreshEpoch = 0;
  let initEpoch = 0;
  const pendingRequests = new Map<string, string>();
  const patchQueues = new Map<string, Promise<Change | null>>();
  return createStore<State>((set, get) => ({
    readOnly: false,
    snapshot: null,
    projects: [],
    canvasId: "",
    selected: [],
    saveState: "saved",
    lastSyncedAt: null,
    pendingWrites: 0,
    imagePreview: null,
    filePreview: null,
    connected: true,
    error: "",
    panel: null,
    undoStack: [],
    redoStack: [],
    highlight: [],
    draftKeys: [],
    async init(projectId, canvasId) {
      const epoch = ++initEpoch;
      try {
        await api("/api/session");
        const projects = await api<Project[]>("/api/projects");
        const recent = localStorage.getItem("ac-last-project");
        const id = projectId || projects.find(p => p.id === recent)?.id || projects[0]?.id;
        if (!id) {
          set({ projects });
          return;
        }
        const snapshot = await api<Snapshot>(`/api/projects/${id}`);
        if (epoch !== initEpoch) return;
        localStorage.setItem("ac-last-project", id);
        const c = canvasId || snapshot.project.rootCanvasId;
        const valid = snapshot.entities.some(
          (e) => e.id === c && e.kind === "canvas" && !e.deleted,
        );
        set({
          projects,
          snapshot,
          lastSyncedAt: Date.now(),
          saveState: "saved",
          imagePreview:null,
          filePreview:null,
          draftKeys: Object.keys(localStorage).filter((k) =>
            k.startsWith(`ac-draft:${id}:`),
          ),
          canvasId: valid ? c : snapshot.project.rootCanvasId,
          selected: [],
          undoStack: [],
          redoStack: [],
          connected: true,
          error: valid ? "" : "原画布无法访问，已返回项目全景",
        });
      } catch (e) {
        if (epoch !== initEpoch) return;
        set({ error: (e as Error).message, connected: false });
      }
    },
    async refresh() {
      const epoch = ++refreshEpoch;
      const id = get().snapshot?.project.id;
      if (!id) return;
      try {
        const snapshot = await api<Snapshot>(`/api/projects/${id}`);
        if (get().snapshot?.project.id !== id || epoch !== refreshEpoch) return;
        const current = get();
        const newChanges = snapshot.changes.filter(
          (c) => !current.snapshot?.changes.some((old) => old.id === c.id),
        );
        const changed = newChanges
          .filter((c) => c.actor === "agent")
          .flatMap((c) => c.entries.map((e) => e.after.id));
        const currentCanvas = snapshot.entities.find(
          (e) => e.id === current.canvasId && !e.deleted,
        );
        set({
          snapshot,
          lastSyncedAt:Date.now(),
          projects:current.projects.map(p=>p.id===id?snapshot.project:p),
          connected: true,
          ...(!currentCanvas
            ? { canvasId: snapshot.project.rootCanvasId, selected: [] }
            : {}),
          ...(changed.length ? { highlight: changed } : {}),
        });
      } catch {
        set({ connected: false });
      }
    },
    navigate(canvasId) {
      set({ canvasId, selected: [], error: "" });
    },
    async run(operations, summary) {
      if (get().readOnly && !allowedInReadOnly(operations, get().snapshot?.entities || [])) {
        set({error:"当前为网页只读模式，请切回编辑模式后修改内容。"});
        return null;
      }
      const projectId = get().snapshot?.project.id;
      if (!projectId) return null;
      set(s=>({ saveState: "saving", error: "", pendingWrites:s.pendingWrites+1 }));
      const fingerprint = JSON.stringify({ projectId, summary, operations });
      const requestId = pendingRequests.get(fingerprint) || crypto.randomUUID();
      pendingRequests.set(fingerprint, requestId);
      try {
        const change = await api<Change>("/api/batch", {
          projectId,
          requestId,
          summary,
          operations,
        });
        pendingRequests.delete(fingerprint);
        await get().refresh();
        set((s) => ({
          saveState: "saved",
          undoStack: [...s.undoStack, change.id],
          redoStack: [],
        }));
        return change;
      } catch (e) {
        set({ saveState: "failed", error: (e as Error).message });
        return null;
      } finally { set(s=>({pendingWrites:Math.max(0,s.pendingWrites-1)})); }
    },
    patch(e, patch, summary = "编辑内容") {
      const save = (patchQueues.get(e.id) || Promise.resolve(null)).then(() => {
        const latest = get().snapshot?.entities.find(x => x.id === e.id);
        const disjoint = latest && latest.kind === e.kind && !latest.deleted &&
          Object.keys(patch).every(key => JSON.stringify(latest.data[key]) === JSON.stringify(e.data[key]));
        return get().run([updateOp(disjoint ? latest : e, patch)], summary);
      });
      patchQueues.set(e.id, save);
      void save.finally(() => { if (patchQueues.get(e.id) === save) patchQueues.delete(e.id); });
      return save;
    },
    async settleEdits(id) { while (patchQueues.has(id)) await patchQueues.get(id); },
    async undo() {
      if(get().readOnly)return;
      const s = get(),
        id = s.undoStack.at(-1);
      if (!id) return;
      set({ saveState: "saving" });
      try {
        const c = await api<Change>("/api/undo", {
          projectId: s.snapshot!.project.id,
          changeId: id,
          requestId: crypto.randomUUID(),
        });
        await get().refresh();
        set({
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, c.id],
          saveState: "saved",
        });
      } catch (e) {
        set({ error: (e as Error).message, saveState: "failed" });
      }
    },
    async redo() {
      if(get().readOnly)return;
      const s = get(),
        id = s.redoStack.at(-1);
      if (!id) return;
      set({ saveState: "saving" });
      try {
        const c = await api<Change>("/api/undo", {
          projectId: s.snapshot!.project.id,
          changeId: id,
          requestId: crypto.randomUUID(),
        });
        await get().refresh();
        set({
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, c.id],
          saveState: "saved",
        });
      } catch (e) {
        set({ error: (e as Error).message, saveState: "failed" });
      }
    },
  }));
}
const Context = createContext<StoreApi<State> | null>(null);
export function EditorProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useEditor<T>(selector: (s: State) => T) {
  const store = useContext(Context);
  if (!store) throw new Error("EditorProvider missing");
  return useStore(store, selector);
}
export function useEditorApi() {
  return useContext(Context)!;
}
