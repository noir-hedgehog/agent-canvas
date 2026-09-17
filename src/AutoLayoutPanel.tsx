import {useEffect,useRef} from 'react';
import {X,LayoutTemplate} from 'lucide-react';
import type {LayoutMode,LayoutSpacing,LayoutPlan} from '../shared/autoLayout';
export function AutoLayoutPanel(props:{mode:LayoutMode;spacing:LayoutSpacing;plan:LayoutPlan|null;stale:boolean;busy:boolean;error:string;selectedCount:number;onMode:(mode:LayoutMode)=>void;onSpacing:(spacing:LayoutSpacing)=>void;onPreview:()=>void;onApply:()=>void;onClose:()=>void}) {
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector('select')?.focus();return()=>{previous?.focus();};},[]);
 return <section ref={panel} className="auto-layout-panel" role="dialog" aria-modal="true" aria-label="自动布局" data-picker-ignore="true" onKeyDown={event=>{
  event.stopPropagation();
  if(event.key==='Escape'&&!props.busy)props.onClose();
  if(event.key==='Tab'){
   const controls=Array.from(panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)'));
   const first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
 }}>
  <header><h3><LayoutTemplate size={17}/>自动布局</h3><button aria-label="关闭自动布局" disabled={props.busy} onClick={props.onClose}><X size={17}/></button></header>
  <p>{props.selectedCount?`仅整理选中的 ${props.selectedCount} 张卡片，避让其他卡片。`:'整理当前层的可见卡片，子画布内部保持独立。'}</p>
  <div className="auto-layout-options">
   <label>布局方式<select aria-label="布局方式" disabled={props.busy} value={props.mode} onChange={e=>props.onMode(e.target.value as LayoutMode)}><option value="smart">智能整理</option><option value="tree">树状布局</option><option value="flow">流程布局</option><option value="grid">网格布局</option></select></label>
   <label>卡片间距<select aria-label="卡片间距" disabled={props.busy} value={props.spacing} onChange={e=>props.onSpacing(e.target.value as LayoutSpacing)}><option value="compact">紧凑</option><option value="standard">标准</option><option value="loose">宽松</option></select></label>
  </div>
  <small>树状与流程向右展开；按实际卡片尺寸排列，保留内容、关系和标签。</small>
  {props.plan&&<p className="layout-preview-status" role="status">预览 · {props.plan.count} 张卡片 · {props.plan.groups} 组 · 尚未保存{props.plan.fallbacks>0?'。存在回路或多个父级，已使用分层布局。':''}</p>}
  {props.stale&&<p role="alert" className="form-error">内容或尺寸已变化，请重新预览后再应用。</p>}
  {props.error&&<p role="alert" className="form-error">{props.error}</p>}
  <footer><button disabled={props.busy} onClick={props.onClose}>取消</button><button disabled={props.busy} onClick={props.onPreview}>{props.plan?'重新预览':'预览布局'}</button><button className="primary" disabled={props.busy||!props.plan||props.stale||!props.plan.operations.length} onClick={props.onApply}>{props.busy?'处理中…':'应用布局'}</button></footer>
 </section>;
}
