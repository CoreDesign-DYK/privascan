import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useScannerContext } from '@/contexts/scanner-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Trash2, Plus, Share, ChevronLeft, Download, Share2,
  Scissors, ScanText, ChevronDown, ChevronUp, Mail, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { generatePDF, downloadBlob, shareFile, splitPages } from '@/lib/export';
import { useSaveScan, useUpdateScan, useDeleteLocalScan } from '@/hooks/use-local-scans';
import { OcrPanel } from '@/components/ocr-panel';
import { toast } from 'sonner';

export default function PreviewScreen() {
  const [, setLocation] = useLocation();
  const { pages, removePage, clearPages, settings } = useScannerContext();
  const saveScan       = useSaveScan();
  const updateScan     = useUpdateScan();
  const deleteScan     = useDeleteLocalScan();

  const [exportOpen,      setExportOpen]      = useState(false);
  const [fileName,        setFileName]        = useState(() => `Scan_${new Date().toISOString().slice(0, 10)}`);
  const [ocrPage,         setOcrPage]         = useState<number | null>(null);
  const [splitting,       setSplitting]       = useState(false);
  const [isExported,      setIsExported]      = useState(false);
  const [leaveWarning,    setLeaveWarning]    = useState(false);
  const [pendingNav,      setPendingNav]      = useState<string>('/');

  /** ID of the auto-saved draft in IndexedDB */
  const draftId = useRef<string | null>(null);

  /* ── Auto-save draft to IndexedDB as soon as preview loads ─────────────── */
  useEffect(() => {
    if (pages.length === 0 || draftId.current) return;
    saveScan.mutateAsync({
      name: fileName,
      pageCount: pages.length,
      scanType:  settings.scanType,
      colorMode: settings.colorMode,
      paperSize: settings.paperSize,
      format:    'pdf',
      thumbnail: pages[0],
      pages:     [...pages],
    }).then(saved => {
      draftId.current = saved.id;
    }).catch(() => { /* silent — draft save is best-effort */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  /* ── Safe navigation: warn if not yet exported ──────────────────────────── */
  const safeNavigate = (to: string) => {
    if (!isExported) {
      setPendingNav(to);
      setLeaveWarning(true);
    } else {
      clearPages();
      setLocation(to);
    }
  };

  const confirmLeave = (action: 'export' | 'draft' | 'discard') => {
    setLeaveWarning(false);
    if (action === 'export') { setExportOpen(true); return; }
    if (action === 'draft')  { return; /* stay on preview — draft already saved */ }
    // discard: delete the draft from IndexedDB and leave
    if (draftId.current) deleteScan.mutateAsync(draftId.current).catch(() => {});
    clearPages();
    setLocation(pendingNav);
  };

  /* ── Update draft after explicit export ─────────────────────────────────── */
  const finalise = async (format: 'pdf' | 'jpeg') => {
    if (draftId.current) {
      await updateScan.mutateAsync({
        id: draftId.current,
        data: { name: fileName, format, pageCount: pages.length, pages: [...pages], thumbnail: pages[0] },
      });
    } else {
      await saveScan.mutateAsync({
        name: fileName, pageCount: pages.length,
        scanType: settings.scanType, colorMode: settings.colorMode,
        paperSize: settings.paperSize, format,
        thumbnail: pages[0], pages: [...pages],
      });
    }
    setIsExported(true);
  };

  /* ── Email share ────────────────────────────────────────────────────────── */
  const handleEmailShare = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Preparing…');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      const file = new File([blob], `${fileName}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        toast.success('Shared!', { id: tid });
      } else {
        downloadBlob(blob, `${fileName}.pdf`);
        toast.success('PDF saved — attach it manually to an email.', { id: tid });
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed', { id: tid });
      else toast.dismiss(tid);
    }
  };

  /* ── Save as PDF ─────────────────────────────────────────────────────────── */
  const handleSavePDF = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Generating PDF…');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      downloadBlob(blob, `${fileName}.pdf`);
      await finalise('pdf');
      toast.success('PDF saved to device ✓', { id: tid });
      setExportOpen(false); clearPages(); setLocation('/gallery');
    } catch { toast.error('Failed to export PDF', { id: tid }); }
  };

  /* ── Save as JPEG ────────────────────────────────────────────────────────── */
  const handleSaveJPEG = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Saving images…');
    try {
      pages.forEach((p, i) => {
        const a = document.createElement('a');
        a.href = p; a.download = `${fileName}_page_${i + 1}.jpg`; a.click();
      });
      await finalise('jpeg');
      toast.success('Images saved to device ✓', { id: tid });
      setExportOpen(false); clearPages(); setLocation('/gallery');
    } catch { toast.error('Failed to save', { id: tid }); }
  };

  /* ── Share via OS sheet ──────────────────────────────────────────────────── */
  const handleShare = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Preparing share…');
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

  /* ── Split into individual PDFs ──────────────────────────────────────────── */
  const handleSplit = async () => {
    if (pages.length < 2) { toast.error('Need at least 2 pages to split'); return; }
    if (!confirm(`Split ${pages.length} pages into ${pages.length} individual PDFs?`)) return;
    const tid = toast.loading('Splitting pages…');
    try {
      setSplitting(true);
      const blobs = await splitPages(pages, settings.paperSize);
      blobs.forEach((blob, i) => downloadBlob(blob, `${fileName}_page_${i + 1}.pdf`));
      for (let i = 0; i < pages.length; i++) {
        await saveScan.mutateAsync({
          name: `${fileName}_page_${i + 1}`, pageCount: 1,
          scanType: settings.scanType, colorMode: settings.colorMode,
          paperSize: settings.paperSize, format: 'pdf',
          thumbnail: pages[i], pages: [pages[i]],
        });
      }
      // Remove original draft to avoid duplicate
      if (draftId.current) deleteScan.mutateAsync(draftId.current).catch(() => {});
      toast.success(`${pages.length} PDFs saved!`, { id: tid });
      setIsExported(true);
      clearPages(); setLocation('/gallery');
    } catch { toast.error('Split failed', { id: tid }); }
    finally { setSplitting(false); }
  };

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  if (pages.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
          <Trash2 className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">No pages yet</h2>
        <p className="text-muted-foreground mb-6">Go back to the scanner to capture some documents.</p>
        <Button onClick={() => setLocation('/')}>Back to Scanner</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-secondary flex flex-col">
      {/* Header */}
      <div className="bg-background px-4 h-16 flex items-center justify-between border-b sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => safeNavigate('/')} className="-ml-2">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <span className="font-semibold text-lg">{pages.length} Page{pages.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-1">
          {pages.length > 1 && (
            <Button
              variant="ghost" size="sm"
              className="text-xs gap-1 text-muted-foreground"
              onClick={handleSplit}
              disabled={splitting}
            >
              <Scissors className="w-3.5 h-3.5" />
              {splitting ? 'Splitting…' : 'Split'}
            </Button>
          )}
          <Button variant="ghost" size="icon"
            onClick={() => {
              if (confirm('Discard all pages?')) {
                if (draftId.current) deleteScan.mutateAsync(draftId.current).catch(() => {});
                clearPages(); setLocation('/');
              }
            }}
            className="text-destructive -mr-2">
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Pages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-40">
        {pages.map((p, i) => (
          <div key={i} className="space-y-3">
            <div className="relative group">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-md">
                {i + 1}
              </div>
              <div className="bg-background p-2 rounded-xl shadow-sm border">
                <img src={p} alt={`Page ${i + 1}`} className="w-full h-auto rounded-lg object-contain" />
              </div>
              <button
                onClick={() => removePage(i)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-destructive text-white rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-transform"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setOcrPage(ocrPage === i ? null : i)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-background border text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <ScanText className="w-3.5 h-3.5" />
                OCR — Extract text from page {i + 1}
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Free · Offline</span>
              </span>
              {ocrPage === i ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {ocrPage === i && <OcrPanel imageDataUrl={p} />}
          </div>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="bg-background border-t px-4 pt-3 pb-8 sticky bottom-0 z-10 flex flex-col gap-2">
        {/* Save & Export — prominent, pulsing ring when not yet exported */}
        <button
          onClick={() => setExportOpen(true)}
          className={[
            'w-full h-14 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 transition-all shadow-lg',
            isExported
              ? 'bg-green-600 text-white'
              : 'bg-primary text-primary-foreground animate-[pulse-ring_2s_ease-in-out_infinite]',
          ].join(' ')}
        >
          <Share className="w-5 h-5" />
          {isExported ? 'Exported ✓' : 'Save & Export'}
        </button>

        {/* Helper text when not yet exported */}
        {!isExported && (
          <p className="text-center text-[11px] text-amber-600 font-medium">
            ⚠️ Tap above to save your scan to your device — unsaved scans may be lost.
          </p>
        )}

        {/* Add More */}
        <Button variant="outline" className="w-full h-11 rounded-full font-semibold" onClick={() => setLocation('/')}>
          <Plus className="w-4 h-4 mr-2" /> Add More Pages
        </Button>
      </div>

      {/* ── Leave-without-exporting warning dialog ── */}
      <Dialog open={leaveWarning} onOpenChange={setLeaveWarning}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <DialogTitle>Scan not exported yet</DialogTitle>
            </div>
            <DialogDescription>
              Your scan was auto-saved as a draft, but the file has not been saved to your device.
              If you delete the app, the draft will be lost.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <Button className="w-full" onClick={() => confirmLeave('export')}>
              <Share className="w-4 h-4 mr-2" /> Save & Export now
            </Button>
            <Button variant="outline" className="w-full" onClick={() => confirmLeave('draft')}>
              Keep draft, stay here
            </Button>
            <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => confirmLeave('discard')}>
              Discard and leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Export Dialog ── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save &amp; Export</DialogTitle>
            <DialogDescription>
              All processing runs on your device — no cloud server, instant speed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>File Name</Label>
              <Input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="File name" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={handleSavePDF}>
                <Download className="w-6 h-6" />
                <span className="text-sm font-semibold">Save PDF</span>
                <span className="text-[10px] text-muted-foreground">{pages.length} page{pages.length !== 1 ? 's' : ''} merged</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={handleSaveJPEG}>
                <Download className="w-6 h-6" />
                <span className="text-sm font-semibold">Save JPEG</span>
                <span className="text-[10px] text-muted-foreground">{pages.length} image{pages.length !== 1 ? 's' : ''}</span>
              </Button>
            </div>

            {pages.length > 1 && (
              <Button variant="outline" className="w-full h-12 gap-2" onClick={() => { setExportOpen(false); handleSplit(); }}>
                <Scissors className="w-4 h-4" />
                Split into {pages.length} individual PDFs
                <span className="text-[10px] text-muted-foreground ml-1">on-device</span>
              </Button>
            )}

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or share</span>
              </div>
            </div>

            <Button variant="secondary" className="w-full h-12" onClick={handleShare}>
              <Share2 className="w-5 h-5 mr-2" />
              Share via Files / AirDrop / Apps
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Opens the system share sheet — save to Files, AirDrop, email, or any installed app.
            </p>

            <Button variant="outline" className="w-full h-12" onClick={handleEmailShare}>
              <Mail className="w-5 h-5 mr-2" />
              Send by Email
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Opens your device's Mail app with the PDF attached.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
