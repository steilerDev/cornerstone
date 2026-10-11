/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { dialogLayerStyle, useDialogLevel } from './dialogLayer.js';

describe('dialogLayerStyle', () => {
  it('returns no style for the first dialog (the stylesheet keeps its layer)', () => {
    expect(dialogLayerStyle(0)).toBeUndefined();
  });

  it('returns no style for a negative level', () => {
    expect(dialogLayerStyle(-1)).toBeUndefined();
  });

  it('puts level n at --z-modal plus 2n', () => {
    expect(dialogLayerStyle(1)).toEqual({ zIndex: 'calc(var(--z-modal) + 2)' });
    expect(dialogLayerStyle(2)).toEqual({ zIndex: 'calc(var(--z-modal) + 4)' });
    expect(dialogLayerStyle(5)).toEqual({ zIndex: 'calc(var(--z-modal) + 10)' });
  });

  it('adds the offset on top (the sheet panel sits one above its backdrop)', () => {
    expect(dialogLayerStyle(1, 1)).toEqual({ zIndex: 'calc(var(--z-modal) + 3)' });
    expect(dialogLayerStyle(3, 1)).toEqual({ zIndex: 'calc(var(--z-modal) + 7)' });
  });

  it('keeps every popover layer above any dialog layer the stack can reach', () => {
    // Popovers use --z-modal + 100: ninety-nine dialogs deep would be needed to reach them.
    const deepest = dialogLayerStyle(10, 1)!.zIndex as string;
    expect(Number(/\+ (\d+)\)/.exec(deepest)![1])).toBeLessThan(100);
  });
});

describe('useDialogLevel', () => {
  it('gives the first open dialog level 0', () => {
    const first = renderHook(() => useDialogLevel(true));
    expect(first.result.current).toBe(0);
    first.unmount();
  });

  it('gives a dialog opened over another one the next level, in open order', () => {
    const first = renderHook(() => useDialogLevel(true));
    const second = renderHook(() => useDialogLevel(true));
    const third = renderHook(() => useDialogLevel(true));

    expect([first, second, third].map((h) => h.result.current)).toEqual([0, 1, 2]);

    third.unmount();
    second.unmount();
    first.unmount();
  });

  it('does not count an inactive dialog and stays at 0 while inactive', () => {
    const first = renderHook(() => useDialogLevel(true));
    const closed = renderHook(() => useDialogLevel(false));
    const second = renderHook(() => useDialogLevel(true));

    expect(closed.result.current).toBe(0);
    expect(second.result.current).toBe(1);

    [second, closed, first].forEach((h) => h.unmount());
  });

  it('frees the level when a dialog closes: the next one reuses it', () => {
    const first = renderHook(() => useDialogLevel(true));
    const second = renderHook(() => useDialogLevel(true));
    second.unmount();

    const replacement = renderHook(() => useDialogLevel(true));

    expect(replacement.result.current).toBe(1);
    replacement.unmount();
    first.unmount();
  });

  it('closing the lower dialog first leaves the upper one registered', () => {
    const first = renderHook(() => useDialogLevel(true));
    const second = renderHook(() => useDialogLevel(true));
    first.unmount();

    const third = renderHook(() => useDialogLevel(true));

    // second is still open (index 0 now), so the new dialog is the second one.
    expect(third.result.current).toBe(1);
    third.unmount();
    second.unmount();
  });

  it('registers when it becomes active and unregisters when it turns inactive', () => {
    const toggled = renderHook(({ active }) => useDialogLevel(active), {
      initialProps: { active: false },
    });
    const other = renderHook(() => useDialogLevel(true));
    expect(other.result.current).toBe(0);
    other.unmount();

    toggled.rerender({ active: true });
    const second = renderHook(() => useDialogLevel(true));
    expect(second.result.current).toBe(1);
    second.unmount();

    toggled.rerender({ active: false });
    const third = renderHook(() => useDialogLevel(true));
    expect(third.result.current).toBe(0);
    third.unmount();
    toggled.unmount();
  });
});
