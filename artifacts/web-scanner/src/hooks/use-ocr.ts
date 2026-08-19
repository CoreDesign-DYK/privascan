/**
 * use-ocr.ts
 * On-device OCR via Tesseract.js (WASM) — zero server, works fully offline.
 * Language follows the app's language selector and runs fully on-device.
 */
import { useState, useCallback, useRef } from 'react';
import { createWorker, type Worker } from 'tesseract.js';
import { type Language } from '@/contexts/language-context';

const LANG_MAP: Record<Language, string> = {
  EN: 'eng',
  DE: 'deu',
  FR: 'fra',
  ES: 'spa',
  IT: 'ita',
  PT: 'por',
  RU: 'rus',
  ZH: 'chi_sim',
  JA: 'jpn',
  KO: 'kor',
  AR: 'ara',
  HI: 'hin',
  NL: 'nld',
};

export type OcrStatus = 'idle' | 'loading' | 'recognizing' | 'done' | 'error';

export interface OcrResult {
  text: string;
  confidence: number; // 0–100
}

export function useOcr() {
  const [status, setStatus]   = useState<OcrStatus>('idle');
  const [result, setResult]   = useState<OcrResult | null>(null);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  const recognize = useCallback(async (imageDataUrl: string, lang: Language = 'EN') => {
    try {
      setStatus('loading');
      setResult(null);
      setProgress(0);

      // Terminate previous worker if any
      if (workerRef.current) {
        await workerRef.current.terminate();
        workerRef.current = null;
      }

      const worker = await createWorker(LANG_MAP[lang], 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
            setStatus('recognizing');
          }
        },
      });

      workerRef.current = worker;

      const { data } = await worker.recognize(imageDataUrl);
      await worker.terminate();
      workerRef.current = null;

      setResult({ text: data.text.trim(), confidence: Math.round(data.confidence) });
      setStatus('done');
    } catch (err) {
      console.error('OCR error', err);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setProgress(0);
  }, []);

  return { recognize, reset, status, result, progress };
}
