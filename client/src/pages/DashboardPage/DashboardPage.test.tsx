/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type * as BudgetOverviewApiTypes from '../../lib/budgetOverviewApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as SubsidyProgramsApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as TimelineApiTypes from '../../lib/timelineApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as UsePreferencesTypes from '../../hooks/usePreferences.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type {
  BudgetOverview,
  InvoiceListPaginatedResponse,
  SubsidyProgramListResponse,
  TimelineResponse,
  UserPreference,
} from '@cornerstone/shared';

// ── Mock modules BEFORE importing the component ───────────────────────────────

const mockFetchBudgetOverview = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetOverview>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockFetchSubsidyPrograms = jest.fn<typeof SubsidyProgramsApiTypes.fetchSubsidyPrograms>();
const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();
const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockUpsertPreference = jest.fn<(key: string, value: string) => Promise<void>>();
const mockUsePreferences = jest.fn<typeof UsePreferencesTypes.usePreferences>();

jest.unstable_mockModule('../../lib/budgetOverviewApi.js', () => ({
  fetchBudgetOverview: mockFetchBudgetOverview,
  fetchBudgetBreakdown: jest.fn(),
}));

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
}));

jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
  fetchSubsidyProgram: jest.fn(),
  createSubsidyProgram: jest.fn(),
  updateSubsidyProgram: jest.fn(),
  deleteSubsidyProgram: jest.fn(),
}));

jest.unstable_mockModule('../../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  fetchInvoices: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
  fetchInvoiceById: jest.fn(),
}));

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  getDiaryEntry: jest.fn(),
}));

jest.unstable_mockModule('../../hooks/usePreferences.js', () => ({
  usePreferences: mockUsePreferences,
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
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
    computeActualDuration: () => null,
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

const minimalBudgetOverview: BudgetOverview = {
  availableFunds: 100000,
  sourceCount: 1,
  minPlanned: 80000,
  maxPlanned: 90000,
  actualCost: 50000,
  actualCostPaid: 40000,
  actualCostClaimed: 10000,
  remainingVsMinPlanned: 20000,
  remainingVsMaxPlanned: 10000,
  remainingVsActualCost: 50000,
  remainingVsActualPaid: 60000,
  remainingVsActualClaimed: 90000,
  remainingVsMinPlannedWithPayback: 20000,
  remainingVsMaxPlannedWithPayback: 10000,
  categorySummaries: [],
  subsidySummary: {
    totalReductions: 0,
    activeSubsidyCount: 0,
    minTotalPayback: 0,
    maxTotalPayback: 0,
  oversubscribedSubsidies: [],
  },
};

const emptyTimelineResponse: TimelineResponse = {
  workItems: [],
  dependencies: [],
  milestones: [],
  householdItems: [],
  criticalPath: [],
  dateRange: null,
};

const emptyInvoicesResponse: InvoiceListPaginatedResponse = {
  invoices: [],
  pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  summary: {
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    claimed: { count: 0, totalAmount: 0 },
    quotation: { count: 0, totalAmount: 0 },
  },
};

const emptySubsidyResponse: SubsidyProgramListResponse = { subsidyPrograms: [] };

/** Builds a UsePreferencesResult mock with a given preferences array */
function buildPreferencesMock(
  preferences: UserPreference[] = [],
): ReturnType<typeof UsePreferencesTypes.usePreferences> {
  return {
    preferences,
    isLoading: false,
    error: null,
    upsert: mockUpsertPreference as unknown as (key: string, value: string) => Promise<void>,
    remove: jest.fn() as unknown as (key: string) => Promise<void>,
    refresh: jest.fn(),
  };
}

/** All card titles defined in CARD_DEFINITIONS */
const ALL_CARD_TITLES = [
  'Budget Summary',
  'Source Utilization',
  'Upcoming Milestones',
  'Work Item Progress',
  'Critical Path',
  'Mini Gantt',
  'Invoice Pipeline',
  'Subsidy Pipeline',
  'Recent Diary',
  'Quick Actions',
] as const;

describe('DashboardPage', () => {
  let DashboardPage: React.ComponentType;

  beforeEach(async () => {
    if (!DashboardPage) {
      const module = await import('./DashboardPage.js');
      DashboardPage = module.default;
    }

    mockFetchBudgetOverview.mockReset();
    mockFetchBudgetSources.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockGetTimeline.mockReset();
    mockFetchAllInvoices.mockReset();
    mockListDiaryEntries.mockReset();
    mockUpsertPreference.mockReset();
    mockUsePreferences.mockReset();

    // Default: all APIs succeed with minimal/empty data; no hidden cards
    mockFetchBudgetOverview.mockResolvedValue(minimalBudgetOverview);
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
    mockFetchSubsidyPrograms.mockResolvedValue(emptySubsidyResponse);
    mockGetTimeline.mockResolvedValue(emptyTimelineResponse);
    mockFetchAllInvoices.mockResolvedValue(emptyInvoicesResponse);
    mockListDiaryEntries.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 },
    });
    mockUpsertPreference.mockResolvedValue(undefined);
    mockUsePreferences.mockReturnValue(buildPreferencesMock());
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>,
    );
  }

  // ─── Test 11: H1 heading ─────────────────────────────────────────────────

  it('renders h1 "Project"', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Project' })).toBeInTheDocument();
  });

  // ─── Test 12: ProjectSubNav ──────────────────────────────────────────────

  it('renders ProjectSubNav navigation', () => {
    renderPage();
    // ProjectSubNav renders a <nav> element with project links
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // ─── Test 13: All 10 cards render after data loads ───────────────────────

  it('renders all 10 card titles after data loads', async () => {
    renderPage();

    for (const title of ALL_CARD_TITLES) {
      await waitFor(() => {
        expect(screen.getAllByRole('heading', { name: title })[0]).toBeInTheDocument();
      });
    }
  });

  // ─── Test 14: Loading state initially ───────────────────────────────────

  it('shows loading skeletons initially for data-backed cards', () => {
    // Hold all API calls pending so loading state persists during assertion
    mockFetchBudgetOverview.mockReturnValue(new Promise(() => {}));
    mockFetchBudgetSources.mockReturnValue(new Promise(() => {}));
    mockFetchSubsidyPrograms.mockReturnValue(new Promise(() => {}));
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    mockFetchAllInvoices.mockReturnValue(new Promise(() => {}));
    mockListDiaryEntries.mockReturnValue(new Promise(() => {}));

    renderPage();

    // 6 data sources map to 9 cards with loading state:
    //   budgetOverview → Budget Summary (1)
    //   budgetSources  → Source Utilization (1)
    //   timeline       → Upcoming Milestones + Work Item Progress + Critical Path + Mini Gantt (4)
    //   invoices       → Invoice Pipeline (1)
    //   subsidyPrograms→ Subsidy Pipeline (1)
    //   diaryEntries   → Recent Diary (1)
    // Quick Actions has no dataSource — renders children immediately, no skeleton
    // Each card appears in both desktop grid and mobile section = 9 × 2 = 18
    const loadingEls = screen.getAllByRole('status', { name: /^Loading .+ data$/ });
    expect(loadingEls.length).toBe(18);
  });

  // ─── Test 15: Error state when API fails ────────────────────────────────

  it('shows error state for Budget Summary when budget overview API fails', async () => {
    const apiError = new ApiClientError(500, {
      code: 'INTERNAL_ERROR',
      message: 'Server exploded',
    });
    mockFetchBudgetOverview.mockRejectedValue(apiError);

    renderPage();

    // budgetOverview maps to 1 card → 1 error alert
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    // The API error message surfaces in the card
    const errorMessages = screen.getAllByText('Server exploded');
    expect(errorMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('uses generic fallback error message when a non-ApiClientError is thrown', async () => {
    mockFetchBudgetSources.mockRejectedValue(new Error('network down'));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Failed to load budget sources')[0]).toBeInTheDocument();
    });
  });

  // ─── Test 16: Empty state for data-backed cards ──────────────────────────

  it('shows empty state for Source Utilization when budget sources API returns empty list', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });

    renderPage();

    // Wait for the loading phase to complete
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Source Utilization' })[0]).toBeInTheDocument();
    });

    // isEmpty=true → empty message is shown for this card
    await waitFor(() => {
      expect(screen.getAllByText('No budget sources configured')[0]).toBeInTheDocument();
    });

    // Check that the contextual link is rendered
    expect(screen.getAllByRole('link', { name: 'Add a budget source' })[0]).toBeInTheDocument();
  });

  it('shows empty state for Subsidy Pipeline when subsidy programs API returns empty list', async () => {
    mockFetchSubsidyPrograms.mockResolvedValue({ subsidyPrograms: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Subsidy Pipeline' })[0]).toBeInTheDocument();
    });

    // isEmpty=true → empty message is shown for this card
    await waitFor(() => {
      expect(screen.getAllByText('No subsidy programs found')[0]).toBeInTheDocument();
    });

    // Check that the contextual link is rendered
    expect(screen.getAllByRole('link', { name: 'Add a subsidy program' })[0]).toBeInTheDocument();
  });

  // ─── Test 17: Dismiss calls upsert with dashboard.hiddenCards ────────────

  it('clicking dismiss on a card calls upsert with dashboard.hiddenCards containing the card id', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByRole('button', { name: 'Hide Budget Summary card' })[0]);

    await waitFor(() => {
      expect(mockUpsertPreference).toHaveBeenCalledWith(
        'dashboard.hiddenCards',
        JSON.stringify(['budget-summary']),
      );
    });
  });

  it('includes previously hidden cards in the JSON array when dismissing an additional card', async () => {
    // Pre-seed: invoice-pipeline is already hidden
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['invoice-pipeline']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByRole('button', { name: 'Hide Budget Summary card' })[0]);

    await waitFor(() => {
      expect(mockUpsertPreference).toHaveBeenCalledWith(
        'dashboard.hiddenCards',
        expect.stringContaining('budget-summary'),
      );
      expect(mockUpsertPreference).toHaveBeenCalledWith(
        'dashboard.hiddenCards',
        expect.stringContaining('invoice-pipeline'),
      );
    });
  });

  // ─── Test 18: Hidden card is not rendered ────────────────────────────────

  it('does not render a card whose id is in the hidden cards preference', () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['mini-gantt']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    expect(screen.queryByRole('heading', { name: 'Mini Gantt' })).not.toBeInTheDocument();
    // Sibling card still visible
    expect(screen.getAllByRole('heading', { name: 'Upcoming Milestones' })[0]).toBeInTheDocument();
  });

  // ─── Test 19: Customize button appears when cards are hidden ─────────────

  it('shows Customize button when at least one card is hidden', () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['quick-actions']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    expect(screen.getByRole('button', { name: 'Customize' })).toBeInTheDocument();
  });

  it('does not show Customize button when no cards are hidden', () => {
    mockUsePreferences.mockReturnValue(buildPreferencesMock([]));

    renderPage();

    expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
  });

  // ─── Test 20: Customize dropdown shows hidden card labels ────────────────

  it('opens customize dropdown listing hidden card labels when Customize is clicked', async () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['source-utilization', 'quick-actions']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));

    expect(screen.getByRole('menuitem', { name: 'Show Source Utilization' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show Quick Actions' })).toBeInTheDocument();
  });

  it('customize dropdown is not visible before Customize is clicked', () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['source-utilization']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // ─── Test 21: Re-enable card removes it from hidden set ──────────────────

  it('clicking a re-enable menuitem calls upsert with the card removed from hidden ids', async () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['source-utilization', 'quick-actions']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show Source Utilization' }));

    await waitFor(() => {
      expect(mockUpsertPreference).toHaveBeenCalledTimes(1);
      // source-utilization must NOT appear in the serialized value
      expect(mockUpsertPreference).not.toHaveBeenCalledWith(
        'dashboard.hiddenCards',
        expect.stringContaining('source-utilization'),
      );
      // quick-actions must still be present in the serialized value
      expect(mockUpsertPreference).toHaveBeenCalledWith(
        'dashboard.hiddenCards',
        expect.stringContaining('quick-actions'),
      );
    });
  });

  it('closes the customize dropdown after clicking a re-enable menuitem', async () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['source-utilization']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Show Source Utilization' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  // ─── Story #478: Responsive, Dark Mode & Accessibility ──────────────────

  // Test 23: ARIA region landmark on grid
  it('renders an element with role="region" and aria-label="Dashboard overview" for the desktop grid', async () => {
    renderPage();

    // Wait for data to settle so the grid is fully rendered
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    // Both the desktop grid and mobile sections have role="region" + aria-label="Dashboard overview"
    const regions = screen.getAllByRole('region', { name: 'Dashboard overview' });
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  // Test 24: ARIA live region on grid
  it('desktop grid region has aria-live="polite"', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    // The desktop grid element is the first element with role="region" and aria-live on it
    const liveRegion = container.querySelector('[aria-live="polite"][role="region"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-label', 'Dashboard overview');
  });

  // Test 25: Mobile sections render exactly 2 details elements
  it('mobile sections contain exactly 2 <details> elements (Timeline and Budget Details)', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    const detailsEls = container.querySelectorAll('details');
    expect(detailsEls).toHaveLength(2);
  });

  // Test 26: Timeline summary with loaded data containing 3 work items
  it('timeline <details> summary shows "3 work items scheduled" when timeline has 3 work items', async () => {
    const timelineWith3Items: TimelineResponse = {
      ...emptyTimelineResponse,
      workItems: [
        {
          id: 'wi-1',
          title: 'Item 1',
          status: 'not_started',
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          actualStartDate: null,
          actualEndDate: null,
          durationDays: 9,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: null,
          area: null,
          requiredMilestoneIds: [],
        },
        {
          id: 'wi-2',
          title: 'Item 2',
          status: 'in_progress',
          startDate: '2026-04-11',
          endDate: '2026-04-20',
          actualStartDate: null,
          actualEndDate: null,
          durationDays: 9,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: null,
          area: null,
          requiredMilestoneIds: [],
        },
        {
          id: 'wi-3',
          title: 'Item 3',
          status: 'completed',
          startDate: '2026-04-21',
          endDate: '2026-04-30',
          actualStartDate: null,
          actualEndDate: null,
          durationDays: 9,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: null,
          area: null,
          requiredMilestoneIds: [],
        },
      ],
    };
    mockGetTimeline.mockResolvedValue(timelineWith3Items);

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    // The Timeline <details> summary should contain the count text
    const detailsEls = container.querySelectorAll('details');
    const timelineDetails = detailsEls[0]; // Timeline is first
    expect(timelineDetails?.textContent).toContain('3 work items scheduled');
  });

  // Test 27: Timeline summary with empty data
  it('timeline <details> summary shows "No items scheduled" when timeline has no work items', async () => {
    mockGetTimeline.mockResolvedValue(emptyTimelineResponse);

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    const detailsEls = container.querySelectorAll('details');
    const timelineDetails = detailsEls[0];
    expect(timelineDetails?.textContent).toContain('No items scheduled');
  });

  // Test 28: Budget Details summary with 2 sources
  it('budget details <details> summary shows "2 sources configured" when 2 budget sources are returned', async () => {
    const twoSources = [
      {
        id: 'bs-1',
        name: 'Construction Loan',
        sourceType: 'bank_loan' as const,
        totalAmount: 200000,
        usedAmount: 100000,
        availableAmount: 100000,
        claimedAmount: 50000,
        unclaimedAmount: 50000,
        actualAvailableAmount: 150000,
        paidAmount: 100000,
        projectedAmount: 120000,
        isDiscretionary: false,
        interestRate: 3.5,
        terms: null,
        notes: null,
        status: 'active' as const,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'bs-2',
        name: 'Savings',
        sourceType: 'savings' as const,
        totalAmount: 50000,
        usedAmount: 10000,
        availableAmount: 40000,
        claimedAmount: 0,
        unclaimedAmount: 0,
        actualAvailableAmount: 50000,
        paidAmount: 0,
        projectedAmount: 0,
        isDiscretionary: false,
        interestRate: null,
        terms: null,
        notes: null,
        status: 'active' as const,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: twoSources });

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    const detailsEls = container.querySelectorAll('details');
    // Budget Details is the second <details> element
    const budgetDetails = detailsEls[1];
    expect(budgetDetails?.textContent).toContain('2 sources configured');
  });

  // Test 29: Budget Details summary with empty sources
  it('budget details <details> summary shows "No sources configured" when sources are empty', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    });

    const detailsEls = container.querySelectorAll('details');
    const budgetDetails = detailsEls[1];
    expect(budgetDetails?.textContent).toContain('No sources configured');
  });

  // ─── Story #1014 / Issue #1050: "Add" dropdown ──────────────────────────

  describe('"Add" dropdown', () => {
    /** Renders the page with a LocationDisplay helper to assert navigation. */
    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    }

    function renderWithLocation() {
      return render(
        <MemoryRouter initialEntries={['/']}>
          <DashboardPage />
          <LocationDisplay />
        </MemoryRouter>,
      );
    }

    it('"Add" button is present with text "Add"', () => {
      renderPage();

      const addBtn = screen.getByTestId('dashboard-add-button');
      expect(addBtn).toBeInTheDocument();
      expect(addBtn).toHaveTextContent('Add');
    });

    it('dropdown is closed by default — no add menu in document', () => {
      renderPage();

      // The customize dropdown may also render a role="menu" when Customize is clicked,
      // but by default neither is open. We verify the add dropdown is absent specifically.
      expect(screen.queryByTestId('dashboard-add-work-item')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-add-household-item')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-add-milestone')).not.toBeInTheDocument();
    });

    it('clicking "Add" opens the dropdown with 3 menu items', async () => {
      renderPage();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-add-work-item')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-add-household-item')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-add-milestone')).toBeInTheDocument();
    });

    it('clicking outside the dropdown closes it', async () => {
      renderPage();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));
      expect(screen.getByTestId('dashboard-add-work-item')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByTestId('dashboard-add-work-item')).not.toBeInTheDocument();
    });

    it('pressing Escape closes the dropdown', async () => {
      renderPage();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));
      expect(screen.getByTestId('dashboard-add-work-item')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('dashboard-add-work-item')).not.toBeInTheDocument();
    });

    it('"Add Work Item" menu item navigates to /project/work-items/new', async () => {
      renderWithLocation();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));
      await userEvent.click(screen.getByTestId('dashboard-add-work-item'));

      expect(screen.getByTestId('location')).toHaveTextContent('/project/work-items/new');
    });

    it('"Add Household Item" menu item navigates to /project/household-items/new', async () => {
      renderWithLocation();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));
      await userEvent.click(screen.getByTestId('dashboard-add-household-item'));

      expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/new');
    });

    it('"Add Milestone" menu item navigates to /project/milestones/new', async () => {
      renderWithLocation();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));
      await userEvent.click(screen.getByTestId('dashboard-add-milestone'));

      expect(screen.getByTestId('location')).toHaveTextContent('/project/milestones/new');
    });

    it('"Add" button has aria-haspopup="menu"', () => {
      renderPage();

      expect(screen.getByTestId('dashboard-add-button')).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('"Add" button has aria-expanded="false" when closed', () => {
      renderPage();

      expect(screen.getByTestId('dashboard-add-button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('"Add" button has aria-expanded="true" when open', async () => {
      renderPage();

      await userEvent.click(screen.getByTestId('dashboard-add-button'));

      expect(screen.getByTestId('dashboard-add-button')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // ─── Test 22: Malformed JSON in preferences does not crash ───────────────

  it('handles malformed JSON in dashboard.hiddenCards preference gracefully', () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: 'not-valid-json',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    // Must not throw — all cards visible, no Customize button
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Project' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    // All 10 cards still visible
    expect(screen.getAllByRole('heading', { name: 'Budget Summary' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Quick Actions' })[0]).toBeInTheDocument();
  });
});
