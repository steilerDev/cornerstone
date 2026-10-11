import { describe, it, expect, afterEach } from '@jest/globals';
import { lockScroll } from './scrollLock.js';

const locked = () => document.documentElement.dataset.scrollLocked;

describe('lockScroll', () => {
  const releases: Array<() => void> = [];

  afterEach(() => {
    releases.splice(0).forEach((release) => release());
  });

  it('sets data-scroll-locked while a lock is held and clears it on release', () => {
    const release = lockScroll();
    expect(locked()).toBe('true');
    release();
    expect(locked()).toBeUndefined();
  });

  it('stays locked until the last of several nested locks is released', () => {
    const outer = lockScroll();
    const inner = lockScroll();
    inner();
    expect(locked()).toBe('true');
    outer();
    expect(locked()).toBeUndefined();
  });

  it('is idempotent: releasing twice never unlocks another holder', () => {
    const first = lockScroll();
    releases.push(lockScroll());
    first();
    first();
    expect(locked()).toBe('true');
  });

  it('can be re-locked after a full release', () => {
    lockScroll()();
    const again = lockScroll();
    expect(locked()).toBe('true');
    again();
    expect(locked()).toBeUndefined();
  });
});
