import {fileUrl} from "./runtime";
import { useEffect, useState, useContext } from 'react';
import { FileText, Film, Image, Link2, X } from 'lucide-react';
import type { Entity } from '../shared/model';
import type { FileReference } from '../shared/fileReferences';
import { api, useEditor, useEditorApi } from './state';
import { ActionContext } from './CanvasNode';
export function CardFiles({entity,selected}: {entity:Entity;selected:boolean}) {
  const ids: string[] = entity.data.fileReferenceIds || [];
  return ids.length ? <div className="card-files nodrag nopan nowheel">{ids.map(id=><FileLink key={id} id={id} entity={entity} selected={selected}/>)}</div> : null;
}
function FileLink({id,entity,selected}: {id:string;entity:Entity;selected:boolean}) {
  const readOnly = useEditor(s=>s.readOnly);
  const store = useEditorApi(), actions = useContext(ActionContext);
  const [reference,setReference] = useState<FileReference>();
  const [error,setError] = useState('');
  useEffect(()=>{let active=true;api<FileReference>(`/api/projects/${entity.projectId}/files/${id}`).then(r=>{if(active){setReference(r);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,entity.projectId]);
  const Icon = reference?.mediaType === 'video' ? Film : reference?.mediaType === 'image' ? Image : FileText;
  return <div className="card-file-link">
    <a href={reference?.remote ? reference.source : fileUrl(entity.projectId,id)} title={reference?.source || error || '预览文件'} onClick={e=>{e.preventDefault();e.stopPropagation();store.setState({filePreview:{entityId:entity.id,referenceId:id}});}}><Icon size={16}/><span>{reference?.name || (error ? '文件不可用 · 点击查看' : '读取文件引用…')}</span><Link2 size={12}/></a>
    {error && !readOnly && <button title="重新关联文件" aria-label="重新关联文件" onClick={()=>actions.referenceFile(entity,id)}><Link2 size={13}/></button>}
    {selected && <button title="移除文件引用" aria-label="移除文件引用" onClick={async()=>{await store.getState().settleEdits(entity.id);const latest=store.getState().snapshot?.entities.find(e=>e.id===entity.id);if(latest)await store.getState().patch(latest,{fileReferenceIds:(latest.data.fileReferenceIds||[]).filter((x:string)=>x!==id)},'移除文件引用');}}><X size={13}/></button>}
  </div>;
}
