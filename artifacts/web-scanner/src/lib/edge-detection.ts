/**
 * On-device document boundary detection.
 *
 * The detector intentionally works from a blurred, down-sampled image:
 * text, wood grain and other small details are suppressed, while the long
 * contrast transitions that make up a document's four sides remain visible.
 * No image data leaves the device.
 */

import { type Point } from './perspective';

// A modestly larger sample keeps paper boundaries accurate enough to exclude
// narrow background strips while remaining light enough for live detection.
const SAMPLE_W = 480;
const SAMPLE_H = 360;

type Bounds = { top: number; right: number; bottom: number; left: number };
type Gradients = { gx: Float32Array; gy: Float32Array };

/** Detect document corners in a live camera frame. */
export function detectDocumentCorners(
  video: HTMLVideoElement,
  srcW: number,
  srcH: number,
): [Point, Point, Point, Point] | null {
  const sample = document.createElement('canvas');
  sample.width = SAMPLE_W;
  sample.height = SAMPLE_H;
  sample.getContext('2d')!.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);

  const corners = detectCornersFromImageData(
    sample.getContext('2d')!.getImageData(0, 0, SAMPLE_W, SAMPLE_H),
  );
  if (!corners) return null;

  return scaleCorners(corners, srcW / SAMPLE_W, srcH / SAMPLE_H);
}

/** Detect document corners from a captured image, used by the crop screen. */
export function detectCornersFromCanvas(
  src: HTMLCanvasElement,
): [Point, Point, Point, Point] | null {
  const sample = document.createElement('canvas');
  sample.width = SAMPLE_W;
  sample.height = SAMPLE_H;
  sample.getContext('2d')!.drawImage(src, 0, 0, SAMPLE_W, SAMPLE_H);

  const corners = detectCornersFromImageData(
    sample.getContext('2d')!.getImageData(0, 0, SAMPLE_W, SAMPLE_H),
  );
  if (!corners) return null;

  return scaleCorners(corners, src.width / SAMPLE_W, src.height / SAMPLE_H);
}

function detectCornersFromImageData(
  image: ImageData,
): [Point, Point, Point, Point] | null {
  const { width: w, height: h } = image;
  const gray = toGrayscale(image);

  // Blur before calculating gradients so page text and wood grain do not
  // overpower the long high-contrast document boundaries.
  const blurred = boxBlur(gray, w, h, 4);
  const { gx, gy } = sobelComponents(blurred, w, h);

  const bounds = findDocumentBounds(gx, gy, w, h);
  if (!bounds) return null;

  const search = Math.max(4, Math.round(Math.min(w, h) * 0.06));
  const top = fitHorizontalEdge(gy, w, h, bounds.top, bounds.left, bounds.right, search);
  const bottom = fitHorizontalEdge(gy, w, h, bounds.bottom, bounds.left, bounds.right, search);
  const left = fitVerticalEdge(gx, w, h, bounds.left, bounds.top, bounds.bottom, search);
  const right = fitVerticalEdge(gx, w, h, bounds.right, bounds.top, bounds.bottom, search);

  const TL = intersect(top, left);
  const TR = intersect(top, right);
  const BR = intersect(bottom, right);
  const BL = intersect(bottom, left);
  const corners: [Point, Point, Point, Point] = [TL, TR, BR, BL];

  return isValidDocumentQuad(corners, w, h) ? corners : null;
}

function scaleCorners(
  corners: [Point, Point, Point, Point],
  scaleX: number,
  scaleY: number,
): [Point, Point, Point, Point] {
  return corners.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })) as [Point, Point, Point, Point];
}

/* ── Candidate bounds ─────────────────────────────────────────────────────── */

function findDocumentBounds(
  gx: Float32Array,
  gy: Float32Array,
  w: number,
  h: number,
): Bounds | null {
  const marginX = Math.max(8, Math.round(w * 0.04));
  const marginY = Math.max(8, Math.round(h * 0.04));
  const rows = new Float32Array(h);
  const cols = new Float32Array(w);

  // gy is strongest at horizontal sides; gx is strongest at vertical sides.
  for (let y = marginY; y < h - marginY; y++) {
    let sum = 0;
    for (let x = marginX; x < w - marginX; x++) sum += Math.abs(gy[y * w + x]);
    rows[y] = sum / (w - marginX * 2);
  }
  for (let x = marginX; x < w - marginX; x++) {
    let sum = 0;
    for (let y = marginY; y < h - marginY; y++) sum += Math.abs(gx[y * w + x]);
    cols[x] = sum / (h - marginY * 2);
  }

  const rowProfile = smoothProfile(rows, Math.max(3, Math.round(h * 0.025)));
  const colProfile = smoothProfile(cols, Math.max(3, Math.round(w * 0.025)));
  const rowPeaks = findPeaks(rowProfile, marginY, h - marginY, Math.max(8, Math.round(h * 0.06)));
  const colPeaks = findPeaks(colProfile, marginX, w - marginX, Math.max(8, Math.round(w * 0.06)));

  if (rowPeaks.length < 2 || colPeaks.length < 2) return null;

  const rowMean = mean(rowProfile, marginY, h - marginY);
  const colMean = mean(colProfile, marginX, w - marginX);
  // A flat or very dark frame has no meaningful boundary signal. Returning
  // null here prevents a synthetic full-frame crop box from being shown.
  if (rowMean < 1 || colMean < 1) return null;
  let best: { bounds: Bounds; score: number } | null = null;

  for (let a = 0; a < rowPeaks.length; a++) {
    for (let b = a + 1; b < rowPeaks.length; b++) {
      const top = Math.min(rowPeaks[a], rowPeaks[b]);
      const bottom = Math.max(rowPeaks[a], rowPeaks[b]);
      const height = bottom - top;
      if (height < h * 0.22 || height > h * 0.9) continue;
      if (rowProfile[top] < rowMean * 1.15 || rowProfile[bottom] < rowMean * 1.15) continue;

      for (let c = 0; c < colPeaks.length; c++) {
        for (let d = c + 1; d < colPeaks.length; d++) {
          const left = Math.min(colPeaks[c], colPeaks[d]);
          const right = Math.max(colPeaks[c], colPeaks[d]);
          const width = right - left;
          if (width < w * 0.2 || width > w * 0.92) continue;
          if (colProfile[left] < colMean * 1.15 || colProfile[right] < colMean * 1.15) continue;

          const aspect = width / height;
          const areaRatio = (width * height) / (w * h);
          if (aspect < 0.25 || aspect > 3.5 || areaRatio < 0.1) continue;

          const horizontalSupport =
            edgeSupportHorizontal(gy, w, h, top, left, right, 4) +
            edgeSupportHorizontal(gy, w, h, bottom, left, right, 4);
          const verticalSupport =
            edgeSupportVertical(gx, w, h, left, top, bottom, 4) +
            edgeSupportVertical(gx, w, h, right, top, bottom, 4);
          const profileScore =
            rowProfile[top] / rowMean + rowProfile[bottom] / rowMean +
            colProfile[left] / colMean + colProfile[right] / colMean;

          // Prefer a meaningful central document, but do not reject documents
          // placed closer to an edge.
          const centerX = (left + right) / 2;
          const centerY = (top + bottom) / 2;
          const centerBonus = 1 - Math.min(
            1,
            Math.hypot(centerX - w / 2, centerY - h / 2) / Math.hypot(w / 2, h / 2),
          );
          const score = profileScore + horizontalSupport + verticalSupport + centerBonus * 0.25;

          if (!best || score > best.score) {
            best = { bounds: { top, right, bottom, left }, score };
          }
        }
      }
    }
  }

  return best?.bounds ?? null;
}

function findPeaks(profile: Float32Array, start: number, end: number, minDistance: number): number[] {
  const candidates: { index: number; value: number }[] = [];
  for (let i = start + 2; i < end - 2; i++) {
    const value = profile[i];
    if (
      value >= profile[i - 1] && value >= profile[i + 1] &&
      value >= profile[i - 2] && value >= profile[i + 2]
    ) candidates.push({ index: i, value });
  }

  candidates.sort((a, b) => b.value - a.value);
  const selected: number[] = [];
  for (const candidate of candidates) {
    if (selected.every(index => Math.abs(index - candidate.index) >= minDistance)) {
      selected.push(candidate.index);
      if (selected.length === 12) break;
    }
  }
  return selected;
}

function edgeSupportHorizontal(
  gy: Float32Array, w: number, h: number, y: number, left: number, right: number, radius: number,
): number {
  let sum = 0;
  for (let x = left; x <= right; x += 3) {
    let strongest = 0;
    for (let yy = Math.max(1, y - radius); yy <= Math.min(h - 2, y + radius); yy++) {
      strongest = Math.max(strongest, Math.abs(gy[yy * w + x]));
    }
    sum += strongest;
  }
  return sum / Math.max(1, Math.ceil((right - left + 1) / 3)) / 24;
}

function edgeSupportVertical(
  gx: Float32Array, w: number, h: number, x: number, top: number, bottom: number, radius: number,
): number {
  let sum = 0;
  for (let y = top; y <= bottom; y += 3) {
    let strongest = 0;
    for (let xx = Math.max(1, x - radius); xx <= Math.min(w - 2, x + radius); xx++) {
      strongest = Math.max(strongest, Math.abs(gx[y * w + xx]));
    }
    sum += strongest;
  }
  return sum / Math.max(1, Math.ceil((bottom - top + 1) / 3)) / 24;
}

/* ── Line refinement ──────────────────────────────────────────────────────── */

type HorizontalLine = { m: number; b: number };
type VerticalLine = { m: number; b: number };

function fitHorizontalEdge(
  gy: Float32Array, w: number, h: number, expectedY: number, left: number, right: number, radius: number,
): HorizontalLine {
  const points: Point[] = [];
  for (let x = left + 4; x <= right - 4; x += 4) {
    let bestY = expectedY;
    let bestValue = -1;
    for (let y = Math.max(1, expectedY - radius); y <= Math.min(h - 2, expectedY + radius); y++) {
      const value = Math.abs(gy[y * w + x]);
      if (value > bestValue) { bestValue = value; bestY = y; }
    }
    points.push({ x, y: bestY });
  }
  return fitYFromX(points, expectedY);
}

function fitVerticalEdge(
  gx: Float32Array, w: number, h: number, expectedX: number, top: number, bottom: number, radius: number,
): VerticalLine {
  const points: Point[] = [];
  for (let y = top + 4; y <= bottom - 4; y += 4) {
    let bestX = expectedX;
    let bestValue = -1;
    for (let x = Math.max(1, expectedX - radius); x <= Math.min(w - 2, expectedX + radius); x++) {
      const value = Math.abs(gx[y * w + x]);
      if (value > bestValue) { bestValue = value; bestX = x; }
    }
    points.push({ x: bestX, y });
  }
  return fitXFromY(points, expectedX);
}

function fitYFromX(points: Point[], fallbackY: number): HorizontalLine {
  if (points.length < 2) return { m: 0, b: fallbackY };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
  }
  const divisor = points.length * sumXX - sumX * sumX;
  if (Math.abs(divisor) < 0.001) return { m: 0, b: fallbackY };
  const m = (points.length * sumXY - sumX * sumY) / divisor;
  return { m, b: (sumY - m * sumX) / points.length };
}

function fitXFromY(points: Point[], fallbackX: number): VerticalLine {
  if (points.length < 2) return { m: 0, b: fallbackX };
  let sumX = 0, sumY = 0, sumXY = 0, sumYY = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumYY += p.y * p.y;
  }
  const divisor = points.length * sumYY - sumY * sumY;
  if (Math.abs(divisor) < 0.001) return { m: 0, b: fallbackX };
  const m = (points.length * sumXY - sumX * sumY) / divisor;
  return { m, b: (sumX - m * sumY) / points.length };
}

function intersect(horizontal: HorizontalLine, vertical: VerticalLine): Point {
  const denominator = 1 - vertical.m * horizontal.m;
  const x = Math.abs(denominator) < 0.01
    ? vertical.b
    : (vertical.m * horizontal.b + vertical.b) / denominator;
  return { x, y: horizontal.m * x + horizontal.b };
}

/* ── Image helpers ────────────────────────────────────────────────────────── */

function toGrayscale(img: ImageData): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return out;
}

function boxBlur(input: Float32Array, w: number, h: number, radius: number): Float32Array {
  const stride = w + 1;
  const integral = new Float32Array((h + 1) * stride);
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    for (let x = 1; x <= w; x++) {
      rowSum += input[(y - 1) * w + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(w - 1, x + radius);
      const total =
        integral[(bottom + 1) * stride + (right + 1)] -
        integral[top * stride + (right + 1)] -
        integral[(bottom + 1) * stride + left] +
        integral[top * stride + left];
      out[y * w + x] = total / ((right - left + 1) * (bottom - top + 1));
    }
  }
  return out;
}

function sobelComponents(gray: Float32Array, w: number, h: number): Gradients {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const tl = gray[idx - w - 1], tc = gray[idx - w], tr = gray[idx - w + 1];
      const ml = gray[idx - 1],                          mr = gray[idx + 1];
      const bl = gray[idx + w - 1], bc = gray[idx + w], br = gray[idx + w + 1];
      gx[idx] = -tl - 2 * ml - bl + tr + 2 * mr + br;
      gy[idx] = -tl - 2 * tc - tr + bl + 2 * bc + br;
    }
  }
  return { gx, gy };
}

function smoothProfile(profile: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(profile.length);
  for (let i = 0; i < profile.length; i++) {
    const from = Math.max(0, i - radius);
    const to = Math.min(profile.length - 1, i + radius);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += profile[j];
    out[i] = sum / (to - from + 1);
  }
  return out;
}

function mean(values: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i];
  return sum / Math.max(1, end - start);
}

function isValidDocumentQuad(corners: [Point, Point, Point, Point], w: number, h: number): boolean {
  const [TL, TR, BR, BL] = corners;
  const tolerance = Math.max(w, h) * 0.06;
  if (corners.some(p => p.x < -tolerance || p.x > w + tolerance || p.y < -tolerance || p.y > h + tolerance)) {
    return false;
  }

  const area = quadArea(TL, TR, BR, BL);
  if (area < w * h * 0.1 || area > w * h * 0.92) return false;

  const topWidth = distance(TL, TR);
  const bottomWidth = distance(BL, BR);
  const leftHeight = distance(TL, BL);
  const rightHeight = distance(TR, BR);
  const aspect = (topWidth + bottomWidth) / (leftHeight + rightHeight);
  if (aspect < 0.25 || aspect > 3.5) return false;

  // Corners must keep their clockwise order and form a convex quadrilateral.
  const signs = [
    cross(TL, TR, BR),
    cross(TR, BR, BL),
    cross(BR, BL, TL),
    cross(BL, TL, TR),
  ];
  return signs.every(value => value > 0) || signs.every(value => value < 0);
}

function quadArea(TL: Point, TR: Point, BR: Point, BL: Point): number {
  const pts = [TL, TR, BR, BL];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

/** Default corners — used only when no reliable document boundary was found. */
export function defaultCorners(
  w: number,
  h: number,
  pad = 0.08,
): [Point, Point, Point, Point] {
  const px = w * pad, py = h * pad;
  return [
    { x: px, y: py },
    { x: w - px, y: py },
    { x: w - px, y: h - py },
    { x: px, y: h - py },
  ];
}