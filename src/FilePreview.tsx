import {fileUrl,assetUrl} from "./runtime";
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Camera, X, RefreshCw, Link2, Copy } from 'lucide-react';
import { api, useEditor, useEditorApi } from './state';
import { createOp, type Entity, type Operation } from '../shared/model';
import { timeLabel, type FileReference, type MediaContext, type MediaMark } from '../shared/fileReferences';
import { discussionHandoffText } from './demoHandoff';
const MarkdownContent = lazy(() => import('./MarkdownContent').then(m => ({default:m.MarkdownContent})));
type Shot = { url: string; width: number; height: number; capturedAt: string; timeSeconds?: number; reference: FileReference };

export function FilePreview({ onRelink }: { onRelink: (entity: Entity, id: string) => void }) {
  const value = useEditor(s => s.filePreview);
  return value ? <FilePreviewDialog key={`${value.entityId}:${value.referenceId}`} value={value} onRelink={onRelink}/> : null;
}
function FilePreviewDialog({ value, onRelink }: { value: {entityId:string;referenceId:string;timeSeconds?:number;inlineSource?:string}; onRelink:(entity:Entity,id:string)=>void }) {
  const store = useEditorApi(), entities = useEditor(s => s.snapshot?.entities || []);
  const entity = entities.find(e => e.id === value.entityId);
  const projectId = entity?.projectId || '';
  const dialog = useRef<HTMLDialogElement>(null), image = useRef<HTMLImageElement>(null), video = useRef<HTMLVideoElement>(null);
  const [reference,setReference] = useState<FileReference>(), [markdown,setMarkdown] = useState(''), [error,setError] = useState('');
  const [loading,setLoading] = useState(true), [reload,setReload] = useState(0), [shot,setShot] = useState<Shot>();
  const [marks,setMarks] = useState<MediaMark[]>([]), [drawing,setDrawing] = useState<MediaMark>(), start = useRef<{x:number;y:number} | undefined>(undefined);
  const [body,setBody] = useState(''), [busy,setBusy] = useState(false), [saved,setSaved] = useState<Entity>();
  const [copyError,setCopyError] = useState(''), attempt = useRef<{key:string;operations:Operation[]} | undefined>(undefined);
  const close = () => { if (!busy) store.setState({filePreview:null}); };
  useEffect(() => { const d=dialog.current!; const previous=document.activeElement as HTMLElement|null; d.showModal(); return()=>{video.current?.pause();d.close();previous?.focus();}; }, []);
  useEffect(() => {
    let active=true; const controller=new AbortController(); setLoading(true);setError('');setReference(undefined);
    api<FileReference>(`/api/projects/${projectId}/files/${value.referenceId}`).then(async r=>{
      if(!active)return;setReference(r);
      if(r.mediaType==='markdown') {
        const response=await fetch(r.remote?r.source:fileUrl(projectId,r.id),{signal:controller.signal});
        if(!response.ok)throw new Error('Markdown 文件读取失败');
        const text=await response.text();if(text.length>2*1024*1024)throw new Error('Markdown 超过 2 MB，无法预览');
        if(active)setMarkdown(text);
      }
      if(active)setLoading(false);
    }).catch(e=>{if(active){setError(e.message);setLoading(false);}});
    return()=>{active=false;controller.abort();};
  },[projectId,value.referenceId,reload]);
  const src = reference ? reference.remote ? reference.source : fileUrl(projectId,reference.id) : '';
  const discussions = entities.filter(e=>!e.deleted && e.kind==='request' && !e.data.archived && e.data.mediaContext?.reference?.id===value.referenceId);
  function capture() {
    if(!reference)return;
    setError('');video.current?.pause();
    const media = reference.mediaType==='video' ? video.current : image.current;
    const w=media instanceof HTMLVideoElement?media.videoWidth:(media as HTMLImageElement)?.naturalWidth;
    const h=media instanceof HTMLVideoElement?media.videoHeight:(media as HTMLImageElement)?.naturalHeight;
    if(!media||!w||!h){setError('请等待画面加载完成，再截图');return;}
    try {
      const scale=Math.min(1,1600/w,1600/h), canvas=document.createElement('canvas');
      canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(media,0,0,canvas.width,canvas.height);
      setShot({url:canvas.toDataURL('image/jpeg',.9),width:canvas.width,height:canvas.height,capturedAt:new Date().toISOString(),timeSeconds:reference.mediaType==='video'?video.current!.currentTime:undefined,reference:{...reference}});
      setMarks([]);setDrawing(undefined);setSaved(undefined);attempt.current=undefined;
    } catch { setError('此外部文件不允许跨域截图。请改用本地文件引用，或使用允许跨域访问的直链。'); }
  }
  function point(e:React.PointerEvent<HTMLDivElement>) {const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
  async function save() {
    if(!reference||!entity||!body.trim()||busy)return;
    if(reference.mediaType!=='markdown'&&!shot){setError('请先截取需要批注的画面');return;}
    setBusy(true);setError('');
    try {
      const key=JSON.stringify({body,shot:shot?.url,marks,time:shot?.timeSeconds});
      if(!attempt.current || attempt.current.key!==key) {
        let screenshotAssetId: string | undefined;
        if(shot) {
          const bitmap=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new window.Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=shot.url;});
          const canvas=document.createElement('canvas');canvas.width=shot.width;canvas.height=shot.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);
          ctx.strokeStyle='#e64b54';ctx.lineWidth=3;
          for(const m of marks)ctx.strokeRect(m.x*shot.width,m.y*shot.height,m.width*shot.width,m.height*shot.height);
          const asset=await api<Entity>('/api/assets',{projectId,name:`${reference.name} · 批注截图.jpg`,base64:canvas.toDataURL('image/jpeg',.9).split(',')[1]});
          screenshotAssetId=asset.id;
        }
        const target=store.getState().snapshot?.entities.find(e=>e.id===entity.id&&!e.deleted);
        if(!target)throw new Error('原卡片已删除，请重新关联后批注');
        const id=crypto.randomUUID();
        const mediaContext:MediaContext={inlineSource:value.inlineSource,reference:shot?.reference||reference,capturedAt:shot?.capturedAt||new Date().toISOString(),timeSeconds:shot?.timeSeconds,screenshotAssetId,screenshotWidth:shot?.width,screenshotHeight:shot?.height,marks};
        const targets=[{id:target.id,version:target.version,canvasId:target.canvasId,title:target.data.title,content:target.data}];
        const common={source:'file',targets,mediaContext,...(reference.mediaType==='markdown'?{fileExcerpt:markdown.slice(0,50000)}:{})};
        attempt.current={key,operations:[createOp('annotation',target.canvasId,{...common,body:body.trim(),state:'open'},`${id}:annotation`),createOp('request',target.canvasId,{...common,annotationId:`${id}:annotation`,instruction:body.trim(),state:'pending',replies:[]},id)]};
      }
      const result=await store.getState().run(attempt.current.operations,'创建文件批注与截图');
      if(!result)throw new Error('批注保存失败，截图和文字已保留，可以重试');
      setSaved(result.entries.find(e=>e.after.kind==='request')!.after);setBody('');attempt.current=undefined;
    } catch(e){setError(e instanceof Error?e.message:'无法保存截图，请重试');}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="file-preview-modal" aria-label="文件预览与批注" onCancel={e=>{e.preventDefault();close();}}>
    <header><div><strong>{reference?.name || '文件预览'}</strong><small>{reference?.source}</small></div><button title="重新读取原文件" aria-label="重新读取原文件" disabled={busy} onClick={()=>setReload(x=>x+1)}><RefreshCw size={17}/></button><button title={value.inlineSource?"返回卡片修改内联链接":"重新关联文件"} aria-label={value.inlineSource?"返回卡片修改内联链接":"重新关联文件"} disabled={busy||!entity} onClick={()=>{if(entity){close();if(!value.inlineSource)onRelink(entity,value.referenceId);}}}><Link2 size={17}/></button><button aria-label="关闭文件预览" disabled={busy} onClick={close}><X size={20}/></button></header>
    <div className="file-preview-columns">
      <main className="file-preview-content">
        {value.inlineSource && <small className="file-remote-note">来自卡片描述的内联链接；路径变更时请返回卡片编辑 Markdown 链接。</small>}
        {loading && <p>正在读取文件…</p>}
        {reference?.remote && <small className="file-remote-note">外部直链预览受源站权限限制；截图需要源站允许跨域访问。</small>}
        {reference?.mediaType==='image' && <img ref={image} crossOrigin={reference.remote?'anonymous':undefined} src={src} alt={reference.name} onError={()=>setError('图片无法读取。请检查原文件或直链的跨域权限。')}/>}
        {reference?.mediaType==='video' && <video ref={video} crossOrigin={reference.remote?'anonymous':undefined} src={src} controls preload="metadata" onLoadedMetadata={()=>{if(value.timeSeconds!==undefined&&video.current)video.current.currentTime=value.timeSeconds;}} onError={()=>setError('视频无法播放。请检查原文件、跨域权限或视频编码（建议 MP4/H.264 或 WebM）。')}/>}
        {reference?.mediaType==='markdown' && !loading && <div className="markdown-content file-markdown"><Suspense fallback="正在排版…"><MarkdownContent text={markdown}/></Suspense></div>}
      </main>
      <aside className="file-annotation-panel"><h3>文件批注</h3>
        {reference && reference.mediaType!=='markdown' && <button disabled={busy||loading} onClick={capture}><Camera size={16}/>{reference.mediaType==='video'?'暂停并截图批注':'截图批注'}</button>}
        {shot && <><small>{shot.timeSeconds!==undefined?`时间点 ${timeLabel(shot.timeSeconds)} · `:''}拖动画框标注位置</small><div className="shot-board" style={{aspectRatio:`${shot.width}/${shot.height}`}} onPointerDown={e=>{if(busy)return;e.currentTarget.setPointerCapture(e.pointerId);start.current=point(e);}} onPointerMove={e=>{if(!start.current)return;const p=point(e);setDrawing({x:Math.min(p.x,start.current.x),y:Math.min(p.y,start.current.y),width:Math.abs(p.x-start.current.x),height:Math.abs(p.y-start.current.y)});}} onPointerUp={e=>{if(start.current){const p=point(e),s=start.current;const m={x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),width:Math.abs(p.x-s.x),height:Math.abs(p.y-s.y)};if(m.width>.005&&m.height>.005)setMarks(ms=>[...ms,m]);}start.current=undefined;setDrawing(undefined);}} onPointerCancel={()=>{start.current=undefined;setDrawing(undefined);}}><img src={shot.url} alt="批注截图" draggable={false}/><svg viewBox="0 0 1 1" preserveAspectRatio="none">{[...marks,...(drawing?[drawing]:[])].map((m,i)=><rect key={i} {...m} fill="none" stroke="#e64b54" strokeWidth="0.004"/>)}</svg></div><button disabled={busy} onClick={()=>setMarks([])}>清除标记</button></>}
        <textarea aria-label="文件批注内容" placeholder="描述需要讨论或修改的位置…" value={body} disabled={busy} onChange={e=>{setBody(e.target.value);setSaved(undefined);}}/>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy||loading||!body.trim()||!reference||(reference.mediaType!=='markdown'&&!shot)} onClick={()=>void save()}>{busy?'保存中…':'保存批注'}</button>
        {saved && <div className="file-saved"><p>批注已保存</p><button title="复制给 Codex" onClick={async()=>{try{await navigator.clipboard.writeText(discussionHandoffText(saved));setCopyError('已复制');}catch{setCopyError('无法复制，请在批注列表使用复制入口。');}}}><Copy size={14}/>复制给 Codex</button><small>{copyError}</small></div>}
        <h4>此文件的批注 · {discussions.length}</h4>{discussions.map(r=><article key={r.id}><p>{r.data.instruction}</p>{r.data.mediaContext?.timeSeconds!==undefined&&<button onClick={()=>{if(video.current){video.current.currentTime=r.data.mediaContext.timeSeconds;video.current.pause();}}}>{timeLabel(r.data.mediaContext.timeSeconds)} · 定位画面</button>}{r.data.mediaContext?.screenshotAssetId&&<img src={assetUrl(projectId,r.data.mediaContext.screenshotAssetId)} alt="已保存的批注截图" onClick={()=>store.setState({imagePreview:{src:assetUrl(projectId,r.data.mediaContext.screenshotAssetId),title:'批注截图'}})}/>}</article>)}
      </aside>
    </div>
  </dialog>;
}
