import { useState, useRef, useCallback } from 'react';

const IS_DEV = false;
type FocusMode = 'continuous' | 'single-shot' | 'unsupported' | 'unknown';

export function useCamera() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);   // ref, not state → no re-render loop
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraSessionRef = useRef(0);
  const pendingStartRef = useRef<Promise<void> | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(IS_DEV ? true : null);
  const [error, setError]                 = useState<Error | null>(null);
  const [focusMode, setFocusMode]         = useState<FocusMode>(IS_DEV ? 'continuous' : 'unknown');
  const [focusReady, setFocusReady]       = useState(IS_DEV);

  const stopCamera = useCallback(() => {
    // Invalidate an outstanding permission prompt or camera request before
    // stopping the active stream. A late getUserMedia resolution is discarded.
    cameraSessionRef.current += 1;
    // Allow an immediate remount/retry to create a new request. The stale
    // request's identity-checked finally block cannot clear a newer request.
    pendingStartRef.current = null;
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setFocusReady(false);
    setFocusMode('unknown');
  }, []); // stable — no state deps

  const startCamera = useCallback((): Promise<void> => {
    if (IS_DEV) {
      setHasPermission(true);
      setFocusReady(true);
      return Promise.resolve();
    }

    // Already running — don't request again
    if (streamRef.current) return Promise.resolve();
    if (pendingStartRef.current) return pendingStartRef.current;

    const session = ++cameraSessionRef.current;
    const request = (async () => {
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

        // The view was closed or another request superseded this one while
        // camera permission was being resolved.
        if (cameraSessionRef.current !== session || streamRef.current) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        setHasPermission(true);
        setFocusReady(false);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        const track = mediaStream.getVideoTracks()[0];
        let selectedFocusMode: FocusMode = 'unsupported';
        try {
          const capabilities = track?.getCapabilities?.() as
            (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
          const supportedModes = capabilities?.focusMode ?? [];
          if (supportedModes.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            });
            selectedFocusMode = 'continuous';
          } else if (supportedModes.includes('single-shot')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet],
            });
            selectedFocusMode = 'single-shot';
          }
        } catch {
          // Some browsers expose focusMode but reject applying it. The camera's
          // native default remains usable, so capture can continue safely.
          selectedFocusMode = 'unknown';
        }

        if (cameraSessionRef.current !== session || streamRef.current !== mediaStream) return;
        setFocusMode(selectedFocusMode);

        // Give the camera time to settle after the stream starts and after the
        // autofocus constraint is applied. Unsupported-focus devices also wait
        // so manual and automatic capture share the same safe timing.
        focusTimerRef.current = setTimeout(() => {
          if (cameraSessionRef.current === session && streamRef.current === mediaStream) {
            setFocusReady(true);
          }
        }, 700);
      } catch (err) {
        if (cameraSessionRef.current !== session) return;
        setHasPermission(false);
        setFocusReady(false);
        setError(err instanceof Error ? err : new Error('Camera access denied'));
      }
    })();

    pendingStartRef.current = request;
    void request.finally(() => {
      if (pendingStartRef.current === request) pendingStartRef.current = null;
    });
    return request;
  }, []); // stable — no state deps

  return {
    videoRef,
    hasPermission,
    startCamera,
    stopCamera,
    error,
    isMockMode: IS_DEV,
    focusMode,
    focusReady,
  };
}
