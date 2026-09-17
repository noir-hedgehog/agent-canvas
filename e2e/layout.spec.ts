import {test,expect,type Page} from '@playwright/test';
const positions=(page:Page)=>page.locator('.react-flow__node').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.getAttribute('data-id'),(n as HTMLElement).style.transform])));
const saved=(page:Page)=>page.evaluate(()=>localStorage.getItem('ac-demo-workspace-v1'));
async function ready(page:Page){await page.goto('./');await expect(page.locator('.mermaid-preview img')).toBeVisible();}

test('layout preview never saves; cancel restores, apply is one undoable batch, reload preserves it',async({page})=>{
 await ready(page);const before=await positions(page),originalSaved=await saved(page);
 await page.getByRole('button',{name:'自动布局',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'自动布局'});
 await panel.getByLabel('布局方式').selectOption('grid');
 await panel.getByLabel('卡片间距').selectOption('loose');
 await panel.getByRole('button',{name:'预览布局',exact:true}).click();
 await expect(panel.getByText(/预览 ·/)).toBeVisible();
 await expect(panel.getByRole('button',{name:'应用布局',exact:true})).toBeEnabled();
 expect(await positions(page)).not.toEqual(before);expect(await saved(page)).toEqual(originalSaved);
 await panel.getByRole('button',{name:'取消',exact:true}).click();
 expect(await positions(page)).toEqual(before);expect(await saved(page)).toEqual(originalSaved);
 await page.getByRole('button',{name:'自动布局',exact:true}).click();
 await panel.getByRole('button',{name:'预览布局',exact:true}).click();
 await expect(panel.getByRole('button',{name:'应用布局',exact:true})).toBeEnabled();
 await page.screenshot({path:'test-results/layout-preview.png',fullPage:true});
 await panel.getByRole('button',{name:'应用布局',exact:true}).click();
 await expect(panel).not.toBeVisible();
 const after=await positions(page),data=JSON.parse((await saved(page))!);
 expect(data.snapshots[0].changes).toHaveLength(1);
 expect(data.snapshots[0].changes[0].entries.every((e:any)=>e.after.kind==='placement')).toBe(true);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(()=>positions(page)).toEqual(before);
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect.poll(()=>positions(page)).toEqual(after);
 await page.reload();await expect(page.locator('.mermaid-preview img')).toBeVisible();expect(await positions(page)).toEqual(after);
});

test('local selection layout preserves all other placements',async({page})=>{
 await ready(page);
 const a=page.locator('[data-id="showcase-basics-place"]'),b=page.locator('[data-id="showcase-relations-place"]');
 await a.click({position:{x:6,y:6}});await b.click({position:{x:6,y:6},modifiers:['Shift']});
 await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
 const before=await positions(page);
 await page.getByRole('button',{name:'自动布局',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'自动布局'});
 await panel.getByLabel('卡片间距').selectOption('loose');
 await panel.getByRole('button',{name:'预览布局',exact:true}).click();
 await expect(panel.getByRole('button',{name:'应用布局',exact:true})).toBeEnabled();
 await panel.getByRole('button',{name:'应用布局',exact:true}).click();await expect(panel).not.toBeVisible();
 const after=await positions(page);
 for(const [id,position] of Object.entries(before))if(!['showcase-basics-place','showcase-relations-place'].includes(id))expect(after[id]).toBe(position);
});

test('large card overlapping bin stays active; pointer inside bin highlights and archives on release',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'适应画布',exact:true}).click();
 const card=page.locator('[data-id="showcase-tasks-place"]'),bin=page.getByRole('button',{name:'卡片收纳箱',exact:true});
 await card.hover({position:{x:15,y:12}});
 let box=(await card.boundingBox())!,target=(await bin.boundingBox())!;
 await page.mouse.move(box.x+15,box.y+12);await page.mouse.down();
 await page.mouse.move(target.x-30,target.y-30,{steps:20});
 await expect(bin).not.toHaveClass(/drag-over/);
 box=(await card.boundingBox())!;
 expect(box.x+box.width).toBeGreaterThan(target.x);expect(box.y+box.height).toBeGreaterThan(target.y);
 await page.mouse.up();await expect(card).toBeVisible();
 await expect.poll(async()=>{const data=JSON.parse((await saved(page))!);return data.snapshots[0].entities.find((e:any)=>e.id==='showcase-tasks')?.data.archived===true;}).toBe(false);
 box=(await card.boundingBox())!;target=(await bin.boundingBox())!;
 await page.mouse.move(box.x+15,box.y+12);await page.mouse.down();
 await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:20});
 await expect(bin).toHaveClass(/drag-over/);await page.mouse.up();
 await expect(card).toHaveCount(0);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(card).toBeVisible();
});
