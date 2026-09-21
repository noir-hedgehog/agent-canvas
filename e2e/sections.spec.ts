import {test,expect,type Page} from '@playwright/test';
const card=(page:Page,id:string)=>page.locator(`.react-flow__node[data-id="showcase-${id}-place"]`);
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ac-demo-workspace-v1')||'null').snapshots[0]);
async function ready(page:Page){await page.goto('./');await expect(page.locator('.mermaid-preview img')).toBeVisible();}
async function group(page:Page){await card(page,'basics').click({position:{x:6,y:6}});await card(page,'relations').click({position:{x:6,y:6},modifiers:['Shift']});await page.getByRole('button',{name:'组合为 Section',exact:true}).click();await expect(page.locator('.canvas-section')).toHaveCount(1);}

test('multiple selection uses one toolbar, section drag retains offsets, reload/undo and ungroup preserve cards',async({page})=>{
 await ready(page);
 await card(page,'basics').click({position:{x:6,y:6}});await expect(page.locator('.node-toolbar')).toBeVisible();
 await card(page,'relations').click({position:{x:6,y:6},modifiers:['Shift']});
 await expect(page.locator('.node-toolbar')).toHaveCount(0);await expect(page.locator('.react-flow__resize-control')).toHaveCount(0);
 await expect(page.locator('.multi-selection-toolbar')).toHaveCount(1);
 await page.getByRole('button',{name:'组合为 Section',exact:true}).click();await expect(page.locator('.canvas-section')).toHaveCount(1);
 const initial=await saved(page),section=initial.entities.find((e:any)=>e.kind==='section');
 await page.getByLabel('Section 名称',{exact:true}).fill('Research');await page.getByLabel('Section 名称',{exact:true}).press('Tab');
 await expect(page.locator('.section-heading')).toHaveAttribute('aria-label','移动 Section：Research');
 const a=(await card(page,'basics').boundingBox())!,b=(await card(page,'relations').boundingBox())!,heading=(await page.locator('.section-heading').boundingBox())!;
 await page.mouse.move(heading.x+12,heading.y+20);await page.mouse.down();await page.mouse.move(heading.x+112,heading.y+180,{steps:18});await page.mouse.up();
 await expect.poll(async()=>{const data=await saved(page);return data.entities.find((e:any)=>e.id===section.id).data.y;}).toBeGreaterThan(section.data.y);
 const after=await saved(page),boxA=(await card(page,'basics').boundingBox())!,boxB=(await card(page,'relations').boundingBox())!;
 expect(boxA.x-a.x).toBeCloseTo(boxB.x-b.x,1);expect(boxA.y-a.y).toBeCloseTo(boxB.y-b.y,1);
 expect(after.changes[0].entries).toHaveLength(3);
 await page.reload();await expect(page.locator('.section-heading')).toHaveAttribute('aria-label','移动 Section：Research');
 expect((await saved(page)).entities.find((e:any)=>e.id===section.id).data).toEqual(after.entities.find((e:any)=>e.id===section.id).data);
 await page.getByRole('button',{name:'解除 Section',exact:true}).click();await expect(page.locator('.canvas-section')).toHaveCount(0);
 await expect(card(page,'basics')).toBeVisible();const ungrouped=await saved(page);
 for(const id of ['showcase-basics-place','showcase-relations-place'])expect(ungrouped.entities.find((e:any)=>e.id===id).data).toEqual(after.entities.find((e:any)=>e.id===id).data);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.canvas-section')).toHaveCount(1);
 await page.screenshot({path:'test-results/section-group.png',fullPage:true});
});

test('sections remain grouped in automatic layout, read-only and grouped member edits do not move cards',async({page})=>{
 await ready(page);await group(page);
 const before=await saved(page),ids=['showcase-basics-place','showcase-relations-place'];
 await page.getByRole('button',{name:'自动布局',exact:true}).click();
 await page.getByRole('button',{name:'预览布局',exact:true}).click();await page.getByRole('button',{name:'应用布局',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'自动布局',exact:true})).toHaveCount(0);
 const after=await saved(page),positions=ids.map(id=>after.entities.find((e:any)=>e.id===id).data);
 expect(positions[1].x-positions[0].x).toBe(390);expect(positions[1].y-positions[0].y).toBe(0);
 await page.getByRole('button',{name:'只读模式',exact:true}).click();await expect(page.getByRole('button',{name:'解除 Section',exact:true})).toHaveCount(0);
 const heading=(await page.locator('.section-heading').boundingBox())!;
 await page.mouse.move(heading.x+10,heading.y+15);await page.mouse.down();await page.mouse.move(heading.x+110,heading.y+115,{steps:10});await page.mouse.up();
 expect((await saved(page)).entities).toEqual(after.entities);
});
