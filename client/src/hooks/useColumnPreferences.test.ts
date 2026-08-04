import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock the usePreferences hook that useColumnPreferences depends on
const mockUpsert = jest.fn<(key: string, value: string) => Promise<void>>();
const mockRemove = jest.fn<(key: string) => Promise<void>>();
const mockRefresh = jest.fn();
const mockUsePreferences = jest.fn();

jest.unstable_mockModule('./usePreferences.js', () => ({
  usePreferences: mockUsePreferences,
}));

const mockShowToast = jest.fn();
jest.unstable_mockModule('../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast: mockShowToast, dismissToast: jest.fn(), toasts: [] }),
}));

import type * as UseColumnPreferencesModule from './useColumnPreferences.js';

let useColumnPreferences: (typeof UseColumnPreferencesModule)['useColumnPreferences'];

const COLUMNS: Array<{
  key: string;
  label: string;
  defaultVisible?: boolean;
  render: () => string;
}> = [
  { key: 'title', label: 'Title', defaultVisible: true, render: () => '' },
  { key: 'amount', label: 'Amount', defaultVisible: true, render: () => '' },
  { key: 'id', label: 'ID', defaultVisible: false, render: () => '' },
];

function makePreference(key: string, value: string) {
  return { key, value, updatedAt: '2026-01-01T00:00:00Z' };
}

function makeUsePreferencesResult(preferences = [] as ReturnType<typeof makePreference>[]) {
  return {
    preferences,
    isLoading: false,
    error: null,
    upsert: mockUpsert,
    remove: mockRemove,
    refresh: mockRefresh,
  };
}

beforeEach(async () => {
  ({ useColumnPreferences } =
    (await import('./useColumnPreferences.js')) as typeof UseColumnPreferencesModule);
  mockUsePreferences.mockReset();
  mockUpsert.mockReset();
  mockShowToast.mockReset();
  mockUsePreferences.mockReturnValue(makeUsePreferencesResult());
  mockUpsert.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useColumnPreferences', () => {
  describe('initial state from defaults', () => {
    it('initializes visibleColumns from columns with defaultVisible !== false', () => {
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      expect(result.current.visibleColumns.has('title')).toBe(true);
      expect(result.current.visibleColumns.has('amount')).toBe(true);
      expect(result.current.visibleColumns.has('id')).toBe(false);
    });

    it('includes columns without explicit defaultVisible (treated as true)', () => {
      const columns: Array<{
        key: string;
        label: string;
        defaultVisible?: boolean;
        render: () => string;
      }> = [
        { key: 'name', label: 'Name', render: () => '' }, // no defaultVisible
        { key: 'hidden', label: 'Hidden', defaultVisible: false, render: () => '' },
      ];
      const { result } = renderHook(() => useColumnPreferences('test-page', columns));

      expect(result.current.visibleColumns.has('name')).toBe(true);
      expect(result.current.visibleColumns.has('hidden')).toBe(false);
    });

  });

  describe('loading from preferences', () => {
    it('loads visible columns from stored preferences when key matches', async () => {
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([
          makePreference('table.test-page.columns', JSON.stringify(['title', 'id'])),
        ]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      await waitFor(() => {
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('id')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(false);
      });
    });

    it('falls back to defaults when no matching preference exists', async () => {
      mockUsePreferences.mockReturnValue(makeUsePreferencesResult([]));

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      await waitFor(() => {
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(true);
        expect(result.current.visibleColumns.has('id')).toBe(false);
      });
    });

    it('falls back to defaults when stored JSON is invalid', async () => {
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([makePreference('table.test-page.columns', 'not-valid-json{{{')]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      await waitFor(() => {
        // Should use defaults when JSON parse fails
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(true);
      });
    });

    it('uses pageKey to construct preference key "table.<pageKey>.columns"', async () => {
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([
          makePreference('table.invoices.columns', JSON.stringify(['amount'])),
          makePreference('table.test-page.columns', JSON.stringify(['title'])),
        ]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      await waitFor(() => {
        // Should use the 'test-page' key, not 'invoices'
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(false);
      });
    });
  });

  describe('toggleColumn', () => {
    it('removes a visible column from visibleColumns', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      act(() => {
        result.current.toggleColumn('title');
      });

      expect(result.current.visibleColumns.has('title')).toBe(false);
    });

    it('adds a hidden column to visibleColumns', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      act(() => {
        result.current.toggleColumn('id'); // id is hidden by default
      });

      expect(result.current.visibleColumns.has('id')).toBe(true);
    });

    it('debounces upsert — rapid toggles result in one upsert call', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      act(() => {
        result.current.toggleColumn('title');
        result.current.toggleColumn('amount');
        result.current.toggleColumn('title');
        result.current.toggleColumn('amount');
        result.current.toggleColumn('id');
      });

      // Before debounce fires: no upsert call
      expect(mockUpsert).not.toHaveBeenCalled();

      // After 500ms debounce
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('saves updated visible columns as JSON after debounce', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      act(() => {
        result.current.toggleColumn('id'); // add id to visible
      });

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledWith('table.test-page.columns', expect.any(String));
      const savedValue = JSON.parse((mockUpsert.mock.calls[0]! as [string, string])[1]) as {
        visible: string[];
        order: string[];
      };
      expect(savedValue.visible).toContain('id');
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('moveColumn', () => {
    it('reorders columnOrder and persists the new order after debounce', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      expect(result.current.columnOrder).toEqual(['title', 'amount', 'id']);

      act(() => {
        result.current.moveColumn(0, 2); // move 'title' to the end
      });

      expect(result.current.columnOrder).toEqual(['amount', 'id', 'title']);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      const savedValue = JSON.parse((mockUpsert.mock.calls[0]! as [string, string])[1]) as {
        visible: string[];
        order: string[];
      };
      expect(savedValue.order).toEqual(['amount', 'id', 'title']);
    });
  });

  describe('resetToDefaults', () => {
    it('resets visibleColumns to default-visible columns', async () => {
      jest.useFakeTimers();
      // Start with saved preference that hides 'title'
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([
          makePreference('table.test-page.columns', JSON.stringify(['amount'])),
        ]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      await waitFor(() => {
        expect(result.current.visibleColumns.has('title')).toBe(false);
      });

      act(() => {
        result.current.resetToDefaults();
      });

      expect(result.current.visibleColumns.has('title')).toBe(true);
      expect(result.current.visibleColumns.has('amount')).toBe(true);
      expect(result.current.visibleColumns.has('id')).toBe(false);
    });

    it('saves defaults to preferences after debounce', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS));

      act(() => {
        result.current.resetToDefaults();
      });

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledWith('table.test-page.columns', expect.any(String));
      const savedValue = JSON.parse((mockUpsert.mock.calls[0]! as [string, string])[1]) as {
        visible: string[];
        order: string[];
      };
      expect(savedValue.visible).toContain('title');
      expect(savedValue.visible).toContain('amount');
      expect(savedValue.visible).not.toContain('id');
    });
  });

  describe('preference-save race (#1955)', () => {
    // The shared COLUMNS fixture has only one defaultVisible:false column ('id') and other
    // tests assert against its exact shape, so this block gets its own fixture with TWO
    // hidden-by-default columns — the sequence in the bug report needs both.
    const RACE_COLUMNS: Array<{
      key: string;
      label: string;
      defaultVisible?: boolean;
      render: () => string;
    }> = [
      { key: 'title', label: 'Title', defaultVisible: true, render: () => '' },
      { key: 'amount', label: 'Amount', defaultVisible: true, render: () => '' },
      { key: 'colA', label: 'Column A', defaultVisible: false, render: () => '' },
      { key: 'colB', label: 'Column B', defaultVisible: false, render: () => '' },
    ];

    interface SavedColumns {
      visible: string[];
      order: string[];
    }

    interface Deferred {
      promise: Promise<void>;
      resolve: () => void;
      reject: (reason: Error) => void;
    }

    function createDeferred(): Deferred {
      let resolve!: () => void;
      let reject!: (reason: Error) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = () => res();
        reject = (reason: Error) => rej(reason);
      });
      return { promise, resolve, reject };
    }

    function parsePayload(value: string): SavedColumns {
      return JSON.parse(value) as SavedColumns;
    }

    /**
     * Stateful harness. The default mock returns a fixed object from a plain jest.fn(), which
     * cannot model the preference-store echo that drives this bug. Here `prefsState` stands in
     * for `usePreferences`'s internal `preferences` state: `upsert` rewrites it on resolve
     * (exactly where the real `usePreferences.upsert` runs its optimistic `setPreferences`,
     * usePreferences.ts:60-71) as a fresh array reference, which is what re-triggers the
     * load effect in `useColumnPreferences`.
     *
     * Because `usePreferences` is mocked away there is no React state behind `prefsState`, so
     * nothing re-renders on its own — tests must call `rerender()` to stand in for the
     * re-render the real optimistic update would cause.
     */
    let prefsState: ReturnType<typeof makePreference>[] = [];
    let upsertCalls: Array<{ key: string; value: string }> = [];
    let writes: Deferred[] = [];
    /** Interleaving log: `call:<n>` when a write is issued, `settle:<n>` when it resolves. */
    let events: string[] = [];

    beforeEach(() => {
      jest.useFakeTimers();
      prefsState = [];
      upsertCalls = [];
      writes = [];
      events = [];

      mockUsePreferences.mockReset();
      mockUsePreferences.mockImplementation(() => makeUsePreferencesResult(prefsState));

      mockUpsert.mockReset();
      mockUpsert.mockImplementation((key: string, value: string) => {
        const index = upsertCalls.length;
        upsertCalls.push({ key, value });
        events.push(`call:${index}`);

        const deferred = createDeferred();
        writes.push(deferred);
        // Echo the written payload back into the store when the write resolves, mirroring
        // `usePreferences.upsert`'s post-await optimistic update.
        void deferred.promise.then(
          () => {
            events.push(`settle:${index}`);
            prefsState = [makePreference(key, value)];
          },
          () => {
            events.push(`reject:${index}`);
          },
        );
        return deferred.promise;
      });
    });

    function renderRaceHook(pageKey = 'race-page') {
      return renderHook(
        ({ pageKey: key }: { pageKey: string }) => useColumnPreferences(key, RACE_COLUMNS),
        { initialProps: { pageKey } },
      );
    }

    it('keeps both columns visible when a second column is enabled after a >500ms gap', async () => {
      const view = renderRaceHook();

      // Tick column A. Its save debounce is 500ms.
      act(() => {
        view.result.current.toggleColumn('colA');
      });

      // Let A's debounce fire so its PATCH is actually in flight, then hold the response open.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(upsertCalls).toHaveLength(1);
      expect(parsePayload(upsertCalls[0]!.value).visible).toEqual(['title', 'amount', 'colA']);

      // The gap the fast-click path never exercises: reading the next label takes >500ms.
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      // Tick column B while A's write is still unresolved.
      act(() => {
        view.result.current.toggleColumn('colB');
      });
      expect(view.result.current.visibleColumns.has('colB')).toBe(true);

      // Resolve A's write — the store now echoes A's own payload back.
      await act(async () => {
        writes[0]!.resolve();
      });

      // Non-vacuity guard: the echo the load effect is about to see genuinely omits colB.
      // Without this, the test could pass simply because the echo already contained B, and
      // it would then pass identically before and after the fix.
      expect(prefsState).toHaveLength(1);
      expect(parsePayload(prefsState[0]!.value).visible).toContain('colA');
      expect(parsePayload(prefsState[0]!.value).visible).not.toContain('colB');

      // The re-render the real optimistic `setPreferences` would trigger — this is what
      // re-runs the load effect against the stale payload.
      view.rerender({ pageKey: 'race-page' });
      await act(async () => {});

      expect(view.result.current.visibleColumns.has('colA')).toBe(true);
      expect(view.result.current.visibleColumns.has('colB')).toBe(true);
    });

    it('keeps at most one write in flight and sends the newest state in the later write', async () => {
      const view = renderRaceHook();

      act(() => {
        view.result.current.toggleColumn('colA');
      });
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      act(() => {
        view.result.current.toggleColumn('colB');
      });

      // B's own debounce fires while A's write is still in flight.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      // Only A's write exists so far: B's payload is queued, not fired concurrently.
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(events).toEqual(['call:0']);

      await act(async () => {
        writes[0]!.resolve();
      });

      // B's payload goes out only after A's write settled, and it carries both columns.
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(events).toEqual(['call:0', 'settle:0', 'call:1']);
      const second = parsePayload(upsertCalls[1]!.value);
      expect(second.visible).toContain('colA');
      expect(second.visible).toContain('colB');
    });

    it('keeps both columns hidden when a second column is hidden after a >500ms gap', async () => {
      const view = renderRaceHook();

      act(() => {
        view.result.current.toggleColumn('title');
      });
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(parsePayload(upsertCalls[0]!.value).visible).toEqual(['amount']);

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      act(() => {
        view.result.current.toggleColumn('amount');
      });
      expect(view.result.current.visibleColumns.has('amount')).toBe(false);

      await act(async () => {
        writes[0]!.resolve();
      });

      // Non-vacuity guard: the echo still lists 'amount' as visible.
      expect(parsePayload(prefsState[0]!.value).visible).toContain('amount');

      view.rerender({ pageKey: 'race-page' });
      await act(async () => {});

      expect(view.result.current.visibleColumns.has('title')).toBe(false);
      expect(view.result.current.visibleColumns.has('amount')).toBe(false);

      const last = parsePayload(upsertCalls[upsertCalls.length - 1]!.value);
      expect(last.visible).not.toContain('title');
      expect(last.visible).not.toContain('amount');
    });

    it('preserves a mixed enable-then-hide sequence separated by a >500ms gap', async () => {
      const view = renderRaceHook();

      act(() => {
        view.result.current.toggleColumn('colA'); // enable
      });
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(parsePayload(upsertCalls[0]!.value).visible).toContain('title');

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      act(() => {
        view.result.current.toggleColumn('title'); // hide
      });
      expect(view.result.current.visibleColumns.has('title')).toBe(false);

      await act(async () => {
        writes[0]!.resolve();
      });

      // Non-vacuity guard: the echo still lists 'title' as visible and omits nothing else.
      expect(parsePayload(prefsState[0]!.value).visible).toContain('title');

      view.rerender({ pageKey: 'race-page' });
      await act(async () => {});

      expect(view.result.current.visibleColumns.has('colA')).toBe(true);
      expect(view.result.current.visibleColumns.has('amount')).toBe(true);
      expect(view.result.current.visibleColumns.has('title')).toBe(false);

      const last = parsePayload(upsertCalls[upsertCalls.length - 1]!.value);
      expect(last.visible).toContain('colA');
      expect(last.visible).toContain('amount');
      expect(last.visible).not.toContain('title');
    });

    it('keeps a second reorder when the first reorder save resolves afterwards', async () => {
      const view = renderRaceHook();
      expect(view.result.current.columnOrder).toEqual(['title', 'amount', 'colA', 'colB']);

      act(() => {
        view.result.current.moveColumn(0, 1);
      });
      expect(view.result.current.columnOrder).toEqual(['amount', 'title', 'colA', 'colB']);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      act(() => {
        view.result.current.moveColumn(2, 3);
      });
      expect(view.result.current.columnOrder).toEqual(['amount', 'title', 'colB', 'colA']);

      await act(async () => {
        writes[0]!.resolve();
      });

      // Non-vacuity guard: the echo carries the first reorder's order, not the second's.
      expect(parsePayload(prefsState[0]!.value).order).toEqual(['amount', 'title', 'colA', 'colB']);

      view.rerender({ pageKey: 'race-page' });
      await act(async () => {});

      expect(view.result.current.columnOrder).toEqual(['amount', 'title', 'colB', 'colA']);
      const last = parsePayload(upsertCalls[upsertCalls.length - 1]!.value);
      expect(last.order).toEqual(['amount', 'title', 'colB', 'colA']);
    });

    it('still coalesces rapid toggles into a single write carrying both columns', async () => {
      const view = renderRaceHook();

      act(() => {
        view.result.current.toggleColumn('colA');
        view.result.current.toggleColumn('colB');
      });

      expect(mockUpsert).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const only = parsePayload(upsertCalls[0]!.value);
      expect(only.visible).toContain('colA');
      expect(only.visible).toContain('colB');
      expect(view.result.current.visibleColumns.has('colA')).toBe(true);
      expect(view.result.current.visibleColumns.has('colB')).toBe(true);
    });

    it('still applies store updates that arrive before any local edit', async () => {
      const view = renderRaceHook();

      // Defaults first — nothing stored yet (this is `usePreferences` before its fetch resolves).
      expect(view.result.current.visibleColumns.has('colA')).toBe(false);
      expect(view.result.current.visibleColumns.has('title')).toBe(true);

      // The initial fetch resolves with a stored preference.
      prefsState = [
        makePreference(
          'table.race-page.columns',
          JSON.stringify({ visible: ['colA'], order: ['colA', 'title', 'amount', 'colB'] }),
        ),
      ];
      view.rerender({ pageKey: 'race-page' });
      await act(async () => {});

      expect(view.result.current.visibleColumns.has('colA')).toBe(true);
      expect(view.result.current.visibleColumns.has('title')).toBe(false);
      expect(view.result.current.visibleColumns.has('amount')).toBe(false);
      expect(view.result.current.columnOrder).toEqual(['colA', 'title', 'amount', 'colB']);
    });

    it('re-hydrates from the new key when pageKey changes after a local edit', async () => {
      prefsState = [
        makePreference('table.other-page.columns', JSON.stringify({ visible: ['colB'] })),
      ];
      const view = renderRaceHook('race-page');
      await act(async () => {});

      // Take local authority for 'race-page'.
      act(() => {
        view.result.current.toggleColumn('colA');
      });
      expect(view.result.current.visibleColumns.has('colA')).toBe(true);

      // Switching tables must hydrate from the new key despite the local edit on the old one.
      view.rerender({ pageKey: 'other-page' });
      await act(async () => {});

      expect(view.result.current.visibleColumns.has('colB')).toBe(true);
      expect(view.result.current.visibleColumns.has('colA')).toBe(false);
      expect(view.result.current.visibleColumns.has('title')).toBe(false);
    });

    it('shows an error toast when a write fails and preserves local column state', async () => {
      const view = renderRaceHook();

      act(() => {
        view.result.current.toggleColumn('colA');
      });

      // Let the debounce fire to dispatch the write.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(upsertCalls).toHaveLength(1);

      // Fail the write.
      await act(async () => {
        writes[0]!.reject(new Error('network error'));
      });

      // Toast must fire exactly once with the error severity.
      expect(mockShowToast).toHaveBeenCalledTimes(1);
      expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String));

      // Local column state must not be reverted — the UI stays consistent.
      expect(view.result.current.visibleColumns.has('colA')).toBe(true);
    });

    it('does not wedge the save queue when a write fails', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        const view = renderRaceHook();

        act(() => {
          view.result.current.toggleColumn('colA');
        });
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
        expect(upsertCalls).toHaveLength(1);

        await act(async () => {
          jest.advanceTimersByTime(600);
        });
        act(() => {
          view.result.current.toggleColumn('colB');
        });

        // First write fails.
        await act(async () => {
          writes[0]!.reject(new Error('network down'));
        });

        // A toast must fire to inform the user of the save error.
        expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String));

        // The queue drains anyway: the newest payload still goes out.
        expect(upsertCalls).toHaveLength(2);
        const second = parsePayload(upsertCalls[1]!.value);
        expect(second.visible).toContain('colA');
        expect(second.visible).toContain('colB');

        // And a later toggle is still able to save (the queue is not stuck "saving").
        await act(async () => {
          writes[1]!.resolve();
        });
        act(() => {
          view.result.current.toggleColumn('title');
        });
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
        expect(upsertCalls).toHaveLength(3);
        expect(parsePayload(upsertCalls[2]!.value).visible).not.toContain('title');

        // Give Node a real macrotask to surface any unhandled rejection.
        jest.useRealTimers();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });
});
