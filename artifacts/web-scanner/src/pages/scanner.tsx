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
  const { videoRef, startCamera, stopCamera, hasPermission, error } = useCamera();
  const { mode, setMode, pages, addPage, settings } = useScannerContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const autoCaptureTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 150); // Flash effect
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Apply greyscale filter if selected
    if (settings.colorMode === 'greyscale') {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;     // red
        data[i + 1] = avg; // green
        data[i + 2] = avg; // blue
      }
      ctx.putImageData(imageData, 0, 0);
    }
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    addPage(dataUrl);
    
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <Camera className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Camera Access Denied</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          DocScan needs camera access to scan documents. Please enable it in your browser settings and refresh.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline" className="text-black">
          Refresh Page
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-black overflow-hidden flex flex-col">
      {/* Hidden canvas for capturing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        <SettingsSheet />
        
        <div className="flex bg-black/40 backdrop-blur-md rounded-full p-1 border border-white/10">
          <button
            onClick={() => setMode('auto')}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
              mode === 'auto' ? "bg-white text-black" : "text-white/70 hover:text-white"
            )}
          >
            Auto
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
              mode === 'manual' ? "bg-white text-black" : "text-white/70 hover:text-white"
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
            className="text-white hover:bg-white/20 font-semibold"
          >
            Exit
          </Button>
        ) : (
          <div className="w-[68px]"></div> /* Placeholder for balance */
        )}
      </div>

      {/* Flash Effect */}
      <div 
        className={cn(
          "absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150",
          isCapturing ? "opacity-100" : "opacity-0"
        )} 
      />

      {/* Video View */}
      <div className="flex-1 relative flex items-center justify-center bg-zinc-900">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Viewfinder overlay */}
        <div className="absolute inset-4 border-2 border-white/30 rounded-2xl pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-2xl"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-2xl"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-2xl"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-2xl"></div>
        </div>

        {/* Desktop Hint */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-sm hidden md:flex items-center gap-2 backdrop-blur-md bg-black/40 px-4 py-2 rounded-full pointer-events-none">
          <Smartphone className="w-4 h-4" /> Use on mobile for best experience
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-8 pt-12 px-6 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-6">
        
        {/* Thumbnails */}
        {pages.length > 0 && (
          <div className="flex gap-3 overflow-x-auto snap-x hide-scrollbar px-2">
            {pages.map((p, i) => (
              <div 
                key={i} 
                className="relative shrink-0 w-16 h-20 rounded-md overflow-hidden border border-white/20 snap-center"
              >
                <img src={p} alt={`Page ${i+1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 right-1 bg-black/70 text-[10px] text-white px-1.5 py-0.5 rounded font-mono">
                  {i+1}
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
            className="text-white hover:bg-white/20 w-12 h-12 rounded-full"
          >
            <ImageIcon className="w-6 h-6" />
          </Button>

          <button 
            onClick={handleCaptureClick}
            className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-white active:scale-95 transition-transform"
          >
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
              {mode === 'manual' ? (
                <div className="w-14 h-14 border-2 border-black rounded-full" />
              ) : (
                <Zap className="w-6 h-6 text-black fill-black" />
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
