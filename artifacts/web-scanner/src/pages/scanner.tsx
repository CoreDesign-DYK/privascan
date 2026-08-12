/**
 * scanner.tsx
 *
 * Manual mode  →  capture button tap → /edit (full crop/filter editing)
 * Auto mode    →  edge detection stabilises → auto-capture → pages[] directly
 *                 Progress ring fills on capture button as document stabilises.
 *                 Blue outline → green when ready to fire.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Image as ImageIcon, Zap, ChevronRight, Smartphone, Edit2 } from 'lucide-react';
import { useCamera } from '@/hooks/use-camera';
import { useScannerContext } from '@/contexts/scanner-context';
import { SettingsSheet } from '@/components/settings-sheet';
import { RadialMenu } from '@/components/radial-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { detectDocumentCorners, defaultCorners } from '@/lib/edge-detection';
import { type Point } from '@/lib/perspective';
import { type ScannerSettings } from '@/lib/scanner-types';

// Edge-detection polling rate
const EDGE_INTERVAL_MS = 200;
// Frames document must stay stable before auto-capture triggers
const STABLE_TARGET = 8; // 8 × 200 ms = 1.6 s

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function generateMockPage(pageNum: number, settings: ScannerSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d')!;

  const bg  = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#fafaf8';
  const ink = settings.colorMode === 'greyscale' ? '#222'    : '#1a1a2e';

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

  return canvas.toDataURL('image/jpeg', 0.92);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Progress ring geometry                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
const RING_R    = 39;
const RING_CIRC = 2 * Math.PI * RING_R;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Component                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function ScannerScreen() {
  const [, setLocation] = useLocation();
  const { videoRef, startCamera, stopCamera, hasPermission, isMockMode } = useCamera();
  const {
    mode, setMode, pages, addPage, settings,
    setPendingPage, setDetectedCorners,
  } = useScannerContext();

  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const [isCapturing,   setIsCapturing]   = useState(false);
  const [edgeCorners,   setEdgeCorners]   = useState<[Point, Point, Point, Point] | null>(null);
  const [stableProgress, setStableProgress] = useState(0); // 0 – 1
  // "captured!" flash label that fades out
  const [capturedLabel, setCapturedLabel] = useState<number | null>(null); // page number

  // Refs for values used inside setInterval (avoids stale-closure bugs)
  const modeRef          = useRef(mode);
  const pagesLenRef      = useRef(pages.length);
  const settingsRef      = useRef(settings);
  const edgeTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableFrames     = useRef(0);
  const captureAutoRef   = useRef<() => void>(() => {});  // kept fresh via effect

  useEffect(() => { modeRef.current     = mode;          }, [mode]);
  useEffect(() => { pagesLenRef.current = pages.length;  }, [pages.length]);
  useEffect(() => { settingsRef.current = settings;      }, [settings]);

  // Reset stability when switching modes
  useEffect(() => {
    stableFrames.current = 0;
    setStableProgress(0);
    setEdgeCorners(null);
  }, [mode]);

  /* ── Camera lifecycle ───────────────────────────────────────────────────── */
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (edgeTimerRef.current) clearInterval(edgeTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  /* ── Auto-capture (direct → pages[], no edit screen) ───────────────────── */
  const autoCaptureFrame = useCallback(() => {
    const pageNum = pagesLenRef.current + 1;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockPage(pageNum, settingsRef.current));
    } else {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      addPage(canvas.toDataURL('image/jpeg', 0.95));
    }

    // Visual feedback
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 180);
    setCapturedLabel(pageNum);
    setTimeout(() => setCapturedLabel(null), 1800);
  }, [isMockMode, videoRef, addPage]);

  // Keep ref fresh so the interval can call it without stale closure
  useEffect(() => { captureAutoRef.current = autoCaptureFrame; }, [autoCaptureFrame]);

  /* ── Real-time edge detection loop ─────────────────────────────────────── */
  useEffect(() => {
    if (isMockMode) return;

    edgeTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const corners = detectDocumentCorners(video, video.videoWidth, video.videoHeight);
      setEdgeCorners(corners);

      if (modeRef.current !== 'auto') return;

      if (corners) {
        stableFrames.current = Math.min(stableFrames.current + 1, STABLE_TARGET);
      } else {
        // Decay faster so ring drops quickly when doc moves away
        stableFrames.current = Math.max(stableFrames.current - 2, 0);
      }

      const progress = stableFrames.current / STABLE_TARGET;
      setStableProgress(progress);

      if (stableFrames.current >= STABLE_TARGET) {
        stableFrames.current = 0;
        setStableProgress(0);
        captureAutoRef.current();
      }
    }, EDGE_INTERVAL_MS);

    return () => { if (edgeTimerRef.current) clearInterval(edgeTimerRef.current); };
  }, [isMockMode, videoRef]);

  /* ── Manual capture (→ /edit screen for crop/filter) ───────────────────── */
  const manualCaptureFrame = useCallback(() => {
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 150);

    const pageNum = pagesLenRef.current + 1;

    if (isMockMode || !videoRef.current) {
      const dataUrl = generateMockPage(pageNum, settingsRef.current);
      setPendingPage(dataUrl);
      setDetectedCorners(defaultCorners(1240, 1754));
      setLocation('/edit');
    } else {
      const video  = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setPendingPage(dataUrl);
      setDetectedCorners(edgeCorners ?? defaultCorners(canvas.width, canvas.height));
      setLocation('/edit');
    }
  }, [isMockMode, videoRef, edgeCorners, setPendingPage, setDetectedCorners, setLocation]);

  /* ── Capture button handler ─────────────────────────────────────────────── */
  const handleCaptureButton = useCallback(() => {
    if (mode === 'auto') autoCaptureFrame();
    else manualCaptureFrame();
  }, [mode, autoCaptureFrame, manualCaptureFrame]);

  /* ── Permission error ───────────────────────────────────────────────────── */
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

  /* ── Edge overlay colours (blue → green as stability grows) ─────────────── */
  const isStable     = stableProgress > 0.85;
  const edgeStroke   = isStable ? '#22c55e' : '#3b82f6';
  const edgeFill     = isStable ? 'rgba(34,197,94,0.10)' : 'rgba(59,130,246,0.08)';
  const ringColor    = isStable ? '#22c55e' : '#3b82f6';

  const videoEl = videoRef.current;
  const viewW   = videoEl?.videoWidth  || 640;
  const viewH   = videoEl?.videoHeight || 480;

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="relative min-h-[100dvh] bg-white overflow-hidden flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Top bar ── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4
                      bg-gradient-to-b from-white/90 to-transparent">
        <SettingsSheet />

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-full p-1 border border-gray-200">
          {(['auto', 'manual'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-semibold transition-all capitalize',
                mode === m
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Right side */}
        {mode === 'auto' && pages.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setLocation('/preview')}
            className="text-gray-700 hover:bg-gray-100 font-semibold">
            Done&nbsp;({pages.length})
          </Button>
        ) : <div className="w-[80px]" />}
      </div>

      {/* ── White flash on capture ── */}
      <div className={cn(
        'absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150',
        isCapturing ? 'opacity-75' : 'opacity-0',
      )} />

      {/* ── Live camera ── */}
      {!isMockMode && (
        <video ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover z-0" />
      )}

      {/* ── Main viewfinder area ── */}
      <div className={cn(
        'flex-1 relative flex items-center justify-center',
        isMockMode ? 'bg-gray-50' : 'bg-transparent',
      )}>

        {/* Dev-mode mock document */}
        {isMockMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="relative w-48 h-64 rounded-md shadow-lg border border-gray-200"
              style={{ background: 'linear-gradient(135deg,#fff 0%,#f5f5f0 100%)' }}>
              <div className="p-4 space-y-2">
                {[3/4, 1, 5/6, 1, 2/3, 1, 4/5, 1].map((w, i) =>
                  <div key={i}
                    className={cn('h-2 rounded', i === 0 ? 'bg-gray-300' : 'bg-gray-200')}
                    style={{ width: `${w * 100}%` }} />
                )}
              </div>
            </div>
            <p className="mt-5 text-gray-400 text-xs tracking-widest uppercase">
              Dev Mode — Camera Off
            </p>
          </div>
        )}

        {/* Edge-detection overlay */}
        {!isMockMode && edgeCorners && (
          <svg
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid slice"
          >
            <polygon
              points={edgeCorners.map(p => `${p.x},${p.y}`).join(' ')}
              fill={edgeFill}
              stroke={edgeStroke}
              strokeWidth="3"
              strokeDasharray={isStable ? 'none' : '12 6'}
              style={{ transition: 'stroke 0.3s, fill 0.3s' }}
            />
            {edgeCorners.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="10"
                fill={edgeStroke} stroke="white" strokeWidth="3"
                style={{ transition: 'fill 0.3s' }} />
            ))}
          </svg>
        )}

        {/* "Ready!" label when stable */}
        {mode === 'auto' && isStable && !isMockMode && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20
                          bg-green-500 text-white text-sm font-semibold
                          px-5 py-2 rounded-full shadow-lg animate-pulse">
            Capturing…
          </div>
        )}

        {/* Desktop hint */}
        {!isMockMode && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-md
                          px-4 py-2 rounded-full pointer-events-none border border-gray-200
                          text-gray-500 text-sm">
            <Smartphone className="w-4 h-4" /> Use on mobile for best experience
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-8 pt-12 px-6
                      bg-gradient-to-t from-white via-white/90 to-transparent flex flex-col gap-5">

        {/* Auto-mode status hint */}
        {mode === 'auto' && (
          <div className="flex justify-center">
            {capturedLabel !== null ? (
              <span className="text-green-600 text-sm font-semibold animate-in fade-in">
                ✓ Page {capturedLabel} saved — aim at next page
              </span>
            ) : isMockMode ? (
              <span className="text-gray-400 text-sm">
                Tap the button to capture in dev mode
              </span>
            ) : edgeCorners ? (
              <span className={cn(
                'text-sm font-medium transition-colors',
                isStable ? 'text-green-600' : 'text-blue-500',
              )}>
                {isStable ? 'Hold still…' : 'Document detected — hold steady'}
              </span>
            ) : (
              <span className="text-gray-400 text-sm">Point camera at a document</span>
            )}
          </div>
        )}

        {/* Page thumbnails */}
        {pages.length > 0 && (
          <div className="flex gap-3 overflow-x-auto snap-x px-1 pb-0.5">
            {pages.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  // Tap thumbnail → open that page in edit
                  setPendingPage(p);
                  setDetectedCorners(defaultCorners(1240, 1754));
                  setLocation('/edit');
                }}
                className="relative shrink-0 w-14 h-[4.5rem] rounded-md overflow-hidden
                           border-2 border-gray-200 snap-center shadow-sm
                           hover:border-blue-400 transition-colors group"
              >
                <img src={p} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                {/* Edit icon on hover */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100
                               transition-opacity flex items-center justify-center">
                  <Edit2 className="w-4 h-4 text-white" />
                </div>
                <div className="absolute bottom-0.5 right-0.5 bg-white/90 text-[9px]
                               text-gray-700 px-1 py-0.5 rounded font-mono leading-none">
                  {i + 1}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center justify-between">

          {/* Gallery */}
          <Button variant="ghost" size="icon"
            onClick={() => setLocation('/gallery')}
            className="text-gray-600 hover:bg-gray-100 w-12 h-12 rounded-full">
            <ImageIcon className="w-6 h-6" />
          </Button>

          {/* Capture button + progress ring */}
          <RadialMenu
            onRetake={() => toast('Retake')}
            onCrop={() => {
              if (pages.length) {
                setPendingPage(pages[pages.length - 1]);
                setDetectedCorners(defaultCorners(1240, 1754));
                setLocation('/edit');
              } else toast('No page yet');
            }}
            onRotate={() => toast('Rotate')}
            onMarkup={() => toast('Markup')}
            onDelete={() => toast.error('Deleted')}
          >
            <div className="relative w-20 h-20">

              {/* Progress ring — only in auto mode */}
              {mode === 'auto' && (
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                  viewBox="0 0 80 80"
                >
                  {/* Track */}
                  <circle cx="40" cy="40" r={RING_R}
                    fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
                  {/* Progress arc */}
                  {stableProgress > 0 && (
                    <circle
                      cx="40" cy="40" r={RING_R}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRC}
                      strokeDashoffset={RING_CIRC * (1 - stableProgress)}
                      style={{ transition: 'stroke-dashoffset 0.15s ease-out, stroke 0.3s ease' }}
                    />
                  )}
                </svg>
              )}

              {/* Shutter button */}
              <button
                onClick={handleCaptureButton}
                className="absolute inset-0 flex items-center justify-center rounded-full
                           border-4 border-gray-800 active:scale-95 transition-transform"
              >
                <div className={cn(
                  'w-[3.5rem] h-[3.5rem] rounded-full flex items-center justify-center transition-colors duration-300',
                  isStable && mode === 'auto'
                    ? 'bg-green-500'
                    : 'bg-gray-800',
                )}>
                  {mode === 'manual'
                    ? <div className="w-12 h-12 border-2 border-white rounded-full" />
                    : <Zap className="w-5 h-5 text-white fill-white" />}
                </div>
              </button>
            </div>
          </RadialMenu>

          {/* Preview / page count */}
          {mode === 'manual' ? (
            <Button
              onClick={() => setLocation('/preview')}
              disabled={pages.length === 0}
              className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-white
                         shadow-lg disabled:opacity-0 transition-opacity"
            >
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold leading-none">{pages.length}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Button>
          ) : (
            /* Auto: page count pill */
            pages.length > 0 ? (
              <button
                onClick={() => setLocation('/preview')}
                className="w-14 h-14 flex items-center justify-center rounded-full
                           bg-gray-100 border border-gray-200 text-gray-700 font-semibold
                           hover:bg-gray-200 transition-colors"
              >
                <div className="flex flex-col items-center leading-none">
                  <span className="text-lg font-bold">{pages.length}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ) : <div className="w-14" />
          )}
        </div>
      </div>
    </div>
  );
}
