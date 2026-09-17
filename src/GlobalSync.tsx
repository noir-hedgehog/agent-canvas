import {DEMO_MODE} from "./runtime";
import {useState} from 'react';
import {useEditor,useEditorApi} from './state';
export function GlobalSync(){
  const s=useEditor(x=>x),store=useEditorApi();
  const [open,setOpen]=useState(false);
  const label=!s.connected?'连接中断':(s.pendingWrites>0||s.saveState==='saving')?'保存中…':s.draftKeys.length?'有未提交内容':s.saveState==='failed'?'保存失败':s.error?'操作未完成':'已保存';
  const drafts=s.draftKeys.flatMap(key=>{try{const draft=JSON.parse(localStorage.getItem(key)||'null');return draft?[{key,...draft}]:[];}catch{return [];}});
  const clear=(key:string)=>{localStorage.removeItem(key);store.setState(s=>({draftKeys:s.draftKeys.filter(k=>k!==key)}));};
  return <div className="global-sync">
    <button className={`save-indicator ${!s.connected?'offline':s.saveState}`} aria-label="全局存储状态" aria-expanded={open} onClick={()=>setOpen(!open)}><span className="sync-label-row"><i aria-hidden="true"/>{label}</span><small>上次同步 {s.lastSyncedAt?new Date(s.lastSyncedAt).toLocaleTimeString('zh-CN',{hour12:false}):'尚未同步'}</small></button>
    {open&&<div className="sync-details" role="region" aria-label="同步详情"><strong>{label}</strong><p>{s.error|| (s.draftKeys.length?'编辑中的文字会在失焦后提交；草稿保留在本机。':(DEMO_MODE?'演示修改仅保存在当前浏览器，不会上传或同步到 Agent。':'内容已同步到本地服务。'))}</p>
      {drafts.map(d=><div className="sync-draft" key={d.key}><b>{d.baseline.data.title||'无标题卡片'}</b><p>{String(d.value).slice(0,100)||'（空内容）'}</p>
        <button onClick={async()=>{const field=d.key.slice(`ac-draft:${d.baseline.projectId}:${d.baseline.id}:`.length);if(await s.patch(d.baseline,{[field]:d.value},'重试保存草稿'))clear(d.key);}}>重试保存</button>
        <button onClick={async()=>{const latest=store.getState().snapshot?.entities.find(e=>e.id===d.baseline.id);const field=d.key.slice(`ac-draft:${d.baseline.projectId}:${d.baseline.id}:`.length);if(latest && await s.patch(latest,{[field]:d.value},'使用草稿更新当前版本'))clear(d.key);}}>用草稿更新当前版本</button>
        <button onClick={()=>clear(d.key)}>采用已保存内容</button>
      </div>)}
      <button onClick={()=>void s.refresh()}>重新同步</button><button onClick={()=>setOpen(false)}>收起</button>
    </div>}
  </div>;
}
