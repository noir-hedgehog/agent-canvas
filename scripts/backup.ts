import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,cpSync,existsSync,chmodSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=path.resolve(process.env.AGENTCANVAS_DATA_DIR || path.join(root,'.agentcanvas'));
const destination=path.resolve(process.argv[2] || path.join(source,'backups',new Date().toISOString().replaceAll(':','-')));
if(destination===source || source.startsWith(destination+path.sep))throw new Error('备份目标不能覆盖数据目录');
mkdirSync(destination,{recursive:true,mode:0o700});chmodSync(destination,0o700);
const db=new DatabaseSync(path.join(source,'workspace.sqlite'));
try{db.prepare('VACUUM INTO ?').run(path.join(destination,'workspace.sqlite'));}finally{db.close();}
for(const file of ['assets','token'])if(existsSync(path.join(source,file)))cpSync(path.join(source,file),path.join(destination,file),{recursive:true});
console.log(`备份已保存：${destination}（包含凭据；引用的原文件请另行备份）`);
