import {test,expect,type Page} from '@playwright/test';
import {showcaseSnapshot} from '../shared/showcase';
const snapshot=()=>{
 const s=showcaseSnapshot(),c=s.project.rootCanvasId;
 const entity=(id:string,kind:any,data:any)=>({id,kind,canvasId:c,projectId:s.project.id,version:1,deleted:false,data});
 s.entities=[s.entities.find(e=>e.id===c)!,entity('a','card',{title:'起点卡片',body:'顶部、底部和左右都可以连接。'}),entity('b','card',{title:'终点卡片',body:'端点独立于箭头方向。'}),entity('pa','placement',{objectId:'a',x:300,y:80,width:280,height:140,heightMode:'auto'}),entity('pb','placement',{objectId:'b',x:300,y:450,width:280,height:140,heightMode:'auto'})];
 s.changes=[];return s;
};
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ac-demo-workspace-v1')!).snapshots[0]);
async function ready(page:Page,withEdge=false,mind:boolean|'flow'=false){
 const s=snapshot();
 if(mind){for(const e of s.entities.filter(e=>e.kind==='card')){e.kind=mind==='flow'?'flow':'mind';e.data={...e.data,graphId:'graph',...(mind==='flow'?{shape:'process'}:{parentId:e.id==='b'?'a':null})};}s.entities.push({id:'graph',kind:'graph',canvasId:s.project.rootCanvasId,projectId:s.project.id,version:1,deleted:false,data:{title:'导图',graphType:mind==='flow'?'flow':'mind'}});}
 if(withEdge)s.entities.push({id:'old-edge',kind:'relation',canvasId:s.project.rootCanvasId,projectId:s.project.id,version:1,deleted:false,data:{sourcePlacementId:'pa',targetPlacementId:'pb',lineStyle:'arrow',label:'原有连线'}});
 await page.addInitScript(s=>{if(!localStorage.getItem('ac-demo-workspace-v1'))localStorage.setItem('ac-demo-workspace-v1',JSON.stringify({snapshots:[s],references:[]}));},s);
 await page.goto('./');await expect(page.locator('.react-flow__node')).toHaveCount(2);
}
const handle=(page:Page,node:string,side:string)=>page.locator(`.react-flow__node[data-id="${node}"] [data-handleid="${side}"]`);
async function dragHandle(page:Page,fromNode:string,from:string,toNode:string,to:string){
 const a=(await handle(page,fromNode,from).boundingBox())!,b=(await handle(page,toNode,to).boundingBox())!;
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:18});await page.mouse.up();
}

test('vertical handle drag persists ports, supports reversal, reload and undo without moving cards',async({page})=>{
 await ready(page);await expect(handle(page,'pa','top')).toBeVisible();await expect(handle(page,'pa','bottom')).toBeVisible();
 const initial=await saved(page);
 await dragHandle(page,'pa','bottom','pb','top');
 await expect(page.getByLabel('起点端点',{exact:true})).toHaveValue('bottom');await expect(page.getByLabel('终点端点',{exact:true})).toHaveValue('top');
 let s=await saved(page),edge=s.entities.find((e:any)=>e.kind==='relation');expect(edge.data).toMatchObject({sourcePlacementId:'pa',targetPlacementId:'pb',sourceSide:'bottom',targetSide:'top'});
 await page.getByRole('button',{name:'下一步（箭头）',exact:true}).click();await page.getByRole('button',{name:'反转箭头方向',exact:true}).click();
 await expect(page.getByLabel('起点端点',{exact:true})).toHaveValue('top');await expect(page.getByLabel('终点端点',{exact:true})).toHaveValue('bottom');
 s=await saved(page);edge=s.entities.find((e:any)=>e.kind==='relation');expect(edge.data).toMatchObject({sourcePlacementId:'pb',targetPlacementId:'pa',sourceSide:'top',targetSide:'bottom'});
 for(const id of ['pa','pb'])expect(s.entities.find((e:any)=>e.id===id)).toEqual(initial.entities.find(e=>e.id===id));
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await saved(page)).entities.find((e:any)=>e.id===edge.id).data.sourceSide).toBe('bottom');
 await page.reload();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
 expect((await saved(page)).entities.find((e:any)=>e.id===edge.id).data.sourceSide).toBe('bottom');
 await page.screenshot({path:'test-results/four-port-vertical.png',fullPage:true});
});

test('legacy stays side-connected until opted into auto; moving and resizing preserves visible edges',async({page})=>{
 await ready(page,true);
 await page.getByRole('button',{name:'原有连线',exact:true}).click();
 await expect(page.getByLabel('起点端点',{exact:true})).toHaveValue('right');await expect(page.getByLabel('终点端点',{exact:true})).toHaveValue('left');
 const path=page.locator('.react-flow__edge-path');const original=await path.getAttribute('d');
 await page.getByRole('button',{name:'自动选择两端',exact:true}).click();await expect(page.getByLabel('起点端点',{exact:true})).toHaveValue('auto');
 await expect(path).not.toHaveAttribute('d',original!);
 // Check the actual SVG ends against rendered top/bottom handles, not only saved fields.
 async function endpointMatches(node:string,side:string,end:boolean){
  const point=await path.evaluate((el,end)=>{const p=el as SVGPathElement,q=p.getPointAtLength(end?p.getTotalLength():0),m=p.getScreenCTM()!;return {x:m.a*q.x+m.c*q.y+m.e,y:m.b*q.x+m.d*q.y+m.f};},end);
  const h=(await handle(page,node,side).boundingBox())!;expect(point.x).toBeCloseTo(side==='in'?h.x:side==='out'?h.x+h.width:h.x+h.width/2,0);expect(point.y).toBeCloseTo(side==='top'?h.y:side==='bottom'?h.y+h.height:h.y+h.height/2,0);
 }
 await endpointMatches('pa','bottom',false);await endpointMatches('pb','top',true);
 await page.getByRole('button',{name:'包含（粗到细）',exact:true}).click();await endpointMatches('pa','bottom',false);await endpointMatches('pb','top',true);
 await page.getByLabel('起点端点',{exact:true}).selectOption('right');await page.getByLabel('终点端点',{exact:true}).selectOption('top');
 await expect(page.getByLabel('终点端点',{exact:true})).toHaveValue('top');
 await expect.poll(async()=>(await saved(page)).entities.find((e:any)=>e.id==='old-edge').data.targetSide).toBe('top');
 await endpointMatches('pa','out',false);await endpointMatches('pb','top',true);
 await page.reload();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
 await page.getByRole('button',{name:'原有连线',exact:true}).click();await expect(page.getByLabel('起点端点',{exact:true})).toHaveValue('right');await expect(page.getByLabel('终点端点',{exact:true})).toHaveValue('top');
 await page.screenshot({path:'test-results/four-port-mixed-containment.png',fullPage:true});
 await page.getByRole('button',{name:'自动选择两端',exact:true}).click();
 const b=(await page.locator('.react-flow__node[data-id="pb"]').boundingBox())!;
 await page.mouse.move(b.x+8,b.y+8);await page.mouse.down();await page.mouse.move(b.x+408,b.y-290,{steps:20});await page.mouse.up();
 await expect.poll(async()=>(await saved(page)).entities.find((e:any)=>e.id==='pb').data.x).toBeGreaterThan(300);
 await endpointMatches('pa','out',false);await endpointMatches('pb','in',true);
 // Late size measurements (e.g. Markdown/media loading) must update port geometry.
 const beforeResize=(await handle(page,'pa','bottom').boundingBox())!.y;
 await page.locator('.react-flow__node[data-id="pa"] .canvas-card').evaluate(el=>{(el as HTMLElement).style.height='210px';});
 await expect.poll(async()=>Number((await handle(page,'pa','bottom').boundingBox())?.y)).toBeGreaterThan(beforeResize+20);
 await expect(path).toHaveAttribute('d',/^M/);

});


test('mind branch ports can be changed and adding a child preserves existing lines',async({page})=>{
 await ready(page,false,true);
 const path=page.locator('.react-flow__edge-path');await expect(path).toHaveCount(1);
 const point=await path.evaluate(el=>{const p=el as SVGPathElement,q=p.getPointAtLength(p.getTotalLength()/2),m=p.getScreenCTM()!;return {x:m.a*q.x+m.c*q.y+m.e,y:m.b*q.x+m.d*q.y+m.f};});
 await page.mouse.click(point.x,point.y);await page.getByRole('button',{name:'自动选择两端',exact:true}).click();
 await expect(page.getByLabel('起点端点',{exact:true})).toHaveValue('auto');
 expect((await saved(page)).entities.find((e:any)=>e.id==='b').data).toMatchObject({parentId:'a',sourceSide:'auto',targetSide:'auto'});
 await page.locator('.react-flow__node[data-id="pa"]').click({position:{x:6,y:6}});
 await page.getByRole('button',{name:'子节点',exact:true}).click();await expect(page.locator('.react-flow__edge-path')).toHaveCount(2);
 await page.reload();await expect(page.locator('.react-flow__edge-path')).toHaveCount(2);
});


test('native flow nodes preserve explicit top and bottom ports on their graph edge',async({page})=>{
 await ready(page,false,'flow');await dragHandle(page,'pa','bottom','pb','top');
 await expect(page.locator('.react-flow__edge-path')).toHaveCount(1);
 const edge=(await saved(page)).entities.find((e:any)=>e.kind==='edge');expect(edge.data).toMatchObject({source:'a',target:'b',sourceSide:'bottom',targetSide:'top',graphId:'graph'});
 await page.reload();await expect(page.locator('.react-flow__edge-path')).toHaveCount(1);
});
