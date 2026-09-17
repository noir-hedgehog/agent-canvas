import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {autoLayout,createLayoutPlan,layoutSignature,type LayoutRect,type LayoutLink} from '../shared/autoLayout';
import {Store} from '../server/store';
import {createOp,placementOp,updateOp} from '../shared/model';
import {showcaseSnapshot} from '../shared/showcase';
const n=(id:string,x:number,y:number,width=230,height=150):LayoutRect=>({id,x,y,width,height});
function clear(nodes:LayoutRect[],positions:Record<string,{x:number;y:number}>,obstacles:LayoutRect[]=[]){
 const rects=nodes.map(n=>({...n,...positions[n.id]}));
 for(let i=0;i<rects.length;i++)for(const b of [...rects.slice(i+1),...obstacles]){const a=rects[i];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${a.id} overlaps ${b.id}`);}
}
test('heterogeneous grid is deterministic, preserves dimensions, and clears fixed obstacles',()=>{
 const nodes=[n('kanban',-50,10,790,550),n('note',20,40,330,700),n('image',40,50,400,260),n('text',60,60,220,100)];
 const obstacles=[n('fixed',-50,10,1500,1100)];const before=structuredClone(nodes);
 const input={nodes,obstacles,links:[],mode:'grid' as const,spacing:'standard' as const};
 const a=autoLayout(input);assert.deepEqual(a,autoLayout({...input,nodes:[...nodes].reverse()}));assert.deepEqual(nodes,before);clear(nodes,a.positions,obstacles);
 const loose=autoLayout({...input,spacing:'loose'});assert.ok(loose.positions.note.x>a.positions.note.x||loose.positions.note.y>a.positions.note.y);
});
test('tree aligns levels using maximum column width and centers variable-height branches',()=>{
 const nodes=[n('root',400,0,400,120),n('a',0,10,200,500),n('b',0,20,220,100),n('leaf',0,30)];
 const links:LayoutLink[]=[{source:'root',target:'a',kind:'parent'},{source:'root',target:'b',kind:'parent'},{source:'a',target:'leaf',kind:'parent'}];
 const result=autoLayout({nodes,links,mode:'smart',spacing:'standard'});clear(nodes,result.positions);
 assert.equal(result.positions.a.x,result.positions.b.x);assert.ok(result.positions.a.x>result.positions.root.x+400);assert.ok(result.positions.leaf.x>result.positions.a.x+200);
 assert.ok(result.positions.a.y<result.positions.b.y);
});
test('cycles and multiple parents use ranked flow without dropping or reversing links',()=>{
 const nodes=['a','b','c','d','e'].map((id,i)=>n(id,0,i*10));
 const links:LayoutLink[]=[{source:'a',target:'b',kind:'flow'},{source:'b',target:'c',kind:'flow'},{source:'c',target:'b',kind:'flow'},{source:'c',target:'d',kind:'flow'},{source:'a',target:'e',kind:'flow'},{source:'e',target:'d',kind:'flow'}];
 const before=structuredClone(links),result=autoLayout({nodes,links,mode:'tree',spacing:'compact'});clear(nodes,result.positions);
 assert.equal(result.fallbacks,1);assert.equal(result.positions.b.x,result.positions.c.x);assert.ok(result.positions.b.x>result.positions.a.x);assert.ok(result.positions.d.x>result.positions.c.x);assert.deepEqual(links,before);
});
test('selection plan changes only placement positions, excludes archives and child canvases, and tracks content versions',()=>{
 const snap=showcaseSnapshot(),before=structuredClone(snap);
 const selected=['showcase-basics-place','showcase-relations-place'];
 const plan=createLayoutPlan(snap.entities,snap.project.rootCanvasId,selected,[],'smart','standard');
 assert.equal(plan.count,2);assert.deepEqual(snap,before);
 assert.ok(plan.operations.every(op=>op.op==='update'&&selected.includes(op.id)&&Object.keys(op.patch).every(k=>['x','y'].includes(k))));
 const whole=createLayoutPlan(snap.entities,snap.project.rootCanvasId,[],[],'grid','standard');assert.ok(!whole.positions['showcase-archive-place']);
 assert.ok(!Object.keys(whole.positions).some(id=>id.includes(':node-')));
 const card=snap.entities.find(e=>e.id==='showcase-basics')!;card.version++;
 assert.notEqual(plan.signature,layoutSignature(snap.entities,snap.project.rootCanvasId));
 assert.throws(()=>createLayoutPlan(snap.entities,snap.project.rootCanvasId,[selected[0]],[],'grid','standard'),/至少选择/);
});
test('layout applies as one database change, rejects stale placements atomically, and undo restores exact positions',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ac-layout-')),store=new Store(path.join(dir,'db.sqlite'));
 try{
  const project=store.newProject('layout'),canvas=project.rootCanvasId;
  store.apply({projectId:project.id,requestId:'seed',summary:'seed',operations:[createOp('card',canvas,{title:'A'},'a'),placementOp(canvas,'a',0,0,300,120,undefined,'pa'),createOp('card',canvas,{title:'B'},'b'),placementOp(canvas,'b',20,20,500,300,undefined,'pb')]});
  const before=store.all(project.id),plan=createLayoutPlan(before,canvas,[],[],'grid','standard');
  const change=store.apply({projectId:project.id,requestId:'layout',summary:'自动布局',operations:plan.operations});
  assert.ok(change.entries.every(e=>e.after.kind==='placement'));
  store.undo(project.id,change.id,'undo');
  assert.deepEqual(store.all(project.id).filter(e=>e.kind==='placement').map(e=>e.data),before.filter(e=>e.kind==='placement').map(e=>e.data));
  const current=store.all(project.id),stale=createLayoutPlan(current,canvas,[],[],'grid','loose');
  const changed=current.find(e=>e.id==='pb')!;store.apply({projectId:project.id,requestId:'move',summary:'move',operations:[updateOp(changed,{x:5000})]});
  const snapshot=structuredClone(store.all(project.id));
  assert.throws(()=>store.apply({projectId:project.id,requestId:'stale',summary:'layout',operations:stale.operations}),/版本/);assert.deepEqual(store.all(project.id),snapshot);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('folded descendants translate with their visible parent while keeping internal geometry',()=>{
 const snap=showcaseSnapshot(),canvas='showcase-map:canvas';
 const parent=snap.entities.find(e=>e.id==='showcase-map:node-0')!;parent.data.collapsed=true;
 const children=snap.entities.filter(e=>e.kind==='placement'&&e.canvasId===canvas&&e.id.includes(':node-')&&!e.id.includes(':node-0'));
 const measured=children.map(p=>({id:p.id,width:p.data.width,height:p.data.height,hidden:true}));
 const plan=createLayoutPlan(snap.entities,canvas,[],measured,'grid','standard');
 const original=snap.entities.find(e=>e.id==='showcase-map:node-0:placement')!;
 for(const child of children){assert.equal(plan.positions[child.id].x-child.data.x,plan.positions[original.id].x-original.data.x);assert.equal(plan.positions[child.id].y-child.data.y,plan.positions[original.id].y-original.data.y);}
});
