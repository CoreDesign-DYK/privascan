const MIN_SHARPNESS_VARIANCE = 36;
const MIN_DETAIL_COVERAGE = 0.008;

export function hasRequiredSharpness(canvas: HTMLCanvasElement): boolean {
  const { variance, detailCoverage } = measureSharpness(canvas);
  return variance >= MIN_SHARPNESS_VARIANCE && detailCoverage >= MIN_DETAIL_COVERAGE;
}

export function measureSharpness(
  canvas: HTMLCanvasElement,
): { variance: number; detailCoverage: number } {
  const sample = document.createElement('canvas');
  const width = 180;
  const height = Math.max(120, Math.round(width * canvas.height / canvas.width));
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { variance: 0, detailCoverage: 0 };
  ctx.drawImage(canvas, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const laplacian: number[] = [];
  const inset = Math.max(4, Math.round(Math.min(width, height) * 0.07));
  let detailPixels = 0;
  const gray = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  for (let y = inset; y < height - inset; y++) {
    for (let x = inset; x < width - inset; x++) {
      const value = 4 * gray(x, y) - gray(x - 1, y) - gray(x + 1, y) -
        gray(x, y - 1) - gray(x, y + 1);
      laplacian.push(value);
      if (Math.abs(value) >= 10) detailPixels += 1;
    }
  }
  if (!laplacian.length) return { variance: 0, detailCoverage: 0 };
  const mean = laplacian.reduce((sum, value) => sum + value, 0) / laplacian.length;
  const variance = laplacian.reduce((sum, value) => sum + (value - mean) ** 2, 0) / laplacian.length;
  return { variance, detailCoverage: detailPixels / laplacian.length };
}