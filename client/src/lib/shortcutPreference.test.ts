import { jest, describe, it, expect, afterEach } from '@jest/globals';
import {
  readSingleKeyShortcutsEnabled,
  writeSingleKeyShortcutsEnabled,
} from './shortcutPreference.js';

describe('shortcutPreference (#2253 AC5)', () => {
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('defaults to on when nothing is stored', () => {
    expect(readSingleKeyShortcutsEnabled()).toBe(true);
  });

  it('reads off when the stored value is "off"', () => {
    localStorage.setItem('singleKeyShortcuts', 'off');
    expect(readSingleKeyShortcutsEnabled()).toBe(false);
  });

  it('treats any other stored value as on', () => {
    localStorage.setItem('singleKeyShortcuts', 'garbage');
    expect(readSingleKeyShortcutsEnabled()).toBe(true);
  });

  it('writes "off" when turned off', () => {
    writeSingleKeyShortcutsEnabled(false);
    expect(localStorage.getItem('singleKeyShortcuts')).toBe('off');
    expect(readSingleKeyShortcutsEnabled()).toBe(false);
  });

  it('removes the key when turned back on', () => {
    localStorage.setItem('singleKeyShortcuts', 'off');
    writeSingleKeyShortcutsEnabled(true);
    expect(localStorage.getItem('singleKeyShortcuts')).toBeNull();
    expect(readSingleKeyShortcutsEnabled()).toBe(true);
  });

  it('reads on when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readSingleKeyShortcutsEnabled()).toBe(true);
  });

  it('does not throw when storage throws on write (off and on)', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeSingleKeyShortcutsEnabled(false)).not.toThrow();
    expect(() => writeSingleKeyShortcutsEnabled(true)).not.toThrow();
  });
});
