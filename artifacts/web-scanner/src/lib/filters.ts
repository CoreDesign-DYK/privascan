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
