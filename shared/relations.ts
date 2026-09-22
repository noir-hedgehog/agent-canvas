import type {FixedSide} from './connectionPorts';

/** Cubic controls follow each port's outward normal; retain the old horizontal curve. */
export function containmentCurve(sx:number,sy:number,tx:number,ty:number,sourceSide:FixedSide='right',targetSide:FixedSide='left'){
 const vector={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
 const horizontal=sourceSide==='right'&&targetSide==='left';
 const vertical=sourceSide==='bottom'&&targetSide==='top';
 const offset=Math.max(40,Math.hypot(tx-sx,ty-sy)/2);
 const c1=horizontal?[(sx+tx)/2,sy]:vertical?[sx,(sy+ty)/2]:[sx+vector[sourceSide][0]*offset,sy+vector[sourceSide][1]*offset];
 const c2=horizontal?[(sx+tx)/2,ty]:vertical?[tx,(sy+ty)/2]:[tx+vector[targetSide][0]*offset,ty+vector[targetSide][1]*offset];
 return {c1,c2,path:`M${sx},${sy} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${tx},${ty}`,x:(sx+3*c1[0]+3*c2[0]+tx)/8,y:(sy+3*c1[1]+3*c2[1]+ty)/8};
}
/** Filled cubic ribbon; width always runs from the logical source to target. */
export function taperedPath(sx:number,sy:number,tx:number,ty:number,reverse=false,sourceSide:FixedSide='right',targetSide:FixedSide='left'){
 const {c1,c2}=containmentCurve(sx,sy,tx,ty,sourceSide,targetSide);
 const left:string[]=[],right:string[]=[];
 for(let i=0;i<=40;i++){
  const t=i/40,u=1-t;
  const x=u*u*u*sx+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*tx;
  const y=u*u*u*sy+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*ty;
  const dx=3*u*u*(c1[0]-sx)+6*u*t*(c2[0]-c1[0])+3*t*t*(tx-c2[0]);
  const dy=3*u*u*(c1[1]-sy)+6*u*t*(c2[1]-c1[1])+3*t*t*(ty-c2[1]);
  const length=Math.hypot(dx,dy)||1,width=1+5*(reverse?t:1-t);
  left.push(`${x-dy/length*width},${y+dx/length*width}`);right.push(`${x+dy/length*width},${y-dx/length*width}`);
 }
 return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
}
