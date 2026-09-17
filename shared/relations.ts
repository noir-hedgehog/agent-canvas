/** Filled cubic ribbon; width always runs from the logical source to target. */
export function taperedPath(sx: number, sy: number, tx: number, ty: number, reverse = false) {
  const cx = (sx + tx) / 2;
  const left: string[] = [], right: string[] = [];
  for(let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    const x = u*u*u*sx + 3*u*u*t*cx + 3*u*t*t*cx + t*t*t*tx;
    const y = u*u*u*sy + 3*u*u*t*sy + 3*u*t*t*ty + t*t*t*ty;
    const dx = 3*u*u*(cx-sx) + 3*t*t*(tx-cx), dy = 6*u*t*(ty-sy);
    const length = Math.hypot(dx,dy) || 1;
    const width = 1 + 5*(reverse ? t : 1-t);
    left.push(`${x-dy/length*width},${y+dx/length*width}`);
    right.push(`${x+dy/length*width},${y-dx/length*width}`);
  }
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}
