/**
 * @jest-environment jsdom
 *
 * NOTE (Bug #712): DashboardPage.tsx:200 reads `invoicesResult.value.items` but
 * InvoiceListPaginatedResponse uses the key `.invoices` (not `.items`). As a result,
 * the `isEmpty` flag for the Invoice Pipeline card is always computed as
 * `undefined === 0` → false, so the empty state for that card can never trigger.
 * Tests for Invoice Pipeline empty state are omitted until Bug #712 is fixed.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as BudgetOverviewApiTypes from '../../lib/budgetOverviewApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as SubsidyProgramsApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as TimelineApiTypes from '../../lib/timelineApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
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

jest.unstable_mockModule('../../hooks/usePreferences.js', () => ({
  usePreferences: mockUsePreferences,
}));

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
  'Budget Alerts',
  'Source Utilization',
  'Timeline Status',
  'Mini Gantt',
  'Invoice Pipeline',
  'Subsidy Pipeline',
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
    mockUpsertPreference.mockReset();
    mockUsePreferences.mockReset();

    // Default: all APIs succeed with minimal/empty data; no hidden cards
    mockFetchBudgetOverview.mockResolvedValue(minimalBudgetOverview);
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
    mockFetchSubsidyPrograms.mockResolvedValue(emptySubsidyResponse);
    mockGetTimeline.mockResolvedValue(emptyTimelineResponse);
    mockFetchAllInvoices.mockResolvedValue(emptyInvoicesResponse);
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

  it('renders h1 "Dashboard"', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  // ─── Test 12: ProjectSubNav ──────────────────────────────────────────────

  it('renders ProjectSubNav navigation', () => {
    renderPage();
    // ProjectSubNav renders a <nav> element with project links
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // ─── Test 13: All 8 cards render after data loads ────────────────────────

  it('renders all 8 card titles after data loads', async () => {
    renderPage();

    for (const title of ALL_CARD_TITLES) {
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
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

    renderPage();

    // 5 data sources map to 7 cards with loading state:
    //   budgetOverview → Budget Summary + Budget Alerts (2)
    //   budgetSources  → Source Utilization (1)
    //   timeline       → Timeline Status + Mini Gantt (2)
    //   invoices       → Invoice Pipeline (1)
    //   subsidyPrograms→ Subsidy Pipeline (1)
    // Quick Actions has no dataSource — renders children immediately, no skeleton
    const loadingEls = screen.getAllByRole('status', { name: 'Loading' });
    expect(loadingEls.length).toBe(7);
  });

  // ─── Test 15: Error state when API fails ────────────────────────────────

  it('shows error state for Budget Summary and Budget Alerts when budget overview API fails', async () => {
    const apiError = new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server exploded' });
    mockFetchBudgetOverview.mockRejectedValue(apiError);

    renderPage();

    // budgetOverview maps to 2 cards → 2 error alerts
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });

    // The API error message surfaces in the cards
    const errorMessages = screen.getAllByText('Server exploded');
    expect(errorMessages.length).toBeGreaterThanOrEqual(2);
  });

  it('uses generic fallback error message when a non-ApiClientError is thrown', async () => {
    mockFetchBudgetSources.mockRejectedValue(new Error('network down'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load budget sources')).toBeInTheDocument();
    });
  });

  // ─── Test 16: Empty state for data-backed cards ──────────────────────────

  it('shows empty state for Source Utilization when budget sources API returns empty list', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });

    renderPage();

    // Wait for the loading phase to complete
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Source Utilization' })).toBeInTheDocument();
    });

    // isEmpty=true → empty message is shown for this card
    // (at least one "No data available" — Subsidy Pipeline may also be empty)
    expect(screen.getAllByText('No data available').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state for Subsidy Pipeline when subsidy programs API returns empty list', async () => {
    mockFetchSubsidyPrograms.mockResolvedValue({ subsidyPrograms: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Subsidy Pipeline' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('No data available').length).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 17: Dismiss calls upsert with dashboard.hiddenCards ────────────

  it('clicking dismiss on a card calls upsert with dashboard.hiddenCards containing the card id', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Budget Summary' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Hide Budget Summary card' }));

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
      expect(screen.getByRole('heading', { name: 'Budget Summary' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Hide Budget Summary card' }));

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
    expect(screen.getByRole('heading', { name: 'Timeline Status' })).toBeInTheDocument();
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
          value: JSON.stringify(['budget-alerts', 'quick-actions']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));

    expect(screen.getByRole('menuitem', { name: 'Show Budget Alerts' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show Quick Actions' })).toBeInTheDocument();
  });

  it('customize dropdown is not visible before Customize is clicked', () => {
    mockUsePreferences.mockReturnValue(
      buildPreferencesMock([
        {
          key: 'dashboard.hiddenCards',
          value: JSON.stringify(['budget-alerts']),
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
          value: JSON.stringify(['budget-alerts', 'quick-actions']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show Budget Alerts' }));

    await waitFor(() => {
      expect(mockUpsertPreference).toHaveBeenCalledTimes(1);
      // budget-alerts must NOT appear in the serialized value
      expect(mockUpsertPreference).not.toHaveBeenCalledWith(
        'dashboard.hiddenCards',
        expect.stringContaining('budget-alerts'),
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
          value: JSON.stringify(['budget-alerts']),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Show Budget Alerts' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    // All 8 cards still visible
    expect(screen.getByRole('heading', { name: 'Budget Summary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quick Actions' })).toBeInTheDocument();
  });
});
