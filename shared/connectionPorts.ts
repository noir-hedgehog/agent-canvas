import type {Entity} from './model';

export const portSides=['auto','top','right','bottom','left'] as const;
export type PortSide=typeof portSides[number];
export type FixedSide=Exclude<PortSide,'auto'>;
export const sideHandles:Record<FixedSide,string>={left:'in',right:'out',top:'top',bottom:'bottom'};
export const handleSides:Record<string,FixedSide>={in:'left',out:'right',top:'top',bottom:'bottom'};
export const portLabels:Record<PortSide,string>={auto:'自动',top:'上',right:'右',bottom:'下',left:'左'};
export type CardRect={x:number;y:number;width:number;height:number};

/** Missing fields mean the pre-four-port renderer. Never migrate existing objects on read. */
export function resolvePorts(data:Record<string,any>,source:CardRect,target:CardRect,relation=false){
  const legacy=data.sourceSide===undefined&&data.targetSide===undefined;
  const reverse=legacy&&relation&&source.x>target.x;
  const dx=target.x+target.width/2-source.x-source.width/2;
  const dy=target.y+target.height/2-source.y-source.height/2;
  const horizontal=Math.abs(dx)/Math.max(1,(source.width+target.width)/2)>=Math.abs(dy)/Math.max(1,(source.height+target.height)/2);
  const automatic:[FixedSide,FixedSide]=horizontal?(dx>=0?['right','left']:['left','right']):(dy>=0?['bottom','top']:['top','bottom']);
  const sourceSide:FixedSide=legacy?(reverse?'left':'right'):data.sourceSide&&data.sourceSide!=='auto'?data.sourceSide:automatic[0];
  const targetSide:FixedSide=legacy?(reverse?'right':'left'):data.targetSide&&data.targetSide!=='auto'?data.targetSide:automatic[1];
  return {legacy,reverse,sourceSide,targetSide,sourceHandle:reverse?'out':sideHandles[sourceSide],targetHandle:reverse?'in':sideHandles[targetSide]};
}

export function validateConnectionPorts(entities:Entity[]){
  for(const e of entities){
    if(e.deleted||!['relation','edge','mind'].includes(e.kind))continue;
    for(const field of ['sourceSide','targetSide']){
      if(e.data[field]!==undefined&&!portSides.includes(e.data[field]))throw new Error('连线端点必须为 auto、top、right、bottom 或 left');
    }
  }
}

export function reverseConnection(e:Entity){
  return {...(e.kind==='relation'?{sourcePlacementId:e.data.targetPlacementId,targetPlacementId:e.data.sourcePlacementId}:{source:e.data.target,target:e.data.source}),
    ...(e.data.sourceSide!==undefined||e.data.targetSide!==undefined?{sourceSide:e.data.targetSide??'auto',targetSide:e.data.sourceSide??'auto'}:{})};
}
