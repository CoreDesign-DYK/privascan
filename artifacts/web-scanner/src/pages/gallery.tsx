import React, { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ChevronLeft, FileText, Image as ImageIcon, Trash2, Calendar,
  Download, Share2, HardDrive, Layers, CheckSquare, Square,
  GitMerge, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useLocalScans, useLocalScan, useDeleteLocalScan, type LocalScan } from '@/hooks/use-local-scans';
import { generatePDF, downloadBlob, shareFile, mergeToPDF } from '@/lib/export';
import { CloudBackupSheet } from '@/components/cloud-backup-sheet';
import { cn } from '@/lib/utils';

export default function GalleryScreen() {
  const [, setLocation] = useLocation();
  const { data: scans = [], isLoading } = useLocalScans();
  const deleteScan = useDeleteLocalScan();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: selected } = useLocalScan(selectedId);

  // Merge mode
  const [mergeMode, setMergeMode]     = useState(false);
  const [mergeIds, setMergeIds]       = useState<Set<string>>(new Set());
  const [merging, setMerging]         = useState(false);

  /* ── helpers ──────────────────────────────────────────────────────────────── */
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

  /* ── Merge ────────────────────────────────────────────────────────────────── */
  const toggleMergeId = (id: string) => {
    setMergeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (mergeIds.size < 2) { toast.error('Select at least 2 scans to merge'); return; }
    const selected = scans.filter(s => mergeIds.has(s.id));
    const tid = toast.loading(`Merging ${selected.length} scans…`);
    try {
      setMerging(true);
      const groups = selected.map(s => ({ name: s.name, pages: s.pages, paperSize: s.paperSize }));
      const blob   = await mergeToPDF(groups);
      const name   = `Merged_${new Date().toISOString().slice(0,10)}.pdf`;
      downloadBlob(blob, name);
      toast.success('Merged PDF saved!', { id: tid });
      setMergeMode(false);
      setMergeIds(new Set());
    } catch { toast.error('Merge failed', { id: tid }); }
    finally { setMerging(false); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  /* ── render ───────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-[100dvh] bg-secondary flex flex-col">
      {/* Header */}
      <div
        className="bg-background px-4 min-h-16 h-auto flex items-center border-b sticky top-0 z-10 gap-2 pb-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
      >
        <Button variant="ghost" size="icon" onClick={() => { setMergeMode(false); setLocation('/'); }} className="-ml-2">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <h1 className="font-semibold text-lg flex-1">My Scans</h1>

        {/* Merge toggle */}
        {scans.length >= 2 && !mergeMode && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setMergeMode(true)}>
            <GitMerge className="w-3.5 h-3.5" /> Merge
          </Button>
        )}
        {mergeMode && (
          <>
            <Button
              size="sm"
              disabled={mergeIds.size < 2 || merging}
              onClick={handleMerge}
              className="gap-1.5 text-xs"
            >
              <Layers className="w-3.5 h-3.5" />
              {merging ? 'Merging…' : `Merge (${mergeIds.size})`}
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => { setMergeMode(false); setMergeIds(new Set()); }}>
              <X className="w-4 h-4" />
            </Button>
          </>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <HardDrive className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">On-device</span>
        </div>
      </div>

      {/* Merge mode banner */}
      {mergeMode && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 text-xs text-primary font-medium flex items-center gap-2">
          <CheckSquare className="w-3.5 h-3.5" />
          Select scans to merge into one PDF (on-device, instant)
        </div>
      )}

      {/* List */}
      <div
        className="flex-1 p-4 overflow-y-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="bg-background h-24 rounded-xl border animate-pulse" />)}
          </div>
        ) : scans.length > 0 ? (
          <div className="space-y-3">
            {scans.map(scan => {
              const isMergeSelected = mergeIds.has(scan.id);
              return (
                <div
                  key={scan.id}
                  className={cn(
                    'bg-background border rounded-xl p-4 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-all shadow-sm hover:shadow-md',
                    mergeMode && isMergeSelected && 'border-primary ring-1 ring-primary bg-primary/5'
                  )}
                  onClick={() => mergeMode ? toggleMergeId(scan.id) : setSelectedId(scan.id)}
                >
                  {/* Merge checkbox */}
                  {mergeMode && (
                    <div className="shrink-0">
                      {isMergeSelected
                        ? <CheckSquare className="w-5 h-5 text-primary" />
                        : <Square className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  )}

                  {/* Thumbnail */}
                  <div className="w-14 min-w-[3.5rem] h-[4.5rem] bg-secondary rounded-md flex items-center justify-center overflow-hidden border shrink-0">
                    {scan.thumbnail
                      ? <img src={scan.thumbnail} alt={scan.name} className="w-full h-full object-cover" />
                      : scan.scanType === 'document'
                        ? <FileText className="w-6 h-6 text-muted-foreground" />
                        : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{scan.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {scan.pageCount}p
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {fmt(scan.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary uppercase">{scan.format}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground uppercase">{scan.colorMode}</span>
                    </div>
                  </div>

                  {/* Row actions (hidden in merge mode) */}
                  {!mergeMode && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); handleDownload(scan); }}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-destructive"
                        onClick={e => handleDelete(scan, e)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-6 pt-24">
            <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mb-4 shadow-sm border">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">No scans yet</h2>
            <p className="text-muted-foreground mb-6 text-sm">Scans are stored privately on your device.</p>
            <Button onClick={() => setLocation('/')} className="rounded-full">Start Scanning</Button>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle>{selected?.name ?? 'Scan Details'}</DialogTitle>
            <DialogDescription>Stored locally on this device · private &amp; offline</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-5 py-2">
              {selected.thumbnail && (
                <div className="bg-secondary rounded-lg overflow-hidden border flex justify-center p-2">
                  <img src={selected.thumbnail} alt={selected.name} className="max-h-48 object-contain rounded" />
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
                    <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
                    <p className="font-medium capitalize">{val}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => handleDownload(selected)}>
                  <Download className="w-4 h-4 mr-2" /> Save to Device
                </Button>
                <Button className="flex-1 min-w-[120px]" onClick={() => handleShare(selected)}>
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
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
