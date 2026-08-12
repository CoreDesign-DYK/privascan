import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Image as ImageIcon, Zap, ChevronRight, Smartphone } from 'lucide-react';
import { useCamera } from '@/hooks/use-camera';
import { useScannerContext } from '@/contexts/scanner-context';
import { SettingsSheet } from '@/components/settings-sheet';
import { RadialMenu } from '@/components/radial-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { detectDocumentCorners, defaultCorners } from '@/lib/edge-detection';
import { type Point } from '@/lib/perspective';

// How often to run edge detection (ms)
const EDGE_INTERVAL = 200;

export default function ScannerScreen() {
  const [, setLocation] = useLocation();
  const { videoRef, startCamera, stopCamera, hasPermission, isMockMode } = useCamera();
  const {
    mode, setMode, pages, addPage, settings,
    setPendingPage, setDetectedCorners,
  } = useScannerContext();

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<SVGSVGElement>(null);
  const [isCapturing, setIsCapturing]     = useState(false);
  const [edgeCorners, setEdgeCorners]     = useState<[Point, Point, Point, Point] | null>(null);
  const edgeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stableFrames = useRef(0);

  // ── Camera lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (edgeTimerRef.current) clearInterval(edgeTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  // ── Real-time edge detection loop ──────────────────────────────────────────
  useEffect(() => {
    if (isMockMode) return; // skip in dev mode

    edgeTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const corners = detectDocumentCorners(video, video.videoWidth, video.videoHeight);
      setEdgeCorners(corners);

      // Auto-capture: if corners stable for 7 intervals (~1.4 s) in Auto mode
      if (mode === 'auto') {
        if (corners) {
          stableFrames.current++;
          if (stableFrames.current >= 7) {
            stableFrames.current = 0;
            captureFrame();
          }
        } else {
          stableFrames.current = 0;
        }
      }
    }, EDGE_INTERVAL);

    return () => {
      if (edgeTimerRef.current) clearInterval(edgeTimerRef.current);
    };
  }, [isMockMode, mode, videoRef]);

  // ── Capture ────────────────────────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    if (!canvasRef.current) return;
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 150);

    const canvas = canvasRef.current;

    if (isMockMode || !videoRef.current) {
      // Dev mode: generate mock document image
      canvas.width = 1240; canvas.height = 1754;
      const ctx = canvas.getContext('2d')!;
      const pageNum = pages.length + 1;
      const bg  = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#fafaf8';
      const ink = settings.colorMode === 'greyscale' ? '#222' : '#1a1a2e';

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = settings.colorMode === 'greyscale' ? '#ddd' : '#e8e4dc';
      ctx.lineWidth = 1;
      for (let y = 80; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(canvas.width - 60, y); ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText('Sample Document', 80, 120);
      ctx.font = '32px sans-serif'; ctx.fillStyle = '#666';
      ctx.fillText(`Page ${pageNum}  ·  ${settings.paperSize}  ·  ${settings.scanType}`, 80, 175);
      ctx.fillStyle = ink; ctx.font = '28px sans-serif';
      [
        'Lorem ipsum dolor sit amet, consectetur adipiscing',
        'elit. Sed do eiusmod tempor incididunt ut labore et',
        'dolore magna aliqua. Ut enim ad minim veniam.',
        '',
        'Quis nostrud exercitation ullamco laboris nisi ut',
        'aliquip ex ea commodo consequat. Duis aute irure',
        'dolor in reprehenderit in voluptate velit esse.',
      ].forEach((line, i) => ctx.fillText(line, 80, 240 + i * 46));

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      // Navigate to edit screen with the captured image
      setPendingPage(dataUrl);
      setDetectedCorners(defaultCorners(canvas.width, canvas.height));
      setLocation('/edit');
    } else {
      const video = videoRef.current;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (settings.colorMode === 'greyscale') {
        const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < id.data.length; i += 4) {
          const avg = (id.data[i] + id.data[i + 1] + id.data[i + 2]) / 3;
          id.data[i] = id.data[i + 1] = id.data[i + 2] = avg;
        }
        ctx.putImageData(id, 0, 0);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setPendingPage(dataUrl);
      // Pass detected corners to the edit screen
      setDetectedCorners(edgeCorners ?? defaultCorners(canvas.width, canvas.height));
      setLocation('/edit');
    }

    if (mode === 'auto') toast.success('Page captured');
  }, [
    isMockMode, videoRef, canvasRef, pages.length, settings,
    mode, edgeCorners, setPendingPage, setDetectedCorners, setLocation,
  ]);

  if (hasPermission === false) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Camera Access Denied</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          DocScan needs camera access. Please enable it in browser settings and refresh.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline">Refresh Page</Button>
      </div>
    );
  }

  // In the overlay, scale edge corners from video-native to CSS display coords
  // We don't know display coords easily here, so we use viewBox matching video ratio
  const videoEl  = videoRef.current;
  const viewW    = videoEl?.videoWidth  || 640;
  const viewH    = videoEl?.videoHeight || 480;

  return (
    <div className="relative min-h-[100dvh] bg-white overflow-hidden flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-white/90 to-transparent">
        <SettingsSheet />

        <div className="flex bg-gray-100 rounded-full p-1 border border-gray-200">
          {(['auto', 'manual'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-semibold transition-all capitalize',
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'auto' ? (
          <Button variant="ghost" size="sm" onClick={() => setLocation('/preview')}
            className="text-gray-700 hover:bg-gray-100 font-semibold">
            Exit
          </Button>
        ) : <div className="w-[68px]" />}
      </div>

      {/* Flash effect */}
      <div className={cn(
        'absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150',
        isCapturing ? 'opacity-80' : 'opacity-0'
      )} />

      {/* Live camera video */}
      {!isMockMode && (
        <video
          ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Camera / mock area */}
      <div className={cn('flex-1 relative flex items-center justify-center', isMockMode ? 'bg-gray-50' : 'bg-transparent')}>

        {/* Mock document (dev mode) */}
        {isMockMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="relative w-48 h-64 rounded-md shadow-lg border border-gray-200"
              style={{ background: 'linear-gradient(135deg,#fff 0%,#f5f5f0 100%)' }}>
              <div className="p-4 space-y-2">
                {[3/4, 1, 5/6, 1, 2/3, 1, 4/5, 1].map((w, i) =>
                  <div key={i} className={cn('h-2 rounded', i === 0 ? 'bg-gray-300' : 'bg-gray-200')}
                    style={{ width: `${w * 100}%` }} />
                )}
              </div>
            </div>
            <p className="mt-5 text-gray-400 text-xs tracking-widest uppercase">Dev Mode — Camera Off</p>
          </div>
        )}

        {/* Edge detection overlay (production camera) */}
        {!isMockMode && edgeCorners && (
          <svg
            ref={overlayRef}
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid slice"
          >
            {/* Blue quadrilateral */}
            <polygon
              points={edgeCorners.map(p => `${p.x},${p.y}`).join(' ')}
              fill="rgba(59,130,246,0.08)"
              stroke="#3b82f6"
              strokeWidth="3"
              strokeDasharray="12 6"
            />
            {/* Corner dots */}
            {edgeCorners.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="10"
                fill="#3b82f6" stroke="white" strokeWidth="3" />
            ))}
          </svg>
        )}

        {/* Desktop hint */}
        {!isMockMode && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-500 text-sm hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full pointer-events-none border border-gray-200">
            <Smartphone className="w-4 h-4" /> Use on mobile for best experience
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-8 pt-12 px-6 bg-gradient-to-t from-white via-white/90 to-transparent flex flex-col gap-6">

        {/* Page thumbnails */}
        {pages.length > 0 && (
          <div className="flex gap-3 overflow-x-auto snap-x px-2">
            {pages.map((p, i) => (
              <div key={i}
                className="relative shrink-0 w-16 h-20 rounded-md overflow-hidden border border-gray-200 snap-center shadow-sm">
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
          <Button variant="ghost" size="icon"
            onClick={() => setLocation('/gallery')}
            className="text-gray-600 hover:bg-gray-100 w-12 h-12 rounded-full">
            <ImageIcon className="w-6 h-6" />
          </Button>

          {/* Capture button with radial menu */}
          <RadialMenu
            onRetake={() => toast('Retake')}
            onCrop={() => { if (pages.length) { setPendingPage(pages[pages.length - 1]); setLocation('/edit'); } else toast('No page yet'); }}
            onRotate={() => toast('Rotate')}
            onMarkup={() => toast('Markup')}
            onDelete={() => toast.error('Deleted')}
          >
            <button
              onClick={captureFrame}
              className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-gray-800 active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center">
                {mode === 'manual'
                  ? <div className="w-14 h-14 border-2 border-white rounded-full" />
                  : <Zap className="w-6 h-6 text-white fill-white" />}
              </div>
            </button>
          </RadialMenu>

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
          ) : <div className="w-16" />}
        </div>
      </div>
    </div>
  );
}
