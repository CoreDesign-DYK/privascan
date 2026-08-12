/**
 * ocr-panel.tsx
 * On-device OCR result panel — runs fully in the browser (Tesseract WASM).
 * No internet, no server, no cost.
 */
import { ScanText, Copy, Check, RefreshCw, Loader2, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOcr } from '@/hooks/use-ocr';
import { useLanguage } from '@/contexts/language-context';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface OcrPanelProps {
  /** base64 data-URL of the page to recognise */
  imageDataUrl: string;
}

export function OcrPanel({ imageDataUrl }: OcrPanelProps) {
  const { language } = useLanguage();
  const { recognize, reset, status, result, progress } = useOcr();
  const [copied, setCopied] = useState(false);

  const handleRun = () => {
    reset();
    recognize(imageDataUrl, language);
  };

  const handleCopy = () => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      toast.success('Text copied');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl border bg-background shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-secondary/40">
        <div className="flex items-center gap-2">
          <ScanText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">OCR — On-Device Text Recognition</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <WifiOff className="w-3 h-3" />
          Offline · Free
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {status === 'idle' && (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Recognise text using on-device ML — no internet required.
            </p>
            <Button onClick={handleRun} className="rounded-full" size="sm">
              <ScanText className="w-4 h-4 mr-2" />
              Extract Text ({language})
            </Button>
          </div>
        )}

        {(status === 'loading' || status === 'recognizing') && (
          <div className="text-center py-6 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              {status === 'loading' ? 'Loading language model…' : `Recognising… ${progress}%`}
            </p>
            {status === 'recognizing' && (
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-destructive">Recognition failed.</p>
            <Button variant="outline" size="sm" onClick={handleRun}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try Again
            </Button>
          </div>
        )}

        {status === 'done' && result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Confidence: <strong className={cn(result.confidence > 70 ? 'text-green-600' : 'text-amber-500')}>
                  {result.confidence}%
                </strong>
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleRun}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Re-run
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleCopy}>
                  {copied ? <Check className="w-3 h-3 mr-1 text-green-600" /> : <Copy className="w-3 h-3 mr-1" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <textarea
              readOnly
              className="w-full min-h-[120px] text-sm font-mono bg-secondary/50 rounded-lg p-3 border resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              value={result.text || '(No text detected)'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
