/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  LAST_QUICK_LOG_KEY,
  orderQuickLogModes,
  readLastQuickLog,
  writeLastQuickLog,
} from './quickLogStorage.js';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

describe('quickLogStorage', () => {
  it('uses a stable device-local key', () => {
    expect(LAST_QUICK_LOG_KEY).toBe('cornerstone.newSheet.lastQuickLog');
  });

  it('reads null when nothing is stored', () => {
    expect(readLastQuickLog()).toBeNull();
  });

  it.each(['photo', 'note', 'delivery'] as const)('round-trips %s', (mode) => {
    writeLastQuickLog(mode);
    expect(localStorage.getItem(LAST_QUICK_LOG_KEY)).toBe(mode);
    expect(readLastQuickLog()).toBe(mode);
  });

  it('treats an invalid stored value as null', () => {
    localStorage.setItem(LAST_QUICK_LOG_KEY, 'video');
    expect(readLastQuickLog()).toBeNull();
  });

  it('reads null when getItem throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLastQuickLog()).toBeNull();
  });

  it('does not throw when setItem throws, and stores nothing', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeLastQuickLog('note')).not.toThrow();
    jest.restoreAllMocks();
    expect(readLastQuickLog()).toBeNull();
  });
});

describe('orderQuickLogModes', () => {
  it('keeps the default order without a last used tile', () => {
    expect(orderQuickLogModes(null)).toEqual(['photo', 'note', 'delivery']);
  });

  it.each([
    ['photo', ['photo', 'note', 'delivery']],
    ['note', ['note', 'photo', 'delivery']],
    ['delivery', ['delivery', 'photo', 'note']],
  ] as const)('moves %s first and keeps the rest in default order', (last, expected) => {
    expect(orderQuickLogModes(last)).toEqual(expected);
  });
});
