import {test,expect,type Page} from '@playwright/test';

test('switching to read-only waits for a blurred draft and preserves a manual lock',async({page})=>{
 await ready(page);
 const title=card(page).locator('input');
 await title.fill('Unsaved title');
 await page.getByRole('button',{name:'只读模式',exact:true}).click();
 await expect(card(page).locator('[data-comment-field="title"]')).toHaveText('Unsaved title');
 const snapshot=(await state(page)).snapshots[0];
 expect(snapshot.entities.find((e:any)=>e.id==='showcase-basics').data.title).toBe('Unsaved title');
 await page.getByRole('button',{name:'批注模式',exact:true}).click();
 await page.getByRole('button',{name:'批注模式',exact:true}).click();
 await expect(page.getByRole('button',{name:'只读模式',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'只读模式',exact:true}).click();
 await expect(title).toHaveValue('Unsaved title');
});
const card=(page:Page,id='basics')=>page.locator(`.react-flow__node[data-id="showcase-${id}-place"]`);
async function ready(page:Page){await page.goto('./');await expect(page.locator('.mermaid-preview img')).toBeVisible();}
async function state(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('ac-demo-workspace-v1')||'null'));}

test('read-only blocks content editing, drag, delete and layout, allows navigation and restores editing',async({page})=>{
 await ready(page);
 await page.getByRole('button',{name:'只读模式',exact:true}).click();
 await expect(page.getByRole('button',{name:'只读模式',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'自动布局',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'空白卡片',exact:true})).toHaveCount(0);
 await expect(card(page).locator('textarea,input')).toHaveCount(0);
 const before=await card(page).evaluate(el=>(el as HTMLElement).style.transform),original=await state(page);
 await card(page).click({position:{x:6,y:6}});
 await expect(page.getByRole('button',{name:'删除卡片',exact:true})).toHaveCount(0);
 const box=(await card(page).boundingBox())!;await page.mouse.move(box.x+6,box.y+6);await page.mouse.down();await page.mouse.move(box.x+86,box.y+80,{steps:8});await page.mouse.up();
 await page.keyboard.press('Delete');
 expect(await card(page).evaluate(el=>(el as HTMLElement).style.transform)).toEqual(before);expect(await state(page)).toEqual(original);
 await page.getByRole('button',{name:'进入 03 / 功能地图 · 点此进入',exact:true}).click();
 await expect(page.getByRole('button',{name:'主画布',exact:true})).toBeVisible();await page.getByRole('button',{name:'主画布',exact:true}).click();
 await page.getByRole('button',{name:'只读模式',exact:true}).click();
 await expect(card(page).locator('input')).toBeVisible();
});

test('comment mode selects rendered Markdown text, saves its exact versioned context and preserves card content',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'批注模式',exact:true}).click();
 await expect(page.getByRole('button',{name:'只读模式',exact:true})).toHaveAttribute('aria-pressed','true');
 const text=card(page).locator('[data-comment-field="body"] p').first();
 // Real text drag, backwards across a single rendered paragraph.
 const box=(await text.boundingBox())!;
 await page.mouse.move(box.x+box.width-2,box.y+box.height-4);await page.mouse.down();await page.mouse.move(box.x+1,box.y+3,{steps:14});await page.mouse.up();
 await expect(page.getByRole('button',{name:'批注选中文字',exact:true})).toBeVisible();
 const quote=await page.evaluate(()=>window.getSelection()?.toString());expect(quote?.length).toBeGreaterThan(4);
 await page.getByRole('button',{name:'批注选中文字',exact:true}).click();
 await expect(page.locator('.comment-compose blockquote')).toHaveText(quote!);
 await page.getByRole('textbox',{name:'批注内容',exact:true}).fill('请补充这一段的例子');
 await page.getByRole('button',{name:'保存讨论请求',exact:true}).click();
 await expect(page.locator('.discussion-card').getByText('请补充这一段的例子',{exact:true})).toBeVisible();
 const saved=await state(page),snapshot=saved.snapshots[0];
 const request=snapshot.entities.find((e:any)=>e.kind==='request'&&e.data.instruction==='请补充这一段的例子');
 expect(request.data.textContext).toMatchObject({objectId:'showcase-basics',version:1,field:'body',quote,coordinateSpace:'rendered-text'});
 expect(request.data.targets).toHaveLength(1);expect(snapshot.entities.find((e:any)=>e.id==='showcase-basics').version).toBe(1);
 await page.screenshot({path:'test-results/readonly-text-comment.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:'批注列表',exact:true}).click();
 await expect(page.locator('.discussion-card blockquote')).toHaveText(quote!);
});

test('comment mode marquee creates one request covering multiple cards without moving them',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'批注模式',exact:true}).click();
 await page.getByRole('button',{name:'收起侧栏',exact:true}).click();
 const a=(await card(page).boundingBox())!,b=(await card(page,'relations').boundingBox())!;
 const start={x:a.x-10,y:Math.min(a.y,b.y)-10};
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(b.x+b.width+8,Math.max(a.y+a.height,b.y+b.height)+8,{steps:20});await page.mouse.up();
 await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
 await expect(page.locator('.selection-caption')).toContainText('已引用 2 项内容');
 await page.getByRole('textbox',{name:'批注内容',exact:true}).fill('对照这两张卡片完善说明');
 await page.getByRole('button',{name:'保存讨论请求',exact:true}).click();
 await expect(page.locator('.discussion-card').getByText('对照这两张卡片完善说明',{exact:true})).toBeVisible();
 const snapshot=(await state(page)).snapshots[0],r=snapshot.entities.find((e:any)=>e.data.instruction==='对照这两张卡片完善说明');
 expect(r.data.targets.map((t:any)=>t.id).sort()).toEqual(['showcase-basics','showcase-relations']);expect(r.data.textContext).toBeUndefined();
 expect(snapshot.changes.every((c:any)=>c.entries.every((e:any)=>['annotation','request'].includes(e.after.kind)))).toBe(true);
});
