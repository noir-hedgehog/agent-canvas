import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createApplication } from '../server/app';
import { createOp, placementOp, updateOp } from '../shared/model';
import { archiveOperations, matchesArchive } from '../shared/archive';
import { unresolvedDiscussions } from '../shared/discussionEdit';

test('archive: preserve geometry/children/relations, atomic discussion state, dynamic MCP filters, restore, retry and conflicts', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'agentcanvas-archive-'));
  const http=createServer(); await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));
  const port=(http.address() as any).port, dataDir=path.join(dir,'.data');
  const service=createApplication({workspace:dir,dataDir,port,seed:false}); http.on('request',service.app);
  const store=service.store, p=store.newProject('归档测试'), other=store.newProject('其他项目');
  const client=new Client({name:'archive-test',version:'1.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',path.resolve('server/mcp.ts')],cwd:path.resolve('.'),env:{...process.env,AGENTCANVAS_DATA_DIR:dataDir,AGENTCANVAS_URL:`http://127.0.0.1:${port}`},stderr:'pipe'});
  const invoke=async(name:string,args:any)=>{const r:any=await client.callTool({name,arguments:{projectId:p.id,...args}});assert.ok(!r.isError,r.content?.[0]?.text);return JSON.parse(r.content[0].text);};
  try {
    store.apply({projectId:p.id,requestId:'setup',summary:'setup',operations:[
      createOp('card',p.rootCanvasId,{title:'归档卡片',body:'original',childCanvasId:'child'},'card'),
      createOp('canvas',p.rootCanvasId,{title:'子画布',ownerNodeId:'card'},'child'),
      createOp('card','child',{title:'内部卡片'},'inner'),placementOp('child','inner',30,40,260,180,undefined,'inner-place'),
      createOp('tasks',p.rootCanvasId,{title:'共享任务',items:[]},'tasks'),
      placementOp(p.rootCanvasId,'card',123,456,300,200,undefined,'place'),
      placementOp(p.rootCanvasId,'tasks',700,500,300,200,undefined,'task-place'),
      placementOp('child','tasks',600,500,300,200,undefined,'task-ref'),
      createOp('relation',p.rootCanvasId,{sourcePlacementId:'place',targetPlacementId:'task-place',label:'下一步',direction:'forward'},'rel'),
      createOp('annotation',p.rootCanvasId,{body:'历史批注',state:'open',targets:[{id:'card',version:1}]},'annotation'),
      createOp('request',p.rootCanvasId,{instruction:'历史批注',state:'replied',annotationId:'annotation',targets:[{id:'card',version:1}],replies:[{body:'回复保留'}]},'request'),
    ]});
    const unchanged=['place','child','inner','inner-place','rel'].map(id=>store.get(p.id,id));
    await client.connect(transport);
    const names=(await client.listTools()).tools.map(t=>t.name); assert.ok(names.includes('list_archived')&&names.includes('set_archived'));
    const archived=await invoke('set_archived',{id:'card',expectedVersion:1,archived:true,requestId:'archive-card'});
    assert.equal(archived.entries[0].archived,true);
    const repeated=await invoke('set_archived',{id:'card',expectedVersion:1,archived:true,requestId:'archive-card'});assert.equal(repeated.id,archived.id);
    assert.deepEqual(['place','child','inner','inner-place','rel'].map(id=>store.get(p.id,id)),unchanged);
    const active=await invoke('read_canvas',{});assert.ok(!active.objects.some((e:any)=>['card','place','rel'].includes(e.id)));
    const archiveView=await invoke('read_canvas',{archive:'archived'});assert.deepEqual(archiveView.objects.map((e:any)=>e.id).sort(),['card','place','rel']);
    const exact=await invoke('read_objects',{ids:['card']});assert.match(JSON.stringify(exact),/original/);
    const child=await invoke('read_canvas',{canvasId:'child'});assert.ok(child.objects.some((e:any)=>e.id==='inner'));
    const summary=await invoke('list_archived',{});assert.equal(summary.total,1);assert.equal(summary.items[0].childCanvasId,'child');assert.ok(!('body' in summary.items[0]));
    await invoke('set_archived',{id:'tasks',expectedVersion:1,archived:true,requestId:'archive-task'});
    assert.ok(!(await invoke('read_canvas',{canvasId:'child'})).objects.some((e:any)=>e.id==='task-ref'));
    assert.ok((await invoke('read_canvas',{canvasId:'child',archive:'archived'})).references.some((e:any)=>e.id==='tasks'));
    assert.equal((await invoke('list_archived',{limit:1})).nextCursor,1);
    assert.equal((await invoke('list_archived',{cursor:1,limit:1})).items.length,1);
    const q=await invoke('set_archived',{id:'request',expectedVersion:1,archived:true,requestId:'archive-request'});
    assert.equal(q.entries.length,2);assert.equal(store.get(p.id,'annotation').data.archived,true);
    assert.equal(store.get(p.id,'request').data.state,'replied');assert.deepEqual(store.get(p.id,'request').data.replies,[{body:'回复保留'}]);
    assert.equal(unresolvedDiscussions(store.all(p.id)).length,0);
    assert.equal((await invoke('read_requests',{})).length,0);
    assert.equal((await invoke('read_requests',{archive:'archived'})).length,1);
    assert.equal((await invoke('read_requests',{requestId:'request'}))[0].data.archived,true);
    assert.equal((await invoke('list_archived',{type:'discussions'})).items[0].id,'request');
    assert.throws(()=>store.apply({projectId:p.id,requestId:'half',summary:'bad',operations:[updateOp(store.get(p.id,'annotation'),{archived:false})]}),/同时归档/);
    assert.throws(()=>store.apply({projectId:p.id,requestId:'bad-value',summary:'bad',operations:[updateOp(store.get(p.id,'card'),{archived:'true'})]}),/布尔/);
    const stale:any=await client.callTool({name:'set_archived',arguments:{projectId:p.id,id:'request',expectedVersion:1,archived:false,requestId:'stale'}});assert.ok(stale.isError);assert.equal(store.get(p.id,'annotation').data.archived,true);
    const cross:any=await client.callTool({name:'set_archived',arguments:{projectId:other.id,id:'card',expectedVersion:2,archived:false,requestId:'cross'}});assert.ok(cross.isError);
    store.undo(p.id,q.id,'undo-archive-request');assert.equal(store.get(p.id,'annotation').data.archived,undefined);assert.equal(unresolvedDiscussions(store.all(p.id)).length,1);
    await invoke('set_archived',{id:'card',expectedVersion:2,archived:false,requestId:'restore-card'});
    assert.ok((await invoke('read_canvas',{})).objects.some((e:any)=>e.id==='card'));
    assert.deepEqual(['place','child','inner','inner-place','rel'].map(id=>store.get(p.id,id)),unchanged);
    const batch=archiveOperations(store.all(p.id),['request','annotation'],true);assert.equal(batch.length,2);
    const card=store.get(p.id,'card');assert.equal(matchesArchive(card,store.all(p.id),'all'),true);
    const {Connections}=await import('../server/connections'); const access=new Connections(store).create(p.id,'只读','read').accessCode;
    await invoke('connect_project',{accessCode:access});
    assert.equal((await invoke('list_archived',{})).total,1);
    const denied:any=await client.callTool({name:'set_archived',arguments:{projectId:p.id,id:'card',expectedVersion:3,archived:true,requestId:'readonly'}});assert.ok(denied.isError);
    // Persistence is read from the real SQLite file using a separate connection.
    const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dataDir,'workspace.sqlite'),{readOnly:true});
    const row:any=db.prepare('SELECT json FROM entities WHERE id=?').get('tasks');assert.equal(JSON.parse(row.json).data.archived,true);db.close();
  } finally { await client.close();service.close();await new Promise<void>(r=>http.close(()=>r()));rmSync(dir,{recursive:true,force:true}); }
});
