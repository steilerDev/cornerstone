/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';

// ── API mock ──────────────────────────────────────────────────────────────────

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
  getDiaryEntry: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  exportDiaryPdf: jest.fn(),
}));

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
    sourceEntityType: null,
    sourceEntityId: null,
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

  it('renders the type switcher', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    expect(screen.getByRole('radiogroup', { name: /filter entries by type/i })).toBeInTheDocument();
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

  // ─── Filter mode changes call API ──────────────────────────────────────────

  it('calls listDiaryEntries again when type switcher mode changes', async () => {
    const user = userEvent.setup();
    mockListDiaryEntries.mockResolvedValue(emptyResponse);

    renderPage();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));

    await act(async () => {
      await user.click(screen.getByTestId('type-switcher-manual'));
    });

    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(2));
  });

  // ─── New Entry button ─────────────────────────────────────────────────────

  it('renders a "+ New Entry" link pointing to /diary/new', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    const newEntryLink = screen.getByRole('link', { name: /new entry/i });
    expect(newEntryLink).toHaveAttribute('href', '/diary/new');
  });
});
