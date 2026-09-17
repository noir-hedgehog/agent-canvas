import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MarkdownContent} from '../src/MarkdownContent.tsx';
test('card markdown renders structure and filters raw HTML and unsafe URLs',()=>{
 const html=renderToStaticMarkup(createElement(MarkdownContent,{text:'## 标题\n\n**重点**\n\n- 一\n- 二\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)'}));
 assert.match(html,/<h2>标题<\/h2>/);assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/<ul>/);assert.match(html,/<table>/);
 assert.doesNotMatch(html,/<script|href="javascript:/);
});

test('inline file links support local paths and file URLs without enabling unsafe protocols',async()=>{
 const {inlineFileSource,inlineReferenceId}=await import('../shared/inlineFiles');
 assert.equal(inlineFileSource('./assets/clip.mp4'),'./assets/clip.mp4');
 assert.equal(inlineFileSource('file:///Users/example/my%20notes.md'),'/Users/example/my notes.md');
 assert.equal(inlineFileSource('/project/my%20image.png'),'/project/my image.png');
 assert.equal(inlineFileSource('https://example.com/clip.mp4?v=2'),'https://example.com/clip.mp4?v=2');
 for(const href of ['javascript:evil.png','data:image/png;base64,foo','file://remote/a.md','mailto:x.png','#image.png','https://example.com/page','/bad%ZZ.png'])assert.equal(inlineFileSource(href),undefined);
 const id=await inlineReferenceId('project','./clip.mp4');assert.equal(id,await inlineReferenceId('project','./clip.mp4'));assert.notEqual(id,await inlineReferenceId('other','./clip.mp4'));assert.match(id,/^[a-f0-9-]{36}$/);
 const entity={id:'c',kind:'card' as const,projectId:'p',canvasId:'canvas',version:1,deleted:false,data:{title:'卡片'}};
 const html=renderToStaticMarkup(createElement(MarkdownContent,{entity,text:'[视频](./clip.mp4) [本地](file:///Users/example/a.md) [普通](https://example.com) [危险](javascript:evil.png)'}));
 assert.match(html,/href="\.\/clip.mp4"[^>]*title="预览文件并批注"/);assert.match(html,/href="file:\/\/\/Users\/example\/a.md"/);
 assert.match(html,/href="https:\/\/example.com" target="_blank"/);assert.doesNotMatch(html,/href="javascript:/);
});

test('Mermaid fences use diagram renderer while other code and GFM checkboxes remain intact',()=>{
 const html=renderToStaticMarkup(createElement(MarkdownContent,{text:'```mermaid\nflowchart LR\n A --> B\n```\n\n```ts\nconst x = 1;\n```\n\n- [ ] 未完成\n- [x] 已完成',onEdit:()=>{}}));
 assert.match(html,/正在绘制 Mermaid 图表/);assert.match(html,/Mermaid 源码/);assert.match(html,/编辑源码/);
 assert.match(html,/class="language-ts"/);assert.match(html,/type="checkbox" disabled=""/);assert.match(html,/checked=""/);
 assert.doesNotMatch(html,/<pre><div/);
});
