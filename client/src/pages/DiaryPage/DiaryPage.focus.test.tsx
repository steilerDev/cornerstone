/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryListResponse } from '@cornerstone/shared';
import type React from 'react';
import { CaptureUploadsContext } from '../../capture/captureUploadsContext.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { makeEngine } from '../../test/captureFixtures.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';

let media: MatchMediaControl;
const engine = makeEngine();

// ── IntersectionObserver stub ────────────────────────────────────────────────
// jsdom does not implement IntersectionObserver, and useInfiniteScroll (used by
// DiaryPage) attaches one to its sentinel unconditionally on mount. None of these
// page-level tests drive the observer directly (that's covered in
// useInfiniteScroll.test.tsx) — this is just a no-op stub so mounting doesn't throw.
class NoopIntersectionObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  constructor(_cb: IntersectionObserverCallback) {}
}

let originalIntersectionObserver: typeof IntersectionObserver | undefined;

// ── API mock ──────────────────────────────────────────────────────────────────
// The feed and the "Unfinished" row both call listDiaryEntries. The Unfinished row asks for
// drafts, three at a time; route it to its own mock so feed expectations stay about the feed.

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockListUnfinished = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockFetchDiaryFilterOptions = jest.fn<typeof DiaryApiTypes.fetchDiaryFilterOptions>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: (params?: Parameters<typeof DiaryApiTypes.listDiaryEntries>[0]) =>
    params?.status === 'draft' && params.pageSize === 3
      ? mockListUnfinished(params)
      : mockListDiaryEntries(params),
  fetchDiaryFilterOptions: mockFetchDiaryFilterOptions,
  getDiaryEntry: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  promoteDiaryEntry: jest.fn(),
}));

// "Today" is fixed so the week headings are deterministic: Saturday 2026-03-14, week of 2026-03-09.
const TODAY = '2026-03-14';
jest.unstable_mockModule('../../lib/localDate.js', () => ({ todayLocalIsoDate: () => TODAY }));

// ─── Mock: formatters (DiaryEntryFeedRow, the week headings and the filter chips) ──

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtDayMonth = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtDayRange = (start: string, end: string) => `${start} to ${end}`;
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const bound = {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatDayMonth: fmtDayMonth,
    formatDayRange: fmtDayRange,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  };
  return {
    ...bound,
    computeActualDuration: jest.fn(),
    computeWorkDuration: jest.fn(),
    useFormatters: () => bound,
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const emptyResponse: DiaryEntryListResponse = {
  items: [],
  pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 0 },
};

function Elsewhere() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/diary', { state: { focusHeading: true } })}>
        arrive with flag
      </button>
      <button type="button" onClick={() => navigate('/diary', { state: { origin: { to: '/' } } })}>
        arrive without flag
      </button>
    </>
  );
}

describe('DiaryPage — heading focus on arrival (#2221, after Discard)', () => {
  let DiaryPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryPage) {
      const mod = await import('./DiaryPage.js');
      DiaryPage = mod.default;
    }
    mockListDiaryEntries.mockReset();
    mockListDiaryEntries.mockResolvedValue(emptyResponse);
    mockListUnfinished.mockReset();
    mockListUnfinished.mockResolvedValue(emptyResponse);
    mockFetchDiaryFilterOptions.mockReset();
    mockFetchDiaryFilterOptions.mockResolvedValue({ types: [], areas: [], companies: [] });
    media = installMatchMedia({ '(min-width: 768px)': true });
    originalIntersectionObserver = globalThis.IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      NoopIntersectionObserver;
  });

  afterEach(() => {
    media.restore();
    localStorage.clear();
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      originalIntersectionObserver;
  });

  const renderPage = (state?: unknown) =>
    render(
      <ToastProvider>
        <CaptureUploadsContext value={engine.api}>
          <MemoryRouter initialEntries={[{ pathname: '/diary', state }]}>
            <DiaryPage />
            <Elsewhere />
          </MemoryRouter>
        </CaptureUploadsContext>
      </ToastProvider>,
    );

  it('focuses the h1 when the router state carries the flag', async () => {
    renderPage({ focusHeading: true });

    const h1 = screen.getByRole('heading', { level: 1, name: 'Site diary' });

    await waitFor(() => expect(h1).toHaveFocus());
    expect(h1).toHaveAttribute('tabindex', '-1');
  });

  it('leaves focus alone without the flag', async () => {
    renderPage({ origin: { to: '/' } });

    const h1 = screen.getByRole('heading', { level: 1, name: 'Site diary' });
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

    expect(h1).not.toHaveFocus();
    expect(h1).toHaveAttribute('tabindex', '-1');
  });

  it('leaves focus alone without any state', async () => {
    renderPage();

    const h1 = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

    expect(h1).not.toHaveFocus();
  });

  it('focuses once per navigation: a re-render does not take focus back', async () => {
    renderPage({ focusHeading: true });
    const h1 = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(h1).toHaveFocus());
    const other = screen.getByRole('button', { name: 'arrive without flag' });

    act(() => other.focus());
    await act(async () => {
      await Promise.resolve();
    });

    expect(other).toHaveFocus();
  });

  it('focuses again for the next navigation that carries the flag', async () => {
    renderPage({ focusHeading: true });
    const h1 = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(h1).toHaveFocus());
    const other = screen.getByRole('button', { name: 'arrive with flag' });
    act(() => other.focus());

    act(() => other.click());

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('does not take focus on a later navigation without the flag', async () => {
    renderPage({ focusHeading: true });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    const other = screen.getByRole('button', { name: 'arrive without flag' });
    act(() => other.focus());

    act(() => other.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(other).toHaveFocus();
  });
});
