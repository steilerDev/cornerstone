/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { DiaryEntryLookupMatch } from '@cornerstone/shared';
import type * as HookModule from './useSameTitleLookup.js';
import type * as DiaryApiTypes from '../../../lib/diaryApi.js';

const mockLookup = jest.fn<typeof DiaryApiTypes.lookupDiaryEntries>();

jest.unstable_mockModule('../../../lib/diaryApi.js', () => ({
  lookupDiaryEntries: mockLookup,
}));

let useSameTitleLookup: typeof HookModule.useSameTitleLookup;

function match(id: string): DiaryEntryLookupMatch {
  return { id, entryType: 'daily_log', title: 'Screed', status: 'saved', photoCount: 1 };
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockLookup.mockReset();
  mockLookup.mockResolvedValue({ matches: [] });
  if (!useSameTitleLookup) ({ useSameTitleLookup } = await import('./useSameTitleLookup.js'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useSameTitleLookup', () => {
  it('does not look anything up for a title under two characters', async () => {
    renderHook(() =>
      useSameTitleLookup({ entryDate: '2026-10-19', title: ' a ', excludeId: null }),
    );

    await advance(2000);

    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('does not look anything up without a date', async () => {
    renderHook(() => useSameTitleLookup({ entryDate: '', title: 'Screed', excludeId: null }));

    await advance(2000);

    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('waits 500 ms after the last change before it looks up', async () => {
    const { rerender } = renderHook(
      ({ title }) => useSameTitleLookup({ entryDate: '2026-10-19', title, excludeId: null }),
      { initialProps: { title: 'Sc' } },
    );
    await advance(400);
    rerender({ title: 'Scr' });
    await advance(400);
    expect(mockLookup).not.toHaveBeenCalled();

    await advance(100);

    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(mockLookup.mock.calls[0]![0]).toEqual({ entryDate: '2026-10-19', title: 'Scr' });
  });

  it('passes the draft id as excludeId and the trimmed title', async () => {
    renderHook(() =>
      useSameTitleLookup({ entryDate: '2026-10-19', title: '  Screed ', excludeId: 'draft-1' }),
    );

    await advance(500);

    expect(mockLookup.mock.calls[0]![0]).toEqual({
      entryDate: '2026-10-19',
      title: 'Screed',
      excludeId: 'draft-1',
    });
  });

  it('returns at most three matches, only for the date and title they were found for', async () => {
    mockLookup.mockResolvedValue({ matches: ['a', 'b', 'c', 'd'].map(match) });
    const { result, rerender } = renderHook(
      ({ title }) => useSameTitleLookup({ entryDate: '2026-10-19', title, excludeId: null }),
      { initialProps: { title: 'Screed' } },
    );
    expect(result.current).toEqual([]);

    await advance(500);
    expect(result.current.map((m) => m.id)).toEqual(['a', 'b', 'c']);

    rerender({ title: 'Screed 2' });
    expect(result.current).toEqual([]);
  });

  it('clears the offer when the title gets too short', async () => {
    mockLookup.mockResolvedValue({ matches: [match('a')] });
    const { result, rerender } = renderHook(
      ({ title }) => useSameTitleLookup({ entryDate: '2026-10-19', title, excludeId: null }),
      { initialProps: { title: 'Screed' } },
    );
    await advance(500);
    expect(result.current).toHaveLength(1);

    rerender({ title: 'S' });

    expect(result.current).toEqual([]);
  });

  it('aborts the stale request when the title changes', async () => {
    let signal: AbortSignal | undefined;
    mockLookup.mockImplementation((_query, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    });
    const { rerender } = renderHook(
      ({ title }) => useSameTitleLookup({ entryDate: '2026-10-19', title, excludeId: null }),
      { initialProps: { title: 'Screed' } },
    );
    await advance(500);
    expect(signal?.aborted).toBe(false);

    rerender({ title: 'Screed two' });

    expect(signal?.aborted).toBe(true);
  });

  it('ignores a late answer to an aborted request', async () => {
    let resolveFirst: (value: { matches: DiaryEntryLookupMatch[] }) => void = () => {};
    mockLookup.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve as never)),
    );
    const onNewMatches = jest.fn();
    const { result, rerender } = renderHook(
      ({ title }) =>
        useSameTitleLookup({ entryDate: '2026-10-19', title, excludeId: null, onNewMatches }),
      { initialProps: { title: 'Screed' } },
    );
    await advance(500);

    rerender({ title: 'Screed two' });
    await act(async () => {
      resolveFirst({ matches: [match('stale')] });
    });

    expect(result.current).toEqual([]);
    expect(onNewMatches).not.toHaveBeenCalled();
  });

  it('announces once per distinct set of matches and never for an empty set', async () => {
    const onNewMatches = jest.fn();
    const { rerender } = renderHook(
      ({ title }) =>
        useSameTitleLookup({ entryDate: '2026-10-19', title, excludeId: null, onNewMatches }),
      { initialProps: { title: 'Screed' } },
    );
    mockLookup.mockResolvedValue({ matches: [] });
    await advance(500);
    expect(onNewMatches).not.toHaveBeenCalled();

    mockLookup.mockResolvedValue({ matches: [match('a')] });
    rerender({ title: 'Screed 1' });
    await advance(500);
    expect(onNewMatches).toHaveBeenCalledTimes(1);

    rerender({ title: 'Screed 12' });
    await advance(500);
    expect(onNewMatches).toHaveBeenCalledTimes(1);

    mockLookup.mockResolvedValue({ matches: [match('a'), match('b')] });
    rerender({ title: 'Screed 123' });
    await advance(500);
    expect(onNewMatches).toHaveBeenCalledTimes(2);
  });

  it('shows nothing when the lookup fails', async () => {
    mockLookup.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() =>
      useSameTitleLookup({ entryDate: '2026-10-19', title: 'Screed', excludeId: null }),
    );

    await advance(500);

    expect(result.current).toEqual([]);
  });
});
