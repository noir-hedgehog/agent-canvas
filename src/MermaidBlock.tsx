import {useEffect, useState} from 'react';
import {renderMermaid} from './mermaidRenderer';
import {useEditorApi} from './state';

export function MermaidBlock({source,onEdit}: {source:string;onEdit?:()=>void}) {
  const store=useEditorApi();
  const [result,setResult]=useState<{source:string;url?:string;error?:string}>();
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    setResult(undefined);
    void renderMermaid(source).then(url=>{if(active)setResult({source,url});}).catch(error=>{
      if(active)setResult({source,error:error instanceof Error?error.message:String(error)});
    });
    return()=>{active=false;};
  },[source,attempt]);
  const current=result?.source===source?result:undefined;
  return <div className="mermaid-block nodrag nopan nowheel" onClick={event=>event.stopPropagation()}>
    {!current && <p role="status">正在绘制 Mermaid 图表…</p>}
    {current?.url && <button className="mermaid-preview" aria-label="放大 Mermaid 图表" onClick={()=>store.setState({imagePreview:{src:current.url!,title:'Mermaid 图表'}})}><img src={current.url} alt="Mermaid 图表"/></button>}
    {current?.error && <div role="alert"><strong>Mermaid 无法渲染</strong><p>{current.error.slice(0,600)}</p><button onClick={()=>setAttempt(n=>n+1)}>重试</button></div>}
    <div className="mermaid-source-actions"><details open={!!current?.error}><summary>Mermaid 源码</summary><pre><code>{source}</code></pre></details>{onEdit && <button onClick={onEdit}>编辑源码</button>}</div>
  </div>;
}
