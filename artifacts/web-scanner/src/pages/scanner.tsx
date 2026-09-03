/**
 * scanner.tsx — Dark camera UI with premium design
 *
 * D: Dark background (#0d0d14)
 * A: Animated corner bracket viewfinder
 * B: Scan line sweep on capture
 * E: Glassmorphism bottom bar
 * F: iOS-style capture button
 * H: DocScan brand wordmark in header
 * I: Sliding mode toggle pill
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Zap, ZapOff, ChevronRight, Smartphone, Edit2, ScanLine, House, Camera, Crop, RotateCw, Type, Trash2, Check, X as XIcon } from 'lucide-react';
import { useCamera } from '@/hooks/use-camera';
import { useScannerContext } from '@/contexts/scanner-context';
import { SettingsSheet } from '@/components/settings-sheet';
import { HomePopup } from '@/components/home-popup';
import { GallerySheet } from '@/components/gallery-sheet';
import { useLocalScans } from '@/hooks/use-local-scans';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { detectDocumentCorners, detectCornersFromCanvas } from '@/lib/edge-detection';
import { detectBookFromCanvas, type BookDetection } from '@/lib/book-detection';
import {
  detectPresentationCorners,
  detectPresentationFromCanvas,
  presentationOutputSize,
} from '@/lib/presentation-detection';
import { estimateOutputSize, type Point, warpBookPage, warpPerspective } from '@/lib/perspective';
import {
  type ScannerSettings,
  type ScanMode,
  DPI_PRESETS,
  MIN_SCAN_DPI,
  MAX_SCAN_DPI,
  SCAN_JPEG_QUALITY,
  MOBILE_SCAN_JPEG_QUALITY,
  clampScanDpi,
  estimateEffectiveDpi,
  fitSourceWithinOutput,
  getPaperPixelSize,
} from '@/lib/scanner-types';
import { enhanceDocumentCanvas } from '@/lib/filters';
import { isNative as isNativePlatform } from '@/lib/platform';
import { hasRequiredSharpness } from '@/lib/scan-quality';
import { playSuccessfulCaptureSound } from '@/lib/capture-feedback';
import {
  detectIdCardFromCanvas,
  isLikelyIdCardQuad,
  refineIdCardCornersFromCanvas,
  type IdCardDetection,
} from '@/lib/id-card-detection';
import fileBoxIcon from '@/assets/file-box-icon.png';

// Wait between completed detector passes instead of running on a fixed
// interval. On WKWebView this leaves the main thread available for touch input.
const EDGE_INTERVAL_MS = 250;
const STABLE_TARGET = 10;
const TRACK_BLEND = 0.58;
const MAX_TRACK_JUMP = 0.08;
const JUMP_CONFIRM_FRAMES = 2;
const JUMP_BLEND = 0.78;
const INITIAL_TRACK_CONFIRM_FRAMES = 2;
const MAX_MISSED_EDGE_FRAMES = 6;
const MAX_MOBILE_CAPTURE_PIXELS = 10_500_000;
const BOOK_FOLD_STABLE_DISTANCE = 0.025;
const BOOK_FOLD_CONFIRM_FRAMES = 3;
const ID_CARD_WIDTH_MM = 85.6;
const ID_CARD_HEIGHT_MM = 54;

function outputJpegQuality(enhanceForMobile: boolean): number {
  return enhanceForMobile ? MOBILE_SCAN_JPEG_QUALITY : SCAN_JPEG_QUALITY;
}

function documentOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  settings: ScannerSettings,
  maxPixels = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const target = getPaperPixelSize(
    settings.paperSize,
    settings.targetDpi,
    sourceWidth > sourceHeight ? 'landscape' : 'portrait',
  );
  return fitSourceWithinOutput(
    sourceWidth,
    sourceHeight,
    target.width,
    target.height,
    maxPixels,
  );
}

function idCardOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  dpi: number,
  maxPixels = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const requestedDpi = clampScanDpi(dpi);
  const targetWidth = Math.round(ID_CARD_WIDTH_MM / 25.4 * requestedDpi);
  const targetHeight = Math.round(ID_CARD_HEIGHT_MM / 25.4 * requestedDpi);
  return fitSourceWithinOutput(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    maxPixels,
  );
}

function scaleQuad(
  corners: [Point, Point, Point, Point],
  scaleX: number,
  scaleY: number,
): [Point, Point, Point, Point] {
  return corners.map(point => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  })) as [Point, Point, Point, Point];
}

function guideQuadForCanvas(
  root: HTMLDivElement | null,
  guide: HTMLDivElement | null,
  sourceWidth: number,
  sourceHeight: number,
): [Point, Point, Point, Point] | null {
  if (!root || !guide || !sourceWidth || !sourceHeight) return null;
  const rootRect = root.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();
  if (!rootRect.width || !rootRect.height) return null;

  const scale = Math.max(rootRect.width / sourceWidth, rootRect.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const cropX = (renderedWidth - rootRect.width) / 2;
  const cropY = (renderedHeight - rootRect.height) / 2;
  const toSource = (x: number, y: number): Point => ({
    x: Math.max(0, Math.min(sourceWidth, (x - rootRect.left + cropX) / scale)),
    y: Math.max(0, Math.min(sourceHeight, (y - rootRect.top + cropY) / scale)),
  });

  return [
    toSource(guideRect.left, guideRect.top),
    toSource(guideRect.right, guideRect.top),
    toSource(guideRect.right, guideRect.bottom),
    toSource(guideRect.left, guideRect.bottom),
  ];
}

function detectIdCardForCapture(
  source: HTMLCanvasElement,
  guide: [Point, Point, Point, Point],
): IdCardDetection | null {
  const candidate = detectIdCardFromCanvas(source, guide);
  if (!candidate || candidate.confidence < 0.58) return null;
  const refined = refineIdCardCornersFromCanvas(source, candidate);
  return refined && refined.confidence >= 0.58 ? refined : null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Mock page generator                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function generateMockPage(pageNum: number, settings: ScannerSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d')!;

  const bg  = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#fafaf8';
  const ink = settings.colorMode === 'greyscale' ? '#222'    : '#1a1a2e';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = settings.colorMode === 'greyscale' ? '#ddd' : '#e8e4dc';
  ctx.lineWidth = 1;
  for (let y = 80; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(canvas.width - 60, y); ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('Sample Document', 80, 120);
  ctx.font = '32px sans-serif'; ctx.fillStyle = '#666';
  ctx.fillText(`Page ${pageNum}  ·  ${settings.paperSize}  ·  ${settings.scanType}`, 80, 175);
  ctx.fillStyle = ink; ctx.font = '28px sans-serif';
  [
    'Lorem ipsum dolor sit amet, consectetur adipiscing',
    'elit. Sed do eiusmod tempor incididunt ut labore et',
    'dolore magna aliqua. Ut enim ad minim veniam.',
    '',
    'Quis nostrud exercitation ullamco laboris nisi ut',
    'aliquip ex ea commodo consequat. Duis aute irure',
    'dolor in reprehenderit in voluptate velit esse.',
  ].forEach((line, i) => ctx.fillText(line, 80, 240 + i * 46));

  return canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
}

function createDocumentPage(
  source: HTMLCanvasElement,
  corners: [Point, Point, Point, Point] | null,
  settings: ScannerSettings,
  enhanceForMobile = false,
): string | null {
  // Never silently save the complete camera frame as a document. A false
  // positive is preferable to a result that visibly contains the desk.
  if (!corners) return null;

  const { w, h } = estimateOutputSize(corners);
  const outputSize = documentOutputSize(
    w,
    h,
    settings,
    enhanceForMobile ? MAX_MOBILE_CAPTURE_PIXELS : Number.POSITIVE_INFINITY,
  );
  const warped = warpPerspective(
    source,
    corners,
    outputSize.width,
    outputSize.height,
    enhanceForMobile ? { maxCpuPixels: MAX_MOBILE_CAPTURE_PIXELS } : undefined,
  );
  if (!hasRequiredSharpness(warped)) return null;
  const output = enhanceForMobile ? enhanceDocumentCanvas(warped) : warped;
  console.info('[PrivaScan] document output', {
    source: `${source.width}x${source.height}`,
    crop: `${w}x${h}`,
    output: `${output.width}x${output.height}`,
    requestedDpi: settings.targetDpi,
    effectiveDpi: estimateEffectiveDpi(output.width, output.height, settings.paperSize),
  });
  return output.toDataURL('image/jpeg', outputJpegQuality(enhanceForMobile));
}

function createPresentationPage(
  source: HTMLCanvasElement,
  corners: [Point, Point, Point, Point] | null,
  settings: ScannerSettings,
  enhanceForMobile = false,
  maxPixels = enhanceForMobile ? MAX_MOBILE_CAPTURE_PIXELS : Number.POSITIVE_INFINITY,
): string | null {
  if (!corners) return null;
  const target = getPaperPixelSize(settings.paperSize, settings.targetDpi, 'landscape');
  const outputSize = presentationOutputSize(corners, target.width, maxPixels);
  const warped = warpPerspective(
    source,
    corners,
    outputSize.width,
    outputSize.height,
    {
      maxCpuPixels: Number.isFinite(maxPixels)
        ? maxPixels
        : outputSize.width * outputSize.height,
    },
  );
  if (!hasRequiredSharpness(warped)) return null;
  const output = enhanceForMobile ? enhanceDocumentCanvas(warped) : warped;
  console.info('[PrivaScan] presentation output', {
    source: `${source.width}x${source.height}`,
    output: `${output.width}x${output.height}`,
    requestedDpi: settings.targetDpi,
    aspectRatio: Number((output.width / output.height).toFixed(3)),
  });
  return output.toDataURL('image/jpeg', outputJpegQuality(enhanceForMobile));
}

function createIdCardPage(
  source: HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  settings: ScannerSettings,
  enhanceForMobile = false,
  maxPixels = enhanceForMobile ? MAX_MOBILE_CAPTURE_PIXELS : Number.POSITIVE_INFINITY,
): string | null {
  if (!isLikelyIdCardQuad(corners)) return null;
  const measured = estimateOutputSize(corners);
  const outputSize = idCardOutputSize(
    measured.w,
    measured.h,
    settings.targetDpi,
    maxPixels,
  );
  const warped = warpPerspective(
    source,
    corners,
    outputSize.width,
    outputSize.height,
    {
      maxCpuPixels: Number.isFinite(maxPixels)
        ? maxPixels
        : outputSize.width * outputSize.height,
    },
  );
  if (!hasRequiredSharpness(warped)) return null;
  const output = enhanceForMobile ? enhanceDocumentCanvas(warped) : warped;
  return output.toDataURL('image/jpeg', outputJpegQuality(enhanceForMobile));
}

async function combineIdCardPages(
  frontDataUrl: string,
  backDataUrl: string,
  jpegQuality: number,
): Promise<string> {
  const load = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const [front, back] = await Promise.all([load(frontDataUrl), load(backDataUrl)]);
  const cardWidth = Math.max(front.naturalWidth, back.naturalWidth);
  const cardHeight = Math.max(front.naturalHeight, back.naturalHeight);
  const margin = Math.max(24, Math.round(cardWidth * 0.09));
  const gap = Math.max(20, Math.round(cardHeight * 0.12));
  const composite = document.createElement('canvas');
  composite.width = cardWidth + margin * 2;
  composite.height = cardHeight * 2 + gap + margin * 2;
  const context = composite.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, composite.width, composite.height);
  context.drawImage(
    front,
    margin + (cardWidth - front.naturalWidth) / 2,
    margin,
  );
  context.drawImage(
    back,
    margin + (cardWidth - back.naturalWidth) / 2,
    margin + cardHeight + gap,
  );
  return composite.toDataURL('image/jpeg', jpegQuality);
}

function captureVideoFrame(
  video: HTMLVideoElement,
  greyscale: boolean,
  maxPixels = Number.POSITIVE_INFINITY,
): HTMLCanvasElement {
  const sourcePixels = video.videoWidth * video.videoHeight;
  const scale = sourcePixels > maxPixels ? Math.sqrt(maxPixels / sourcePixels) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext('2d')!;
  if (greyscale) ctx.filter = 'grayscale(100%)';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  return canvas;
}

async function captureBestCameraFrame(
  video: HTMLVideoElement,
  greyscale: boolean,
): Promise<HTMLCanvasElement> {
  if (isNativePlatform()) {
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    const ImageCaptureConstructor = (
      window as Window & {
        ImageCapture?: new (track: MediaStreamTrack) => {
          takePhoto(): Promise<Blob>;
        };
      }
    ).ImageCapture;
    if (track && ImageCaptureConstructor) {
      try {
        const photo = await new ImageCaptureConstructor(track).takePhoto();
        const bitmap = await createImageBitmap(photo);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        if (greyscale) context.filter = 'grayscale(100%)';
        context.drawImage(bitmap, 0, 0);
        context.filter = 'none';
        bitmap.close();
        console.info('[PrivaScan] high-resolution still capture', {
          width: canvas.width,
          height: canvas.height,
        });
        return canvas;
      } catch (error) {
        console.warn('[PrivaScan] still capture unavailable; using video frame', error);
      }
    }
  }
  return captureVideoFrame(video, greyscale);
}

function createBookPageDataUrls(
  source: HTMLCanvasElement,
  detection: BookDetection,
  settings: ScannerSettings,
  enhanceForMobile: boolean,
  maxPixels = enhanceForMobile ? MAX_MOBILE_CAPTURE_PIXELS : Number.POSITIVE_INFINITY,
): [string, string] | null {
  if (detection.foldConfidence < 0.22) return null;

  const targetPage = getPaperPixelSize(
    settings.paperSize,
    settings.targetDpi,
    'portrait',
  );
  const outputQuality = outputJpegQuality(enhanceForMobile);
  const pageWidth = (side: 'left' | 'right') => {
    const corners = side === 'left' ? detection.left : detection.right;
    const top = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const bottom = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
    return (top + bottom) / 2;
  };
  const pages = [
    { side: 'left' as const, corners: detection.left },
    { side: 'right' as const, corners: detection.right },
  ];
  const dataUrls: string[] = [];

  for (const page of pages) {
    // Exclude only the narrow binding shadow. Keeping the inset proportional
    // to each detected page avoids clipping text on small books.
    const foldInset = Math.max(2, Math.min(source.width * 0.012, pageWidth(page.side) * 0.025));
    const insetFoldCurve = offsetFoldCurveTowardPage(
      detection.foldCurve,
      page.corners,
      page.side,
      foldInset,
    );
    const insetCorners = page.corners.map(point => ({ ...point })) as [Point, Point, Point, Point];
    if (page.side === 'left') {
      insetCorners[1] = insetFoldCurve[0];
      insetCorners[2] = insetFoldCurve[insetFoldCurve.length - 1];
    } else {
      insetCorners[0] = insetFoldCurve[0];
      insetCorners[3] = insetFoldCurve[insetFoldCurve.length - 1];
    }

    const { w, h } = estimateOutputSize(insetCorners);
    const outputSize = fitSourceWithinOutput(
      w,
      h,
      targetPage.width,
      targetPage.height,
      maxPixels,
    );
    const warped = warpBookPage(
      source,
      {
        corners: insetCorners,
        foldCurve: insetFoldCurve,
        side: page.side,
      },
      outputSize.width,
      outputSize.height,
      Number.isFinite(maxPixels) ? { maxCpuPixels: maxPixels } : undefined,
    );
    if (!hasRequiredSharpness(warped)) return null;
    const output = enhanceForMobile ? enhanceDocumentCanvas(warped) : warped;
    dataUrls.push(output.toDataURL('image/jpeg', outputQuality));
    console.info('[PrivaScan] book page output', {
      side: page.side,
      source: `${source.width}x${source.height}`,
      crop: `${w}x${h}`,
      output: `${output.width}x${output.height}`,
      requestedDpi: settings.targetDpi,
      effectiveDpi: estimateEffectiveDpi(output.width, output.height, settings.paperSize),
      foldConfidence: Number(detection.foldConfidence.toFixed(3)),
    });
  }

  return dataUrls.length === 2 ? [dataUrls[0], dataUrls[1]] : null;
}

function offsetFoldCurveTowardPage(
  curve: Point[],
  corners: [Point, Point, Point, Point],
  side: 'left' | 'right',
  distance: number,
): Point[] {
  if (curve.length < 2) return curve;
  return curve.map((point, index) => {
    const previous = curve[Math.max(0, index - 1)];
    const next = curve[Math.min(curve.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const tangentLength = Math.max(1e-6, Math.hypot(tangentX, tangentY));
    let normalX = -tangentY / tangentLength;
    let normalY = tangentX / tangentLength;
    const t = curve.length === 1 ? 0 : index / (curve.length - 1);
    const outsideTop = side === 'left' ? corners[0] : corners[1];
    const outsideBottom = side === 'left' ? corners[3] : corners[2];
    const outside = {
      x: outsideTop.x + (outsideBottom.x - outsideTop.x) * t,
      y: outsideTop.y + (outsideBottom.y - outsideTop.y) * t,
    };
    if (normalX * (outside.x - point.x) + normalY * (outside.y - point.y) < 0) {
      normalX *= -1;
      normalY *= -1;
    }
    return {
      x: point.x + normalX * distance,
      y: point.y + normalY * distance,
    };
  });
}

function scaleBookDetection(
  detection: BookDetection,
  scaleX: number,
  scaleY: number,
): BookDetection {
  const scalePoint = (point: Point): Point => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  });
  const scaleQuad = (
    quad: [Point, Point, Point, Point],
  ): [Point, Point, Point, Point] => quad.map(scalePoint) as [Point, Point, Point, Point];
  return {
    outer: scaleQuad(detection.outer),
    left: scaleQuad(detection.left),
    right: scaleQuad(detection.right),
    foldCurve: detection.foldCurve.map(scalePoint),
    foldConfidence: detection.foldConfidence,
  };
}

function bookFoldDistance(
  previous: BookDetection,
  next: BookDetection,
  frameWidth: number,
  frameHeight: number,
): number {
  const count = Math.min(previous.foldCurve.length, next.foldCurve.length);
  if (!count) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < count; index++) {
    const previousIndex = Math.round(index / Math.max(1, count - 1) * (previous.foldCurve.length - 1));
    const nextIndex = Math.round(index / Math.max(1, count - 1) * (next.foldCurve.length - 1));
    total += Math.hypot(
      previous.foldCurve[previousIndex].x - next.foldCurve[nextIndex].x,
      previous.foldCurve[previousIndex].y - next.foldCurve[nextIndex].y,
    );
  }
  return total / count / Math.hypot(frameWidth, frameHeight);
}

function documentMoved(
  previous: [Point, Point, Point, Point],
  next: [Point, Point, Point, Point],
  frameWidth: number,
  frameHeight: number,
): boolean {
  const averageDistance = previous.reduce(
    (sum, point, index) => sum + Math.hypot(point.x - next[index].x, point.y - next[index].y),
    0,
  ) / previous.length;
  return averageDistance > Math.hypot(frameWidth, frameHeight) * 0.035;
}

function cornerDistance(
  first: [Point, Point, Point, Point],
  second: [Point, Point, Point, Point],
  frameWidth: number,
  frameHeight: number,
): number {
  const average = first.reduce(
    (sum, point, index) => sum + Math.hypot(point.x - second[index].x, point.y - second[index].y),
    0,
  ) / first.length;
  return average / Math.hypot(frameWidth, frameHeight);
}

function blendCorners(
  previous: [Point, Point, Point, Point],
  next: [Point, Point, Point, Point],
  amount: number,
): [Point, Point, Point, Point] {
  return previous.map((point, index) => ({
    x: point.x + (next[index].x - point.x) * amount,
    y: point.y + (next[index].y - point.y) * amount,
  })) as [Point, Point, Point, Point];
}

/* ── Mock generators for special scan modes ───────────────────────────────── */
function generateMockBookHalf(side: 'left' | 'right', pageNum: number, settings: ScannerSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = 877; canvas.height = 1240; // 0.707 ratio
  const ctx = canvas.getContext('2d')!;
  const bg  = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#fafaf8';
  const ink = settings.colorMode === 'greyscale' ? '#222' : '#1a1a2e';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink; ctx.font = 'bold 42px sans-serif';
  ctx.fillText(`${side === 'left' ? '← Left' : 'Right →'} — Page ${pageNum}`, 60, 110);
  ctx.font = '26px sans-serif'; ctx.fillStyle = '#888';
  ctx.fillText('Book Scan · Binding Corrected', 60, 160);
  ctx.fillStyle = ink;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(60, 220 + i * 64, (canvas.width - 120) * (0.55 + (i % 3) * 0.15), 18);
  }
  return canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
}

function generateMockPresentation(pageNum: number, settings: ScannerSettings): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = settings.colorMode === 'greyscale' ? '#f0f0f0' : '#1e3a5f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = settings.colorMode === 'greyscale' ? '#222' : '#ffffff';
  ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Slide ${pageNum}`, canvas.width / 2, canvas.height / 2 - 40);
  ctx.font = '42px sans-serif'; ctx.globalAlpha = 0.55;
  ctx.fillText('Presentation · Perspective Corrected', canvas.width / 2, canvas.height / 2 + 60);
  ctx.globalAlpha = 1;
  return canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
}

function generateMockIdComposite(settings: ScannerSettings): string {
  const cw = 1004, ch = 633; // ≈ 85.6×54 mm at 300 dpi equivalent
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch * 2 + 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, cw, canvas.height);
  const colors = settings.colorMode === 'greyscale'
    ? ['#bbbbbb', '#999999']
    : ['#1e3a5f', '#2d5486'];
  [0, 1].forEach(i => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(0, i * (ch + 24), cw, ch);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? 'FRONT' : 'BACK', cw / 2, i * (ch + 24) + ch / 2 + 22);
  });
  return canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Progress ring geometry                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
const RING_R    = 39;
const RING_CIRC = 2 * Math.PI * RING_R;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Corner bracket component (A)                                                */
/* ─────────────────────────────────────────────────────────────────────────── */
function CornerBrackets({ color }: { color: string }) {
  const SIZE = 32;
  const THICK = 3;

  const corners = [
    { top: 0, left: 0,  borderTop: THICK, borderLeft: THICK,  borderRight: 0, borderBottom: 0, borderRadius: '4px 0 0 0' },
    { top: 0, right: 0, borderTop: THICK, borderRight: THICK, borderLeft: 0,  borderBottom: 0, borderRadius: '0 4px 0 0' },
    { bottom: 0, left: 0,  borderBottom: THICK, borderLeft: THICK,  borderTop: 0, borderRight: 0,  borderRadius: '0 0 0 4px' },
    { bottom: 0, right: 0, borderBottom: THICK, borderRight: THICK, borderTop: 0, borderLeft: 0,   borderRadius: '0 0 4px 0' },
  ];

  return (
    <>
      {corners.map((c, i) => (
        <div
          key={i}
          className="absolute animate-bracket"
          style={{
            width: SIZE, height: SIZE,
            top: c.top, left: (c as any).left, right: (c as any).right, bottom: (c as any).bottom,
            borderStyle: 'solid',
            borderColor: color,
            borderTopWidth: c.borderTop ?? 0,
            borderLeftWidth: c.borderLeft ?? 0,
            borderRightWidth: c.borderRight ?? 0,
            borderBottomWidth: c.borderBottom ?? 0,
            borderRadius: c.borderRadius,
            animationDelay: `${i * 40}ms`,
            transition: 'border-color 0.35s ease',
          }}
        />
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Quality gauge SVG icon                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function QualityGaugeIcon({ dpi }: { dpi: number }) {
  const cx = 20, cy = 21, rO = 17, rI = 10;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number, r: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy - r * Math.sin(toRad(deg)),
  });
  const f = (n: number) => n.toFixed(2);

  // Arc path for a donut segment from a1→a2 (angles in standard-math convention)
  const arcPath = (a1: number, a2: number) => {
    const { x: ox1, y: oy1 } = pt(a1, rO);
    const { x: ox2, y: oy2 } = pt(a2, rO);
    const { x: ix2, y: iy2 } = pt(a2, rI);
    const { x: ix1, y: iy1 } = pt(a1, rI);
    // sweep-flag=0 outer (counterclockwise in SVG = right-to-left along top)
    // sweep-flag=1 inner (clockwise in SVG = back left-to-right)
    return `M${f(ox1)},${f(oy1)} A${rO},${rO},0,0,0,${f(ox2)},${f(oy2)} L${f(ix2)},${f(iy2)} A${rI},${rI},0,0,1,${f(ix1)},${f(iy1)}Z`;
  };

  const SEGS = [
    { a1: 177, a2: 151, fill: '#bae6fd' },
    { a1: 149, a2: 123, fill: '#7dd3fc' },
    { a1: 121, a2: 95,  fill: '#38bdf8' },
    { a1: 93,  a2: 67,  fill: '#0ea5e9' },
    { a1: 65,  a2: 39,  fill: '#0284c7' },
    { a1: 37,  a2: 11,  fill: '#0369a1' },
  ];

  const normalizedDpi = (clampScanDpi(dpi) - MIN_SCAN_DPI) / (MAX_SCAN_DPI - MIN_SCAN_DPI);
  const activeCount = Math.max(1, Math.min(6, Math.round(normalizedDpi * 5) + 1));
  const needleAngle = 164 - normalizedDpi * 140;
  const tip = pt(needleAngle, rO - 2);

  return (
    <svg width="36" height="20" viewBox="2 3 36 19">
      {SEGS.map((s, i) => (
        <path
          key={i}
          d={arcPath(s.a1, s.a2)}
          fill={i < activeCount ? s.fill : 'rgba(255,255,255,0.18)'}
        />
      ))}
      {/* Needle */}
      <line
        x1={cx} y1={cy} x2={f(tip.x)} y2={f(tip.y)}
        stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"
      />
      <circle cx={cx} cy={cy} r="1.8" fill="white" opacity="0.85" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Component                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function ScannerScreen() {
  const [, setLocation] = useLocation();
  const {
    videoRef, startCamera, stopCamera, hasPermission, isMockMode, focusReady, requestFocus,
  } = useCamera();
  const {
    mode, setMode, pages, addPage, removePage, clearPages, settings, setSettings,
    setActivePageIndex, setPendingPage, setPendingEditMode, setDetectedCorners,
  } = useScannerContext();

  const canvasRef            = useRef<HTMLCanvasElement>(null);
  const [isCapturing,    setIsCapturing]    = useState(false);
  const [showScanLine,   setShowScanLine]   = useState(false);   // B
  const [edgeCorners,    setEdgeCorners]    = useState<[Point, Point, Point, Point] | null>(null);
  const [edgeIsLive,     setEdgeIsLive]     = useState(false);
  const [bookDetection,  setBookDetection]  = useState<BookDetection | null>(null);
  const [idCardDetection, setIdCardDetection] = useState<IdCardDetection | null>(null);
  const [idCardReady, setIdCardReady] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [capturedLabel,  setCapturedLabel]  = useState<number | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedThumb,  setSelectedThumb]  = useState(-1);

  type FlashMode = 'off' | 'on' | 'auto';
  const [flashMode,   setFlashMode]   = useState<FlashMode>('auto');
  const [flashOpen,   setFlashOpen]   = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [dpiInput,    setDpiInput]    = useState(String(settings.targetDpi));

  const [scanMode,    setScanMode]    = useState<ScanMode>('document');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [homeOpen,    setHomeOpen]    = useState(false);

  // ── Text tool state ────────────────────────────────────────────────────────
  const [textPanelOpen,  setTextPanelOpen]  = useState(false);
  const [textInput,      setTextInput]      = useState('');
  const [textSize,       setTextSize]       = useState<'S' | 'M' | 'L'>('M');
  const [textColor,      setTextColor]      = useState<'white' | 'black' | 'blue'>('black');
  const [textApplying,   setTextApplying]   = useState(false);

  const { data: localScans = [] } = useLocalScans();
  const [idStage,  setIdStage]  = useState<'front' | 'back'>('front');
  const idFrontRef = useRef<string | null>(null);
  const idGuideRef = useRef<HTMLDivElement>(null);
  const scannerRootRef = useRef<HTMLDivElement>(null);

  const lastThumbRef     = useRef<HTMLButtonElement>(null);
  const modeRef          = useRef(mode);
  const pagesLenRef      = useRef(pages.length);
  const settingsRef      = useRef(settings);
  const edgeTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableFrames     = useRef(0);
  const trackedCornersRef = useRef<[Point, Point, Point, Point] | null>(null);
  const pendingCornersRef = useRef<[Point, Point, Point, Point] | null>(null);
  const pendingCornerFrames = useRef(0);
  const missedEdgeFrames = useRef(0);
  const trackConfirmFrames = useRef(0);
  const previousBookDetectionRef = useRef<BookDetection | null>(null);
  const stableBookFoldFrames = useRef(0);
  const waitingClear     = useRef(false);        // true = waiting for doc to leave frame
  const rejectedCornersRef = useRef<[Point, Point, Point, Point] | null>(null);
  const rejectedBookDetectionRef = useRef<BookDetection | null>(null);
  const needsClearerCaptureRef = useRef(false);
  const [isWaitingClear, setIsWaitingClear] = useState(false);
  const [needsClearerCapture, setNeedsClearerCapture] = useState(false);
  const captureAutoRef   = useRef<() => void>(() => {});
  const captureBookAutoRef = useRef<() => void>(() => {});
  const capturePresentationAutoRef = useRef<() => void>(() => {});
  const captureIdAutoRef = useRef<() => void>(() => {});
  const scanModeRef      = useRef<ScanMode>('document');

  useEffect(() => { modeRef.current      = mode;     }, [mode]);
  useEffect(() => { pagesLenRef.current  = pages.length; }, [pages.length]);
  useEffect(() => { settingsRef.current  = settings; }, [settings]);
  useEffect(() => { scanModeRef.current  = scanMode; }, [scanMode]);
  useEffect(() => { setDpiInput(String(settings.targetDpi)); }, [settings.targetDpi]);
  // Reset ID card stage when switching scan modes
  useEffect(() => { setIdStage('front'); idFrontRef.current = null; }, [scanMode]);

  const applyTargetDpi = useCallback((value: number) => {
    const dpi = clampScanDpi(value);
    setSettings({ targetDpi: dpi });
    setDpiInput(String(dpi));
  }, [setSettings]);

  const commitDpiInput = useCallback(() => {
    const parsed = Number(dpiInput);
    applyTargetDpi(Number.isFinite(parsed) ? parsed : settings.targetDpi);
  }, [applyTargetDpi, dpiInput, settings.targetDpi]);

  // Apply torch / flash to camera track when flashMode changes
  useEffect(() => {
    if (!videoRef.current) return;
    const stream = videoRef.current.srcObject as MediaStream | null;
    const track  = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      track.applyConstraints({ advanced: [{ torch: flashMode === 'on' } as any] });
    } catch { /* torch not supported on this device — silently ignore */ }
  }, [flashMode, videoRef]);

  // Auto-select & scroll to newest thumbnail
  useEffect(() => {
    if (pages.length === 0) { setSelectedThumb(-1); return; }
    setSelectedThumb(pages.length - 1);
    setTimeout(() => {
      lastThumbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
    }, 60);
  }, [pages.length]);

  // Reset stability when switching modes
  useEffect(() => {
    stableFrames.current = 0;
    waitingClear.current = false;
    setIsWaitingClear(false);
    setNeedsClearerCapture(false);
    needsClearerCaptureRef.current = false;
    rejectedCornersRef.current = null;
    rejectedBookDetectionRef.current = null;
    setStableProgress(0);
    setEdgeCorners(null);
    setEdgeIsLive(false);
    setBookDetection(null);
    setIdCardDetection(null);
    setIdCardReady(false);
    trackedCornersRef.current = null;
    pendingCornersRef.current = null;
    pendingCornerFrames.current = 0;
    missedEdgeFrames.current = 0;
    trackConfirmFrames.current = 0;
    previousBookDetectionRef.current = null;
    stableBookFoldFrames.current = 0;
  }, [mode, scanMode]);

  // A newly focused stream can resolve edge details differently. Start its
  // hold-steady count fresh instead of inheriting an earlier camera frame.
  useEffect(() => {
    stableFrames.current = 0;
    trackedCornersRef.current = null;
    pendingCornersRef.current = null;
    pendingCornerFrames.current = 0;
    missedEdgeFrames.current = 0;
    trackConfirmFrames.current = 0;
    previousBookDetectionRef.current = null;
    stableBookFoldFrames.current = 0;
    setStableProgress(0);
    setEdgeCorners(null);
    setEdgeIsLive(false);
    setBookDetection(null);
    setIdCardDetection(null);
    setIdCardReady(false);
  }, [focusReady]);

  /* ── Camera lifecycle ───────────────────────────────────────────────────── */
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  /* ── Flash + scan line helper ───────────────────────────────────────────── */
  const triggerCaptureEffects = useCallback(() => {
    setIsCapturing(true);
    setShowScanLine(true);
    setTimeout(() => setIsCapturing(false), 180);
    setTimeout(() => setShowScanLine(false), 520);
  }, []);

  /* ── Auto-capture ───────────────────────────────────────────────────────── */
  const autoCaptureFrame = useCallback(async () => {
    if (!isMockMode && !focusReady) return;
    if (scanModeRef.current === 'book') {
      captureBookAutoRef.current();
      return;
    }
    if (scanModeRef.current === 'presentation') {
      capturePresentationAutoRef.current();
      return;
    }
    if (scanModeRef.current === 'id-cards') {
      captureIdAutoRef.current();
      return;
    }
    const pageNum = pagesLenRef.current + 1;
    let captured = false;
    let rejectedCorners: [Point, Point, Point, Point] | null = null;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockPage(pageNum, settingsRef.current));
      captured = true;
    } else {
      const video = videoRef.current;
      const useMobileQualityPipeline = isNativePlatform();
      const canvas = await captureBestCameraFrame(
        video,
        settingsRef.current.colorMode === 'greyscale',
      );
      // Re-check the exact high-resolution frame being saved. Live detection
      // can be one or more frames old after the phone has moved.
      const corners = detectCornersFromCanvas(canvas);
      const page = createDocumentPage(
        canvas,
        corners,
        settingsRef.current,
        useMobileQualityPipeline,
      );
      if (page) {
        addPage(page);
        captured = true;
      } else {
        // The live quad is never used to crop an image, but it is useful as
        // a movement baseline when the exact capture frame is too soft to
        // detect on its own.
        rejectedCorners = corners ?? edgeCorners;
      }
    }
    if (!captured) {
      waitingClear.current = true;
      rejectedCornersRef.current = rejectedCorners;
      setIsWaitingClear(true);
      setNeedsClearerCapture(true);
      needsClearerCaptureRef.current = true;
      return;
    }
    setActivePageIndex(pageNum - 1);
    setNeedsClearerCapture(false);
    needsClearerCaptureRef.current = false;
    rejectedCornersRef.current = null;
    rejectedBookDetectionRef.current = null;

    triggerCaptureEffects();
    playSuccessfulCaptureSound();
    setCapturedLabel(pageNum);
    setTimeout(() => setCapturedLabel(null), 1800);

    // Enter waiting-clear state — block next scan until doc leaves frame
    waitingClear.current = true;
    setIsWaitingClear(true);
  }, [isMockMode, focusReady, videoRef, edgeCorners, addPage, setActivePageIndex, triggerCaptureEffects]);

  useEffect(() => { captureAutoRef.current = autoCaptureFrame; }, [autoCaptureFrame]);

  /* ── Edge detection loop ────────────────────────────────────────────────── */
  useEffect(() => {
    if (isMockMode) return;

    const updateTrackedCorners = (
      detected: [Point, Point, Point, Point] | null,
      frameWidth: number,
      frameHeight: number,
    ): { corners: [Point, Point, Point, Point] | null; stable: boolean } => {
      if (!detected) {
        missedEdgeFrames.current += 1;
        if (missedEdgeFrames.current >= MAX_MISSED_EDGE_FRAMES) {
          trackedCornersRef.current = null;
          pendingCornersRef.current = null;
          pendingCornerFrames.current = 0;
          trackConfirmFrames.current = 0;
        }
        return { corners: trackedCornersRef.current, stable: false };
      }

      missedEdgeFrames.current = 0;
      const tracked = trackedCornersRef.current;
      if (!tracked) {
        trackedCornersRef.current = detected;
        trackConfirmFrames.current = 1;
        return { corners: detected, stable: false };
      }

      const jump = cornerDistance(tracked, detected, frameWidth, frameHeight);
      if (jump <= MAX_TRACK_JUMP) {
        trackedCornersRef.current = blendCorners(tracked, detected, TRACK_BLEND);
        pendingCornersRef.current = null;
        pendingCornerFrames.current = 0;
        trackConfirmFrames.current = Math.min(
          trackConfirmFrames.current + 1,
          INITIAL_TRACK_CONFIRM_FRAMES,
        );
        return {
          corners: trackedCornersRef.current,
          stable: trackConfirmFrames.current >= INITIAL_TRACK_CONFIRM_FRAMES,
        };
      }

      // A sudden candidate change is often a false edge from a moving hand,
      // glare, or a nearby background line. Require the new candidate to
      // repeat before allowing the visible frame to move to it.
      if (
        pendingCornersRef.current &&
        cornerDistance(pendingCornersRef.current, detected, frameWidth, frameHeight) <= MAX_TRACK_JUMP
      ) {
        pendingCornerFrames.current += 1;
      } else {
        pendingCornersRef.current = detected;
        pendingCornerFrames.current = 1;
      }
      trackConfirmFrames.current = 0;

      if (pendingCornerFrames.current >= JUMP_CONFIRM_FRAMES) {
        trackedCornersRef.current = blendCorners(tracked, detected, JUMP_BLEND);
        pendingCornersRef.current = null;
        pendingCornerFrames.current = 0;
        return { corners: trackedCornersRef.current, stable: false };
      }

      return { corners: tracked, stable: false };
    };

    let cancelled = false;

    const scheduleNextDetection = () => {
      if (cancelled) return;
      edgeTimerRef.current = setTimeout(runDetection, EDGE_INTERVAL_MS);
    };

    const runDetection = () => {
      try {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        let detectedBook: BookDetection | null = null;
        let detectedIdCard: IdCardDetection | null = null;
        let bookFoldStable = scanModeRef.current !== 'book';
        let corners: [Point, Point, Point, Point] | null;
        if (scanModeRef.current === 'book') {
          const liveFrame = captureVideoFrame(video, false, 480 * 360);
          const liveDetection = detectBookFromCanvas(liveFrame);
          detectedBook = liveDetection
            ? scaleBookDetection(
                liveDetection,
                video.videoWidth / liveFrame.width,
                video.videoHeight / liveFrame.height,
              )
            : null;
          corners = detectedBook?.outer ?? null;
          const previousBook = previousBookDetectionRef.current;
          if (
            detectedBook &&
            previousBook &&
            detectedBook.foldConfidence >= 0.22 &&
            bookFoldDistance(
              previousBook,
              detectedBook,
              video.videoWidth,
              video.videoHeight,
            ) <= BOOK_FOLD_STABLE_DISTANCE
          ) {
            stableBookFoldFrames.current = Math.min(
              BOOK_FOLD_CONFIRM_FRAMES,
              stableBookFoldFrames.current + 1,
            );
          } else {
            stableBookFoldFrames.current = 0;
          }
          previousBookDetectionRef.current = detectedBook;
          bookFoldStable = stableBookFoldFrames.current >= BOOK_FOLD_CONFIRM_FRAMES;
        } else if (scanModeRef.current === 'presentation') {
          corners = detectPresentationCorners(
            video,
            video.videoWidth,
            video.videoHeight,
          )?.corners ?? null;
          previousBookDetectionRef.current = null;
          stableBookFoldFrames.current = 0;
        } else if (scanModeRef.current === 'id-cards') {
          const liveFrame = captureVideoFrame(video, false, 480 * 360);
          const fullGuide = guideQuadForCanvas(
            scannerRootRef.current,
            idGuideRef.current,
            video.videoWidth,
            video.videoHeight,
          );
          const sampledGuide = fullGuide
            ? scaleQuad(
                fullGuide,
                liveFrame.width / video.videoWidth,
                liveFrame.height / video.videoHeight,
              )
            : null;
          const liveDetection = sampledGuide
            ? detectIdCardFromCanvas(liveFrame, sampledGuide)
            : null;
          detectedIdCard = liveDetection
            ? {
                ...liveDetection,
                corners: scaleQuad(
                  liveDetection.corners,
                  video.videoWidth / liveFrame.width,
                  video.videoHeight / liveFrame.height,
                ),
              }
            : null;
          corners = detectedIdCard?.corners ?? null;
          if (!detectedIdCard || detectedIdCard.confidence < 0.58) corners = null;
          previousBookDetectionRef.current = null;
          stableBookFoldFrames.current = 0;
        } else {
          corners = detectDocumentCorners(video, video.videoWidth, video.videoHeight);
          previousBookDetectionRef.current = null;
          stableBookFoldFrames.current = 0;
        }
        const tracked = updateTrackedCorners(corners, video.videoWidth, video.videoHeight);
        setEdgeCorners(tracked.corners);
        setEdgeIsLive(Boolean(corners));
        setBookDetection(detectedBook);
        setIdCardDetection(detectedIdCard);
        setIdCardReady(
          scanModeRef.current === 'id-cards' &&
          Boolean(corners && tracked.stable && detectedIdCard && detectedIdCard.confidence >= 0.58),
        );

        if (modeRef.current !== 'auto' || !focusReady) return;

        // ── Waiting-clear phase: hold until document leaves frame ────────────
        if (waitingClear.current) {
          if (!tracked.corners) {
            // Document removed — ready for next scan
            waitingClear.current = false;
            setIsWaitingClear(false);
            setNeedsClearerCapture(false);
            needsClearerCaptureRef.current = false;
            rejectedCornersRef.current = null;
            rejectedBookDetectionRef.current = null;
            stableFrames.current = 0;
            setStableProgress(0);
          } else if (
            needsClearerCaptureRef.current &&
            (
              (
                rejectedCornersRef.current &&
                documentMoved(rejectedCornersRef.current, tracked.corners, video.videoWidth, video.videoHeight)
              ) ||
              (
                scanModeRef.current === 'book' &&
                detectedBook &&
                (
                  (
                    rejectedBookDetectionRef.current &&
                    bookFoldDistance(
                      rejectedBookDetectionRef.current,
                      detectedBook,
                      video.videoWidth,
                      video.videoHeight,
                    ) > BOOK_FOLD_STABLE_DISTANCE * 0.55
                  ) ||
                  (
                    !rejectedBookDetectionRef.current &&
                    bookFoldStable
                  )
                )
              )
            )
          ) {
            // A meaningful reposition gives the camera a fresh opportunity to
            // focus without repeatedly saving the same blurry frame.
            waitingClear.current = false;
            rejectedCornersRef.current = null;
            rejectedBookDetectionRef.current = null;
            setIsWaitingClear(false);
            setNeedsClearerCapture(false);
            needsClearerCaptureRef.current = false;
            stableFrames.current = 0;
            setStableProgress(0);
          }
          return; // Don't accumulate stability while waiting
        }

        // ── Normal detection phase ───────────────────────────────────────────
        if (corners && tracked.stable && bookFoldStable) {
          stableFrames.current = Math.min(stableFrames.current + 1, STABLE_TARGET);
        } else {
          stableFrames.current = Math.max(stableFrames.current - 2, 0);
        }

        const progress = stableFrames.current / STABLE_TARGET;
        setStableProgress(progress);

        if (stableFrames.current >= STABLE_TARGET) {
          stableFrames.current = 0;
          setStableProgress(0);
          captureAutoRef.current();
        }
      } catch (error) {
        console.error('Live document detection failed', error);
      } finally {
        scheduleNextDetection();
      }
    };

    scheduleNextDetection();

    return () => {
      cancelled = true;
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
      edgeTimerRef.current = null;
    };
  }, [isMockMode, videoRef, focusReady]);

  /* ── Manual capture ─────────────────────────────────────────────────────── */
  const manualCaptureFrame = useCallback(async () => {
    if (!isMockMode && !focusReady) {
      toast.info('카메라 초점을 맞추는 중입니다. 잠시 기다려 주세요');
      return;
    }
    const pageNum = pagesLenRef.current + 1;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockPage(pageNum, settingsRef.current));
    } else {
      const video  = videoRef.current;
      const useMobileQualityPipeline = isNativePlatform();
      const canvas = await captureBestCameraFrame(
        video,
        settingsRef.current.colorMode === 'greyscale',
      );
      // Prefer the capture-frame result over a potentially stale live overlay.
      const corners = detectCornersFromCanvas(canvas);
      const page = createDocumentPage(
        canvas,
        corners,
        settingsRef.current,
        useMobileQualityPipeline,
      );
      if (!page) {
        toast.error('문서 경계 또는 초점을 확인한 뒤 다시 촬영하세요');
        return;
      }
      addPage(page);
    }
    triggerCaptureEffects();
    playSuccessfulCaptureSound();
    setActivePageIndex(pageNum - 1);

    // Review the page first. Crop is available from the review toolbar only
    // when a user wants to adjust the automatic correction.
    setLocation('/preview');
  }, [isMockMode, focusReady, videoRef, edgeCorners, addPage, setActivePageIndex, setLocation, triggerCaptureEffects]);

  /* ── Book capture ───────────────────────────────────────────────────────── */
  const bookCapture = useCallback(async () => {
    if (!isMockMode && !focusReady) {
      toast.info('카메라 초점을 맞추는 중입니다. 잠시 기다려 주세요');
      return;
    }
    const grey = settingsRef.current.colorMode === 'greyscale';
    const base = pagesLenRef.current;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockBookHalf('left',  base + 1, settingsRef.current));
      addPage(generateMockBookHalf('right', base + 2, settingsRef.current));
    } else {
      const video = videoRef.current;
      // Capture and validate the exact frame before splitting the corrected
      // book spread. Keep iOS processing within the same memory ceiling used
      // by standard document capture.
      const full = await captureBestCameraFrame(
        video,
        grey,
      );

      const useMobileQualityPipeline = isNativePlatform();
      const detection = detectBookFromCanvas(full);
      const bookPages = detection
        ? createBookPageDataUrls(
            full,
            detection,
            settingsRef.current,
            useMobileQualityPipeline,
            useMobileQualityPipeline ? MAX_MOBILE_CAPTURE_PIXELS : Number.POSITIVE_INFINITY,
          )
        : null;
      if (!bookPages) {
        if (modeRef.current === 'auto') {
          waitingClear.current = true;
          setIsWaitingClear(true);
          setNeedsClearerCapture(true);
          needsClearerCaptureRef.current = true;
          rejectedCornersRef.current = detection?.outer ?? edgeCorners;
          rejectedBookDetectionRef.current = detection ?? bookDetection;
        }
        toast.error('책의 좌우 페이지와 중앙 접힘선을 확인한 뒤 다시 촬영하세요');
        return;
      }
      addPage(bookPages[0]);
      addPage(bookPages[1]);
    }

    rejectedBookDetectionRef.current = null;
    triggerCaptureEffects();
    playSuccessfulCaptureSound();
    setCapturedLabel(base + 2);
    setTimeout(() => setCapturedLabel(null), 1800);
    setActivePageIndex(base + 1);
    setLocation('/preview');
  }, [isMockMode, focusReady, videoRef, edgeCorners, bookDetection, addPage, setActivePageIndex, setLocation, triggerCaptureEffects]);

  useEffect(() => {
    captureBookAutoRef.current = bookCapture;
  }, [bookCapture]);

  /* ── Presentation capture ───────────────────────────────────────────────── */
  const presentationCapture = useCallback(async () => {
    if (!isMockMode && !focusReady) {
      toast.info('카메라 초점을 맞추는 중입니다. 잠시 기다려 주세요');
      return;
    }
    const grey = settingsRef.current.colorMode === 'greyscale';
    const pageNum = pagesLenRef.current + 1;

    if (isMockMode || !videoRef.current) {
      addPage(generateMockPresentation(pageNum, settingsRef.current));
    } else {
      const video = videoRef.current;
      const src = await captureBestCameraFrame(
        video,
        grey,
      );
      // Re-detect the exact high-resolution frame. The live outline guides the
      // user, but only capture-frame geometry is trusted for rectification.
      const detection = detectPresentationFromCanvas(src);
      if (!detection) {
        setPendingPage(src.toDataURL('image/jpeg', outputJpegQuality(isNativePlatform())));
        setPendingEditMode('presentation');
        setDetectedCorners(edgeCorners);
        toast.info('화면 모서리를 자동으로 찾지 못했습니다. 네 모서리를 직접 맞춰 주세요');
        setLocation('/edit');
        return;
      }
      const page = createPresentationPage(
        src,
        detection.corners,
        settingsRef.current,
        isNativePlatform(),
      );
      if (!page) {
        toast.error('초점이 맞지 않았습니다. 잠시 기다린 뒤 다시 촬영하세요');
        return;
      }
      addPage(page);
    }

    setCapturedLabel(pageNum);
    triggerCaptureEffects();
    playSuccessfulCaptureSound();
    setTimeout(() => setCapturedLabel(null), 1800);
    setActivePageIndex(pageNum - 1);
    setLocation('/preview');
   }, [
     isMockMode, focusReady, videoRef, edgeCorners, addPage,
     setPendingPage, setPendingEditMode, setDetectedCorners,
     setActivePageIndex, setLocation, triggerCaptureEffects,
   ]);

  useEffect(() => {
    capturePresentationAutoRef.current = presentationCapture;
  }, [presentationCapture]);

  /* ── ID Cards capture (2-stage) ─────────────────────────────────────────── */
  const idCardsCapture = useCallback(async () => {
    if (!isMockMode && !focusReady) {
      toast.info('카메라 초점을 맞추는 중입니다. 잠시 기다려 주세요');
      return;
    }
    const grey = settingsRef.current.colorMode === 'greyscale';

    const rejectCapture = (message: string) => {
      if (modeRef.current === 'auto') {
        waitingClear.current = true;
        setIsWaitingClear(true);
        setNeedsClearerCapture(true);
        needsClearerCaptureRef.current = true;
        rejectedCornersRef.current = edgeCorners;
      }
      setIdCardReady(false);
      toast.error(message);
    };

    const captureCardDataUrl = async (): Promise<string | null> => {
      if (isMockMode || !videoRef.current) return 'mock';
      const video = videoRef.current;
      const src = await captureBestCameraFrame(
        video,
        grey,
      );
      const guide = guideQuadForCanvas(
        scannerRootRef.current,
        idGuideRef.current,
        src.width,
        src.height,
       );
      const detection = guide ? detectIdCardForCapture(src, guide) : null;
      if (!detection) return null;
      return createIdCardPage(
         src,
        detection.corners,
        settingsRef.current,
        isNativePlatform(),
      );
    };

    if (idStage === 'front') {
      const frontData = await captureCardDataUrl();
      if (!frontData) {
        rejectCapture('카드 네 변 또는 초점을 확인한 뒤 다시 맞춰 주세요');
        return;
      }
      idFrontRef.current = frontData;
      triggerCaptureEffects();
      playSuccessfulCaptureSound();
      setIdStage('back');
      setIdCardDetection(null);
      setIdCardReady(false);
      setEdgeCorners(null);
      trackedCornersRef.current = null;
      stableFrames.current = 0;
      setStableProgress(0);
      if (modeRef.current === 'auto') {
        waitingClear.current = true;
        setIsWaitingClear(true);
      }
      toast.success('앞면 촬영 완료 — 카드를 뒤집어 뒷면을 촬영하세요');
    } else {
      const frontData = idFrontRef.current;
      if (!frontData) { setIdStage('front'); return; }

      if (isMockMode) {
        addPage(generateMockIdComposite(settingsRef.current));
        setActivePageIndex(pagesLenRef.current);
        setLocation('/preview');
      } else {
        const backData = await captureCardDataUrl();
        if (!backData) {
          rejectCapture('카드 뒷면의 네 변 또는 초점을 확인한 뒤 다시 맞춰 주세요');
          return;
        }
        const composite = await combineIdCardPages(
          frontData,
          backData,
          outputJpegQuality(isNativePlatform()),
        );
        addPage(composite);
        setActivePageIndex(pagesLenRef.current);
        toast.success('ID Card 저장 완료 — 앞면과 뒷면을 한 페이지로 만들었습니다');
        setLocation('/preview');
      }

      triggerCaptureEffects();
      playSuccessfulCaptureSound();
      idFrontRef.current = null;
      setIdStage('front');
      setIdCardDetection(null);
      setIdCardReady(false);
      setCapturedLabel(pagesLenRef.current + 1);
      setTimeout(() => setCapturedLabel(null), 1800);
    }
  }, [
    isMockMode, focusReady, videoRef, addPage, edgeCorners, idStage,
    setActivePageIndex, setLocation, triggerCaptureEffects,
  ]);

  useEffect(() => {
    captureIdAutoRef.current = () => {
      void idCardsCapture();
    };
  }, [idCardsCapture]);

  /* ── Capture button handler ─────────────────────────────────────────────── */
  const handleCaptureButton = useCallback(() => {
    const sm = scanModeRef.current;
    if      (sm === 'book')         bookCapture();
    else if (sm === 'presentation') presentationCapture();
    else if (sm === 'id-cards')     void idCardsCapture();
    else if (mode === 'auto')       autoCaptureFrame();
    else                            manualCaptureFrame();
  }, [mode, autoCaptureFrame, manualCaptureFrame, bookCapture, presentationCapture, idCardsCapture]);

  /* ── Text stamp: burns typed text onto the last page ───────────────────── */
  const handleApplyText = useCallback(async () => {
    if (!textInput.trim() || !pages.length) return;
    setTextApplying(true);
    try {
      const src = pages[pages.length - 1];
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src; });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const sizePx = { S: 36, M: 56, L: 80 }[textSize];
      const color  = { white: '#ffffff', black: '#111111', blue: '#2563eb' }[textColor];
      ctx.font = `bold ${sizePx}px -apple-system, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Shadow for readability
      ctx.shadowColor = textColor === 'white' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 8;

      // Wrap text at 80% width
      const maxW = canvas.width * 0.8;
      const words = textInput.trim().split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else { line = test; }
      }
      if (line) lines.push(line);

      const lineH = sizePx * 1.35;
      const totalH = lines.length * lineH;
      const startY = canvas.height / 2 - totalH / 2 + lineH / 2;
      lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, startY + i * lineH));

      removePage(pages.length - 1);
      addPage(canvas.toDataURL('image/jpeg', 0.92));
      toast.success('Text added');
      setTextPanelOpen(false);
      setTextInput('');
    } catch { toast.error('Failed to add text'); }
    finally { setTextApplying(false); }
  }, [textInput, textSize, textColor, pages, removePage, addPage]);

  /* ── Permission error ───────────────────────────────────────────────────── */
  if (hasPermission === false) {
    return (
      <div className="min-h-screen bg-[#0d0d14] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-semibold mb-2 text-white">카메라 접근 권한 없음</h2>
        <p className="text-white/50 mb-6 max-w-sm">
          설정에서 PrivaScan의 카메라 권한을 허용한 뒤 다시 시도하세요.
        </p>
        <Button onClick={() => { void startCamera(); }} variant="outline">다시 시도</Button>
      </div>
    );
  }

  /* ── Derived colours ────────────────────────────────────────────────────── */
  const isStable   = stableProgress > 0.85;
  const edgeStroke = scanMode === 'id-cards' && !idCardReady ? '#38bdf8' : '#4ade80';
  const edgeFill   = isStable
    ? 'rgba(74,222,128,0.12)'
    : edgeIsLive
      ? 'rgba(74,222,128,0.07)'
      : 'rgba(74,222,128,0.035)';
  const bracketColor = edgeCorners
    ? (isStable ? '#4ade80' : '#60a5fa')
    : 'rgba(255,255,255,0.45)';

  const videoEl = videoRef.current;
  const viewW   = videoEl?.videoWidth  || 640;
  const viewH   = videoEl?.videoHeight || 480;

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div
      ref={scannerRootRef}
      className="relative min-h-[100dvh] overflow-hidden flex flex-col"
      style={{ background: '#0d0d14' }}
    >
      <canvas ref={canvasRef} className="hidden" />

      {/* ── White flash on capture ── */}
      <div className={cn(
        'absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150',
        isCapturing ? 'opacity-60' : 'opacity-0',
      )} />

      {/* ── B: Scan line sweep ── */}
      {showScanLine && (
        <div
          className="animate-scan-line"
          style={{
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.9) 50%, transparent)',
            height: '3px',
            filter: 'blur(1px)',
          }}
        />
      )}

      {/* ── Live camera — Android, iOS, and web share the same scanner UI ── */}
      {!isMockMode && (
        <video ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover z-0" />
      )}
      {/* Source-coordinate overlays share the live video's full-root viewport
          and the same object-cover transform, so detected corners stay aligned. */}
      {!isMockMode && scanMode !== 'book' && edgeCorners && (
        <svg
          className="absolute inset-0 w-full h-full z-10 pointer-events-none"
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <polygon
            points={edgeCorners.map(point => `${point.x},${point.y}`).join(' ')}
            fill={edgeFill}
            stroke={edgeStroke}
            strokeWidth="10"
            strokeLinejoin="round"
            style={{
              opacity: edgeIsLive ? 1 : 0.62,
              transition: 'opacity 0.18s ease, fill 0.3s, stroke 0.3s ease',
            }}
          />
        </svg>
      )}
      {!isMockMode && scanMode === 'book' && bookDetection && (
        <svg
          className="absolute inset-0 w-full h-full z-10 pointer-events-none"
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <polygon
            points={bookDetection.left.map(point => `${point.x},${point.y}`).join(' ')}
            fill={edgeFill}
            stroke={edgeStroke}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <polygon
            points={bookDetection.right.map(point => `${point.x},${point.y}`).join(' ')}
            fill={edgeFill}
            stroke={edgeStroke}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <polyline
            points={bookDetection.foldCurve.map(point => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#f8fafc"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="22 18"
            opacity="0.92"
          />
        </svg>
      )}
       {/* ── H: Top bar — logo · capture preferences · navigation ── */}
      <div
        className="scanner-topbar absolute top-0 inset-x-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-4 pb-6"
        style={{
          background: 'linear-gradient(to bottom, rgba(13,13,20,0.88) 0%, transparent 100%)',
          // Safe area: push content below the status bar / notch on Android
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
        }}
      >
        {/* Col 1 — Left: PrivaScan brand */}
        <div className="scanner-brand flex items-center gap-2 shrink-0">
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2,12 L2,2 L12,2"    stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M36,2 L46,2 L46,12"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M2,36 L2,46 L12,46"  stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3" fill="none" strokeLinecap="square"/>
            <rect x="13" y="9" width="22" height="30" rx="1.5" fill="white" opacity="0.92"/>
            <path d="M29,9 L35,15 L29,15 Z" fill="#cbd5e1"/>
            <path d="M29,9 L35,9 L35,15 Z" fill="white" opacity="0.92"/>
            <line x1="17" y1="20" x2="31" y2="20" stroke="#334155" strokeWidth="2"   strokeLinecap="round"/>
            <line x1="17" y1="24" x2="29" y2="24" stroke="#334155" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="17" y1="28" x2="31" y2="28" stroke="#334155" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="17" y1="32" x2="26" y2="32" stroke="#334155" strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="7"  y1="24" x2="41" y2="24" stroke="#38bdf8" strokeWidth="2"  strokeLinecap="round" opacity="0.9"/>
          </svg>
          <span className="scanner-brand-label hidden sm:inline font-bold tracking-tight" style={{ fontSize: '1.1rem', lineHeight: 1 }}>
            <span className="text-white">Priva</span><span style={{ color: '#38bdf8' }}>Scan</span>
          </span>
        </div>

        {/* Col 2 — Center: Flash + Quality + Auto/Manual */}
        <div className="scanner-capture-preferences flex justify-center items-center gap-1 sm:gap-6 min-w-0">

          {/* ── Flash ── */}
          <div className="relative flex items-center">
            <button
              onClick={() => { setFlashOpen(o => !o); setQualityOpen(false); }}
              className={cn(
                'w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all shrink-0',
                flashOpen ? 'bg-white/20' : 'hover:bg-white/10',
                flashMode === 'on'   && 'text-yellow-300',
                flashMode === 'off'  && 'text-white/40',
                flashMode === 'auto' && 'text-white',
              )}
              aria-label="Flash mode"
            >
              {flashMode === 'off'
                ? <ZapOff className="w-5 h-5" />
                : <Zap className={cn('w-5 h-5', flashMode === 'on' && 'fill-yellow-300 text-yellow-300')} />
              }
            </button>

            {flashOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFlashOpen(false)} />
                <div
                  className="absolute top-[52px] z-40 flex items-center gap-1 px-2 py-2 rounded-2xl"
                  style={{ background: 'rgba(28,28,32,0.96)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                >
                  {(['off', 'on', 'auto'] as const).map(m => (
                    <button
                      key={m}
                      onClick={(e) => { e.stopPropagation(); setFlashMode(m); setFlashOpen(false); }}
                      className={cn(
                        'px-5 py-2 rounded-xl text-[10px] font-semibold uppercase transition-all select-none',
                        flashMode === m ? 'bg-white/15 text-[#2dd4bf]' : 'text-white/70 hover:text-white hover:bg-white/8',
                      )}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Quality ── */}
          <div className="relative flex items-center">
            <button
              onClick={() => { setQualityOpen(o => !o); setFlashOpen(false); }}
              className={cn(
                'w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all shrink-0',
                qualityOpen ? 'bg-white/20' : 'hover:bg-white/10',
              )}
              aria-label={`Output resolution: ${settings.targetDpi} DPI`}
            >
              <QualityGaugeIcon dpi={settings.targetDpi} />
            </button>

            {qualityOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setQualityOpen(false)} />
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-[52px] z-40 px-3 pt-3 pb-3 rounded-2xl min-w-[280px]"
                  style={{ background: 'rgba(28,28,32,0.96)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                >
                  <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-2 px-1">
                    Output Resolution
                  </p>
                  <div className="flex gap-2">
                    {DPI_PRESETS.map(dpi => (
                      <button
                        key={dpi}
                        onClick={(e) => {
                          e.stopPropagation();
                          applyTargetDpi(dpi);
                          setQualityOpen(false);
                        }}
                        className={cn(
                          'flex-1 flex items-center justify-center py-2 rounded-lg border transition-all select-none',
                          settings.targetDpi === dpi
                            ? 'border-sky-400 bg-sky-400/10'
                            : 'border-white/10 bg-white/5 hover:bg-white/10',
                        )}
                      >
                        <span className={cn(
                          'text-[10px] font-semibold',
                          settings.targetDpi === dpi ? 'text-sky-400' : 'text-white/80',
                        )}>
                          {dpi} DPI
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <label
                      htmlFor="custom-scan-dpi"
                      className="block text-[10px] font-semibold text-white/55 mb-1.5 px-0.5"
                    >
                      Custom ({MIN_SCAN_DPI}–{MAX_SCAN_DPI} DPI)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          id="custom-scan-dpi"
                          type="number"
                          inputMode="numeric"
                          min={MIN_SCAN_DPI}
                          max={MAX_SCAN_DPI}
                          step={10}
                          value={dpiInput}
                          onChange={(event) => setDpiInput(event.target.value)}
                          onBlur={commitDpiInput}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitDpiInput();
                              setQualityOpen(false);
                            }
                          }}
                          className="w-full h-9 rounded-lg border border-white/15 bg-white/5 px-3 pr-10 text-sm font-semibold text-white outline-none focus:border-sky-400"
                          aria-label="Custom output DPI"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/35 pointer-events-none">
                          DPI
                        </span>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          commitDpiInput();
                          setQualityOpen(false);
                        }}
                        className="h-9 px-3 rounded-lg bg-sky-400 text-slate-950 text-[10px] font-bold hover:bg-sky-300 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Auto / Manual toggle ── */}
          <div className="relative flex items-center h-8 bg-white/10 border border-white/15 rounded-full px-[2px] ml-0 sm:ml-[5px] shrink-0">
              {/* Sliding pill */}
              <div
                className="absolute top-[2px] bottom-[2px] rounded-full bg-white shadow-sm transition-all duration-300 ease-out"
                style={{
                  width: 'calc(50% - 2px)',
                  left: mode === 'auto' ? '2px' : 'calc(50%)',
                }}
              />
              {(['auto', 'manual'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'relative z-10 h-full px-1.5 sm:px-2 rounded-full text-[9px] font-semibold transition-colors duration-200 capitalize select-none',
                    mode === m ? 'text-gray-900' : 'text-white/60 hover:text-white/90',
                  )}
                >
                  {m}
                </button>
              ))}
          </div>

        </div>

        {/* Col 3 — Right: Home + Settings (page count stays by the shutter) */}
        <div className="scanner-topbar-actions flex items-center justify-end gap-0 sm:gap-1 shrink-0">
          <button
            onClick={() => setHomeOpen(true)}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all shrink-0"
            aria-label="Home"
          >
            <House className="w-[22px] h-[22px]" />
          </button>
          <div className="text-white/70">
            <SettingsSheet />
          </div>
        </div>
      </div>

      {/* ── Main viewfinder ── */}
      <div
        className="flex-1 relative flex items-center justify-center"
        onPointerDown={(event) => {
          if (isMockMode) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setFocusPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          void requestFocus();
          window.setTimeout(() => setFocusPoint(null), 850);
        }}
      >
        {focusPoint && (
          <div
            className="scanner-focus-reticle absolute z-20 pointer-events-none"
            style={{ left: focusPoint.x, top: focusPoint.y }}
            aria-hidden="true"
          />
        )}

        {/* Dev-mode mock document */}
        {isMockMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="relative w-48 h-64 rounded-md shadow-2xl border border-white/10"
              style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(255,255,255,0.06) 100%)' }}>
              <div className="p-4 space-y-2">
                {[3/4, 1, 5/6, 1, 2/3, 1, 4/5, 1].map((w, i) =>
                  <div key={i}
                    className={cn('h-2 rounded', i === 0 ? 'bg-white/30' : 'bg-white/15')}
                    style={{ width: `${w * 100}%` }} />
                )}
              </div>
            </div>
            <p className="mt-5 text-white/30 text-xs tracking-widest uppercase">
              Dev Mode — Camera Off
            </p>
          </div>
        )}

        {/* ── A: Guide brackets — mode-specific ── */}

        {/* Document: A4 portrait — hide when edge detected on real camera */}
        {scanMode === 'document' && (!edgeCorners || isMockMode) && (
          <div className="absolute pointer-events-none"
            style={{ top:'12%', bottom:'32%', left:'50%', transform:'translate(-50%, 48px)', aspectRatio:'0.707/1', maxHeight:'100%' }}>
            <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white/55" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white/55" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white/55" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white/55" />
          </div>
        )}

        {/* Book: one wide landscape frame with a binding guide between pages */}
        {scanMode === 'book' && (
          <div
            className="scanner-wide-guide-region absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ top:'12%', bottom:'32%', transform:'translateY(48px)' }}
          >
            <div
              className="scanner-wide-guide relative w-[92vw] max-w-[680px] max-h-full transition-opacity duration-200"
              style={{
                aspectRatio: '1.5 / 1',
                opacity: bookDetection && !isMockMode ? 0.28 : 1,
              }}
            >
              <div className="absolute inset-0 rounded-[12px] border-2 border-white/65 bg-white/[0.025] shadow-[0_0_0_1px_rgba(0,0,0,0.16)]" />
              <div className="absolute inset-[6px] rounded-[8px] border border-white/12" />
              <div
                className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 border-l-2 border-dashed border-white/75"
                aria-hidden="true"
              />
              <span className="landscape-only-hint absolute left-1/2 -translate-x-1/2 -top-7 whitespace-nowrap text-[10px] font-semibold tracking-wide text-white/55">
                가로 모드 · 펼친 책 전체를 프레임에 맞춰 주세요
              </span>
            </div>
          </div>
        )}

        {/* Presentation: wide 16:9 */}
        {scanMode === 'presentation' && (
          <div className="scanner-wide-guide-region absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ top:'12%', bottom:'32%', transform:'translateY(48px)' }}>
            <div
              className="scanner-wide-guide relative flex-shrink-0 transition-opacity duration-200"
              style={{
                width:'88vw',
                maxWidth:'680px',
                aspectRatio:'16/9',
                opacity: edgeCorners && !isMockMode ? 0.2 : 1,
              }}
            >
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white/55" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white/55" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white/55" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white/55" />
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-white/35 uppercase tracking-widest select-none">16:9 · Perspective Auto-Correct</span>
              <span className="landscape-only-hint absolute left-1/2 -translate-x-1/2 -top-7 whitespace-nowrap text-[10px] font-semibold tracking-wide text-white/55">
                가로 모드 · 화면 전체를 프레임에 맞춰 주세요
              </span>
            </div>
          </div>
        )}

        {/* ID Cards: two stacked landscape frames (1.585:1 = standard card ratio) */}
        {scanMode === 'id-cards' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center"
            style={{ top:'12%', bottom:'32%', gap:'14px', transform:'translateY(48px)' }}>
            {(['front','back'] as const).map((side, idx) => (
              <div
                key={side}
                ref={idStage === side ? idGuideRef : undefined}
                data-id-card-guide={side}
                className="relative flex-shrink-0 rounded-lg border transition-all duration-200"
                style={{
                  width:'75vw',
                  maxWidth:'320px',
                  aspectRatio:'1.585/1',
                  opacity: idStage === side ? 1 : 0.3,
                  borderColor: idStage === side
                    ? (idCardReady ? 'rgba(74,222,128,0.65)' : 'rgba(56,189,248,0.28)')
                    : 'rgba(255,255,255,0.16)',
                  background: idStage === side && idCardReady
                    ? 'rgba(74,222,128,0.06)'
                    : 'rgba(255,255,255,0.015)',
                  boxShadow: idStage === side && idCardReady
                    ? '0 0 24px rgba(74,222,128,0.2)'
                    : 'none',
                }}
              >
                <div className={cn('absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px]', idStage===side ? (idCardReady ? 'border-green-400' : 'border-sky-400') : 'border-white/40')} />
                <div className={cn('absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px]', idStage===side ? (idCardReady ? 'border-green-400' : 'border-sky-400') : 'border-white/40')} />
                <div className={cn('absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px]', idStage===side ? (idCardReady ? 'border-green-400' : 'border-sky-400') : 'border-white/40')} />
                <div className={cn('absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px]', idStage===side ? (idCardReady ? 'border-green-400' : 'border-sky-400') : 'border-white/40')} />
                <span className={cn('absolute top-2 left-3 text-[9px] font-bold uppercase tracking-widest select-none', idStage===side ? (idCardReady ? 'text-green-400' : 'text-sky-400') : 'text-white/35')}>
                  {idx + 1}. {side === 'front' ? 'Front' : 'Back'}
                </span>
                {idStage === side && idCardDetection && (
                  <span className={cn(
                    'absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-wide',
                    idCardReady ? 'text-green-400' : 'text-sky-300',
                  )}>
                    {idCardReady ? 'Hold steady' : 'Align all edges'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* "Hold still…" / "Capturing…" label */}
        {mode === 'auto' && isStable && !isMockMode && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20
                          bg-green-500/90 backdrop-blur-sm text-white text-sm font-semibold
                          px-5 py-2 rounded-full shadow-lg shadow-green-500/30 animate-pulse">
            Capturing…
          </div>
        )}

        {/* Desktop hint */}
        {!isMockMode && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          hidden md:flex items-center gap-2 bg-black/50 backdrop-blur-md
                          px-4 py-2 rounded-full pointer-events-none border border-white/10
                          text-white/60 text-sm">
            <Smartphone className="w-4 h-4" /> Use on mobile for best experience
          </div>
        )}
      </div>

      {/* ── E: Glassmorphism bottom bar ── */}
      <div
        className={cn(
          'scanner-bottom-bar absolute bottom-0 inset-x-0 z-20 pb-8 pt-4 px-5 flex flex-col',
          pages.length > 0 ? 'gap-3' : 'gap-4',
        )}
        style={{
          background: 'linear-gradient(to top, rgba(13,13,20,0.92) 60%, rgba(13,13,20,0.6) 85%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >

        {/* Auto-mode status hint */}
        {mode === 'auto' && (
          <div className="scanner-status-hint flex justify-center min-h-[20px]">
            {!isMockMode && !focusReady ? (
              <span className="text-amber-300 text-sm font-semibold animate-pulse">
                Focusing camera…
              </span>
            ) : isWaitingClear ? (
              <span className="text-amber-400 text-sm font-semibold animate-in fade-in flex items-center gap-1.5">
                <span>↑</span> {scanMode === 'id-cards'
                  ? (needsClearerCapture
                      ? '카드를 다시 맞춘 뒤 잠시 프레임 밖으로 이동해 주세요'
                      : '카드를 뒤집어 Back 프레임에 맞춰 주세요')
                  : needsClearerCapture
                    ? 'Image was unclear — move document and try again'
                    : 'Remove document to scan next'}
              </span>
            ) : capturedLabel !== null ? (
              <span className="text-green-400 text-sm font-semibold animate-in fade-in">
                ✓ Page {capturedLabel} saved
              </span>
            ) : isMockMode ? (
              <span className="text-white/35 text-sm">
                Tap the button to capture in dev mode
              </span>
            ) : edgeCorners ? (
              <span className={cn(
                'text-sm font-medium transition-colors',
                isStable || edgeIsLive ? 'text-green-400' : 'text-white/65',
              )}>
                {scanMode === 'id-cards'
                  ? (isStable
                      ? `${idStage === 'front' ? 'Front' : 'Back'} 고정됨 — 자동 촬영 중…`
                      : edgeIsLive
                        ? '카드 네 변 감지됨 — 그대로 유지해 주세요'
                        : '카드 엣지를 다시 찾는 중…')
                  : isStable
                    ? 'Frame locked — capturing…'
                    : edgeIsLive
                      ? 'Document detected — tracking edges'
                      : 'Keeping frame — reacquiring edges…'}
              </span>
            ) : (
              <span className="text-white/35 text-sm">
                {scanMode === 'id-cards'
                  ? `${idStage === 'front' ? 'Front' : 'Back'} 카드를 활성 프레임에 맞춰 주세요`
                  : 'Point camera at a document'}
              </span>
            )}
          </div>
        )}

        {/* Page thumbnails */}
        {pages.length > 0 && (
          <div className="scanner-thumbnails flex gap-2.5 overflow-x-auto snap-x px-1 pb-1 no-scrollbar">
            {pages.map((p, i) => (
              <button
                key={i}
                ref={i === pages.length - 1 ? lastThumbRef : null}
                onClick={() => {
                  setSelectedThumb(i);
                  setActivePageIndex(i);
                  setLocation('/preview');
                }}
                className={cn(
                  'relative shrink-0 w-[3.85rem] h-[4.9rem] rounded-none overflow-hidden snap-center shadow-lg transition-all duration-200 group',
                  i === selectedThumb
                    ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-transparent scale-105'
                    : 'ring-1 ring-white/20 hover:ring-blue-300',
                )}
              >
                <img src={p} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100
                               transition-opacity flex items-center justify-center">
                  <Edit2 className="w-4 h-4 text-white" />
                </div>
                <div className={cn(
                  'absolute bottom-0 inset-x-0 py-1 text-center text-[10px] font-bold leading-none',
                  i === selectedThumb ? 'bg-blue-500 text-white' : 'bg-black/55 text-white/90',
                )}>
                  {i + 1}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Adobe-style horizontal edit toolbar ── */}
        {pages.length > 0 && (
          <div className="flex justify-around items-center py-1 animate-in fade-in slide-in-from-bottom-2 duration-200">

            {/* Retake */}
            <ToolbarBtn icon={<Camera className="w-5 h-5" />} label="Retake" onClick={() => {
              removePage(pages.length - 1);
              toast('Last page removed');
            }} />

            {/* Crop */}
            <ToolbarBtn icon={<Crop className="w-5 h-5" />} label="Crop" onClick={() => {
              setActivePageIndex(pages.length - 1);
              setLocation('/preview');
            }} />

            {/* Rotate */}
            <ToolbarBtn icon={<RotateCw className="w-5 h-5" />} label="Rotate" onClick={async () => {
              const src = pages[pages.length - 1];
              const img = new Image();
              img.src = src;
              await new Promise<void>(res => { img.onload = () => res(); });
              const c = document.createElement('canvas');
              c.width = img.naturalHeight; c.height = img.naturalWidth;
              const ctx = c.getContext('2d')!;
              ctx.translate(c.width / 2, c.height / 2);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
              removePage(pages.length - 1);
              addPage(c.toDataURL('image/jpeg', 0.92));
              toast.success('Rotated 90°');
            }} />

            {/* Text */}
            <ToolbarBtn
              icon={<Type className="w-5 h-5" />}
              label="Text"
              active={textPanelOpen}
              onClick={() => setTextPanelOpen(o => !o)}
            />

            {/* Delete */}
            <ToolbarBtn icon={<Trash2 className="w-5 h-5" />} label="Delete" danger onClick={() => {
              clearPages();
              toast.error(`All page${pages.length > 1 ? 's' : ''} deleted`);
            }} />

          </div>
        )}

        {/* ── Text input panel ── */}
        {textPanelOpen && pages.length > 0 && (
          <div className="bg-gray-900/95 rounded-2xl px-4 py-3 space-y-3 border border-white/10 animate-in slide-in-from-bottom-2 duration-200">
            {/* Input row */}
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleApplyText(); }}
                placeholder="Type text to stamp on page…"
                className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2 text-sm outline-none border border-white/10 focus:border-blue-500 transition-colors"
              />
              <button
                onClick={() => { setTextPanelOpen(false); setTextInput(''); }}
                className="text-white/40 hover:text-white/70 transition-colors p-1"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Size + Color + Apply row */}
            <div className="flex items-center gap-3">
              {/* Size */}
              <div className="flex gap-1">
                {(['S', 'M', 'L'] as const).map(s => (
                  <button key={s} onClick={() => setTextSize(s)}
                    className={cn('w-8 h-8 rounded-lg text-xs font-bold transition-all',
                      textSize === s ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    )}>
                    {s}
                  </button>
                ))}
              </div>

              {/* Color swatches */}
              <div className="flex gap-1.5">
                {([
                  { key: 'black', bg: 'bg-gray-900', border: 'border-white/40' },
                  { key: 'white', bg: 'bg-white',    border: 'border-white/40' },
                  { key: 'blue',  bg: 'bg-blue-500', border: 'border-blue-300' },
                ] as const).map(({ key, bg, border }) => (
                  <button key={key} onClick={() => setTextColor(key)}
                    className={cn('w-6 h-6 rounded-full border-2 transition-all',
                      bg, border,
                      textColor === key ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-110' : ''
                    )} />
                ))}
              </div>

              {/* Apply */}
              <button
                onClick={handleApplyText}
                disabled={!textInput.trim() || textApplying}
                className="ml-auto flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-all"
              >
                {textApplying
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Check className="w-4 h-4" /> Apply</>
                }
              </button>
            </div>
          </div>
        )}

        {/* Scan modes are only needed before the first capture. Once pages
            exist, this space is dedicated to the edit toolbar above. */}
        {pages.length === 0 && (
          <div className="scanner-mode-selector flex justify-center transition-all duration-200 pointer-events-auto">
            <div className="flex items-center gap-0 bg-white/8 border border-white/10 rounded-full px-1 py-1">
              {([
                { id: 'document',     label: 'Document'     },
                { id: 'book',         label: 'Book'         },
                { id: 'presentation', label: 'Presentation' },
                { id: 'id-cards',     label: 'ID Card'      },
              ] as { id: ScanMode; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setScanMode(id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[10px] font-semibold transition-all select-none',
                    scanMode === id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-white/50 hover:text-white/80',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ID Cards stage indicator */}
        {pages.length === 0 && scanMode === 'id-cards' && (
          <div className="scanner-id-stage flex justify-center -mt-2">
            <span className="text-[10px] font-semibold text-sky-400">
              {idStage === 'front'
                ? (mode === 'auto'
                    ? '① Front를 위 프레임에 맞추면 자동 촬영됩니다'
                    : '① Front를 위 프레임에 맞춘 뒤 촬영하세요')
                : (mode === 'auto'
                    ? '② 카드를 뒤집어 Back을 아래 프레임에 맞춰 주세요'
                    : '② Back을 아래 프레임에 맞춘 뒤 촬영하세요')}
            </span>
          </div>
        )}

        {/* Controls row */}
        <div
          className="scanner-controls-row flex items-center justify-between"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >

          {/* Gallery thumbnail button — iOS camera style */}
          <button
            onClick={() => setGalleryOpen(true)}
            aria-label={`Open saved scans${localScans.length > 0 ? ` (${localScans.length})` : ''}`}
            className="relative w-12 h-12 rounded-xl transition-all active:scale-95 shrink-0 bg-transparent flex items-center justify-center"
          >
            <img
              src={fileBoxIcon}
              alt=""
              aria-hidden="true"
              className="w-8 h-8 object-contain brightness-0 invert"
            />
            {localScans.length > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-sky-500 text-white text-[9px] font-bold leading-4 text-center">
                {localScans.length > 99 ? '99+' : localScans.length}
              </span>
            )}
          </button>

          {/* ── F: iOS-style capture button (standalone) ── */}
          <div className="relative w-16 h-16">
            {/* Progress ring */}
            {mode === 'auto' && (
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                {stableProgress > 0 && (
                  <circle
                    cx="40" cy="40" r={RING_R}
                    fill="none"
                    stroke={isStable ? '#4ade80' : '#60a5fa'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset={RING_CIRC * (1 - stableProgress)}
                    style={{ transition: 'stroke-dashoffset 0.15s ease-out, stroke 0.3s ease' }}
                  />
                )}
              </svg>
            )}
            {/* iOS shutter button */}
            <button
              onClick={handleCaptureButton}
              disabled={!isMockMode && !focusReady}
              aria-label={!isMockMode && !focusReady ? 'Focusing camera' : 'Capture scan'}
              className={cn(
                'absolute inset-0 rounded-full border-[3px] border-white',
                'flex items-center justify-center',
                'active:scale-95 transition-transform duration-100 disabled:opacity-45 disabled:cursor-wait disabled:active:scale-100',
                isStable && mode === 'auto' && 'animate-capture-glow',
              )}
            >
              <div className={cn(
                'w-[2.7rem] h-[2.7rem] rounded-full transition-all duration-300',
                isStable && mode === 'auto'
                  ? 'bg-green-400 shadow-[0_0_16px_rgba(74,222,128,0.6)]'
                  : 'bg-white',
              )}>
                {mode === 'auto' && (
                  <div className="w-full h-full flex items-center justify-center">
                    <Zap className={cn('w-4 h-4 fill-current transition-colors', isStable ? 'text-white' : 'text-gray-800')} />
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Preview / page count */}
          {mode === 'manual' ? (
            <button
              onClick={() => setLocation('/preview')}
              disabled={pages.length === 0}
              className={cn(
                'w-12 h-12 rounded-full flex flex-col items-center justify-center transition-all',
                pages.length > 0
                  ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/40'
                  : 'opacity-0 pointer-events-none',
              )}
            >
              <span className="text-base font-bold leading-none">{pages.length}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            pages.length > 0 ? (
              <button
                onClick={() => setLocation('/preview')}
                className="w-12 h-12 flex flex-col items-center justify-center rounded-full bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-all backdrop-blur-sm"
              >
                <span className="text-base font-bold leading-none">{pages.length}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : <div className="w-12" />
          )}
        </div>

      </div>

      {/* Gallery bottom sheet */}
      <GallerySheet open={galleryOpen} onClose={() => setGalleryOpen(false)} />
      {homeOpen && <HomePopup onClose={() => setHomeOpen(false)} />}
    </div>
  );
}

/* ── ToolbarBtn sub-component ──────────────────────────────────────────────── */
function ToolbarBtn({
  icon, label, onClick, active, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all active:scale-90',
        active  && 'bg-white/15 text-white',
        danger  && !active && 'text-red-400 hover:text-red-300',
        !active && !danger && 'text-white/70 hover:text-white',
      )}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}
