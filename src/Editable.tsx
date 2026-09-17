import { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from 'react';
import type { Entity } from '../shared/model';
import { useEditor, useEditorApi } from './state';
import { usePreferences } from './preferences';
const MarkdownContent=lazy(()=>import('./MarkdownContent').then(m=>({default:m.MarkdownContent})));

export function Editable({entity,field='body',className='',placeholder='',multiline=true,autoFocus=false,label}: {
  entity:Entity;field?:string;className?:string;placeholder?:string;multiline?:boolean;autoFocus?:boolean;label?:string;
}) {
  const key=`ac-draft:${entity.projectId}:${entity.id}:${field}`;
  const typography = usePreferences(s => `${s.preferences.font}:${s.preferences.fontSize}`);
  const editor=useEditorApi();
  const draftKeys=useEditor(s=>s.draftKeys);
  const readDraft=()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  const initial=useRef(readDraft());
  const [value,setValue]=useState<string>(initial.current?.value ?? entity.data[field] ?? '');
  const [editing,setEditing]=useState(autoFocus);
  const dirty=useRef(!!initial.current),baseline=useRef<Entity>(initial.current?.baseline ?? entity),valueRef=useRef(value),saving=useRef(false),flush=useRef(false);
  const input=useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const latestEntity=useRef(entity); latestEntity.current=entity;
  const markdown=multiline && field==='body';
  useEffect(()=>{if(autoFocus)setEditing(true);},[autoFocus]);
  useEffect(()=>{if(editing)input.current?.focus();},[editing]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!multiline || !el || !el.closest('.auto-height')) return;
    const fit = () => {
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    let width = el.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().width;
      if (next !== width) { width = next; fit(); }
    });
    observer.observe(el);
    return () => { observer.disconnect(); el.style.height = ''; };
  }, [value, editing, multiline, typography]);
  useEffect(()=>{
    if(dirty.current && !draftKeys.includes(key) && !localStorage.getItem(key)) dirty.current=false;
    if(!dirty.current){setValue(entity.data[field]??'');valueRef.current=entity.data[field]??'';baseline.current=entity;}
  },[entity.version,draftKeys.includes(key)]);
  const persist=()=>{
    localStorage.setItem(key,JSON.stringify({value:valueRef.current,baseline:baseline.current}));
    editor.setState(s=>({draftKeys:[...new Set([...s.draftKeys,key])]}));
  };
  const save=async()=>{
    flush.current=true;
    if(!dirty.current || saving.current)return;
    saving.current=true;
    const submitted=valueRef.current;
    const result=await editor.getState().patch(baseline.current,{[field]:submitted},field==='title'?'编辑标题':'编辑文字');
    saving.current=false;
    if(result){
      const next=result.entries.find(e=>e.after.id===entity.id)?.after;
      if(next)baseline.current=next;
      if(valueRef.current===submitted){dirty.current=false;localStorage.removeItem(key);editor.setState(s=>({draftKeys:s.draftKeys.filter(k=>k!==key)}));}
      else {persist();if(flush.current)void save();}
    }else persist();
  };
  const saveRef=useRef(save);saveRef.current=save;
  useEffect(()=>()=>{if(dirty.current)void saveRef.current();},[]);
  const name=label||`${entity.data.title||'内容'}${field==='title'?'标题':'正文'}`;
  if(markdown&&!editing)return <div className={`editable markdown-content nodrag nopan nowheel ${className}`} role="button" tabIndex={0} aria-label={`编辑${name}`} title="点击编辑 Markdown" onClick={()=>setEditing(true)} onKeyDown={e=>{e.stopPropagation();if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();setEditing(true);}}}>
    {value ? <Suspense fallback={value}><MarkdownContent text={value} entity={entity} onEdit={()=>setEditing(true)}/></Suspense> : <span className="markdown-placeholder">{placeholder||'点击添加内容…'}</span>}
  </div>;
  const props={ref:input,value,autoFocus,placeholder,'aria-label':name,className:`editable nodrag nopan nowheel ${className}`,onFocus:()=>{flush.current=false;},onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{
    if(!dirty.current)baseline.current=latestEntity.current;
    dirty.current=true;valueRef.current=e.target.value;setValue(e.target.value);persist();
  },onBlur:()=>{void save();if(markdown)setEditing(false);},onKeyDown:(e:React.KeyboardEvent)=>e.stopPropagation()};
  return multiline?<textarea {...props}/>:<input {...props}/>;
}
