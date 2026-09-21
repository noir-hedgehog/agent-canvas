import {sectionsIn,sectionMembers} from "./sections";
import {updateOp, type Entity, type Operation} from './model';
import {isArchived} from './archive';

export type LayoutMode = 'smart' | 'tree' | 'flow' | 'grid';
export type LayoutSpacing = 'compact' | 'standard' | 'loose';
export type LayoutRect = {id:string;x:number;y:number;width:number;height:number};
export type LayoutLink = {source:string;target:string;kind:'parent'|'flow'|'association'};
export type Measurement = {id:string;width:number;height:number;hidden?:boolean};
type Position = {x:number;y:number};
const gaps = {compact:24,standard:48,loose:80};
const reading = (a:LayoutRect,b:LayoutRect) => a.y-b.y || a.x-b.x || a.id.localeCompare(b.id);
const bounds = (nodes:LayoutRect[]) => ({width:Math.max(...nodes.map(n=>n.x+n.width)),height:Math.max(...nodes.map(n=>n.y+n.height))});
const overlap = (a:Omit<LayoutRect,'id'>,b:Omit<LayoutRect,'id'>,gap:number) => a.x < b.x+b.width+gap && a.x+a.width+gap > b.x && a.y < b.y+b.height+gap && a.y+a.height+gap > b.y;

function avoidObstacles(box:Omit<LayoutRect,'id'>,obstacles:LayoutRect[],gap:number) {
 const origin={x:box.x,y:box.y},queue=[origin],seen=new Set<string>();
 const distance=(p:Position)=>(p.x-origin.x)**2+(p.y-origin.y)**2;
 // Try nearby right/down placements first, so a small gap adjustment does not
 // unnecessarily send a selection below every other group on the canvas.
 for(let attempt=0;queue.length&&attempt<512;attempt++){
  queue.sort((a,b)=>distance(a)-distance(b)||a.y-b.y||a.x-b.x);
  const point=queue.shift()!,key=`${point.x}:${point.y}`;if(seen.has(key))continue;seen.add(key);
  const hits=obstacles.filter(o=>overlap({...box,...point},o,gap));
  if(!hits.length)return {...box,...point};
  for(const hit of hits){queue.push({x:hit.x+hit.width+gap,y:point.y},{x:point.x,y:hit.y+hit.height+gap});}
 }
 const result={...box};
 for(let attempt=0;attempt<=obstacles.length;attempt++){
  const hits=obstacles.filter(o=>overlap(result,o,gap));if(!hits.length)return result;
  result.y=Math.max(...hits.map(o=>o.y+o.height+gap));
 }
 return result;
}

function grid(nodes:LayoutRect[],gap:number,width:number):LayoutRect[] {
 let x=0,y=0,rowHeight=0;
 return [...nodes].sort(reading).map(n=>{
  if(x && x+n.width>width){x=0;y+=rowHeight+gap;rowHeight=0;}
  const next={...n,x,y};x+=n.width+gap;rowHeight=Math.max(rowHeight,n.height);return next;
 });
}

// Condense cycles before ranking. Original links stay intact, including feedback loops.
function layered(nodes:LayoutRect[],links:LayoutLink[],gap:number):LayoutRect[] {
 const order=[...nodes].sort(reading),byId=new Map(order.map(n=>[n.id,n]));
 const adjacency=new Map(order.map(n=>[n.id,[] as string[]]));
 for(const e of links)if(e.kind!=='association')adjacency.get(e.source)!.push(e.target);
 let index=0;const indices=new Map<string,number>(),low=new Map<string,number>(),stack:string[]=[],active=new Set<string>(),components:string[][]=[];
 function visit(id:string){
  indices.set(id,index);low.set(id,index++);stack.push(id);active.add(id);
  for(const next of adjacency.get(id)!){
   if(!indices.has(next)){visit(next);low.set(id,Math.min(low.get(id)!,low.get(next)!));}
   else if(active.has(next))low.set(id,Math.min(low.get(id)!,indices.get(next)!));
  }
  if(low.get(id)===indices.get(id)){const group:string[]=[];let next:string;do{next=stack.pop()!;active.delete(next);group.push(next);}while(next!==id);components.push(group);}
 }
 order.forEach(n=>{if(!indices.has(n.id))visit(n.id);});
 const component=new Map(components.flatMap((ids,i)=>ids.map(id=>[id,i] as const)));
 const successors=components.map(()=>new Set<number>()),incoming=components.map(()=>0),rank=components.map(()=>0);
 for(const [source,targets] of adjacency)for(const target of targets){const a=component.get(source)!,b=component.get(target)!;if(a!==b&&!successors[a].has(b)){successors[a].add(b);incoming[b]++;}}
 const queue=incoming.flatMap((n,i)=>n?[]:[i]);
 for(let i=0;i<queue.length;i++)for(const next of successors[queue[i]]){rank[next]=Math.max(rank[next],rank[queue[i]]+1);if(!--incoming[next])queue.push(next);}
 const layers:Array<LayoutRect[]>=[];
 for(const n of order)(layers[rank[component.get(n.id)!]]??=[]).push(n);
 // A stable barycentric pass reduces crossings without inventing relationship semantics.
 const positionIndex=new Map<string,number>();
 for(let i=0;i<layers.length;i++){
  const score=(n:LayoutRect)=>{const parents=links.filter(e=>e.kind!=='association'&&e.target===n.id&&positionIndex.has(e.source));return parents.length?parents.reduce((s,e)=>s+positionIndex.get(e.source)!,0)/parents.length:layers[i].indexOf(n);};
  const scores=new Map(layers[i].map(n=>[n.id,score(n)]));
  layers[i].sort((a,b)=>scores.get(a.id)!-scores.get(b.id)! || reading(a,b));
  layers[i].forEach((n,j)=>positionIndex.set(n.id,j));
 }
 const heights=layers.map(layer=>layer.reduce((h,n)=>h+n.height,0)+gap*(layer.length-1));
 const maxHeight=Math.max(...heights);let x=0;const result:LayoutRect[]=[];
 layers.forEach((layer,i)=>{let y=(maxHeight-heights[i])/2;for(const n of layer){result.push({...byId.get(n.id)!,x,y});y+=n.height+gap;}x+=Math.max(...layer.map(n=>n.width))+gap*2;});
 return result;
}

function tree(nodes:LayoutRect[],links:LayoutLink[],gap:number):LayoutRect[]|null {
 const byId=new Map(nodes.map(n=>[n.id,n])),children=new Map(nodes.map(n=>[n.id,[] as string[]])),parent=new Map<string,string>();
 for(const e of links.filter(e=>e.kind!=='association')){
  if(parent.has(e.target)&&parent.get(e.target)!==e.source)return null;
  if(!parent.has(e.target)){parent.set(e.target,e.source);children.get(e.source)!.push(e.target);}
 }
 const roots=nodes.filter(n=>!parent.has(n.id)).sort(reading),visiting=new Set<string>(),heights=new Map<string,number>(),depths=new Map<string,number>();
 function height(id:string,depth:number):number{
  if(visiting.has(id))throw new Error('cycle');visiting.add(id);depths.set(id,depth);
  const ids=children.get(id)!.sort((a,b)=>reading(byId.get(a)!,byId.get(b)!));
  const h=Math.max(byId.get(id)!.height,ids.reduce((s,c)=>s+height(c,depth+1),0)+gap*Math.max(0,ids.length-1));
  visiting.delete(id);heights.set(id,h);return h;
 }
 try{roots.forEach(n=>height(n.id,0));}catch{return null;}
 if(heights.size!==nodes.length)return null;
 const widths:number[]=[];for(const n of nodes){const depth=depths.get(n.id)!;widths[depth]=Math.max(widths[depth]||0,n.width);}
 const xs=widths.map((_,i)=>widths.slice(0,i).reduce((s,w)=>s+w+gap*2,0)),result:LayoutRect[]=[];
 function place(id:string,top:number){const n=byId.get(id)!,h=heights.get(id)!,kids=children.get(id)!;result.push({...n,x:xs[depths.get(id)!],y:top+(h-n.height)/2});let y=top+(h-(kids.reduce((s,c)=>s+heights.get(c)!,0)+gap*Math.max(0,kids.length-1)))/2;for(const c of kids){place(c,y);y+=heights.get(c)!+gap;}}
 let y=0;for(const root of roots){place(root.id,y);y+=heights.get(root.id)!+gap;}return result;
}

/** Pure geometry engine. Inputs and edges are never mutated; UI and future MCP can share it. */
export function autoLayout(input:{nodes:LayoutRect[];links:LayoutLink[];obstacles?:LayoutRect[];mode:LayoutMode;spacing:LayoutSpacing;targetWidth?:number}) {
 const nodes=[...input.nodes].sort(reading),gap=gaps[input.spacing],width=Math.max(640,input.targetWidth||1200);
 if(!nodes.length)return {positions:{} as Record<string,Position>,groups:0,fallbacks:0};
 if(nodes.some(n=>![n.x,n.y,n.width,n.height].every(Number.isFinite)||n.width<=0||n.height<=0))throw new Error('卡片尺寸尚未准备好，请稍后预览');
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const links=input.links.filter(e=>byId.has(e.source)&&byId.has(e.target));
 const neighbors=new Map(nodes.map(n=>[n.id,new Set<string>()]));
 for(const e of links){neighbors.get(e.source)!.add(e.target);neighbors.get(e.target)!.add(e.source);}
 const seen=new Set<string>(),groups:LayoutRect[][]=[],loose:LayoutRect[]=[];
 if(input.mode==='grid')groups.push(nodes);
 else for(const n of nodes){
  if(seen.has(n.id))continue;
  if(!neighbors.get(n.id)!.size){seen.add(n.id);loose.push(n);continue;}
  const ids=[n.id];seen.add(n.id);for(let i=0;i<ids.length;i++)for(const next of neighbors.get(ids[i])!)if(!seen.has(next)){seen.add(next);ids.push(next);}
  groups.push(ids.map(id=>byId.get(id)!));
 }
 if(loose.length)groups.push(loose);
 groups.sort((a,b)=>reading([...a].sort(reading)[0],[...b].sort(reading)[0]));
 const anchor={x:Math.min(...nodes.map(n=>n.x)),y:Math.min(...nodes.map(n=>n.y))};
 let x=0,y=0,rowHeight=0,fallbacks=0;const occupied=[...(input.obstacles||[])],positions:Record<string,Position>={};
 for(const group of groups){
  const ids=new Set(group.map(n=>n.id)),edges=links.filter(e=>ids.has(e.source)&&ids.has(e.target)),directed=edges.filter(e=>e.kind!=='association');
  let arranged:LayoutRect[];
  if(input.mode==='grid'||!directed.length)arranged=grid(group,gap,width);
  else if(input.mode==='tree'||(input.mode==='smart'&&directed.every(e=>e.kind==='parent'))){const result=tree(group,directed,gap);if(!result)fallbacks++;arranged=result||layered(group,directed,gap);}
  else arranged=layered(group,directed,gap);
  const size=bounds(arranged);
  if(x&&x+size.width>width){x=0;y+=rowHeight+gap*2;rowHeight=0;}
  // Non-selected cards are immovable obstacles. Move the whole group, preserving its structure.
  const box=avoidObstacles({x:anchor.x+x,y:anchor.y+y,...size},occupied,gap);
  for(const n of arranged)positions[n.id]={x:box.x+n.x,y:box.y+n.y};
  occupied.push({id:`group-${occupied.length}`,...box});
  rowHeight=Math.max(rowHeight,box.y-anchor.y-y+size.height);x+=size.width+gap*2;
 }
 return {positions,groups:groups.length,fallbacks};
}

export function layoutSignature(entities:Entity[],canvasId:string):string {
 return entities.filter(e=>e.canvasId===canvasId && !['annotation','request','asset'].includes(e.kind))
  .map(e=>`${e.id}:${e.version}:${e.deleted}`).sort().join('|');
}
export function createLayoutPlan(entities:Entity[],canvasId:string,selected:string[],measurements:Measurement[],mode:LayoutMode,spacing:LayoutSpacing) {
 const byId=new Map(entities.map(e=>[e.id,e])),measured=new Map(measurements.map(n=>[n.id,n]));
 const places=entities.filter(p=>p.kind==='placement'&&p.canvasId===canvasId&&!p.deleted&&!isArchived(byId.get(p.data.objectId))&&byId.get(p.data.objectId)&&!byId.get(p.data.objectId)!.deleted);
 const sections=sectionsIn(entities,canvasId),owner=new Map(sections.flatMap(e=>(e.data.placementIds as string[]).map(id=>[id,e.id] as const)));
 const visible=places.filter(p=>!measured.get(p.id)?.hidden);
 const selectedUnits=new Set(selected.map(id=>owner.get(id)||id));
 const movable=visible.filter(p=>!selected.length||selectedUnits.has(owner.get(p.id)||p.id));
 if(movable.length>300)throw new Error('单次最多整理 300 张卡片，请分组选中后整理');
 if(movable.length<2)throw new Error(selected.length?'请至少选择两张可见卡片':'当前层至少需要两张卡片');
 const rect=(p:Entity):LayoutRect=>({id:p.id,x:p.data.x,y:p.data.y,width:measured.get(p.id)?.width||p.data.width,height:measured.get(p.id)?.height||p.data.height});
 const objectPlacement=new Map(places.map(p=>[p.data.objectId,p.id])),links:LayoutLink[]=[];
 for(const e of entities){
  if(e.deleted||isArchived(e)||e.canvasId!==canvasId)continue;
  if(e.kind==='relation')links.push({source:e.data.sourcePlacementId,target:e.data.targetPlacementId,kind:e.data.lineStyle==='containment'?'parent':(e.data.lineStyle==='arrow'||(!e.data.lineStyle&&e.data.direction==='forward'))?'flow':'association'});
  if(e.kind==='mind'&&e.data.parentId)links.push({source:objectPlacement.get(e.data.parentId)!,target:objectPlacement.get(e.id)!,kind:'parent'});
  if(e.kind==='edge')links.push({source:objectPlacement.get(e.data.source)!,target:objectPlacement.get(e.data.target)!,kind:e.data.lineStyle==='association'?'association':e.data.lineStyle==='containment'?'parent':'flow'});
 }
 const units:LayoutRect[]=visible.filter(p=>!owner.has(p.id)).map(rect);
 for(const section of sections){
   const members=sectionMembers(section,entities).filter(p=>visible.includes(p));if(!members.length)continue;
   const r=members.map(rect),d=section.data;
   units.push({id:section.id,x:d.x,y:d.y,width:Math.max(d.width,measured.get(section.id)?.width||0,...r.map(p=>p.x+p.width-d.x+28)),height:Math.max(d.height,measured.get(section.id)?.height||0,...r.map(p=>p.y+p.height-d.y+28))});
 }
 const result=autoLayout({nodes:units.filter(n=>!selected.length||selectedUnits.has(n.id)),obstacles:units.filter(n=>selected.length&&!selectedUnits.has(n.id)),links:links.map(e=>({...e,source:owner.get(e.source)||e.source,target:owner.get(e.target)||e.target})).filter(e=>e.source!==e.target),mode,spacing});
 for(const section of sections){const position=result.positions[section.id];if(position)for(const p of sectionMembers(section,entities))result.positions[p.id]={x:p.data.x+position.x-section.data.x,y:p.data.y+position.y-section.data.y};}
 // A folded branch follows its nearest visible ancestor as a unit, without rearranging its hidden nodes.
 for(const p of places.filter(p=>measured.get(p.id)?.hidden&&!owner.has(p.id))){
  let object=byId.get(p.data.objectId);const seen=new Set<string>();
  while(object?.data.parentId&&!seen.has(object.id)){
   seen.add(object.id);object=byId.get(object.data.parentId);const parent=places.find(q=>q.data.objectId===object?.id);
   if(parent&&!measured.get(parent.id)?.hidden){const next=result.positions[parent.id];if(next)result.positions[p.id]={x:p.data.x+next.x-parent.data.x,y:p.data.y+next.y-parent.data.y};break;}
  }
 }
 const affected=[...new Map([...places,...sections,...sections.flatMap(section=>result.positions[section.id]?sectionMembers(section,entities):[])].map(e=>[e.id,e])).values()];
 const operations:Operation[]=affected.flatMap(p=>{const next=result.positions[p.id];return next&&(Math.abs(next.x-p.data.x)>.01||Math.abs(next.y-p.data.y)>.01)?[updateOp(p,next)]:[];});
 if(operations.length>300)throw new Error('单次最多整理 300 张卡片，请分组选中后整理');
 return {...result,operations,canvasId,signature:layoutSignature(entities,canvasId),count:movable.length};
}
export type LayoutPlan=ReturnType<typeof createLayoutPlan>;
