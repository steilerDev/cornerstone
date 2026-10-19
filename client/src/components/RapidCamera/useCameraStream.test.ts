import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { CAMERA_DENIED_SESSION_KEY } from './cameraSupport.js';
import { useCameraStream } from './useCameraStream.js';

interface FakeTrack {
  stop: jest.Mock;
  getCapabilities: jest.Mock;
  applyConstraints: jest.Mock<(c: unknown) => Promise<void>>;
}

let tracks: FakeTrack[];
let getUserMedia: jest.Mock<(c: unknown) => Promise<unknown>>;
let enumerateDevices: jest.Mock<() => Promise<unknown[]>>;
let capabilities: Record<string, unknown>;
const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');

function install() {
  tracks = [];
  getUserMedia = jest.fn(async () => {
    const track: FakeTrack = {
      stop: jest.fn(),
      getCapabilities: jest.fn(() => capabilities),
      applyConstraints: jest.fn(async () => undefined),
    };
    tracks.push(track);
    return { getTracks: () => [track], getVideoTracks: () => [track] };
  });
  enumerateDevices = jest.fn(async () => [{ kind: 'videoinput' }]);
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function videoRef() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'play', { value: jest.fn(async () => undefined) });
  return { video, ref: { current: video } };
}

describe('useCameraStream', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    capabilities = {};
    install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDescriptor)
      Object.defineProperty(window.navigator, 'mediaDevices', originalDescriptor);
    else delete (window.navigator as unknown as Record<string, unknown>).mediaDevices;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  describe('start and stop', () => {
    it('starts as "starting", asks for the back camera without audio, then goes live', async () => {
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      expect(result.current.status).toEqual({ kind: 'starting' });
      expect(result.current.facing).toBe('environment');

      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 3072 } },
        audio: false,
      });
      expect(result.current.getTrack()).toBe(tracks[0]);
    });

    it('attaches the stream to the video element, plays it, and detaches on unmount', async () => {
      const { video, ref } = videoRef();
      const { result, unmount } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      expect(video.srcObject).not.toBeNull();
      expect((video as unknown as { play: jest.Mock }).play).toHaveBeenCalled();

      unmount();
      expect(video.srcObject).toBeNull();
    });

    it('works without a video element and when play() rejects or is missing', async () => {
      const empty = renderHook(() => useCameraStream({ current: null }));
      await waitFor(() => expect(empty.result.current.status.kind).toBe('live'));

      const video = document.createElement('video');
      Object.defineProperty(video, 'play', {
        value: jest.fn(async () => {
          throw new Error('blocked');
        }),
      });
      const rejecting = renderHook(() => useCameraStream({ current: video }));
      await waitFor(() => expect(rejecting.result.current.status.kind).toBe('live'));

      const bare = document.createElement('video');
      Object.defineProperty(bare, 'play', { value: undefined });
      const missing = renderHook(() => useCameraStream({ current: bare }));
      await waitFor(() => expect(missing.result.current.status.kind).toBe('live'));
    });

    it('stops all tracks on unmount', async () => {
      const { ref } = videoRef();
      const { result, unmount } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      expect(tracks[0]!.stop).not.toHaveBeenCalled();

      unmount();

      expect(tracks[0]!.stop).toHaveBeenCalledTimes(1);
    });

    it('stops a stream that resolves after unmount', async () => {
      let resolve!: (stream: unknown) => void;
      getUserMedia.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
      const { ref } = videoRef();
      const { unmount } = renderHook(() => useCameraStream(ref));
      unmount();

      const late = { stop: jest.fn() };
      await act(async () => {
        resolve({ getTracks: () => [late], getVideoTracks: () => [late] });
      });

      expect(late.stop).toHaveBeenCalledTimes(1);
    });

    it('handles a stream without a video track', async () => {
      getUserMedia.mockResolvedValueOnce({ getTracks: () => [], getVideoTracks: () => [] });
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status).toEqual({ kind: 'live', torch: false }));
      expect(result.current.getTrack()).toBeNull();
    });
  });

  describe('errors', () => {
    it.each([
      ['NotAllowedError', 'denied'],
      ['SecurityError', 'denied'],
      ['NotFoundError', 'unavailable'],
      ['OverconstrainedError', 'unavailable'],
      ['NotReadableError', 'busy'],
      ['AbortError', 'busy'],
      ['TypeError', 'other'],
    ])('%s maps to "%s"', async (name, reason) => {
      getUserMedia.mockRejectedValueOnce(namedError(name));
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status).toEqual({ kind: 'error', reason }));
    });

    it('maps a non-Error rejection to "other"', async () => {
      getUserMedia.mockRejectedValueOnce('boom');
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() =>
        expect(result.current.status).toEqual({ kind: 'error', reason: 'other' }),
      );
    });

    it('remembers a denial for the session only for denied errors', async () => {
      getUserMedia.mockRejectedValueOnce(namedError('NotFoundError'));
      const { ref } = videoRef();
      const first = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(first.result.current.status.kind).toBe('error'));
      expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).toBeNull();

      getUserMedia.mockRejectedValueOnce(namedError('NotAllowedError'));
      const second = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(second.result.current.status.kind).toBe('error'));
      expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).not.toBeNull();
    });

    it('is denied up front, without a request, after a denial earlier this session', () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      expect(result.current.status).toEqual({ kind: 'error', reason: 'denied' });
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('is unavailable up front without mediaDevices (plain http)', () => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      expect(result.current.status).toEqual({ kind: 'error', reason: 'unavailable' });
    });
  });

  describe('visibility', () => {
    it('stops the tracks when the page becomes hidden and restarts when visible', async () => {
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));

      setVisibility('hidden');
      expect(tracks[0]!.stop).toHaveBeenCalledTimes(1);
      expect(result.current.status.kind).toBe('starting');
      expect(getUserMedia).toHaveBeenCalledTimes(1);

      setVisibility('visible');
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      expect(result.current.getTrack()).toBe(tracks[1]);
    });

    // Each attempt's cleanup clears the stored result, so a new attempt starts as "starting".
    it('reports "starting" (not the stale live status) right after the page is visible again', async () => {
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      setVisibility('hidden');
      setVisibility('visible');
      expect(result.current.status.kind).toBe('starting');
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    });

    it('ignores and stops a stream from an older attempt that resolves late', async () => {
      let resolveOld!: (stream: unknown) => void;
      getUserMedia.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      setVisibility('hidden');
      setVisibility('visible');
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      const current = result.current.getTrack();

      const late = { stop: jest.fn() };
      await act(async () => {
        resolveOld({ getTracks: () => [late], getVideoTracks: () => [late] });
      });

      expect(late.stop).toHaveBeenCalledTimes(1);
      expect(result.current.getTrack()).toBe(current);
      expect(result.current.status.kind).toBe('live');
    });

    it('does not request a stream when mounted while hidden, and starts once visible', async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(result.current.status.kind).toBe('starting');

      setVisibility('visible');
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
    });

    it('stops listening for visibility changes after unmount', async () => {
      const { ref } = videoRef();
      const { result, unmount } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      unmount();
      setVisibility('hidden');
      setVisibility('visible');
      expect(getUserMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe('switching cameras', () => {
    it('cannot switch with one video input, nor when the device list fails', async () => {
      const { ref } = videoRef();
      const one = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(one.result.current.status.kind).toBe('live'));
      await waitFor(() => expect(enumerateDevices).toHaveBeenCalled());
      expect(one.result.current.canSwitch).toBe(false);

      enumerateDevices.mockRejectedValueOnce(new Error('nope'));
      const failing = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(failing.result.current.status.kind).toBe('live'));
      await act(async () => undefined);
      expect(failing.result.current.canSwitch).toBe(false);
    });

    it('can switch with two video inputs and toggles back/front, stopping the old stream', async () => {
      enumerateDevices.mockResolvedValue([
        { kind: 'videoinput' },
        { kind: 'audioinput' },
        { kind: 'videoinput' },
      ]);
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.canSwitch).toBe(true));

      act(() => result.current.toggleFacing());
      expect(result.current.facing).toBe('user');
      expect(tracks[0]!.stop).toHaveBeenCalled();
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      expect(getUserMedia).toHaveBeenLastCalledWith({
        video: expect.objectContaining({ facingMode: 'user' }),
        audio: false,
      });
      await waitFor(() => expect(result.current.status.kind).toBe('live'));

      act(() => result.current.toggleFacing());
      expect(result.current.facing).toBe('environment');
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(3));
    });
  });

  describe('flash', () => {
    it('reports no torch when the track does not support it', async () => {
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status).toEqual({ kind: 'live', torch: false }));
    });

    it('reports torch support from the track capabilities', async () => {
      capabilities = { torch: true };
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status).toEqual({ kind: 'live', torch: true }));
      expect(result.current.torchOn).toBe(false);
    });

    it('tolerates a track without getCapabilities', async () => {
      getUserMedia.mockImplementationOnce(async () => {
        const track = { stop: jest.fn() };
        return { getTracks: () => [track], getVideoTracks: () => [track] };
      });
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status).toEqual({ kind: 'live', torch: false }));
    });

    it('toggleTorch applies the constraint and flips the state, on then off', async () => {
      capabilities = { torch: true };
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));

      let next: boolean | undefined;
      await act(async () => {
        next = await result.current.toggleTorch();
      });
      expect(next).toBe(true);
      expect(result.current.torchOn).toBe(true);
      expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });

      await act(async () => {
        next = await result.current.toggleTorch();
      });
      expect(next).toBe(false);
      expect(result.current.torchOn).toBe(false);
    });

    it('keeps the torch state when the device refuses', async () => {
      capabilities = { torch: true };
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      tracks[0]!.applyConstraints.mockRejectedValueOnce(new Error('refused'));

      let next: boolean | undefined;
      await act(async () => {
        next = await result.current.toggleTorch();
      });

      expect(next).toBe(false);
      expect(result.current.torchOn).toBe(false);
    });

    it('toggleTorch without a live track changes nothing', async () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));

      let next: boolean | undefined;
      await act(async () => {
        next = await result.current.toggleTorch();
      });

      expect(next).toBe(false);
      expect(result.current.getTrack()).toBeNull();
    });

    it('turns the torch state off again after a restart', async () => {
      capabilities = { torch: true };
      const { ref } = videoRef();
      const { result } = renderHook(() => useCameraStream(ref));
      await waitFor(() => expect(result.current.status.kind).toBe('live'));
      await act(async () => {
        await result.current.toggleTorch();
      });
      expect(result.current.torchOn).toBe(true);

      setVisibility('hidden');
      setVisibility('visible');
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      await act(async () => undefined);
      expect(result.current.torchOn).toBe(false);
    });
  });
});
