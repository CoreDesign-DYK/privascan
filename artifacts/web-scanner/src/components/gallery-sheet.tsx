/**
 * gallery-sheet.tsx
 * Dark bottom-sheet gallery — slides up over the camera view without a page transition.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  X, FileText, Image as ImageIcon, Trash2, Calendar,
  Download, Share2, Layers, CheckSquare, Square,
  GitMerge, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLocalScans, useLocalScan, useDeleteLocalScan, type LocalScan } from '@/hooks/use-local-scans';
import { generatePDF, downloadBlob, shareFile, mergeToPDF } from '@/lib/export';
import { CloudBackupSheet } from '@/components/cloud-backup-sheet';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GallerySheet({ open, onClose }: Props) {
  const [, setLocation] = useLocation();

  /* ── data ────────────────────────────────────────────────────────────────── */
  const { data: scans = [], isLoading } = useLocalScans();
  const deleteScan = useDeleteLocalScan();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: selected } = useLocalScan(selectedId);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeIds, setMergeIds]   = useState<Set<string>>(new Set());
  const [merging, setMerging]     = useState(false);

  /* ── animation state ─────────────────────────────────────────────────────── */
  const [visible,   setVisible]   = useState(false);   // controls DOM presence
  const [animateIn, setAnimateIn] = useState(false);   // controls translateY

  useEffect(() => {
    if (open) {
      setVisible(true);
      // give a frame for the DOM to render before sliding in
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    } else {
      setAnimateIn(false);
      const t = setTimeout(() => setVisible(false), 350);
      return () => clearTimeout(t);
    }
  }, [open]);

  /* ── drag-to-close ───────────────────────────────────────────────────────── */
  const sheetRef   = useRef<HTMLDivElement>(null);
  const startY     = useRef(0);
  const currentY   = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current   = e.touches[0].clientY;
    currentY.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startY.current;
    if (dy < 0) return;           // block upward drag
    currentY.current = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    if (sheetRef.current) sheetRef.current.style.transition = '';
    if (currentY.current > 120) {
      onClose();
    } else {
      if (sheetRef.current) sheetRef.current.style.transform = '';
    }
  };

  /* ── helpers ─────────────────────────────────────────────────────────────── */
  const close = () => {
    setMergeMode(false);
    setMergeIds(new Set());
    onClose();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const handleDelete = async (scan: LocalScan, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${scan.name}"?`)) return;
    try {
      await deleteScan.mutateAsync(scan.id);
      if (selectedId === scan.id) setSelectedId(null);
      toast.success('Scan deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleDownload = async (scan: LocalScan) => {
    const tid = toast.loading('Preparing file…');
    try {
      if (scan.format === 'pdf') {
        const blob = await generatePDF(scan.pages, scan.paperSize as any);
        downloadBlob(blob, `${scan.name}.pdf`);
      } else {
        scan.pages.forEach((p, i) => {
          const a = document.createElement('a');
          a.href = p; a.download = `${scan.name}_page_${i + 1}.jpg`; a.click();
        });
      }
      toast.success('Saved to device', { id: tid });
    } catch { toast.error('Export failed', { id: tid }); }
  };

  const handleShare = async (scan: LocalScan) => {
    const tid = toast.loading('Preparing share…');
    try {
      const blob = scan.format === 'pdf'
        ? await generatePDF(scan.pages, scan.paperSize as any)
        : await fetch(scan.pages[0]).then(r => r.blob());
      const ext  = scan.format === 'pdf' ? 'pdf' : 'jpg';
      const mime = scan.format === 'pdf' ? 'application/pdf' : 'image/jpeg';
      await shareFile(blob, `${scan.name}.${ext}`, mime);
      toast.success('Shared!', { id: tid });
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed', { id: tid });
      else toast.dismiss(tid);
    }
  };

  const toggleMergeId = (id: string) => {
    setMergeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (mergeIds.size < 2) { toast.error('Select at least 2 scans to merge'); return; }
    const sel = scans.filter(s => mergeIds.has(s.id));
    const tid = toast.loading(`Merging ${sel.length} scans…`);
    try {
      setMerging(true);
      const groups = sel.map(s => ({ name: s.name, pages: s.pages, paperSize: s.paperSize }));
      const blob   = await mergeToPDF(groups);
      downloadBlob(blob, `Merged_${new Date().toISOString().slice(0,10)}.pdf`);
      toast.success('Merged PDF saved!', { id: tid });
      setMergeMode(false);
      setMergeIds(new Set());
    } catch { toast.error('Merge failed', { id: tid }); }
    finally { setMerging(false); }
  };

  if (!visible) return null;

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          animateIn ? 'opacity-100' : 'opacity-0',
        )}
        onClick={close}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'relative flex flex-col rounded-t-3xl overflow-hidden',
          'transition-transform duration-350 ease-out',
          animateIn ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ background: '#0d0d14', maxHeight: '88dvh', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Drag handle — touch area */}
        <div
          className="flex-none pt-3 pb-2 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex-none flex items-center px-5 pb-3 gap-3">
          <h2 className="text-white font-semibold text-lg flex-1">My Scans</h2>

          {/* Merge toggle */}
          {scans.length >= 2 && !mergeMode && (
            <button
              onClick={() => setMergeMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-white/70 text-xs font-medium hover:bg-white/8 transition-colors"
            >
              <GitMerge className="w-3.5 h-3.5" /> Merge
            </button>
          )}
          {mergeMode && (
            <>
              <button
                disabled={mergeIds.size < 2 || merging}
                onClick={handleMerge}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500 text-white text-xs font-semibold disabled:opacity-40 transition-opacity"
              >
                <Layers className="w-3.5 h-3.5" />
                {merging ? 'Merging…' : `Merge (${mergeIds.size})`}
              </button>
              <button
                onClick={() => { setMergeMode(false); setMergeIds(new Set()); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}

          {!mergeMode && (
            <button
              onClick={close}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Merge mode banner */}
        {mergeMode && (
          <div className="flex-none mx-4 mb-3 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            Select scans to merge into one PDF
          </div>
        )}

        {/* Scan list */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-2xl animate-pulse bg-white/6" />
              ))}
            </div>
          ) : scans.length > 0 ? (
            <div className="space-y-2">
              {scans.map(scan => {
                const isMergeSelected = mergeIds.has(scan.id);
                return (
                  <div
                    key={scan.id}
                    onClick={() => mergeMode ? toggleMergeId(scan.id) : setSelectedId(scan.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all active:scale-[0.98]',
                      'border',
                      isMergeSelected && mergeMode
                        ? 'border-sky-500/50 bg-sky-500/10'
                        : 'border-white/8 bg-white/5 hover:bg-white/8',
                    )}
                  >
                    {mergeMode && (
                      <div className="shrink-0 text-sky-400">
                        {isMergeSelected
                          ? <CheckSquare className="w-5 h-5" />
                          : <Square className="w-5 h-5 text-white/30" />}
                      </div>
                    )}

                    {/* Thumbnail */}
                    <div className="w-12 min-w-[3rem] h-[3.75rem] rounded-lg overflow-hidden border border-white/10 bg-white/8 flex items-center justify-center shrink-0">
                      {scan.thumbnail
                        ? <img src={scan.thumbnail} alt={scan.name} className="w-full h-full object-cover" />
                        : scan.scanType === 'document'
                          ? <FileText className="w-5 h-5 text-white/30" />
                          : <ImageIcon className="w-5 h-5 text-white/30" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{scan.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/40">
                        <span>{scan.pageCount}p</span>
                        <span>·</span>
                        <span>{fmt(scan.createdAt)}</span>
                      </div>
                      <div className="flex gap-1.5 mt-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-400 uppercase">{scan.format}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/8 text-white/50 uppercase">{scan.colorMode}</span>
                      </div>
                    </div>

                    {/* Row actions */}
                    {!mergeMode && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleDownload(scan); }}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => handleDelete(scan, e)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center px-6 pt-16 pb-8">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 bg-white/6 border border-white/10">
                <FileText className="w-8 h-8 text-white/25" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">No scans yet</h3>
              <p className="text-white/40 text-sm mb-6">Scans are stored privately on your device.</p>
              <button
                onClick={close}
                className="px-6 py-2.5 rounded-full bg-sky-500 text-white text-sm font-semibold hover:bg-sky-400 transition-colors"
              >
                Start Scanning
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="sm:max-w-md" style={{ background: '#181824', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
          <DialogHeader>
            <DialogTitle className="text-white">{selected?.name ?? 'Scan Details'}</DialogTitle>
            <DialogDescription className="text-white/50">Stored locally · private &amp; offline</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-5 py-2">
              {selected.thumbnail && (
                <div className="rounded-xl overflow-hidden border border-white/10 flex justify-center p-2 bg-white/5">
                  <img src={selected.thumbnail} alt={selected.name} className="max-h-48 object-contain rounded-lg" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ['Date',   fmt(selected.createdAt)],
                  ['Pages',  selected.pageCount],
                  ['Type',   selected.scanType],
                  ['Color',  selected.colorMode],
                  ['Format', selected.format.toUpperCase()],
                  ['Paper',  selected.paperSize],
                ] as [string, string | number][]).map(([label, val]) => (
                  <div key={label}>
                    <p className="text-white/40 text-xs mb-0.5">{label}</p>
                    <p className="text-white font-medium capitalize">{val}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => handleDownload(selected)}
                  className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm hover:bg-white/8 transition-colors"
                >
                  <Download className="w-4 h-4" /> Save to Device
                </button>
                <button
                  onClick={() => handleShare(selected)}
                  className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-400 transition-colors"
                >
                  <Share2 className="w-4 h-4" /> Share
                </button>
                <div className="w-full">
                  <CloudBackupSheet scan={selected} />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
