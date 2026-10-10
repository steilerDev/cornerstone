import { describe, it, expect } from '@jest/globals';
import { isApplePlatform } from './platform.js';

describe('isApplePlatform', () => {
  it.each(['MacIntel', 'MacPPC', 'iPhone', 'iPad', 'iPod'])(
    'is true for platform %s',
    (platform) => {
      expect(isApplePlatform({ platform, userAgent: 'Mozilla/5.0 (X11; Linux)' })).toBe(true);
    },
  );

  it.each(['Linux x86_64', 'Win32', 'Linux armv81'])('is false for platform %s', (platform) => {
    // The user agent must not override a non-empty platform.
    expect(isApplePlatform({ platform, userAgent: 'Mozilla/5.0 (Macintosh)' })).toBe(false);
  });

  it('falls back to the user agent when platform is empty', () => {
    expect(
      isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS)' }),
    ).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(
      false,
    );
  });

  it('reads the real navigator by default (jsdom is not Apple)', () => {
    expect(isApplePlatform()).toBe(false);
  });
});
