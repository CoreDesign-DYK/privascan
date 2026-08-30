/**
 * ID-card detection constrained by the active 1.585:1 guide.
 *
 * Unlike the document detector, this looks for four long contrast
 * transitions around a known landscape card frame. That keeps a strong desk
 * edge or a shadow below the card from becoming the saved bottom boundary.
 */

import { type Point } from './perspective';

export const ID_CARD_ASPECT_RATIO = 85.6 / 54;

export interface IdCardDetection {
  corners: [Point, Point, Point, Point];
  confidence: number;
  edgeCoverage: number;
  aspectRatio: number;
  sharpness: number;
}

type GuideQuad = [Point, Point, Point, Point];
type Line = { a: number; b: number; c: number };
type ColorSignals = {
  luminance: Float32Array;
  chroma: Float32Array;
};

const SAMPLE_MAX_WIDTH = 640;
const SAMPLE_MAX_HEIGHT = 480;
const MIN_EDGE_CONTRAST = 14;
const MIN_EDGE_COVERAGE = 0.72;
const MIN_CARD_ASPECT_RATIO = 1.45;
const MAX_CARD_ASPECT_RATIO = 1.78;
const MIN_INTERIOR_SHARPNESS = 2.8;

export function detectIdCardFromCanvas(
  source: HTMLCanvasElement,
  guideCorners: GuideQuad,
): IdCardDetection | null {
  if (!source.width || !source.height) return null;
  const scale = Math.min(
    1,
    SAMPLE_MAX_WIDTH / source.width,
    SAMPLE_MAX_HEIGHT / source.height,
  );
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const sampledGuide = guideCorners.map(point => ({
    x: point.x * scale,
    y: point.y * scale,
  })) as GuideQuad;
  const detection = detectIdCardFromImageData(image, sampledGuide);
  if (!detection) return null;
  return {
    ...detection,
    corners: detection.corners.map(point => ({
      x: point.x / scale,
      y: point.y / scale,
    })) as GuideQuad,
  };
}

/**
 * Refine a low-resolution candidate against the original capture pixels.
 *
 * Only narrow strips around the four candidate sides are read. This preserves
 * full-resolution edge placement without allocating a second full 4K frame,
 * which is important on memory-constrained iPhones.
 */
export function refineIdCardCornersFromCanvas(
  source: HTMLCanvasElement,
  candidate: IdCardDetection,
): IdCardDetection | null {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const guide = candidate.corners;
  const guideWidth = averageLength(guide[0], guide[1], guide[3], guide[2]);
  const guideHeight = averageLength(guide[0], guide[3], guide[1], guide[2]);
  const searchRadius = Math.max(8, Math.round(Math.min(guideWidth, guideHeight) * 0.045));
  const refinedSides = guide.map((start, index) => {
    const end = guide[(index + 1) % guide.length];
    return detectSideInCanvasStrip(
      context,
      source.width,
      source.height,
      start,
      end,
      guide,
      searchRadius,
    );
  });
  if (refinedSides.some(side => !side)) return null;

  const lines = refinedSides.map(side => side!.line);
  const corners: GuideQuad = [
    intersect(lines[3], lines[0]),
    intersect(lines[0], lines[1]),
    intersect(lines[1], lines[2]),
    intersect(lines[2], lines[3]),
  ];
  if (!isLikelyIdCardQuad(corners)) return null;

  const maxCornerMovement = Math.min(guideWidth, guideHeight) * 0.075;
  if (corners.some((corner, index) => (
    Math.hypot(corner.x - guide[index].x, corner.y - guide[index].y) > maxCornerMovement
  ))) return null;

  const cardWidth = averageLength(corners[0], corners[1], corners[3], corners[2]);
  const cardHeight = averageLength(corners[0], corners[3], corners[1], corners[2]);
  const edgeCoverage =
    refinedSides.reduce((sum, side) => sum + side!.coverage, 0) / refinedSides.length;
  const edgeContrast =
    refinedSides.reduce((sum, side) => sum + side!.contrast, 0) / refinedSides.length;
  if (edgeCoverage < MIN_EDGE_COVERAGE || edgeContrast < MIN_EDGE_CONTRAST) return null;

  return {
    corners,
    edgeCoverage,
    aspectRatio: cardWidth / Math.max(1, cardHeight),
    sharpness: candidate.sharpness,
    confidence: Math.max(
      0,
      Math.min(1, edgeCoverage * 0.6 + Math.min(1, edgeContrast / 48) * 0.4),
    ),
  };
}

export function detectIdCardFromImageData(
  image: ImageData,
  guideCorners: GuideQuad,
): IdCardDetection | null {
  const { width, height } = image;
  if (width < 40 || height < 40 || !isConvexQuad(guideCorners)) return null;
  const color = toColorSignals(image);
  const sides = [
    detectSide(color, width, height, guideCorners[0], guideCorners[1], guideCorners),
    detectSide(color, width, height, guideCorners[1], guideCorners[2], guideCorners),
    detectSide(color, width, height, guideCorners[2], guideCorners[3], guideCorners),
    detectSide(color, width, height, guideCorners[3], guideCorners[0], guideCorners),
  ];
  if (sides.some(side => !side)) return null;

  const lines = sides.map(side => side!.line);
  const corners: GuideQuad = [
    intersect(lines[3], lines[0]),
    intersect(lines[0], lines[1]),
    intersect(lines[1], lines[2]),
    intersect(lines[2], lines[3]),
  ];
  if (corners.some(point => !point) || !isConvexQuad(corners)) return null;

  const guideWidth = averageLength(guideCorners[0], guideCorners[1], guideCorners[3], guideCorners[2]);
  const guideHeight = averageLength(guideCorners[0], guideCorners[3], guideCorners[1], guideCorners[2]);
  const cardWidth = averageLength(corners[0], corners[1], corners[3], corners[2]);
  const cardHeight = averageLength(corners[0], corners[3], corners[1], corners[2]);
  const widthRatio = cardWidth / Math.max(1, guideWidth);
  const heightRatio = cardHeight / Math.max(1, guideHeight);
  const aspectRatio = cardWidth / Math.max(1, cardHeight);
  if (
    widthRatio < 0.62 || widthRatio > 1.18 ||
    heightRatio < 0.62 || heightRatio > 1.18 ||
    aspectRatio < MIN_CARD_ASPECT_RATIO || aspectRatio > MAX_CARD_ASPECT_RATIO
  ) return null;

  const edgeCoverage = sides.reduce((sum, side) => sum + side!.coverage, 0) / sides.length;
  const edgeContrast = sides.reduce((sum, side) => sum + side!.contrast, 0) / sides.length;
  if (edgeCoverage < MIN_EDGE_COVERAGE || edgeContrast < MIN_EDGE_CONTRAST) return null;
  const sharpness = measureInteriorSharpness(color.luminance, width, height, corners);
  if (sharpness < MIN_INTERIOR_SHARPNESS) return null;

  const fitScore = 1 - Math.min(
    1,
    Math.abs(widthRatio - 0.92) * 1.5 + Math.abs(heightRatio - 0.92) * 1.5,
  );
  const contrastScore = Math.min(1, edgeContrast / 48);
  return {
    corners,
    edgeCoverage,
    aspectRatio,
    sharpness,
    confidence: Math.max(
      0,
      Math.min(1, edgeCoverage * 0.45 + contrastScore * 0.35 + fitScore * 0.2),
    ),
  };
}

export function isLikelyIdCardQuad(
  corners: [Point, Point, Point, Point],
): boolean {
  if (!isConvexQuad(corners)) return false;
  const width = averageLength(corners[0], corners[1], corners[3], corners[2]);
  const height = averageLength(corners[0], corners[3], corners[1], corners[2]);
  const aspectRatio = width / Math.max(1, height);
  return (
    aspectRatio >= MIN_CARD_ASPECT_RATIO &&
    aspectRatio <= MAX_CARD_ASPECT_RATIO &&
    width >= 120 &&
    height >= 70
  );
}

function measureInteriorSharpness(
  luminance: Float32Array,
  width: number,
  height: number,
  corners: GuideQuad,
): number {
  const minX = Math.max(2, Math.round(Math.min(...corners.map(point => point.x))));
  const maxX = Math.min(width - 3, Math.round(Math.max(...corners.map(point => point.x))));
  const minY = Math.max(2, Math.round(Math.min(...corners.map(point => point.y))));
  const maxY = Math.min(height - 3, Math.round(Math.max(...corners.map(point => point.y))));
  const insetX = Math.round((maxX - minX) * 0.12);
  const insetY = Math.round((maxY - minY) * 0.12);
  let detailTotal = 0;
  let samples = 0;
  for (let y = minY + insetY; y <= maxY - insetY; y += 2) {
    for (let x = minX + insetX; x <= maxX - insetX; x += 2) {
      const center = luminance[y * width + x];
      const laplacian = Math.abs(
        luminance[(y - 1) * width + x] +
        luminance[(y + 1) * width + x] +
        luminance[y * width + x - 1] +
        luminance[y * width + x + 1] -
        center * 4,
      );
      detailTotal += Math.min(60, laplacian);
      samples += 1;
    }
  }
  return samples ? detailTotal / samples : 0;
}

function detectSide(
  color: ColorSignals,
  width: number,
  height: number,
  start: Point,
  end: Point,
  guide: GuideQuad,
  requestedMaxOffset?: number,
  requestedSampleCount?: number,
  offsetPenalty = 4.5,
): { line: Line; coverage: number; contrast: number } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const tangentX = dx / length;
  const tangentY = dy / length;
  // Guide points are clockwise in image coordinates, so this normal points
  // toward the inside of the card for all four sides.
  const normalX = -tangentY;
  const normalY = tangentX;
  const guideWidth = averageLength(guide[0], guide[1], guide[3], guide[2]);
  const guideHeight = averageLength(guide[0], guide[3], guide[1], guide[2]);
  const maxOffset = requestedMaxOffset
    ?? Math.max(8, Math.round(Math.min(guideWidth, guideHeight) * 0.23));
  const offsetStep = Math.max(1, Math.round(maxOffset / 28));
  const sampleCount = requestedSampleCount
    ?? Math.max(20, Math.min(64, Math.round(length / 8)));
  const accepted: Point[] = [];
  const strengths: number[] = [];

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex++) {
    const t = 0.1 + (sampleIndex / sampleCount) * 0.8;
    const baseX = start.x + dx * t;
    const baseY = start.y + dy * t;
    let bestStrength = 0;
    let bestOffset = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let offset = -maxOffset; offset <= maxOffset; offset += offsetStep) {
      const pointX = baseX + normalX * offset;
      const pointY = baseY + normalY * offset;
      const outside = sampleSignal(
        color,
        width,
        height,
        pointX - normalX * 5,
        pointY - normalY * 5,
      );
      const inside = sampleSignal(
        color,
        width,
        height,
        pointX + normalX * 5,
        pointY + normalY * 5,
      );
      if (outside === null || inside === null) continue;
      const strength = Math.abs(inside - outside);
      // The fixed guide is a strong geometric prior. A distant table edge may
      // have more contrast than the card itself, so prefer a sufficiently
      // strong transition close to the guide instead of blindly taking the
      // strongest transition in the whole search band.
      const score = strength - Math.abs(offset) * offsetPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestStrength = strength;
        bestOffset = offset;
      }
    }
    if (bestStrength >= MIN_EDGE_CONTRAST) {
      accepted.push({
        x: baseX + normalX * bestOffset,
        y: baseY + normalY * bestOffset,
      });
      strengths.push(bestStrength);
    }
  }

  const coverage = accepted.length / Math.max(1, sampleCount + 1);
  if (accepted.length < 4 || coverage < MIN_EDGE_COVERAGE) return null;
  const initialLine = fitLine(accepted);
  if (!initialLine) return null;
  const residuals = accepted
    .map(point => Math.abs(initialLine.a * point.x + initialLine.b * point.y + initialLine.c))
    .sort((first, second) => first - second);
  const medianResidual = residuals[Math.floor(residuals.length / 2)] ?? 0;
  const residualLimit = Math.max(1.5, medianResidual * 2.5);
  const inliers = accepted.filter(point => (
    Math.abs(initialLine.a * point.x + initialLine.b * point.y + initialLine.c) <= residualLimit
  ));
  const line = fitLine(inliers.length >= 4 ? inliers : accepted);
  if (!line) return null;
  return {
    line,
    coverage,
    contrast: strengths.reduce((sum, value) => sum + value, 0) / strengths.length,
  };
}

function detectSideInCanvasStrip(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  start: Point,
  end: Point,
  guide: GuideQuad,
  searchRadius: number,
): { line: Line; coverage: number; contrast: number } | null {
  const padding = searchRadius + 8;
  const left = Math.max(0, Math.floor(Math.min(start.x, end.x) - padding));
  const top = Math.max(0, Math.floor(Math.min(start.y, end.y) - padding));
  const right = Math.min(canvasWidth, Math.ceil(Math.max(start.x, end.x) + padding));
  const bottom = Math.min(canvasHeight, Math.ceil(Math.max(start.y, end.y) + padding));
  const width = right - left;
  const height = bottom - top;
  if (width < 4 || height < 4) return null;

  const image = context.getImageData(left, top, width, height);
  const localGuide = guide.map(point => ({
    x: point.x - left,
    y: point.y - top,
  })) as GuideQuad;
  const local = detectSide(
    toColorSignals(image),
    width,
    height,
    { x: start.x - left, y: start.y - top },
    { x: end.x - left, y: end.y - top },
    localGuide,
    searchRadius,
    Math.max(40, Math.min(180, Math.round(Math.hypot(end.x - start.x, end.y - start.y) / 12))),
    Math.max(0.45, 4.5 * SAMPLE_MAX_WIDTH / canvasWidth),
  );
  if (!local) return null;
  return {
    ...local,
    line: {
      a: local.line.a,
      b: local.line.b,
      c: local.line.c - local.line.a * left - local.line.b * top,
    },
  };
}

function toColorSignals(image: ImageData): ColorSignals {
  const count = image.width * image.height;
  const luminance = new Float32Array(count);
  const chroma = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    luminance[index] = red * 0.299 + green * 0.587 + blue * 0.114;
    chroma[index] = Math.max(red, green, blue) - Math.min(red, green, blue);
  }
  return { luminance, chroma };
}

function sampleSignal(
  color: ColorSignals,
  width: number,
  height: number,
  x: number,
  y: number,
): number | null {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (roundedX < 1 || roundedX >= width - 1 || roundedY < 1 || roundedY >= height - 1) {
    return null;
  }
  const index = roundedY * width + roundedX;
  return color.luminance[index] + color.chroma[index] * 0.35;
}

function fitLine(points: Point[]): Line | null {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(-2 * xy, yy - xx);
  const normalX = Math.cos(angle);
  const normalY = Math.sin(angle);
  return {
    a: normalX,
    b: normalY,
    c: -(normalX * meanX + normalY * meanY),
  };
}

function intersect(first: Line, second: Line): Point {
  const determinant = first.a * second.b - second.a * first.b;
  if (Math.abs(determinant) < 1e-6) return { x: Number.NaN, y: Number.NaN };
  return {
    x: (first.b * second.c - second.b * first.c) / determinant,
    y: (second.a * first.c - first.a * second.c) / determinant,
  };
}

function isConvexQuad(corners: GuideQuad): boolean {
  let sign = 0;
  for (let index = 0; index < corners.length; index++) {
    const first = corners[index];
    const second = corners[(index + 1) % corners.length];
    const third = corners[(index + 2) % corners.length];
    const cross =
      (second.x - first.x) * (third.y - second.y) -
      (second.y - first.y) * (third.x - second.x);
    if (!Number.isFinite(cross) || Math.abs(cross) < 1) return false;
    if (!sign) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function averageLength(...pairs: Point[]): number {
  let total = 0;
  let count = 0;
  for (let index = 0; index < pairs.length; index += 2) {
    total += Math.hypot(
      pairs[index + 1].x - pairs[index].x,
      pairs[index + 1].y - pairs[index].y,
    );
    count += 1;
  }
  return total / Math.max(1, count);
}