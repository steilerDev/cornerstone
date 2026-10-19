import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { RapidCamera, CAMERA_DENIED_SESSION_KEY } from './RapidCamera.js';
import { LOW_RES_DISMISSED_SESSION_KEY } from './resolution.js';
import type { RapidCameraProps } from './RapidCamera.js';

interface FakeTrack {
  stop: jest.Mock;
  getCapabilities: jest.Mock;
  getSettings: jest.Mock;
  applyConstraints: jest.Mock;
}

/** Track settings reported by the next fake stream (full HD unless a test overrides it). */
let trackSettings: { width?: number; height?: number };

function makeTrack(capabilities: Record<string, unknown> = {}): FakeTrack {
  return {
    stop: jest.fn(),
    getCapabilities: jest.fn(() => capabilities),
    getSettings: jest.fn(() => trackSettings),
    applyConstraints: jest.fn(async () => undefined),
  };
}

function makeStream(track: FakeTrack) {
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

const WIDE = '(min-width: 768px)';

let getUserMedia: jest.Mock<(constraints: unknown) => Promise<unknown>>;
let enumerateDevices: jest.Mock<() => Promise<unknown[]>>;
let tracks: FakeTrack[];
let createObjectURL: jest.Mock;
let revokeObjectURL: jest.Mock;
let nowValue: number;
const originalMediaDevices = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');
const originalVibrate = Object.getOwnPropertyDescriptor(window.navigator, 'vibrate');
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

function installMediaDevices(capabilities: Record<string, unknown> = {}) {
  tracks = [];
  getUserMedia = jest.fn(async () => {
    const track = makeTrack(capabilities);
    tracks.push(track);
    return makeStream(track);
  });
  enumerateDevices = jest.fn(async () => [{ kind: 'videoinput' }]);
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
}

function installImageCapture() {
  (window as unknown as { ImageCapture: unknown }).ImageCapture = jest.fn(() => ({
    takePhoto: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
  }));
}

function domError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function renderCamera(overrides: Partial<RapidCameraProps> = {}) {
  const props: RapidCameraProps = {
    open: true,
    onShot: jest.fn(),
    onClose: jest.fn(),
    onUseCameraApp: jest.fn(),
    shotCount: 0,
    savingCount: 0,
    waitingCount: 0,
    returnFocusRef: createRef<HTMLElement>(),
    ...overrides,
  };
  const view = render(<RapidCamera {...props} />);
  return { props, ...view };
}

async function renderLive(overrides: Partial<RapidCameraProps> = {}) {
  const view = renderCamera(overrides);
  await waitFor(() =>
    expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled'),
  );
  return view;
}

const status = () => screen.getByTestId('rapid-camera-status');

describe('RapidCamera', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    trackSettings = { width: 1920, height: 1080 };
    installMediaDevices();
    installImageCapture();
    nowValue = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowValue);
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
    // A decoded frame is available unless a test says otherwise (see "first-frame gate").
    jest.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    createObjectURL = jest.fn();
    let n = 0;
    createObjectURL.mockImplementation(() => `blob:shot-${++n}`);
    revokeObjectURL = jest.fn();
    URL.createObjectURL = createObjectURL as never;
    URL.revokeObjectURL = revokeObjectURL as never;
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: jest.fn() });
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
    delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (originalMediaDevices) {
      Object.defineProperty(window.navigator, 'mediaDevices', originalMediaDevices);
    } else {
      delete (window.navigator as unknown as Record<string, unknown>).mediaDevices;
    }
    if (originalVibrate) Object.defineProperty(window.navigator, 'vibrate', originalVibrate);
    else delete (window.navigator as unknown as Record<string, unknown>).vibrate;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  describe('opening', () => {
    it('renders nothing and requests no stream while closed', () => {
      renderCamera({ open: false });
      expect(screen.queryByTestId('rapid-camera')).not.toBeInTheDocument();
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('shows the starting panel, then the live viewfinder once permission is granted', async () => {
      renderCamera();
      expect(screen.getByTestId('rapid-camera-starting')).toBeInTheDocument();
      expect(screen.getByTestId('rapid-camera-shutter')).toHaveAttribute('aria-disabled', 'true');

      await waitFor(() =>
        expect(screen.queryByTestId('rapid-camera-starting')).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled'),
      );
      expect(screen.queryByTestId('rapid-camera-error')).not.toBeInTheDocument();
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(getUserMedia).toHaveBeenCalledWith({
        video: expect.objectContaining({ facingMode: 'environment' }),
        audio: false,
      });
    });

    it('attaches the stream to the video element and plays it', async () => {
      await renderLive();
      const video = screen.getByTestId('rapid-camera-video') as HTMLVideoElement;
      expect(video.srcObject).not.toBeNull();
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('renders the chip slot children', async () => {
      await renderLive({ children: <div data-testid="chip-slot">chips</div> });
      expect(screen.getByTestId('chip-slot')).toBeInTheDocument();
    });

    it('moves focus to the shutter when it opens (Sheet)', async () => {
      await renderLive();
      await waitFor(() => expect(screen.getByTestId('rapid-camera-shutter')).toHaveFocus());
    });

    it('is a labelled Sheet below 768px', async () => {
      await renderLive();
      expect(screen.getByRole('dialog', { name: 'Camera' })).toBeInTheDocument();
      expect(screen.getByTestId('rapid-camera-sheet')).toBeInTheDocument();
    });
  });

  describe('wide layout', () => {
    let media: MatchMediaControl;

    beforeEach(() => {
      media = installMatchMedia({ [WIDE]: true });
    });
    afterEach(() => media.restore());

    it('renders a Modal from 768px with the shutter focused', async () => {
      await renderLive();
      expect(screen.getByRole('dialog', { name: 'Camera' })).toBeInTheDocument();
      expect(screen.queryByTestId('rapid-camera-sheet')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('rapid-camera-shutter')).toHaveFocus());
    });

    it('closes on Escape', async () => {
      const { props } = await renderLive();
      await userEvent.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('renders nothing while closed', () => {
      renderCamera({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(getUserMedia).not.toHaveBeenCalled();
    });
  });

  describe('permission denied', () => {
    it('shows the denied panel, remembers it for the session, and offers Use camera app', async () => {
      getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
      const { props } = renderCamera();

      const panel = await screen.findByTestId('rapid-camera-error');
      expect(within(panel).getByRole('heading', { name: 'Camera access is off' })).toBeVisible();
      expect(within(panel).getByText(/allow camera access for this site/i)).toBeInTheDocument();
      expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).not.toBeNull();
      expect(screen.getByTestId('rapid-camera-shutter')).toHaveAttribute('aria-disabled', 'true');

      await userEvent.click(screen.getByTestId('rapid-camera-error-use-app'));
      expect(props.onUseCameraApp).toHaveBeenCalledTimes(1);
    });

    it('treats SecurityError as denied', async () => {
      getUserMedia.mockRejectedValueOnce(domError('SecurityError'));
      renderCamera();
      expect(await screen.findByText('Camera access is off')).toBeInTheDocument();
      expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).not.toBeNull();
    });

    it('skips the request on a later open once denied this session', () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      renderCamera();
      expect(screen.getByTestId('rapid-camera-error')).toBeInTheDocument();
      expect(screen.getByText('Camera access is off')).toBeInTheDocument();
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('Close in the panel closes the camera', async () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      const { props } = renderCamera();
      const panel = screen.getByTestId('rapid-camera-error');
      expect(within(panel).getByTestId('rapid-camera-error-close')).toHaveTextContent(/^Close$/);
      await userEvent.click(within(panel).getByTestId('rapid-camera-error-close'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('other failures', () => {
    it.each(['NotFoundError', 'OverconstrainedError'])(
      '%s shows the camera-cannot-be-used panel without storing a denial',
      async (name) => {
        getUserMedia.mockRejectedValueOnce(domError(name));
        renderCamera();
        const panel = await screen.findByTestId('rapid-camera-error');
        expect(within(panel).getByText("The camera can't be used")).toBeInTheDocument();
        expect(within(panel).getByText(/Photos from your camera app are full size/)).toBeVisible();
        expect(within(panel).queryByText(/allow camera access/i)).not.toBeInTheDocument();
        expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).toBeNull();
      },
    );

    it.each(['NotReadableError', 'AbortError'])('%s says another app is using it', async (name) => {
      getUserMedia.mockRejectedValueOnce(domError(name));
      renderCamera();
      const panel = await screen.findByTestId('rapid-camera-error');
      expect(within(panel).getByText('The camera is being used by another app.')).toBeVisible();
    });

    it('an unknown error falls back to the camera app lead', async () => {
      getUserMedia.mockRejectedValueOnce('boom');
      renderCamera();
      const panel = await screen.findByTestId('rapid-camera-error');
      expect(within(panel).getByText("The camera can't be used")).toBeInTheDocument();
      expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).toBeNull();
    });

    it('plain http (no mediaDevices) shows the unavailable panel without a request', () => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
      const { props } = renderCamera();
      expect(screen.getByText("The camera can't be used")).toBeInTheDocument();
      expect(screen.getByTestId('rapid-camera-shutter')).toHaveAttribute('aria-disabled', 'true');
      expect(props.onShot).not.toHaveBeenCalled();
    });

    it('the top-bar Use camera app calls the host once per click', async () => {
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-use-app'));
      expect(props.onUseCameraApp).toHaveBeenCalledTimes(1);
    });
  });

  describe('shutter', () => {
    it('click hands one frame promise to onShot that resolves to a JPEG File', async () => {
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));

      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));
      const frame = (props.onShot as jest.Mock).mock.calls[0]![0] as Promise<File>;
      expect(frame).toBeInstanceOf(Promise);
      const file = await frame;
      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe('image/jpeg');
      expect(file.name).toMatch(/^capture-\d+\.jpg$/);
    });

    it.each([
      ['Enter', '{Enter}'],
      ['Space', ' '],
    ])('%s on the focused shutter takes a photo', async (_name, key) => {
      const { props } = await renderLive();
      screen.getByTestId('rapid-camera-shutter').focus();
      await userEvent.keyboard(key);
      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));
    });

    it('does nothing while the camera is still starting', async () => {
      getUserMedia.mockImplementationOnce(() => new Promise(() => undefined));
      const { props } = renderCamera();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      expect(props.onShot).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('ignores a second press within 150 ms and accepts one after it', async () => {
      const { props } = await renderLive();
      const shutter = screen.getByTestId('rapid-camera-shutter');

      await userEvent.click(shutter);
      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));

      nowValue += 149;
      await userEvent.click(shutter);
      expect(props.onShot).toHaveBeenCalledTimes(1);

      nowValue += 1;
      await userEvent.click(shutter);
      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(2));
    });

    it('announces the shot number and vibrates once', async () => {
      await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
      expect(window.navigator.vibrate).toHaveBeenCalledWith(10);
    });

    it('flashes the viewfinder briefly', async () => {
      jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'queueMicrotask'] });
      try {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        await renderLive();
        const stage = screen.getByTestId('rapid-camera');
        expect(stage.querySelector('.flash')).toBeNull();
        await user.click(screen.getByTestId('rapid-camera-shutter'));
        expect(stage.querySelector('.flash')).not.toBeNull();
        act(() => {
          jest.advanceTimersByTime(100);
        });
        expect(stage.querySelector('.flash')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('still takes the photo on a device without navigator.vibrate', async () => {
      delete (window.navigator as unknown as Record<string, unknown>).vibrate;
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));
    });

    it('with reduced motion there is no flash and no vibration', async () => {
      const media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
      try {
        const { props } = await renderLive();
        await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
        await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));
        expect(window.navigator.vibrate).not.toHaveBeenCalled();
      } finally {
        media.restore();
      }
    });

    it('onShot is called synchronously in the press, before the frame is encoded', async () => {
      let release!: (blob: Blob) => void;
      (window as unknown as { ImageCapture: unknown }).ImageCapture = jest.fn(() => ({
        takePhoto: () => new Promise<Blob>((r) => (release = r)),
      }));
      const { props } = await renderLive();
      const shutter = screen.getByTestId('rapid-camera-shutter');
      act(() => {
        shutter.click();
      });
      // The frame is still being encoded: the host has already been told.
      expect(props.onShot).toHaveBeenCalledTimes(1);
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(status()).toBeEmptyDOMElement();
      await act(async () => release(new Blob(['jpeg'], { type: 'image/jpeg' })));
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
    });

    it('the canvas path also resolves to a JPEG File', async () => {
      delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: jest.fn(),
      } as unknown as CanvasRenderingContext2D);
      jest
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation((cb) => cb(new Blob(['jpeg'], { type: 'image/jpeg' })));
      const { props } = await renderLive();
      const video = screen.getByTestId('rapid-camera-video') as HTMLVideoElement;
      Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 });
      Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 });
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      const frame = (props.onShot as jest.Mock).mock.calls[0]![0] as Promise<File>;
      expect((await frame).type).toBe('image/jpeg');
    });

    it('a frame that cannot be captured rejects, is not announced and adds no tray tile', async () => {
      delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
      trackSettings = { width: 4032, height: 3024 };
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      const frame = (props.onShot as jest.Mock).mock.calls[0]![0] as Promise<File>;
      await expect(frame).rejects.toThrow();
      await act(async () => undefined);
      expect(status()).toBeEmptyDOMElement();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(screen.getByTestId('rapid-camera-tray').children).toHaveLength(0);
    });

    it('announces Photo 1 then Photo 2 for consecutive shots', async () => {
      await renderLive();
      const shutter = screen.getByTestId('rapid-camera-shutter');
      await userEvent.click(shutter);
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
      nowValue += 200;
      await userEvent.click(shutter);
      await waitFor(() => expect(status()).toHaveTextContent('Photo 2 taken.'));
    });

    it('after Remove last the next shot reuses the freed number', async () => {
      const onRemoveLast = jest.fn();
      const { rerender, props } = await renderLive({ onRemoveLast });
      const shutter = screen.getByTestId('rapid-camera-shutter');
      await userEvent.click(shutter);
      nowValue += 200;
      await userEvent.click(shutter);
      await waitFor(() => expect(status()).toHaveTextContent('Photo 2 taken.'));
      rerender(<RapidCamera {...props} shotCount={2} onRemoveLast={onRemoveLast} />);
      await userEvent.click(screen.getByTestId('rapid-camera-remove-last'));
      nowValue += 200;
      await userEvent.click(shutter);
      await waitFor(() => expect(status()).toHaveTextContent('Photo 2 taken.'));
    });

    it('Remove last never drives the shot number below zero', async () => {
      const onRemoveLast = jest.fn();
      await renderLive({ shotCount: 1, onRemoveLast });
      await userEvent.click(screen.getByTestId('rapid-camera-remove-last'));
      await userEvent.click(screen.getByTestId('rapid-camera-remove-last'));
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
    });
  });

  describe('first-frame gate', () => {
    const shutter = () => screen.getByTestId('rapid-camera-shutter');
    const video = () => screen.getByTestId('rapid-camera-video') as HTMLVideoElement;

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'queueMicrotask'] });
      jest.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(0);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    /** Renders and lets the fake stream start (live) without any frame event. */
    async function renderLiveNoFrame() {
      const view = renderCamera();
      await act(async () => undefined);
      await act(async () => undefined);
      expect(getUserMedia).toHaveBeenCalled();
      return view;
    }

    const press = async () => {
      nowValue += 200;
      await act(async () => {
        fireEvent.click(shutter());
      });
    };

    it('keeps the shutter aria-disabled until a frame arrives, and a press adds no shot', async () => {
      const { props } = await renderLiveNoFrame();
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');

      await press();

      expect(props.onShot).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('enables the shutter on loadeddata and a press then shoots', async () => {
      const { props } = await renderLiveNoFrame();

      act(() => {
        video().dispatchEvent(new Event('loadeddata'));
      });
      expect(shutter()).not.toHaveAttribute('aria-disabled');

      await press();
      expect(props.onShot).toHaveBeenCalledTimes(1);
    });

    it('enables the shutter on playing as well', async () => {
      const { props } = await renderLiveNoFrame();
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');

      act(() => {
        video().dispatchEvent(new Event('playing'));
      });
      expect(shutter()).not.toHaveAttribute('aria-disabled');

      await press();
      expect(props.onShot).toHaveBeenCalledTimes(1);
    });

    it('with a frame already decoded (readyState >= 2) enables it on the next tick, not before', async () => {
      jest.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
      await renderLiveNoFrame();
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(shutter()).not.toHaveAttribute('aria-disabled');
    });

    it('falls back to enabling the shutter after 1500 ms without any frame event', async () => {
      await renderLiveNoFrame();

      act(() => {
        jest.advanceTimersByTime(1_499);
      });
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(shutter()).not.toHaveAttribute('aria-disabled');
    });

    it('does not use the 0 ms path for a video without a decoded frame', async () => {
      await renderLiveNoFrame();
      act(() => {
        jest.advanceTimersByTime(0);
      });
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');
    });

    it('is not ready while the stream is still starting, whatever the clock says', () => {
      getUserMedia.mockImplementationOnce(() => new Promise(() => undefined));
      renderCamera();
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');
    });

    it('resets when the stream stops and waits for a new frame after it restarts', async () => {
      await renderLiveNoFrame();
      act(() => {
        video().dispatchEvent(new Event('loadeddata'));
      });
      expect(shutter()).not.toHaveAttribute('aria-disabled');

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => undefined);
      await act(async () => undefined);
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      // Live again, but the old frame no longer counts.
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');

      act(() => {
        video().dispatchEvent(new Event('playing'));
      });
      expect(shutter()).not.toHaveAttribute('aria-disabled');
    });

    it('stops listening for frames when the camera unmounts', async () => {
      const { unmount } = await renderLiveNoFrame();
      const element = video();
      const remove = jest.spyOn(element, 'removeEventListener');

      unmount();

      expect(remove).toHaveBeenCalledWith('loadeddata', expect.any(Function));
      expect(remove).toHaveBeenCalledWith('playing', expect.any(Function));
    });
  });

  describe('exit label, tray and remove last', () => {
    it('reads Close with no shots and shows no pill or Done anywhere', async () => {
      await renderLive();
      expect(screen.getByTestId('rapid-camera-review')).toHaveTextContent(/^Close$/);
      expect(screen.queryByTestId('rapid-camera-count')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rapid-camera-done')).not.toBeInTheDocument();
      expect(screen.queryByText('Done', { exact: true })).not.toBeInTheDocument();
    });

    it('reads Review (n) and counts shots still saving', async () => {
      const { rerender, props } = await renderLive({ shotCount: 1 });
      expect(screen.getByTestId('rapid-camera-review')).toHaveTextContent('Review (1)');
      rerender(<RapidCamera {...props} shotCount={2} savingCount={1} />);
      expect(screen.getByTestId('rapid-camera-review')).toHaveTextContent('Review (3)');
      expect(screen.queryByText('Done', { exact: true })).not.toBeInTheDocument();
    });

    it('adds each shot to the tray, newest first', async () => {
      await renderLive();
      const shutter = screen.getByTestId('rapid-camera-shutter');
      await userEvent.click(shutter);
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(1),
      );
      nowValue += 200;
      await userEvent.click(shutter);
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(2),
      );
      const srcs = Array.from(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).map(
        (img) => img.getAttribute('src'),
      );
      expect(srcs).toEqual(['blob:shot-2', 'blob:shot-1']);
    });

    it('keeps only the six newest in the tray and revokes the rest', async () => {
      await renderLive();
      const shutter = screen.getByTestId('rapid-camera-shutter');
      for (let i = 0; i < 7; i += 1) {
        nowValue += 200;
        await userEvent.click(shutter);
        await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(i + 1));
      }
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(6),
      );
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:shot-1');
    });

    it('falls back to the host last-shot thumbnail when the tray is empty', async () => {
      await renderLive({ lastShotUrl: 'blob:host-last', shotCount: 1 });
      const img = screen.getByTestId('rapid-camera-tray').querySelector('img');
      expect(img).toHaveAttribute('src', 'blob:host-last');
    });

    it('hides Remove last without shots or without a handler', async () => {
      const { rerender, props } = await renderLive({ shotCount: 0, onRemoveLast: jest.fn() });
      expect(screen.queryByTestId('rapid-camera-remove-last')).not.toBeInTheDocument();
      rerender(<RapidCamera {...props} shotCount={2} onRemoveLast={undefined} />);
      expect(screen.queryByTestId('rapid-camera-remove-last')).not.toBeInTheDocument();
    });

    it('Remove last calls the host, drops the newest thumbnail and announces the count', async () => {
      const onRemoveLast = jest.fn();
      const { rerender, props } = await renderLive({ shotCount: 0, onRemoveLast });
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));
      rerender(<RapidCamera {...props} shotCount={1} onRemoveLast={onRemoveLast} />);
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(1),
      );

      await userEvent.click(screen.getByTestId('rapid-camera-remove-last'));

      expect(onRemoveLast).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:shot-1');
      expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(0);
      expect(status()).toHaveTextContent('Last photo removed. 0 photos.');
    });

    it('Remove last with an empty tray still calls the host', async () => {
      const onRemoveLast = jest.fn();
      await renderLive({ shotCount: 2, onRemoveLast });
      await userEvent.click(screen.getByTestId('rapid-camera-remove-last'));
      expect(onRemoveLast).toHaveBeenCalledTimes(1);
      expect(status()).toHaveTextContent('Last photo removed. 1 photo.');
    });
  });

  describe('closing and stream lifetime', () => {
    it('Close (nothing saving) calls onClose at once', async () => {
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-review'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape calls onClose', async () => {
      const { props } = await renderLive();
      await userEvent.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalled();
    });

    it('stops every track when the camera closes', async () => {
      const { rerender, props } = await renderLive();
      expect(tracks[0]!.stop).not.toHaveBeenCalled();
      rerender(<RapidCamera {...props} open={false} />);
      expect(tracks[0]!.stop).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('rapid-camera')).not.toBeInTheDocument();
    });

    it('stops every track on unmount and revokes tray thumbnails', async () => {
      const { unmount } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));

      unmount();

      expect(tracks[0]!.stop).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:shot-1');
    });

    it('stops a stream that arrives after the camera was already closed', async () => {
      let resolve!: (stream: unknown) => void;
      getUserMedia.mockImplementationOnce(
        () => new Promise((r) => (resolve = r as (stream: unknown) => void)),
      );
      const { unmount } = renderCamera();
      unmount();

      const late = makeTrack();
      await act(async () => {
        resolve(makeStream(late));
      });

      expect(late.stop).toHaveBeenCalledTimes(1);
    });

    it('stops the stream while the page is hidden and restarts it when visible again', async () => {
      await renderLive();
      expect(getUserMedia).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(tracks[0]!.stop).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('rapid-camera-shutter')).toHaveAttribute('aria-disabled', 'true');

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled'),
      );
    });

    it('does not request a stream when it opens while the page is hidden', () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      renderCamera();
      expect(getUserMedia).not.toHaveBeenCalled();
    });
  });

  describe('switch camera and flash', () => {
    it('shows Switch camera only with two or more video inputs', async () => {
      await renderLive();
      expect(screen.queryByTestId('rapid-camera-switch')).not.toBeInTheDocument();
    });

    it('switches to the front camera, stops the old stream and announces it', async () => {
      enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }, { kind: 'videoinput' }]);
      await renderLive();
      const switchButton = await screen.findByRole('button', { name: 'Switch camera' });

      await userEvent.click(switchButton);

      expect(status()).toHaveTextContent('Using the front camera.');
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      expect(getUserMedia).toHaveBeenLastCalledWith({
        video: expect.objectContaining({ facingMode: 'user' }),
        audio: false,
      });
      expect(tracks[0]!.stop).toHaveBeenCalled();

      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled'),
      );
      await userEvent.click(screen.getByTestId('rapid-camera-switch'));
      expect(status()).toHaveTextContent('Using the back camera.');
    });

    it('ignores a failing device list (switching is optional)', async () => {
      enumerateDevices.mockRejectedValue(new Error('nope'));
      await renderLive();
      await act(async () => undefined);
      expect(screen.queryByTestId('rapid-camera-switch')).not.toBeInTheDocument();
    });

    it('shows Flash only when the track has a torch', async () => {
      await renderLive();
      expect(screen.queryByTestId('rapid-camera-flash')).not.toBeInTheDocument();
    });

    it('toggles the torch on and off and announces each state', async () => {
      installMediaDevices({ torch: true });
      await renderLive();
      const flash = await screen.findByRole('button', { name: 'Flash' });
      expect(flash).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(flash);
      await waitFor(() => expect(flash).toHaveAttribute('aria-pressed', 'true'));
      expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });
      expect(status()).toHaveTextContent('Flash on.');

      await userEvent.click(flash);
      await waitFor(() => expect(flash).toHaveAttribute('aria-pressed', 'false'));
      expect(tracks[0]!.applyConstraints).toHaveBeenLastCalledWith({
        advanced: [{ torch: false }],
      });
      expect(status()).toHaveTextContent('Flash off.');
    });

    it('stays off when the device refuses the torch', async () => {
      installMediaDevices({ torch: true });
      await renderLive();
      (tracks[0]!.applyConstraints as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(
        new Error('refused'),
      );

      await userEvent.click(await screen.findByRole('button', { name: 'Flash' }));

      await waitFor(() => expect(status()).toHaveTextContent('Flash off.'));
      expect(screen.getByTestId('rapid-camera-flash')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('closing wait (Review, Close and Escape)', () => {
    const review = () => screen.getByTestId('rapid-camera-review');

    it('Review with a shot still saving waits: label, aria-busy, announcement, shutter disabled', async () => {
      const { props, rerender } = await renderLive({ shotCount: 1, savingCount: 1 });
      expect(review()).toHaveTextContent('Review (2)');

      await userEvent.click(review());

      expect(props.onClose).not.toHaveBeenCalled();
      expect(review()).toHaveTextContent('Saving photos…');
      expect(review()).toHaveAttribute('aria-busy', 'true');
      expect(status()).toHaveTextContent('Saving photos…');
      expect(screen.getByTestId('rapid-camera-shutter')).toHaveAttribute('aria-disabled', 'true');

      // A press while closing is ignored (no new shot may start).
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      expect(props.onShot).not.toHaveBeenCalled();

      rerender(<RapidCamera {...props} shotCount={2} savingCount={0} />);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close while a later rerender still has shots saving', async () => {
      const { props, rerender } = await renderLive({ savingCount: 2 });
      await userEvent.click(review());
      rerender(<RapidCamera {...props} shotCount={1} savingCount={1} />);
      expect(props.onClose).not.toHaveBeenCalled();
      rerender(<RapidCamera {...props} shotCount={2} savingCount={0} />);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('is not aria-busy and shows no saving text while nothing is closing', async () => {
      await renderLive({ savingCount: 1 });
      expect(review()).not.toHaveAttribute('aria-busy');
      expect(review()).not.toHaveTextContent('Saving photos…');
      expect(status()).toBeEmptyDOMElement();
    });

    it('Escape on the Sheet waits for saving shots, then closes once', async () => {
      const { props, rerender } = await renderLive({ savingCount: 1 });
      await userEvent.keyboard('{Escape}');
      expect(props.onClose).not.toHaveBeenCalled();
      expect(review()).toHaveTextContent('Saving photos…');
      rerender(<RapidCamera {...props} shotCount={1} savingCount={0} />);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('the error panel exit also waits while saving', async () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      const { props, rerender } = renderCamera({ savingCount: 1 });
      const close = screen.getByTestId('rapid-camera-error-close');
      expect(close).toHaveTextContent('Review (1)');
      await userEvent.click(close);
      expect(props.onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('rapid-camera-error-close')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('rapid-camera-error-close')).toHaveTextContent('Saving photos…');
      rerender(<RapidCamera {...props} savingCount={0} />);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    describe('wide Modal', () => {
      let media: MatchMediaControl;
      beforeEach(() => {
        media = installMatchMedia({ [WIDE]: true });
      });
      afterEach(() => media.restore());

      it('Escape waits for saving shots, then closes once', async () => {
        const { props, rerender } = await renderLive({ savingCount: 1 });
        await userEvent.keyboard('{Escape}');
        expect(props.onClose).not.toHaveBeenCalled();
        expect(review()).toHaveTextContent('Saving photos…');
        rerender(<RapidCamera {...props} shotCount={1} savingCount={0} />);
        expect(props.onClose).toHaveBeenCalledTimes(1);
      });
    });

    describe('10 s fallback', () => {
      beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'queueMicrotask'] });
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('closes after 10 000 ms of a hung write, and not a millisecond earlier', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { props } = await renderLive({ savingCount: 1 });
        await user.click(review());
        act(() => {
          jest.advanceTimersByTime(9_999);
        });
        expect(props.onClose).not.toHaveBeenCalled();
        act(() => {
          jest.advanceTimersByTime(1);
        });
        expect(props.onClose).toHaveBeenCalledTimes(1);
      });

      it('a host passing a new onClose lambda each render does not restart the timer', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const calls = jest.fn();
        const { props, rerender } = await renderLive({ savingCount: 1, onClose: () => calls('a') });
        await user.click(review());
        act(() => {
          jest.advanceTimersByTime(6_000);
        });
        rerender(<RapidCamera {...props} onClose={() => calls('b')} />);
        act(() => {
          jest.advanceTimersByTime(3_999);
        });
        expect(calls).not.toHaveBeenCalled();
        rerender(<RapidCamera {...props} onClose={() => calls('c')} />);
        act(() => {
          jest.advanceTimersByTime(1);
        });
        // The latest lambda runs, exactly once.
        expect(calls).toHaveBeenCalledTimes(1);
        expect(calls).toHaveBeenCalledWith('c');
      });

      it('clears the timer when the camera unmounts before it fires', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { props, unmount } = await renderLive({ savingCount: 1 });
        await user.click(review());
        unmount();
        act(() => {
          jest.advanceTimersByTime(20_000);
        });
        expect(props.onClose).not.toHaveBeenCalled();
      });

      it('does not start the timer when nothing is closing', async () => {
        const { props } = await renderLive({ savingCount: 1 });
        act(() => {
          jest.advanceTimersByTime(30_000);
        });
        expect(props.onClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('"Saving photos…" announcement', () => {
    const review = () => screen.getByTestId('rapid-camera-review');
    const SAVING = 'Saving photos…';

    /** After the first announcement something else is announced (a camera switch); a repeat would replace it. */
    async function expectAnnouncedOnce(
      props: RapidCameraProps,
      startClose: () => Promise<unknown>,
      closeAgain: () => Promise<unknown>,
    ) {
      await startClose();
      expect(props.onClose).not.toHaveBeenCalled();
      expect(status()).toHaveTextContent(SAVING);
      await userEvent.click(await screen.findByTestId('rapid-camera-switch'));
      expect(status()).toHaveTextContent('Using the front camera.');

      await closeAgain();

      expect(status()).toHaveTextContent('Using the front camera.');
      expect(status()).not.toHaveTextContent(SAVING);
    }

    const saving = { shotCount: 1, savingCount: 1 };

    beforeEach(() => {
      enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }, { kind: 'videoinput' }]);
    });

    it('Escape on the Sheet announces once', async () => {
      const { props } = await renderLive({ ...saving, onRemoveLast: jest.fn() });
      await expectAnnouncedOnce(
        props,
        () => userEvent.keyboard('{Escape}'),
        () => userEvent.keyboard('{Escape}'),
      );
    });

    it('the Sheet backdrop announces once', async () => {
      const { props } = await renderLive({ ...saving, onRemoveLast: jest.fn() });
      const backdrop = () => screen.getByTestId('rapid-camera-sheet-backdrop');
      await expectAnnouncedOnce(
        props,
        () => userEvent.click(backdrop()),
        () => userEvent.click(backdrop()),
      );
    });

    it('pressing Review twice announces once', async () => {
      const { props } = await renderLive({ ...saving, onRemoveLast: jest.fn() });
      await expectAnnouncedOnce(
        props,
        () => userEvent.click(review()),
        () => userEvent.click(review()),
      );
    });

    describe('wide Modal', () => {
      let media: MatchMediaControl;
      beforeEach(() => {
        media = installMatchMedia({ [WIDE]: true });
      });
      afterEach(() => media.restore());

      it('Escape announces once', async () => {
        const { props } = await renderLive({ ...saving, onRemoveLast: jest.fn() });
        await expectAnnouncedOnce(
          props,
          () => userEvent.keyboard('{Escape}'),
          () => userEvent.keyboard('{Escape}'),
        );
      });

      it('the backdrop announces once', async () => {
        const { props } = await renderLive({ ...saving, onRemoveLast: jest.fn() });
        const backdrop = () => document.querySelector('.modalBackdrop') as HTMLElement;
        expect(backdrop()).not.toBeNull();
        await expectAnnouncedOnce(
          props,
          () => userEvent.click(backdrop()),
          () => userEvent.click(backdrop()),
        );
      });
    });

    it('announces nothing when nothing is saving: it just closes', async () => {
      const { props } = await renderLive({ shotCount: 1 });
      await userEvent.click(review());
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(status()).not.toHaveTextContent(SAVING);
    });

    it('Escape with nothing saving announces nothing', async () => {
      const { props } = await renderLive();
      await userEvent.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(status()).toBeEmptyDOMElement();
    });

    it('a new close attempt after the previous one ended announces again', async () => {
      const { props, rerender } = await renderLive({ ...saving });
      await userEvent.click(review());
      expect(status()).toHaveTextContent(SAVING);
      rerender(<RapidCamera {...props} shotCount={2} savingCount={0} />);
      expect(props.onClose).toHaveBeenCalledTimes(1);

      // Real flow: close, the host sets open false, later true again on the same instance.
      rerender(<RapidCamera {...props} open={false} shotCount={0} savingCount={0} />);
      rerender(<RapidCamera {...props} open shotCount={0} savingCount={1} />);
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled'),
      );
      expect(review()).not.toHaveTextContent(SAVING);
      expect(status()).not.toHaveTextContent(SAVING);

      await userEvent.click(review());
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(status()).toHaveTextContent(SAVING);
    });
  });

  describe('Remove last while shots are saving', () => {
    const remove = () => screen.getByTestId('rapid-camera-remove-last');

    it('is shown but aria-disabled while a shot is saving, and a press does nothing', async () => {
      const onRemoveLast = jest.fn();
      const { props } = await renderLive({ shotCount: 2, savingCount: 1, onRemoveLast });
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(1),
      );
      const announcedBefore = status().textContent;
      revokeObjectURL.mockClear();

      expect(remove()).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(remove());

      expect(onRemoveLast).not.toHaveBeenCalled();
      expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(1);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(status().textContent).toBe(announcedBefore);
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('removes as before once nothing is saving', async () => {
      const onRemoveLast = jest.fn();
      const { rerender, props } = await renderLive({
        shotCount: 2,
        savingCount: 1,
        onRemoveLast,
      });
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() =>
        expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(1),
      );
      await userEvent.click(remove());
      expect(onRemoveLast).not.toHaveBeenCalled();

      rerender(
        <RapidCamera {...props} shotCount={3} savingCount={0} onRemoveLast={onRemoveLast} />,
      );
      expect(remove()).not.toHaveAttribute('aria-disabled');
      await userEvent.click(remove());

      expect(onRemoveLast).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(0);
      expect(status()).toHaveTextContent('Last photo removed. 2 photos.');
    });

    it('is not disabled with shots stored and nothing saving', async () => {
      await renderLive({ shotCount: 2, onRemoveLast: jest.fn() });
      expect(remove()).not.toHaveAttribute('aria-disabled');
    });
  });

  describe('Use camera app label', () => {
    it('keeps the exact accessible name and description with the label wrapped for ellipsis', async () => {
      await renderLive();
      const button = screen.getByRole('button', { name: 'Use camera app' });
      expect(button).toBe(screen.getByTestId('rapid-camera-use-app'));
      expect(button.querySelector('.labelClip')).toHaveTextContent(/^Use camera app$/);
      expect(button).toHaveAccessibleDescription(
        "Opens your phone's camera. Photos are full size and kept in your camera roll.",
      );
    });
  });

  describe('waiting line', () => {
    it('is absent at 0', async () => {
      await renderLive({ waitingCount: 0 });
      expect(screen.queryByTestId('rapid-camera-waiting')).not.toBeInTheDocument();
    });

    it('shows the plural and singular wording, outside the live region', async () => {
      const { rerender, props } = await renderLive({ waitingCount: 2 });
      const line = screen.getByTestId('rapid-camera-waiting');
      expect(line).toHaveTextContent('2 photos waiting to upload');
      expect(status()).not.toContainElement(line);
      expect(line).not.toHaveAttribute('aria-live');
      rerender(<RapidCamera {...props} waitingCount={1} />);
      expect(screen.getByTestId('rapid-camera-waiting')).toHaveTextContent(
        '1 photo waiting to upload',
      );
    });

    it('is also shown in the error panel state', () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      renderCamera({ waitingCount: 3 });
      expect(screen.getByTestId('rapid-camera-waiting')).toHaveTextContent(
        '3 photos waiting to upload',
      );
    });
  });

  describe('panels and top bar', () => {
    it('the starting panel shows the allow hint', () => {
      getUserMedia.mockImplementationOnce(() => new Promise(() => undefined));
      renderCamera();
      expect(screen.getByTestId('rapid-camera-allow-hint')).toHaveTextContent(
        'If your browser asks, choose Allow.',
      );
    });

    it('the allow hint is gone once live', async () => {
      await renderLive();
      expect(screen.queryByTestId('rapid-camera-allow-hint')).not.toBeInTheDocument();
    });

    it.each(['NotFoundError', 'OverconstrainedError'])(
      '%s shows the full-size fallback lead',
      async (name) => {
        getUserMedia.mockRejectedValueOnce(domError(name));
        renderCamera();
        const panel = await screen.findByTestId('rapid-camera-error');
        expect(
          within(panel).getByText(
            'Photos from your camera app are full size and are also kept in your camera roll.',
          ),
        ).toBeVisible();
      },
    );

    it('denied shows the fallback lead plus the denied hint; busy shows the busy text only', async () => {
      getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
      const denied = renderCamera();
      const panel = await screen.findByTestId('rapid-camera-error');
      expect(within(panel).getByText(/full size and are also kept/)).toBeVisible();
      expect(within(panel).getByText(/allow camera access for this site/i)).toBeVisible();
      denied.unmount();
      window.sessionStorage.clear();

      getUserMedia.mockRejectedValueOnce(domError('NotReadableError'));
      renderCamera();
      const busy = await screen.findByTestId('rapid-camera-error');
      expect(within(busy).getByText('The camera is being used by another app.')).toBeVisible();
      expect(within(busy).queryByText(/full size/)).not.toBeInTheDocument();
    });

    it('the error exit reads Review (n) with shots and calls requestClose', async () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      const { props } = renderCamera({ shotCount: 2 });
      const close = screen.getByTestId('rapid-camera-error-close');
      expect(close).toHaveTextContent('Review (2)');
      await userEvent.click(close);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('Use camera app describes itself through aria-describedby', async () => {
      await renderLive();
      const button = screen.getByTestId('rapid-camera-use-app');
      const id = button.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toHaveTextContent(
        "Opens your phone's camera. Photos are full size and kept in your camera roll.",
      );
    });

    it('Remove last sits under the tray in the left control cell, not in the top bar', async () => {
      await renderLive({ shotCount: 1, onRemoveLast: jest.fn() });
      const tray = screen.getByTestId('rapid-camera-tray');
      const remove = screen.getByTestId('rapid-camera-remove-last');
      expect(remove.parentElement).toBe(tray.parentElement);
      expect(remove.compareDocumentPosition(tray) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(screen.getByTestId('rapid-camera-review').parentElement).not.toBe(
        remove.parentElement,
      );
    });

    it('top bar holds exactly Use camera app and the exit button', async () => {
      await renderLive();
      const bar = screen.getByTestId('rapid-camera-review').parentElement!;
      expect(
        within(bar)
          .getAllByRole('button')
          .map((b) => b.getAttribute('data-testid')),
      ).toEqual(['rapid-camera-use-app', 'rapid-camera-review']);
    });

    it('Tab order: Use camera app, Review, hint buttons, chips, Remove last, shutter', async () => {
      trackSettings = { width: 640, height: 480 };
      delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
      await renderLive({
        shotCount: 1,
        onRemoveLast: jest.fn(),
        children: <button data-testid="chip-a">Area</button>,
      });
      await screen.findByTestId('rapid-camera-lowres');
      screen.getByTestId('rapid-camera-use-app').focus();
      const order: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        await userEvent.tab();
        order.push(document.activeElement?.getAttribute('data-testid') ?? '?');
      }
      expect(order).toEqual([
        'rapid-camera-review',
        'rapid-camera-lowres-use-app',
        'rapid-camera-lowres-dismiss',
        'chip-a',
        'rapid-camera-remove-last',
        'rapid-camera-shutter',
      ]);
    });
  });

  describe('low-resolution hint', () => {
    const hint = () => screen.queryByTestId('rapid-camera-lowres');
    const LOW_TEXT =
      "This preview is lower quality than your phone's camera. For full-size photos, use the camera app.";

    function noImageCapture() {
      delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
    }

    /** Canvas path: a 640x480 stub frame (jsdom has no 2d context). */
    function canvasShots() {
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: jest.fn(),
      } as unknown as CanvasRenderingContext2D);
      jest
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation((cb) => cb(new Blob(['jpeg'], { type: 'image/jpeg' })));
      const video = screen.getByTestId('rapid-camera-video') as HTMLVideoElement;
      Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 });
      Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 });
    }

    function mockBitmap(width: number, height: number) {
      const fn = jest.fn(async () => ({ width, height, close: jest.fn() }));
      (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = fn;
      return fn;
    }

    const shoot = async () => {
      nowValue += 200;
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
    };

    it('without ImageCapture and a 1920x1080 track the hint shows before any shot, announced once', async () => {
      noImageCapture();
      trackSettings = { width: 1920, height: 1080 };
      await renderLive();
      expect(hint()).toBeInTheDocument();
      expect(within(hint()!).getByText(LOW_TEXT)).toBeInTheDocument();
      expect(status()).toHaveTextContent(LOW_TEXT);
    });

    it('does not announce the hint again after a later announcement', async () => {
      noImageCapture();
      trackSettings = { width: 1920, height: 1080 };
      await renderLive();
      canvasShots();
      mockBitmap(640, 480);
      await shoot();
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
      await act(async () => undefined);
      expect(status()).toHaveTextContent('Photo 1 taken.');
      expect(status()).not.toHaveTextContent(LOW_TEXT);
    });

    it('a 4032x3024 track shows no hint; a 640x480 first shot then does', async () => {
      noImageCapture();
      trackSettings = { width: 4032, height: 3024 };
      await renderLive();
      expect(hint()).not.toBeInTheDocument();
      canvasShots();
      const bitmap = mockBitmap(640, 480);
      await shoot();
      expect(await screen.findByTestId('rapid-camera-lowres')).toBeInTheDocument();
      expect(bitmap).toHaveBeenCalledTimes(1);
    });

    it('an unknown track size (no width or height) shows no hint', async () => {
      noImageCapture();
      trackSettings = {};
      await renderLive();
      expect(hint()).not.toBeInTheDocument();
    });

    it('with ImageCapture a low track size is ignored until a shot proves it', async () => {
      trackSettings = { width: 640, height: 480 };
      await renderLive();
      expect(hint()).not.toBeInTheDocument();
      mockBitmap(640, 480);
      await shoot();
      expect(await screen.findByTestId('rapid-camera-lowres')).toBeInTheDocument();
    });

    it('a full-size first shot shows no hint', async () => {
      mockBitmap(4032, 3024);
      await renderLive();
      await shoot();
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
      await act(async () => undefined);
      expect(hint()).not.toBeInTheDocument();
    });

    it('an unreadable shot size (no createImageBitmap) shows no hint', async () => {
      await renderLive();
      await shoot();
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
      await act(async () => undefined);
      expect(hint()).not.toBeInTheDocument();
    });

    it('only the first shot of a mount is measured', async () => {
      const bitmap = mockBitmap(4032, 3024);
      await renderLive();
      await shoot();
      await waitFor(() => expect(bitmap).toHaveBeenCalledTimes(1));
      await shoot();
      await waitFor(() => expect(status()).toHaveTextContent('Photo 2 taken.'));
      await act(async () => undefined);
      expect(bitmap).toHaveBeenCalledTimes(1);
    });

    it('a low live track skips the per-shot measurement', async () => {
      noImageCapture();
      trackSettings = { width: 640, height: 480 };
      await renderLive();
      canvasShots();
      const bitmap = mockBitmap(640, 480);
      await shoot();
      await waitFor(() => expect(status()).toHaveTextContent('Photo 1 taken.'));
      expect(bitmap).not.toHaveBeenCalled();
    });

    it('Not now hides the hint, focuses the shutter and remembers it for the session', async () => {
      noImageCapture();
      trackSettings = { width: 640, height: 480 };
      await renderLive();
      screen.getByTestId('rapid-camera-lowres-dismiss').focus();

      await userEvent.click(screen.getByTestId('rapid-camera-lowres-dismiss'));

      expect(hint()).not.toBeInTheDocument();
      expect(screen.getByTestId('rapid-camera-shutter')).toHaveFocus();
      expect(window.sessionStorage.getItem(LOW_RES_DISMISSED_SESSION_KEY)).not.toBeNull();
    });

    it('a dismissed hint is not revived by a later low shot in the same mount', async () => {
      noImageCapture();
      trackSettings = { width: 4032, height: 3024 };
      await renderLive();
      canvasShots();
      mockBitmap(640, 480);
      await shoot();
      await userEvent.click(await screen.findByTestId('rapid-camera-lowres-dismiss'));
      await shoot();
      await waitFor(() => expect(status()).toHaveTextContent('Photo 2 taken.'));
      expect(hint()).not.toBeInTheDocument();
    });

    it('a remount in the same session shows no hint once dismissed', async () => {
      noImageCapture();
      trackSettings = { width: 640, height: 480 };
      const first = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-lowres-dismiss'));
      first.unmount();

      await renderLive();
      expect(hint()).not.toBeInTheDocument();
      expect(status()).not.toHaveTextContent(LOW_TEXT);
    });

    it('the hint Use camera app calls onUseCameraApp', async () => {
      noImageCapture();
      trackSettings = { width: 640, height: 480 };
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-lowres-use-app'));
      expect(props.onUseCameraApp).toHaveBeenCalledTimes(1);
    });

    it('never blocks the shutter', async () => {
      noImageCapture();
      trackSettings = { width: 640, height: 480 };
      const { props } = await renderLive();
      canvasShots();
      expect(hint()).toBeInTheDocument();
      expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled');
      await shoot();
      expect(props.onShot).toHaveBeenCalledTimes(1);
    });

    it('is not shown while the camera is not live', () => {
      noImageCapture();
      trackSettings = { width: 640, height: 480 };
      getUserMedia.mockImplementationOnce(() => new Promise(() => undefined));
      renderCamera();
      expect(hint()).not.toBeInTheDocument();
    });
  });
});
