import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePorts,reverseConnection} from '../shared/connectionPorts';
import {nodeHandles} from '../shared/canvasGeometry';
import {containmentCurve,taperedPath} from '../shared/relations';
import type {Entity} from '../shared/model';
const rect={x:100,y:100,width:260,height:120};
test('automatic ports follow all four directions, honor fixed ends and preserve legacy semantics',()=>{
 const a={sourceSide:'auto',targetSide:'auto'};
 for(const [x,y,s,t] of [[500,100,'right','left'],[-300,100,'left','right'],[100,400,'bottom','top'],[100,-300,'top','bottom']] as const){
  const route=resolvePorts(a,rect,{...rect,x,y},true);
  assert.equal(route.sourceSide,s);assert.equal(route.targetSide,t);assert.equal(route.reverse,false);
 }
 assert.equal(resolvePorts({sourceSide:'top',targetSide:'auto'},rect,{...rect,y:400}).sourceSide,'top');
 const legacy=resolvePorts({},rect,{...rect,x:-300},true);
 assert.equal(legacy.reverse,true);assert.equal(legacy.sourceSide,'left');assert.equal(legacy.sourceHandle,'out');assert.equal(legacy.targetHandle,'in');
 assert.equal(resolvePorts({},rect,{...rect,y:400}).sourceSide,'right');
 assert.equal(resolvePorts({},rect,{...rect,y:400}).targetSide,'left');
 for(const handle of nodeHandles(420,350)){
  assert.equal(handle.type,'source');
  if(handle.id==='top'||handle.id==='bottom'){assert.equal(handle.x+4,210);assert.equal(handle.y+4,handle.id==='top'?0:350);}
 }
 assert.equal(nodeHandles(420,350).length,4);
});
test('reversal swaps semantic IDs and fixed ports without touching cards; legacy remains legacy',()=>{
 const e={id:'r',projectId:'p',canvasId:'c',version:1,deleted:false,kind:'relation',data:{sourcePlacementId:'a',targetPlacementId:'b',sourceSide:'bottom',targetSide:'top'}} as Entity;
 assert.deepEqual(reverseConnection(e),{sourcePlacementId:'b',targetPlacementId:'a',sourceSide:'top',targetSide:'bottom'});
 assert.deepEqual(reverseConnection({...e,kind:'edge',data:{source:'a',target:'b'}}),{source:'b',target:'a'});
});
test('containment ribbons follow vertical or mixed normals and remain finite through reversals',()=>{
 const vertical=containmentCurve(100,100,100,400,'bottom','top');
 assert.deepEqual(vertical.c1,[100,250]);assert.deepEqual(vertical.c2,[100,250]);assert.equal(vertical.x,100);assert.equal(vertical.y,250);
 const mixed=containmentCurve(0,0,400,400,'right','top');assert.ok(mixed.c1[0]>0);assert.equal(mixed.c1[1],0);assert.equal(mixed.c2[0],400);assert.ok(mixed.c2[1]<400);
 for(const source of ['top','right','bottom','left'] as const)for(const target of ['top','right','bottom','left'] as const){
  assert.doesNotMatch(taperedPath(0,0,200,300,false,source,target),/NaN|Infinity/);
  assert.doesNotMatch(taperedPath(0,0,200,300,true,source,target),/NaN|Infinity/);
 }
});
