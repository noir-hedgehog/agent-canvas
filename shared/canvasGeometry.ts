import { Position } from '@xyflow/react';
import { updateOp, type Entity } from './model';
export function pointerInRectangle(event: {clientX?:number;clientY?:number;changedTouches?:ArrayLike<{clientX:number;clientY:number}>;touches?:ArrayLike<{clientX:number;clientY:number}>}, rect: {x:number;y:number;width:number;height:number}) {
  const point = event.changedTouches?.[0] || event.touches?.[0] || event;
  return typeof point.clientX === 'number' && typeof point.clientY === 'number' &&
    point.clientX >= rect.x && point.clientX <= rect.x+rect.width && point.clientY >= rect.y && point.clientY <= rect.y+rect.height;
}
export function nodeHandles(width: number, height: number) {
  return [
    {id:'in',type:'target' as const,position:Position.Left,x:-4,y:height/2-4,width:8,height:8},
    {id:'out',type:'source' as const,position:Position.Right,x:width-4,y:height/2-4,width:8,height:8},
  ];
}
export function gridOperations(placements: Entity[], selected: string[], grid = 24) {
  return placements.filter(p => !selected.length || selected.includes(p.id)).flatMap(p => {
    const x = Math.round(p.data.x/grid)*grid, y = Math.round(p.data.y/grid)*grid;
    return x === p.data.x && y === p.data.y ? [] : [updateOp(p,{x,y})];
  });
}
