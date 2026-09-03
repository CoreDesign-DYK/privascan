import { registerPlugin } from '@capacitor/core';

import { isAndroid } from '@/lib/platform';

interface CaptureFeedbackPlugin {
  playShutter(): Promise<{ played: boolean }>;
}

const CaptureFeedback = registerPlugin<CaptureFeedbackPlugin>('CaptureFeedback');

export function playSuccessfulCaptureSound(): void {
  if (!isAndroid()) return;
  void CaptureFeedback.playShutter().catch(() => {
    // Capture remains successful even if a device cannot play feedback.
  });
}