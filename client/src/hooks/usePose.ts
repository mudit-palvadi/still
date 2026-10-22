import { useCallback, useEffect, useRef, useState } from 'react';
import type { PoseDetector } from '@tensorflow-models/pose-detection';
import { isJointName } from '@shared/types';
import { drawSkeleton, type OverlayState } from '../lib/draw';
import type { PosePoint } from '../lib/scoring';

export type PoseStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export interface PoseController {
  load: () => Promise<void>;
  start: (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    onPose: (points: PosePoint[], now: number) => void,
    getOverlay: () => OverlayState,
  ) => void;
  stop: () => void;
  status: PoseStatus;
  error: string | null;
  backend: string | null;
}

const MODEL_ERROR =
  'The referee could not load its eyes. MoveNet is downloaded from the web the first time, so check your connection and try again.';

export function usePose(): PoseController {
  const detectorRef = useRef<PoseDetector | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onPoseRef = useRef<(points: PosePoint[], now: number) => void>(() => {});
  const overlayRef = useRef<() => OverlayState>(() => ({}));
  const [status, setStatus] = useState<PoseStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);

  const load = useCallback((): Promise<void> => {
    if (detectorRef.current) return Promise.resolve();
    if (loadPromiseRef.current) return loadPromiseRef.current;

    const promise = (async () => {
      setStatus('loading');
      setError(null);
      try {
        const tf = await import('@tensorflow/tfjs');

        try {
          const ok = await tf.setBackend('webgl');
          if (!ok) throw new Error('webgl unavailable');
        } catch {
          await tf.setBackend('cpu');
        }
        await tf.ready();
        setBackend(tf.getBackend());

        const poseDetection = await import('@tensorflow-models/pose-detection');
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true,
          },
        );

        detectorRef.current = detector;
        setStatus('ready');
      } catch (cause) {
        console.error('[pose] failed to load', cause);
        setError(MODEL_ERROR);
        setStatus('error');
        throw new Error(MODEL_ERROR);
      }
    })();

    loadPromiseRef.current = promise.finally(() => {
      loadPromiseRef.current = null;
    });
    return loadPromiseRef.current;
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStatus((current) => {
      if (current === 'error') return 'error';
      return detectorRef.current ? 'ready' : 'idle';
    });
  }, []);

  const start = useCallback(
    (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      onPose: (points: PosePoint[], now: number) => void,
      getOverlay: () => OverlayState,
    ) => {
      const detector = detectorRef.current;
      if (!detector) {
        setError(MODEL_ERROR);
        setStatus('error');
        return;
      }

      runningRef.current = true;
      videoRef.current = video;
      canvasRef.current = canvas;
      onPoseRef.current = onPose;
      overlayRef.current = getOverlay;
      setStatus('running');
      setError(null);

      let busy = false;
      let consecutiveErrors = 0;

      const loop = async (): Promise<void> => {
        if (!runningRef.current) return;
        if (busy) {
          rafRef.current = requestAnimationFrame(() => void loop());
          return;
        }

        const currentVideo = videoRef.current;
        const currentCanvas = canvasRef.current;
        if (!currentVideo || !currentCanvas) {
          rafRef.current = requestAnimationFrame(() => void loop());
          return;
        }

        busy = true;
        const now = performance.now();

        try {
          if (currentVideo.readyState >= 2 && currentVideo.videoWidth > 0) {
            if (
              currentCanvas.width !== currentVideo.videoWidth ||
              currentCanvas.height !== currentVideo.videoHeight
            ) {
              currentCanvas.width = currentVideo.videoWidth;
              currentCanvas.height = currentVideo.videoHeight;
            }

            const poses = await detector.estimatePoses(currentVideo, {
              maxPoses: 1,
              flipHorizontal: false,
            });

            if (!runningRef.current) return;

            const points: PosePoint[] = [];
            for (const keypoint of poses[0]?.keypoints ?? []) {
              if (keypoint.name && isJointName(keypoint.name)) {
                points.push({
                  name: keypoint.name,
                  x: keypoint.x,
                  y: keypoint.y,
                  score: keypoint.score ?? 0,
                });
              }
            }

            onPoseRef.current(points, now);
            const context = currentCanvas.getContext('2d');
            if (context) {
              drawSkeleton(
                context,
                points,
                currentCanvas.width,
                currentCanvas.height,
                overlayRef.current(),
                now,
              );
            }
            consecutiveErrors = 0;
          } else {
            onPoseRef.current([], now);
          }
        } catch (cause) {
          consecutiveErrors += 1;
          if (consecutiveErrors >= 5) {
            console.error('[pose] repeated detector failures', cause);
            runningRef.current = false;
            setError('The referee lost sight of you. Reload the round and try again.');
            setStatus('error');
            return;
          }
        } finally {
          busy = false;
          if (runningRef.current) {
            rafRef.current = requestAnimationFrame(() => void loop());
          }
        }
      };

      rafRef.current = requestAnimationFrame(() => void loop());
    },
    [],
  );

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.dispose();
      detectorRef.current = null;
    };
  }, []);

  return { load, start, stop, status, error, backend };
}
