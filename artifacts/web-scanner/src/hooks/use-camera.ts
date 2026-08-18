import { useState, useEffect, useRef, useCallback } from 'react';

// Auto-detect: use real camera when running on a real device/mobile,
// fall back to mock only in desktop localhost without camera.
const IS_DEV = false;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(IS_DEV ? true : null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const startCamera = useCallback(async () => {
    if (IS_DEV) {
      // Dev mode: immediately grant permission, no real camera needed.
      setHasPermission(true);
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      setStream(mediaStream);
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setHasPermission(false);
      setError(err instanceof Error ? err : new Error('Failed to access camera'));
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    hasPermission,
    startCamera,
    stopCamera,
    error,
    stream,
    isMockMode: IS_DEV,
  };
}
