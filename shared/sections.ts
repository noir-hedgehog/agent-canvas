import {cardKinds,createOp,updateOp,type Entity,type Operation} from './model';
export const SECTION_PADDING=28, SECTION_HEADER=58;
export function sectionsIn(entities:Entity[],canvasId:string){return entities.filter(e=>!e.deleted&&e.kind==='section'&&e.canvasId===canvasId);}
export function sectionMembers(section:Entity,entities:Entity[]){const ids=new Set<string>(section.data.placementIds);return entities.filter(p=>ids.has(p.id)&&p.kind==='placement'&&!p.deleted);}
export function validateSections(entities:Entity[]) {
 const byId=new Map(entities.map(e=>[e.id,e])),owners=new Set<string>();
 for(const section of entities.filter(e=>e.kind==='section'&&!e.deleted)){
  const d=section.data;
  if(typeof d.title!=='string'||!Array.isArray(d.placementIds)||!d.placementIds.length||new Set(d.placementIds).size!==d.placementIds.length)throw new Error('Section 需要标题和不重复的卡片列表');
  if(!['x','y','width','height'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k]))||d.width<80||d.height<50)throw new Error('Section 尺寸或位置无效');
  for(const id of d.placementIds){
   const p=byId.get(id),object=p&&byId.get(p.data.objectId);
   if(!p||p.kind!=='placement'||p.projectId!==section.projectId||p.canvasId!==section.canvasId||!object||!(cardKinds as readonly string[]).includes(object.kind))throw new Error('Section 只能包含同层卡片，不支持嵌套');
   if(owners.has(id))throw new Error('一张卡片只能属于一个 Section');owners.add(id);
  }
 }
}
export function createSection(entities:Entity[],canvasId:string,ids:string[],title:string,id:string,measurements:{id:string;width:number;height:number}[]=[]):Operation {
 const selected=[...new Set(ids)],byId=new Map(entities.map(e=>[e.id,e]));
 if(selected.length<2)throw new Error('请至少选择两张卡片');
 const places=selected.map(id=>byId.get(id));
 if(places.some(p=>!p||p.deleted||p.kind!=='placement'||p.canvasId!==canvasId||byId.get(p.data.objectId)?.deleted||byId.get(p.data.objectId)?.data.archived))throw new Error('请选择当前画布的未归档卡片');
 const measured=new Map(measurements.map(m=>[m.id,m]));
 const ps=places as Entity[],x=Math.min(...ps.map(p=>p.data.x))-SECTION_PADDING,y=Math.min(...ps.map(p=>p.data.y))-SECTION_HEADER;
 const width=Math.max(...ps.map(p=>p.data.x+(measured.get(p.id)?.width||p.data.width)))-x+SECTION_PADDING;
 const height=Math.max(...ps.map(p=>p.data.y+(measured.get(p.id)?.height||p.data.height)))-y+SECTION_PADDING;
 const data={title:title.trim()||'Section',x,y,width,height,placementIds:selected};
 validateSections([...entities,{id,projectId:ps[0].projectId,canvasId,kind:'section',version:1,deleted:false,data}]);
 return createOp('section',canvasId,data,id);
}
export function moveSection(section:Entity,entities:Entity[],x:number,y:number):Operation[]{
 if(![x,y].every(Number.isFinite))throw new Error('Section 位置无效');
 const dx=x-section.data.x,dy=y-section.data.y;
 if(!dx&&!dy)return [];
 return [updateOp(section,{x,y}),...sectionMembers(section,entities).map(p=>updateOp(p,{x:p.data.x+dx,y:p.data.y+dy}))];
}
