import {assetUrl} from "./runtime";
import { useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import type { Entity } from '../shared/model';
import { useEditorApi } from './state';
export function CardImages({entity, selected}: {entity:Entity;selected:boolean}) {
  const store = useEditorApi();
  const [failed, setFailed] = useState<string[]>([]);
  const ids: string[] = [...new Set<string>([...(entity.data.assetId ? [entity.data.assetId] : []), ...(entity.data.imageIds || [])])];
  if (!ids.length) return null;
  return <div className="card-images nodrag nopan nowheel" aria-label="卡片图片">{ids.map(id => <div className="card-image" key={id}>
    {failed.includes(id) ? <span className="card-image-missing"><ImageOff size={18}/>图片无法显示</span> : <button className="image-preview-trigger" aria-label="预览卡片图片" onClick={()=>store.setState({imagePreview:{src:assetUrl(entity.projectId,id),title:entity.data.title||"图片预览"}})}><img src={assetUrl(entity.projectId,id)} alt={entity.data.title || '卡片图片'} onError={() => setFailed(x => [...x,id])}/></button>}
    {selected && <button aria-label="移除这张图片" onClick={async () => {
      await store.getState().settleEdits(entity.id);
      const latest = store.getState().snapshot?.entities.find(e => e.id === entity.id);
      if (!latest) return;
      const patch = {imageIds:(latest.data.imageIds || []).filter((x:string) => x !== id), ...(latest.data.assetId === id ? {assetId:null} : {})};
      if (latest.kind === 'image' && latest.data.assetId === id) await store.getState().run([{op:'convert',id:latest.id,expectedVersion:latest.version,kind:'card',patch}], '移除卡片图片');
      else await store.getState().patch(latest,patch,'移除卡片图片');
    }}><X size={12}/></button>}
  </div>)}</div>;
}
