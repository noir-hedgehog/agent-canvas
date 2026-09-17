import { useEffect, useState, type RefObject } from "react";
import { Copy, Crosshair, CornerUpLeft, X } from "lucide-react";
import { DebugDiscussionComposer } from "./DebugDiscussionComposer";
import type { ElementInspection } from "../shared/debugDiscussion";
import type { Entity, Operation } from "../shared/model";

export type InteractionMode = "edit" | "comment" | "debug";
type Props = {
  root: RefObject<HTMLDivElement | null>;
  mode: InteractionMode;
  projectId: string;
  canvasId: string;
  onPickCard: (placementId: string) => void;
  onExit: () => void;
  objectForPlacement: (id: string) => string | undefined;
  discussionTarget?: (objectId?: string) => Entity | undefined;
  path?: string[];
  onSaveDiscussion: (
    operations: Operation[],
    requestId: string,
  ) => Promise<Entity | null>;
  onSendToConversation?: (request: Entity) => Promise<void> | void;
};
type Inspection = ElementInspection;

// A selector is scoped to this editor instance, including in embedded hosts.
function selectorFor(element: Element, root: Element): string {
  const parts: string[] = [];
  let anchored = false;
  let current: Element | null = element;
  while (current && current !== root) {
    let part = current.tagName.toLowerCase();
    const nodeId = current.getAttribute("data-id");
    if (nodeId) {
      parts.unshift(`${part}[data-id="${CSS.escape(nodeId)}"]`);
      anchored = true;
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (sibling) => sibling.tagName === current!.tagName,
      );
      if (siblings.length > 1)
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return anchored
    ? `:scope ${parts.join(" > ")}`
    : [":scope", ...parts].join(" > ");
}

function childDivs(element: Element): HTMLElement[] {
  return Array.from(element.children).flatMap((child) => {
    if (child.hasAttribute("data-picker-ignore")) return [];
    return child instanceof HTMLDivElement ? [child] : childDivs(child);
  });
}

export function ElementPicker(props: Props) {
  const { root, mode, onPickCard, onExit } = props;
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const [picked, setPicked] = useState<HTMLElement | null>(null);
  const [info, setInfo] = useState<Inspection | null>(null);
  const [box, setBox] = useState<Inspection["rect"] | null>(null);
  const [copyState, setCopyState] = useState("");
  const [repick, setRepick] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const container = root.current;
    if (!container || mode === "edit") return;
    const resolve = (event: Event) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest("[data-picker-ignore]")
      )
        return null;
      if (mode === "debug") {
        const div = target.closest("div");
        return div && container.contains(div) ? div : null;
      }
      return target.closest<HTMLElement>(".react-flow__node");
    };
    const move = (event: Event) =>
      setHovered(mode === "debug" && !repick ? null : resolve(event));
    const leave = () => setHovered(null);
    const block = (event: Event) => {
      const element = resolve(event);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.type !== "click") return;
      if (mode === "debug" && !repick) return;
      if (mode === "comment") {
        const id = element.getAttribute("data-id");
        if (id) onPickCard(id);
      } else {
        setPicked(element);
        setHovered(null);
        setRepick(false);
        setCopyState("");
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onExit();
      } else if (
        mode === "debug" &&
        !(event.target as Element)?.closest?.("[data-picker-ignore]")
      ) {
        // Inspecting must never trigger canvas deletion or undo shortcuts.
        event.stopImmediatePropagation();
        if (event.key !== "Tab") event.preventDefault();
      }
    };
    const wheel = (event: WheelEvent) => {
      if (mode === "debug" && resolve(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const events = [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "dragstart",
    ];
    container.addEventListener("pointermove", move, true);
    container.addEventListener("pointerleave", leave);
    events.forEach((name) => container.addEventListener(name, block, true));
    container.addEventListener("keydown", keyboard, true);
    container.addEventListener("wheel", wheel, {
      capture: true,
      passive: false,
    });
    return () => {
      container.removeEventListener("pointermove", move, true);
      container.removeEventListener("pointerleave", leave);
      events.forEach((name) =>
        container.removeEventListener(name, block, true),
      );
      container.removeEventListener("keydown", keyboard, true);
      container.removeEventListener("wheel", wheel, true);
    };
  }, [root, mode, repick, onPickCard, onExit]);

  useEffect(() => {
    const target = hovered || picked;
    const container = root.current;
    if (!target || !container) {
      setBox(null);
      return;
    }
    const update = () => {
      if (!target.isConnected || !container.contains(target)) {
        setBox(null);
        setMissing(true);
        return;
      }
      setMissing(false);
      const bounds = target.getBoundingClientRect();
      const rect = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      setBox(rect);
      if (target === picked) {
        const css = getComputedStyle(target);
        const placementId =
          target.closest(".react-flow__node")?.getAttribute("data-id") ||
          undefined;
        setInfo({
          selector: selectorFor(target, container),
          tag: target.tagName.toLowerCase(),
          classes: target.className,
          rect,
          placementId,
          objectId: placementId
            ? props.objectForPlacement(placementId)
            : undefined,
          styles: Object.fromEntries(
            [
              "display",
              "position",
              "width",
              "height",
              "padding",
              "margin",
              "gap",
              "color",
              "background-color",
              "font-size",
              "border-radius",
              "overflow",
              "transform",
              "z-index",
            ].map((name) => [name, css.getPropertyValue(name)]),
          ),
        });
      }
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(target);
    const mutation = new MutationObserver(() => {
      if (!target.isConnected) {
        setBox(null);
        setMissing(true);
      }
    });
    mutation.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [hovered, picked, root, props.objectForPlacement]);

  if (mode === "edit") return null;
  const active = hovered || picked;
  const pick = (element: HTMLElement) => {
    setPicked(element);
    setHovered(null);
    setRepick(false);
    setCopyState("");
  };
  const parent = picked?.parentElement?.closest("div");
  return (
    <>
      {box && !missing && (
        <div
          className={`element-highlight ${mode === "comment" ? "comment-highlight" : ""}`}
          aria-hidden="true"
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
          }}
        >
          <span style={{ top: box.y < 32 ? 2 : -27 }}>
            {mode === "comment"
              ? "点击卡片创建批注"
              : `${active?.tagName.toLowerCase()} · ${Math.round(box.width)} × ${Math.round(box.height)}`}
          </span>
        </div>
      )}
      {mode === "debug" && (
        <aside
          className="side-panel debug-panel"
          data-picker-ignore="true"
          aria-label="元素调试面板"
        >
          <header>
            <div>
              <small>调试模式</small>
              <h2>检查界面元素</h2>
            </div>
            <button aria-label="退出调试模式" onClick={onExit}>
              <X size={18} />
            </button>
          </header>
          <div className="panel-scroll">
            <p className="panel-description">
              {repick
                ? "悬停高亮 div，点击锁定。Esc 退出。"
                : "已锁定元素，可查看父级与子级，或重新选择。"}
            </p>
            <button
              className="secondary debug-repick"
              aria-pressed={repick}
              onClick={() => {
                setRepick(true);
                setHovered(null);
              }}
            >
              <Crosshair size={16} />
              重新选择元素
            </button>
            {missing && (
              <p role="status" className="form-error">
                该元素已移除，请重新选择。
              </p>
            )}
            {info && (
              <>
                <DebugDiscussionComposer
                  key={info.selector}
                  projectId={props.projectId}
                  canvasId={props.canvasId}
                  inspection={info}
                  target={props.discussionTarget?.(info.objectId)}
                  path={props.path || []}
                  disabled={missing || repick}
                  onSave={props.onSaveDiscussion}
                  onSend={props.onSendToConversation}
                />
                <div className="debug-section">
                  <h3>定位</h3>
                  <code>{info.selector}</code>
                  <small>选择器相对于当前 CanvasEditor 根元素</small>
                  <dl>
                    <dt>标签</dt>
                    <dd>{info.tag}</dd>
                    <dt>class</dt>
                    <dd>{info.classes || "（无）"}</dd>
                    <dt>屏幕尺寸</dt>
                    <dd>
                      {Math.round(info.rect.width)} ×{" "}
                      {Math.round(info.rect.height)} px
                    </dd>
                    <dt>屏幕位置</dt>
                    <dd>
                      {Math.round(info.rect.x)}, {Math.round(info.rect.y)}
                    </dd>
                    {info.objectId && (
                      <>
                        <dt>内容对象</dt>
                        <dd>{info.objectId}</dd>
                        <dt>展示实例</dt>
                        <dd>{info.placementId}</dd>
                      </>
                    )}
                  </dl>
                </div>
                <div className="debug-section">
                  <h3>元素层级</h3>
                  <button
                    disabled={
                      !parent || !root.current?.contains(parent) || missing
                    }
                    onClick={() => parent && pick(parent)}
                  >
                    <CornerUpLeft size={14} />
                    选择父级 div
                  </button>
                  <div className="debug-children">
                    {!missing &&
                      picked &&
                      childDivs(picked).map((e, i) => (
                        <button key={i} onClick={() => pick(e as HTMLElement)}>
                          div
                          {e.classList.length
                            ? `.${Array.from(e.classList).join(".")}`
                            : ` · 子级 ${i + 1}`}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="debug-section">
                  <h3>计算样式</h3>
                  <dl>
                    {Object.entries(info.styles).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <button
                  className="primary"
                  disabled={missing}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        JSON.stringify(
                          {
                            projectId: props.projectId,
                            canvasId: props.canvasId,
                            ...info,
                          },
                          null,
                          2,
                        ),
                      );
                      setCopyState("已复制，可粘贴给 Agent");
                    } catch {
                      setCopyState("复制失败，请选择面板中的信息手动复制");
                    }
                  }}
                >
                  <Copy size={15} />
                  复制调试信息
                </button>
                <p role="status" className="panel-description">
                  {copyState}
                </p>
              </>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
