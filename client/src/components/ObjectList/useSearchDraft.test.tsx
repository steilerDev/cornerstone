/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useSearchDraft } from './useSearchDraft.js';

describe('useSearchDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates the draft at once and commits once after 300 ms of quiet', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSearchDraft('', commit));
    act(() => result.current.onInput('ti'));
    act(() => jest.advanceTimersByTime(200));
    act(() => result.current.onInput('tile'));
    expect(result.current.draft).toBe('tile');
    act(() => jest.advanceTimersByTime(299));
    expect(commit).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('tile');
  });

  it('does not commit a value equal to the current q', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSearchDraft('tile', commit));
    act(() => result.current.onInput('tile'));
    act(() => jest.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it('Enter flushes the draft now and cancels the timer', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSearchDraft('', commit));
    act(() => result.current.onInput('tile'));
    act(() => result.current.flush());
    expect(commit).toHaveBeenCalledWith('tile');
    act(() => jest.advanceTimersByTime(500));
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('flush without a change does not commit', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSearchDraft('tile', commit));
    act(() => result.current.flush());
    expect(commit).not.toHaveBeenCalled();
  });

  it('mirrors an external q change into the draft', () => {
    const commit = jest.fn();
    const { result, rerender } = renderHook(({ q }) => useSearchDraft(q, commit), {
      initialProps: { q: '' },
    });
    rerender({ q: 'tile' });
    expect(result.current.draft).toBe('tile');
  });

  it('keeps pending typing when q changes externally, until the commit lands', () => {
    const commit = jest.fn();
    const { result, rerender } = renderHook(({ q }) => useSearchDraft(q, commit), {
      initialProps: { q: '' },
    });
    act(() => result.current.onInput('grout'));
    rerender({ q: 'other' });
    expect(result.current.draft).toBe('grout');
    act(() => jest.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith('grout');
  });

  it('reset drops the pending commit and empties the draft', () => {
    const commit = jest.fn();
    const { result, rerender } = renderHook(({ q }) => useSearchDraft(q, commit), {
      initialProps: { q: 'tile' },
    });
    act(() => result.current.onInput('tiles'));
    act(() => result.current.reset());
    expect(result.current.draft).toBe('');
    act(() => jest.advanceTimersByTime(500));
    expect(commit).not.toHaveBeenCalled();
    rerender({ q: '' });
    expect(result.current.draft).toBe('');
  });
});
