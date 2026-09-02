/** Scanner domain types and constants — kept separate so scanner-context.tsx
 *  only exports React components/hooks (Fast Refresh compatible). */

export type ScanType     = 'document' | 'photo';
export type ScanMode     = 'document' | 'book' | 'presentation' | 'id-cards';
export type ColorMode    = 'color' | 'greyscale';
export type PendingEditMode = 'document' | 'presentation';

export const PAPER_SIZES = ['A4', 'A5', 'Letter'] as const;
export type PaperSize = typeof PAPER_SIZES[number];

export const DPI_PRESETS = [150, 200, 250] as const;
export const MIN_SCAN_DPI = 120;
export const MAX_SCAN_DPI = 300;
export const DEFAULT_SCAN_DPI = 250;

/** JPEG compression stays independent from the requested output resolution. */
export const SCAN_JPEG_QUALITY = 0.95;
export const MOBILE_SCAN_JPEG_QUALITY = 0.98;

const PAPER_DIMENSIONS_MM: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
};

export interface ScannerSettings {
  scanType:     ScanType;
  colorMode:    ColorMode;
  paperSize:    PaperSize;
  targetDpi:    number;
}

type LegacyImageQuality = 'high' | 'medium' | 'low';
type StoredScannerSettings = Partial<ScannerSettings> & {
  imageQuality?: LegacyImageQuality;
};

export function clampScanDpi(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCAN_DPI;
  return Math.min(MAX_SCAN_DPI, Math.max(MIN_SCAN_DPI, Math.round(value)));
}

export function normalizeScannerSettings(value: unknown): ScannerSettings {
  const stored = value && typeof value === 'object'
    ? value as StoredScannerSettings
    : {};
  const legacyDpi: Record<LegacyImageQuality, number> = {
    high: 250,
    medium: 200,
    low: 150,
  };
  const legacyQuality = stored.imageQuality;

  return {
    scanType: stored.scanType === 'photo' ? 'photo' : 'document',
    colorMode: stored.colorMode === 'greyscale' ? 'greyscale' : 'color',
    paperSize: PAPER_SIZES.includes(stored.paperSize as PaperSize)
      ? stored.paperSize as PaperSize
      : 'A4',
    targetDpi: clampScanDpi(
      typeof stored.targetDpi === 'number'
        ? stored.targetDpi
        : legacyQuality
          ? legacyDpi[legacyQuality]
          : DEFAULT_SCAN_DPI,
    ),
  };
}

export function getPaperPixelSize(
  paperSize: PaperSize,
  dpi: number,
  orientation: 'portrait' | 'landscape' = 'portrait',
): { width: number; height: number } {
  const mm = PAPER_DIMENSIONS_MM[paperSize];
  const requestedDpi = clampScanDpi(dpi);
  const portrait = {
    width: Math.round(mm.width / 25.4 * requestedDpi),
    height: Math.round(mm.height / 25.4 * requestedDpi),
  };
  return orientation === 'portrait'
    ? portrait
    : { width: portrait.height, height: portrait.width };
}

export function fitSourceWithinOutput(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
  maxPixels = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const pixelScale = Number.isFinite(maxPixels)
    ? Math.sqrt(maxPixels / Math.max(1, safeWidth * safeHeight))
    : 1;
  const scale = Math.min(
    1,
    maxWidth / safeWidth,
    maxHeight / safeHeight,
    pixelScale,
  );
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function estimateEffectiveDpi(
  width: number,
  height: number,
  paperSize: PaperSize,
): number {
  const mm = PAPER_DIMENSIONS_MM[paperSize];
  const portraitWidth = Math.min(width, height);
  const portraitHeight = Math.max(width, height);
  return Math.round(Math.min(
    portraitWidth / (mm.width / 25.4),
    portraitHeight / (mm.height / 25.4),
  ));
}
