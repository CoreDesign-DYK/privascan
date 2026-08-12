import { jsPDF } from 'jspdf';
import { type PaperSize } from '@/lib/scanner-types';

export async function generatePDF(pages: string[], paperSize: PaperSize): Promise<Blob> {
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

    const imgData = pages[i];
    
    // We need to calculate dimensions to fit the page while maintaining aspect ratio
    // Default A4 size is 210x297mm
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Actually, to get true aspect ratio, we'd need to load the image.
    // For simplicity, we'll try to fit it into the page.
    doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
  }

  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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

/**
 * Share a file via the Web Share API (iOS Files / Android share sheet).
 * Falls back to a plain browser download when the API is unavailable.
 */
export async function shareFile(blob: Blob, filename: string, mimeType: string): Promise<void> {
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
    for (const page of group.pages) {
      if (!first) doc.addPage();
      first = false;
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.addImage(page, 'JPEG', 0, 0, w, h, undefined, 'FAST');
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
