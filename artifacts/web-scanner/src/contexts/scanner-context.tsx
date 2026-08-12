import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ScanType = 'document' | 'photo';
export type ColorMode = 'color' | 'greyscale';

export const PAPER_SIZES = [
  'Card', 'L Landscape', 'L Portrait', '4"x6" Landscape', '4"x6" Portrait', 
  'Hagaki Landscape', 'Hagaki Portrait', '2L Landscape', '2L Portrait', 
  'A5', 'B5', 'A4', 'Statement', 'Letter'
] as const;

export type PaperSize = typeof PAPER_SIZES[number];

interface ScannerSettings {
  scanType: ScanType;
  colorMode: ColorMode;
  paperSize: PaperSize;
}

interface ScannerContextType {
  settings: ScannerSettings;
  setSettings: (settings: Partial<ScannerSettings>) => void;
  pages: string[]; // Base64 JPEG data URLs
  addPage: (dataUrl: string) => void;
  removePage: (index: number) => void;
  clearPages: () => void;
  mode: 'auto' | 'manual';
  setMode: (mode: 'auto' | 'manual') => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [settings, setFullSettings] = useState<ScannerSettings>({
    scanType: 'document',
    colorMode: 'color',
    paperSize: 'A4'
  });
  
  const [pages, setPages] = useState<string[]>([]);
  const [mode, setMode] = useState<'auto' | 'manual'>('manual');

  const setSettings = (newSettings: Partial<ScannerSettings>) => {
    setFullSettings(prev => ({ ...prev, ...newSettings }));
  };

  const addPage = (dataUrl: string) => {
    setPages(prev => [...prev, dataUrl]);
  };

  const removePage = (index: number) => {
    setPages(prev => prev.filter((_, i) => i !== index));
  };

  const clearPages = () => {
    setPages([]);
  };

  return (
    <ScannerContext.Provider value={{
      settings, setSettings,
      pages, addPage, removePage, clearPages,
      mode, setMode
    }}>
      {children}
    </ScannerContext.Provider>
  );
}

export function useScannerContext() {
  const context = useContext(ScannerContext);
  if (context === undefined) {
    throw new Error('useScannerContext must be used within a ScannerProvider');
  }
  return context;
}
