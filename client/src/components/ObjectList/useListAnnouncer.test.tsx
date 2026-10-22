/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useListAnnouncer } from './useListAnnouncer.js';

describe('useListAnnouncer', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  beforeEach(() => {
    frames = new Map();
    nextId = 1;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.set(nextId, cb);
      return nextId++;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((cb) => cb(0));
  };

  it('clears the region, then sets the message in the next frame', () => {
    const node = document.createElement('div');
    node.textContent = 'old';
    const { result } = renderHook(() => useListAnnouncer({ current: node }));
    act(() => result.current.announce('12 tasks'));
    expect(node.textContent).toBe('');
    act(() => flushFrames());
    expect(node.textContent).toBe('12 tasks');
  });

  it('a second announce cancels the pending frame, so only the last message lands', () => {
    const node = document.createElement('div');
    const { result } = renderHook(() => useListAnnouncer({ current: node }));
    act(() => result.current.announce('first'));
    act(() => result.current.announce('second'));
    expect(frames.size).toBe(1);
    act(() => flushFrames());
    expect(node.textContent).toBe('second');
    act(() => result.current.announce('third'));
    act(() => flushFrames());
    expect(node.textContent).toBe('third');
  });

  it('does nothing without a region', () => {
    const { result } = renderHook(() => useListAnnouncer({ current: null }));
    act(() => result.current.announce('x'));
    expect(frames.size).toBe(0);
  });

  it('cancels a pending frame on unmount, and unmounting idle is safe', () => {
    const node = document.createElement('div');
    const { result, unmount } = renderHook(() => useListAnnouncer({ current: node }));
    act(() => result.current.announce('x'));
    unmount();
    expect(frames.size).toBe(0);
    expect(node.textContent).toBe('');
    const idle = renderHook(() => useListAnnouncer({ current: node }));
    expect(() => idle.unmount()).not.toThrow();
  });
});
