import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { captureFrame } from './captureFrame.js';

type Win = { ImageCapture?: unknown };

function makeVideo(width = 640, height = 480): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: width });
  Object.defineProperty(video, 'videoHeight', { value: height });
  return video;
}

const track = {} as MediaStreamTrack;

function mockToBlob(blob: Blob | null) {
  return jest
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((cb: BlobCallback) => cb(blob));
}

describe('captureFrame', () => {
  let drawImage: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    drawImage = jest.fn();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as unknown as Win).ImageCapture;
  });

  describe('ImageCapture path', () => {
    it('returns the full-resolution still as a capture-<time>.jpg File', async () => {
      const takePhoto = jest.fn(async () => new Blob(['x'], { type: 'image/jpeg' }));
      const ctor = jest.fn((_track: unknown) => ({ takePhoto }));
      (window as unknown as Win).ImageCapture = ctor;

      const file = await captureFrame(makeVideo(), track);

      expect(ctor).toHaveBeenCalledWith(track);
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('capture-1700000000000.jpg');
      expect(file.type).toBe('image/jpeg');
      expect(drawImage).not.toHaveBeenCalled();
    });

    it('defaults an untyped blob to image/jpeg', async () => {
      (window as unknown as Win).ImageCapture = jest.fn(() => ({
        takePhoto: async () => new Blob(['x']),
      }));
      const file = await captureFrame(makeVideo(), track);
      expect(file.type).toBe('image/jpeg');
    });

    it('falls back to the canvas when takePhoto rejects', async () => {
      (window as unknown as Win).ImageCapture = jest.fn(() => ({
        takePhoto: async () => {
          throw new Error('unsupported');
        },
      }));
      mockToBlob(new Blob(['c'], { type: 'image/jpeg' }));

      const file = await captureFrame(makeVideo(), track);

      expect(drawImage).toHaveBeenCalledTimes(1);
      expect(file.name).toBe('capture-1700000000000.jpg');
    });

    it('skips ImageCapture when there is no track', async () => {
      const ctor = jest.fn();
      (window as unknown as Win).ImageCapture = ctor;
      mockToBlob(new Blob(['c'], { type: 'image/jpeg' }));

      await captureFrame(makeVideo(), null);

      expect(ctor).not.toHaveBeenCalled();
    });
  });

  describe('canvas fallback', () => {
    it('draws the current frame at video size and encodes JPEG at 0.92', async () => {
      const toBlob = mockToBlob(new Blob(['c'], { type: 'image/jpeg' }));
      const video = makeVideo(1280, 720);

      const file = await captureFrame(video, track);

      expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
      expect(file.type).toBe('image/jpeg');
    });

    it('rejects when the video has no frame yet', async () => {
      await expect(captureFrame(makeVideo(0, 0), null)).rejects.toThrow('No video frame');
    });

    it('rejects when there is no 2d context', async () => {
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      await expect(captureFrame(makeVideo(), null)).rejects.toThrow('No video frame');
    });

    it('rejects when the frame cannot be encoded', async () => {
      mockToBlob(null);
      await expect(captureFrame(makeVideo(), null)).rejects.toThrow('could not be encoded');
    });
  });
});
