/**
 * filters.ts
 * On-device image processing — all Canvas API, zero server.
 */

export type FilterType = 'original' | 'bw' | 'highcontrast' | 'auto';

/** Apply a named filter to an ImageData in-place, return new ImageData */
export function applyFilter(
  imageData: ImageData,
  filter: FilterType,
  brightness = 0,   // -100 .. +100
  contrast   = 0,   // -100 .. +100
): ImageData {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    if (filter === 'bw' || filter === 'highcontrast') {
      const grey = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = grey;
    }

    if (filter === 'highcontrast') {
      // S-curve contrast boost
      r = sCurve(r);
      g = sCurve(g);
      b = sCurve(b);
    }

    if (filter === 'auto') {
      // Simple per-channel gamma correction (auto levels approximation)
      r = Math.min(255, r * 1.05 + 10);
      g = Math.min(255, g * 1.02 + 5);
      b = Math.min(255, b * 1.0  + 8);
    }

    // Brightness: add constant
    if (brightness !== 0) {
      const br = brightness * 1.5;
      r = clamp(r + br);
      g = clamp(g + br);
      b = clamp(b + br);
    }

    // Contrast: scale around 128
    if (contrast !== 0) {
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      r = clamp(factor * (r - 128) + 128);
      g = clamp(factor * (g - 128) + 128);
      b = clamp(factor * (b - 128) + 128);
    }

    out[i]     = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3]; // alpha
  }

  return new ImageData(out, width, height);
}

/** Apply filter + brightness/contrast to a canvas, return new canvas */
export function filterCanvas(
  src: HTMLCanvasElement,
  filter: FilterType,
  brightness = 0,
  contrast   = 0,
): HTMLCanvasElement {
  const dst = document.createElement('canvas');
  dst.width  = src.width;
  dst.height = src.height;
  const ctx = dst.getContext('2d')!;
  ctx.drawImage(src, 0, 0);

  if (filter === 'original' && brightness === 0 && contrast === 0) return dst;

  const id = ctx.getImageData(0, 0, dst.width, dst.height);
  const filtered = applyFilter(id, filter, brightness, contrast);
  ctx.putImageData(filtered, 0, 0);
  return dst;
}

/**
 * Improve a document after perspective correction without converting it to
 * monochrome. It applies a conservative luminance stretch so paper becomes
 * cleaner and gray printed text becomes darker while colored markings remain.
 *
 * This deliberately runs after the real sharpness gate. It must not turn a
 * blurry capture into one that appears to have passed validation.
 */
export function enhanceDocumentCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const dst = document.createElement('canvas');
  dst.width = src.width;
  dst.height = src.height;
  const ctx = dst.getContext('2d', { willReadFrequently: true });
  if (!ctx) return src;

  let image: ImageData;
  try {
    ctx.drawImage(src, 0, 0);
    image = ctx.getImageData(0, 0, dst.width, dst.height);
  } catch {
    // A device may reject a large ImageData allocation under memory pressure.
    // Keep the validated perspective-corrected page instead of failing capture.
    return src;
  }
  const { data, width, height } = image;
  const histogram = new Uint32Array(256);
  const step = Math.max(1, Math.floor(Math.max(width, height) / 900));
  const insetX = Math.round(width * 0.03);
  const insetY = Math.round(height * 0.03);
  let sampleCount = 0;

  const luminanceAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  for (let y = insetY; y < height - insetY; y += step) {
    for (let x = insetX; x < width - insetX; x += step) {
      histogram[Math.max(0, Math.min(255, Math.round(luminanceAt(x, y))))] += 1;
      sampleCount += 1;
    }
  }
  if (!sampleCount) return dst;

  const percentile = (fraction: number) => {
    const target = Math.max(0, Math.floor(sampleCount * fraction));
    let seen = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      seen += histogram[value];
      if (seen > target) return value;
    }
    return 255;
  };

  // Guardrails keep colored paper, highlights, and shadows from being crushed
  // even when a photographed page has a narrow histogram.
  const blackPoint = Math.min(80, percentile(0.012));
  const whitePoint = Math.max(220, Math.min(250, percentile(0.992)));
  const range = Math.max(32, whitePoint - blackPoint);
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const luminance = luminanceAt(x, y);
      const normalized = clamp(((luminance - blackPoint) * 255) / range);
      const tone = luminance + (normalized - luminance) * 0.42;
      const delta = tone - luminance;

      // Add the same luminance delta to every channel so color markings keep
      // their hue instead of being independently color-shifted.
      data[i] = clamp(data[i] + delta);
      data[i + 1] = clamp(data[i + 1] + delta);
      data[i + 2] = clamp(data[i + 2] + delta);
    }
  }

  try {
    ctx.putImageData(image, 0, 0);
  } catch {
    return src;
  }
  return dst;
}

function sCurve(v: number): number {
  const n = v / 255;
  // Gentle S-curve to boost contrast
  const out = n < 0.5
    ? 2 * n * n
    : 1 - Math.pow(-2 * n + 2, 2) / 2;
  return clamp(out * 255);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export const FILTER_LABELS: Record<FilterType, string> = {
  original:     'Original',
  bw:           'B&W',
  highcontrast: 'High Contrast',
  auto:         'Auto Color',
};
