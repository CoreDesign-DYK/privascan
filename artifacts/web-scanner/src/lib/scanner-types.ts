/** Scanner domain types and constants — kept separate so scanner-context.tsx
 *  only exports React components/hooks (Fast Refresh compatible). */

export type ScanType     = 'document' | 'photo';
export type ColorMode    = 'color' | 'greyscale';
export type ImageQuality = 'high' | 'medium' | 'low';

/** JPEG quality values per tier */
export const QUALITY_VALUES: Record<ImageQuality, number> = {
  high:   0.95,
  medium: 0.80,
  low:    0.60,
};

export const PAPER_SIZES = [
  'Card', 'L Landscape', 'L Portrait', '4"x6" Landscape', '4"x6" Portrait',
  'Hagaki Landscape', 'Hagaki Portrait', '2L Landscape', '2L Portrait',
  'A5', 'B5', 'A4', 'Statement', 'Letter',
] as const;

export type PaperSize = typeof PAPER_SIZES[number];

export interface ScannerSettings {
  scanType:     ScanType;
  colorMode:    ColorMode;
  paperSize:    PaperSize;
  imageQuality: ImageQuality;
}
