import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderMermaid, MAX_MERMAID_LENGTH} from '../src/mermaidRenderer';

test('Mermaid renders SVG, isolates images, handles parallel diagrams and errors without leaving DOM',async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true});
 for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','DOMParser','XMLSerializer','getComputedStyle','CSSStyleSheet'] as const)Object.defineProperty(globalThis,key,{value:(dom.window as any)[key],configurable:true,writable:true});
 // jsdom has no layout engine. These measurements exercise integration and SVG output,
 // not actual browser text geometry or visual acceptance.
 Object.defineProperty(dom.window.SVGElement.prototype,'getBBox',{value:function(this:SVGElement){return {x:0,y:0,width:Math.max(40,(this.textContent?.length||0)*8),height:24};},configurable:true});
 Object.defineProperty(dom.window.SVGElement.prototype,'getComputedTextLength',{value:function(this:SVGElement){return (this.textContent?.length||0)*8;},configurable:true});
 const sources=['flowchart LR\n A[想法] --> B[评审]','sequenceDiagram\n Alice->>Bob: Hello','mindmap\n root((计划))\n  实现\n  验证'];
 try {
  const urls=await Promise.all(sources.map(renderMermaid));
  assert.equal(new Set(urls).size,3);
  for(const url of urls){assert.match(url,/^data:image\/svg\+xml/);const svg=decodeURIComponent(url.split(',').slice(1).join(','));assert.match(svg,/<svg/);assert.match(svg,/viewBox=/);assert.doesNotMatch(svg,/<script|onload=/i);}
  assert.equal(dom.window.document.body.children.length,0);
  await assert.rejects(renderMermaid('not a diagram at all'));
  assert.equal(dom.window.document.body.children.length,0);
  await assert.rejects(renderMermaid('x'.repeat(MAX_MERMAID_LENGTH+1)),/20,000/);
  await assert.rejects(renderMermaid(''),/为空/);
  const safe=decodeURIComponent((await renderMermaid('flowchart LR\n A[Safe] --> B[Done]\n click A "javascript:alert(1)"')).split(',').slice(1).join(','));
  assert.doesNotMatch(safe,/(?:href|onclick)=["']javascript:|<script/i);
  assert.equal(dom.window.document.body.children.length,0);
 } finally {dom.window.close();}
});
