import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, realpathSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createApplication} from '../server/app.ts';

test('bundled Skill covers discovered MCP tools and its diagram examples execute over STDIO', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'agentcanvas-skill-'));
  const http=createServer();
  await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
  const port=(http.address() as {port:number}).port;
  const service=createApplication({dataDir:path.join(dir,'.data'),workspace:dir,port,seed:false});
  http.on('request',service.app);
  const client=new Client({name:'skill-example-validation',version:'1'});
  const invoke=async(name:string,args:Record<string,unknown>)=>{
    const result:any=await client.callTool({name,arguments:args});
    assert.ok(!result.isError,`${name}: ${JSON.stringify(result)}`);
    return JSON.parse(result.content[0].text);
  };
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:['--import',path.resolve('node_modules/tsx/dist/loader.mjs'),path.resolve('server/mcp.ts')],env:{...Object.fromEntries(Object.entries(process.env).filter(([,value])=>value!==undefined)) as Record<string,string>,AGENTCANVAS_DATA_DIR:path.join(dir,'.data'),AGENTCANVAS_URL:`http://127.0.0.1:${port}`},stderr:'pipe'}));
    const names=(await client.listTools()).tools.map(tool=>tool.name).sort();
    const {capabilities}=await invoke('read_usage_guide',{topic:'capabilities'});
    assert.deepEqual(Object.values(capabilities.groups).flat().sort(),names,'every exposed tool must be documented, with no fictional tools');
    for(const topic of ['overview','mcp-reference','diagram-patterns']){
      const guide=await invoke('read_usage_guide',{topic});
      assert.equal(guide.topic,topic);
      assert.ok(guide.text.length>100);
    }
    const {examples}=await invoke('read_usage_guide',{topic:'examples'});
    assert.deepEqual(examples.map((e:any)=>`${e.id}.json`).sort(),capabilities.examples.toSorted());
    for(const example of examples){
      const project=service.store.newProject(`Synthetic ${example.id}`);
      const run=`example-${example.id}`;
      const variables:Record<string,string>={PROJECT_ID:project.id,CANVAS_ID:project.rootCanvasId,RUN:run};
      for(const call of example.calls){
        assert.ok(names.includes(call.tool));
        const args=JSON.parse(JSON.stringify(call.arguments).replace(/\$\{(\w+)\}/g,(_,key)=>{assert.ok(variables[key],`unknown variable ${key}`);return variables[key];}));
        await invoke(call.tool,args);
      }
      const all=service.store.all(project.id).filter(e=>!e.deleted);
      if(example.id==='flowchart'||example.id==='vertical-flow'){
        const nodes=all.filter(e=>e.kind==='flow');
        assert.equal(nodes.length,4);
        assert.equal(new Set(nodes.map(e=>e.data.graphId)).size,1);
        const edges=all.filter(e=>e.kind==='edge');
        assert.equal(edges.length,4);
        if(example.id==='vertical-flow'){assert.equal(edges.filter(e=>e.data.sourceSide==='bottom'&&e.data.targetSide==='top').length,3);assert.equal(edges.filter(e=>e.data.sourceSide==='left'&&e.data.targetSide==='left').length,1);}
        assert.ok(edges.some(e=>e.data.source===`${run}:review:content`&&e.data.target===`${run}:work:content`));
      }else if(example.id==='swimlane'){
        const sections=all.filter(e=>e.kind==='section');
        assert.equal(sections.length,2);
        assert.equal(new Set(sections.flatMap(e=>e.data.placementIds)).size,4);
        assert.equal(all.filter(e=>e.kind==='relation').length,3);
        for(const section of sections){
          for(const id of section.data.placementIds){
            const member=all.find(e=>e.id===id)!;
            assert.equal(member.canvasId,section.canvasId);
            assert.ok(member.data.x>=section.data.x&&member.data.y>=section.data.y);
            assert.ok(member.data.x+member.data.width<=section.data.x+section.data.width);
          }
        }
      }else if(example.id==='mind-map'){
        const childId=`${run}:mind:diagram:canvas`;
        assert.equal(all.filter(e=>e.kind==='canvas').length,2);
        assert.equal(all.filter(e=>e.kind==='mind'&&e.canvasId===childId).length,3);
      }else assert.fail(`Add semantic validation for ${example.id}`);
    }
  } finally {
    await client.close();service.close();http.closeAllConnections();
    await new Promise<void>(resolve=>http.close(()=>resolve()));
    rmSync(dir,{recursive:true,force:true});
  }
});

test('Skill installer is idempotent and preserves an existing different Skill',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'agentcanvas-skill-install-'));
  const script=path.resolve('scripts/install-skill.mjs');
  const options={env:{...process.env,CODEX_HOME:dir}};
  try {
    execFileSync(process.execPath,[script],options);
    execFileSync(process.execPath,[script],options);
    const target=path.join(dir,'skills/agent-canvas');
    assert.equal(realpathSync(target),realpathSync('skills/agent-canvas'));
    rmSync(target);mkdirSync(target);writeFileSync(path.join(target,'SKILL.md'),'existing user skill');
    const refused=spawnSync(process.execPath,[script],options);
    assert.notEqual(refused.status,0);
    assert.equal(readFileSync(path.join(target,'SKILL.md'),'utf8'),'existing user skill');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
