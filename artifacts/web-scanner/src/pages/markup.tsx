/**
 * markup.tsx — Canvas markup editor
 *
 * Modes:
 *   Draw  — finger / stylus freehand drawing
 *   Text  — tap to place keyboard text
 *
 * On "Done", annotations are flattened at full image resolution
 * and the last page in the scanner context is replaced.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Check, Undo2, Pen, Type } from 'lucide-react';
import { useScannerContext } from '@/contexts/scanner-context';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Types ───────────────────────────────────────────────────────────────── */
interface Pt { x: number; y: number }

interface Stroke {
  points: Pt[];
  color: string;
  width: number;
}

interface TextAnnotation {
  /** canvas-space coords (before scaling) */
  cx: number;
  cy: number;
  text: string;
  color: string;
  fontSize: number;
}

type MarkupItem =
  | { kind: 'stroke'; data: Stroke }
  | { kind: 'text';   data: TextAnnotation };

/* ── Constants ───────────────────────────────────────────────────────────── */
const COLORS = ['#000000', '#1d4ed8', '#dc2626', '#16a34a', '#f59e0b', '#ffffff'];
const STROKE_WIDTHS = [3, 7, 14];

/* ── Geometry helpers ────────────────────────────────────────────────────── */

/** Returns the object-contain render rectangle of an image inside a container */
function containBounds(cW: number, cH: number, iW: number, iH: number) {
  const scale = Math.min(cW / iW, cH / iH);
  const w = iW * scale;
  const h = iH * scale;
  return { x: (cW - w) / 2, y: (cH - h) / 2, w, h, scale };
}

/** Convert canvas-space point → image-space point */
function toImageSpace(pt: Pt, b: ReturnType<typeof containBounds>): Pt {
  return { x: (pt.x - b.x) / b.scale, y: (pt.y - b.y) / b.scale };
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function MarkupScreen() {
  const [, setLocation] = useLocation();
  const { pages, addPage, removePage } = useScannerContext();

  const containerRef   = useRef<HTMLDivElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const activeStroke   = useRef<Pt[]>([]);
  const isDrawing      = useRef(false);

  const [items,   setItems]   = useState<MarkupItem[]>([]);
  const [mode,    setMode]    = useState<'draw' | 'text'>('draw');
  const [color,   setColor]   = useState('#000000');
  const [penW,    setPenW]    = useState(7);

  /* text-input overlay */
  const textRef = useRef<HTMLInputElement>(null);
  const [textOverlay, setTextOverlay] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false, x: 0, y: 0,
  });
  const [textValue, setTextValue] = useState('');

  const bgImage = pages.length ? pages[pages.length - 1] : null;

  /* ── Render helper ──────────────────────────────────────────────────────── */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const item of items) {
      if (item.kind === 'stroke') {
        const { points, color: c, width: w } = item.data;
        if (points.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = c;
        ctx.lineWidth   = w;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      } else {
        const { cx, cy, text, color: c, fontSize: fs } = item.data;
        ctx.font      = `bold ${fs}px Inter, ui-sans-serif, sans-serif`;
        ctx.fillStyle = c;
        ctx.fillText(text, cx, cy);
      }
    }
  }, [items]);

  useEffect(() => { render(); }, [render]);

  /* ── Resize canvas to match container ──────────────────────────────────── */
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      render();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  /* ── Pointer helpers ────────────────────────────────────────────────────── */
  function eventPt(e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent): Pt {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx     = canvas.width  / rect.width;
    const sy     = canvas.height / rect.height;
    if ('touches' in e && e.touches.length) {
      return {
        x: (e.touches[0].clientX - rect.left) * sx,
        y: (e.touches[0].clientY - rect.top)  * sy,
      };
    }
    const me = e as React.MouseEvent;
    return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy };
  }

  /* ── Draw handlers ──────────────────────────────────────────────────────── */
  const onPointerDown = (e: React.TouchEvent | React.MouseEvent) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    isDrawing.current = true;
    activeStroke.current = [eventPt(e)];
  };

  const onPointerMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing.current || mode !== 'draw') return;
    e.preventDefault();
    const pt  = eventPt(e);
    const pts = activeStroke.current;
    pts.push(pt);

    /* live incremental draw */
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = penW;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  };

  const onPointerUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const pts = activeStroke.current;
    if (pts.length > 1) {
      setItems(prev => [...prev, {
        kind: 'stroke',
        data: { points: [...pts], color, width: penW },
      }]);
    }
    activeStroke.current = [];
  };

  /* ── Text handlers ──────────────────────────────────────────────────────── */
  const onCanvasTap = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'text') return;
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ('changedTouches' in e && e.changedTouches.length) {
      cx = e.changedTouches[0].clientX - rect.left;
      cy = e.changedTouches[0].clientY - rect.top;
    } else {
      cx = (e as React.MouseEvent).clientX - rect.left;
      cy = (e as React.MouseEvent).clientY - rect.top;
    }
    setTextOverlay({ visible: true, x: cx, y: cy });
    setTextValue('');
    setTimeout(() => textRef.current?.focus(), 60);
  };

  const commitText = () => {
    if (!textValue.trim()) {
      setTextOverlay(o => ({ ...o, visible: false }));
      return;
    }
    const canvas = canvasRef.current!;
    const sx     = canvas.width  / canvas.getBoundingClientRect().width;
    const sy     = canvas.height / canvas.getBoundingClientRect().height;
    const fontSize = Math.max(20, penW * 3.5);
    setItems(prev => [...prev, {
      kind: 'text',
      data: {
        cx: textOverlay.x * sx,
        cy: textOverlay.y * sy,
        text: textValue,
        color,
        fontSize,
      },
    }]);
    setTextOverlay(o => ({ ...o, visible: false }));
    setTextValue('');
  };

  /* ── Done: flatten at full image resolution ─────────────────────────────── */
  const handleDone = async () => {
    if (!bgImage) { setLocation('/'); return; }

    const img = new Image();
    img.src = bgImage;
    await new Promise<void>(res => { img.onload = () => res(); });

    const out = document.createElement('canvas');
    out.width  = img.naturalWidth;
    out.height = img.naturalHeight;
    const ctx  = out.getContext('2d')!;

    /* draw base image */
    ctx.drawImage(img, 0, 0);

    if (items.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const b = containBounds(canvas.width, canvas.height, img.naturalWidth, img.naturalHeight);

      for (const item of items) {
        if (item.kind === 'stroke') {
          const { points, color: c, width: w } = item.data;
          if (points.length < 2) continue;
          const scaled = points.map(p => toImageSpace(p, b));
          ctx.beginPath();
          ctx.strokeStyle = c;
          ctx.lineWidth   = w / b.scale;
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
          ctx.moveTo(scaled[0].x, scaled[0].y);
          for (let i = 1; i < scaled.length; i++) ctx.lineTo(scaled[i].x, scaled[i].y);
          ctx.stroke();
        } else {
          const { cx, cy, text, color: c, fontSize: fs } = item.data;
          const ip = toImageSpace({ x: cx, y: cy }, b);
          ctx.font      = `bold ${fs / b.scale}px Inter, ui-sans-serif, sans-serif`;
          ctx.fillStyle = c;
          ctx.fillText(text, ip.x, ip.y);
        }
      }
    }

    const result = out.toDataURL('image/jpeg', 0.92);
    removePage(pages.length - 1);
    addPage(result);
    toast.success('Markup saved');
    setLocation('/preview');
  };

  /* ── Early exit if no page ──────────────────────────────────────────────── */
  if (!bgImage) {
    setLocation('/');
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col" style={{ userSelect: 'none' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-950/90 backdrop-blur-sm z-20 shrink-0">
        <button
          onClick={() => setLocation('/')}
          className="flex items-center gap-1 text-white/60 hover:text-white text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5" /> Cancel
        </button>
        <span className="text-white font-semibold text-sm tracking-wide">Markup</span>
        <button
          onClick={handleDone}
          className="flex items-center gap-1.5 text-sky-400 hover:text-sky-300 text-sm font-bold transition-colors"
        >
          <Check className="w-4 h-4" /> Done
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#111]">

        {/* Background image */}
        <img
          src={bgImage}
          alt="Page to mark up"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />

        {/* Annotation canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{
            touchAction: 'none',
            cursor: mode === 'text' ? 'text' : 'crosshair',
          }}
          onMouseDown={mode === 'draw' ? onPointerDown : undefined}
          onMouseMove={mode === 'draw' ? onPointerMove : undefined}
          onMouseUp={mode === 'draw' ? onPointerUp : undefined}
          onMouseLeave={mode === 'draw' ? onPointerUp : undefined}
          onTouchStart={mode === 'draw' ? onPointerDown : undefined}
          onTouchMove={mode === 'draw' ? onPointerMove : undefined}
          onTouchEnd={mode === 'draw' ? onPointerUp : undefined}
          onClick={mode === 'text' ? onCanvasTap : undefined}
        />

        {/* Floating text input bubble */}
        {textOverlay.visible && (
          <div
            className="absolute z-30"
            style={{ left: textOverlay.x, top: Math.max(48, textOverlay.y - 54) }}
          >
            <div
              className="flex items-center gap-2 bg-gray-900/95 border border-white/15 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-sm"
              style={{ minWidth: 200 }}
            >
              <input
                ref={textRef}
                type="text"
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitText(); }
                  if (e.key === 'Escape') setTextOverlay(o => ({ ...o, visible: false }));
                }}
                placeholder="Type here…"
                className="flex-1 bg-transparent outline-none text-sm placeholder-white/30 min-w-0"
                style={{ color, caretColor: color }}
              />
              <button
                onClick={commitText}
                className="text-sky-400 hover:text-sky-300 text-xs font-bold shrink-0 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-gray-950 border-t border-white/10 px-4 pt-3 pb-5 z-20 shrink-0">

        {/* Mode + Undo row */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex bg-white/8 rounded-full p-1 gap-1">
            <button
              onClick={() => setMode('draw')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
                mode === 'draw'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-white/50 hover:text-white/80'
              )}
            >
              <Pen className="w-3.5 h-3.5" /> Draw
            </button>
            <button
              onClick={() => setMode('text')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
                mode === 'text'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-white/50 hover:text-white/80'
              )}
            >
              <Type className="w-3.5 h-3.5" /> Text
            </button>
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setItems(prev => prev.slice(0, -1))}
            disabled={items.length === 0}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-all',
              items.length > 0
                ? 'bg-white/10 text-white hover:bg-white/20'
                : 'opacity-25 bg-white/5 text-white/40 cursor-not-allowed'
            )}
          >
            <Undo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Color + size row */}
        <div className="flex items-center gap-4">

          {/* Color swatches */}
          <div className="flex items-center gap-2 flex-1">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'rounded-full transition-all duration-150',
                  color === c
                    ? 'w-8 h-8 ring-2 ring-sky-400 ring-offset-2 ring-offset-gray-950'
                    : 'w-6 h-6 opacity-80 hover:opacity-100'
                )}
                style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
              />
            ))}
          </div>

          {/* Stroke width picker */}
          <div className="flex items-center gap-2">
            {STROKE_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => setPenW(w)}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                  penW === w ? 'bg-sky-500' : 'bg-white/10 hover:bg-white/20'
                )}
              >
                <div
                  className="rounded-full bg-white"
                  style={{ width: w + 1, height: w + 1 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
