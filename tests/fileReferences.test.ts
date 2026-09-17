import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createApplication } from '../server/app';
import { createOp, placementOp, updateOp } from '../shared/model';
import { discussionHandoffText } from '../shared/debugDiscussion';
import { fileFormat, timeLabel } from '../shared/fileReferences';

test('file reference HTTP and MCP: no copying, range video, live Markdown, scope, screenshots and restored references', async () => {
 const dir=mkdtempSync(path.join(tmpdir(),'agentcanvas-files-')), workspace=path.join(dir,'work'),dataDir=path.join(workspace,'.data');mkdirSync(workspace);
 const http=createServer();await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));const port=(http.address() as any).port;
 const service=createApplication({workspace,dataDir,port,seed:false});http.on('request',service.app);
 const base=`http://127.0.0.1:${port}`,token=readFileSync(path.join(dataDir,'token'),'utf8').trim();
 const p=service.store.newProject('文件引用验收'),other=service.store.newProject('另一个项目');
 const request=async (route:string,body?:any,bearer=token,extra:Record<string,string>={})=>fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${bearer}`,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
 const client=new Client({name:'file-test',version:'1.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',path.resolve('server/mcp.ts')],cwd:path.resolve('.'),env:{...process.env,AGENTCANVAS_DATA_DIR:dataDir,AGENTCANVAS_URL:base},stderr:'pipe'});
 try {
  writeFileSync(path.join(workspace,'notes.md'),'# 第一版\n\n- [ ] 待办');
  writeFileSync(path.join(workspace,'clip.mp4'),Buffer.from('0123456789-video-range-fixture'));
  writeFileSync(path.join(workspace,'picture.png'),readFileSync('tests/fixtures/material-sample.png'));
  await client.connect(transport);
  const names=(await client.listTools()).tools.map(t=>t.name);assert.ok(names.includes('reference_file')&&names.includes('read_file_reference'));
  const result:any=await client.callTool({name:'reference_file',arguments:{projectId:p.id,source:'notes.md',requestId:randomUUID()}});
  assert.ok(!result.isError);const md=JSON.parse(result.content[0].text);
  assert.equal(readdirSync(path.join(dataDir,'assets')).length,0);
  const mdRead:any=await client.callTool({name:'read_file_reference',arguments:{projectId:p.id,id:md.id}});assert.match(mdRead.content[0].text,/第一版/);
  writeFileSync(path.join(workspace,'notes.md'),'# 第二版');
  assert.equal(await (await request(`/api/projects/${p.id}/files/${md.id}/content`)).text(),'# 第二版');
  const replayId=randomUUID();const v=await (await request(`/api/projects/${p.id}/files`,{source:'clip.mp4',requestId:replayId})).json();
  assert.equal((await (await request(`/api/projects/${p.id}/files`,{source:'clip.mp4',requestId:replayId})).json()).id,v.id);
  assert.equal((await request(`/api/projects/${p.id}/files`,{source:'notes.md',requestId:replayId})).status,409);
  const range=await request(`/api/projects/${p.id}/files/${v.id}/content`,undefined,token,{Range:'bytes=0-9'});assert.equal(range.status,206);assert.equal(await range.text(),'0123456789');
  const pic=await (await request(`/api/projects/${p.id}/files`,{source:'picture.png',requestId:randomUUID()})).json();
  const picRead:any=await client.callTool({name:'read_file_reference',arguments:{projectId:p.id,id:pic.id}});assert.ok(picRead.content.some((c:any)=>c.type==='image'&&c.mimeType==='image/png'));
  const image=await (await request('/api/assets',{projectId:p.id,name:'批注截图',base64:readFileSync('tests/fixtures/material-sample.png').toString('base64')})).json();
  const mediaContext={reference:v,capturedAt:new Date().toISOString(),timeSeconds:12.375,screenshotAssetId:image.id,marks:[{x:.1,y:.2,width:.3,height:.4}]};
  service.store.apply({projectId:p.id,requestId:'card-comment',summary:'截图批注',operations:[createOp('card',p.rootCanvasId,{title:'视频引用',fileReferenceIds:[v.id]},'card'),placementOp(p.rootCanvasId,'card',123,456,300,180,undefined,'place'),createOp('annotation',p.rootCanvasId,{body:'查看这一帧',state:'open',targets:[{id:'card',version:1}],mediaContext},'a'),createOp('request',p.rootCanvasId,{instruction:'查看这一帧',state:'pending',annotationId:'a',targets:[{id:'card',version:1}],mediaContext},'q')]});
  const shot:any=await client.callTool({name:'read_image',arguments:{projectId:p.id,id:'q'}});assert.ok(shot.content.some((c:any)=>c.type==='image'));
  assert.match(discussionHandoffText(service.store.get(p.id,'q')),/12.375/);assert.match(discussionHandoffText(service.store.get(p.id,'q')),new RegExp(image.id));
  const {inlineReferenceId}=await import('../shared/inlineFiles');
  const inlineId=await inlineReferenceId(p.id,'notes.md');
  for(let i=0;i<2;i++)assert.equal((await (await request(`/api/projects/${p.id}/files`,{source:'notes.md',requestId:inlineId})).json()).id,inlineId);
  const inlineReference=await (await request(`/api/projects/${p.id}/files/${inlineId}`)).json();
  service.store.apply({projectId:p.id,requestId:'inline-discussion',summary:'内联文件批注',operations:[
    createOp('card',p.rootCanvasId,{title:'内联链接',body:'[文档](notes.md)'},'inline-card'),
    createOp('annotation',p.rootCanvasId,{body:'修改第二版',state:'open',targets:[{id:'inline-card',version:1}],mediaContext:{reference:inlineReference,inlineSource:'notes.md',capturedAt:new Date().toISOString(),marks:[]}},'inline-a'),
    createOp('request',p.rootCanvasId,{instruction:'修改第二版',state:'pending',annotationId:'inline-a',targets:[{id:'inline-card',version:1}],mediaContext:{reference:inlineReference,inlineSource:'notes.md',capturedAt:new Date().toISOString(),marks:[]}},'inline-q'),
  ]});
  assert.equal(service.store.get(p.id,'inline-card').data.fileReferenceIds,undefined);
  assert.equal(service.store.get(p.id,'inline-card').data.body,'[文档](notes.md)');
  const inlineContext:any=await client.callTool({name:'read_requests',arguments:{projectId:p.id,requestId:'inline-q'}});assert.match(inlineContext.content[0].text,/inlineSource/);
  const inlineRead:any=await client.callTool({name:'read_file_reference',arguments:{projectId:p.id,id:inlineId}});assert.match(inlineRead.content[0].text,/第二版/);
  const before=service.store.get(p.id,'place');
  const removed=service.store.apply({projectId:p.id,requestId:'remove-ref',summary:'移除引用',operations:[updateOp(service.store.get(p.id,'card'),{fileReferenceIds:[]})]});
  service.store.undo(p.id,removed.id,'restore-ref');assert.deepEqual(service.store.get(p.id,'card').data.fileReferenceIds,[v.id]);assert.deepEqual(service.store.get(p.id,'place'),before);
  assert.throws(()=>service.store.apply({projectId:other.id,requestId:'cross-ref',summary:'invalid',operations:[createOp('card',other.rootCanvasId,{title:'cross',fileReferenceIds:[v.id]})]}),/文件引用/);
  assert.throws(()=>service.store.apply({projectId:p.id,requestId:'bad-time',summary:'invalid',operations:[updateOp(service.store.get(p.id,'q'),{mediaContext:{...mediaContext,timeSeconds:-1}})]}),/时间点/);
  const bad:any=await client.callTool({name:'reference_file',arguments:{projectId:p.id,source:'../outside.md',requestId:randomUUID()}});assert.ok(bad.isError);
  writeFileSync(path.join(dir,'outside.md'),'outside');symlinkSync(path.join(dir,'outside.md'),path.join(workspace,'symlink.md'));
  assert.equal((await request(`/api/projects/${p.id}/files`,{source:'symlink.md',requestId:randomUUID()})).status,403);
  writeFileSync(path.join(dataDir,'secret.md'),'private');assert.equal((await request(`/api/projects/${p.id}/files`,{source:'.data/secret.md',requestId:randomUUID()})).status,403);
  const connections=(await import('../server/connections')).Connections;const grants=new connections(service.store);
  const grant=grants.create(other.id,'other','edit');const access=grant.accessCode;
  assert.equal((await request(`/api/projects/${p.id}/files/${md.id}/content`,undefined,access)).status,403);
  const readGrant=grants.create(p.id,'read','read');assert.equal((await request(`/api/projects/${p.id}/files`,{source:'notes.md',requestId:randomUUID()},readGrant.accessCode)).status,403);
  renameSync(path.join(workspace,'notes.md'),path.join(workspace,'moved.md'));
  assert.equal((await request(`/api/projects/${p.id}/files/${md.id}/content`)).status,404);
  assert.ok(service.store.get(p.id,'q').data.mediaContext.screenshotAssetId);
  symlinkSync(path.join(dir,'outside.md'),path.join(workspace,'notes.md'));
  assert.equal((await request(`/api/projects/${p.id}/files/${md.id}/content`)).status,409);
  const unauthorized=await fetch(base+`/api/projects/${p.id}/files/${v.id}/content`);assert.equal(unauthorized.status,401);
 } finally {await client.close();service.close();await new Promise<void>(r=>http.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});

test('file format whitelist and timestamp formatting',()=>{
 assert.equal(fileFormat('https://example.org/clip.MP4?v=2')?.mediaType,'video');
 assert.equal(fileFormat('/project/readme.md')?.mediaType,'markdown');
 assert.equal(fileFormat('/project/script.html'),undefined);
 assert.equal(timeLabel(3661.9),'01:01:01');
});
