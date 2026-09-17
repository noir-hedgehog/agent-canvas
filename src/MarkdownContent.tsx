import Markdown, {defaultUrlTransform,type Components} from 'react-markdown';
import {useState,useMemo,useRef} from 'react';
import remarkGfm from 'remark-gfm';
import {api, useEditorApi} from './state';
import type {Entity} from '../shared/model';
import type {FileReference} from '../shared/fileReferences';
import {inlineFileSource, inlineReferenceId} from '../shared/inlineFiles';
import {MermaidBlock} from './MermaidBlock';
export function MarkdownContent({text,entity,onEdit}: {text:string;entity?:Entity;onEdit?:()=>void}) {
  const store=useEditorApi();
  const [fileError,setFileError]=useState(''),[opening,setOpening]=useState(false);
  async function openFile(source:string) {
    if (!entity || opening) return;
    setOpening(true);setFileError('');
    try {
      const reference=await api<FileReference>(`/api/projects/${entity.projectId}/files`,{source,requestId:await inlineReferenceId(entity.projectId,source)});
      if(store.getState().snapshot?.project.id===entity.projectId)store.setState({filePreview:{entityId:entity.id,referenceId:reference.id,inlineSource:source}});
    } catch(error) {setFileError(`${(error as Error).message}。请检查链接；本地相对路径从工作区解析。`);}
    finally {setOpening(false);}
  }
  const editRef=useRef(onEdit);editRef.current=onEdit;
  // Keep the pre component stable across React Flow measurement updates.
  const pre=useMemo<Components['pre']>(()=>({node,children,...props}) => {
      const code=node?.children[0];
      if(code?.type==='element' && code.tagName==='code' && Array.isArray(code.properties.className) && code.properties.className.includes('language-mermaid')) {
        const source=code.children.map(child=>child.type==='text'?child.value:'').join('').replace(/\n$/,'');
        return <MermaidBlock source={source} onEdit={()=>editRef.current?.()}/>;
      }
      return <pre {...props}>{children}</pre>;
    } ,[]);
  return <><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url,key,node)=>entity && node.tagName==='a' && inlineFileSource(url) ? url : defaultUrlTransform(url)} components={{
    pre,
    a: ({node,...props}) => {
      const source=entity && props.href ? inlineFileSource(props.href) : undefined;
      return <a {...props} target={source?undefined:'_blank'} rel="noreferrer" title={source?'预览文件并批注':props.title} onClick={e=>{e.stopPropagation();if(source){e.preventDefault();void openFile(source);}}}/>;
    },
    img: ({node,...props}) => <img {...props} onClick={e=>{e.stopPropagation();if(typeof props.src === 'string')store.setState({imagePreview:{src:props.src,title:props.alt||'图片预览'}});}}/>,
  }}>{text}</Markdown>{opening && <small>正在打开文件…</small>}{fileError && <small className="inline-file-error" role="alert">{fileError}</small>}</>;
}
