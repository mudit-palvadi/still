import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'error';

export interface CameraController {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  start: () => Promise<HTMLVideoElement>;
  stop: () => void;
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
};

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was denied. STILL needs to see your skeleton, not your browser history.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera found. The referee cannot judge what it cannot see.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is busy in another tab or app. Close it and try again.';
  }
  return 'The camera refused to open. Check your browser permissions and try again.';
}

export function useCamera(): CameraController {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setStatus('idle');
  }, []);

  const start = useCallback(async (): Promise<HTMLVideoElement> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = 'This browser does not expose a camera API. Try Chrome, Edge, or Firefox.';
      setError(message);
      setStatus('error');
      throw new Error(message);
    }

    setStatus('requesting');
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    } catch (firstError) {
      if (firstError instanceof DOMException && firstError.name === 'OverconstrainedError') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (fallbackError) {
          const message = cameraError(fallbackError);
          setError(message);
          setStatus('error');
          throw new Error(message);
        }
      } else {
        const message = cameraError(firstError);
        setError(message);
        setStatus('error');
        throw new Error(message);
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const message = 'The video element was not ready. Try again.';
      setError(message);
      setStatus('error');
      throw new Error(message);
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
    } catch {
      const message =
        'The browser paused the camera feed. Click "Retry camera" and allow playback.';
      setError(message);
      setStatus('error');
      throw new Error(message);
    }

    if (!video.videoWidth) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          video.removeEventListener('loadedmetadata', done);
          resolve();
        };
        video.addEventListener('loadedmetadata', done, { once: true });
        window.setTimeout(done, 4000);
      });
    }

    setStatus('ready');
    return video;
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return { videoRef, status, error, start, stop };
}
