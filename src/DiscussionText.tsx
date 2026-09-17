import { useState } from 'react';
import { Pencil, Copy } from 'lucide-react';
import type { Entity } from '../shared/model';
import { discussionEditOperations } from '../shared/discussionEdit';
import { useEditor } from './state';

export function DiscussionText({ request, annotation, onCopy }: { request: Entity; annotation?: Entity; onCopy: () => void }) {
  const run = useEditor(s => s.run);
  const [draft, setDraft] = useState<{ request: Entity; annotation: Entity; body: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const changed = draft && (draft.request.version !== request.version || draft.annotation.version !== annotation?.version);
  async function save() {
    if (!draft || !draft.body.trim() || changed) return;
    setSaving(true);
    const result = await run(discussionEditOperations(draft.request, draft.annotation, draft.body), '编辑批注');
    setSaving(false);
    if (result) { setDraft(undefined); setError(''); }
    else setError('保存失败，文字已保留，请重试。');
  }
  if (!draft) return <div className="discussion-text"><p>{request.data.instruction}</p><div className="discussion-icon-actions">{annotation && !annotation.deleted && <button aria-label="编辑批注" title="编辑批注" onClick={() => { setError(''); setDraft({ request, annotation, body: request.data.instruction }); }}><Pencil size={15}/></button>}<button aria-label="复制给 Codex" title="复制给 Codex" onClick={onCopy}><Copy size={15}/></button></div></div>;
  return <div className="discussion-edit">
    <textarea aria-label="编辑批注内容" autoFocus value={draft.body} disabled={saving} onChange={e => setDraft({ ...draft, body: e.target.value })} />
    <small>保存后重新标记为待处理，保留历史回复。</small>
    {changed && <div role="alert"><p>批注或回复已更新。草稿已保留，请核对最新内容后继续。</p><p>最新批注：{request.data.instruction}</p><button disabled={saving} onClick={() => annotation && setDraft({ ...draft, request, annotation })}>已核对，继续编辑</button></div>}
    {error && <p role="alert">{error}</p>}
    <div><button disabled={saving || !draft.body.trim() || draft.body.trim() === draft.request.data.instruction || !!changed} onClick={() => void save()}>{saving ? '保存中…' : '保存批注'}</button><button disabled={saving} onClick={() => { setDraft(undefined); setError(''); }}>取消</button></div>
  </div>;
}
