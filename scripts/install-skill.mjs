import {mkdirSync,lstatSync,realpathSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../skills/agent-canvas');
const parent=path.join(process.env.CODEX_HOME||path.join(homedir(),'.codex'),'skills');
const target=path.join(parent,'agent-canvas');
mkdirSync(parent,{recursive:true});
let present=false;try{lstatSync(target);present=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(present){if(realpathSync(target)!==realpathSync(source))throw new Error(`Existing skill at ${target}; not overwritten. Review it before choosing a source.`);console.log(`Skill already linked: ${target}`);}
else{symlinkSync(source,target,process.platform==='win32'?'junction':'dir');console.log(`Skill installed: ${target}`);}
