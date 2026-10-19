import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  isCameraDeniedThisSession,
  isLiveCameraSupported,
  rememberCameraDenied,
} from './cameraSupport.js';

export type CameraFacing = 'environment' | 'user';
export type CameraErrorReason = 'denied' | 'unavailable' | 'busy' | 'other';

export type CameraStatus =
  | { kind: 'starting' }
  | { kind: 'live'; torch: boolean }
  | { kind: 'error'; reason: CameraErrorReason };

export interface CameraStream {
  status: CameraStatus;
  facing: CameraFacing;
  canSwitch: boolean;
  torchOn: boolean;
  /** The live video track (for ImageCapture), or null. */
  getTrack: () => MediaStreamTrack | null;
  toggleFacing: () => void;
  /** Resolves with the new torch state (unchanged when the device refuses). */
  toggleTorch: () => Promise<boolean>;
}

interface Result {
  status: CameraStatus;
}

function classify(error: unknown): CameraErrorReason {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'other';
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Owns the `getUserMedia` stream behind the viewfinder: starts it, attaches it to `videoRef`,
 * stops every track on unmount and while the page is hidden, and starts it again when the page
 * is visible. Mount it only while the camera is open.
 */
export function useCameraStream(videoRef: RefObject<HTMLVideoElement | null>): CameraStream {
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  const [result, setResult] = useState<Result | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  // Known before any request: a refusal earlier this session, or no `mediaDevices` (plain http).
  const [preflight] = useState<CameraErrorReason | null>(() =>
    isCameraDeniedThisSession() ? 'denied' : isLiveCameraSupported() ? null : 'unavailable',
  );

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (hidden || preflight !== null) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    const fail = (reason: CameraErrorReason) => {
      if (!cancelled) setResult({ status: { kind: 'error', reason } });
    };

    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (preflight !== null || !devices) return;
    const video = videoRef.current;

    void (async () => {
      try {
        stream = await devices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 4096 },
            height: { ideal: 3072 },
          },
          audio: false,
        });
      } catch (error) {
        const reason = classify(error);
        if (reason === 'denied') rememberCameraDenied();
        fail(reason);
        return;
      }
      if (cancelled) {
        stopStream(stream);
        return;
      }
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      if (video) {
        video.srcObject = stream;
        void Promise.resolve(video.play?.()).catch(() => undefined);
      }
      const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorchOn(false);
      setResult({
        status: { kind: 'live', torch: capabilities.torch === true },
      });
      try {
        const all = await devices.enumerateDevices();
        if (!cancelled) setCanSwitch(all.filter((d) => d.kind === 'videoinput').length >= 2);
      } catch {
        // Switching is optional.
      }
    })();

    return () => {
      cancelled = true;
      // The stream of this attempt is gone: the next attempt starts as `starting`, and a late
      // resolution of this one is ignored (and its tracks stopped) through `cancelled`.
      setResult(null);
      stopStream(stream);
      trackRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [facing, hidden, videoRef, preflight]);

  const status: CameraStatus = preflight
    ? { kind: 'error', reason: preflight }
    : result
      ? result.status
      : { kind: 'starting' };

  const toggleFacing = useCallback(() => {
    setFacing((current) => (current === 'environment' ? 'user' : 'environment'));
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    const next = !torchOn;
    if (!track) return torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
      return next;
    } catch {
      return torchOn;
    }
  }, [torchOn]);

  const getTrack = useCallback(() => trackRef.current, []);

  return { status, facing, canSwitch, torchOn, getTrack, toggleFacing, toggleTorch };
}
