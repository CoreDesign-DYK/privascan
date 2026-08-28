/**
 * On-device document boundary detection.
 *
 * The detector intentionally works from a blurred, down-sampled image:
 * text, wood grain and other small details are suppressed, while the long
 * contrast transitions that make up a document's four sides remain visible.
 * No image data leaves the device.
 */

import { type Point } from './perspective';

// Live detection must leave enough main-thread time for WKWebView to deliver
// touch events. Captured frames keep the larger sample for crop validation.
const LIVE_SAMPLE_W = 320;
const LIVE_SAMPLE_H = 240;
const CAPTURE_SAMPLE_W = 480;
const CAPTURE_SAMPLE_H = 360;
const LIVE_PEAK_LIMIT = 8;
const CAPTURE_PEAK_LIMIT = 12;

type Bounds = { top: number; right: number; bottom: number; left: number };
type Gradients = { gx: Float32Array; gy: Float32Array };
type ColorSignals = {
  luminance: Float32Array;
  chroma: Float32Array;
};

/** Detect document corners in a live camera frame. */
export function detectDocumentCorners(
  video: HTMLVideoElement,
  srcW: number,
  srcH: number,
): [Point, Point, Point, Point] | null {
  const sample = document.createElement('canvas');
  sample.width = LIVE_SAMPLE_W;
  sample.height = LIVE_SAMPLE_H;
  sample.getContext('2d')!.drawImage(video, 0, 0, LIVE_SAMPLE_W, LIVE_SAMPLE_H);

  const corners = detectCornersFromImageData(
    sample.getContext('2d')!.getImageData(0, 0, LIVE_SAMPLE_W, LIVE_SAMPLE_H),
    LIVE_PEAK_LIMIT,
  );
  if (!corners) return null;

  return scaleCorners(corners, srcW / LIVE_SAMPLE_W, srcH / LIVE_SAMPLE_H);
}

/** Detect document corners from a captured image, used by the crop screen. */
export function detectCornersFromCanvas(
  src: HTMLCanvasElement,
): [Point, Point, Point, Point] | null {
  const sample = document.createElement('canvas');
  sample.width = CAPTURE_SAMPLE_W;
  sample.height = CAPTURE_SAMPLE_H;
  sample.getContext('2d')!.drawImage(src, 0, 0, CAPTURE_SAMPLE_W, CAPTURE_SAMPLE_H);

  const corners = detectCornersFromImageData(
    sample.getContext('2d')!.getImageData(0, 0, CAPTURE_SAMPLE_W, CAPTURE_SAMPLE_H),
    CAPTURE_PEAK_LIMIT,
  );
  if (!corners) return null;

  return scaleCorners(corners, src.width / CAPTURE_SAMPLE_W, src.height / CAPTURE_SAMPLE_H);
}

function detectCornersFromImageData(
  image: ImageData,
  peakLimit: number,
): [Point, Point, Point, Point] | null {
  const { width: w, height: h } = image;
  const color = toColorSignals(image);

  // Blur before calculating gradients so page text and wood grain do not
  // overpower the long document boundaries. Luminance keeps white-paper
  // detection stable, while colour intensity preserves edges such as a red
  // or blue cover against a dark, low-luminance-contrast surface.
  const luminance = sobelComponents(boxBlur(color.luminance, w, h, 4), w, h);
  const chroma = sobelComponents(boxBlur(color.chroma, w, h, 4), w, h);
  const { gx, gy } = combineGradients(luminance, chroma);

  const bounds = findDocumentBounds(gx, gy, w, h, peakLimit);
  if (!bounds) return null;

  const search = Math.max(4, Math.round(Math.min(w, h) * 0.06));
  const top = fitHorizontalEdge(gy, w, h, bounds.top, bounds.left, bounds.right, search);
  const bottom = fitHorizontalEdge(gy, w, h, bounds.bottom, bounds.left, bounds.right, search);
  const left = fitVerticalEdge(gx, w, h, bounds.left, bounds.top, bounds.bottom, search);
  const right = fitVerticalEdge(gx, w, h, bounds.right, bounds.top, bounds.bottom, search);
  if (!top || !bottom || !left || !right) return null;

  const TL = intersect(top, left);
  const TR = intersect(top, right);
  const BR = intersect(bottom, right);
  const BL = intersect(bottom, left);
  if (!TL || !TR || !BR || !BL) return null;
  const corners: [Point, Point, Point, Point] = [TL, TR, BR, BL];

  // A refined bottom edge can occasionally drift back to a strong horizontal
  // divider within the document. Do not turn that uncertain result into a
  // crop: the same guard used when scoring candidates must also approve the
  // final corners used for perspective correction.
  if (
    !isValidDocumentQuad(corners, w, h) ||
    !hasReliableTopBoundary(gx, gy, w, h, TL, TR, BL, BR) ||
    hasVerticalContinuationBelow(
      gx,
      w,
      h,
      Math.min(TL.y, TR.y),
      BL.x,
      BL.y,
      BR.x,
      BR.y,
    )
  ) return null;

  return corners;
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
  peakLimit: number,
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
  const rowPeaks = findPeaks(
    rowProfile,
    marginY,
    h - marginY,
    Math.max(8, Math.round(h * 0.06)),
    peakLimit,
  );
  const colPeaks = findPeaks(
    colProfile,
    marginX,
    w - marginX,
    Math.max(8, Math.round(w * 0.06)),
    peakLimit,
  );

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
          // An interior horizontal divider can look stronger than the real
          // bottom edge on a cover with a barcode, photo, or footer. Its
          // giveaway is that both vertical document sides continue well below
          // the proposed "bottom". A real outer boundary terminates those
          // sides instead. Reject only when both sides continue, so a one-sided
          // shadow or an occluded corner does not discard a valid document.
          if (hasVerticalContinuationBelow(gx, w, h, top, left, bottom, right, bottom)) continue;
           const cornerContinuity =
             Math.min(
               directionalEdgeSupport(gy, w, h, left, top, 'horizontal', 1),
               directionalEdgeSupport(gx, w, h, left, top, 'vertical', 1),
             ) +
             Math.min(
               directionalEdgeSupport(gy, w, h, right, top, 'horizontal', -1),
               directionalEdgeSupport(gx, w, h, right, top, 'vertical', 1),
             ) +
             Math.min(
               directionalEdgeSupport(gy, w, h, right, bottom, 'horizontal', -1),
               directionalEdgeSupport(gx, w, h, right, bottom, 'vertical', -1),
             ) +
             Math.min(
               directionalEdgeSupport(gy, w, h, left, bottom, 'horizontal', 1),
               directionalEdgeSupport(gx, w, h, left, bottom, 'vertical', -1),
             );
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
           const score =
             profileScore + horizontalSupport + verticalSupport +
             cornerContinuity * 1.15 + centerBonus * 0.25;

          if (!best || score > best.score) {
            best = { bounds: { top, right, bottom, left }, score };
          }
        }
      }
    }
  }

  return best?.bounds ?? null;
}

function findPeaks(
  profile: Float32Array,
  start: number,
  end: number,
  minDistance: number,
  limit: number,
): number[] {
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
      if (selected.length === limit) break;
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

/**
 * True bottom corners end both vertical sides. If the same two side edges keep
 * running below the proposed bottom, it is an internal horizontal divider—not
 * a crop-safe document boundary.
 */
function hasVerticalContinuationBelow(
  gx: Float32Array,
  w: number,
  h: number,
  top: number,
  leftX: number,
  leftBottomY: number,
  rightX: number,
  rightBottomY: number,
): boolean {
  const sideContinues = (x: number, cornerY: number) => {
    const desiredBand = Math.max(8, Math.round(h * 0.07));
    const minimumBand = Math.max(6, Math.round(h * 0.02));
    const outsideStart = Math.round(cornerY) + 2;
    const outsideEnd = Math.min(h - 2, outsideStart + desiredBand);
    const insideEnd = Math.round(cornerY) - 2;
    const insideStart = Math.max(Math.round(top) + minimumBand, insideEnd - desiredBand);

    // When the document ends too near the camera frame, there is not enough
    // exterior to distinguish a real boundary from a divider. Leave the
    // existing conservative bounds checks in charge in that case.
    if (
      outsideEnd - outsideStart + 1 < minimumBand ||
      insideEnd - insideStart + 1 < minimumBand
    ) return false;

    const radius = Math.max(4, Math.round(Math.min(w, h) * 0.015));
    const insideSupport = edgeSupportVertical(gx, w, h, Math.round(x), insideStart, insideEnd, radius);
    const outsideSupport = edgeSupportVertical(gx, w, h, Math.round(x), outsideStart, outsideEnd, radius);

    // Ignore weak or isolated texture. A continuing document side should be
    // clearly visible inside the candidate and retain most of that strength
    // immediately below it.
    return insideSupport >= 0.8 && outsideSupport >= 0.8 && outsideSupport >= insideSupport * 0.58;
  };

  return sideContinues(leftX, leftBottomY) && sideContinues(rightX, rightBottomY);
}

/**
 * A background line can be long and strong enough to win the row profile while
 * having no real connection to the document's vertical sides. A true top edge
 * must close into both upper corners: each corner needs horizontal support
 * along the top edge and vertical support continuing into the page.
 */
function hasReliableTopBoundary(
  gx: Float32Array,
  gy: Float32Array,
  w: number,
  h: number,
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  bottomRight: Point,
): boolean {
  const leftSideLength = distance(topLeft, bottomLeft);
  const rightSideLength = distance(topRight, bottomRight);
  // A real top corner should keep its side edge visible immediately below the
  // corner and farther into the page. A background line can pass the short
  // corner check when it sits close to the document, so probe both ranges.
  const sideProbeEnd = Math.max(
    16,
    Math.min(48, Math.round(Math.min(leftSideLength, rightSideLength) * 0.12)),
  );
  const nearProbeEnd = Math.max(8, Math.round(sideProbeEnd * 0.45));

  const cornerIsClosed = (corner: Point, direction: -1 | 1) => {
    const horizontal = directionalEdgeSupport(
      gy,
      w,
      h,
      corner.x,
      corner.y,
      'horizontal',
      direction,
    );
    const vertical = directionalEdgeSupport(
      gx,
      w,
      h,
      corner.x,
      corner.y,
      'vertical',
      1,
    );
    const nearVertical = directionalEdgeSupport(
      gx,
      w,
      h,
      corner.x,
      corner.y,
      'vertical',
      1,
      nearProbeEnd,
    );
    const innerVertical = directionalEdgeSupport(
      gx,
      w,
      h,
      corner.x,
      corner.y,
      'vertical',
      1,
      sideProbeEnd,
      nearProbeEnd + 2,
    );

    // Keep this deliberately conservative. If either side of the corner is
    // missing, the detector must not extrapolate a background line into a
    // document corner and let perspective correction magnify the error.
    return (
      horizontal >= 0.35 &&
      vertical >= 0.35 &&
      nearVertical >= 0.25 &&
      innerVertical >= 0.25
    );
  };

  if (
    !cornerIsClosed(topLeft, 1) ||
    !cornerIsClosed(topRight, -1)
  ) return false;

  // The top edge must not form a severe, unsupported trapezoid. Mild
  // perspective is valid, but a background line pulled far above one side is
  // a common signature of the failure this guard is meant to reject.
  const topAngle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);
  const bottomAngle = Math.atan2(bottomRight.y - bottomLeft.y, bottomRight.x - bottomLeft.x);
  const angleDelta = Math.abs(normalizeLineAngle(topAngle - bottomAngle));
  const topWidth = distance(topLeft, topRight);
  const bottomWidth = distance(bottomLeft, bottomRight);
  const widthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);

  return widthRatio >= 0.58 && angleDelta <= Math.PI / 6;
}

function directionalEdgeSupport(
  gradient: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  axis: 'horizontal' | 'vertical',
  direction: -1 | 1,
  alongRadius = 10,
  startDistance = 2,
): number {
  const acrossRadius = 4;
  let sum = 0;
  let samples = 0;

  for (let distance = Math.max(2, startDistance); distance <= alongRadius; distance += 2) {
    let strongest = 0;
    for (let across = -acrossRadius; across <= acrossRadius; across++) {
      const sampleX = axis === 'horizontal'
        ? Math.round(x + direction * distance)
        : Math.round(x + across);
      const sampleY = axis === 'horizontal'
        ? Math.round(y + across)
        : Math.round(y + direction * distance);
      if (sampleX < 1 || sampleX >= w - 1 || sampleY < 1 || sampleY >= h - 1) continue;
      strongest = Math.max(strongest, Math.abs(gradient[sampleY * w + sampleX]));
    }
    sum += strongest;
    samples += 1;
  }

  return sum / Math.max(1, samples) / 24;
}

/* ── Line refinement ──────────────────────────────────────────────────────── */

type HorizontalLine = { m: number; b: number };
type VerticalLine = { m: number; b: number };
type EdgePoint = Point & { strength: number };

function fitHorizontalEdge(
  gy: Float32Array, w: number, h: number, expectedY: number, left: number, right: number, radius: number,
): HorizontalLine | null {
  const points: EdgePoint[] = [];
  for (let x = left + 4; x <= right - 4; x += 4) {
    let bestY = expectedY;
    let bestValue = -1;
    for (let y = Math.max(1, expectedY - radius); y <= Math.min(h - 2, expectedY + radius); y++) {
      // The profile candidate is the boundary's most reliable coarse position.
      // Prefer it decisively over a nearby, stronger background line so a desk
      // edge just above a coloured cover cannot pull the fitted top edge away.
      const distanceBias = 1 - 0.42 * Math.abs(y - expectedY) / Math.max(1, radius);
      const value = Math.abs(gy[y * w + x]) * distanceBias;
      if (value > bestValue) { bestValue = value; bestY = y; }
    }
    points.push({ x, y: bestY, strength: bestValue });
  }
  return fitYFromX(points, expectedY, radius);
}

function fitVerticalEdge(
  gx: Float32Array, w: number, h: number, expectedX: number, top: number, bottom: number, radius: number,
): VerticalLine | null {
  const points: EdgePoint[] = [];
  for (let y = top + 4; y <= bottom - 4; y += 4) {
    let bestX = expectedX;
    let bestValue = -1;
    for (let x = Math.max(1, expectedX - radius); x <= Math.min(w - 2, expectedX + radius); x++) {
      const distanceBias = 1 - 0.42 * Math.abs(x - expectedX) / Math.max(1, radius);
      const value = Math.abs(gx[y * w + x]) * distanceBias;
      if (value > bestValue) { bestValue = value; bestX = x; }
    }
    points.push({ x: bestX, y, strength: bestValue });
  }
  return fitXFromY(points, expectedX, radius);
}

function fitYFromX(points: EdgePoint[], expectedY: number, radius: number): HorizontalLine | null {
  if (points.length < 8) return null;
  const initial = leastSquaresYFromX(points);
  if (!initial) return null;
  const inliers = filterCoherentEdgePoints(
    points,
    point => Math.abs(point.y - (initial.m * point.x + initial.b)),
    expectedY,
    radius,
    'y',
  );
  if (!hasEnoughCoherentPoints(inliers, points.length)) return null;
  const line = leastSquaresYFromX(inliers);
  return line && isCoherentHorizontalFit(inliers, line, expectedY, radius) ? line : null;
}

function fitXFromY(points: EdgePoint[], expectedX: number, radius: number): VerticalLine | null {
  if (points.length < 8) return null;
  const initial = leastSquaresXFromY(points);
  if (!initial) return null;
  const inliers = filterCoherentEdgePoints(
    points,
    point => Math.abs(point.x - (initial.m * point.y + initial.b)),
    expectedX,
    radius,
    'x',
  );
  if (!hasEnoughCoherentPoints(inliers, points.length)) return null;
  const line = leastSquaresXFromY(inliers);
  return line && isCoherentVerticalFit(inliers, line, expectedX, radius) ? line : null;
}

function leastSquaresYFromX(points: Point[]): HorizontalLine | null {
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
  }
  const divisor = points.length * sumXX - sumX * sumX;
  if (Math.abs(divisor) < 0.001) return null;
  const m = (points.length * sumXY - sumX * sumY) / divisor;
  return { m, b: (sumY - m * sumX) / points.length };
}

function leastSquaresXFromY(points: Point[]): VerticalLine | null {
  let sumX = 0, sumY = 0, sumXY = 0, sumYY = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumYY += p.y * p.y;
  }
  const divisor = points.length * sumYY - sumY * sumY;
  if (Math.abs(divisor) < 0.001) return null;
  const m = (points.length * sumXY - sumX * sumY) / divisor;
  return { m, b: (sumX - m * sumY) / points.length };
}

function filterCoherentEdgePoints(
  points: EdgePoint[],
  residualFor: (point: EdgePoint) => number,
  expectedCoordinate: number,
  radius: number,
  axis: 'x' | 'y',
): EdgePoint[] {
  const residuals = points.map(residualFor);
  const residualMedian = median(residuals);
  const residualLimit = Math.max(1.5, Math.min(radius * 0.35, residualMedian * 2.5 + 1));
  const strengthFloor = Math.max(1, median(points.map(point => point.strength)) * 0.45);

  return points.filter((point, index) => {
    const coordinate = axis === 'x' ? point.x : point.y;
    return (
      residuals[index] <= residualLimit &&
      point.strength >= strengthFloor &&
      Math.abs(coordinate - expectedCoordinate) <= radius * 0.55
    );
  });
}

function hasEnoughCoherentPoints(inliers: EdgePoint[], total: number): boolean {
  return inliers.length >= Math.max(8, Math.ceil(total * 0.7));
}

function isCoherentHorizontalFit(
  points: EdgePoint[],
  line: HorizontalLine,
  expectedY: number,
  radius: number,
): boolean {
  const residual = median(points.map(point => Math.abs(point.y - (line.m * point.x + line.b))));
  const offset = median(points.map(point => Math.abs(point.y - expectedY)));
  return residual <= Math.max(1.4, radius * 0.16) && offset <= radius * 0.45;
}

function isCoherentVerticalFit(
  points: EdgePoint[],
  line: VerticalLine,
  expectedX: number,
  radius: number,
): boolean {
  const residual = median(points.map(point => Math.abs(point.x - (line.m * point.y + line.b))));
  const offset = median(points.map(point => Math.abs(point.x - expectedX)));
  return residual <= Math.max(1.4, radius * 0.16) && offset <= radius * 0.45;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function intersect(horizontal: HorizontalLine, vertical: VerticalLine): Point | null {
  const denominator = 1 - vertical.m * horizontal.m;
  if (Math.abs(denominator) < 0.01) return null;
  const x = (vertical.m * horizontal.b + vertical.b) / denominator;
  return { x, y: horizontal.m * x + horizontal.b };
}

/* ── Image helpers ────────────────────────────────────────────────────────── */

function toColorSignals(img: ImageData): ColorSignals {
  const { data, width, height } = img;
  const luminance = new Float32Array(width * height);
  const chroma = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i++) {
    const p = i * 4;
    const red = data[p];
    const green = data[p + 1];
    const blue = data[p + 2];
    luminance[i] = 0.299 * red + 0.587 * green + 0.114 * blue;
    chroma[i] = Math.max(red, green, blue) - Math.min(red, green, blue);
  }
  return { luminance, chroma };
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

function combineGradients(
  luminance: Gradients,
  chroma: Gradients,
): Gradients {
  const gx = new Float32Array(luminance.gx.length);
  const gy = new Float32Array(luminance.gy.length);
  // Colour changes are a support signal, not a replacement for luminance.
  // Keeping their contribution lower avoids promoting coloured text or glare
  // over a long, coherent document edge.
  const chromaWeight = 0.45;
  for (let i = 0; i < gx.length; i++) {
    gx[i] = Math.hypot(
      luminance.gx[i],
      chroma.gx[i] * chromaWeight,
    );
    gy[i] = Math.hypot(
      luminance.gy[i],
      chroma.gy[i] * chromaWeight,
    );
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

function normalizeLineAngle(angle: number): number {
  let normalized = angle % Math.PI;
  if (normalized > Math.PI / 2) normalized -= Math.PI;
  if (normalized < -Math.PI / 2) normalized += Math.PI;
  return normalized;
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