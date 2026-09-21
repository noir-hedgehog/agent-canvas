import {test,expect} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createApplication} from '../server/app';
import {createOp,placementOp} from '../shared/model';

test('real MCP updates remain live over SSE while browser is read-only; versioned quote stays historical',async({page})=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ac-readonly-browser-')),server=createServer();
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as any).port,base=`http://127.0.0.1:${port}`;
 const app=createApplication({dataDir:dir,workspace:dir,port,seed:false,distDir:path.resolve('dist')});server.on('request',app.app);
 const project=app.store.newProject('只读与 MCP 验收'),canvas=project.rootCanvasId;
 app.store.apply({projectId:project.id,requestId:'seed',summary:'测试准备',operations:[createOp('card',canvas,{title:'协议测试卡片',body:'这段文字等待 Agent 更新'},'test-card'),placementOp(canvas,'test-card',80,100)]});
 const client=new Client({name:'read-only-browser-test',version:'1.0.0'});
 try{
  await page.goto(`${base}/?project=${project.id}&canvas=${canvas}`);
  await page.getByRole('button',{name:'批注模式',exact:true}).click();
  const field=page.locator('[data-comment-object="test-card"][data-comment-field="body"]');
  await expect(field).toHaveText('这段文字等待 Agent 更新');
  // Select the complete rendered field; the companion demo test uses a real mouse text drag.
  await field.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);});
  await page.getByRole('button',{name:'批注选中文字',exact:true}).click();
  await page.getByRole('textbox',{name:'批注内容',exact:true}).fill('请更新这段文字');
  await page.getByRole('button',{name:'保存讨论请求',exact:true}).click();
  await expect(page.locator('.discussion-card')).toContainText('请更新这段文字');
  await client.connect(new StdioClientTransport({command:process.execPath,args:['--import',path.resolve('node_modules/tsx/dist/loader.mjs'),path.resolve('server/mcp.ts')],env:{...Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined)) as Record<string,string>,AGENTCANVAS_DATA_DIR:dir,AGENTCANVAS_URL:base},stderr:'pipe'}));
  const invoke=async(name:string,args:Record<string,unknown>)=>{const result:any=await client.callTool({name,arguments:args});expect(result.isError).toBeFalsy();return JSON.parse(result.content[0].text);};
  const requests=await invoke('read_requests',{projectId:project.id});
  expect(requests[0].data.textContext).toMatchObject({objectId:'test-card',version:1,quote:'这段文字等待 Agent 更新'});
  await invoke('update_content',{projectId:project.id,id:'test-card',expectedVersion:1,patch:{body:'Agent 已完成更新'},summary:'MCP 在网页只读期间更新',requestId:'mcp-readonly-update'});
  await expect(field).toHaveText('Agent 已完成更新');
  await expect(page.getByRole('button',{name:'只读模式',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.discussion-card blockquote')).toHaveText('这段文字等待 Agent 更新');
  await expect(page.locator('.discussion-card')).toContainText('原卡片已更新');
  await page.screenshot({path:'test-results/readonly-live-mcp.png',fullPage:true});
  await invoke('create_content',{projectId:project.id,canvasId:canvas,kind:'card',data:{title:'Second card',body:'Section member'},x:430,y:100,requestId:'second-card'});
  const places=app.store.all(project.id).filter(e=>e.kind==='placement').map(e=>e.id);
  const args={projectId:project.id,canvasId:canvas,placementIds:places,title:'MCP Section',requestId:'mcp-section'};
  const group=await invoke('create_section',args);expect((await invoke('create_section',args)).id).toBe(group.id);
  await expect(page.locator('.canvas-section')).toHaveCount(1);
  const before=app.store.get(project.id,'mcp-section:section');
  const moveArgs={projectId:project.id,id:before.id,expectedVersion:before.version,x:before.data.x+100,y:before.data.y+80,requestId:'mcp-section-move'};
  const moved=await invoke('move_section',moveArgs);expect((await invoke('move_section',moveArgs)).id).toBe(moved.id);
  await expect(page.locator('.react-flow__node-section')).toHaveCSS('transform',`matrix(1, 0, 0, 1, ${moveArgs.x}, ${moveArgs.y})`);
  expect(app.store.all(project.id).find(e=>e.kind==='placement'&&e.data.objectId==='test-card')!.data.x).toBe(180);
  const invalid:any=await client.callTool({name:'move_section',arguments:{...moveArgs,x:999}});expect(invalid.isError).toBe(true);

 }finally{
  await client.close();await page.goto('about:blank');server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));app.store.close();rmSync(dir,{recursive:true,force:true});
 }
});
