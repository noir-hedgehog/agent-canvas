import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../server/store';
import {showcaseSnapshot} from '../shared/showcase';
import {createSection,moveSection,validateSections} from '../shared/sections';
import {createLayoutPlan} from '../shared/autoLayout';
import {createOp,placementOp,updateOp,type Entity} from '../shared/model';

test('sections validate same-canvas unique membership and move in one undoable transaction with conflict rollback',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ac-section-')),store=new Store(path.join(dir,'db'));
 try{
  const project=store.newProject('Sections'),c=project.rootCanvasId;
  const apply=(operations:any[])=>store.apply({projectId:project.id,requestId:crypto.randomUUID(),summary:'test',operations});
  apply([createOp('card',c,{title:'a',body:''},'a'),createOp('card',c,{title:'b',body:''},'b'),placementOp(c,'a',100,120,200,100,undefined,'pa'),placementOp(c,'b',400,180,200,100,undefined,'pb')]);
  apply([createSection(store.all(project.id),c,['pa','pb'],'Section','s')]);
  assert.throws(()=>createSection(store.all(project.id),c,['pa','pb'],'Duplicate','bad'),/只能属于/);
  const before=store.all(project.id),section=store.get(project.id,'s');
  const change=apply(moveSection(section,before,section.data.x+120,section.data.y-30));
  assert.equal(store.get(project.id,'pa').data.x,220);assert.equal(store.get(project.id,'pb').data.y,150);
  store.undo(project.id,change.id,crypto.randomUUID());assert.equal(store.get(project.id,'pa').data.x,100);
  const stale=moveSection(store.get(project.id,'s'),store.all(project.id),300,300);
  apply([updateOp(store.get(project.id,'pb'),{x:420})]);
  assert.throws(()=>apply(stale));assert.equal(store.get(project.id,'pa').data.x,100);
  apply([{op:'delete',id:'s',expectedVersion:store.get(project.id,'s').version}]);assert.equal(store.get(project.id,'a').deleted,false);assert.equal(store.get(project.id,'pb').data.x,420);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('layout treats a section as a unit and leaves offsets unchanged including local selection',()=>{
 const snapshot=showcaseSnapshot(),entities=snapshot.entities,c=snapshot.project.rootCanvasId;
 const op=createSection(entities,c,['showcase-basics-place','showcase-relations-place'],'Section','section');assert.equal(op.op,'create');if(op.op!=='create')return;
 const section:Entity={...op,projectId:snapshot.project.id,version:1,deleted:false};entities.push(section);
 for(const selection of [[],['section'],['showcase-basics-place']]){
  const plan=createLayoutPlan(entities,c,selection,[],'grid','standard');
  const a=plan.positions['showcase-basics-place'],b=plan.positions['showcase-relations-place'];
  assert.equal(b.x-a.x,390);assert.equal(b.y-a.y,0);
  if(selection.length)assert.ok(plan.operations.every(op=>['section','showcase-basics-place','showcase-relations-place'].includes(op.id)));
 }
 const wrong=structuredClone(entities);wrong.find(e=>e.id==='showcase-basics-place')!.canvasId='other';assert.throws(()=>validateSections(wrong),/同层/);
});

test('automatic layout translates archived section members too, so restoring preserves group offsets',()=>{
 const snapshot=showcaseSnapshot(),entities=snapshot.entities,c=snapshot.project.rootCanvasId;
 const op=createSection(entities,c,['showcase-basics-place','showcase-relations-place'],'Section','section');if(op.op!=='create')throw new Error('create');
 entities.push({...op,projectId:snapshot.project.id,version:1,deleted:false});
 entities.find(e=>e.id==='showcase-relations')!.data.archived=true;
 const plan=createLayoutPlan(entities,c,[],[],'grid','loose');
 const a=plan.positions['showcase-basics-place'],b=plan.positions['showcase-relations-place'];
 assert.equal(b.x-a.x,390);assert.equal(b.y-a.y,0);
 const original=entities.find(e=>e.id==='showcase-relations-place')!;
 if(b.x!==original.data.x||b.y!==original.data.y)assert.ok(plan.operations.some(op=>op.id===original.id));
});
