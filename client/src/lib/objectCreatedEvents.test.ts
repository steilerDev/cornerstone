import { describe, it, expect, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { notifyObjectCreated, useOnObjectCreated } from './objectCreatedEvents.js';

describe('objectCreatedEvents', () => {
  it('calls the subscriber for its kind only', () => {
    const cb = jest.fn();
    renderHook(() => useOnObjectCreated('task', cb));
    notifyObjectCreated('purchase');
    expect(cb).not.toHaveBeenCalled();
    notifyObjectCreated('task');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback without resubscribing', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useOnObjectCreated('task', cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    notifyObjectCreated('task');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const cb = jest.fn();
    const { unmount } = renderHook(() => useOnObjectCreated('task', cb));
    unmount();
    notifyObjectCreated('task');
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores events without a detail', () => {
    const cb = jest.fn();
    renderHook(() => useOnObjectCreated('task', cb));
    window.dispatchEvent(new CustomEvent('cornerstone:object-created'));
    expect(cb).not.toHaveBeenCalled();
  });
});
