import { jsPDF } from 'jspdf';
import { type PaperSize } from '@/lib/scanner-types';
import { isNative } from '@/lib/platform';

const NATIVE_SHARE_DIRECTORY = 'privascan-shares';
const NATIVE_SHARE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function assertValidShareBlob(blob: Blob, mimeType: string): Promise<void> {
  if (blob.size === 0) {
    throw new Error('Generated file is empty.');
  }

  if (mimeType === 'application/pdf') {
    if (blob.size < 5) {
      throw new Error('Generated PDF is incomplete.');
    }
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    const signature = String.fromCharCode(...header);
    if (signature !== '%PDF-') {
      throw new Error('Generated file is not a valid PDF.');
    }
  } else if (mimeType === 'image/jpeg') {
    const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (header.length < 2 || header[0] !== 0xff || header[1] !== 0xd8) {
      throw new Error('Generated file is not a valid JPEG.');
    }
  }
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    });
    image.onerror = () => reject(new Error('Could not read a scanned page image.'));
    image.src = dataUrl;
  });
}

function containImage(
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

export async function generatePDF(pages: string[], paperSize: PaperSize): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('Cannot generate a PDF without scanned pages.');
  }

  // Rough mapping of paper sizes to jsPDF format
  // jsPDF supports: a3, a4, a5, letter, legal
  let format = 'a4';
  if (paperSize.toLowerCase().includes('letter')) format = 'letter';
  if (paperSize.toLowerCase().includes('a5')) format = 'a5';
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: format
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      doc.addPage();
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const image = await loadImageDimensions(pages[i]);
    const placement = containImage(pageWidth, pageHeight, image.width, image.height);
    doc.addImage(
      pages[i],
      'JPEG',
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      undefined,
      'NONE',
    );
  }

  const blob = doc.output('blob');
  await assertValidShareBlob(blob, 'application/pdf');
  return blob;
}

/**
 * Convert a Blob to a raw base64 string (without the data:…;base64, prefix).
 * Used by Capacitor Filesystem writeFile for binary data.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const b64 = reader.result.split(',')[1];
        resolve(b64);
      } else {
        reject(new Error('Failed to convert to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Native helpers (iOS + Android)
// ─────────────────────────────────────────────────────────────────────────────

async function downloadBlobNative(blob: Blob, filename: string): Promise<void> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { toast } = await import('sonner');
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
    });
    toast.success(`Saved: ${filename}`);
  } catch (err) {
    const { toast } = await import('sonner');
    console.error('Native download failed:', err);
    toast.error('Save failed. Please try again.');
  }
}

async function shareFileNative(blob: Blob, filename: string, mimeType: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const { toast } = await import('sonner');

  try {
    await assertValidShareBlob(blob, mimeType);
    const base64 = await blobToBase64(blob);
    if (!base64) {
      throw new Error('PDF conversion produced no data.');
    }

    try {
      const existingShares = await Filesystem.readdir({
        path: NATIVE_SHARE_DIRECTORY,
        directory: Directory.Cache,
      });
      const cutoff = Date.now() - NATIVE_SHARE_MAX_AGE_MS;
      await Promise.all(existingShares.files
        .filter((file) => file.mtime < cutoff)
        .map((file) => (
          file.type === 'directory'
            ? Filesystem.rmdir({
                path: `${NATIVE_SHARE_DIRECTORY}/${file.name}`,
                directory: Directory.Cache,
                recursive: true,
              })
            : Filesystem.deleteFile({
                path: `${NATIVE_SHARE_DIRECTORY}/${file.name}`,
                directory: Directory.Cache,
              })
        ).catch(() => undefined)));
    } catch {
      // The share directory may not exist yet.
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const sharePath = `${NATIVE_SHARE_DIRECTORY}/${Date.now()}/${safeFilename}`;
    const result = await Filesystem.writeFile({
      path: sharePath,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const writtenFile = await Filesystem.stat({
      path: sharePath,
      directory: Directory.Cache,
    });
    if (writtenFile.size !== blob.size || writtenFile.size === 0) {
      await Filesystem.deleteFile({
        path: sharePath,
        directory: Directory.Cache,
      }).catch(() => undefined);
      throw new Error(`Shared PDF write was incomplete (${writtenFile.size}/${blob.size} bytes).`);
    }

    await Share.share({
      title: filename,
      url: result.uri,
      dialogTitle: 'Share PrivaScan File',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    if (message.includes('cancel') || message.includes('dismissed')) {
      throw new DOMException('Share canceled', 'AbortError');
    }
    console.error('Native share failed:', err);
    toast.error('Share failed. Please try again.');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a file to the user's device.
 * - iOS/Android native: Capacitor Filesystem → Documents folder → success toast.
 * - Web: creates a temporary <a download> link.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (isNative()) {
    void downloadBlobNative(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share a file via the native share sheet (iOS/Android) or Web Share API.
 * Falls back to a plain browser download when neither API is available.
 */
export async function shareFile(blob: Blob, filename: string, mimeType: string): Promise<void> {
  if (isNative()) {
    return shareFileNative(blob, filename, mimeType);
  }
  const file = new File([blob], filename, { type: mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
  } else {
    downloadBlob(blob, filename);
  }
}

/**
 * Merge multiple scan page arrays into a single PDF blob.
 * Runs entirely on-device — no server required.
 */
export async function mergeToPDF(
  scanGroups: { name: string; pages: string[]; paperSize: string }[],
): Promise<Blob> {
  const firstSize = (scanGroups[0]?.paperSize ?? 'A4').toLowerCase();
  let fmt = 'a4';
  if (firstSize.includes('letter')) fmt = 'letter';
  if (firstSize.includes('a5'))     fmt = 'a5';

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: fmt });
  let first = true;

  for (const group of scanGroups) {
    const size = group.paperSize.toLowerCase();
    const groupFormat = size.includes('letter') ? 'letter' : size.includes('a5') ? 'a5' : 'a4';
    for (const page of group.pages) {
      if (!first) doc.addPage(groupFormat, 'portrait');
      first = false;
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      const image = await loadImageDimensions(page);
      const placement = containImage(w, h, image.width, image.height);
      doc.addImage(
        page,
        'JPEG',
        placement.x,
        placement.y,
        placement.width,
        placement.height,
        undefined,
        'NONE',
      );
    }
  }

  return doc.output('blob');
}

/**
 * Split a multi-page scan into individual single-page PDF blobs.
 * Returns one blob per page.
 */
export async function splitPages(
  pages: string[],
  paperSize: string,
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const page of pages) {
    const blob = await generatePDF([page], paperSize as PaperSize);
    blobs.push(blob);
  }
  return blobs;
}
