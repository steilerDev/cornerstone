/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { SearchResponse } from '@cornerstone/shared';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as HookTypes from './useCommandSearchQuery.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { makeGroup, makeItem, makeResponse } from '../../test/commandSearchFixtures.js';

interface Call {
  readonly params: SearchApiTypes.SearchEverywhereParams;
  readonly signal: AbortSignal | undefined;
  resolve: (r: SearchResponse) => void;
  reject: (e: unknown) => void;
}

const calls: Call[] = [];
const mockSearch = jest.fn<typeof SearchApiTypes.searchEverywhere>(
  (params, signal) =>
    new Promise<SearchResponse>((resolve, reject) => {
      calls.push({ params, signal, resolve, reject });
    }),
);
jest.unstable_mockModule('../../lib/searchApi.js', () => ({ searchEverywhere: mockSearch }));

let useCommandSearchQuery: typeof HookTypes.useCommandSearchQuery;
let SKELETON_DELAY_MS: number;
let SEARCH_DEBOUNCE_MS: number;

const onUnauthorized = jest.fn();
const firstOptionId = (r: SearchResponse): string | null => {
  for (const g of r.groups) {
    const item = g.items[0];
    if (item) return `${g.type}-${item.id}`;
  }
  return null;
};

beforeEach(async () => {
  jest.useFakeTimers();
  calls.length = 0;
  mockSearch.mockClear();
  onUnauthorized.mockReset();
  if (!useCommandSearchQuery) {
    ({ useCommandSearchQuery, SKELETON_DELAY_MS, SEARCH_DEBOUNCE_MS } =
      await import('./useCommandSearchQuery.js'));
  }
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(initialQuery = '') {
  return renderHook(() => useCommandSearchQuery({ initialQuery, onUnauthorized, firstOptionId }));
}

function last(): Call {
  const call = calls[calls.length - 1];
  expect(call).toBeDefined();
  return call!;
}

async function type(
  hook: ReturnType<typeof setup>,
  value: string,
  composing = false,
): Promise<void> {
  await act(async () => {
    hook.result.current.setQuery(value, composing);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const RESP = (q: string, label = 'Roof tiles'): SearchResponse =>
  makeResponse(q, { work_item: makeGroup('work_item', [makeItem({ id: 'w1', label })]) });

/** Records the timers the hook creates (by delay) and which of them were cleared. */
function trackTimers() {
  const created: { id: unknown; delay: number | undefined }[] = [];
  const cleared: unknown[] = [];
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const setSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
    fn: () => void,
    delay?: number,
  ) => {
    const id = realSet(fn, delay);
    created.push({ id, delay });
    return id;
  }) as typeof setTimeout);
  const clearSpy = jest.spyOn(globalThis, 'clearTimeout').mockImplementation(((id: never) => {
    cleared.push(id);
    realClear(id);
  }) as typeof clearTimeout);
  return {
    created,
    cleared,
    restore: () => {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    },
  };
}

describe('useCommandSearchQuery', () => {
  it('pins the timing contract: 250 ms debounce, 200 ms skeleton gate', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(250);
    expect(SKELETON_DELAY_MS).toBe(200);
  });

  describe('requests', () => {
    it('sends nothing below two characters', async () => {
      const hook = setup();
      await type(hook, 'a');
      await advance(1000);
      expect(mockSearch).not.toHaveBeenCalled();
      expect(hook.result.current.state.status).toBe('idle');
      expect(hook.result.current.state.query).toBe('a');
    });

    it('counts the trimmed length against the minimum', async () => {
      const hook = setup();
      await type(hook, ' a ');
      await advance(1000);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('debounces typing by 250 ms into one request for the last value', async () => {
      const hook = setup();
      await type(hook, 'ab');
      await advance(SEARCH_DEBOUNCE_MS - 50);
      await type(hook, 'abc');
      await advance(SEARCH_DEBOUNCE_MS - 1);
      expect(mockSearch).not.toHaveBeenCalled();
      await advance(1);
      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(last().params).toEqual({ q: 'abc' });
      expect(hook.result.current.state.status).toBe('loading');
    });

    it('sends the trimmed text', async () => {
      const hook = setup();
      await type(hook, '  roof  ');
      await advance(SEARCH_DEBOUNCE_MS);
      expect(last().params).toEqual({ q: 'roof' });
    });

    it('searches at once for an initial query of two or more characters', async () => {
      const hook = setup('  roof ');
      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(last().params).toEqual({ q: 'roof' });
      expect(hook.result.current.state.status).toBe('loading');
      expect(hook.result.current.state.query).toBe('  roof ');
    });

    it('does not search for a one-character initial query', () => {
      const hook = setup('r');
      expect(mockSearch).not.toHaveBeenCalled();
      expect(hook.result.current.state.status).toBe('idle');
    });

    it('aborts the in-flight request and resets when the text drops below two characters', async () => {
      const hook = setup('roof');
      const call = last();
      await act(async () => {
        call.resolve(RESP('roof'));
      });
      await type(hook, 'rooo');
      await advance(SEARCH_DEBOUNCE_MS);
      const inFlight = last();
      expect(inFlight.signal!.aborted).toBe(false);
      await type(hook, 'r');
      expect(inFlight.signal!.aborted).toBe(true);
      expect(hook.result.current.state).toMatchObject({
        response: null,
        settledQuery: null,
        status: 'idle',
        activeId: null,
      });
    });

    it('cancels a pending debounce when the text drops below two characters', async () => {
      const hook = setup();
      await type(hook, 'ab');
      await type(hook, 'a');
      await advance(1000);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('aborts the previous request when a new one starts', async () => {
      const hook = setup();
      await type(hook, 'ab');
      await advance(SEARCH_DEBOUNCE_MS);
      const first = last();
      await type(hook, 'abc');
      await advance(SEARCH_DEBOUNCE_MS);
      expect(first.signal!.aborted).toBe(true);
      expect(last().signal!.aborted).toBe(false);
    });

    it('does not search again when the typed value equals the settled query', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      await type(hook, 'roof ');
      await advance(1000);
      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(hook.result.current.state.status).toBe('ready');
    });

    it('does not schedule a request while composing and searches the composition-end value', async () => {
      const hook = setup();
      await type(hook, 'ka', true);
      await advance(1000);
      expect(mockSearch).not.toHaveBeenCalled();
      expect(hook.result.current.state.query).toBe('ka');
      await type(hook, 'kal', false);
      await advance(SEARCH_DEBOUNCE_MS);
      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(last().params).toEqual({ q: 'kal' });
    });
  });

  describe('responses', () => {
    it('settles the response and activates the first option', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      expect(hook.result.current.state).toMatchObject({
        status: 'ready',
        settledQuery: 'roof',
        activeId: 'work_item-w1',
        showSkeleton: false,
      });
      expect(hook.result.current.state.response?.query).toBe('roof');
    });

    it('activates nothing when the response has no items', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().resolve(makeResponse('roof'));
      });
      expect(hook.result.current.state.activeId).toBeNull();
      expect(hook.result.current.state.status).toBe('ready');
    });

    it('drops a stale response that resolves after a newer query and never activates it', async () => {
      const hook = setup();
      await type(hook, 'ab');
      await advance(SEARCH_DEBOUNCE_MS);
      const older = last();
      await type(hook, 'abc');
      await advance(SEARCH_DEBOUNCE_MS);
      const newer = last();
      await act(async () => {
        newer.resolve(RESP('abc', 'Newer'));
      });
      await act(async () => {
        older.resolve(RESP('ab', 'Older'));
      });
      expect(hook.result.current.state.settledQuery).toBe('abc');
      expect(hook.result.current.state.response?.groups[0]?.items[0]?.label).toBe('Newer');
    });

    it('drops a response whose query is no longer the typed one even when not aborted', async () => {
      const hook = setup('roof');
      const pending = last();
      // Typing one character resets the state; the controller is aborted, and the value changed.
      await type(hook, 'r');
      await act(async () => {
        pending.resolve(RESP('roof'));
      });
      expect(hook.result.current.state.response).toBeNull();
      expect(hook.result.current.state.status).toBe('idle');
    });

    it('treats a rejection of an aborted request as nothing (NetworkError, not by name)', async () => {
      const hook = setup();
      await type(hook, 'ab');
      await advance(SEARCH_DEBOUNCE_MS);
      const first = last();
      await type(hook, 'abc');
      await advance(SEARCH_DEBOUNCE_MS);
      await act(async () => {
        first.reject(
          new NetworkError('Network request failed', new DOMException('x', 'AbortError')),
        );
      });
      expect(hook.result.current.state.status).toBe('loading');
      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('treats a rejection with a non-abort name as an error when the request is live', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().reject(new NetworkError('boom', new Error('down')));
      });
      expect(hook.result.current.state.status).toBe('error');
    });

    it('treats an AbortError-named rejection of a live request as an error (signal decides)', async () => {
      const hook = setup('roof');
      const err = new Error('x');
      err.name = 'AbortError';
      await act(async () => {
        last().reject(err);
      });
      expect(hook.result.current.state.status).toBe('error');
    });
  });

  describe('skeleton', () => {
    it('appears only after 200 ms on the first load', async () => {
      const hook = setup('roof');
      await advance(SKELETON_DELAY_MS - 1);
      expect(hook.result.current.state.showSkeleton).toBe(false);
      await advance(1);
      expect(hook.result.current.state.showSkeleton).toBe(true);
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      expect(hook.result.current.state.showSkeleton).toBe(false);
    });

    it('never shows when the response arrives before 200 ms', async () => {
      const hook = setup('roof');
      await advance(100);
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      await advance(1000);
      expect(hook.result.current.state.showSkeleton).toBe(false);
    });

    it('never shows on a refetch, and the old response stays', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      await type(hook, 'roofs');
      await advance(SEARCH_DEBOUNCE_MS);
      await advance(1000);
      const state = hook.result.current.state;
      expect(state.status).toBe('loading');
      expect(state.showSkeleton).toBe(false);
      expect(state.response?.query).toBe('roof');
    });

    it('does not show after an error cleared the timer', async () => {
      const hook = setup('roof');
      await advance(100);
      await act(async () => {
        last().reject(new NetworkError('x', null));
      });
      await advance(1000);
      expect(hook.result.current.state.showSkeleton).toBe(false);
    });
  });

  describe('errors and retry', () => {
    it('keeps the old response on error', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      await type(hook, 'roofs');
      await advance(SEARCH_DEBOUNCE_MS);
      await act(async () => {
        last().reject(new NetworkError('x', null));
      });
      expect(hook.result.current.state.status).toBe('error');
      expect(hook.result.current.state.response?.query).toBe('roof');
      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('calls onUnauthorized for a 401 and still shows the error state', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().reject(new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'no' }));
      });
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(hook.result.current.state.status).toBe('error');
    });

    it('does not call onUnauthorized for other API errors', async () => {
      setup('roof');
      await act(async () => {
        last().reject(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }));
      });
      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('ignores an aborted request for the same text that resolves after its replacement', async () => {
      const hook = setup('roof');
      const first = last();
      await act(async () => {
        hook.result.current.retry();
      });
      const second = last();
      expect(first.signal!.aborted).toBe(true);
      await act(async () => {
        second.resolve(RESP('roof', 'Newer'));
      });
      await act(async () => {
        first.resolve(RESP('roof', 'Older'));
      });
      expect(hook.result.current.state.response?.groups[0]?.items[0]?.label).toBe('Newer');
    });

    it('drops a response when the typed text changed meanwhile, even while composing (no abort)', async () => {
      const hook = setup('roof');
      const pending = last();
      await type(hook, 'roofx', true);
      expect(pending.signal!.aborted).toBe(false);
      await act(async () => {
        pending.resolve(RESP('roof'));
      });
      expect(hook.result.current.state.response).toBeNull();
      expect(hook.result.current.state.status).toBe('loading');
    });

    it('retries immediately without a debounce', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().reject(new NetworkError('x', null));
      });
      await act(async () => {
        hook.result.current.retry();
      });
      expect(mockSearch).toHaveBeenCalledTimes(2);
      expect(last().params).toEqual({ q: 'roof' });
      expect(hook.result.current.state.status).toBe('loading');
      await act(async () => {
        last().resolve(RESP('roof'));
      });
      expect(hook.result.current.state.status).toBe('ready');
    });

    it('ignores retry below two characters', async () => {
      const hook = setup();
      await type(hook, 'a');
      await act(async () => {
        hook.result.current.retry();
      });
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('typing after an error searches again', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().reject(new NetworkError('x', null));
      });
      await type(hook, 'roofs');
      await advance(SEARCH_DEBOUNCE_MS);
      expect(mockSearch).toHaveBeenCalledTimes(2);
    });
  });

  describe('flush', () => {
    it('runs a pending debounce now', async () => {
      const hook = setup();
      await type(hook, 'roof');
      await act(async () => {
        hook.result.current.flush();
      });
      expect(mockSearch).toHaveBeenCalledTimes(1);
      await advance(1000);
      expect(mockSearch).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a pending query', async () => {
      const hook = setup();
      await act(async () => {
        hook.result.current.flush();
      });
      expect(mockSearch).not.toHaveBeenCalled();
    });
  });

  describe('active option', () => {
    it('sets and clears the active id, ignoring a repeat of the same value', async () => {
      const hook = setup();
      await act(async () => {
        hook.result.current.setActiveId('x');
      });
      expect(hook.result.current.state.activeId).toBe('x');
      const before = hook.result.current.state;
      await act(async () => {
        hook.result.current.setActiveId('x');
      });
      expect(hook.result.current.state).toBe(before);
      await act(async () => {
        hook.result.current.setActiveId(null);
      });
      expect(hook.result.current.state.activeId).toBeNull();
    });
  });

  describe('showMore', () => {
    async function settledWithTwo() {
      const hook = setup('roof');
      const group = makeGroup('work_item', [makeItem({ id: 'a' }), makeItem({ id: 'b' })], {
        total: 5,
      });
      await act(async () => {
        last().resolve(makeResponse('roof', { work_item: group }));
      });
      return hook;
    }

    it('requests the group with limit 20, merges, and activates the first new row', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      expect(last().params).toEqual({ q: 'roof', types: ['work_item'], limit: 20 });
      const all = ['a', 'b', 'c', 'd', 'e'].map((id) => makeItem({ id }));
      await act(async () => {
        last().resolve(makeResponse('roof', { work_item: makeGroup('work_item', all) }));
      });
      const state = hook.result.current.state;
      expect(state.expanded.get('work_item')?.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(state.activeId).toBe('work_item-c');
      expect(state.status).toBe('ready');
    });

    it('keeps the active row when the expanded group adds nothing new', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.setActiveId('work_item-b');
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        last().resolve(
          makeResponse('roof', {
            work_item: makeGroup('work_item', [makeItem({ id: 'a' }), makeItem({ id: 'b' })]),
          }),
        );
      });
      expect(hook.result.current.state.activeId).toBe('work_item-b');
    });

    it('expands a second time from the already expanded rows', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        last().resolve(
          makeResponse('roof', {
            work_item: makeGroup(
              'work_item',
              ['a', 'b', 'c'].map((id) => makeItem({ id })),
            ),
          }),
        );
      });
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        last().resolve(
          makeResponse('roof', {
            work_item: makeGroup(
              'work_item',
              ['a', 'b', 'c', 'd'].map((id) => makeItem({ id })),
            ),
          }),
        );
      });
      expect(hook.result.current.state.activeId).toBe('work_item-d');
    });

    it('ignores a response without the requested group', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        last().resolve({ query: 'roof', groups: [] });
      });
      expect(hook.result.current.state.expanded.size).toBe(0);
    });

    it('does nothing before a query has settled', async () => {
      const hook = setup();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('drops the merge when the query changed meanwhile', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      const more = last();
      await type(hook, 'roofs');
      await act(async () => {
        more.resolve(
          makeResponse('roof', {
            work_item: makeGroup('work_item', [makeItem({ id: 'z' })]),
          }),
        );
      });
      expect(hook.result.current.state.expanded.size).toBe(0);
    });

    it('moves to the error state when the request fails and keeps the rows', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        last().reject(new NetworkError('x', null));
      });
      expect(hook.result.current.state.status).toBe('error');
      expect(hook.result.current.state.response).not.toBeNull();
    });

    it('treats an aborted show-more rejection as nothing', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      const more = last();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        more.reject(new NetworkError('x', null));
      });
      expect(hook.result.current.state.status).toBe('ready');
    });

    it('resets the expanded rows on the next settled response', async () => {
      const hook = await settledWithTwo();
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      await act(async () => {
        last().resolve(
          makeResponse('roof', {
            work_item: makeGroup(
              'work_item',
              ['a', 'b', 'c'].map((id) => makeItem({ id })),
            ),
          }),
        );
      });
      await type(hook, 'roofs');
      await advance(SEARCH_DEBOUNCE_MS);
      await act(async () => {
        last().resolve(RESP('roofs'));
      });
      expect(hook.result.current.state.expanded.size).toBe(0);
    });
  });

  describe('unmount', () => {
    it('aborts the in-flight request', async () => {
      const hook = setup('roof');
      const first = last();
      hook.unmount();
      expect(first.signal!.aborted).toBe(true);
    });

    it('clears the skeleton timer and the pending debounce so nothing fires afterwards', async () => {
      const tracker = trackTimers();
      try {
        const hook = setup('roof');
        await type(hook, 'roofs');
        const mine = tracker.created.filter(
          (t) => t.delay === SKELETON_DELAY_MS || t.delay === SEARCH_DEBOUNCE_MS,
        );
        expect(mine.map((t) => t.delay).sort()).toEqual([SKELETON_DELAY_MS, SEARCH_DEBOUNCE_MS]);
        hook.unmount();
        for (const t of mine) expect(tracker.cleared).toContain(t.id);
        await advance(1000);
        expect(mockSearch).toHaveBeenCalledTimes(1);
      } finally {
        tracker.restore();
      }
    });

    it('aborts a show-more request', async () => {
      const hook = setup('roof');
      await act(async () => {
        last().resolve(
          makeResponse('roof', {
            work_item: makeGroup('work_item', [makeItem({ id: 'a' })], { total: 3 }),
          }),
        );
      });
      await act(async () => {
        hook.result.current.showMore('work_item');
      });
      const more = last();
      hook.unmount();
      expect(more.signal!.aborted).toBe(true);
    });
  });
});
