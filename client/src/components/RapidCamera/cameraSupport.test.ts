import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  CAMERA_DENIED_SESSION_KEY,
  isCameraDeniedThisSession,
  isLiveCameraSupported,
  prefersReducedMotion,
  rememberCameraDenied,
} from './cameraSupport.js';

describe('cameraSupport', () => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');

  beforeEach(() => window.sessionStorage.clear());

  afterEach(() => {
    jest.restoreAllMocks();
    if (original) Object.defineProperty(window.navigator, 'mediaDevices', original);
    else delete (window.navigator as unknown as Record<string, unknown>).mediaDevices;
  });

  describe('isLiveCameraSupported', () => {
    it('is true when getUserMedia exists', () => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: jest.fn() },
      });
      expect(isLiveCameraSupported()).toBe(true);
    });

    it('is false without mediaDevices (plain http)', () => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
      expect(isLiveCameraSupported()).toBe(false);
    });

    it('is false when mediaDevices has no getUserMedia', () => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: {},
      });
      expect(isLiveCameraSupported()).toBe(false);
    });
  });

  describe('camera denied flag', () => {
    it('uses the documented session key', () => {
      expect(CAMERA_DENIED_SESSION_KEY).toBe('cornerstone.capture.cameraDenied');
    });

    it('is not denied until remembered, then denied for the session', () => {
      expect(isCameraDeniedThisSession()).toBe(false);
      rememberCameraDenied();
      expect(window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY)).toBe('1');
      expect(isCameraDeniedThisSession()).toBe(true);
    });

    it('treats unavailable storage as not denied and does not throw on remember', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(isCameraDeniedThisSession()).toBe(false);
      expect(() => rememberCameraDenied()).not.toThrow();
    });
  });

  describe('prefersReducedMotion', () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('reflects the media query', () => {
      window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as never;
      expect(prefersReducedMotion()).toBe(true);
      window.matchMedia = (() => ({ matches: false })) as never;
      expect(prefersReducedMotion()).toBe(false);
    });

    it('is false without matchMedia', () => {
      window.matchMedia = undefined as never;
      expect(prefersReducedMotion()).toBe(false);
    });
  });
});
