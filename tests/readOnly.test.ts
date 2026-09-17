import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedInReadOnly} from '../src/readOnly';
import {makeStore} from '../src/state';
import {createOp,updateOp,type Entity} from '../shared/model';
import {showcaseSnapshot} from '../shared/showcase';
import {discussionHandoffText} from '../shared/debugDiscussion';

test('browser read-only guard allows discussions but blocks content, mixed batches, conversions and unknown IDs',()=>{
 const snapshot=showcaseSnapshot(), entities=snapshot.entities;
 const request=entities.find(e=>e.kind==='request')!,card=entities.find(e=>e.kind==='card')!;
 assert.equal(allowedInReadOnly([createOp('annotation',card.canvasId,{body:'comment'}),updateOp(request,{state:'processing'})],entities),true);
 for(const ops of [[updateOp(card,{body:'changed'})],[createOp('card',card.canvasId,{})],[updateOp({...card,id:'missing'}, {})],[updateOp(request,{state:'processing'}),updateOp(card,{body:'changed'})],[{op:'convert',id:request.id,kind:'card',expectedVersion:1,patch:{}}] as any])assert.equal(allowedInReadOnly(ops,entities),false);
});
test('read-only store blocks mutation and history requests before HTTP; incoming snapshots still render latest agent data',async()=>{
 const store=makeStore(), snapshot=showcaseSnapshot(),card=snapshot.entities.find(e=>e.kind==='card')!;
 store.setState({snapshot,readOnly:true,undoStack:['a'],redoStack:['b']});
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(snapshot),{status:200});};
 try{
  assert.equal(await store.getState().patch(card,{body:'forbidden'}),null);
  await store.getState().undo();await store.getState().redo();assert.equal(calls,0);
  const next=structuredClone(snapshot);next.entities.find(e=>e.id===card.id)!.data.body='Agent update';
  globalThis.fetch=async()=>new Response(JSON.stringify(next),{status:200});
  await store.getState().refresh();assert.equal(store.getState().snapshot!.entities.find(e=>e.id===card.id)!.data.body,'Agent update');assert.equal(store.getState().readOnly,true);
 }finally{globalThis.fetch=original;}
});
test('text discussion handoff preserves historical quote and warns against applying rendered offsets to Markdown',()=>{
 const r={id:'r',projectId:'p',canvasId:'c',version:1,deleted:false,kind:'request',data:{instruction:'clarify',textContext:{objectId:'o',version:3,field:'body',quote:'exact words',start:12,end:23,coordinateSpace:'rendered-text'}}} as Entity;
 const text=discussionHandoffText(r);assert.match(text,/exact words/);assert.match(text,/不是 Markdown 源码位置/);assert.match(text,/最新正文/);
});
