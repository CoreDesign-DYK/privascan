/**
 * Book spread detection.
 *
 * A book is not a single landscape document. This detector reuses the
 * document detector for the outside boundary, then looks for the darker
 * binding shadow through the middle of the spread. The result is deliberately
 * conservative: an uncertain fold is rejected instead of saving a bad split.
 */

import { detectCornersFromCanvas } from './edge-detection';
import { type Point } from './perspective';

export type Quad = [Point, Point, Point, Point];

export interface BookDetection {
  outer: Quad;
  left: Quad;
  right: Quad;
  /** Points from the top of the spread to the bottom, used for dewarping. */
  foldCurve: Point[];
  foldConfidence: number;
}

const SAMPLE_W = 480;
const SAMPLE_H = 360;
const FOLD_ROWS = 17;

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadPointAtRow(quad: Quad, t: number, side: 'left' | 'right'): Point {
  return lerp(
    side === 'left' ? quad[0] : quad[1],
    side === 'left' ? quad[3] : quad[2],
    t,
  );
}

function averageLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight = 3,
): number {
  let total = 0;
  let count = 0;
  const startX = Math.max(0, Math.round(centerX - halfWidth));
  const endX = Math.min(width - 1, Math.round(centerX + halfWidth));
  const startY = Math.max(0, Math.round(centerY - halfHeight));
  const endY = Math.min(height - 1, Math.round(centerY + halfHeight));

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const index = (y * width + x) * 4;
      total += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      count += 1;
    }
  }
  return count ? total / count : 255;
}

function findFoldAtRow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  leftEdge: Point,
  rightEdge: Point,
): { point: Point; contrast: number } | null {
  const center = lerp(leftEdge, rightEdge, 0.5);
  const halfSpread = Math.max(20, (rightEdge.x - leftEdge.x) * 0.5);
  const searchStart = Math.max(leftEdge.x + 10, center.x - halfSpread * 0.34);
  const searchEnd = Math.min(rightEdge.x - 10, center.x + halfSpread * 0.34);
  const y = (leftEdge.y + rightEdge.y) * 0.5;
  let best: { point: Point; contrast: number } | null = null;

  for (let x = Math.round(searchStart); x <= Math.round(searchEnd); x += 2) {
    // The binding is commonly a narrow darker band. Compare it with both
    // neighbouring paper bands so text on one page is less likely to win.
    const centerLuma = averageLuminance(data, width, height, x, y, 3);
    const leftLuma = averageLuminance(data, width, height, x - 15, y, 6);
    const rightLuma = averageLuminance(data, width, height, x + 15, y, 6);
    const edgeContrast = Math.abs(
      averageLuminance(data, width, height, x - 6, y, 2) -
      averageLuminance(data, width, height, x + 6, y, 2),
    );
    // Both sides must be brighter than the candidate. A one-sided text edge
    // or illustration border should not masquerade as the binding.
    const troughContrast = Math.min(leftLuma - centerLuma, rightLuma - centerLuma);
    const centralityPenalty = Math.abs(x - center.x) / halfSpread * 3;
    const contrast = troughContrast + edgeContrast * 0.12 - centralityPenalty;

    if (!best || contrast > best.contrast) {
      best = { point: { x, y }, contrast };
    }
  }

  return best && best.contrast >= 6 ? best : null;
}

/**
 * Detect the outer spread, the binding line, and independent page quads.
 */
export function detectBookFromCanvas(src: HTMLCanvasElement): BookDetection | null {
  const outer = detectCornersFromCanvas(src);
  if (!outer) return null;

  const sample = document.createElement('canvas');
  sample.width = SAMPLE_W;
  sample.height = SAMPLE_H;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, SAMPLE_W, SAMPLE_H);

  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  } catch {
    return null;
  }

  const scaleX = SAMPLE_W / src.width;
  const scaleY = SAMPLE_H / src.height;
  const sampleOuter = outer.map(point => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  })) as Quad;

  const foldSamples: Array<{ t: number; point: Point; contrast: number }> = [];
  for (let row = 0; row < FOLD_ROWS; row++) {
    const t = row / (FOLD_ROWS - 1);
    const left = quadPointAtRow(sampleOuter, t, 'left');
    const right = quadPointAtRow(sampleOuter, t, 'right');
    const result = findFoldAtRow(image.data, SAMPLE_W, SAMPLE_H, left, right);
    if (!result) continue;
    foldSamples.push({ t, point: result.point, contrast: result.contrast });
  }

  const coverage = foldSamples.length / FOLD_ROWS;
  if (coverage < 0.78 || foldSamples.length < 10) return null;

  const meanX = foldSamples.reduce((sum, samplePoint) => sum + samplePoint.point.x, 0) / foldSamples.length;
  const meanContrast = foldSamples.reduce((sum, samplePoint) => sum + samplePoint.contrast, 0) / foldSamples.length;
  const sortedContrasts = foldSamples.map(samplePoint => samplePoint.contrast).sort((a, b) => a - b);
  const medianContrast = sortedContrasts[Math.floor(sortedContrasts.length / 2)];
  if (meanContrast < 10 || medianContrast < 8) return null;

  // Fit a straight trend first, then permit only modest curved residuals. This
  // preserves real tilted bindings while rejecting unrelated dark features
  // that jump between columns from row to row.
  const meanT = foldSamples.reduce((sum, samplePoint) => sum + samplePoint.t, 0) / foldSamples.length;
  const covariance = foldSamples.reduce(
    (sum, samplePoint) => sum + (samplePoint.t - meanT) * (samplePoint.point.x - meanX),
    0,
  );
  const tVariance = foldSamples.reduce(
    (sum, samplePoint) => sum + (samplePoint.t - meanT) ** 2,
    0,
  );
  const slope = covariance / Math.max(1e-6, tVariance);
  const intercept = meanX - slope * meanT;
  const residualRms = Math.sqrt(
    foldSamples.reduce(
      (sum, samplePoint) => sum + (samplePoint.point.x - (intercept + slope * samplePoint.t)) ** 2,
      0,
    ) / foldSamples.length,
  );
  if (residualRms > SAMPLE_W * 0.028) return null;
  for (let index = 1; index < foldSamples.length; index++) {
    const previous = foldSamples[index - 1];
    const current = foldSamples[index];
    const allowedJump = SAMPLE_W * (0.035 + (current.t - previous.t) * 0.12);
    if (Math.abs(current.point.x - previous.point.x) > allowedJump) return null;
  }

  const consistency = 1 - Math.min(1, residualRms / (SAMPLE_W * 0.028));
  const signal = Math.min(1, meanContrast / 36);
  const foldConfidence = coverage * consistency * signal;
  if (foldConfidence < 0.22) return null;

  const pointAtRow = (t: number): Point => {
    const nextIndex = foldSamples.findIndex(samplePoint => samplePoint.t >= t);
    if (nextIndex === -1) return foldSamples[foldSamples.length - 1].point;
    if (nextIndex === 0) return foldSamples[0].point;
    const previous = foldSamples[nextIndex - 1];
    const next = foldSamples[nextIndex];
    const amount = (t - previous.t) / Math.max(1e-6, next.t - previous.t);
    return lerp(previous.point, next.point, amount);
  };

  // Use the best available fold x for the top and bottom endpoints. Extending
  // the detected curve to the outer edge avoids cutting the first/last line of
  // a page merely because the binding shadow is weaker near a corner.
  const topBoundary = quadPointAtRow(sampleOuter, 0, 'left');
  const bottomBoundary = quadPointAtRow(sampleOuter, 1, 'left');
  const topRightBoundary = quadPointAtRow(sampleOuter, 0, 'right');
  const bottomRightBoundary = quadPointAtRow(sampleOuter, 1, 'right');
  const first = pointAtRow(0);
  const last = pointAtRow(1);
  const topFold = {
    x: first.x / scaleX,
    y: ((topBoundary.y + topRightBoundary.y) / 2) / scaleY,
  };
  const bottomFold = {
    x: last.x / scaleX,
    y: ((bottomBoundary.y + bottomRightBoundary.y) / 2) / scaleY,
  };
  const foldCurve = [
    topFold,
    ...Array.from({ length: FOLD_ROWS - 2 }, (_, index) => {
      const t = (index + 1) / (FOLD_ROWS - 1);
      const point = pointAtRow(t);
      return { x: point.x / scaleX, y: point.y / scaleY };
    }),
    bottomFold,
  ];

  // Keep the page quads independent even when the fold is curved. The
  // curved samples are consumed by warpBookPage; these quads provide stable
  // size/aspect estimates and the outer four corners.
  const left: Quad = [outer[0], topFold, bottomFold, outer[3]];
  const right: Quad = [topFold, outer[1], outer[2], bottomFold];

  const leftWidth = topFold.x - outer[0].x;
  const rightWidth = outer[1].x - topFold.x;
  const bottomLeftWidth = bottomFold.x - outer[3].x;
  const bottomRightWidth = outer[2].x - bottomFold.x;
  const widths = [leftWidth, rightWidth, bottomLeftWidth, bottomRightWidth];
  if (widths.some(width => width < src.width * 0.12)) return null;
  if (Math.max(...widths) / Math.min(...widths) > 2) return null;

  return {
    outer,
    left,
    right,
    foldCurve,
    foldConfidence,
  };
}