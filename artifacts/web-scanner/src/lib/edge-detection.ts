/**
 * edge-detection.ts
 * On-device document edge detection using Canvas API Sobel filter.
 * No server, no OpenCV — works offline.
 */

import { type Point } from './perspective';

const SAMPLE_W = 320;
const SAMPLE_H = 240;

/**
 * Detect the 4 corners of a document in the given video frame.
 * Returns [TL, TR, BR, BL] in *source* image coordinates,
 * or null if no clear document is found.
 *
 * @param video   Live <video> element (camera stream)
 * @param srcW    Actual video / image width (for coordinate scaling)
 * @param srcH    Actual video / image height
 */
export function detectDocumentCorners(
  video: HTMLVideoElement,
  srcW: number,
  srcH: number,
): [Point, Point, Point, Point] | null {
  // 1. Sample the frame at low resolution
  const canvas = document.createElement('canvas');
  canvas.width  = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);

  const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  const gray      = toGrayscale(imageData);
  const edges     = sobelEdge(gray, SAMPLE_W, SAMPLE_H);
  const binary    = threshold(edges, SAMPLE_W, SAMPLE_H, 60);

  const corners = findLargestQuad(binary, SAMPLE_W, SAMPLE_H);
  if (!corners) return null;

  // Scale corners back to source resolution
  const scaleX = srcW / SAMPLE_W;
  const scaleY = srcH / SAMPLE_H;
  return corners.map(p => ({
    x: p.x * scaleX,
    y: p.y * scaleY,
  })) as [Point, Point, Point, Point];
}

/** Detect corners from a static image canvas (for edit screen on DEV mock) */
export function detectCornersFromCanvas(
  src: HTMLCanvasElement,
): [Point, Point, Point, Point] | null {
  const canvas = document.createElement('canvas');
  canvas.width  = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0, SAMPLE_W, SAMPLE_H);

  const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  const gray      = toGrayscale(imageData);
  const edges     = sobelEdge(gray, SAMPLE_W, SAMPLE_H);
  const binary    = threshold(edges, SAMPLE_W, SAMPLE_H, 60);

  const corners = findLargestQuad(binary, SAMPLE_W, SAMPLE_H);
  if (!corners) return null;

  const scaleX = src.width  / SAMPLE_W;
  const scaleY = src.height / SAMPLE_H;
  return corners.map(p => ({
    x: p.x * scaleX,
    y: p.y * scaleY,
  })) as [Point, Point, Point, Point];
}

/* ── Image processing primitives ──────────────────────────────────────────── */

function toGrayscale(img: ImageData): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return out;
}

function sobelEdge(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const tl = gray[idx - w - 1], tc = gray[idx - w], tr = gray[idx - w + 1];
      const ml = gray[idx - 1],                          mr = gray[idx + 1];
      const bl = gray[idx + w - 1], bc = gray[idx + w], br = gray[idx + w + 1];

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      out[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

function threshold(edges: Float32Array, w: number, h: number, thresh: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < edges.length; i++) {
    out[i] = edges[i] > thresh ? 1 : 0;
  }
  return out;
}

/**
 * Find the 4 extreme edge pixels (top-most, right-most, bottom-most, left-most)
 * and use them as approximate document corners [TL, TR, BR, BL].
 * This is a simplified heuristic that works well for flat documents.
 */
function findLargestQuad(
  binary: Uint8Array,
  w: number,
  h: number,
): [Point, Point, Point, Point] | null {
  // Collect edge points
  const pts: Point[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x]) pts.push({ x, y });
    }
  }
  if (pts.length < 50) return null;

  // Find corners by maximising/minimising x+y, x-y
  let TL = pts[0], TR = pts[0], BR = pts[0], BL = pts[0];
  for (const p of pts) {
    if (p.x + p.y < TL.x + TL.y) TL = p;
    if (p.x - p.y > TR.x - TR.y) TR = p;
    if (p.x + p.y > BR.x + BR.y) BR = p;
    if (p.y - p.x > BL.y - BL.x) BL = p;
  }

  // Reject if quad is too small (< 20% of image area)
  const area = quadArea(TL, TR, BR, BL);
  if (area < 0.20 * w * h) return null;

  return [TL, TR, BR, BL];
}

function quadArea(TL: Point, TR: Point, BR: Point, BL: Point): number {
  // Shoelace formula
  const pts = [TL, TR, BR, BL];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/** Default corners — full image boundary with inset padding */
export function defaultCorners(
  w: number,
  h: number,
  pad = 0.08,
): [Point, Point, Point, Point] {
  const px = w * pad, py = h * pad;
  return [
    { x: px,     y: py     }, // TL
    { x: w - px, y: py     }, // TR
    { x: w - px, y: h - py }, // BR
    { x: px,     y: h - py }, // BL
  ];
}
