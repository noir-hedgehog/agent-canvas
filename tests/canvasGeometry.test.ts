import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeHandles, gridOperations} from '../shared/canvasGeometry.ts';
import type {Entity} from '../shared/model.ts';
test('explicit ports remain available before measurement and track resized card dimensions', () => {
  for (const [width,height] of [[240,130],[260,190],[620,340]]) {
    const [input,output] = nodeHandles(width,height);
    assert.equal(input.id,'in'); assert.equal(output.id,'out');
    assert.equal(input.x+input.width/2,0);
    assert.equal(output.x+output.width/2,width);
    assert.equal(input.y+input.height/2,height/2);
    assert.equal(output.y+output.height/2,height/2);
  }
});
test('grid alignment handles selection, negative coordinates, and preserves size and content', () => {
  const places = [{id:'a',data:{x:13,y:-37,width:350,height:270}},{id:'b',data:{x:48,y:73,width:260,height:190}}].map(p=>({...p,kind:'placement',version:4,deleted:false,canvasId:'c',projectId:'p'})) as Entity[];
  const before = structuredClone(places);
  assert.deepEqual(gridOperations(places,['a']),[{op:'update',id:'a',expectedVersion:4,patch:{x:24,y:-48}}]);
  assert.equal(gridOperations(places,[]).length,2);
  assert.deepEqual(places,before);
  assert.deepEqual(gridOperations([{...places[0],data:{x:24,y:48}}],[]),[]);
});

test('archive collision accepts touching corners and edges, not just pointer position', async () => {
  const {rectanglesTouch}=await import('../shared/canvasGeometry');
  const bin={x:900,y:700,width:52,height:52};
  assert.equal(rectanglesTouch({x:600,y:500,width:300,height:200},bin),true);
  assert.equal(rectanglesTouch({x:599,y:500,width:300,height:200},bin),false);
  assert.equal(rectanglesTouch({x:952,y:752,width:180,height:120},bin),true);
  assert.equal(rectanglesTouch({x:900,y:753,width:300,height:200},bin),false);
  assert.equal(rectanglesTouch({x:850,y:650,width:200,height:200},bin),true);
  assert.equal(rectanglesTouch({x:899.5,y:699.5,width:1,height:1},bin),true);
});
