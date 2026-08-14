/** Scanner domain types and constants — kept separate so scanner-context.tsx
 *  only exports React components/hooks (Fast Refresh compatible). */

export type ScanType     = 'document' | 'photo';
export type ScanMode     = 'document' | 'book' | 'presentation' | 'id-cards';
export type ColorMode    = 'color' | 'greyscale';
export type ImageQuality = 'high' | 'medium' | 'low';

/** JPEG quality values per tier */
export const QUALITY_VALUES: Record<ImageQuality, number> = {
  high:   0.95,
  medium: 0.80,
  low:    0.60,
};

export const PAPER_SIZES = ['A4', 'A5', 'Letter'] as const;

export type PaperSize = typeof PAPER_SIZES[number];

export interface ScannerSettings {
  scanType:     ScanType;
  colorMode:    ColorMode;
  paperSize:    PaperSize;
  imageQuality: ImageQuality;
}
