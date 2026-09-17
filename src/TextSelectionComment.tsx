import {useEffect, useState, type RefObject} from 'react';
import {MessageSquarePlus} from 'lucide-react';
export type TextContext = {
  objectId: string; version: number; field: string; quote: string;
  prefix: string; suffix: string; start: number; end: number;
  coordinateSpace: 'rendered-text'; capturedAt: string;
};
export function readTextSelection(root: HTMLElement, selection: Selection | null): {context: TextContext; placementId: string; rect: DOMRect} | null {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const element = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const field = element(range.startContainer)?.closest<HTMLElement>('[data-comment-field]');
  if (!field || !root.contains(field) || !field.contains(range.endContainer)) return null;
  const placement = field.closest<HTMLElement>('.react-flow__node');
  if (!placement?.dataset.id) return null;
  const before = range.cloneRange(); before.selectNodeContents(field); before.setEnd(range.startContainer,range.startOffset);
  const start = before.toString().length, quote = range.toString(), full = field.textContent || '';
  if (!quote.trim()) return null;
  return {placementId: placement.dataset.id, rect: range.getBoundingClientRect(), context: {
    objectId: field.dataset.commentObject!, version: Number(field.dataset.commentVersion), field: field.dataset.commentField!,
    quote, start, end: start + quote.length, prefix: full.slice(Math.max(0,start-60),start), suffix: full.slice(start+quote.length,start+quote.length+60),
    coordinateSpace: 'rendered-text', capturedAt: new Date().toISOString(),
  }};
}
export function TextSelectionComment({root,onQuote}: {root:RefObject<HTMLDivElement|null>;onQuote:(context:TextContext,placementId:string)=>void}) {
  const [picked,setPicked] = useState<ReturnType<typeof readTextSelection>>(null);
  useEffect(()=>{
    let timer: ReturnType<typeof setTimeout>;
    const capture = () => { clearTimeout(timer);timer=setTimeout(()=>setPicked(root.current ? readTextSelection(root.current,window.getSelection()) : null),0); };
    document.addEventListener('selectionchange',capture);
    document.addEventListener('pointerup',capture);
    window.addEventListener('resize',capture);
    return()=>{clearTimeout(timer);document.removeEventListener('selectionchange',capture);document.removeEventListener('pointerup',capture);window.removeEventListener('resize',capture);};
  },[root]);
  if (!picked) return null;
  return <button className="text-quote-action nodrag nopan" aria-label="批注选中文字" style={{left:Math.max(12,Math.min(picked.rect.left,window.innerWidth-170)),top:Math.max(80,Math.min(picked.rect.bottom+8,window.innerHeight-50))}} onPointerDown={e=>e.preventDefault()} onClick={()=>{onQuote(picked.context,picked.placementId);window.getSelection()?.removeAllRanges();setPicked(null);}}><MessageSquarePlus size={15}/>批注选中文字</button>;
}
