import { useState, useRef, useCallback } from 'react';
import { isAndroid } from '@/lib/platform';

// Keep the physical camera off while developing in the browser. Production
// builds (including the Android release build) retain the normal camera flow.
const IS_DEV = import.meta.env.DEV;
type FocusMode = 'continuous' | 'single-shot' | 'unsupported' | 'unknown';

/**
 * 단일 훅으로 라이브 웹 카메라와 Android 시스템 카메라를 지원.
 *  - 웹/iOS Capacitor: getUserMedia 스트림으로 자동 시작·실시간 경계 감지
 *  - Android Capacitor: 권한 요청 후 captureNativePhoto로 시스템 카메라 촬영
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

  // iOS keeps the live WKWebView camera so auto-start and real-time edge
  // detection continue to work inside the Capacitor shell.
  const nativeMode = isAndroid();

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
    if (!nativeMode) {
      setFocusReady(false);
      setFocusMode('unknown');
    }
  }, [nativeMode]);

  /* ── Android 네이티브: 권한 요청 ────────────────────────────────────────── */
  const startCameraNative = useCallback(async (): Promise<void> => {
    try {
      const { Camera } = await import('@capacitor/camera');
      const result = await Camera.requestPermissions({ permissions: ['camera'] });
      const granted = result.camera === 'granted' || result.camera === 'limited';
      setHasPermission(granted);
      if (!granted) setError(new Error('Camera permission denied'));
    } catch (err) {
      setHasPermission(false);
      setError(err instanceof Error ? err : new Error('Permission request failed'));
    }
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
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            aspectRatio: { ideal: 4 / 3 },
            width:  { ideal: 2560 },
            height: { ideal: 1920 },
          },
        });

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
    return nativeMode ? startCameraNative() : startCameraWeb();
  }, [nativeMode, startCameraNative, startCameraWeb]);

  /* ── Android 네이티브: 한 장 촬영 → data URL 반환 ───────────────────────── */
  const captureNativePhoto = useCallback(async (): Promise<string | null> => {
    if (!nativeMode) return null;
    try {
      const { Camera, CameraResultType, CameraSource, CameraDirection } =
        await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        direction: CameraDirection.Rear,
        quality: 95,
        allowEditing: false,
        saveToGallery: false,
        correctOrientation: true,
        // 최대 해상도: 플러그인 기본값 (기기 최대)
        width: 4096,
      });
      return photo.dataUrl ?? null;
    } catch (err) {
      // 사용자가 취소한 경우는 오류가 아님
      if (err instanceof Error &&
          (err.message.includes('cancelled') || err.message.includes('cancel') ||
           err.message.includes('dismiss'))) {
        return null;
      }
      setError(err instanceof Error ? err : new Error('Native capture failed'));
      return null;
    }
  }, [nativeMode]);

  return {
    videoRef,
    hasPermission,
    startCamera,
    stopCamera,
    error,
    isMockMode: IS_DEV,
    focusMode,
    // 네이티브 모드: 카메라 앱 자체가 초점을 잡으므로 항상 준비 완료
    focusReady: nativeMode ? (hasPermission === true) : focusReady,
    isNative: nativeMode,
    captureNativePhoto,
  };
}
