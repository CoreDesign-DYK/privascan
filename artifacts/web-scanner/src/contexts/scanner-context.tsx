import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type Point } from '@/lib/perspective';
import {
  type ScanType, type ColorMode, type PaperSize, type ImageQuality, type ScannerSettings,
  PAPER_SIZES,
} from '@/lib/scanner-types';

// Type-only re-exports are erased at runtime — Fast Refresh compatible
export type { ScanType, ColorMode, PaperSize, ImageQuality, ScannerSettings };

interface ScannerContextType {
  settings: ScannerSettings;
  setSettings: (s: Partial<ScannerSettings>) => void;
  pages: string[];
  addPage: (dataUrl: string) => void;
  removePage: (index: number) => void;
  updatePage: (index: number, dataUrl: string) => void;
  clearPages: () => void;
  mode: 'auto' | 'manual';
  setMode: (mode: 'auto' | 'manual') => void;
  /** Raw captured image waiting to be edited */
  pendingPage: string | null;
  setPendingPage: (url: string | null) => void;
  /** Document corners detected by the camera (or null if none found) */
  detectedCorners: [Point, Point, Point, Point] | null;
  setDetectedCorners: (c: [Point, Point, Point, Point] | null) => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [settings, setFullSettings] = useState<ScannerSettings>({
    scanType:     'document',
    colorMode:    'color',
    paperSize:    'A4',
    imageQuality: 'high',
  });
  const [pages, setPages]                     = useState<string[]>([]);
  const [mode, setMode]                       = useState<'auto' | 'manual'>('manual');
  const [pendingPage, setPendingPage]         = useState<string | null>(null);
  const [detectedCorners, setDetectedCorners] = useState<[Point, Point, Point, Point] | null>(null);

  const setSettings = (s: Partial<ScannerSettings>) =>
    setFullSettings(prev => ({ ...prev, ...s }));

  const addPage     = useCallback((url: string)  => setPages(p => [...p, url]),           []);
  const removePage  = useCallback((i: number)    => setPages(p => p.filter((_, j) => j !== i)), []);
  const updatePage  = useCallback((i: number, url: string) => setPages(p => p.map((ex, j) => j === i ? url : ex)), []);
  const clearPages  = useCallback(()             => setPages([]),                           []);

  return (
    <ScannerContext.Provider value={{
      settings, setSettings,
      pages, addPage, removePage, updatePage, clearPages,
      mode, setMode,
      pendingPage, setPendingPage,
      detectedCorners, setDetectedCorners,
    }}>
      {children}
    </ScannerContext.Provider>
  );
}

export function useScannerContext() {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScannerContext must be inside ScannerProvider');
  return ctx;
}
