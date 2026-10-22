/**
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { copyText } from './copyText.js';

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

afterEach(() => {
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  else delete (globalThis as Record<string, unknown>).navigator;
});

describe('copyText without a DOM', () => {
  it('resolves false when there is no document and no Clipboard API', async () => {
    await expect(copyText('x')).resolves.toBe(false);
  });

  it('resolves false when there is no navigator at all', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
