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
import { Zap, ZapOff, ChevronRight, Smartphone, Edit2, ScanLine, FileText, House } from 'lucide-react';
import { useCamera } from '@/hooks/use-camera';
import { useScannerContext } from '@/contexts/scanner-context';
import { SettingsSheet } from '@/components/settings-sheet';
import { RadialMenu } from '@/components/radial-menu';
import { GallerySheet } from '@/components/gallery-sheet';
import { useLocalScans } from '@/hooks/use-local-scans';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { detectDocumentCorners, defaultCorners } from '@/lib/edge-detection';
import { type Point, warpPerspective } from '@/lib/perspective';
import { type ScannerSettings, QUALITY_VALUES, type ScanMode } from '@/lib/scanner-types';

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

  return canvas.toDataURL('image/jpeg', QUALITY_VALUES[settings.imageQuality]);
}

/* ── Mock generators for special scan modes ───────────────────────────────── */
function generateMockBookHalf(side: 'left' | 'right', pageNum: number, settings: ScannerSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = 877; canvas.height = 1240; // 0.707 ratio
  const ctx = canvas.getContext('2d')!;
  const bg  = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#fafaf8';
  const ink = settings.colorMode === 'greyscale' ? '#222' : '#1a1a2e';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink; ctx.font = 'bold 42px sans-serif';
  ctx.fillText(`${side === 'left' ? '← Left' : 'Right →'} — Page ${pageNum}`, 60, 110);
  ctx.font = '26px sans-serif'; ctx.fillStyle = '#888';
  ctx.fillText('Book Scan · Binding Corrected', 60, 160);
  ctx.fillStyle = ink;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(60, 220 + i * 64, (canvas.width - 120) * (0.55 + (i % 3) * 0.15), 18);
  }
  return canvas.toDataURL('image/jpeg', QUALITY_VALUES[settings.imageQuality]);
}

function generateMockPresentation(pageNum: number, settings: ScannerSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#1e3a5f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = settings.colorMode === 'greyscale' ? '#222' : '#ffffff';
  ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Slide ${pageNum}`, canvas.width / 2, canvas.height / 2 - 40);
  ctx.font = '42px sans-serif'; ctx.globalAlpha = 0.55;
  ctx.fillText('Presentation · Perspective Corrected', canvas.width / 2, canvas.height / 2 + 60);
  ctx.globalAlpha = 1;
  return canvas.toDataURL('image/jpeg', QUALITY_VALUES[settings.imageQuality]);
}

function generateMockIdComposite(settings: ScannerSettings): string {
  const cw = 1004, ch = 633; // ≈ 85.6×54 mm at 300 dpi equivalent
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch * 2 + 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, cw, canvas.height);
  const colors = settings.colorMode === 'greyscale'
    ? ['#bbbbbb', '#999999']
    : ['#1e3a5f', '#2d5486'];
  [0, 1].forEach(i => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(0, i * (ch + 24), cw, ch);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? 'FRONT' : 'BACK', cw / 2, i * (ch + 24) + ch / 2 + 22);
  });
  return canvas.toDataURL('image/jpeg', QUALITY_VALUES[settings.imageQuality]);
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
/*  Quality gauge SVG icon                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function QualityGaugeIcon({ quality }: { quality: 'high' | 'medium' | 'low' }) {
  const cx = 20, cy = 21, rO = 17, rI = 10;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number, r: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy - r * Math.sin(toRad(deg)),
  });
  const f = (n: number) => n.toFixed(2);

  // Arc path for a donut segment from a1→a2 (angles in standard-math convention)
  const arcPath = (a1: number, a2: number) => {
    const { x: ox1, y: oy1 } = pt(a1, rO);
    const { x: ox2, y: oy2 } = pt(a2, rO);
    const { x: ix2, y: iy2 } = pt(a2, rI);
    const { x: ix1, y: iy1 } = pt(a1, rI);
    // sweep-flag=0 outer (counterclockwise in SVG = right-to-left along top)
    // sweep-flag=1 inner (clockwise in SVG = back left-to-right)
    return `M${f(ox1)},${f(oy1)} A${rO},${rO},0,0,0,${f(ox2)},${f(oy2)} L${f(ix2)},${f(iy2)} A${rI},${rI},0,0,1,${f(ix1)},${f(iy1)}Z`;
  };

  const SEGS = [
    { a1: 177, a2: 151, fill: '#bae6fd' },
    { a1: 149, a2: 123, fill: '#7dd3fc' },
    { a1: 121, a2: 95,  fill: '#38bdf8' },
    { a1: 93,  a2: 67,  fill: '#0ea5e9' },
    { a1: 65,  a2: 39,  fill: '#0284c7' },
    { a1: 37,  a2: 11,  fill: '#0369a1' },
  ];

  const activeCount = quality === 'high' ? 6 : quality === 'medium' ? 3 : 1;
  const needleAngle = quality === 'high' ? 24 : quality === 'medium' ? 94 : 164;
  const tip = pt(needleAngle, rO - 2);

  return (
    <svg width="36" height="20" viewBox="2 3 36 19">
      {SEGS.map((s, i) => (
        <path
          key={i}
          d={arcPath(s.a1, s.a2)}
          fill={i < activeCount ? s.fill : 'rgba(255,255,255,0.18)'}
        />
      ))}
      {/* Needle */}
      <line
        x1={cx} y1={cy} x2={f(tip.x)} y2={f(tip.y)}
        stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"
      />
      <circle cx={cx} cy={cy} r="1.8" fill="white" opacity="0.85" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Component                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function ScannerScreen() {
  const [, setLocation] = useLocation();
  const { videoRef, startCamera, stopCamera, hasPermission, isMockMode } = useCamera();
  const {
    mode, setMode, pages, addPage, removePage, clearPages, settings, setSettings,
    setPendingPage, setDetectedCorners,
  } = useScannerContext();

  const canvasRef            = useRef<HTMLCanvasElement>(null);
  const [isCapturing,    setIsCapturing]    = useState(false);
  const [showScanLine,   setShowScanLine]   = useState(false);   // B
  const [edgeCorners,    setEdgeCorners]    = useState<[Point, Point, Point, Point] | null>(null);
  const [stableProgress, setStableProgress] = useState(0);
  const [capturedLabel,  setCapturedLabel]  = useState<number | null>(null);
  const [selectedThumb,  setSelectedThumb]  = useState(-1);

  type FlashMode = 'off' | 'on' | 'auto';
  const [flashMode,   setFlashMode]   = useState<FlashMode>('auto');
  const [flashOpen,   setFlashOpen]   = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  const [scanMode,    setScanMode]    = useState<ScanMode>('document');
  const [radialOpen,  setRadialOpen]  = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const { data: localScans = [] } = useLocalScans();
  const lastScan = localScans[0] ?? null;
  const [idStage,  setIdStage]  = useState<'front' | 'back'>('front');
  const idFrontRef = useRef<string | null>(null);

  const lastThumbRef     = useRef<HTMLButtonElement>(null);
  const modeRef          = useRef(mode);
  const pagesLenRef      = useRef(pages.length);
  const settingsRef      = useRef(settings);
  const edgeTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableFrames     = useRef(0);
  const captureAutoRef   = useRef<() => void>(() => {});
  const scanModeRef      = useRef<ScanMode>('document');

  useEffect(() => { modeRef.current      = mode;     }, [mode]);
  useEffect(() => { pagesLenRef.current  = pages.length; }, [pages.length]);
  useEffect(() => { settingsRef.current  = settings; }, [settings]);
  useEffect(() => { scanModeRef.current  = scanMode; }, [scanMode]);
  // Reset ID card stage when switching scan modes
  useEffect(() => { setIdStage('front'); idFrontRef.current = null; }, [scanMode]);

  // Apply torch / flash to camera track when flashMode changes
  useEffect(() => {
    if (!videoRef.current) return;
    const stream = videoRef.current.srcObject as MediaStream | null;
    const track  = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      track.applyConstraints({ advanced: [{ torch: flashMode === 'on' } as any] });
    } catch { /* torch not supported on this device — silently ignore */ }
  }, [flashMode, videoRef]);

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
      const ctx1 = canvas.getContext('2d')!;
      if (settingsRef.current.colorMode === 'greyscale') ctx1.filter = 'grayscale(100%)';
      ctx1.drawImage(video, 0, 0);
      addPage(canvas.toDataURL('image/jpeg', QUALITY_VALUES[settingsRef.current.imageQuality]));
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
      const ctx2 = canvas.getContext('2d')!;
      if (settingsRef.current.colorMode === 'greyscale') ctx2.filter = 'grayscale(100%)';
      ctx2.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY_VALUES[settingsRef.current.imageQuality]);
      setPendingPage(dataUrl);
      setDetectedCorners(edgeCorners ?? defaultCorners(canvas.width, canvas.height));
      setLocation('/edit');
    }
  }, [isMockMode, videoRef, edgeCorners, setPendingPage, setDetectedCorners, setLocation, triggerCaptureEffects]);

  /* ── Book capture ───────────────────────────────────────────────────────── */
  const bookCapture = useCallback(() => {
    triggerCaptureEffects();
    const q    = QUALITY_VALUES[settingsRef.current.imageQuality];
    const grey = settingsRef.current.colorMode === 'greyscale';
    const base = pagesLenRef.current;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockBookHalf('left',  base + 1, settingsRef.current));
      addPage(generateMockBookHalf('right', base + 2, settingsRef.current));
    } else {
      const video = videoRef.current;
      const vw = video.videoWidth, vh = video.videoHeight;
      const half = Math.floor(vw / 2);
      const pull = Math.floor(vh * 0.025); // 2.5% trapezoid correction at binding edge

      // Capture full frame
      const full = document.createElement('canvas');
      full.width = vw; full.height = vh;
      const fctx = full.getContext('2d')!;
      if (grey) fctx.filter = 'grayscale(100%)';
      fctx.drawImage(video, 0, 0);

      // Left page: binding on the right side → right edge pulled inward
      const leftCorners: [Point, Point, Point, Point] = [
        { x: 0,        y: 0          },
        { x: half - 1, y: pull        },
        { x: half - 1, y: vh - pull   },
        { x: 0,        y: vh - 1     },
      ];
      const leftOut = warpPerspective(full, leftCorners, half, vh);

      // Right page: binding on the left side → left edge pulled inward
      const rightCorners: [Point, Point, Point, Point] = [
        { x: half,     y: pull        },
        { x: vw - 1,   y: 0          },
        { x: vw - 1,   y: vh - 1     },
        { x: half,     y: vh - pull   },
      ];
      const rightOut = warpPerspective(full, rightCorners, half, vh);

      addPage(leftOut.toDataURL('image/jpeg', q));
      addPage(rightOut.toDataURL('image/jpeg', q));
    }

    setCapturedLabel(base + 2);
    setTimeout(() => setCapturedLabel(null), 1800);
  }, [isMockMode, videoRef, addPage, triggerCaptureEffects]);

  /* ── Presentation capture ───────────────────────────────────────────────── */
  const presentationCapture = useCallback(() => {
    triggerCaptureEffects();
    const q    = QUALITY_VALUES[settingsRef.current.imageQuality];
    const grey = settingsRef.current.colorMode === 'greyscale';
    const pageNum = pagesLenRef.current + 1;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockPresentation(pageNum, settingsRef.current));
    } else {
      const video = videoRef.current;
      const vw = video.videoWidth, vh = video.videoHeight;
      const src = document.createElement('canvas');
      src.width = vw; src.height = vh;
      const sctx = src.getContext('2d')!;
      if (grey) sctx.filter = 'grayscale(100%)';
      sctx.drawImage(video, 0, 0);
      // Use detected edge corners or full frame; output 16:9
      const corners: [Point, Point, Point, Point] = edgeCorners ?? [
        { x: 0,      y: 0      }, { x: vw - 1, y: 0      },
        { x: vw - 1, y: vh - 1 }, { x: 0,      y: vh - 1 },
      ];
      const outW = Math.max(vw, 1280);
      const outH = Math.round(outW * 9 / 16);
      addPage(warpPerspective(src, corners, outW, outH).toDataURL('image/jpeg', q));
    }

    setCapturedLabel(pageNum);
    setTimeout(() => setCapturedLabel(null), 1800);
  }, [isMockMode, videoRef, addPage, edgeCorners, triggerCaptureEffects]);

  /* ── ID Cards capture (2-stage) ─────────────────────────────────────────── */
  const idCardsCapture = useCallback(() => {
    triggerCaptureEffects();
    const q    = QUALITY_VALUES[settingsRef.current.imageQuality];
    const grey = settingsRef.current.colorMode === 'greyscale';

    const captureCardDataUrl = (): string => {
      if (isMockMode || !videoRef.current) return 'mock';
      const video = videoRef.current;
      const vw = video.videoWidth, vh = video.videoHeight;
      const src = document.createElement('canvas');
      src.width = vw; src.height = vh;
      const sctx = src.getContext('2d')!;
      if (grey) sctx.filter = 'grayscale(100%)';
      sctx.drawImage(video, 0, 0);
      const corners: [Point, Point, Point, Point] = edgeCorners ?? [
        { x: 0, y: 0 }, { x: vw - 1, y: 0 },
        { x: vw - 1, y: vh - 1 }, { x: 0, y: vh - 1 },
      ];
      const outW = Math.min(vw, 1004);
      const outH = Math.round(outW / 1.585); // ID card aspect ratio
      return warpPerspective(src, corners, outW, outH).toDataURL('image/jpeg', q);
    };

    if (idStage === 'front') {
      idFrontRef.current = captureCardDataUrl();
      setIdStage('back');
      toast('Front captured — flip the card and shoot the back');
    } else {
      const frontData = idFrontRef.current;
      if (!frontData) { setIdStage('front'); return; }

      if (isMockMode) {
        addPage(generateMockIdComposite(settingsRef.current));
      } else {
        const backData = captureCardDataUrl();
        const fImg = new Image(), bImg = new Image();
        fImg.src = frontData; bImg.src = backData;
        Promise.all([
          new Promise<void>(r => { fImg.onload = () => r(); }),
          new Promise<void>(r => { bImg.onload = () => r(); }),
        ]).then(() => {
          const cw = Math.max(fImg.width, bImg.width);
          const composite = document.createElement('canvas');
          composite.width = cw; composite.height = fImg.height + bImg.height + 20;
          const cctx = composite.getContext('2d')!;
          cctx.fillStyle = '#e8e8e8'; cctx.fillRect(0, 0, cw, composite.height);
          cctx.drawImage(fImg, 0, 0);
          cctx.drawImage(bImg, 0, fImg.height + 20);
          addPage(composite.toDataURL('image/jpeg', q));
          toast.success('ID Card saved — front & back combined');
        });
      }

      idFrontRef.current = null;
      setIdStage('front');
      setCapturedLabel(pagesLenRef.current + 1);
      setTimeout(() => setCapturedLabel(null), 1800);
    }
  }, [isMockMode, videoRef, addPage, edgeCorners, idStage, triggerCaptureEffects]);

  /* ── Capture button handler ─────────────────────────────────────────────── */
  const handleCaptureButton = useCallback(() => {
    const sm = scanModeRef.current;
    if      (sm === 'book')         bookCapture();
    else if (sm === 'presentation') presentationCapture();
    else if (sm === 'id-cards')     idCardsCapture();
    else if (mode === 'auto')       autoCaptureFrame();
    else                            manualCaptureFrame();
  }, [mode, autoCaptureFrame, manualCaptureFrame, bookCapture, presentationCapture, idCardsCapture]);

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

      {/* ── H: Top bar — logo · flash · done ── */}
      <div
        className="absolute top-0 inset-x-0 z-20 grid items-center px-4 pt-4 pb-6"
        style={{ gridTemplateColumns: '1fr auto 1fr', background: 'linear-gradient(to bottom, rgba(13,13,20,0.88) 0%, transparent 100%)' }}
      >
        {/* Col 1 — Left: PrivaScan brand */}
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2,12 L2,2 L12,2"    stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M36,2 L46,2 L46,12"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M2,36 L2,46 L12,46"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <rect x="13" y="9" width="22" height="30" rx="1.5" fill="white" opacity="0.92"/>
            <path d="M29,9 L35,15 L29,15 Z" fill="#cbd5e1"/>
            <path d="M29,9 L35,9 L35,15 Z" fill="white" opacity="0.92"/>
            <line x1="17" y1="20" x2="31" y2="20" stroke="#334155" strokeWidth="2"   strokeLinecap="round"/>
            <line x1="17" y1="24" x2="29" y2="24" stroke="#334155" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="17" y1="28" x2="31" y2="28" stroke="#334155" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="17" y1="32" x2="26" y2="32" stroke="#334155" strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="7"  y1="24" x2="41" y2="24" stroke="#38bdf8" strokeWidth="2"  strokeLinecap="round" opacity="0.9"/>
          </svg>
          <span className="font-bold tracking-tight" style={{ fontSize: '1.1rem', lineHeight: 1 }}>
            <span className="text-white">Priva</span><span style={{ color: '#38bdf8' }}>Scan</span>
          </span>
        </div>

        {/* Col 2 — Center: Flash + Quality + Auto/Manual */}
        <div className="flex justify-center items-center gap-6">

          {/* ── Flash ── */}
          <div className="relative flex items-center">
            <button
              onClick={() => { setFlashOpen(o => !o); setQualityOpen(false); }}
              className={cn(
                'w-9 h-9 flex items-center justify-center rounded-full transition-all',
                flashOpen ? 'bg-white/20' : 'hover:bg-white/10',
                flashMode === 'on'   && 'text-yellow-300',
                flashMode === 'off'  && 'text-white/40',
                flashMode === 'auto' && 'text-white',
              )}
              aria-label="Flash mode"
            >
              {flashMode === 'off'
                ? <ZapOff className="w-5 h-5" />
                : <Zap className={cn('w-5 h-5', flashMode === 'on' && 'fill-yellow-300 text-yellow-300')} />
              }
            </button>

            {flashOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFlashOpen(false)} />
                <div
                  className="absolute top-[52px] z-40 flex items-center gap-1 px-2 py-2 rounded-2xl"
                  style={{ background: 'rgba(28,28,32,0.96)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                >
                  {(['off', 'on', 'auto'] as const).map(m => (
                    <button
                      key={m}
                      onClick={(e) => { e.stopPropagation(); setFlashMode(m); setFlashOpen(false); }}
                      className={cn(
                        'px-5 py-2 rounded-xl text-[10px] font-semibold uppercase transition-all select-none',
                        flashMode === m ? 'bg-white/15 text-[#2dd4bf]' : 'text-white/70 hover:text-white hover:bg-white/8',
                      )}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Quality ── */}
          <div className="relative flex items-center">
            <button
              onClick={() => { setQualityOpen(o => !o); setFlashOpen(false); }}
              className={cn(
                'w-9 h-9 flex items-center justify-center rounded-full transition-all',
                qualityOpen ? 'bg-white/20' : 'hover:bg-white/10',
              )}
              aria-label="Scan quality"
            >
              <QualityGaugeIcon quality={settings.imageQuality} />
            </button>

            {qualityOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setQualityOpen(false)} />
                <div
                  className="absolute top-[52px] z-40 px-3 pt-3 pb-2 rounded-2xl min-w-[260px]"
                  style={{ background: 'rgba(28,28,32,0.96)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                >
                  <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-2 px-1">
                    Scan Quality
                  </p>
                  <div className="flex gap-2">
                    {([
                      { key: 'high',   label: 'High',   q: '0.95' },
                      { key: 'medium', label: 'Medium', q: '0.80' },
                      { key: 'low',    label: 'Low',    q: '0.60' },
                    ] as const).map(({ key, label, q }) => (
                      <button
                        key={key}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettings({ imageQuality: key });
                          setQualityOpen(false);
                        }}
                        className={cn(
                          'flex-1 flex flex-row items-center justify-center gap-1.5 py-1 rounded border transition-all select-none',
                          settings.imageQuality === key
                            ? 'border-sky-400 bg-sky-400/10'
                            : 'border-white/10 bg-white/5 hover:bg-white/10',
                        )}
                      >
                        <span className={cn(
                          'text-[10px] font-semibold',
                          settings.imageQuality === key ? 'text-sky-400' : 'text-white/80',
                        )}>
                          {label}
                        </span>
                        <span className="text-[10px] text-white/35 font-mono">
                          {q}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Auto / Manual toggle ── */}
          <div className="relative flex items-center h-9 bg-white/10 border border-white/15 rounded-full px-[3px] ml-[5px]">
              {/* Sliding pill */}
              <div
                className="absolute top-[3px] bottom-[3px] rounded-full bg-white shadow-sm transition-all duration-300 ease-out"
                style={{
                  width: 'calc(50% - 3px)',
                  left: mode === 'auto' ? '3px' : 'calc(50%)',
                }}
              />
              {(['auto', 'manual'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'relative z-10 h-full px-3 rounded-full text-[10px] font-semibold transition-colors duration-200 capitalize select-none',
                    mode === m ? 'text-gray-900' : 'text-white/60 hover:text-white/90',
                  )}
                >
                  {m}
                </button>
              ))}
          </div>

        </div>

        {/* Col 3 — Right: Done + Home + Settings (all right-aligned) */}
        <div className="flex items-center justify-end gap-1">
          {mode === 'auto' && pages.length > 0 && (
            <button
              onClick={() => setLocation('/preview')}
              className="text-sm font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-full transition-all backdrop-blur-sm mr-1"
            >
              Done ({pages.length})
            </button>
          )}
          <button
            onClick={() => setLocation('/home')}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Home"
          >
            <House className="w-[18px] h-[18px]" />
          </button>
          <div className="text-white/70">
            <SettingsSheet />
          </div>
        </div>
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

        {/* ── A: Guide brackets — mode-specific ── */}

        {/* Document: A4 portrait — hide when edge detected on real camera */}
        {scanMode === 'document' && (!edgeCorners || isMockMode) && (
          <div className="absolute pointer-events-none"
            style={{ top:'12%', bottom:'32%', left:'50%', transform:'translateX(-50%)', aspectRatio:'0.707/1', maxHeight:'100%' }}>
            <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white/55" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white/55" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white/55" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white/55" />
          </div>
        )}

        {/* Book: two portrait frames side by side — width:height = 0.707:1 each */}
        {scanMode === 'book' && (
          <div className="absolute inset-0 pointer-events-none flex flex-row items-center justify-center"
            style={{ top:'12%', bottom:'32%', gap:'12px' }}>
            {(['Left','Right'] as const).map(side => (
              <div key={side} className="relative flex-shrink-0"
                style={{ width:'46vw', maxWidth:'220px', aspectRatio:'0.707/1' }}>
                <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-white/55" />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-white/55" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-white/55" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-white/55" />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-white/40 uppercase tracking-widest select-none">{side}</span>
              </div>
            ))}
          </div>
        )}

        {/* Presentation: wide 16:9 */}
        {scanMode === 'presentation' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ top:'12%', bottom:'32%' }}>
            <div className="relative flex-shrink-0" style={{ width:'88vw', maxWidth:'420px', aspectRatio:'16/9' }}>
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white/55" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white/55" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white/55" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white/55" />
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-white/35 uppercase tracking-widest select-none">16:9 · Perspective Auto-Correct</span>
            </div>
          </div>
        )}

        {/* ID Cards: two stacked landscape frames (1.585:1 = standard card ratio) */}
        {scanMode === 'id-cards' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center"
            style={{ top:'12%', bottom:'32%', gap:'14px' }}>
            {(['front','back'] as const).map((side, idx) => (
              <div key={side} className="relative flex-shrink-0"
                style={{ width:'75vw', maxWidth:'320px', aspectRatio:'1.585/1', opacity: idStage === side ? 1 : 0.35 }}>
                <div className={cn('absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px]', idStage===side ? 'border-sky-400' : 'border-white/40')} />
                <div className={cn('absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px]', idStage===side ? 'border-sky-400' : 'border-white/40')} />
                <div className={cn('absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px]', idStage===side ? 'border-sky-400' : 'border-white/40')} />
                <div className={cn('absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px]', idStage===side ? 'border-sky-400' : 'border-white/40')} />
                <span className={cn('absolute top-2 left-3 text-[9px] font-bold uppercase tracking-widest select-none', idStage===side ? 'text-sky-400' : 'text-white/35')}>
                  {idx + 1}. {side === 'front' ? 'Front' : 'Back'}
                </span>
              </div>
            ))}
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

        {/* ── Scan mode tabs ── */}
        <div className={cn(
          'flex justify-center transition-all duration-200 pointer-events-auto',
          radialOpen && 'opacity-20 blur-[1px] pointer-events-none',
        )}>
          <div className="flex items-center gap-0 bg-white/8 border border-white/10 rounded-full px-1 py-1">
            {([
              { id: 'document',     label: 'Document'     },
              { id: 'book',         label: 'Book'         },
              { id: 'presentation', label: 'Presentation' },
              { id: 'id-cards',     label: 'ID Card'      },
            ] as { id: ScanMode; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setScanMode(id)}
                className={cn(
                  'px-3 py-1 rounded-full text-[10px] font-semibold transition-all select-none',
                  scanMode === id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-white/50 hover:text-white/80',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ID Cards stage indicator */}
        {scanMode === 'id-cards' && (
          <div className="flex justify-center -mt-2">
            <span className="text-[10px] font-semibold text-sky-400">
              {idStage === 'front'
                ? '① Shoot front — tap capture'
                : '② Flip card · Shoot back — tap capture'}
            </span>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center justify-between">

          {/* Gallery thumbnail button — iOS camera style */}
          <button
            onClick={() => setGalleryOpen(true)}
            className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-white/25 hover:border-white/50 transition-all active:scale-95 shrink-0 bg-white/8"
          >
            {lastScan?.thumbnail ? (
              <img
                src={lastScan.thumbnail}
                alt="Last scan"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-white/40" />
              </div>
            )}
            {localScans.length > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-sky-500 text-white text-[9px] font-bold leading-4 text-center">
                {localScans.length > 99 ? '99+' : localScans.length}
              </span>
            )}
          </button>

          {/* ── F: iOS-style capture button with progress ring ── */}
          <RadialMenu
            onOpenChange={setRadialOpen}
            onRetake={() => {
              if (!pages.length) { toast('No page to retake'); return; }
              removePage(pages.length - 1);
              toast('Last page removed — retake when ready');
            }}
            onCrop={() => {
              if (pages.length) {
                setPendingPage(pages[pages.length - 1]);
                setDetectedCorners(defaultCorners(1240, 1754));
                setLocation('/edit');
              } else toast('No page yet');
            }}
            onRotate={async () => {
              if (!pages.length) { toast('No page to rotate'); return; }
              const src = pages[pages.length - 1];
              const img = new Image();
              img.src = src;
              await new Promise<void>(res => { img.onload = () => res(); });
              const canvas = document.createElement('canvas');
              canvas.width  = img.naturalHeight;
              canvas.height = img.naturalWidth;
              const ctx = canvas.getContext('2d')!;
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
              const rotated = canvas.toDataURL('image/jpeg', 0.92);
              removePage(pages.length - 1);
              addPage(rotated);
              toast.success('Rotated 90°');
            }}
            onMarkup={() => {
              if (!pages.length) { toast('No page to mark up'); return; }
              setLocation('/markup');
            }}
            onDelete={() => {
              if (!pages.length) { toast('No pages to delete'); return; }
              clearPages();
              toast.error(`All ${pages.length} page${pages.length > 1 ? 's' : ''} deleted`);
            }}
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

      </div>

      {/* Gallery bottom sheet */}
      <GallerySheet open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </div>
  );
}
