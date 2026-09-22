import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const version=JSON.parse(readFileSync(path.join(root,'package.json'))).version;
const name=`agentcanvas-${version}-local`,out=path.join(root,'release'),dir=path.join(out,name);
if(!existsSync(path.join(root,'dist/index.html')))throw new Error('请先运行 npm run build');
mkdirSync(out,{recursive:true});rmSync(dir,{recursive:true,force:true});mkdirSync(dir);
// Explicit public allowlist: never include workspace data or local MCP configuration.
for(const file of ['dist','server','shared','public','package.json','package-lock.json','README.md','AGENTS.md','docs/acceptance.md','docs/product-spec-v0.1.md','docs/public','skills/agent-canvas','start.sh','start.cmd']){mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});cpSync(path.join(root,file),path.join(dir,file),{recursive:true});}
mkdirSync(path.join(dir,'scripts'));
for(const file of ['backup.ts','stop.ts','install-skill.mjs'])cpSync(path.join(root,'scripts',file),path.join(dir,'scripts',file));
const files=[];
function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const f=path.join(folder,entry.name);if(entry.isDirectory())walk(f);else files.push(path.relative(dir,f));}}walk(dir);
writeFileSync(path.join(dir,'MANIFEST.txt'),files.sort().join('\n')+'\n');
for(const suffix of ['tar.gz','zip'])rmSync(path.join(out,`${name}.${suffix}`),{force:true});
execFileSync('tar',['-czf',`${name}.tar.gz`,name],{cwd:out,env:{...process.env,COPYFILE_DISABLE:'1'}});
execFileSync('zip',['-qr',`${name}.zip`,name],{cwd:out});
writeFileSync(path.join(out,'SHA256SUMS.txt'),['tar.gz','zip'].map(s=>`${createHash('sha256').update(readFileSync(path.join(out,`${name}.${s}`))).digest('hex')}  ${name}.${s}`).join('\n')+'\n');
console.log(`发行包已生成：${out}`);
