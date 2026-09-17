import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanvasTree, filterCanvasTree, type CanvasTreeEntry } from '../shared/canvasTree.ts';
import type { Entity } from '../shared/model.ts';
const e=(id:string,kind:Entity['kind'],canvasId:string|null,data:Entity['data'],deleted=false):Entity=>({id,kind,canvasId,data,deleted,projectId:'p',version:1});
function fixture(){return [
 e('root','canvas',null,{title:'项目全景'}),e('sub','canvas',null,{title:'内部画布',ownerNodeId:'a'}),
 e('a','mind','root',{title:'主想法',childCanvasId:'sub'}),e('b','mind','root',{title:'子想法',parentId:'a'}),
 e('pa','placement','root',{objectId:'a',x:700,y:90}),e('pb','placement','root',{objectId:'b',x:200,y:50}),
 e('tasks','tasks','root',{title:'共用任务'}),e('pt','placement','root',{objectId:'tasks'}),e('ref','placement','sub',{objectId:'tasks'}),
 e('f','flow','sub',{title:'流程节点'}),e('pf','placement','sub',{objectId:'f'}),e('loop','edge','sub',{source:'f',target:'f'}),
 e('removed','note','root',{title:'已移除'},true),e('broken','placement','sub',{objectId:'removed'}),
 ];}
const flat=(n:CanvasTreeEntry):CanvasTreeEntry[]=>[n,...n.children.flatMap(flat)];
test('directory keeps mind hierarchy, child canvases and exact shared placement identities without mutations',()=>{
 const entities=fixture(), before=structuredClone(entities), tree=buildCanvasTree(entities,'root')!;
 assert.deepEqual(entities,before);
 assert.equal(tree.children.find(n=>n.id==='pa')?.children.find(n=>n.id==='pb')?.objectId,'b');
 const nested=flat(tree).find(n=>n.id==='ref')!;
 assert.equal(nested.canvasId,'sub');assert.equal(nested.referenced,true);
 assert.equal(flat(tree).filter(n=>n.objectId==='tasks').length,2);
 assert.equal(flat(tree).find(n=>n.id==='broken')?.broken,true);
 assert.equal(flat(tree).some(n=>n.id==='loop'),false);
});
test('directory search retains ancestors and malformed cycles cannot recurse forever',()=>{
 const entities=fixture(),tree=buildCanvasTree(entities,'root')!;
 const result=filterCanvasTree(tree,'流程节点')!;
 assert.deepEqual(flat(result).map(n=>n.id),['root','pa','sub','pf']);
 assert.equal(filterCanvasTree(tree,'does-not-exist'),undefined);
 entities.find(n=>n.id==='a')!.data.parentId='b';
 entities.find(n=>n.id==='f')!.data.childCanvasId='root';
 assert.ok(flat(buildCanvasTree(entities,'root')!).length<20);
});
