/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { ShortcutRegistryProvider, useShortcutRegistry } from './shortcutRegistry.js';
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
    registry.register('a', [shortcut('n'), shortcut('/')]);
    registry.register('b', [shortcut('?')]);
    expect(registry.snapshot().map((s) => s.key)).toEqual(['n', '/', '?']);
  });

  it('removes only the unregistered owner', () => {
    const registry = setup();
    registry.register('a', [shortcut('n')]);
    const unregisterB = registry.register('b', [shortcut('?')]);
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
