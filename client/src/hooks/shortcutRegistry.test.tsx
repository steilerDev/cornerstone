/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import {
  RESERVED_SHORTCUT_KEYS,
  ShortcutRegistryProvider,
  isReservedShortcutKey,
  useShortcutRegistry,
} from './shortcutRegistry.js';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

const noop = () => {};
const shortcut = (key: string, description = `do ${key}`): KeyboardShortcut => ({
  key,
  handler: noop,
  description,
});

function wrapper({ children }: { children: ReactNode }) {
  return <ShortcutRegistryProvider>{children}</ShortcutRegistryProvider>;
}

function setup() {
  const { result } = renderHook(() => useShortcutRegistry(), { wrapper });
  const registry = result.current;
  if (!registry) throw new Error('registry missing');
  return registry;
}

describe('ShortcutRegistry', () => {
  it('returns null outside a provider', () => {
    const { result } = renderHook(() => useShortcutRegistry());
    expect(result.current).toBeNull();
  });

  it('starts empty', () => {
    expect(setup().snapshot()).toEqual([]);
  });

  it('lists the shortcuts of every owner in registration order', () => {
    const registry = setup();
    registry.register('a', [shortcut('n'), shortcut('e')]);
    registry.register('b', [shortcut('x')]);
    expect(registry.snapshot().map((s) => s.key)).toEqual(['n', 'e', 'x']);
  });

  it('removes only the unregistered owner', () => {
    const registry = setup();
    registry.register('a', [shortcut('n')]);
    const unregisterB = registry.register('b', [shortcut('x')]);
    unregisterB();
    expect(registry.snapshot().map((s) => s.key)).toEqual(['n']);
  });

  it('lets the last registration win when two owners use the same key', () => {
    const registry = setup();
    registry.register('a', [shortcut('n', 'first')]);
    registry.register('b', [shortcut('n', 'second')]);
    const snapshot = registry.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.description).toBe('second');
  });

  it('replaces the list when the same owner registers again', () => {
    const registry = setup();
    registry.register('a', [shortcut('n')]);
    registry.register('a', [shortcut('x')]);
    expect(registry.snapshot().map((s) => s.key)).toEqual(['x']);
  });

  it('a stale unregister does not remove the owner replacement list', () => {
    const registry = setup();
    const staleUnregister = registry.register('a', [shortcut('n')]);
    registry.register('a', [shortcut('x')]);
    staleUnregister();
    expect(registry.snapshot().map((s) => s.key)).toEqual(['x']);
  });

  it('returns a fresh array so callers can keep the snapshot', () => {
    const registry = setup();
    registry.register('a', [shortcut('n')]);
    const first = registry.snapshot();
    registry.register('b', [shortcut('x')]);
    expect(first.map((s) => s.key)).toEqual(['n']);
  });

  it('keeps one registry identity across re-renders and never re-renders on registration', () => {
    const renders = jest.fn();
    const { result, rerender } = renderHook(
      () => {
        renders();
        return useShortcutRegistry();
      },
      { wrapper },
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    const before = renders.mock.calls.length;
    first?.register('a', [shortcut('n')]);
    expect(renders.mock.calls.length).toBe(before);
  });
});

describe('ShortcutRegistry fallback owners (#2212 D10)', () => {
  const named = (key: string, description: string): KeyboardShortcut => ({
    key,
    handler: noop,
    description,
  });

  it('lists a non-fallback entry over a fallback one, fallback registered first', () => {
    const registry = setup();
    registry.register('shell', [named('n', 'shell n')], { fallback: true });
    registry.register('page', [named('n', 'page n')]);
    expect(registry.snapshot().map((s) => s.description)).toEqual(['page n']);
  });

  it('lists a non-fallback entry over a fallback one, fallback registered last', () => {
    const registry = setup();
    registry.register('page', [named('n', 'page n')]);
    registry.register('shell', [named('n', 'shell n')], { fallback: true });
    expect(registry.snapshot().map((s) => s.description)).toEqual(['page n']);
  });

  it('lists the fallback entry when nobody else owns the key', () => {
    const registry = setup();
    registry.register('shell', [named('n', 'shell n')], { fallback: true });
    expect(registry.snapshot().map((s) => s.description)).toEqual(['shell n']);
  });

  it('still lets the last non-fallback owner win among non-fallbacks', () => {
    const registry = setup();
    registry.register('a', [named('n', 'first')]);
    registry.register('b', [named('n', 'second')]);
    expect(registry.snapshot().map((s) => s.description)).toEqual(['second']);
  });

  it('hasNonFallbackOwner ignores fallbacks and the asking owner', () => {
    const registry = setup();
    registry.register('shell', [named('n', 's')], { fallback: true });
    expect(registry.hasNonFallbackOwner('n', 'x')).toBe(false);
    registry.register('page', [named('n', 'p')]);
    expect(registry.hasNonFallbackOwner('n', 'x')).toBe(true);
    expect(registry.hasNonFallbackOwner('n', 'page')).toBe(false);
    expect(registry.hasNonFallbackOwner('q', 'x')).toBe(false);
  });
});

describe('ShortcutRegistry groups (#2253)', () => {
  it('defaults the group to page and carries each owner group in the snapshot', () => {
    const registry = setup();
    registry.register('page', [shortcut('e')]);
    registry.register('shell', [shortcut('n')], { group: 'global' });
    registry.register('go', [shortcut('g s')], { group: 'goTo' });
    expect(registry.snapshot().map((s) => [s.key, s.group])).toEqual([
      ['e', 'page'],
      ['n', 'global'],
      ['g s', 'goTo'],
    ]);
  });

  it('lists a page n (one row, group page) over the global fallback n', () => {
    const registry = setup();
    registry.register('shell', [shortcut('n', 'shell')], { fallback: true, group: 'global' });
    registry.register('page', [shortcut('n', 'page')]);
    const snapshot = registry.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ key: 'n', description: 'page', group: 'page' });
  });
});

describe.each(['g', '?', '/'])(
  'ShortcutRegistry reserved key %s (#2253 AC7, ruling)',
  (reserved) => {
    let errorSpy: ReturnType<typeof jest.spyOn>;
    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => errorSpy.mockRestore());

    it('drops a page registration of the key, keeps the rest and logs console.error', () => {
      const registry = setup();
      expect(() => registry.register('p', [shortcut(reserved), shortcut('e')])).not.toThrow();
      expect(registry.snapshot().map((s) => s.key)).toEqual(['e']);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/reserved/));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`"${reserved}"`));
    });

    it('accepts the key for the global group without logging', () => {
      const registry = setup();
      registry.register('shell', [shortcut(reserved)], { group: 'global' });
      expect(registry.snapshot().map((s) => [s.key, s.group])).toEqual([[reserved, 'global']]);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  },
);

describe('ShortcutRegistry reserved sequences (#2253)', () => {
  it('drops a page sequence that starts with g but not one that merely contains g', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const registry = setup();
    registry.register('p', [shortcut('g x'), shortcut('x g'), shortcut('Delete')]);
    expect(registry.snapshot().map((s) => s.key)).toEqual(['x g', 'Delete']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('exposes the reserved list', () => {
    expect(RESERVED_SHORTCUT_KEYS).toEqual(['g', '?', '/']);
    expect(isReservedShortcutKey('?')).toBe(true);
    expect(isReservedShortcutKey('n')).toBe(false);
  });
});

describe('ShortcutRegistry single-key switch (#2253 AC5/AC6)', () => {
  afterEach(() => localStorage.clear());

  it('is on by default', () => {
    expect(setup().singleKeyEnabled()).toBe(true);
  });

  it('starts off when this browser stored off', () => {
    localStorage.setItem('singleKeyShortcuts', 'off');
    expect(setup().singleKeyEnabled()).toBe(false);
  });

  it('writes off to storage when turned off and removes the key when turned on', () => {
    const registry = setup();
    registry.setSingleKeyEnabled(false);
    expect(registry.singleKeyEnabled()).toBe(false);
    expect(localStorage.getItem('singleKeyShortcuts')).toBe('off');
    registry.setSingleKeyEnabled(true);
    expect(registry.singleKeyEnabled()).toBe(true);
    expect(localStorage.getItem('singleKeyShortcuts')).toBeNull();
  });
});
