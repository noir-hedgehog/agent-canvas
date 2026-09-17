import { useEffect, useRef } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { defaultPreferences, fontOptions, type Preferences } from '../shared/preferences';
import { usePreferences } from './preferences';

export function SettingsPage({ onClose, onApplyZoom, zoomLocked = false }: { onClose: () => void; onApplyZoom: (zoom: number) => void; zoomLocked?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { preferences: p, update, error } = usePreferences();
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={dialog} className="settings-page" aria-labelledby="settings-title" onCancel={onClose}>
    <div className="settings-page-inner">
      <header><button onClick={onClose} aria-label="返回画布"><ArrowLeft size={18}/>返回画布</button><span role="status">{error || '设置自动保存到当前浏览器'}</span></header>
      <h1 id="settings-title">设置</h1><p className="settings-intro">所有项目共用你的显示偏好。</p>
      <section><h2>画布</h2>
        <label className="settings-row"><span>默认缩放比例<small>首次进入画布时使用；已有视角优先保留。</small></span><select aria-label="默认缩放比例" value={p.defaultZoom} onChange={e => update({ defaultZoom: Number(e.target.value) })}>{[25,50,75,83,100,125,150,200].map(v => <option key={v} value={v}>{v}%</option>)}</select></label>
        <label className="settings-row"><span>记住画布视角<small>再次进入时恢复上次的位置和缩放。</small></span><input type="checkbox" checked={p.rememberViewport} onChange={e => update({ rememberViewport: e.target.checked })}/></label>
        <button className="settings-apply" disabled={zoomLocked} title={zoomLocked ? '请先在画布左下角解锁缩放' : undefined} onClick={() => onApplyZoom(p.defaultZoom / 100)}>将 {p.defaultZoom}% 应用到当前画布</button>
      </section>
      <section><h2>卡片文字</h2>
        <label className="settings-row"><span>字体<small>用于卡片正文与标题，优先使用本机字体。</small></span><select aria-label="字体偏好" value={p.font} onChange={e => update({ font: e.target.value as Preferences['font'] })}>{Object.entries(fontOptions).map(([v, f]) => <option key={v} value={v}>{f.label}</option>)}</select></label>
        <label className="settings-row"><span>正文字号<small>标题随正文等比例调整；立即生效。</small></span><select aria-label="字号偏好" value={p.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })}>{[10,12,14,16,18,20,24,28,32].map(v => <option key={v} value={v}>{v} px</option>)}</select></label>
        <div className="settings-preview" style={{ fontFamily: fontOptions[p.font].family, fontSize: p.fontSize }}><strong>一起把想法展开</strong><p>记录灵感，整理计划，与 Agent 共创。<br/>Ideas become a shared canvas.</p><small>字体预览 · {p.fontSize} px</small></div>
      </section>
      <footer><button onClick={() => update(defaultPreferences)}><RotateCcw size={15}/>恢复默认设置</button></footer>
    </div>
  </dialog>;
}
