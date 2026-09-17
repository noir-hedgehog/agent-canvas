import {showcaseSnapshot} from '../shared/showcase';
import {batchSchema} from '../shared/schema';
import {fileFormat,type FileReference} from '../shared/fileReferences';
import type {Snapshot,Entity,Change,Project} from '../shared/model';

type DemoData={snapshots:Snapshot[];references:FileReference[]};
const key='ac-demo-workspace-v1';
export class DemoWorkspace {
 private data:DemoData;
 constructor(private storage:Pick<Storage,'getItem'|'setItem'>) {
  try {const saved=JSON.parse(storage.getItem(key)||'null');this.data=saved?.snapshots?.length?saved:{snapshots:[showcaseSnapshot()],references:[]};}
  catch {this.data={snapshots:[showcaseSnapshot()],references:[]};}
 }
 private save(data:DemoData){this.storage.setItem(key,JSON.stringify(data));this.data=data;}
 async request(url:string,body?:any):Promise<any> {
  const data=structuredClone(this.data),route=url.split('?')[0];
  if(route==='/api/session')return {ok:true};
  if(route==='/api/runtime')throw new Error('Pages 演示不运行 MCP 服务。请下载本地版连接 Agent。');
  if(route==='/api/projects') {
   if(!body)return data.snapshots.map(s=>s.project);
   const project:Project={id:crypto.randomUUID(),rootCanvasId:crypto.randomUUID(),name:body.name,example:false,version:1};
   data.snapshots.push({project,entities:[{id:project.rootCanvasId,projectId:project.id,canvasId:null,kind:'canvas',data:{title:'主画布'},version:1,deleted:false}],changes:[]});this.save(data);return project;
  }
  if(route==='/api/assets') {
   const s=data.snapshots.find(s=>s.project.id===body.projectId);if(!s)throw new Error('项目不存在');
   if(body.base64.length>1400000)throw new Error('演示版图片上限 1 MB；完整文件功能请使用本地版。');
   const mime=body.base64.startsWith('iVBOR')?'image/png':body.base64.startsWith('/9j/')?'image/jpeg':body.base64.startsWith('R0lGOD')?'image/gif':'image/webp';
   const entity:Entity={id:crypto.randomUUID(),projectId:s.project.id,canvasId:null,kind:'asset',version:1,deleted:false,data:{title:body.name,mime,file:'browser-only'}};
   this.storage.setItem(`ac-demo-asset:${entity.id}`,`data:${mime};base64,${body.base64}`);s.entities.push(entity);this.save(data);return entity;
  }
  if(route==='/api/batch') {
   const b=batchSchema.parse(body),s=data.snapshots.find(s=>s.project.id===b.projectId);if(!s)throw new Error('项目不存在');
   const prior=s.changes.find(c=>c.requestId===b.requestId);if(prior)return prior;
   const entries:Change['entries']=[];
   for(const op of b.operations) {
    const before=s.entities.find(e=>e.id===op.id);
    if(op.op==='create') {
     if(before)throw new Error('对象 ID 已存在');
     const after:Entity={id:op.id,projectId:b.projectId,canvasId:op.canvasId,kind:op.kind,data:op.data,version:1,deleted:false};s.entities.push(after);entries.push({before:null,after});
    }else {
     if(!before||before.version!==op.expectedVersion)throw new Error('对象版本已变化，请重新读取');
     if(op.op==='delete'&&before.id===s.project.rootCanvasId)throw new Error('不能删除根画布');
     const after={...before,version:before.version+1,data:op.op==='update'||op.op==='convert'?{...before.data,...op.patch}:before.data,kind:op.op==='convert'?op.kind:before.kind,deleted:op.op==='delete'?true:op.op==='restore'?false:before.deleted};
     s.entities[s.entities.indexOf(before)]=after;entries.push({before,after});
    }
   }
   // Demo changes are browser-only; local releases use the authoritative SQLite command service.
   let changed=true;
   while(changed){changed=false;for(const e of s.entities){if(e.deleted)continue;const owner=e.kind==='canvas'?e.data.ownerNodeId:e.kind==='mind'?e.data.parentId:e.kind==='placement'?e.data.objectId:null;if((e.canvasId&&s.entities.find(x=>x.id===e.canvasId)?.deleted)||(owner&&s.entities.find(x=>x.id===owner)?.deleted)){const before=structuredClone(e);e.deleted=true;e.version++;entries.push({before,after:structuredClone(e)});changed=true;}}}
   const change:Change={id:crypto.randomUUID(),projectId:b.projectId,actor:'human',summary:b.summary,requestId:b.requestId,createdAt:new Date().toISOString(),entries};s.changes.unshift(change);this.save(data);return change;
  }
  if(route==='/api/undo') {
   const s=data.snapshots.find(s=>s.project.id===body.projectId),original=s?.changes.find(c=>c.id===body.changeId);if(!s||!original)throw new Error('变更不存在');
   const entries:Change['entries']=original.entries.map(entry=>{const current=s.entities.find(e=>e.id===entry.after.id)!;if(current.version!==entry.after.version)throw new Error('后续修改阻止撤销');return {before:structuredClone(current),after:entry.before?{...entry.before,version:current.version+1}:{...current,version:current.version+1,deleted:true}};});
   for(const e of entries)s.entities[s.entities.findIndex(x=>x.id===e.after.id)]=e.after;
   const change:Change={id:crypto.randomUUID(),projectId:body.projectId,actor:'human',summary:'撤销演示变更',requestId:body.requestId,createdAt:new Date().toISOString(),entries,undoOf:original.id};s.changes.unshift(change);this.save(data);return change;
  }
  const match=route.match(/^\/api\/projects\/([^/]+)(.*)$/);
  if(match) {
   const projectId=decodeURIComponent(match[1]),suffix=match[2],s=data.snapshots.find(s=>s.project.id===projectId);if(!s)throw new Error('项目不存在');
   if(!suffix)return s;
   if(suffix==='/rename'&&body){if((s.project.version||1)!==body.expectedVersion)throw new Error('项目版本已变化');s.project={...s.project,name:body.name,version:body.expectedVersion+1};this.save(data);return s.project;}
   if(suffix==='/connections')return [];
   if(suffix.startsWith('/connections/'))throw new Error('演示版没有 Agent 连接');
   if(suffix==='/files'&&body){
    const previous=data.references.find(r=>r.id===body.requestId);if(previous)return previous;
    let source=body.source,remote=/^https?:\/\//i.test(source),id=body.requestId;
    if(!remote){id=source.split('/').at(-1);if(!['board.png','motion.mp4','guide.md'].includes(id))throw new Error('网页演示仅能读取内置示例或 HTTP(S) 直链，本地路径请使用本地版。');source=`demo-assets/${id}`;}
    const existing=data.references.find(r=>r.id===id&&r.projectId===projectId);if(existing)return existing;
    const format=fileFormat(source);if(!format)throw new Error('不支持的文件类型');
    const ref:FileReference={id,projectId,name:source.split('/').at(-1),source,remote,...format};data.references.push(ref);this.save(data);return ref;
   }
   if(suffix.startsWith('/files/')){const ref=data.references.find(r=>r.id===suffix.slice(7)&&r.projectId===projectId);if(!ref)throw new Error('文件引用不存在');return ref;}
   if(suffix.startsWith('/entities/'))return s.entities.find(e=>e.id===suffix.slice(10));
   if(suffix.startsWith('/changes/by-request/'))return s.changes.find(c=>c.requestId===suffix.slice(20))||null;
   if(suffix==='/changes')return s.changes;
  }
  throw new Error('此操作需要完整本地服务，网页演示暂不支持。');
 }
}
let workspace:DemoWorkspace|undefined;
export function demoApi(url:string,body?:unknown){workspace??=new DemoWorkspace(localStorage);return workspace.request(url,body);}
