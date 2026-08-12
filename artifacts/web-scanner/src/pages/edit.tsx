/**
 * edit.tsx
 * Post-capture document crop & filter editor.
 * • 4-corner drag handles → perspective warp (on-device Canvas)
 * • Filter presets: Original / B&W / High-Contrast / Auto-Color
 * • Brightness & Contrast sliders
 * All processing is local — zero server, instant.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Check, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScannerContext } from '@/contexts/scanner-context';
import { warpPerspective, estimateOutputSize, type Point } from '@/lib/perspective';
import { filterCanvas, FILTER_LABELS, type FilterType } from '@/lib/filters';
import { defaultCorners } from '@/lib/edge-detection';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const FILTERS: FilterType[] = ['original', 'auto', 'bw', 'highcontrast'];

export default function EditScreen() {
  const [, setLocation]   = useLocation();
  const {
    pendingPage, setPendingPage,
    detectedCorners, setDetectedCorners,
    addPage, settings,
  } = useScannerContext();

  // ── image loading ──────────────────────────────────────────────────────────
  const imgRef    = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [displayW, setDisplayW]   = useState(0);
  const [displayH, setDisplayH]   = useState(0);
  const [natW, setNatW]           = useState(0);
  const [natH, setNatH]           = useState(0);

  // ── corner handles (in *display* pixel coordinates) ───────────────────────
  const [corners, setCorners] = useState<[Point, Point, Point, Point] | null>(null);
  const dragging = useRef<number | null>(null);

  // ── filter state ──────────────────────────────────────────────────────────
  const [filter, setFilter]         = useState<FilterType>('original');
  const [brightness, setBrightness] = useState(0);
  const [contrast,   setContrast]   = useState(0);
  const [applying,   setApplying]   = useState(false);

  // If no pending image, go back to scanner
  useEffect(() => {
    if (!pendingPage) setLocation('/');
  }, [pendingPage, setLocation]);

  // Compute display size after image loads
  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    const con = containerRef.current;
    if (!img || !con) return;

    const nw = img.naturalWidth, nh = img.naturalHeight;
    const cw = con.clientWidth, ch = con.clientHeight;
    const scale = Math.min(cw / nw, ch / nh, 1);
    const dw = Math.round(nw * scale), dh = Math.round(nh * scale);

    setNatW(nw); setNatH(nh);
    setDisplayW(dw); setDisplayH(dh);
    setImgLoaded(true);

    // Set initial corners (detected or default), in display coords
    const src = detectedCorners
      ? detectedCorners.map(p => ({ x: p.x * scale, y: p.y * scale })) as [Point, Point, Point, Point]
      : defaultCorners(dw, dh);
    setCorners(src);
  }, [detectedCorners]);

  // ── pointer drag handlers ──────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = idx;
  };

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current === null || !corners) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(displayW, e.clientX - rect.left));
    const y = Math.max(0, Math.min(displayH, e.clientY - rect.top));
    const next = [...corners] as [Point, Point, Point, Point];
    next[dragging.current] = { x, y };
    setCorners(next);
  }, [corners, displayW, displayH]);

  const onPointerUp = () => { dragging.current = null; };

  // Reset corners to full image
  const resetCorners = () => {
    if (displayW && displayH) setCorners(defaultCorners(displayW, displayH));
  };

  // ── Apply: warp + filter → addPage ────────────────────────────────────────
  const handleApply = async () => {
    if (!pendingPage || !corners) return;
    setApplying(true);
    const tid = toast.loading('Processing…');

    try {
      // 1. Draw original image to a canvas
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = pendingPage!;
      });

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width  = natW; srcCanvas.height = natH;
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0);

      // 2. Scale corners back to natural image coordinates
      const scaleX = natW / displayW, scaleY = natH / displayH;
      const natCorners = corners.map(p => ({
        x: p.x * scaleX, y: p.y * scaleY,
      })) as [Point, Point, Point, Point];

      // 3. Warp perspective
      const { w: outW, h: outH } = estimateOutputSize(natCorners);
      const warped = warpPerspective(srcCanvas, natCorners, outW, outH);

      // 4. Apply filter
      const filtered = filterCanvas(warped, filter, brightness, contrast);

      // 5. Export to JPEG and add to pages
      const dataUrl = filtered.toDataURL('image/jpeg', 0.92);
      addPage(dataUrl);

      toast.success('Page added!', { id: tid });
      setPendingPage(null);
      setDetectedCorners(null);
      setLocation('/');
    } catch (err) {
      console.error(err);
      toast.error('Processing failed', { id: tid });
    } finally {
      setApplying(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];
  const CORNER_COLORS = ['#3b82f6', '#3b82f6', '#3b82f6', '#3b82f6'];

  return (
    <div className="min-h-[100dvh] bg-gray-950 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <Button
          variant="ghost" size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => { setPendingPage(null); setDetectedCorners(null); setLocation('/'); }}
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <span className="text-white font-semibold text-sm">Crop &amp; Filter</span>

        <Button
          size="sm"
          disabled={applying || !corners}
          className="rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5"
          onClick={handleApply}
        >
          {applying ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Check className="w-4 h-4 mr-1" /> Apply</>}
        </Button>
      </div>

      {/* Image + Corner overlay */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden px-4 py-2"
        style={{ minHeight: 0 }}
      >
        {pendingPage && (
          <div className="relative" style={{ width: displayW || 'auto', height: displayH || 'auto' }}>
            {/* Source image */}
            <img
              ref={imgRef}
              src={pendingPage}
              onLoad={onImageLoad}
              className="block rounded-md"
              style={{ width: displayW || undefined, height: displayH || undefined, opacity: imgLoaded ? 1 : 0 }}
              alt="Captured page"
              draggable={false}
            />

            {/* SVG overlay with quad + handles */}
            {imgLoaded && corners && (
              <svg
                className="absolute inset-0 cursor-crosshair touch-none"
                width={displayW}
                height={displayH}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {/* Quad outline */}
                <polygon
                  points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(59,130,246,0.12)"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                />

                {/* Corner handles */}
                {corners.map((p, i) => (
                  <g key={i}>
                    {/* Outer ring for easier touch */}
                    <circle
                      cx={p.x} cy={p.y} r={20}
                      fill="transparent"
                      onPointerDown={e => onPointerDown(e, i)}
                      style={{ cursor: 'grab' }}
                    />
                    {/* Visible dot */}
                    <circle
                      cx={p.x} cy={p.y} r={9}
                      fill={CORNER_COLORS[i]}
                      stroke="white"
                      strokeWidth="2.5"
                      style={{ pointerEvents: 'none' }}
                    />
                    {/* Label */}
                    <text
                      x={p.x} y={p.y + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="white" fontSize="7" fontWeight="bold"
                      style={{ pointerEvents: 'none' }}
                    >
                      {CORNER_LABELS[i]}
                    </text>
                  </g>
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

      {/* Controls */}
      <div className="shrink-0 bg-gray-900 rounded-t-2xl px-4 pt-4 pb-6 space-y-4">

        {/* Reset corners */}
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
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                )}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-3">
          <SliderRow
            label="Brightness" value={brightness}
            onChange={setBrightness} min={-100} max={100}
          />
          <SliderRow
            label="Contrast" value={contrast}
            onChange={setContrast} min={-100} max={100}
          />
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label, value, onChange, min, max,
}: {
  label: string; value: number;
  onChange: (v: number) => void;
  min: number; max: number;
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
