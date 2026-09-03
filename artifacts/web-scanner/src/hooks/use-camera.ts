import { useState, useRef, useCallback } from 'react';

// Keep the physical camera off while developing in the browser. Production
// builds (including the Android release build) retain the normal camera flow.
const IS_DEV = import.meta.env.DEV;
type FocusMode = 'continuous' | 'single-shot' | 'unsupported' | 'unknown';

/**
 * 웹과 Capacitor 앱 모두 동일한 라이브 getUserMedia 카메라를 사용한다.
 * Android와 iOS에서 같은 UI, 실시간 경계 감지, 자동 촬영 흐름을 유지한다.
 */
export function useCamera() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFrameListenerRef = useRef<{ video: HTMLVideoElement; listener: () => void } | null>(null);
  const cameraSessionRef = useRef(0);
  const pendingStartRef = useRef<Promise<void> | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(IS_DEV ? true : null);
  const [error, setError]                 = useState<Error | null>(null);
  const [focusMode, setFocusMode]         = useState<FocusMode>(IS_DEV ? 'continuous' : 'unknown');
  const [focusReady, setFocusReady]       = useState(IS_DEV);

  /* ── 공통: 카메라 중지 ─────────────────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    pendingStartRef.current = null;
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (focusFrameListenerRef.current) {
      const { video, listener } = focusFrameListenerRef.current;
      video.removeEventListener('loadeddata', listener);
      focusFrameListenerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setFocusReady(false);
    setFocusMode('unknown');
  }, []);

  /* ── 웹 전용: getUserMedia ──────────────────────────────────────────────── */
  const startCameraWeb = useCallback((): Promise<void> => {
    if (IS_DEV) {
      setHasPermission(true);
      setFocusReady(true);
      return Promise.resolve();
    }

    if (streamRef.current) return Promise.resolve();
    if (pendingStartRef.current) return pendingStartRef.current;

    const session = ++cameraSessionRef.current;
    const request = (async () => {
      try {
        // iPhone can silently choose a low-resolution stream when a single
        // constraint set is too ambitious. Try the largest useful document
        // stream first, then fall back without asking for permission again.
        const resolutionSteps: MediaTrackConstraints[] = [
          {
            facingMode: { ideal: 'environment' },
            aspectRatio: { ideal: 4 / 3 },
            width: { ideal: 3840, max: 4032 },
            height: { ideal: 2880, max: 3024 },
          },
          {
            facingMode: { ideal: 'environment' },
            aspectRatio: { ideal: 4 / 3 },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        ];

        let mediaStream: MediaStream | null = null;
        let lastCameraError: unknown = null;
        for (const video of resolutionSteps) {
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video });
            break;
          } catch (err) {
            lastCameraError = err;
            const errorName = err instanceof DOMException ? err.name : '';
            if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
              throw err;
            }
          }
        }
        if (!mediaStream) {
          throw lastCameraError instanceof Error
            ? lastCameraError
            : new Error('Unable to start the camera');
        }

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
        // Apply the high-resolution preference once more after the stream is
        // selected. WebKit may accept getUserMedia but otherwise retain a
        // conservative preview size.
        try {
          await track?.applyConstraints({
            aspectRatio: { ideal: 4 / 3 },
            width: { ideal: 3840, max: 4032 },
            height: { ideal: 2880, max: 3024 },
          });
        } catch {
          // The stream selected above remains valid when this optional
          // refinement is not supported by a particular iOS release.
        }

        const selectedSettings = track?.getSettings?.();
        if (selectedSettings?.width && selectedSettings?.height) {
          console.info('[PrivaScan] selected camera stream', {
            width: selectedSettings.width,
            height: selectedSettings.height,
            frameRate: selectedSettings.frameRate,
            aspectRatio: selectedSettings.aspectRatio,
          });
        }

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
          selectedFocusMode = 'unknown';
        }

        if (cameraSessionRef.current !== session || streamRef.current !== mediaStream) return;
        setFocusMode(selectedFocusMode);

        const settleDelay = selectedFocusMode === 'continuous' ? 1_200 : 1_500;
        const armFocusReady = () => {
          if (cameraSessionRef.current !== session || streamRef.current !== mediaStream) return;
          if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
          if (focusFrameListenerRef.current) {
            const { video, listener } = focusFrameListenerRef.current;
            video.removeEventListener('loadeddata', listener);
            focusFrameListenerRef.current = null;
          }
          focusTimerRef.current = setTimeout(() => {
            if (cameraSessionRef.current === session && streamRef.current === mediaStream) {
              setFocusReady(true);
            }
          }, settleDelay);
        };
        const preview = videoRef.current;
        if (preview && preview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          focusFrameListenerRef.current = { video: preview, listener: armFocusReady };
          preview.addEventListener('loadeddata', armFocusReady, { once: true });
          focusTimerRef.current = setTimeout(() => {
            if (cameraSessionRef.current === session && streamRef.current === mediaStream) {
              if (focusFrameListenerRef.current) {
                const { video, listener } = focusFrameListenerRef.current;
                video.removeEventListener('loadeddata', listener);
                focusFrameListenerRef.current = null;
              }
              setFocusReady(true);
            }
          }, settleDelay + 600);
        } else {
          armFocusReady();
        }
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
  }, []);

  /* ── 통합 startCamera ───────────────────────────────────────────────────── */
  const startCamera = useCallback((): Promise<void> => {
    return startCameraWeb();
  }, [startCameraWeb]);

  const requestFocus = useCallback(async (): Promise<void> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setFocusReady(false);
    try {
      const capabilities = track.getCapabilities?.() as
        (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
      const modes = capabilities?.focusMode ?? [];
      const focusMode = modes.includes('single-shot')
        ? 'single-shot'
        : modes.includes('continuous')
          ? 'continuous'
          : null;
      if (focusMode) {
        await track.applyConstraints({
          advanced: [{ focusMode } as MediaTrackConstraintSet],
        });
        setFocusMode(focusMode);
      }
    } catch {
      // The visual focus cycle still gives useful feedback on fixed-focus devices.
    } finally {
      window.setTimeout(() => setFocusReady(true), 700);
    }
  }, []);

  return {
    videoRef,
    hasPermission,
    startCamera,
    stopCamera,
    error,
    isMockMode: IS_DEV,
    focusMode,
    focusReady,
    requestFocus,
  };
}
