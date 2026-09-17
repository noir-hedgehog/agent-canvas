import {discussionHandoffText} from "./demoHandoff";
import { useState } from "react";
import { Copy, Send } from "lucide-react";
import type { Entity, Operation } from "../shared/model";
import {
  debugDiscussionOperations,
  type ElementInspection,
} from "../shared/debugDiscussion";

type Draft = { text: string; operations?: Operation[]; requestId?: string };
export function DebugDiscussionComposer(props: {
  projectId: string;
  canvasId: string;
  inspection: ElementInspection;
  target?: Entity;
  path: string[];
  disabled: boolean;
  onSave: (
    operations: Operation[],
    requestId: string,
  ) => Promise<Entity | null>;
  onSend?: (request: Entity) => Promise<void> | void;
}) {
  const key = `ac-debug-comment:${props.projectId}:${props.canvasId}:${props.inspection.selector}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || { text: "" };
    } catch {
      return { text: "" };
    }
  });
  const [saved, setSaved] = useState<Entity | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState(false);
  function persist(value: Draft) {
    localStorage.setItem(key, JSON.stringify(value));
    setDraft(value);
  }
  return (
    <section className="debug-comment-compose">
      <h3>对这个元素加批注</h3>
      <small>
        {props.inspection.objectId
          ? "关联所选元素及卡片对象"
          : "关联所选界面元素及当前画布"}
      </small>
      <textarea
        aria-label="元素批注内容"
        placeholder="描述这里的问题，或你希望如何修改…"
        value={draft.text}
        disabled={busy || !!draft.operations}
        onChange={(e) => {
          persist({ text: e.target.value });
          setSaved(null);
          setMessage("");
          setManualCopy(false);
        }}
      />
      <button
        className="primary"
        disabled={
          busy ||
          (!draft.operations && (props.disabled || !props.target)) ||
          !draft.text.trim() ||
          !!saved
        }
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const requestId = draft.requestId || crypto.randomUUID();
            const operations =
              draft.operations ||
              debugDiscussionOperations(
                props.target!,
                props.canvasId,
                props.inspection,
                draft.text,
                requestId,
                props.path,
              );
            // Freeze the complete payload before saving so ambiguous failures can be retried safely.
            persist({ ...draft, requestId, operations });
            const request = await props.onSave(operations, requestId);
            if (!request) {
              setMessage("保存未完成，批注与元素快照已保留，请重试。");
              return;
            }
            setSaved(request);
            setDraft({ text: request.data.instruction });
            localStorage.removeItem(key);
            setMessage("已保存到批注列表，尚未发送到会话。");
          } catch (error) {
            setMessage(`保存失败：${(error as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "保存中…"
          : saved
            ? "批注已保存"
            : draft.operations
              ? "重试保存元素批注"
              : "保存元素批注"}
      </button>
      {saved && (
        <button
          className="wide-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (props.onSend) {
                await props.onSend(saved);
                setMessage("已交给宿主会话，等待 Agent 处理。");
              } else {
                await navigator.clipboard.writeText(
                  discussionHandoffText(saved),
                );
                setMessage("已复制，请粘贴到 Codex 会话发送。请求仍为待处理。");
              }
            } catch (error) {
              setMessage(
                props.onSend
                  ? `发送失败，可重试：${(error as Error).message}`
                  : "复制失败，请手动复制下方交接内容。",
              );
              if (!props.onSend) setManualCopy(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {props.onSend ? <Send size={14} /> : <Copy size={14} />}{" "}
          {props.onSend ? "发送到会话" : "复制给 Codex"}
        </button>
      )}
      {manualCopy && saved && (
        <textarea
          readOnly
          aria-label="元素批注交接内容"
          value={discussionHandoffText(saved)}
        />
      )}
      {!manualCopy && saved && (
        <details className="debug-discussion-context">
          <summary>查看交接内容</summary>
          <textarea
            readOnly
            aria-label="元素批注交接内容"
            value={discussionHandoffText(saved)}
          />
        </details>
      )}
      <p role="status">{message}</p>
      <small>
        {props.onSend
          ? "保存后可发送到宿主会话。"
          : "保存后复制到 Codex 会话；包含批注、元素快照和请求 ID。"}
      </small>
    </section>
  );
}
