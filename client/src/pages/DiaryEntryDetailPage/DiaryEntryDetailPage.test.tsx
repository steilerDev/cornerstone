/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryDetail } from '@cornerstone/shared';

// ── API mock ──────────────────────────────────────────────────────────────────

const mockGetDiaryEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  getDiaryEntry: mockGetDiaryEntry,
  listDiaryEntries: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseDetail: DiaryEntryDetail = {
  id: 'de-1',
  entryType: 'daily_log',
  entryDate: '2026-03-14',
  title: 'Foundation Work',
  body: 'Poured concrete for the main foundation.',
  metadata: null,
  isAutomatic: false,
  sourceEntityType: null,
  sourceEntityId: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

describe('DiaryEntryDetailPage', () => {
  let DiaryEntryDetailPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryEntryDetailPage) {
      const mod = await import('./DiaryEntryDetailPage.js');
      DiaryEntryDetailPage = mod.default;
    }
    mockGetDiaryEntry.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDetailPage = (id = 'de-1') =>
    render(
      <MemoryRouter initialEntries={[`/diary/${id}`]}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

  // ─── Basic rendering ────────────────────────────────────────────────────────

  it('calls getDiaryEntry with the id from URL params', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage('de-1');
    await waitFor(() => {
      expect(mockGetDiaryEntry).toHaveBeenCalledWith('de-1');
    });
  });

  it('shows loading indicator while fetching', () => {
    mockGetDiaryEntry.mockReturnValue(new Promise(() => undefined));
    renderDetailPage();
    expect(screen.getByText(/loading entry/i)).toBeInTheDocument();
  });

  it('renders the entry title after load', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });
  });

  it('renders the entry body after load', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(
        screen.getByText('Poured concrete for the main foundation.'),
      ).toBeInTheDocument();
    });
  });

  it('renders the author display name', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/Alice Builder/)).toBeInTheDocument();
    });
  });

  it('renders the type badge for the entry type', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-type-badge-daily_log')).toBeInTheDocument();
    });
  });

  // ─── Back button ────────────────────────────────────────────────────────────

  it('renders the "Back to Diary" link', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back to diary/i })).toBeInTheDocument();
    });
  });

  it('renders the back button (←)', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    });
  });

  // ─── Type-specific metadata — daily_log ─────────────────────────────────────

  it('shows weather info from daily_log metadata', async () => {
    const dailyLogEntry: DiaryEntryDetail = {
      ...baseDetail,
      entryType: 'daily_log',
      metadata: { weather: 'sunny', workersOnSite: 5 },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(dailyLogEntry);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('daily-log-metadata')).toBeInTheDocument();
      expect(screen.getByText(/sunny/i)).toBeInTheDocument();
      expect(screen.getByText(/5 workers/i)).toBeInTheDocument();
    });
  });

  // ─── Type-specific metadata — site_visit ────────────────────────────────────

  it('shows outcome badge for site_visit with pass outcome', async () => {
    const siteVisitEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-sv',
      entryType: 'site_visit',
      metadata: { inspectorName: 'Bob Inspector', outcome: 'pass' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
    renderDetailPage('de-sv');
    await waitFor(() => {
      expect(screen.getByTestId('outcome-pass')).toBeInTheDocument();
      expect(screen.getByText('Bob Inspector')).toBeInTheDocument();
    });
  });

  it('shows outcome badge for site_visit with fail outcome', async () => {
    const siteVisitEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-sv-fail',
      entryType: 'site_visit',
      metadata: { outcome: 'fail' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
    renderDetailPage('de-sv-fail');
    await waitFor(() => {
      expect(screen.getByTestId('outcome-fail')).toBeInTheDocument();
    });
  });

  it('shows outcome badge for site_visit with conditional outcome', async () => {
    const siteVisitEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-sv-cond',
      entryType: 'site_visit',
      metadata: { outcome: 'conditional' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
    renderDetailPage('de-sv-cond');
    await waitFor(() => {
      expect(screen.getByTestId('outcome-conditional')).toBeInTheDocument();
    });
  });

  // ─── Type-specific metadata — issue ─────────────────────────────────────────

  it('shows severity badge for issue with high severity', async () => {
    const issueEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-iss',
      entryType: 'issue',
      metadata: { severity: 'high', resolutionStatus: 'open' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(issueEntry);
    renderDetailPage('de-iss');
    await waitFor(() => {
      expect(screen.getByTestId('severity-high')).toBeInTheDocument();
    });
  });

  it('shows severity badge for issue with critical severity', async () => {
    const issueEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-iss-crit',
      entryType: 'issue',
      metadata: { severity: 'critical', resolutionStatus: 'in_progress' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(issueEntry);
    renderDetailPage('de-iss-crit');
    await waitFor(() => {
      expect(screen.getByTestId('severity-critical')).toBeInTheDocument();
    });
  });

  // ─── Photo count ─────────────────────────────────────────────────────────────

  it('shows photo count section when photoCount > 0', async () => {
    const entryWithPhotos: DiaryEntryDetail = { ...baseDetail, photoCount: 4 };
    mockGetDiaryEntry.mockResolvedValueOnce(entryWithPhotos);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/4 photo/i)).toBeInTheDocument();
    });
  });

  it('does not show photo count section when photoCount is 0', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.queryByText(/photo\(s\) attached/i)).not.toBeInTheDocument();
    });
  });

  // ─── Automatic entry badge ────────────────────────────────────────────────────

  it('shows "Automatic" badge for automatic entries', async () => {
    const autoEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-auto',
      entryType: 'work_item_status',
      isAutomatic: true,
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(autoEntry);
    renderDetailPage('de-auto');
    await waitFor(() => {
      expect(screen.getByText('Automatic')).toBeInTheDocument();
    });
  });

  // ─── Source entity link ───────────────────────────────────────────────────────

  it('shows the source entity section for automatic entries', async () => {
    const autoEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-auto-link',
      entryType: 'work_item_status',
      isAutomatic: true,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-kitchen',
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(autoEntry);
    renderDetailPage('de-auto-link');
    await waitFor(() => {
      expect(screen.getByText(/related to/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Work Item' })).toHaveAttribute(
        'href',
        '/project/work-items/wi-kitchen',
      );
    });
  });

  it('links to /budget/invoices/:id for invoice source entity', async () => {
    const invoiceEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-inv-link',
      entryType: 'invoice_status',
      isAutomatic: true,
      sourceEntityType: 'invoice',
      sourceEntityId: 'inv-999',
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(invoiceEntry);
    renderDetailPage('de-inv-link');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Invoice' })).toHaveAttribute(
        'href',
        '/budget/invoices/inv-999',
      );
    });
  });

  // ─── 404 not found ───────────────────────────────────────────────────────────

  it('shows "Diary entry not found" for a 404 error', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetDiaryEntry.mockRejectedValueOnce(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Diary entry not found' }),
    );
    renderDetailPage('nonexistent');
    await waitFor(() => {
      expect(screen.getByText('Diary entry not found')).toBeInTheDocument();
    });
  });

  it('shows the API error message for non-404 errors', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetDiaryEntry.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Database is down' }),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Database is down')).toBeInTheDocument();
    });
  });

  it('shows generic error message for non-ApiClientError', async () => {
    mockGetDiaryEntry.mockRejectedValueOnce(new Error('Network failure'));
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load diary entry/i)).toBeInTheDocument();
    });
  });

  it('renders Back to Diary link in error state', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetDiaryEntry.mockRejectedValueOnce(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Not found' }),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back to diary/i })).toBeInTheDocument();
    });
  });

  // ─── Timestamps ─────────────────────────────────────────────────────────────

  it('renders the created timestamp', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/created/i)).toBeInTheDocument();
    });
  });

  it('renders the updated timestamp when present', async () => {
    const entryWithUpdate: DiaryEntryDetail = {
      ...baseDetail,
      updatedAt: '2026-03-15T10:00:00.000Z',
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entryWithUpdate);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/updated/i)).toBeInTheDocument();
    });
  });
});
