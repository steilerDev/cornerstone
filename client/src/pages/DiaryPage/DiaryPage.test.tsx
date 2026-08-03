/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import type React from 'react';

// ── API mock ──────────────────────────────────────────────────────────────────

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
  getDiaryEntry: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  promoteDiaryEntry: jest.fn(),
}));

// ─── Mock: formatters — DiaryDateGroup and DiaryEntryCard use useFormatters() ──

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
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: jest.fn(),
    computeWorkDuration: jest.fn(),
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSummary(id: string, overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    title: `Entry ${id}`,
    body: `Body of entry ${id}`,
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'Alice' },
    createdAt: '2026-03-14T09:00:00.000Z',
    updatedAt: '2026-03-14T09:00:00.000Z',
    ...overrides,
  };
}

function makeListResponse(entries: DiaryEntrySummary[], totalPages = 1): DiaryEntryListResponse {
  return {
    items: entries,
    pagination: {
      page: 1,
      pageSize: 25,
      totalPages,
      totalItems: entries.length,
    },
  };
}

const emptyResponse = makeListResponse([]);

describe('DiaryPage', () => {
  let DiaryPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryPage) {
      const mod = await import('./DiaryPage.js');
      DiaryPage = mod.default;
    }
    mockListDiaryEntries.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderPage = (initialEntries = ['/diary']) =>
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <DiaryPage />
      </MemoryRouter>,
    );

  // ─── Heading ────────────────────────────────────────────────────────────────

  it('renders the "Construction Diary" h1 heading', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Construction Diary', level: 1 }),
    ).toBeInTheDocument();
  });

  it('shows the total entry count in the subtitle', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([makeSummary('1'), makeSummary('2')]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/2 entries/i)).toBeInTheDocument();
    });
  });

  it('uses singular "entry" when totalItems is 1', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/1 entry/i)).toBeInTheDocument();
    });
  });

  // ─── API call on mount ───────────────────────────────────────────────────────

  it('calls listDiaryEntries on mount', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────────────

  it('shows loading indicator while fetching', () => {
    // Never resolves during this check
    mockListDiaryEntries.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText(/loading entries/i)).toBeInTheDocument();
  });

  // ─── Entry display and grouping ─────────────────────────────────────────────

  it('renders entry cards after successful load', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-card-de-1')).toBeInTheDocument();
    });
  });

  it('groups entries under a date header', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([makeSummary('de-1', { entryDate: '2026-03-14' })]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('date-group-2026-03-14')).toBeInTheDocument();
    });
  });

  it('shows multiple date groups when entries span different dates', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([
        makeSummary('de-1', { entryDate: '2026-03-14' }),
        makeSummary('de-2', { entryDate: '2026-03-13' }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('date-group-2026-03-14')).toBeInTheDocument();
      expect(screen.getByTestId('date-group-2026-03-13')).toBeInTheDocument();
    });
  });

  it('renders the filter bar', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    expect(screen.getByTestId('diary-filter-bar')).toBeInTheDocument();
  });

  // ─── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when no entries exist', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no diary entries yet/i)).toBeInTheDocument();
    });
  });

  it('shows a CTA link to create first entry in empty state', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/create your first entry/i)).toBeInTheDocument();
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────────

  it('shows an error banner when the API fails', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockListDiaryEntries.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server went down' }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Server went down')).toBeInTheDocument();
    });
  });

  it('shows generic error message when non-ApiClientError is thrown', async () => {
    mockListDiaryEntries.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load diary entries/i)).toBeInTheDocument();
    });
  });

  // ─── Pagination ──────────────────────────────────────────────────────────────

  it('shows pagination controls when there are multiple pages', async () => {
    mockListDiaryEntries.mockResolvedValueOnce({
      items: [makeSummary('de-1')],
      pagination: { page: 1, pageSize: 25, totalPages: 3, totalItems: 60 },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('next-page-button')).toBeInTheDocument();
      expect(screen.getByTestId('prev-page-button')).toBeInTheDocument();
    });
  });

  it('does not show pagination when there is only one page', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId('next-page-button')).not.toBeInTheDocument();
    });
  });

  it('disables the Previous button on the first page', async () => {
    mockListDiaryEntries.mockResolvedValueOnce({
      items: [makeSummary('de-1')],
      pagination: { page: 1, pageSize: 25, totalPages: 3, totalItems: 60 },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('prev-page-button')).toBeDisabled();
    });
  });

  it('disables the Next button on the last page', async () => {
    mockListDiaryEntries.mockResolvedValueOnce({
      items: [makeSummary('de-1')],
      pagination: { page: 3, pageSize: 25, totalPages: 3, totalItems: 60 },
    });
    // Render with URL param page=3
    render(
      <MemoryRouter initialEntries={['/diary?page=3']}>
        <DiaryPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('next-page-button')).toBeDisabled();
    });
  });

  // ─── useDebounce migration (#1816): page param not reset on mount ─────────
  // Regression test for the `isFirstSearchSync` guard around the debounced
  // search-sync effect. Without it, mounting with both `q` and `page` in the
  // URL would fire the search-sync effect on mount (since useDebounce returns
  // its initial value synchronously) and reset `page` back to '1', discarding
  // the user's pagination position on page load/refresh.

  it('does not reset the page URL param to 1 on initial mount when the URL has both q and page', async () => {
    // NOTE: mounting with a `page` URL param already produces two fetches by
    // design, unrelated to this guard: `currentPage` state initializes to 1,
    // then a separate effect syncs it from the `page` URL param once `urlPage`
    // is read, triggering a second fetch. That's pre-existing behavior. What
    // this test guards against is a THIRD, spurious fetch/URL-rewrite from the
    // debounced-search-sync effect resetting `page` back to '1' on mount
    // (since useDebounce returns its initial value synchronously, that effect
    // would otherwise treat the initial `q` value as a "change").
    mockListDiaryEntries.mockResolvedValue({
      items: [makeSummary('de-1')],
      pagination: { page: 3, pageSize: 25, totalPages: 5, totalItems: 120 },
    });

    render(
      <MemoryRouter initialEntries={['/diary?q=foo&page=3']}>
        <DiaryPage />
      </MemoryRouter>,
    );

    // Final rendered state must reflect page 3, not a reset to page 1.
    await waitFor(() => {
      expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
    });

    // The last API call must have requested page 3 with the search query intact
    // — if the isFirstSearchSync guard were missing, the debounced-search-sync
    // effect would have rewritten the URL's `page` param back to '1' on mount,
    // and this final call/render would show page 1 instead.
    const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
    expect(lastCall?.[0]?.page).toBe(3);
    expect(lastCall?.[0]?.q).toBe('foo');
  });

  // ─── Filter mode changes call API ──────────────────────────────────────────

  // ─── New Entry button ─────────────────────────────────────────────────────

  it('renders a "+ New Entry" link pointing to /diary/new', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    const newEntryLink = screen.getByRole('link', { name: /new entry/i });
    expect(newEntryLink).toHaveAttribute('href', '/diary/new');
  });

  // ─── Export functionality removed ─────────────────────────────────────────

  it('does not render an export or PDF button', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-card-de-1')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument();
  });

  // ─── Filter mode default and URL param behaviour ──────────────────────────────

  describe('filter mode — default and URL param behaviour', () => {
    it('defaults to manual filter mode when no filterMode URL param is present', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });
      // The manual mode button should be pressed
      expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'true');
      // The all mode button should not be pressed
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'false');
      // The API call should include the manual type set
      const callArg = mockListDiaryEntries.mock.calls[0]?.[0];
      expect(callArg?.type).toBeDefined();
      expect(callArg?.type).toContain('daily_log');
    });

    it('honors explicit filterMode=all URL param', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?filterMode=all']);
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });
      // The all mode button should be pressed
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'false');
      // With filterMode=all and no type restrictions, type should be undefined (no restriction)
      const callArg = mockListDiaryEntries.mock.calls[0]?.[0];
      expect(callArg?.type).toBeUndefined();
    });

    it('honors explicit filterMode=automatic URL param', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?filterMode=automatic']);
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });
      // The automatic mode button should be pressed
      expect(screen.getByTestId('mode-filter-automatic')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'false');
    });

    it('handleClearAll resets filterMode to manual', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      // Use q=test so filterCount >= 1 and the Clear All button is rendered
      renderPage(['/diary?filterMode=all&q=test']);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });

      // Confirm we start in 'all' mode
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'true');

      // Click the Clear All button
      const clearBtn = screen.getByTestId('clear-filters-button');
      await user.click(clearBtn);

      // After clearing, filterMode should reset to 'manual'
      await waitFor(() => {
        expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'true');
      });
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'false');

      // The second API call should use the manual type set
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.type).toContain('daily_log');
    });
  });

  // ─── Status chip row removed (Story #1435) ────────────────────────────────────

  describe('status chip row removed (Story #1435)', () => {
    it('Scenario 8: no status chip group rendered', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage();
      // The OLD status chip row had three buttons: "All", "Drafts only", "Saved only".
      // It was removed in Story #1435. Assert by button text so this doesn't collide
      // with the new drafts chip group (aria-label "Filter by draft status", Story #1446).
      expect(screen.queryByRole('button', { name: /^Drafts only$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Saved only$/i })).not.toBeInTheDocument();
    });
  });

  // ─── Drafts chip integration via DiaryFilterBar (Story #1446) ───────────────

  describe('drafts chip integration (Story #1446)', () => {
    it('Scenario 9: chip has aria-pressed=true when URL has no status param (drafts visible)', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => {
        const chip = screen.getByTestId('status-filter-drafts');
        expect(chip).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('Scenario 10: chip has aria-pressed=false when URL has ?status=saved (drafts hidden)', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?status=saved']);
      await waitFor(() => {
        const chip = screen.getByTestId('status-filter-drafts');
        expect(chip).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('Scenario 11: clicking pressed chip sets status=saved and calls listDiaryEntries with status="saved"', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });

      const chip = screen.getByTestId('status-filter-drafts');
      await user.click(chip);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'saved' }),
        );
      });
    });

    it('Scenario 11b: clicking unpressed chip removes status param and calls listDiaryEntries without status', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?status=saved']);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });

      const chip = screen.getByTestId('status-filter-drafts');
      await user.click(chip);

      await waitFor(() => {
        const lastCall =
          mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
        expect(lastCall?.[0]?.status).toBeUndefined();
      });
    });
  });
});
