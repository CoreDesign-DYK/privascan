import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, Image as ImageIcon, Zap, CheckCircle2, ChevronRight, X, Smartphone } from 'lucide-react';
import { useCamera } from '@/hooks/use-camera';
import { useScannerContext } from '@/contexts/scanner-context';
import { SettingsSheet } from '@/components/settings-sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ScannerScreen() {
  const [, setLocation] = useLocation();
  const { videoRef, startCamera, stopCamera, hasPermission, isMockMode } = useCamera();
  const { mode, setMode, pages, addPage, settings } = useScannerContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const autoCaptureTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureFrame = () => {
    if (!canvasRef.current) return;

    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 150); // Flash effect

    const canvas = canvasRef.current;

    if (isMockMode || !videoRef.current) {
      // Dev mode: generate a fake scanned document image
      canvas.width = 1240;
      canvas.height = 1754; // A4 proportions
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pageNum = pages.length + 1;
      const bg = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#fafaf8';
      const ink = settings.colorMode === 'greyscale' ? '#222' : '#1a1a2e';

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle paper texture lines
      ctx.strokeStyle = settings.colorMode === 'greyscale' ? '#ddd' : '#e8e4dc';
      ctx.lineWidth = 1;
      for (let y = 80; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(60, y);
        ctx.lineTo(canvas.width - 60, y);
        ctx.stroke();
      }

      // Mock text content
      ctx.fillStyle = ink;
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(`Sample Document`, 80, 120);
      ctx.font = '32px sans-serif';
      ctx.fillStyle = '#666';
      ctx.fillText(`Page ${pageNum}  ·  ${settings.paperSize}  ·  ${settings.scanType}`, 80, 175);
      ctx.fillStyle = ink;
      ctx.font = '28px sans-serif';
      const lines = [
        'Lorem ipsum dolor sit amet, consectetur adipiscing',
        'elit. Sed do eiusmod tempor incididunt ut labore et',
        'dolore magna aliqua. Ut enim ad minim veniam.',
        '',
        'Quis nostrud exercitation ullamco laboris nisi ut',
        'aliquip ex ea commodo consequat. Duis aute irure',
        'dolor in reprehenderit in voluptate velit esse.',
        '',
        'Cillum dolore eu fugiat nulla pariatur. Excepteur',
        'sint occaecat cupidatat non proident, sunt in culpa',
        'qui officia deserunt mollit anim id est laborum.',
      ];
      lines.forEach((line, i) => {
        ctx.fillText(line, 80, 240 + i * 46);
      });

      // Corner scan marks
      const markColor = '#3b82f6';
      ctx.strokeStyle = markColor;
      ctx.lineWidth = 6;
      [[0,0],[canvas.width,0],[0,canvas.height],[canvas.width,canvas.height]].forEach(([x,y]) => {
        const dx = x === 0 ? 1 : -1;
        const dy = y === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x + dx * 30, y + dy * 8);
        ctx.lineTo(x + dx * 8, y + dy * 8);
        ctx.lineTo(x + dx * 8, y + dy * 30);
        ctx.stroke();
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      addPage(dataUrl);
    } else {
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (settings.colorMode === 'greyscale') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg;
          data[i + 1] = avg;
          data[i + 2] = avg;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      addPage(dataUrl);
    }
    
    // In auto mode, wait 1.5s then capture again? Actually, prompt: 
    // "In Auto mode: camera streams continuously; when the user taps the capture button, it captures and auto-continues."
    // Maybe we just let them tap, or it captures automatically on interval? 
    // "taps the capture button, it captures and auto-continues." -> might mean it just doesn't freeze the preview. 
    // Manual might freeze or something? Or maybe "auto-continues" means it keeps scanning if it detects a document.
    // We'll just have manual mode tap = capture. 
    if (mode === 'auto') {
      toast.success('Page captured');
    }
  };

  const handleCaptureClick = () => {
    captureFrame();
  };

  if (hasPermission === false) {
    return (
      <div className="min-h-screen bg-white text-foreground flex flex-col items-center justify-center p-6 text-center">
        <Camera className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Camera Access Denied</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          DocScan needs camera access to scan documents. Please enable it in your browser settings and refresh.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Refresh Page
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-white overflow-hidden flex flex-col">
      {/* Hidden canvas for capturing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-white/90 to-transparent">
        <SettingsSheet />

        <div className="flex bg-gray-100 rounded-full p-1 border border-gray-200">
          <button
            onClick={() => setMode('auto')}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
              mode === 'auto' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            Auto
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
              mode === 'manual' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            Manual
          </button>
        </div>

        {mode === 'auto' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/preview')}
            className="text-gray-700 hover:bg-gray-100 font-semibold"
          >
            Exit
          </Button>
        ) : (
          <div className="w-[68px]" />
        )}
      </div>

      {/* Flash Effect */}
      <div
        className={cn(
          "absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150",
          isCapturing ? "opacity-80" : "opacity-0"
        )}
      />

      {/* Camera View (hidden in dev mode) */}
      {!isMockMode && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Mock Camera View (dev mode only) */}
      <div className={cn(
        "flex-1 relative flex items-center justify-center",
        isMockMode ? "bg-gray-50" : "bg-gray-100"
      )}>
        {isMockMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            {/* Simulated document */}
            <div
              className="relative w-48 h-64 rounded-md shadow-lg border border-gray-200"
              style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f0 100%)' }}
            >
              <div className="p-4 space-y-2">
                <div className="h-2 bg-gray-300 rounded w-3/4" />
                <div className="h-2 bg-gray-200 rounded w-full" />
                <div className="h-2 bg-gray-200 rounded w-5/6" />
                <div className="h-2 bg-gray-200 rounded w-full" />
                <div className="h-2 bg-gray-200 rounded w-2/3" />
                <div className="mt-4 h-2 bg-gray-200 rounded w-full" />
                <div className="h-2 bg-gray-200 rounded w-4/5" />
                <div className="h-2 bg-gray-200 rounded w-full" />
              </div>
            </div>
            <p className="mt-5 text-gray-400 text-xs tracking-widest uppercase">
              Dev Mode — Camera Off
            </p>
          </div>
        )}

        {/* Viewfinder overlay */}
        <div className="absolute inset-4 border-2 border-gray-300 rounded-2xl pointer-events-none" />

        {/* Desktop Hint (production only) */}
        {!isMockMode && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-500 text-sm hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full pointer-events-none border border-gray-200">
            <Smartphone className="w-4 h-4" /> Use on mobile for best experience
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-8 pt-12 px-6 bg-gradient-to-t from-white via-white/90 to-transparent flex flex-col gap-6">

        {/* Thumbnails */}
        {pages.length > 0 && (
          <div className="flex gap-3 overflow-x-auto snap-x hide-scrollbar px-2">
            {pages.map((p, i) => (
              <div
                key={i}
                className="relative shrink-0 w-16 h-20 rounded-md overflow-hidden border border-gray-200 snap-center shadow-sm"
              >
                <img src={p} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 right-1 bg-white/90 text-[10px] text-gray-700 px-1.5 py-0.5 rounded font-mono">
                  {i + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/gallery')}
            className="text-gray-600 hover:bg-gray-100 w-12 h-12 rounded-full"
          >
            <ImageIcon className="w-6 h-6" />
          </Button>

          <button
            onClick={handleCaptureClick}
            className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-gray-800 active:scale-95 transition-transform"
          >
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center">
              {mode === 'manual' ? (
                <div className="w-14 h-14 border-2 border-white rounded-full" />
              ) : (
                <Zap className="w-6 h-6 text-white fill-white" />
              )}
            </div>
          </button>

          {mode === 'manual' ? (
            <Button
              onClick={() => setLocation('/preview')}
              disabled={pages.length === 0}
              className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 text-white shadow-lg disabled:opacity-0 transition-opacity"
            >
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold">{pages.length}</span>
                <ChevronRight className="w-4 h-4 -mt-1" />
              </div>
            </Button>
          ) : (
            <div className="w-16" />
          )}
        </div>
      </div>
    </div>
  );
}
