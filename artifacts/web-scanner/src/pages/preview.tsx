/**
 * preview.tsx — Adobe Scan-style unified review screen
 *
 * Layout:
 *   Header (back · page count · share)
 *   Large page preview
 *   Thumbnail strip
 *   Sub-panel  (filters chips OR adjust sliders — only when tool active)
 *   Tool bar   (Retake · Crop · Rotate · Filters · Adjust · Delete)
 *   Primary    (Keep scanning · Save PDF)
 *
 * Crop opens a full-screen overlay within this screen (no route change).
 * Rotate, Filters, Adjust apply directly to pages[selectedIdx] via updatePage.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useScannerContext } from '@/contexts/scanner-context';
import {
  ChevronLeft, Share2, Camera, Crop as CropIcon, RotateCw,
  Sparkles, SlidersHorizontal, Trash2, Check, X, Download, Type, PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterCanvas, FILTER_LABELS, type FilterType } from '@/lib/filters';
import { warpPerspective, estimateOutputSize, type Point } from '@/lib/perspective';
import { defaultCorners } from '@/lib/edge-detection';
import { generatePDF, downloadBlob, shareFile } from '@/lib/export';
import { useSaveScan } from '@/hooks/use-local-scans';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isIOS } from '@/lib/platform';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

/* ── Types ─────────────────────────────────────────────────────────────────── */
type ActiveTool = 'none' | 'filters' | 'adjust' | 'crop';
type DragTarget =
  | 'corner-0' | 'corner-1' | 'corner-2' | 'corner-3'
  | 'edge-top' | 'edge-right' | 'edge-bottom' | 'edge-left';
type PreviewPointer = { x: number; y: number };
type PinchGesture = {
  startDistance: number;
  startScale: number;
  originX: number;
  originY: number;
};
type SwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
};

const FILTERS: FilterType[] = ['original', 'auto', 'bw', 'highcontrast'];
const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 3;
const PAGE_SWIPE_DISTANCE = 48;
const PAGE_SWIPE_DIRECTION_RATIO = 1.2;
const PAGE_SWIPE_ANIMATION_MS = 280;
const editJpegQuality = () => isIOS() ? 0.98 : 0.92;

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointerDistance([a, b]: PreviewPointer[]): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerMidpoint([a, b]: PreviewPointer[]): PreviewPointer {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function PreviewScreen() {
  const [, setLocation] = useLocation();
  const {
    pages, removePage, updatePage, clearPages, settings,
    setActivePageIndex, activePageIndex, draftHydrated,
  } = useScannerContext();
  const saveScan = useSaveScan();

  /* ── Page selection ─────────────────────────────────────────────────────── */
  const [selectedIdx, setSelectedIdx] = useState(() =>
    Math.min(activePageIndex, Math.max(0, pages.length - 1)),
  );
  const [activeTool,  setActiveTool]  = useState<ActiveTool>('none');
  const [applying,    setApplying]    = useState(false);

  /* ── Export state ───────────────────────────────────────────────────────── */
  const [exportOpen,  setExportOpen]  = useState(false);
  const [fileName,    setFileName]    = useState(() => `Scan_${new Date().toISOString().slice(0, 10)}`);
  const [isExported,  setIsExported]  = useState(false);

  /* ── Filter / Adjust pending ────────────────────────────────────────────── */
  const [pendingFilter,     setPendingFilter]     = useState<FilterType>('original');
  const [pendingBrightness, setPendingBrightness] = useState(0);
  const [pendingContrast,   setPendingContrast]   = useState(0);

  /* ── Preview zoom: pinch-only, no pan or rotate ─────────────────────────── */
  const [previewZoom, setPreviewZoom] = useState(MIN_PREVIEW_ZOOM);
  const [zoomOrigin, setZoomOrigin]   = useState('50% 50%');
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState(false);
  const previewPointers = useRef(new Map<number, PreviewPointer>());
  const pinchGesture = useRef<PinchGesture | null>(null);
  const swipeGesture = useRef<SwipeGesture | null>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const pendingSwipeIdx = useRef<number | null>(null);
  const swipeAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* ── Crop overlay state ─────────────────────────────────────────────────── */
  const [cropCorners,  setCropCorners]  = useState<[Point, Point, Point, Point] | null>(null);
  const [cropDisplayW, setCropDisplayW] = useState(0);
  const [cropDisplayH, setCropDisplayH] = useState(0);
  const [cropNatW,     setCropNatW]     = useState(0);
  const [cropNatH,     setCropNatH]     = useState(0);
  const [cropImgLoaded, setCropImgLoaded] = useState(false);
  const cropImgRef       = useRef<HTMLImageElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropDragging     = useRef<DragTarget | null>(null);

  /* ── Guards ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (draftHydrated && pages.length === 0) setLocation('/');
  }, [draftHydrated, pages.length, setLocation]);

  useEffect(() => {
    if (selectedIdx >= pages.length && pages.length > 0)
      setSelectedIdx(pages.length - 1);
  }, [pages.length, selectedIdx]);

  useEffect(() => {
    if (pages.length > 0) {
      setSelectedIdx(Math.min(activePageIndex, pages.length - 1));
    }
  }, [activePageIndex, pages.length]);

  useEffect(() => {
    setActivePageIndex(selectedIdx);
  }, [selectedIdx, setActivePageIndex]);

  const selectPage = useCallback((nextIdx: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, nextIdx));
    if (next === selectedIdx) return;
    setSelectedIdx(next);
    setActiveTool('none');
  }, [pages.length, selectedIdx]);

  useEffect(() => {
    thumbnailRefs.current[selectedIdx]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedIdx, pages.length]);

  /* ── Reset pending edits when page changes ──────────────────────────────── */
  useEffect(() => {
    setPendingFilter('original');
    setPendingBrightness(0);
    setPendingContrast(0);
  }, [selectedIdx]);

  // A selected page always opens at its fitted, unzoomed size.
  useEffect(() => {
    setPreviewZoom(MIN_PREVIEW_ZOOM);
    setZoomOrigin('50% 50%');
    setSwipeOffset(0);
    setSwipeAnimating(false);
    previewPointers.current.clear();
    pinchGesture.current = null;
    swipeGesture.current = null;
    pendingSwipeIdx.current = null;
    if (swipeAnimationTimer.current) {
      clearTimeout(swipeAnimationTimer.current);
      swipeAnimationTimer.current = null;
    }
  }, [selectedIdx]);

  const beginPinch = useCallback((container: HTMLDivElement) => {
    const pointers = [...previewPointers.current.values()];
    if (pointers.length !== 2) return;
    setSwipeOffset(0);
    const midpoint = pointerMidpoint(pointers);
    const bounds = container.getBoundingClientRect();
    pinchGesture.current = {
      startDistance: Math.max(1, pointerDistance(pointers)),
      startScale: previewZoom,
      originX: Math.max(0, Math.min(1, (midpoint.x - bounds.left) / bounds.width)),
      originY: Math.max(0, Math.min(1, (midpoint.y - bounds.top) / bounds.height)),
    };
    setZoomOrigin(`${pinchGesture.current.originX * 100}% ${pinchGesture.current.originY * 100}%`);
  }, [previewZoom]);

  const finishSwipeAnimation = useCallback(() => {
    const nextIdx = pendingSwipeIdx.current;
    pendingSwipeIdx.current = null;
    if (swipeAnimationTimer.current) {
      clearTimeout(swipeAnimationTimer.current);
      swipeAnimationTimer.current = null;
    }
    setSwipeAnimating(false);
    setSwipeOffset(0);
    if (nextIdx !== null) selectPage(nextIdx);
  }, [selectPage]);

  const animateSwipeBack = useCallback(() => {
    pendingSwipeIdx.current = null;
    if (swipeAnimationTimer.current) clearTimeout(swipeAnimationTimer.current);
    setSwipeAnimating(true);
    setSwipeOffset(0);
    swipeAnimationTimer.current = setTimeout(() => {
      swipeAnimationTimer.current = null;
      setSwipeAnimating(false);
    }, PAGE_SWIPE_ANIMATION_MS);
  }, []);

  const startSwipeAnimation = useCallback((nextIdx: number, offset: number) => {
    pendingSwipeIdx.current = nextIdx;
    if (swipeAnimationTimer.current) clearTimeout(swipeAnimationTimer.current);
    setSwipeAnimating(true);
    setSwipeOffset(offset);
    swipeAnimationTimer.current = setTimeout(finishSwipeAnimation, PAGE_SWIPE_ANIMATION_MS + 40);
  }, [finishSwipeAnimation]);

  const onPreviewPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    if (swipeAnimating) return;
    // Some embedded browser test drivers emit synthetic touch pointers that
    // cannot be captured. Real touch input still uses capture so a swipe can
    // complete after the finger leaves the image bounds.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue tracking the pointer when capture is unavailable.
    }
    previewPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (previewPointers.current.size === 1) {
      swipeGesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    } else if (previewPointers.current.size === 2) {
      // A second finger promotes the interaction to pinch-only. Never let the
      // first finger's horizontal movement also change pages.
      swipeGesture.current = null;
      beginPinch(event.currentTarget);
    }
  }, [beginPinch, swipeAnimating]);

  const onPreviewPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !previewPointers.current.has(event.pointerId)) return;
    previewPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = pinchGesture.current;
    const pointers = [...previewPointers.current.values()];
    if (gesture && pointers.length === 2) {
      event.preventDefault();
      const scale = Math.max(
        MIN_PREVIEW_ZOOM,
        Math.min(MAX_PREVIEW_ZOOM, gesture.startScale * pointerDistance(pointers) / gesture.startDistance),
      );
      setPreviewZoom(scale);
      return;
    }

    const swipe = swipeGesture.current;
    if (!swipe || pointers.length !== 1 || swipe.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (
      Math.abs(deltaX) > 8 &&
      Math.abs(deltaX) > Math.abs(deltaY) * PAGE_SWIPE_DIRECTION_RATIO
    ) {
      event.preventDefault();
      const width = previewViewportRef.current?.clientWidth ?? 320;
      setSwipeOffset(Math.max(-width, Math.min(width, deltaX)));
    }
  }, []);

  const endPreviewPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const wasPinching = Boolean(pinchGesture.current);
    const swipe = swipeGesture.current;
    previewPointers.current.delete(event.pointerId);
    if (wasPinching) {
      if (previewPointers.current.size < 2) pinchGesture.current = null;
      swipeGesture.current = null;
      return;
    }

    if (swipe && swipe.pointerId === event.pointerId) {
      const deltaX = event.clientX - swipe.startX;
      const deltaY = event.clientY - swipe.startY;
      if (
        Math.abs(deltaX) >= PAGE_SWIPE_DISTANCE &&
        Math.abs(deltaX) > Math.abs(deltaY) * PAGE_SWIPE_DIRECTION_RATIO
      ) {
        const nextIdx = Math.max(
          0,
          Math.min(pages.length - 1, selectedIdx + (deltaX < 0 ? 1 : -1)),
        );
        if (nextIdx !== selectedIdx) {
          const width = previewViewportRef.current?.clientWidth ?? 320;
          startSwipeAnimation(nextIdx, deltaX < 0 ? -width : width);
        } else if (Math.abs(deltaX) > 1) {
          animateSwipeBack();
        }
      } else if (Math.abs(deltaX) > 1) {
        animateSwipeBack();
      }
    }
    swipeGesture.current = null;
  }, [animateSwipeBack, pages.length, selectedIdx, startSwipeAnimation]);

  const cancelPreviewPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    previewPointers.current.delete(event.pointerId);
    pinchGesture.current = null;
    swipeGesture.current = null;
    pendingSwipeIdx.current = null;
    if (swipeAnimationTimer.current) {
      clearTimeout(swipeAnimationTimer.current);
      swipeAnimationTimer.current = null;
    }
    setSwipeAnimating(false);
    setSwipeOffset(0);
  }, []);

  /* ── Rotate 90° CW ──────────────────────────────────────────────────────── */
  const handleRotate = useCallback(async () => {
    const dataUrl = pages[selectedIdx];
    if (!dataUrl || applying) return;
    setApplying(true);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });
      const canvas  = document.createElement('canvas');
      canvas.width  = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      updatePage(selectedIdx, canvas.toDataURL('image/jpeg', editJpegQuality()));
    } finally { setApplying(false); }
  }, [pages, selectedIdx, updatePage, applying]);

  /* ── Apply filter + adjust ──────────────────────────────────────────────── */
  const handleApplyFilters = useCallback(async () => {
    if (pendingFilter === 'original' && pendingBrightness === 0 && pendingContrast === 0) {
      setActiveTool('none'); return;
    }
    const dataUrl = pages[selectedIdx];
    if (!dataUrl) return;
    setApplying(true);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });
      const src = document.createElement('canvas');
      src.width = img.naturalWidth; src.height = img.naturalHeight;
      src.getContext('2d')!.drawImage(img, 0, 0);
      const out = filterCanvas(src, pendingFilter, pendingBrightness, pendingContrast);
      updatePage(selectedIdx, out.toDataURL('image/jpeg', editJpegQuality()));
      setActiveTool('none');
      setPendingFilter('original'); setPendingBrightness(0); setPendingContrast(0);
    } finally { setApplying(false); }
  }, [pages, selectedIdx, updatePage, pendingFilter, pendingBrightness, pendingContrast]);

  /* ── Crop overlay: image load ────────────────────────────────────────────── */
  const onCropImgLoad = useCallback(() => {
    const img = cropImgRef.current;
    const con = cropContainerRef.current;
    if (!img || !con) return;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const styles = window.getComputedStyle(con);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const cw = Math.max(1, con.clientWidth - paddingX);
    const ch = Math.max(1, con.clientHeight - paddingY);
    const scale = Math.min(cw / nw, ch / nh, 1);
    const dw = Math.round(nw * scale), dh = Math.round(nh * scale);
    setCropNatW(nw); setCropNatH(nh);
    setCropDisplayW(dw); setCropDisplayH(dh);
    setCropCorners(defaultCorners(dw, dh, 0));
    setCropImgLoaded(true);
  }, []);

  /* ── Crop drag ──────────────────────────────────────────────────────────── */
  const startCropDrag = (e: React.PointerEvent, target: DragTarget) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    cropDragging.current = target;
  };

  const onCropPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!cropDragging.current || !cropCorners) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(cropDisplayW, e.clientX - rect.left));
    const y = Math.max(0, Math.min(cropDisplayH, e.clientY - rect.top));
    const c = cropCorners.map(p => ({ ...p })) as [Point, Point, Point, Point];
    switch (cropDragging.current) {
      case 'corner-0': c[0] = { x, y }; break;
      case 'corner-1': c[1] = { x, y }; break;
      case 'corner-2': c[2] = { x, y }; break;
      case 'corner-3': c[3] = { x, y }; break;
      case 'edge-top':    c[0] = { ...c[0], y }; c[1] = { ...c[1], y }; break;
      case 'edge-bottom': c[2] = { ...c[2], y }; c[3] = { ...c[3], y }; break;
      case 'edge-left':   c[0] = { ...c[0], x }; c[3] = { ...c[3], x }; break;
      case 'edge-right':  c[1] = { ...c[1], x }; c[2] = { ...c[2], x }; break;
    }
    setCropCorners(c);
  }, [cropCorners, cropDisplayW, cropDisplayH]);

  /* ── Apply crop ─────────────────────────────────────────────────────────── */
  const handleApplyCrop = useCallback(async () => {
    if (!cropCorners || !pages[selectedIdx]) return;
    setApplying(true);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = pages[selectedIdx]; });
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = cropNatW; srcCanvas.height = cropNatH;
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0);
      const scaleX = cropNatW / cropDisplayW, scaleY = cropNatH / cropDisplayH;
      const natCorners = cropCorners.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })) as [Point, Point, Point, Point];
      const { w: outW, h: outH } = estimateOutputSize(natCorners);
      const warped = warpPerspective(srcCanvas, natCorners, outW, outH);
      updatePage(selectedIdx, warped.toDataURL('image/jpeg', editJpegQuality()));
      setActiveTool('none'); setCropImgLoaded(false);
    } catch { toast.error('Crop failed'); }
    finally { setApplying(false); }
  }, [cropCorners, pages, selectedIdx, cropNatW, cropNatH, cropDisplayW, cropDisplayH, updatePage]);

  /* ── Delete page ────────────────────────────────────────────────────────── */
  const handleDelete = useCallback(() => {
    if (pages.length === 1) {
      clearPages(); setLocation('/'); return;
    }
    removePage(selectedIdx);
    setSelectedIdx(Math.min(selectedIdx, pages.length - 2));
    setActiveTool('none');
  }, [pages.length, selectedIdx, removePage, clearPages, setLocation]);

  /* ── Retake: remove selected, go back to scanner ────────────────────────── */
  const handleRetake = useCallback(() => {
    removePage(selectedIdx);
    setLocation('/');
  }, [removePage, selectedIdx, setLocation]);

  /* ── Export helpers ─────────────────────────────────────────────────────── */
  const finalise = async (format: 'pdf' | 'jpeg') => {
    await saveScan.mutateAsync({
      name: fileName, pageCount: pages.length,
      scanType: settings.scanType, colorMode: settings.colorMode,
      paperSize: settings.paperSize, format, thumbnail: pages[0], pages: [...pages],
    });
    setIsExported(true);
  };

  const handleSavePDF = async () => {
    const tid = toast.loading('Generating PDF…');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      downloadBlob(blob, `${fileName}.pdf`);
      await finalise('pdf');
      toast.success('PDF saved ✓', { id: tid });
      setExportOpen(false); clearPages(); setLocation('/gallery');
    } catch { toast.error('Failed to export PDF', { id: tid }); }
  };

  const handleShare = async () => {
    const tid = toast.loading('Preparing…');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      await shareFile(blob, `${fileName}.pdf`, 'application/pdf');
      await finalise('pdf');
      toast.success('Shared!', { id: tid });
      setExportOpen(false); clearPages(); setLocation('/gallery');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed', { id: tid });
      else toast.dismiss(tid);
    }
  };

  /* ── Crop geometry ──────────────────────────────────────────────────────── */
  const cropMids = cropCorners ? {
    top:    midpoint(cropCorners[0], cropCorners[1]),
    right:  midpoint(cropCorners[1], cropCorners[2]),
    bottom: midpoint(cropCorners[2], cropCorners[3]),
    left:   midpoint(cropCorners[0], cropCorners[3]),
  } : null;

  const currentPage = pages[selectedIdx];
  const previewSlides = [
    selectedIdx > 0 ? { index: selectedIdx - 1, position: -1 } : null,
    { index: selectedIdx, position: 0 },
    selectedIdx < pages.length - 1 ? { index: selectedIdx + 1, position: 1 } : null,
  ].filter((slide): slide is { index: number; position: number } => slide !== null);

  if (!draftHydrated) {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (pages.length === 0) return null;

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-gray-950 flex flex-col select-none relative">

      {/* ════ Header ════ */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <button
          onClick={() => setLocation('/')}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/10 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-semibold text-[15px]">
          {pages.length} Page{pages.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setExportOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/10 transition-colors"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* ════ Main preview ════ */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden px-6 py-2 min-h-0 touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={onPreviewPointerDown}
        onPointerMove={onPreviewPointerMove}
        onPointerUp={endPreviewPointer}
        onPointerCancel={cancelPreviewPointer}
        onTransitionEnd={finishSwipeAnimation}
      >
        <div ref={previewViewportRef} className="relative w-full h-full overflow-hidden">
          {previewSlides.map(({ index, position }) => (
            <div
              key={index}
              className="absolute inset-0 flex items-center justify-center will-change-transform"
              style={{
                transform: `translate3d(calc(${position * 100}% + ${swipeOffset}px), 0, 0)`,
                transition: swipeAnimating
                  ? `transform ${PAGE_SWIPE_ANIMATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
                  : 'none',
              }}
            >
              <img
                src={pages[index]}
                alt={`Page ${index + 1}`}
                className="max-w-full max-h-full object-contain rounded-none shadow-2xl"
                style={{
                  transform: `scale(${index === selectedIdx ? previewZoom : MIN_PREVIEW_ZOOM})`,
                  transformOrigin: index === selectedIdx ? zoomOrigin : '50% 50%',
                  imageRendering: 'auto',
                }}
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ════ Thumbnail strip ════ */}
      <div className="shrink-0 px-4 pt-1 pb-0.5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {pages.map((p, i) => (
            <button
              key={i}
              ref={element => { thumbnailRefs.current[i] = element; }}
              onClick={() => selectPage(i)}
              className={cn(
                'shrink-0 w-14 h-16 rounded-none overflow-hidden border-2 transition-all relative',
                i === selectedIdx
                  ? 'border-blue-500 shadow-lg shadow-blue-500/30 scale-105'
                  : 'border-white/20 opacity-60 hover:opacity-90',
              )}
            >
              <img src={p} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
              <span className="absolute bottom-0.5 right-1 text-[9px] text-white font-bold drop-shadow">
                {i + 1}
              </span>
            </button>
          ))}
          {/* Add page hint */}
          <button
            onClick={() => setLocation('/')}
            className="shrink-0 w-14 h-16 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-white/30 hover:border-white/40 hover:text-white/50 transition-colors"
          >
            <span className="text-2xl leading-none">+</span>
          </button>
        </div>
      </div>

      {/* ════ Filters sub-panel ════ */}
      {activeTool === 'filters' && (
        <div className="shrink-0 bg-gray-900/80 backdrop-blur px-4 py-3 border-t border-white/10">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setPendingFilter(f)}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all',
                  pendingFilter === f
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20',
                )}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-2 gap-4">
            <button
              onClick={() => { setActiveTool('none'); setPendingFilter('original'); }}
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyFilters}
              disabled={applying}
              className="flex items-center gap-1.5 text-sm text-blue-400 font-semibold hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Apply
            </button>
          </div>
        </div>
      )}

      {/* ════ Adjust sub-panel ════ */}
      {activeTool === 'adjust' && (
        <div className="shrink-0 bg-gray-900/80 backdrop-blur px-4 py-3 border-t border-white/10 space-y-3">
          <SliderRow label="Brightness" value={pendingBrightness} onChange={setPendingBrightness} min={-100} max={100} />
          <SliderRow label="Contrast"   value={pendingContrast}   onChange={setPendingContrast}   min={-100} max={100} />
          <div className="flex justify-end gap-4">
            <button
              onClick={() => { setActiveTool('none'); setPendingBrightness(0); setPendingContrast(0); }}
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyFilters}
              disabled={applying}
              className="flex items-center gap-1.5 text-sm text-blue-400 font-semibold hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Apply
            </button>
          </div>
        </div>
      )}

      {/* ════ Tool bar ════ */}
      <div className="shrink-0 bg-gray-900 border-t border-white/10 py-1.5">
        <div className="flex items-center justify-start gap-1 overflow-x-auto no-scrollbar px-2">

          {/* Retake */}
          <ToolButton icon={<Camera className="w-5 h-5" />} label="Retake"
            onClick={handleRetake} disabled={applying} />

          {/* Crop */}
          <ToolButton icon={<CropIcon className="w-5 h-5" />} label="Crop"
            active={activeTool === 'crop'}
            onClick={() => { setCropImgLoaded(false); setActiveTool('crop'); }}
            disabled={applying} />

          {/* Rotate */}
          <ToolButton icon={<RotateCw className="w-5 h-5" />} label="Rotate"
            onClick={handleRotate} disabled={applying}
            spin={applying} />

          <ToolButton icon={<Type className="w-5 h-5" />} label="Edit text"
            onClick={() => setLocation('/markup?mode=text')} disabled={applying} />

          <ToolButton icon={<PenLine className="w-5 h-5" />} label="Markup"
            onClick={() => setLocation('/markup')} disabled={applying} />

          {/* Filters */}
          <ToolButton icon={<Sparkles className="w-5 h-5" />} label="Filters"
            active={activeTool === 'filters'}
            onClick={() => setActiveTool(t => t === 'filters' ? 'none' : 'filters')}
            disabled={applying} />

          {/* Adjust */}
          <ToolButton icon={<SlidersHorizontal className="w-5 h-5" />} label="Adjust"
            active={activeTool === 'adjust'}
            onClick={() => setActiveTool(t => t === 'adjust' ? 'none' : 'adjust')}
            disabled={applying} />

          {/* Delete */}
          <ToolButton icon={<Trash2 className="w-5 h-5" />} label="Delete"
            onClick={handleDelete} disabled={applying} danger />

        </div>
      </div>

      {/* ════ Primary actions ════ */}
      <div className="shrink-0 bg-gray-900 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1.5 flex gap-3">
        <button
          onClick={() => setLocation('/')}
          className="flex-1 h-11 rounded-full border border-white/30 text-white font-semibold text-[14px] hover:bg-white/10 transition-colors"
        >
          Keep scanning
        </button>
        <button
          onClick={handleSavePDF}
          className="flex-[1.4] h-11 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-[14px] transition-colors"
        >
          Save PDF
        </button>
      </div>

      {/* ════ Crop overlay (full-screen, z-50) ════ */}
      {activeTool === 'crop' && (
        <div
          className="absolute inset-0 z-50 bg-gray-950 flex flex-col"
          style={{
            // Some iOS WKWebView configurations report a zero safe-area
            // inset even though the status bar still overlays the viewport.
            // Keep a reliable minimum clearance for the system chrome.
            paddingTop: 'max(3.25rem, env(safe-area-inset-top, 0px))',
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
          }}
        >

          {/* Crop header */}
          <div className="relative z-[60] flex items-center justify-between px-4 h-14 shrink-0 pointer-events-auto">
            <button
              onClick={() => { setActiveTool('none'); setCropImgLoaded(false); }}
              className="relative z-10 flex min-h-10 items-center gap-1.5 px-2 text-white/60 hover:text-white transition-colors text-sm"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <span className="text-white font-semibold">Crop</span>
            <button
              onClick={handleApplyCrop}
              disabled={applying || !cropImgLoaded}
              className="relative z-10 flex min-h-10 min-w-[76px] items-center justify-center gap-1.5 px-2 text-blue-400 font-semibold disabled:opacity-40 hover:text-blue-300 transition-colors text-sm"
            >
              {applying
                ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <><Check className="w-4 h-4" /> Apply</>
              }
            </button>
          </div>

          {/* Crop canvas */}
          <div
            ref={cropContainerRef}
            className="flex-1 flex items-center justify-center overflow-hidden px-7 py-2"
            style={{ minHeight: 0 }}
          >
            {currentPage && (
              <div
                className="relative"
                style={{ width: cropDisplayW || 'auto', height: cropDisplayH || 'auto' }}
              >
                <img
                  ref={cropImgRef}
                  src={currentPage}
                  onLoad={onCropImgLoad}
                  className="block rounded-none"
                  style={{
                    width:   cropDisplayW || undefined,
                    height:  cropDisplayH || undefined,
                    opacity: cropImgLoaded ? 1 : 0,
                  }}
                  alt="Crop"
                  draggable={false}
                />

                {cropImgLoaded && cropCorners && cropMids && (
                  <svg
                    className="absolute inset-0 touch-none overflow-visible"
                    width={cropDisplayW}
                    height={cropDisplayH}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={() => { cropDragging.current = null; }}
                    onPointerLeave={() => { cropDragging.current = null; }}
                  >
                    {/* Quad outline */}
                    <polygon
                      points={cropCorners.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none" stroke="#3b82f6" strokeWidth="2"
                    />

                    {/* Edge invisible hit areas */}
                    {([
                      [cropCorners[0], cropCorners[1], 'edge-top',    'ns-resize'],
                      [cropCorners[1], cropCorners[2], 'edge-right',  'ew-resize'],
                      [cropCorners[2], cropCorners[3], 'edge-bottom', 'ns-resize'],
                      [cropCorners[3], cropCorners[0], 'edge-left',   'ew-resize'],
                    ] as [Point, Point, DragTarget, string][]).map(([a, b, target, cursor]) => (
                      <line key={target}
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke="transparent" strokeWidth="20"
                        style={{ cursor }}
                        onPointerDown={e => startCropDrag(e, target)}
                      />
                    ))}

                    {/* Edge midpoint bars */}
                    {([
                      { ...cropMids.top,    horizontal: true,  target: 'edge-top'    as DragTarget, cursor: 'ns-resize' },
                      { ...cropMids.bottom, horizontal: true,  target: 'edge-bottom' as DragTarget, cursor: 'ns-resize' },
                      { ...cropMids.left,   horizontal: false, target: 'edge-left'   as DragTarget, cursor: 'ew-resize' },
                      { ...cropMids.right,  horizontal: false, target: 'edge-right'  as DragTarget, cursor: 'ew-resize' },
                    ]).map(({ x, y, horizontal, target, cursor }) => (
                      <CropEdgeBar key={target} cx={x} cy={y} horizontal={horizontal}
                        onPointerDown={e => startCropDrag(e, target)} cursor={cursor} />
                    ))}

                    {/* Corner handles */}
                    {cropCorners.map((p, i) => (
                      <CropCornerHandle key={i} cx={p.x} cy={p.y}
                        onPointerDown={e => startCropDrag(e, `corner-${i}` as DragTarget)} />
                    ))}
                  </svg>
                )}

                {!cropImgLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reset corners */}
          <div className="flex justify-center py-3 shrink-0">
            <button
              onClick={() => {
                if (cropDisplayW && cropDisplayH)
                  setCropCorners(defaultCorners(cropDisplayW, cropDisplayH, 0));
              }}
              className="flex min-h-10 items-center gap-2 px-3 text-sm text-white/55 hover:text-white/85 transition-colors"
            >
              <RotateCw className="w-4 h-4" /> Reset corners
            </button>
          </div>
        </div>
      )}

      {/* ════ Export dialog ════ */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save &amp; Export</DialogTitle>
            <DialogDescription>
              All processing runs on-device — no cloud, instant speed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>File Name</Label>
              <Input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="File name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={handleSavePDF}>
                <Download className="w-6 h-6" />
                <span className="text-sm font-semibold">Save PDF</span>
                <span className="text-[10px] text-muted-foreground">
                  {pages.length} page{pages.length !== 1 ? 's' : ''} merged
                </span>
              </Button>
              <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={handleShare}>
                <Share2 className="w-6 h-6" />
                <span className="text-sm font-semibold">Share</span>
                <span className="text-[10px] text-muted-foreground">AirDrop · Files · Apps</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function ToolButton({
  icon, label, onClick, disabled, active, danger, spin,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'shrink-0 flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-all disabled:opacity-40',
        active  && 'bg-white/15 text-white',
        danger  && !active && 'text-red-400 hover:bg-red-400/10',
        !active && !danger && 'text-white/70 hover:text-white hover:bg-white/10',
      )}
    >
      <div className={cn(spin && 'animate-spin')}>{icon}</div>
        <span className="whitespace-nowrap text-[10px] font-medium leading-none">{label}</span>
    </button>
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

function CropCornerHandle({
  cx, cy, onPointerDown,
}: {
  cx: number; cy: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={26} fill="transparent"
        onPointerDown={onPointerDown} style={{ cursor: 'grab' }} />
      <circle cx={cx} cy={cy} r={14} fill="white" stroke="#3b82f6" strokeWidth="2.5"
        style={{ pointerEvents: 'none' }} />
      <circle cx={cx} cy={cy} r={4}  fill="#3b82f6"
        style={{ pointerEvents: 'none' }} />
    </g>
  );
}

function CropEdgeBar({
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
      <rect
        x={cx - W / 2 - 6} y={cy - H / 2 - 6}
        width={W + 12} height={H + 12}
        rx={8} fill="transparent"
        onPointerDown={onPointerDown} style={{ cursor }}
      />
      <rect
        x={cx - W / 2} y={cy - H / 2}
        width={W} height={H} rx={5}
        fill="white" stroke="#3b82f6" strokeWidth="2"
        style={{ pointerEvents: 'none' }}
      />
      {horizontal
        ? <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy}
            stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"
            style={{ pointerEvents: 'none' }} />
        : <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5}
            stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"
            style={{ pointerEvents: 'none' }} />
      }
    </g>
  );
}
