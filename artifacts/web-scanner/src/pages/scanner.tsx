/**
 * scanner.tsx — Dark camera UI with premium design
 *
 * D: Dark background (#0d0d14)
 * A: Animated corner bracket viewfinder
 * B: Scan line sweep on capture
 * E: Glassmorphism bottom bar
 * F: iOS-style capture button
 * H: DocScan brand wordmark in header
 * I: Sliding mode toggle pill
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Image as ImageIcon, Zap, ChevronRight, Smartphone, Edit2, ScanLine } from 'lucide-react';
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

const EDGE_INTERVAL_MS = 200;
const STABLE_TARGET = 8;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Mock page generator                                                         */
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
/*  Progress ring geometry                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
const RING_R    = 39;
const RING_CIRC = 2 * Math.PI * RING_R;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Corner bracket component (A)                                                */
/* ─────────────────────────────────────────────────────────────────────────── */
function CornerBrackets({ color }: { color: string }) {
  const SIZE = 32;
  const THICK = 3;

  const corners = [
    { top: 0, left: 0,  borderTop: THICK, borderLeft: THICK,  borderRight: 0, borderBottom: 0, borderRadius: '4px 0 0 0' },
    { top: 0, right: 0, borderTop: THICK, borderRight: THICK, borderLeft: 0,  borderBottom: 0, borderRadius: '0 4px 0 0' },
    { bottom: 0, left: 0,  borderBottom: THICK, borderLeft: THICK,  borderTop: 0, borderRight: 0,  borderRadius: '0 0 0 4px' },
    { bottom: 0, right: 0, borderBottom: THICK, borderRight: THICK, borderTop: 0, borderLeft: 0,   borderRadius: '0 0 4px 0' },
  ];

  return (
    <>
      {corners.map((c, i) => (
        <div
          key={i}
          className="absolute animate-bracket"
          style={{
            width: SIZE, height: SIZE,
            top: c.top, left: (c as any).left, right: (c as any).right, bottom: (c as any).bottom,
            borderStyle: 'solid',
            borderColor: color,
            borderTopWidth: c.borderTop ?? 0,
            borderLeftWidth: c.borderLeft ?? 0,
            borderRightWidth: c.borderRight ?? 0,
            borderBottomWidth: c.borderBottom ?? 0,
            borderRadius: c.borderRadius,
            animationDelay: `${i * 40}ms`,
            transition: 'border-color 0.35s ease',
          }}
        />
      ))}
    </>
  );
}

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

  const canvasRef            = useRef<HTMLCanvasElement>(null);
  const [isCapturing,    setIsCapturing]    = useState(false);
  const [showScanLine,   setShowScanLine]   = useState(false);   // B
  const [edgeCorners,    setEdgeCorners]    = useState<[Point, Point, Point, Point] | null>(null);
  const [stableProgress, setStableProgress] = useState(0);
  const [capturedLabel,  setCapturedLabel]  = useState<number | null>(null);
  const [selectedThumb,  setSelectedThumb]  = useState(-1);

  const lastThumbRef     = useRef<HTMLButtonElement>(null);
  const modeRef          = useRef(mode);
  const pagesLenRef      = useRef(pages.length);
  const settingsRef      = useRef(settings);
  const edgeTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableFrames     = useRef(0);
  const captureAutoRef   = useRef<() => void>(() => {});

  useEffect(() => { modeRef.current     = mode;         }, [mode]);
  useEffect(() => { pagesLenRef.current = pages.length; }, [pages.length]);
  useEffect(() => { settingsRef.current = settings;     }, [settings]);

  // Auto-select & scroll to newest thumbnail
  useEffect(() => {
    if (pages.length === 0) { setSelectedThumb(-1); return; }
    setSelectedThumb(pages.length - 1);
    setTimeout(() => {
      lastThumbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
    }, 60);
  }, [pages.length]);

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

  /* ── Flash + scan line helper ───────────────────────────────────────────── */
  const triggerCaptureEffects = useCallback(() => {
    setIsCapturing(true);
    setShowScanLine(true);
    setTimeout(() => setIsCapturing(false), 180);
    setTimeout(() => setShowScanLine(false), 520);
  }, []);

  /* ── Auto-capture ───────────────────────────────────────────────────────── */
  const autoCaptureFrame = useCallback(() => {
    const pageNum = pagesLenRef.current + 1;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockPage(pageNum, settingsRef.current));
    } else {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      addPage(canvas.toDataURL('image/jpeg', 0.95));
    }

    triggerCaptureEffects();
    setCapturedLabel(pageNum);
    setTimeout(() => setCapturedLabel(null), 1800);
  }, [isMockMode, videoRef, addPage, triggerCaptureEffects]);

  useEffect(() => { captureAutoRef.current = autoCaptureFrame; }, [autoCaptureFrame]);

  /* ── Edge detection loop ────────────────────────────────────────────────── */
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

  /* ── Manual capture ─────────────────────────────────────────────────────── */
  const manualCaptureFrame = useCallback(() => {
    triggerCaptureEffects();

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
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setPendingPage(dataUrl);
      setDetectedCorners(edgeCorners ?? defaultCorners(canvas.width, canvas.height));
      setLocation('/edit');
    }
  }, [isMockMode, videoRef, edgeCorners, setPendingPage, setDetectedCorners, setLocation, triggerCaptureEffects]);

  /* ── Capture button handler ─────────────────────────────────────────────── */
  const handleCaptureButton = useCallback(() => {
    if (mode === 'auto') autoCaptureFrame();
    else manualCaptureFrame();
  }, [mode, autoCaptureFrame, manualCaptureFrame]);

  /* ── Permission error ───────────────────────────────────────────────────── */
  if (hasPermission === false) {
    return (
      <div className="min-h-screen bg-[#0d0d14] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-semibold mb-2 text-white">Camera Access Denied</h2>
        <p className="text-white/50 mb-6 max-w-sm">
          PrivaScan needs camera access. Please enable it in browser settings and refresh.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline">Refresh Page</Button>
      </div>
    );
  }

  /* ── Derived colours ────────────────────────────────────────────────────── */
  const isStable   = stableProgress > 0.85;
  const edgeStroke = isStable ? '#4ade80' : '#60a5fa';
  const edgeFill   = isStable ? 'rgba(74,222,128,0.08)' : 'rgba(96,165,250,0.06)';
  const bracketColor = edgeCorners
    ? (isStable ? '#4ade80' : '#60a5fa')
    : 'rgba(255,255,255,0.45)';

  const videoEl = videoRef.current;
  const viewW   = videoEl?.videoWidth  || 640;
  const viewH   = videoEl?.videoHeight || 480;

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="relative min-h-[100dvh] overflow-hidden flex flex-col" style={{ background: '#0d0d14' }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* ── White flash on capture ── */}
      <div className={cn(
        'absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150',
        isCapturing ? 'opacity-60' : 'opacity-0',
      )} />

      {/* ── B: Scan line sweep ── */}
      {showScanLine && (
        <div
          className="animate-scan-line"
          style={{
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.9) 50%, transparent)',
            height: '3px',
            filter: 'blur(1px)',
          }}
        />
      )}

      {/* ── Live camera ── */}
      {!isMockMode && (
        <video ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover z-0" />
      )}

      {/* ── H: Top bar — DocScan wordmark + controls ── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-4 pb-6"
        style={{ background: 'linear-gradient(to bottom, rgba(13,13,20,0.85) 0%, transparent 100%)' }}>

        {/* Left: spacer (settings moved to top-right bar) */}
        <div className="w-8" />

        {/* Center: PrivaScan brand logo */}
        <div className="flex items-center gap-2.5">
          {/* Icon — document + scanner brackets (SVG, 20% larger than prev 24px) */}
          <svg width="30" height="30" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Blue corner brackets — frame spans (2,2)→(46,46), centre = (24,24) */}
            <path d="M2,12 L2,2 L12,2"    stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M36,2 L46,2 L46,12"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M2,36 L2,46 L12,46"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            {/* Document body — centred: x=13 (24-11), y=9 (24-15), w=22, h=30 */}
            <rect x="13" y="9" width="22" height="30" rx="1.5" fill="white" opacity="0.92"/>
            {/* Folded top-right corner at (29,9)→(35,15) */}
            <path d="M29,9 L35,15 L29,15 Z" fill="#cbd5e1"/>
            <path d="M29,9 L35,9 L35,15 Z" fill="white" opacity="0.92"/>
            {/* Content lines (all shifted +3x, +2y from before) */}
            <line x1="17" y1="20" x2="31" y2="20" stroke="#334155" strokeWidth="2"   strokeLinecap="round"/>
            <line x1="17" y1="24" x2="29" y2="24" stroke="#334155" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="17" y1="28" x2="31" y2="28" stroke="#334155" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="17" y1="32" x2="26" y2="32" stroke="#334155" strokeWidth="1.6" strokeLinecap="round"/>
            {/* Blue scan line across the full bracket frame */}
            <line x1="7" y1="24" x2="41" y2="24" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.9"/>
          </svg>

          {/* Wordmark: "Priva" white + "Scan" blue */}
          <span className="font-bold tracking-tight" style={{ fontSize: '1.2rem', lineHeight: 1 }}>
            <span className="text-white">Priva</span><span style={{ color: '#38bdf8' }}>Scan</span>
          </span>
        </div>

        {/* Right: Done / spacer */}
        {mode === 'auto' && pages.length > 0 ? (
          <button
            onClick={() => setLocation('/preview')}
            className="text-sm font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-full transition-all backdrop-blur-sm"
          >
            Done ({pages.length})
          </button>
        ) : <div className="w-[80px]" />}
      </div>

      {/* ── Main viewfinder ── */}
      <div className="flex-1 relative flex items-center justify-center">

        {/* Dev-mode mock document */}
        {isMockMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="relative w-48 h-64 rounded-md shadow-2xl border border-white/10"
              style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(255,255,255,0.06) 100%)' }}>
              <div className="p-4 space-y-2">
                {[3/4, 1, 5/6, 1, 2/3, 1, 4/5, 1].map((w, i) =>
                  <div key={i}
                    className={cn('h-2 rounded', i === 0 ? 'bg-white/30' : 'bg-white/15')}
                    style={{ width: `${w * 100}%` }} />
                )}
              </div>
            </div>
            <p className="mt-5 text-white/30 text-xs tracking-widest uppercase">
              Dev Mode — Camera Off
            </p>
          </div>
        )}

        {/* ── A: Guide brackets — A4 portrait (0.707), top/bottom anchored ── */}
        {(!edgeCorners || isMockMode) && (
          <div
            className="absolute pointer-events-none"
            style={{
              top: '12%',          // below top bar
              bottom: '32%',       // above bottom controls + toggle
              left: '50%',
              transform: 'translateX(-50%)',
              aspectRatio: '0.707 / 1',
              maxHeight: '100%',
            }}
          >
            {/* TL */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white/55" />
            {/* TR */}
            <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white/55" />
            {/* BL */}
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white/55" />
            {/* BR */}
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white/55" />
          </div>
        )}

        {/* ── B: Dynamic SVG overlay — only for detected document (Method B) ── */}
        {!isMockMode && edgeCorners && (
          <svg
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid slice"
          >
            {/* Subtle fill */}
            <polygon
              points={edgeCorners.map(p => `${p.x},${p.y}`).join(' ')}
              fill={edgeFill}
              stroke="none"
              style={{ transition: 'fill 0.3s' }}
            />
            {/* L-brackets at actual detected corners [TL, TR, BR, BL] */}
            {edgeCorners.map((p, i) => {
              const ARM = Math.min(viewW, viewH) * 0.08;
              const dirs: [[number, number], [number, number]][] = [
                [[ARM, 0],  [0, ARM] ],   // TL → right + down
                [[-ARM, 0], [0, ARM] ],   // TR → left  + down
                [[-ARM, 0], [0, -ARM]],   // BR → left  + up
                [[ARM, 0],  [0, -ARM]],   // BL → right + up
              ];
              const [d1, d2] = dirs[i];
              return (
                <path
                  key={i}
                  d={`M ${p.x + d1[0]},${p.y + d1[1]} L ${p.x},${p.y} L ${p.x + d2[0]},${p.y + d2[1]}`}
                  stroke={edgeStroke}
                  strokeWidth="3.5"
                  fill="none"
                  strokeLinecap="square"
                  style={{ transition: 'stroke 0.3s ease' }}
                />
              );
            })}
          </svg>
        )}

        {/* "Hold still…" / "Capturing…" label */}
        {mode === 'auto' && isStable && !isMockMode && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20
                          bg-green-500/90 backdrop-blur-sm text-white text-sm font-semibold
                          px-5 py-2 rounded-full shadow-lg shadow-green-500/30 animate-pulse">
            Capturing…
          </div>
        )}

        {/* Desktop hint */}
        {!isMockMode && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          hidden md:flex items-center gap-2 bg-black/50 backdrop-blur-md
                          px-4 py-2 rounded-full pointer-events-none border border-white/10
                          text-white/60 text-sm">
            <Smartphone className="w-4 h-4" /> Use on mobile for best experience
          </div>
        )}
      </div>

      {/* ── E: Glassmorphism bottom bar ── */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 pb-8 pt-4 px-5 flex flex-col gap-4"
        style={{
          background: 'linear-gradient(to top, rgba(13,13,20,0.92) 60%, rgba(13,13,20,0.6) 85%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >

        {/* Auto-mode status hint */}
        {mode === 'auto' && (
          <div className="flex justify-center min-h-[20px]">
            {capturedLabel !== null ? (
              <span className="text-green-400 text-sm font-semibold animate-in fade-in">
                ✓ Page {capturedLabel} saved — aim at next page
              </span>
            ) : isMockMode ? (
              <span className="text-white/35 text-sm">
                Tap the button to capture in dev mode
              </span>
            ) : edgeCorners ? (
              <span className={cn(
                'text-sm font-medium transition-colors',
                isStable ? 'text-green-400' : 'text-blue-400',
              )}>
                {isStable ? 'Hold still…' : 'Document detected — hold steady'}
              </span>
            ) : (
              <span className="text-white/35 text-sm">Point camera at a document</span>
            )}
          </div>
        )}

        {/* Page thumbnails */}
        {pages.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto snap-x px-1 pb-1 no-scrollbar">
            {pages.map((p, i) => (
              <button
                key={i}
                ref={i === pages.length - 1 ? lastThumbRef : null}
                onClick={() => {
                  setSelectedThumb(i);
                  setPendingPage(p);
                  setDetectedCorners(defaultCorners(1240, 1754));
                  setLocation('/edit');
                }}
                className={cn(
                  'relative shrink-0 w-[4.5rem] h-[5.75rem] rounded-xl overflow-hidden snap-center shadow-lg transition-all duration-200 group',
                  i === selectedThumb
                    ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-transparent scale-105'
                    : 'ring-1 ring-white/20 hover:ring-blue-300',
                )}
              >
                <img src={p} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100
                               transition-opacity flex items-center justify-center">
                  <Edit2 className="w-4 h-4 text-white" />
                </div>
                <div className={cn(
                  'absolute bottom-0 inset-x-0 py-1 text-center text-[10px] font-bold leading-none',
                  i === selectedThumb ? 'bg-blue-500 text-white' : 'bg-black/55 text-white/90',
                )}>
                  {i + 1}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center justify-between">

          {/* Gallery */}
          <button
            onClick={() => setLocation('/gallery')}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/8 hover:bg-white/15 border border-white/15 transition-all backdrop-blur-sm"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* ── F: iOS-style capture button with progress ring ── */}
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
            <div className="relative w-16 h-16">
              {/* Progress ring */}
              {mode === 'auto' && (
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                  {stableProgress > 0 && (
                    <circle
                      cx="40" cy="40" r={RING_R}
                      fill="none"
                      stroke={isStable ? '#4ade80' : '#60a5fa'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRC}
                      strokeDashoffset={RING_CIRC * (1 - stableProgress)}
                      style={{ transition: 'stroke-dashoffset 0.15s ease-out, stroke 0.3s ease' }}
                    />
                  )}
                </svg>
              )}

              {/* iOS shutter button */}
              <button
                onClick={handleCaptureButton}
                className={cn(
                  'absolute inset-0 rounded-full border-[3px] border-white',
                  'flex items-center justify-center',
                  'active:scale-95 transition-transform duration-100',
                  isStable && mode === 'auto' && 'animate-capture-glow',
                )}
              >
                <div className={cn(
                  'w-[2.7rem] h-[2.7rem] rounded-full transition-all duration-300',
                  isStable && mode === 'auto'
                    ? 'bg-green-400 shadow-[0_0_16px_rgba(74,222,128,0.6)]'
                    : mode === 'manual'
                      ? 'bg-white'
                      : 'bg-white',
                )}>
                  {mode === 'auto' && (
                    <div className="w-full h-full flex items-center justify-center">
                      <Zap className={cn(
                        'w-4 h-4 fill-current transition-colors',
                        isStable ? 'text-white' : 'text-gray-800',
                      )} />
                    </div>
                  )}
                </div>
              </button>
            </div>
          </RadialMenu>

          {/* Preview / page count */}
          {mode === 'manual' ? (
            <button
              onClick={() => setLocation('/preview')}
              disabled={pages.length === 0}
              className={cn(
                'w-12 h-12 rounded-full flex flex-col items-center justify-center transition-all',
                pages.length > 0
                  ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/40'
                  : 'opacity-0 pointer-events-none',
              )}
            >
              <span className="text-base font-bold leading-none">{pages.length}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            pages.length > 0 ? (
              <button
                onClick={() => setLocation('/preview')}
                className="w-12 h-12 flex flex-col items-center justify-center rounded-full bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-all backdrop-blur-sm"
              >
                <span className="text-base font-bold leading-none">{pages.length}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : <div className="w-12" />
          )}
        </div>

        {/* ── I: Sliding mode toggle — below capture button ── */}
        <div className="flex justify-center pb-1">
          <div className="relative flex items-center bg-white/10 border border-white/15 rounded-full p-1 backdrop-blur-sm">
            {/* Sliding pill */}
            <div
              className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out"
              style={{
                width: 'calc(50% - 4px)',
                left: mode === 'auto' ? '4px' : 'calc(50%)',
              }}
            />
            {(['auto', 'manual'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'relative z-10 px-5 py-1 rounded-full text-xs font-semibold transition-colors duration-200 capitalize',
                  mode === m ? 'text-gray-900' : 'text-white/60 hover:text-white/90',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
