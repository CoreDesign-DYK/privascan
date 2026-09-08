/**
 * edit.tsx — Post-capture crop & filter editor
 *
 * Handle system:
 *  • Corner circles  (r=16, white+blue border) → free XY drag
 *  • Edge bars       (rounded rect on each side midpoint)
 *      top / bottom  → Y-axis only  (up / down)
 *      left / right  → X-axis only  (left / right)
 *  • Edge lines      → same axis-constrained drag as their bar handle
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Check, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScannerContext } from '@/contexts/scanner-context';
import { warpPerspective, estimateOutputSize, type Point } from '@/lib/perspective';
import { filterCanvas, FILTER_LABELS, type FilterType } from '@/lib/filters';
import { defaultCorners, detectCornersFromCanvas } from '@/lib/edge-detection';
import {
  detectPresentationFromCanvas,
  isValidPresentationQuad,
  presentationDefaultCorners,
  presentationOutputSize,
} from '@/lib/presentation-detection';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isNative } from '@/lib/platform';
import { enhanceDocumentCanvas } from '@/lib/filters';
import { hasRequiredSharpness, hasUniformDocumentSharpness } from '@/lib/scan-quality';
import { getPaperPixelSize } from '@/lib/scanner-types';

const FILTERS: FilterType[] = ['original', 'auto', 'bw', 'highcontrast'];

/* ── Drag target types ──────────────────────────────────────────────────────── */
type DragTarget =
  | 'corner-0' | 'corner-1' | 'corner-2' | 'corner-3'
  | 'edge-top'  | 'edge-right' | 'edge-bottom' | 'edge-left';

/* ── Geometry helpers ──────────────────────────────────────────────────────── */
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export default function EditScreen() {
  const [, setLocation] = useLocation();
  const {
    pendingPage, setPendingPage,
    pendingEditMode, setPendingEditMode,
    detectedCorners, setDetectedCorners,
    addPage, settings,
  } = useScannerContext();

  /* ── image loading ────────────────────────────────────────────────────────── */
  const imgRef       = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [displayW,  setDisplayW]  = useState(0);
  const [displayH,  setDisplayH]  = useState(0);
  const [natW, setNatW]           = useState(0);
  const [natH, setNatH]           = useState(0);

  /* ── corner state (display coords) ───────────────────────────────────────── */
  const [corners, setCorners]     = useState<[Point, Point, Point, Point] | null>(null);
  const dragging = useRef<DragTarget | null>(null);

  /* ── filter state ─────────────────────────────────────────────────────────── */
  const [filter,     setFilter]     = useState<FilterType>('original');
  const [brightness, setBrightness] = useState(0);
  const [contrast,   setContrast]   = useState(0);
  const [applying,   setApplying]   = useState(false);

  useEffect(() => {
    if (!pendingPage) setLocation('/');
  }, [pendingPage, setLocation]);

  /* ── Image load: compute display size + initial corners ──────────────────── */
  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    const con = containerRef.current;
    if (!img || !con) return;

    const nw = img.naturalWidth, nh = img.naturalHeight;
    const cw = con.clientWidth,  ch = con.clientHeight;
    // Reserve 48 px at bottom so corner handles are never clipped by the controls panel
    const scale = Math.min(cw / nw, (ch - 48) / nh, 1);
    const dw = Math.round(nw * scale), dh = Math.round(nh * scale);

    setNatW(nw); setNatH(nh);
    setDisplayW(dw); setDisplayH(dh);
    setImgLoaded(true);

    if (detectedCorners) {
      // Use corners from live edge detection (already in natural-image coords)
      setCorners(detectedCorners.map(p => ({ x: p.x * scale, y: p.y * scale })) as [Point, Point, Point, Point]);
    } else {
      // Fallback: run edge detection on the captured image itself
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = nw; offscreen.height = nh;
        offscreen.getContext('2d')!.drawImage(img, 0, 0);
        const detected = pendingEditMode === 'presentation'
          ? detectPresentationFromCanvas(offscreen)?.corners ?? null
          : detectCornersFromCanvas(offscreen);
        if (detected) {
          setCorners(detected.map(p => ({ x: p.x * scale, y: p.y * scale })) as [Point, Point, Point, Point]);
        } else {
          setCorners(
            pendingEditMode === 'presentation'
              ? presentationDefaultCorners(dw, dh)
              : defaultCorners(dw, dh),
          );
        }
      } catch {
        setCorners(
          pendingEditMode === 'presentation'
            ? presentationDefaultCorners(dw, dh)
            : defaultCorners(dw, dh),
        );
      }
    }
  }, [detectedCorners, pendingEditMode]);

  /* ── Pointer events ──────────────────────────────────────────────────────── */
  const startDrag = (e: React.PointerEvent, target: DragTarget) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragging.current = target;
  };

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !corners) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(displayW, e.clientX - rect.left));
    const y = Math.max(0, Math.min(displayH, e.clientY - rect.top));
    const c = corners.map(p => ({ ...p })) as [Point, Point, Point, Point];

    switch (dragging.current) {
      // ── Corners: free XY ──────────────────────────────────────────────────
      case 'corner-0': c[0] = { x, y }; break;
      case 'corner-1': c[1] = { x, y }; break;
      case 'corner-2': c[2] = { x, y }; break;
      case 'corner-3': c[3] = { x, y }; break;
      // ── Edge: top — move TL + TR vertically ───────────────────────────────
      case 'edge-top':
        c[0] = { ...c[0], y };
        c[1] = { ...c[1], y };
        break;
      // ── Edge: bottom — move BR + BL vertically ───────────────────────────
      case 'edge-bottom':
        c[2] = { ...c[2], y };
        c[3] = { ...c[3], y };
        break;
      // ── Edge: left — move TL + BL horizontally ───────────────────────────
      case 'edge-left':
        c[0] = { ...c[0], x };
        c[3] = { ...c[3], x };
        break;
      // ── Edge: right — move TR + BR horizontally ──────────────────────────
      case 'edge-right':
        c[1] = { ...c[1], x };
        c[2] = { ...c[2], x };
        break;
    }
    setCorners(c);
  }, [corners, displayW, displayH]);

  const onPointerUp = () => { dragging.current = null; };

  const resetCorners = () => {
    if (!displayW || !displayH) return;
    setCorners(
      pendingEditMode === 'presentation'
        ? presentationDefaultCorners(displayW, displayH)
        : defaultCorners(displayW, displayH),
    );
  };

  /* ── Apply: warp + filter → addPage ─────────────────────────────────────── */
  const handleApply = async () => {
    if (!pendingPage || !corners) return;
    if (
      pendingEditMode === 'presentation' &&
      !isValidPresentationQuad(corners, displayW, displayH)
    ) {
      toast.error('Align all four corners with the screen edges without crossing them.');
      return;
    }
    setApplying(true);
    const tid = toast.loading('Processing…');
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = pendingPage!; });

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = natW; srcCanvas.height = natH;
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0);

      const scaleX = natW / displayW, scaleY = natH / displayH;
      const natCorners = corners.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })) as [Point, Point, Point, Point];

      const useMobileQualityPipeline = isNative();
      const outputSize = pendingEditMode === 'presentation'
        ? presentationOutputSize(
            natCorners,
            getPaperPixelSize(settings.paperSize, settings.targetDpi, 'landscape').width,
            useMobileQualityPipeline ? 6_500_000 : Number.POSITIVE_INFINITY,
          )
        : (() => {
            const { w, h } = estimateOutputSize(natCorners);
            return { width: w, height: h };
          })();
      const warped = warpPerspective(
        srcCanvas,
        natCorners,
        outputSize.width,
        outputSize.height,
        {
          maxCpuPixels: useMobileQualityPipeline
            ? 6_500_000
            : outputSize.width * outputSize.height,
          sharpen: pendingEditMode === 'document' ? 0.08 : 0,
        },
      );
      const sharpEnough = pendingEditMode === 'document'
        ? hasUniformDocumentSharpness(warped)
        : hasRequiredSharpness(warped);
      if (!sharpEnough) {
        toast.error('The image is out of focus. Please capture it again.', { id: tid });
        return;
      }
      const enhanced = pendingEditMode === 'presentation' && useMobileQualityPipeline
        ? enhanceDocumentCanvas(warped)
        : warped;
      const filtered = filterCanvas(enhanced, filter, brightness, contrast);

      addPage(filtered.toDataURL('image/jpeg', 0.98));
      toast.success('Page added!', { id: tid });
      setPendingPage(null);
      setPendingEditMode(null);
      setDetectedCorners(null);
      setLocation(pendingEditMode === 'presentation' ? '/preview' : '/');
    } catch (err) {
      console.error(err);
      toast.error('Processing failed', { id: tid });
    } finally {
      setApplying(false);
    }
  };

  /* ── Derived geometry ────────────────────────────────────────────────────── */
  const mids = corners ? {
    top:    midpoint(corners[0], corners[1]),
    right:  midpoint(corners[1], corners[2]),
    bottom: midpoint(corners[2], corners[3]),
    left:   midpoint(corners[0], corners[3]),
  } : null;
  const cornersValid = !corners || pendingEditMode !== 'presentation' ||
    isValidPresentationQuad(corners, displayW, displayH);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-[100dvh] bg-gray-950 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <Button
          variant="ghost" size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => {
            setPendingPage(null);
            setPendingEditMode(null);
            setDetectedCorners(null);
            setLocation('/');
          }}
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <span className="text-white font-semibold text-sm">
          {pendingEditMode === 'presentation' ? 'Adjust screen corners' : 'Crop & Filter'}
        </span>

        <Button
          size="sm"
          disabled={applying || !corners || !cornersValid}
          className="rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5"
          onClick={handleApply}
        >
          {applying
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Check className="w-4 h-4 mr-1" />Apply</>}
        </Button>
      </div>

      {/* Image + overlay */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden px-4 py-2"
        style={{ minHeight: 0 }}
      >
        {pendingPage && (
          <div
            className="relative"
            style={{ width: displayW || 'auto', height: displayH || 'auto' }}
          >
            {/* Source image */}
            <img
              ref={imgRef}
              src={pendingPage}
              onLoad={onImageLoad}
              className="block rounded-md"
              style={{
                width: displayW || undefined,
                height: displayH || undefined,
                opacity: imgLoaded ? 1 : 0,
              }}
              alt="Captured page"
              draggable={false}
            />

            {/* SVG overlay */}
            {imgLoaded && corners && mids && (
              <svg
                className="absolute inset-0 touch-none overflow-visible"
                width={displayW}
                height={displayH}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                {/* ── Quad outline (solid, no fill) ── */}
                <polygon
                  points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={cornersValid ? '#3b82f6' : '#ef4444'}
                  strokeWidth="2"
                />

                {/* ════════════════════════════════════════
                    EDGE DRAG LINES — invisible wide hit area
                    ════════════════════════════════════════ */}

                {/* Top edge */}
                <line
                  x1={corners[0].x} y1={corners[0].y}
                  x2={corners[1].x} y2={corners[1].y}
                  stroke="transparent" strokeWidth="20"
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={e => startDrag(e, 'edge-top')}
                />
                {/* Right edge */}
                <line
                  x1={corners[1].x} y1={corners[1].y}
                  x2={corners[2].x} y2={corners[2].y}
                  stroke="transparent" strokeWidth="20"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={e => startDrag(e, 'edge-right')}
                />
                {/* Bottom edge */}
                <line
                  x1={corners[2].x} y1={corners[2].y}
                  x2={corners[3].x} y2={corners[3].y}
                  stroke="transparent" strokeWidth="20"
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={e => startDrag(e, 'edge-bottom')}
                />
                {/* Left edge */}
                <line
                  x1={corners[3].x} y1={corners[3].y}
                  x2={corners[0].x} y2={corners[0].y}
                  stroke="transparent" strokeWidth="20"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={e => startDrag(e, 'edge-left')}
                />

                {/* ════════════════════════════════════════
                    EDGE MID-POINT HANDLES (rounded rect bars)
                    Top/Bottom → horizontal bar (ns-resize)
                    Left/Right → vertical bar   (ew-resize)
                    ════════════════════════════════════════ */}

                {/* Top bar */}
                <EdgeBar
                  cx={mids.top.x} cy={mids.top.y}
                  horizontal
                  onPointerDown={e => startDrag(e, 'edge-top')}
                  cursor="ns-resize"
                />
                {/* Bottom bar */}
                <EdgeBar
                  cx={mids.bottom.x} cy={mids.bottom.y}
                  horizontal
                  onPointerDown={e => startDrag(e, 'edge-bottom')}
                  cursor="ns-resize"
                />
                {/* Left bar */}
                <EdgeBar
                  cx={mids.left.x} cy={mids.left.y}
                  horizontal={false}
                  onPointerDown={e => startDrag(e, 'edge-left')}
                  cursor="ew-resize"
                />
                {/* Right bar */}
                <EdgeBar
                  cx={mids.right.x} cy={mids.right.y}
                  horizontal={false}
                  onPointerDown={e => startDrag(e, 'edge-right')}
                  cursor="ew-resize"
                />

                {/* ════════════════════════════════════════
                    CORNER HANDLES — large circles, free XY
                    ════════════════════════════════════════ */}

                {corners.map((p, i) => (
                  <CornerHandle
                    key={i}
                    cx={p.x} cy={p.y}
                    onPointerDown={e => startDrag(e, `corner-${i}` as DragTarget)}
                  />
                ))}
              </svg>
            )}

            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls panel */}
      <div className="shrink-0 bg-gray-900 rounded-t-2xl px-4 pt-4 pb-6 space-y-4">
        {pendingEditMode === 'presentation' && (
          <p className={cn(
            'text-xs text-center',
            cornersValid ? 'text-white/60' : 'text-red-400',
          )}>
            {cornersValid
              ? 'Align the four points with the screen corners to correct it to a front-facing 16:9 view.'
              : 'The corners cross or the selected area is too small.'}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={resetCorners}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            <RotateCw className="w-3 h-3" /> Reset corners
          </button>
        </div>

        {/* Filter presets */}
        <div>
          <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-2">Filter</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all',
                  filter === f
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20',
                )}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-3">
          <SliderRow label="Brightness" value={brightness} onChange={setBrightness} min={-100} max={100} />
          <SliderRow label="Contrast"   value={contrast}   onChange={setContrast}   min={-100} max={100} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────────────────── */

/** Large white circle with blue border — free XY drag */
function CornerHandle({
  cx, cy, onPointerDown,
}: {
  cx: number; cy: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g>
      {/* Invisible large touch target */}
      <circle cx={cx} cy={cy} r={26} fill="transparent" onPointerDown={onPointerDown} style={{ cursor: 'grab' }} />
      {/* Visible white circle */}
      <circle cx={cx} cy={cy} r={14} fill="white" stroke="#3b82f6" strokeWidth="2.5" style={{ pointerEvents: 'none' }} />
      {/* Inner blue dot */}
      <circle cx={cx} cy={cy} r={4}  fill="#3b82f6" style={{ pointerEvents: 'none' }} />
    </g>
  );
}

/** Rounded-rect bar at edge midpoint — axis-constrained drag */
function EdgeBar({
  cx, cy, horizontal, onPointerDown, cursor,
}: {
  cx: number; cy: number; horizontal: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  cursor: string;
}) {
  const W = horizontal ? 28 : 10;
  const H = horizontal ? 10 : 28;
  return (
    <g>
      {/* Invisible touch target */}
      <rect
        x={cx - W / 2 - 6} y={cy - H / 2 - 6}
        width={W + 12} height={H + 12}
        rx={8} fill="transparent"
        onPointerDown={onPointerDown}
        style={{ cursor }}
      />
      {/* Visible bar */}
      <rect
        x={cx - W / 2} y={cy - H / 2}
        width={W} height={H}
        rx={5}
        fill="white" stroke="#3b82f6" strokeWidth="2"
        style={{ pointerEvents: 'none' }}
      />
      {/* Centre tick line */}
      {horizontal
        ? <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
        : <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
      }
    </g>
  );
}

function SliderRow({
  label, value, onChange, min, max,
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/50 w-20 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-500 h-1"
      />
      <span className="text-xs text-white/50 w-8 text-right tabular-nums">
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}
