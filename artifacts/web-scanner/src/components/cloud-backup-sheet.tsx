/**
 * cloud-backup-sheet.tsx
 * BYOC — Bring Your Own Cloud
 * Uses File System Access API (desktop) + Web Share API (mobile) to push
 * files into the user's own Google Drive / OneDrive / Dropbox / iCloud sync
 * folder. Zero proprietary cloud costs — the user pays their own storage provider.
 */
import { useState, useRef } from 'react';
import {
  Cloud, FolderOpen, Share2, CheckCircle2,
  HardDrive, ChevronRight, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetDescription,
  SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { generatePDF } from '@/lib/export';
import { type LocalScan } from '@/hooks/use-local-scans';

// ── Cloud provider metadata ────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'gdrive',
    name: 'Google Drive',
    color: '#4285F4',
    hint: 'Pick your Google Drive sync folder',
    folderHint: 'Google Drive',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    color: '#0078D4',
    hint: 'Pick your OneDrive sync folder',
    folderHint: 'OneDrive',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    color: '#0061FF',
    hint: 'Pick your Dropbox sync folder',
    folderHint: 'Dropbox',
  },
  {
    id: 'icloud',
    name: 'iCloud Drive',
    color: '#3B82F6',
    hint: 'Use Share → Save to Files on iOS',
    folderHint: 'iCloud Drive',
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]['id'];

interface CloudBackupSheetProps {
  scan: LocalScan;
}

export function CloudBackupSheet({ scan }: CloudBackupSheetProps) {
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<ProviderId | null>(null);

  const supportsFilePicker =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  /** Desktop: pick a folder (e.g. the Dropbox/GDrive sync folder) then write the PDF */
  const handleFolderPick = async (providerId: ProviderId) => {
    if (!supportsFilePicker) {
      // Mobile: fall through to share sheet
      handleMobileShare(providerId);
      return;
    }
    try {
      setActiveProvider(providerId);
      setUploading(true);
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDirHandle(handle);

      const blob = await generatePDF(scan.pages, scan.paperSize as any);
      const fileName = `${scan.name}.pdf`;
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      setDone(providerId);
      toast.success(`Saved to ${handle.name}/`);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Save failed');
    } finally {
      setUploading(false);
      setActiveProvider(null);
    }
  };

  /** Mobile / fallback: open OS share sheet, user picks cloud app */
  const handleMobileShare = async (providerId: ProviderId) => {
    try {
      setUploading(true);
      setActiveProvider(providerId);
      const blob = await generatePDF(scan.pages, scan.paperSize as any);
      const file = new File([blob], `${scan.name}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: scan.name });
        setDone(providerId);
        toast.success('Shared to cloud!');
      } else {
        // Absolute fallback: trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${scan.name}.pdf`; a.click();
        URL.revokeObjectURL(url);
        toast.success('Downloaded — move to your cloud folder');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Upload failed');
    } finally {
      setUploading(false);
      setActiveProvider(null);
    }
  };

  const handleProvider = (id: ProviderId) => {
    if (id === 'icloud') {
      handleMobileShare(id);
    } else {
      supportsFilePicker ? handleFolderPick(id) : handleMobileShare(id);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Cloud className="w-4 h-4" /> Backup to Cloud
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" /> BYOC — Bring Your Own Cloud
          </SheetTitle>
          <SheetDescription>
            Save directly to <strong>your own</strong> cloud storage. DocScan never touches your data.
          </SheetDescription>
        </SheetHeader>

        {/* How it works banner */}
        <div className="my-4 bg-primary/5 rounded-xl p-4 text-sm space-y-1.5 border border-primary/10">
          <p className="font-semibold text-primary">How it works</p>
          {supportsFilePicker ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Click a provider → pick your local sync folder (e.g. <em>~/Google Drive/</em>) →
              DocScan writes the PDF there. Your sync client uploads it automatically.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Tap a provider → your device's share sheet opens → choose the cloud app to save directly.
              No intermediate server — your file goes straight to your account.
            </p>
          )}
        </div>

        {/* Provider buttons */}
        <div className="space-y-2 pb-6">
          {PROVIDERS.map(p => {
            const isDone    = done === p.id;
            const isLoading = uploading && activeProvider === p.id;
            return (
              <button
                key={p.id}
                disabled={uploading}
                onClick={() => handleProvider(p.id)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all',
                  'hover:border-primary/40 hover:bg-secondary/60 active:scale-[0.98]',
                  isDone && 'border-green-400 bg-green-50',
                  isLoading && 'opacity-70 cursor-wait',
                )}
              >
                {/* Color dot */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
                  style={{ background: p.color }}
                >
                  {p.name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.hint}</p>
                </div>

                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : isLoading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Zero-cost note */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground pb-4 px-1">
          <HardDrive className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            DocScan has no cloud server. All processing runs on your device.
            Your cloud provider's free tier (15 GB Google / 5 GB OneDrive / 2 GB Dropbox) is usually more than enough.
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
