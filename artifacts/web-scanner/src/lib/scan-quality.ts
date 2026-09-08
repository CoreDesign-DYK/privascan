const MIN_SHARPNESS_VARIANCE = 36;
const MIN_DETAIL_COVERAGE = 0.008;

export type SharpnessMeasurement = {
  variance: number;
  detailCoverage: number;
  contentCoverage: number;
};

export function hasRequiredSharpness(canvas: HTMLCanvasElement): boolean {
  const { variance, detailCoverage } = measureSharpness(canvas);
  return variance >= MIN_SHARPNESS_VARIANCE && detailCoverage >= MIN_DETAIL_COVERAGE;
}

export function measureSharpness(
  canvas: HTMLCanvasElement,
): SharpnessMeasurement {
  const sample = document.createElement('canvas');
  const width = 180;
  const height = Math.max(120, Math.round(width * canvas.height / canvas.width));
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { variance: 0, detailCoverage: 0, contentCoverage: 0 };
  ctx.drawImage(canvas, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const laplacian: number[] = [];
  const inset = Math.max(4, Math.round(Math.min(width, height) * 0.07));
  let detailPixels = 0;
  let contentPixels = 0;
  const gray = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  for (let y = inset; y < height - inset; y++) {
    for (let x = inset; x < width - inset; x++) {
      const luminance = gray(x, y);
      const value = 4 * luminance - gray(x - 1, y) - gray(x + 1, y) -
        gray(x, y - 1) - gray(x, y + 1);
      laplacian.push(value);
      if (Math.abs(value) >= 10) detailPixels += 1;
      const backgroundRadius = 4;
      const localBackground = (
        gray(x - backgroundRadius, y) +
        gray(x + backgroundRadius, y) +
        gray(x, y - backgroundRadius) +
        gray(x, y + backgroundRadius)
      ) / 4;
      if (localBackground - luminance >= 5) contentPixels += 1;
    }
  }
  if (!laplacian.length) {
    return { variance: 0, detailCoverage: 0, contentCoverage: 0 };
  }
  const mean = laplacian.reduce((sum, value) => sum + value, 0) / laplacian.length;
  const variance = laplacian.reduce((sum, value) => sum + (value - mean) ** 2, 0) / laplacian.length;
  return {
    variance,
    detailCoverage: detailPixels / laplacian.length,
    contentCoverage: contentPixels / laplacian.length,
  };
}

export function measureDocumentSharpness(
  canvas: HTMLCanvasElement,
): {
  overall: SharpnessMeasurement;
  regions: SharpnessMeasurement[];
  uniform: boolean;
  sharp: boolean;
} {
  const overall = measureSharpness(canvas);
  const regions: SharpnessMeasurement[] = [];
  const overlap = 0.06;

  for (let index = 0; index < 3; index += 1) {
    const start = Math.max(0, index / 3 - overlap);
    const end = Math.min(1, (index + 1) / 3 + overlap);
    const sourceX = Math.round(canvas.width * start);
    const sourceWidth = Math.max(1, Math.round(canvas.width * (end - start)));
    const sourceY = Math.round(canvas.height * 0.06);
    const sourceHeight = Math.max(1, Math.round(canvas.height * 0.88));
    const region = document.createElement('canvas');
    region.width = Math.min(360, sourceWidth);
    region.height = Math.max(
      120,
      Math.round(region.width * sourceHeight / Math.max(1, sourceWidth)),
    );
    region.getContext('2d')?.drawImage(
      canvas,
      sourceX,
      sourceY,
      Math.min(sourceWidth, canvas.width - sourceX),
      sourceHeight,
      0,
      0,
      region.width,
      region.height,
    );
    regions.push(measureSharpness(region));
  }

  // Local-background-normalized dark-pixel occupancy detects blurred ink and
  // table lines while ignoring smooth lighting gradients across blank paper.
  const detailedRegions = regions.filter(region =>
    region.contentCoverage >= 0.0015 || region.detailCoverage >= 0.002,
  );
  const strongestVariance = Math.max(...detailedRegions.map(region => region.variance), 0);
  const uniform = detailedRegions.length < 2 || detailedRegions.every(region =>
    region.variance >= MIN_SHARPNESS_VARIANCE * 0.78 &&
    region.variance >= strongestVariance * 0.48,
  );
  const sharp =
    overall.variance >= MIN_SHARPNESS_VARIANCE &&
    overall.detailCoverage >= MIN_DETAIL_COVERAGE &&
    uniform;

  return { overall, regions, uniform, sharp };
}

export function hasUniformDocumentSharpness(canvas: HTMLCanvasElement): boolean {
  return measureDocumentSharpness(canvas).sharp;
}