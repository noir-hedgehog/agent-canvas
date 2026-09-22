import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
const root=realpathSync(path.resolve(process.argv[2]));
const data=mkdtempSync(path.join(tmpdir(),'ac-release-smoke-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`;let child,cookie;
async function launch(){child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env:{...process.env,AGENTCANVAS_PORT:String(port),AGENTCANVAS_DATA_DIR:data},stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(output);try{const r=await fetch(base+'/api/session');if(r.ok){cookie=r.headers.get('set-cookie').split(';')[0];return;}}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Startup timeout '+output);}
async function stop(){if(!child||child.exitCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}
async function request(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,route);return r.json();}
try {
 assert.ok(!existsSync(path.join(root,'docs/local-ops.md')),'private operations notes must not enter release');
 execFileSync(process.execPath,[path.join(root,'scripts/install-skill.mjs')],{env:{...process.env,CODEX_HOME:path.join(data,'codex-test')}});
 assert.equal(realpathSync(path.join(data,'codex-test/skills/agent-canvas')),realpathSync(path.join(root,'skills/agent-canvas')));
 await launch();const projects=await request('/api/projects');assert.equal(projects.length,1);assert.ok(projects[0].example);
 const project=projects[0],snapshot=await request('/api/projects/'+project.id);
 assert.equal(snapshot.entities.filter(e=>e.kind==='canvas').length,4);
 assert.equal((await fetch(base+'/')).status,200);
 for(const name of ['board.png','motion.mp4','guide.md']){const ref=await request(`/api/projects/${project.id}/files`,{source:`demo-assets/${name}`,requestId:crypto.randomUUID()});const r=await fetch(base+`/api/projects/${project.id}/files/${ref.id}/content`,{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>50);}
 const entity=snapshot.entities.find(e=>e.id==='showcase-basics');
 await request('/api/batch',{projectId:project.id,requestId:'release-persist',summary:'发行包持久化验收',operations:[{op:'update',id:entity.id,expectedVersion:entity.version,patch:{body:'restart persistence verified'}}]});
 const runtime=await request('/api/runtime');assert.ok(runtime.mcp.args.every(a=>typeof a==='string'));assert.equal(runtime.workspace,root);
 const client=new Client({name:'release-smoke',version:'1'});
 try { await client.connect(new StdioClientTransport({command:process.execPath,args:['--import',path.join(root,'node_modules/tsx/dist/loader.mjs'),path.join(root,'server/mcp.ts')],env:{PATH:process.env.PATH,AGENTCANVAS_URL:base,AGENTCANVAS_DATA_DIR:data},stderr:'pipe'}));
 assert.ok((await client.listTools()).tools.some(t=>t.name==='read_canvas'));
 for(const topic of ['overview','capabilities','examples']){const guide=await client.callTool({name:'read_usage_guide',arguments:{topic}});assert.ok(!guide.isError);assert.equal(JSON.parse(guide.content[0].text).topic,topic);}
 const result=await client.callTool({name:'read_canvas',arguments:{projectId:project.id,canvasId:project.rootCanvasId}});assert.ok(!result.isError);
 } finally {await client.close();}
 await stop();await launch();assert.equal((await request('/api/projects/'+project.id)).entities.find(e=>e.id===entity.id).data.body,'restart persistence verified');
 console.log('PASS: extracted release startup, static UI, three file formats, sample hierarchy, STDIO MCP read and bundled guides, Skill installation, restart persistence');
}finally{await stop();rmSync(data,{recursive:true,force:true});}
