import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { RapidCamera, CAMERA_DENIED_SESSION_KEY } from './RapidCamera.js';
import type { RapidCameraProps } from './RapidCamera.js';

interface FakeTrack {
  stop: jest.Mock;
  getCapabilities: jest.Mock;
  applyConstraints: jest.Mock;
}

function makeTrack(capabilities: Record<string, unknown> = {}): FakeTrack {
  return {
    stop: jest.fn(),
    getCapabilities: jest.fn(() => capabilities),
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
    installMediaDevices();
    installImageCapture();
    nowValue = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowValue);
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
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
      expect(screen.getByTestId('rapid-camera-shutter')).not.toHaveAttribute('aria-disabled');
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

    it('Done in the panel closes the camera', async () => {
      window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
      const { props } = renderCamera();
      const panel = screen.getByTestId('rapid-camera-error');
      await userEvent.click(within(panel).getByRole('button', { name: 'Done' }));
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
        expect(within(panel).getByText(/still take photos with your camera app/i)).toBeVisible();
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
    it('click delivers one JPEG File to onShot', async () => {
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));

      await waitFor(() => expect(props.onShot).toHaveBeenCalledTimes(1));
      const file = (props.onShot as jest.Mock).mock.calls[0]![0] as File;
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
      await renderLive({ shotCount: 2 });
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await waitFor(() => expect(status()).toHaveTextContent('Photo 3 taken.'));
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

    it('a frame that cannot be captured is neither delivered nor announced', async () => {
      delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-shutter'));
      await act(async () => undefined);
      expect(props.onShot).not.toHaveBeenCalled();
      expect(status()).toHaveTextContent('');
      expect(screen.getByTestId('rapid-camera-tray').children).toHaveLength(0);
    });
  });

  describe('counter, tray and remove last', () => {
    it('shows the host shot count with plural forms', async () => {
      const { rerender, props } = await renderLive({ shotCount: 1 });
      expect(screen.getByTestId('rapid-camera-count')).toHaveTextContent('1 photo');
      rerender(<RapidCamera {...props} shotCount={3} />);
      expect(screen.getByTestId('rapid-camera-count')).toHaveTextContent('3 photos');
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
      expect(screen.getByTestId('rapid-camera-tray').querySelectorAll('img')).toHaveLength(1);

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
    it('Done calls onClose', async () => {
      const { props } = await renderLive();
      await userEvent.click(screen.getByTestId('rapid-camera-done'));
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
});
