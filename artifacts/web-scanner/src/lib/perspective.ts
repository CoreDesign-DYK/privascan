/**
 * perspective.ts
 * On-device perspective warp using a 20×20 triangle mesh.
 * No server, no library — pure Canvas API.
 */

export interface Point { x: number; y: number }

/** corners = [TL, TR, BR, BL] in source image coordinates */
export function warpPerspective(
  src: HTMLCanvasElement | HTMLImageElement,
  corners: [Point, Point, Point, Point],
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const dst = document.createElement('canvas');
  dst.width = outW;
  dst.height = outH;
  const ctx = dst.getContext('2d')!;

  const MESH = 24; // grid resolution — higher = sharper but slower

  for (let row = 0; row < MESH; row++) {
    for (let col = 0; col < MESH; col++) {
      const u0 = col / MESH,       v0 = row / MESH;
      const u1 = (col + 1) / MESH, v1 = (row + 1) / MESH;

      // Destination cell corners (rectangular grid in output)
      const d00 = { x: u0 * outW, y: v0 * outH };
      const d10 = { x: u1 * outW, y: v0 * outH };
      const d11 = { x: u1 * outW, y: v1 * outH };
      const d01 = { x: u0 * outW, y: v1 * outH };

      // Source cell corners (bilinear interpolation in input quad)
      const s00 = bilerp(corners, u0, v0);
      const s10 = bilerp(corners, u1, v0);
      const s11 = bilerp(corners, u1, v1);
      const s01 = bilerp(corners, u0, v1);

      // Upper-left triangle
      drawTexturedTri(ctx, src, d00, d10, d01, s00, s10, s01);
      // Lower-right triangle
      drawTexturedTri(ctx, src, d10, d11, d01, s10, s11, s01);
    }
  }

  return dst;
}

/** Bilinear interpolation inside the source quad: u,v ∈ [0,1] */
function bilerp(
  [TL, TR, BR, BL]: [Point, Point, Point, Point],
  u: number,
  v: number,
): Point {
  const top = lerp2(TL, TR, u);
  const bot = lerp2(BL, BR, u);
  return lerp2(top, bot, v);
}

function lerp2(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Draw a textured triangle by computing the affine transform that maps
 * source triangle (s0, s1, s2) → destination triangle (d0, d1, d2),
 * clipping the canvas to the destination, then drawing the source image
 * through that transform.
 */
function drawTexturedTri(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement,
  d0: Point, d1: Point, d2: Point,
  s0: Point, s1: Point, s2: Point,
) {
  const denom = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(denom) < 1e-6) return;

  const Δd1x = d1.x - d0.x, Δd2x = d2.x - d0.x;
  const Δd1y = d1.y - d0.y, Δd2y = d2.y - d0.y;
  const Δs1x = s1.x - s0.x, Δs2x = s2.x - s0.x;
  const Δs1y = s1.y - s0.y, Δs2y = s2.y - s0.y;

  // Affine: (sx, sy) → (dx, dy)
  // canvas setTransform(a, b, c, d, e, f):  x'=a·x+c·y+e,  y'=b·x+d·y+f
  const a  = (Δd1x * Δs2y - Δd2x * Δs1y) / denom;
  const b  = (Δd1y * Δs2y - Δd2y * Δs1y) / denom;
  const c  = (Δd2x * Δs1x - Δd1x * Δs2x) / denom;
  const d  = (Δd2y * Δs1x - Δd1y * Δs2x) / denom;
  const e  = d0.x - a * s0.x - c * s0.y;
  const f  = d0.y - b * s0.x - d * s0.y;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

/** Estimate A4 portrait output dimensions preserving aspect ratio from 4 corners */
export function estimateOutputSize(corners: [Point, Point, Point, Point]): { w: number; h: number } {
  const [TL, TR, BR, BL] = corners;
  const top  = Math.hypot(TR.x - TL.x, TR.y - TL.y);
  const bot  = Math.hypot(BR.x - BL.x, BR.y - BL.y);
  const left = Math.hypot(BL.x - TL.x, BL.y - TL.y);
  const right= Math.hypot(BR.x - TR.x, BR.y - TR.y);
  const w    = Math.round((top + bot) / 2);
  const h    = Math.round((left + right) / 2);
  return { w: Math.max(w, 100), h: Math.max(h, 100) };
}
