/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type * as AttentionApiTypes from '../lib/attentionApi.js';
import type * as ProviderModule from './AttentionProvider.js';
import type * as HookModule from './useShellAttention.js';
import { makeAttention, makeRow } from '../test/attentionFixtures.js';

const mockGetAttention = jest.fn<typeof AttentionApiTypes.getAttention>();
jest.unstable_mockModule('../lib/attentionApi.js', () => ({
  getAttention: mockGetAttention,
  notNow: jest.fn(),
  undoNotNow: jest.fn(),
}));

let AttentionProvider: typeof ProviderModule.AttentionProvider;
let useShellAttention: typeof HookModule.useShellAttention;

const START = 1_700_000_000_000;
let now = START;

function rows(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeRow('N1', {
      subject: { type: 'work_item', id: `wi-${i}`, label: `Task ${i}`, area: null },
    }),
  );
}

function Consumer({ name }: { name: string }) {
  const a = useShellAttention();
  return (
    <div>
      <span data-testid={`${name}-count`}>{a.data ? String(a.data.count) : 'none'}</span>
      <span data-testid={`${name}-status`}>{a.status}</span>
      <button type="button" onClick={() => a.refreshStale(2000)}>
        {`${name}-stale-2s`}
      </button>
      <button type="button" onClick={() => a.refreshStale(60_000)}>
        {`${name}-stale-60s`}
      </button>
      <button type="button" onClick={() => a.refresh()}>
        {`${name}-refresh`}
      </button>
      <button type="button" onClick={() => a.retry()}>
        {`${name}-retry`}
      </button>
      <button type="button" onClick={() => a.setIncludeSnoozed(true)}>
        {`${name}-snoozed`}
      </button>
      <button type="button" onClick={() => a.removeRow(a.data!.rows[0]!.key, 'notNow')}>
        {`${name}-remove`}
      </button>
    </div>
  );
}

function Nav() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/other')}>
      go
    </button>
  );
}

function setup(consumers: string[] = ['a']) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AttentionProvider>
        <Nav />
        {consumers.map((c) => (
          <Consumer key={c} name={c} />
        ))}
      </AttentionProvider>
    </MemoryRouter>,
  );
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('AttentionProvider', () => {
  beforeEach(async () => {
    if (!AttentionProvider) {
      ({ AttentionProvider } = await import('./AttentionProvider.js'));
      ({ useShellAttention } = await import('./useShellAttention.js'));
    }
    now = START;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockGetAttention.mockReset();
    mockGetAttention.mockResolvedValue(makeAttention(rows(3)));
    setVisibility('visible');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setVisibility('visible');
  });

  async function ready(name = 'a') {
    await waitFor(() => expect(screen.getByTestId(`${name}-status`)).toHaveTextContent('ready'));
  }

  it('loads once on mount', async () => {
    setup();
    await ready();
    expect(mockGetAttention).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('a-count')).toHaveTextContent('3');
  });

  describe('route change', () => {
    it('does not fetch when the last request is younger than 60 s', async () => {
      setup();
      await ready();
      now = START + 59_999;
      fireEvent.click(screen.getByText('go'));
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });

    it('fetches silently at 60 s or more, keeping the data on screen', async () => {
      setup();
      await ready();
      let resolve!: (v: ReturnType<typeof makeAttention>) => void;
      mockGetAttention.mockImplementationOnce(
        () => new Promise((r) => (resolve = r as typeof resolve)),
      );
      now = START + 60_000;
      fireEvent.click(screen.getByText('go'));
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('a-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('a-count')).toHaveTextContent('3');
      await act(async () => resolve(makeAttention(rows(5))));
      await waitFor(() => expect(screen.getByTestId('a-count')).toHaveTextContent('5'));
    });

    it('does not fetch on first mount beyond the initial load', async () => {
      now = START + 10 * 60_000;
      setup();
      await ready();
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });
  });

  describe('tab focus', () => {
    it('visibilitychange to visible fetches when 60 s have passed', async () => {
      setup();
      await ready();
      now = START + 61_000;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
    });

    it('visibilitychange to visible within 60 s does not fetch', async () => {
      setup();
      await ready();
      now = START + 5_000;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });

    it('a hidden tab does not fetch even when stale', async () => {
      setup();
      await ready();
      now = START + 120_000;
      setVisibility('hidden');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });

    it('window focus fetches when stale and not when fresh', async () => {
      setup();
      await ready();
      now = START + 1_000;
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
      now = START + 61_000;
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
    });

    it('removes both listeners on unmount', async () => {
      const addDoc = jest.spyOn(document, 'addEventListener');
      const removeDoc = jest.spyOn(document, 'removeEventListener');
      const addWin = jest.spyOn(window, 'addEventListener');
      const removeWin = jest.spyOn(window, 'removeEventListener');
      const { unmount } = setup();
      await ready();
      unmount();
      const visAdded = addDoc.mock.calls.filter(([type]) => type === 'visibilitychange');
      const visRemoved = removeDoc.mock.calls.filter(([type]) => type === 'visibilitychange');
      const focusAdded = addWin.mock.calls.filter(([type]) => type === 'focus');
      const focusRemoved = removeWin.mock.calls.filter(([type]) => type === 'focus');
      expect(visAdded.length).toBeGreaterThan(0);
      expect(focusAdded.length).toBeGreaterThan(0);
      for (const [, handler] of visAdded) {
        expect(visRemoved.some(([, h]) => h === handler)).toBe(true);
      }
      for (const [, handler] of focusAdded) {
        expect(focusRemoved.some(([, h]) => h === handler)).toBe(true);
      }
    });

    it('does not fetch after unmount on focus', async () => {
      const { unmount } = setup();
      await ready();
      unmount();
      now = START + 120_000;
      window.dispatchEvent(new Event('focus'));
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshStale', () => {
    it('a 2 s freshness check right after mount does not fetch', async () => {
      setup();
      await ready();
      now = START + 100;
      fireEvent.click(screen.getByText('a-stale-2s'));
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });

    it('a child that asks in its own mount effect (Home) does not duplicate the first load', async () => {
      function AsksOnMount() {
        const { refreshStale } = useShellAttention();
        useEffect(() => {
          refreshStale(2000);
        }, [refreshStale]);
        return null;
      }
      render(
        <MemoryRouter>
          <AttentionProvider>
            <AsksOnMount />
            <Consumer name="a" />
          </AttentionProvider>
        </MemoryRouter>,
      );
      await ready();
      expect(mockGetAttention).toHaveBeenCalledTimes(1);
    });

    it('fetches once the last request is older than the limit', async () => {
      setup();
      await ready();
      now = START + 2_000;
      fireEvent.click(screen.getByText('a-stale-2s'));
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
    });

    it('a request stamps the clock so a second call right after is deduplicated', async () => {
      setup();
      await ready();
      now = START + 70_000;
      fireEvent.click(screen.getByText('a-stale-60s'));
      fireEvent.click(screen.getByText('a-stale-60s'));
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
      expect(mockGetAttention).toHaveBeenCalledTimes(2);
    });

    it('refresh, retry and setIncludeSnoozed stamp the clock too', async () => {
      setup();
      await ready();
      now = START + 100_000;
      fireEvent.click(screen.getByText('a-refresh'));
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
      now += 1_000;
      fireEvent.click(screen.getByText('a-stale-2s'));
      expect(mockGetAttention).toHaveBeenCalledTimes(2);

      now += 100_000;
      fireEvent.click(screen.getByText('a-retry'));
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(3));
      now += 1_000;
      fireEvent.click(screen.getByText('a-stale-2s'));
      expect(mockGetAttention).toHaveBeenCalledTimes(3);

      now += 100_000;
      fireEvent.click(screen.getByText('a-snoozed'));
      await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(4));
      expect(mockGetAttention).toHaveBeenLastCalledWith({ includeSnoozed: true });
      now += 1_000;
      fireEvent.click(screen.getByText('a-stale-2s'));
      expect(mockGetAttention).toHaveBeenCalledTimes(4);
    });
  });

  it('exposes one stable homeHeadingRef to every consumer', async () => {
    const refs: unknown[] = [];
    function RefProbe() {
      refs.push(useShellAttention().homeHeadingRef);
      return null;
    }
    render(
      <MemoryRouter>
        <AttentionProvider>
          <RefProbe />
          <RefProbe />
        </AttentionProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockGetAttention).toHaveBeenCalled());
    expect(new Set(refs).size).toBe(1);
  });

  it('removeRow updates the count that every consumer sees in the same render', async () => {
    setup(['a', 'b']);
    await ready('a');
    expect(screen.getByTestId('a-count')).toHaveTextContent('3');
    expect(screen.getByTestId('b-count')).toHaveTextContent('3');
    fireEvent.click(screen.getByText('a-remove'));
    expect(screen.getByTestId('a-count')).toHaveTextContent('2');
    expect(screen.getByTestId('b-count')).toHaveTextContent('2');
  });

  it('shares one request between consumers (no second getAttention per consumer)', async () => {
    setup(['a', 'b', 'c']);
    await ready('c');
    expect(mockGetAttention).toHaveBeenCalledTimes(1);
  });
});
