import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useScannerContext } from '@/contexts/scanner-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Share, ChevronLeft, Download, Share2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { generatePDF, downloadBlob, shareFile } from '@/lib/export';
import { useSaveScan } from '@/hooks/use-local-scans';
import { toast } from 'sonner';

export default function PreviewScreen() {
  const [, setLocation] = useLocation();
  const { pages, removePage, clearPages, settings } = useScannerContext();
  const saveScan = useSaveScan();

  const [exportOpen, setExportOpen] = useState(false);
  const [fileName, setFileName] = useState(() => `Scan_${new Date().toISOString().slice(0, 10)}`);

  const handleDiscardAll = () => {
    if (confirm('Discard all pages?')) { clearPages(); setLocation('/'); }
  };

  /** Persist the scan record to IndexedDB (device-local) */
  const persist = async (format: 'pdf' | 'jpeg') => {
    await saveScan.mutateAsync({
      name:      fileName,
      pageCount: pages.length,
      scanType:  settings.scanType,
      colorMode: settings.colorMode,
      paperSize: settings.paperSize,
      format,
      thumbnail: pages[0],
      pages:     [...pages],
    });
  };

  /* ── Save as PDF ──────────────────────────────────────────────────────────── */
  const handleSavePDF = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Generating PDF…');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      downloadBlob(blob, `${fileName}.pdf`);
      await persist('pdf');
      toast.success('PDF saved to device', { id: tid });
      setExportOpen(false);
      clearPages();
      setLocation('/gallery');
    } catch {
      toast.error('Failed to export PDF', { id: tid });
    }
  };

  /* ── Save as JPEG ─────────────────────────────────────────────────────────── */
  const handleSaveJPEG = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Saving images…');
    try {
      pages.forEach((p, i) => {
        const a = document.createElement('a');
        a.href = p;
        a.download = `${fileName}_page_${i + 1}.jpg`;
        a.click();
      });
      await persist('jpeg');
      toast.success('Images saved to device', { id: tid });
      setExportOpen(false);
      clearPages();
      setLocation('/gallery');
    } catch {
      toast.error('Failed to save images', { id: tid });
    }
  };

  /* ── Share via system sheet (iOS Files / Android share) ──────────────────── */
  const handleShare = async () => {
    if (!pages.length) return;
    const tid = toast.loading('Preparing share…');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      await shareFile(blob, `${fileName}.pdf`, 'application/pdf');
      await persist('pdf');
      toast.success('Shared!', { id: tid });
      setExportOpen(false);
      clearPages();
      setLocation('/gallery');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed', { id: tid });
      else toast.dismiss(tid);
    }
  };

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
        <Button variant="ghost" size="icon" onClick={() => setLocation('/')} className="-ml-2">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <span className="font-semibold text-lg">{pages.length} Page{pages.length !== 1 ? 's' : ''}</span>
        <Button variant="ghost" size="icon" onClick={handleDiscardAll} className="text-destructive -mr-2">
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Pages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
        {pages.map((p, i) => (
          <div key={i} className="relative group">
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
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="bg-background border-t p-4 pb-8 sticky bottom-0 z-10 flex gap-3">
        <Button variant="outline" className="flex-1 h-14 rounded-full font-semibold" onClick={() => setLocation('/')}>
          <Plus className="w-5 h-5 mr-2" /> Add More
        </Button>
        <Button className="flex-1 h-14 rounded-full font-semibold shadow-lg" onClick={() => setExportOpen(true)}>
          <Share className="w-5 h-5 mr-2" /> Save & Export
        </Button>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save & Export</DialogTitle>
            <DialogDescription>Files are saved on your device — no cloud, no server.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>File Name</Label>
              <Input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="File name" />
            </div>

            {/* Save buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-24 flex-col gap-2" onClick={handleSavePDF}>
                <Download className="w-6 h-6" />
                <span className="text-sm font-semibold">Save PDF</span>
                <span className="text-[10px] text-muted-foreground">to Downloads</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col gap-2" onClick={handleSaveJPEG}>
                <Download className="w-6 h-6" />
                <span className="text-sm font-semibold">Save JPEG</span>
                <span className="text-[10px] text-muted-foreground">to Downloads</span>
              </Button>
            </div>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or share</span>
              </div>
            </div>

            {/* Share via OS sheet */}
            <Button variant="secondary" className="w-full h-12" onClick={handleShare}>
              <Share2 className="w-5 h-5 mr-2" />
              Share via Files / AirDrop / Apps
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Opens the system share sheet — send to Files, AirDrop, email app, or any installed app.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
