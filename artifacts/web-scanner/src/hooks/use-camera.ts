import { useState, useRef, useCallback } from 'react';

const IS_DEV = false;

export function useCamera() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);   // ref, not state → no re-render loop
  const [hasPermission, setHasPermission] = useState<boolean | null>(IS_DEV ? true : null);
  const [error, setError]                 = useState<Error | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []); // stable — no state deps

  const startCamera = useCallback(async () => {
    if (IS_DEV) { setHasPermission(true); return; }

    // Already running — don't request again
    if (streamRef.current) return;

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          // Prefer a 4:3 high-resolution stream so portrait documents retain
          // more vertical pixels instead of being squeezed into 16:9.
          aspectRatio: { ideal: 4 / 3 },
          width:  { ideal: 2560 },
          height: { ideal: 1920 },
        },
      });

      streamRef.current = mediaStream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setHasPermission(false);
      setError(err instanceof Error ? err : new Error('Camera access denied'));
    }
  }, []); // stable — no state deps

  return {
    videoRef,
    hasPermission,
    startCamera,
    stopCamera,
    error,
    isMockMode: IS_DEV,
  };
}
