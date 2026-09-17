import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import {useEditor,useEditorApi} from './state';
export function ImagePreview(){
 const value=useEditor(s=>s.imagePreview),store=useEditorApi();
 const close=()=>store.setState({imagePreview:null});
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!value)return;const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[value?.src]);
 if(!value)return null;
 return <dialog ref={dialog} className="image-preview-modal" aria-label="图片预览" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
   <div className="image-preview-panel"><header><span>{value.title}</span><button aria-label="关闭图片预览" onClick={close}><X size={20}/></button></header><img src={value.src} alt={value.title}/></div>
 </dialog>;
}
