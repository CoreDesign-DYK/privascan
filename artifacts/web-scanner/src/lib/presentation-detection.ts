/**
 * Presentation/screen boundary detection.
 *
 * Unlike the document detector, this detector does not assume that boundaries
 * produce peaks on image-axis row/column profiles. It searches sloped line
 * families, combines two horizontal-like and two vertical-like candidates,
 * and validates the resulting convex quadrilateral.
 */
import { type Point } from './perspective';

const LIVE_SAMPLE_W = 400;
const LIVE_SAMPLE_H = 300;
const CAPTURE_SAMPLE_W = 640;
const CAPTURE_SAMPLE_H = 480;

type Quad = [Point, Point, Point, Point];
type Line = {
  a: number;
  b: number;
  c: number;
  position: number;
  slope: number;
  score: number;
};
type Gradients = {
  gx: Float32Array;
  gy: Float32Array;
  luminance: Float32Array;
  threshold: number;
};

export interface PresentationDetection {
  corners: Quad;
  confidence: number;
}

export function detectPresentationCorners(
  video: HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number,
): PresentationDetection | null {
  const sample = document.createElement('canvas');
  sample.width = LIVE_SAMPLE_W;
  sample.height = LIVE_SAMPLE_H;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, LIVE_SAMPLE_W, LIVE_SAMPLE_H);
  const detected = detectPresentationFromImageData(
    ctx.getImageData(0, 0, LIVE_SAMPLE_W, LIVE_SAMPLE_H),
  );
  if (!detected) return null;
  return {
    corners: scaleQuad(
      detected.corners,
      sourceWidth / LIVE_SAMPLE_W,
      sourceHeight / LIVE_SAMPLE_H,
    ),
    confidence: detected.confidence,
  };
}

export function detectPresentationFromCanvas(
  source: HTMLCanvasElement,
): PresentationDetection | null {
  const sample = document.createElement('canvas');
  sample.width = CAPTURE_SAMPLE_W;
  sample.height = CAPTURE_SAMPLE_H;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, CAPTURE_SAMPLE_W, CAPTURE_SAMPLE_H);
  const detected = detectPresentationFromImageData(
    ctx.getImageData(0, 0, CAPTURE_SAMPLE_W, CAPTURE_SAMPLE_H),
  );
  if (!detected) return null;
  return {
    corners: scaleQuad(
      detected.corners,
      source.width / CAPTURE_SAMPLE_W,
      source.height / CAPTURE_SAMPLE_H,
    ),
    confidence: detected.confidence,
  };
}

export function isValidPresentationQuad(
  corners: Quad,
  width: number,
  height: number,
  minimumAreaRatio = 0.035,
): boolean {
  const tolerance = Math.max(width, height) * 0.025;
  if (corners.some(point =>
    point.x < -tolerance ||
    point.x > width + tolerance ||
    point.y < -tolerance ||
    point.y > height + tolerance
  )) return false;

  const signs = corners.map((point, index) =>
    cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]),
  );
  if (!(signs.every(value => value > 0) || signs.every(value => value < 0))) return false;

  const area = quadArea(corners);
  if (area < width * height * minimumAreaRatio || area > width * height * 0.97) return false;

  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const top = distance(topLeft, topRight);
  const bottom = distance(bottomLeft, bottomRight);
  const left = distance(topLeft, bottomLeft);
  const right = distance(topRight, bottomRight);
  const averageWidth = (top + bottom) / 2;
  const averageHeight = (left + right) / 2;
  if (averageWidth / Math.max(1, averageHeight) < 0.82) return false;
  if (averageWidth / Math.max(1, averageHeight) > 5.2) return false;
  if (Math.min(top, bottom) / Math.max(top, bottom) < 0.22) return false;
  if (Math.min(left, right) / Math.max(left, right) < 0.22) return false;
  if (Math.min(top, bottom, left, right) < Math.min(width, height) * 0.08) return false;
  return true;
}

export function presentationDefaultCorners(width: number, height: number): Quad {
  const horizontalInset = width * 0.06;
  const availableWidth = width - horizontalInset * 2;
  const desiredHeight = availableWidth * 9 / 16;
  const actualHeight = Math.min(desiredHeight, height * 0.76);
  const actualWidth = actualHeight * 16 / 9;
  const left = (width - actualWidth) / 2;
  const top = (height - actualHeight) / 2;
  return [
    { x: left, y: top },
    { x: left + actualWidth, y: top },
    { x: left + actualWidth, y: top + actualHeight },
    { x: left, y: top + actualHeight },
  ];
}

export function presentationOutputSize(
  corners: Quad,
  requestedMaxWidth: number,
  maxPixels = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const observedWidth = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
  const observedHeight = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
  const maxWidthFromSource = Math.min(observedWidth, observedHeight * 16 / 9);
  const maxWidthFromPixels = Number.isFinite(maxPixels)
    ? Math.sqrt(maxPixels * 16 / 9)
    : Number.POSITIVE_INFINITY;
  const width = Math.max(
    1,
    Math.floor(Math.min(requestedMaxWidth, maxWidthFromSource, maxWidthFromPixels)),
  );
  return {
    width,
    height: Math.max(90, Math.round(width * 9 / 16)),
  };
}

export function detectPresentationFromImageData(image: ImageData): PresentationDetection | null {
  const { width, height } = image;
  const gradients = buildGradients(image);
  const horizontal = findLineCandidates(gradients, width, height, 'horizontal');
  const vertical = findLineCandidates(gradients, width, height, 'vertical');
  if (horizontal.length < 2 || vertical.length < 2) return null;

  const horizontalPairs = makeLinePairs(horizontal, height, 0.14, 0.94);
  const verticalPairs = makeLinePairs(vertical, width, 0.18, 0.96);
  let best: { corners: Quad; score: number; confidence: number } | null = null;

  for (const [top, bottom] of horizontalPairs) {
    for (const [left, right] of verticalPairs) {
      const topLeft = intersect(top, left);
      const topRight = intersect(top, right);
      const bottomRight = intersect(bottom, right);
      const bottomLeft = intersect(bottom, left);
      if (!topLeft || !topRight || !bottomRight || !bottomLeft) continue;
      const corners: Quad = [topLeft, topRight, bottomRight, bottomLeft];
      if (!isValidPresentationQuad(corners, width, height, 0.075)) continue;

      const qualities = [
        segmentQuality(gradients, width, height, topLeft, topRight),
        segmentQuality(gradients, width, height, topRight, bottomRight),
        segmentQuality(gradients, width, height, bottomRight, bottomLeft),
        segmentQuality(gradients, width, height, bottomLeft, topLeft),
      ];
      const minimumCoverage = Math.min(...qualities.map(value => value.coverage));
      const minimumStrength = Math.min(...qualities.map(value => value.strength));
      const averageContrast = qualities.reduce((sum, value) => sum + value.contrast, 0) / 4;
      if (minimumCoverage < 0.3 || minimumStrength < 1.18 || averageContrast < 3.5) continue;

      const areaRatio = quadArea(corners) / (width * height);
      const center = quadCenter(corners);
      const centerDistance = Math.hypot(
        (center.x - width / 2) / width,
        (center.y - height / 2) / height,
      );
      const lineScore = top.score + bottom.score + left.score + right.score;
      const edgeScore = qualities.reduce(
        (sum, value) => sum + value.strength + value.coverage * 2 + value.contrast / 28,
        0,
      );
      const score = lineScore * 0.3 + edgeScore + areaRatio * 2.5 - centerDistance * 0.6;
      const confidence = clamp01(
        minimumCoverage * 0.5 +
        Math.min(1, minimumStrength / 2.3) * 0.32 +
        Math.min(1, averageContrast / 32) * 0.18,
      );
      if (!best || score > best.score) best = { corners, score, confidence };
    }
  }

  if (!best || best.confidence < 0.44) return null;
  return { corners: best.corners, confidence: best.confidence };
}

function buildGradients(image: ImageData): Gradients {
  const { data, width, height } = image;
  const luminance = new Float32Array(width * height);
  const chroma = new Float32Array(width * height);
  for (let index = 0; index < luminance.length; index++) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    luminance[index] = 0.299 * red + 0.587 * green + 0.114 * blue;
    chroma[index] = Math.max(red, green, blue) - Math.min(red, green, blue);
  }
  const blurredLuminance = boxBlur(luminance, width, height, 3);
  const blurredChroma = boxBlur(chroma, width, height, 3);
  const luminanceGradient = sobel(blurredLuminance, width, height);
  const chromaGradient = sobel(blurredChroma, width, height);
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  let magnitudeTotal = 0;
  let magnitudeSamples = 0;
  for (let index = 0; index < gx.length; index++) {
    gx[index] = Math.hypot(luminanceGradient.gx[index], chromaGradient.gx[index] * 0.35);
    gy[index] = Math.hypot(luminanceGradient.gy[index], chromaGradient.gy[index] * 0.35);
    if (index % 17 === 0) {
      magnitudeTotal += Math.hypot(gx[index], gy[index]);
      magnitudeSamples += 1;
    }
  }
  const threshold = Math.max(18, magnitudeTotal / Math.max(1, magnitudeSamples) * 1.65);
  return { gx, gy, luminance: blurredLuminance, threshold };
}

function findLineCandidates(
  gradients: Gradients,
  width: number,
  height: number,
  family: 'horizontal' | 'vertical',
): Line[] {
  const dimension = family === 'horizontal' ? height : width;
  const margin = Math.max(4, Math.round(dimension * 0.015));
  const candidates: Line[] = [];
  const slopeLimit = family === 'horizontal' ? 0.72 : 0.9;
  const slopeStep = family === 'horizontal' ? 0.06 : 0.075;
  const positionStep = Math.max(2, Math.round(dimension / 150));

  for (let slope = -slopeLimit; slope <= slopeLimit + 0.001; slope += slopeStep) {
    for (let position = margin; position <= dimension - margin; position += positionStep) {
      const line = family === 'horizontal'
        ? horizontalLine(slope, position, width)
        : verticalLine(slope, position, height);
      const quality = wholeLineQuality(gradients, width, height, line);
      if (quality.coverage < 0.23 || quality.strength < 1.02) continue;
      candidates.push({
        ...line,
        position,
        slope,
        score: quality.strength + quality.coverage * 2.2 + quality.contrast / 24,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected: Line[] = [];
  for (const candidate of candidates) {
    const duplicate = selected.some(line =>
      Math.abs(line.position - candidate.position) < dimension * 0.035 &&
      Math.abs(line.slope - candidate.slope) < 0.14
    );
    if (!duplicate) selected.push(candidate);
    if (selected.length >= 14) break;
  }
  return selected;
}

function makeLinePairs(
  lines: Line[],
  dimension: number,
  minimumGapRatio: number,
  maximumGapRatio: number,
): [Line, Line][] {
  const pairs: { lines: [Line, Line]; score: number }[] = [];
  for (let first = 0; first < lines.length; first++) {
    for (let second = first + 1; second < lines.length; second++) {
      const ordered = lines[first].position < lines[second].position
        ? [lines[first], lines[second]] as [Line, Line]
        : [lines[second], lines[first]] as [Line, Line];
      const gap = ordered[1].position - ordered[0].position;
      if (gap < dimension * minimumGapRatio || gap > dimension * maximumGapRatio) continue;
      pairs.push({ lines: ordered, score: ordered[0].score + ordered[1].score + gap / dimension });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, 28).map(pair => pair.lines);
}

function wholeLineQuality(
  gradients: Gradients,
  width: number,
  height: number,
  line: Pick<Line, 'a' | 'b' | 'c'>,
): { coverage: number; strength: number; contrast: number } {
  const horizontalLike = Math.abs(line.b) >= Math.abs(line.a);
  const steps = horizontalLike ? width : height;
  let supported = 0;
  let strength = 0;
  let contrast = 0;
  let samples = 0;
  const normalLength = Math.hypot(line.a, line.b);
  for (let along = 4; along < steps - 4; along += 4) {
    const x = horizontalLike ? along : solveX(line, along);
    const y = horizontalLike ? solveY(line, along) : along;
    if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) continue;
    let strongest = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const sampleX = Math.round(x + line.a / normalLength * offset);
      const sampleY = Math.round(y + line.b / normalLength * offset);
      const index = sampleY * width + sampleX;
      const projected =
        Math.abs(gradients.gx[index] * line.a / normalLength) +
        Math.abs(gradients.gy[index] * line.b / normalLength);
      strongest = Math.max(strongest, projected);
    }
    strength += strongest / gradients.threshold;
    const outsideX = Math.round(x - line.a / normalLength * 5);
    const outsideY = Math.round(y - line.b / normalLength * 5);
    const insideX = Math.round(x + line.a / normalLength * 5);
    const insideY = Math.round(y + line.b / normalLength * 5);
    if (
      outsideX >= 0 && outsideX < width && outsideY >= 0 && outsideY < height &&
      insideX >= 0 && insideX < width && insideY >= 0 && insideY < height
    ) {
      contrast += Math.abs(
        gradients.luminance[insideY * width + insideX] -
        gradients.luminance[outsideY * width + outsideX],
      );
    }
    if (strongest >= gradients.threshold) supported += 1;
    samples += 1;
  }
  return {
    coverage: supported / Math.max(1, samples),
    strength: strength / Math.max(1, samples),
    contrast: contrast / Math.max(1, samples),
  };
}

function segmentQuality(
  gradients: Gradients,
  width: number,
  height: number,
  start: Point,
  end: Point,
): { coverage: number; strength: number; contrast: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const normalX = -dy / Math.max(1, length);
  const normalY = dx / Math.max(1, length);
  const sampleCount = Math.max(12, Math.min(100, Math.round(length / 4)));
  let supported = 0;
  let strength = 0;
  let contrast = 0;
  let samples = 0;

  for (let sample = 2; sample < sampleCount - 2; sample++) {
    const t = sample / (sampleCount - 1);
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    if (x < 5 || x >= width - 5 || y < 5 || y >= height - 5) continue;
    let strongest = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const sampleX = Math.round(x + normalX * offset);
      const sampleY = Math.round(y + normalY * offset);
      const index = sampleY * width + sampleX;
      strongest = Math.max(
        strongest,
        Math.abs(gradients.gx[index] * normalX) +
          Math.abs(gradients.gy[index] * normalY),
      );
    }
    const insideIndex = Math.round(y + normalY * 4) * width + Math.round(x + normalX * 4);
    const outsideIndex = Math.round(y - normalY * 4) * width + Math.round(x - normalX * 4);
    contrast += Math.abs(gradients.luminance[insideIndex] - gradients.luminance[outsideIndex]);
    strength += strongest / gradients.threshold;
    if (strongest >= gradients.threshold) supported += 1;
    samples += 1;
  }
  return {
    coverage: supported / Math.max(1, samples),
    strength: strength / Math.max(1, samples),
    contrast: contrast / Math.max(1, samples),
  };
}

function horizontalLine(slope: number, position: number, width: number): Line {
  return {
    a: -slope,
    b: 1,
    c: slope * width / 2 - position,
    position,
    slope,
    score: 0,
  };
}

function verticalLine(slope: number, position: number, height: number): Line {
  return {
    a: 1,
    b: -slope,
    c: slope * height / 2 - position,
    position,
    slope,
    score: 0,
  };
}

function intersect(first: Line, second: Line): Point | null {
  const denominator = first.a * second.b - second.a * first.b;
  if (Math.abs(denominator) < 0.02) return null;
  return {
    x: (first.b * second.c - second.b * first.c) / denominator,
    y: (first.c * second.a - second.c * first.a) / denominator,
  };
}

function solveX(line: Pick<Line, 'a' | 'b' | 'c'>, y: number): number {
  return -(line.b * y + line.c) / line.a;
}

function solveY(line: Pick<Line, 'a' | 'b' | 'c'>, x: number): number {
  return -(line.a * x + line.c) / line.b;
}

function scaleQuad(corners: Quad, scaleX: number, scaleY: number): Quad {
  return corners.map(point => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  })) as Quad;
}

function quadArea(corners: Quad): number {
  let area = 0;
  for (let index = 0; index < corners.length; index++) {
    const next = (index + 1) % corners.length;
    area += corners[index].x * corners[next].y - corners[next].x * corners[index].y;
  }
  return Math.abs(area) / 2;
}

function quadCenter(corners: Quad): Point {
  return {
    x: corners.reduce((sum, point) => sum + point.x, 0) / 4,
    y: corners.reduce((sum, point) => sum + point.y, 0) / 4,
  };
}

function cross(first: Point, second: Point, third: Point): number {
  return (second.x - first.x) * (third.y - second.y) -
    (second.y - first.y) * (third.x - second.x);
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function boxBlur(input: Float32Array, width: number, height: number, radius: number): Float32Array {
  const stride = width + 1;
  const integral = new Float32Array((height + 1) * stride);
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += input[(y - 1) * width + x - 1];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }
  const output = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      const sum =
        integral[(bottom + 1) * stride + right + 1] -
        integral[top * stride + right + 1] -
        integral[(bottom + 1) * stride + left] +
        integral[top * stride + left];
      output[y * width + x] = sum / ((right - left + 1) * (bottom - top + 1));
    }
  }
  return output;
}

function sobel(input: Float32Array, width: number, height: number): {
  gx: Float32Array;
  gy: Float32Array;
} {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const topLeft = input[index - width - 1];
      const top = input[index - width];
      const topRight = input[index - width + 1];
      const left = input[index - 1];
      const right = input[index + 1];
      const bottomLeft = input[index + width - 1];
      const bottom = input[index + width];
      const bottomRight = input[index + width + 1];
      gx[index] = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
      gy[index] = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
    }
  }
  return { gx, gy };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}