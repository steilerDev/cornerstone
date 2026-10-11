/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enSchedule from '../../i18n/en/schedule.json';
import type React from 'react';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type { MilestoneDetail, WorkItemSummary, HouseholdItemSummary } from '@cornerstone/shared';
import type * as MilestoneDetailPageTypes from './MilestoneDetailPage.js';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockGetMilestone = jest.fn<typeof MilestonesApiTypes.getMilestone>();
const mockUpdateMilestone = jest.fn<typeof MilestonesApiTypes.updateMilestone>();
const mockDeleteMilestone = jest.fn<typeof MilestonesApiTypes.deleteMilestone>();
const mockLinkWorkItem = jest.fn<typeof MilestonesApiTypes.linkWorkItem>();
const mockUnlinkWorkItem = jest.fn<typeof MilestonesApiTypes.unlinkWorkItem>();
const mockAddDependentWorkItem = jest.fn<typeof MilestonesApiTypes.addDependentWorkItem>();
const mockRemoveDependentWorkItem = jest.fn<typeof MilestonesApiTypes.removeDependentWorkItem>();
const mockFetchMilestoneLinkedHouseholdItems =
  jest.fn<typeof MilestonesApiTypes.fetchMilestoneLinkedHouseholdItems>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
const mockCreateHouseholdItemDep = jest.fn();
const mockDeleteHouseholdItemDep = jest.fn();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  getMilestone: mockGetMilestone,
  updateMilestone: mockUpdateMilestone,
  deleteMilestone: mockDeleteMilestone,
  linkWorkItem: mockLinkWorkItem,
  unlinkWorkItem: mockUnlinkWorkItem,
  addDependentWorkItem: mockAddDependentWorkItem,
  removeDependentWorkItem: mockRemoveDependentWorkItem,
  fetchMilestoneLinkedHouseholdItems: mockFetchMilestoneLinkedHouseholdItems,
  listMilestones: jest.fn(),
  createMilestone: jest.fn(),
}));

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  getWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
  deleteWorkItem: jest.fn(),
  fetchWorkItemSubsidies: jest.fn(),
  linkWorkItemSubsidy: jest.fn(),
  unlinkWorkItemSubsidy: jest.fn(),
  fetchWorkItemSubsidyPayback: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  getHouseholdItem: jest.fn(),
  createHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
  deleteHouseholdItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemDepsApi.js', () => ({
  createHouseholdItemDep: mockCreateHouseholdItemDep,
  deleteHouseholdItemDep: mockDeleteHouseholdItemDep,
  fetchHouseholdItemDeps: jest.fn(),
}));

// ── Toast + delete-impact mocks (#2209): the status hook toasts, the delete dialog loads counts ──
const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();

jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

/** The delete action is aria-disabled until the "also affects" counts have loaded. */
async function enabledConfirm(): Promise<HTMLElement> {
  const btn = await screen.findByTestId('milestone-delete-confirm');
  await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
  return btn;
}

// ── LocaleContext mock — AreaBreadcrumb renders Tooltip which calls useLocale() ──
// Added for Issue #1239: MilestoneDetailPage now renders AreaBreadcrumb on linked WI rows.

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en',
    resolvedLocale: 'en',
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LocaleProvider: ({ children }: { children: any }) => children,
}));

// ── Formatters mock ───────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
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
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(n);
  return {
    formatDate: fmtDate,
    formatCurrency: fmtCurrency,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatDate: fmtDate,
      formatCurrency: fmtCurrency,
      formatTime: () => '—',
      formatDateTime: () => '—',
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
      formatDayMonth: (d: string | null | undefined) => d ?? '',
    }),
  };
});

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-type">{type}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleWorkItemSummary: WorkItemSummary = {
  id: 'wi-100',
  title: 'Pour Foundation',
  status: 'in_progress',
  startDate: '2026-02-01',
  endDate: '2026-03-10',
  projectedStartDate: '2026-02-01',
  projectedEndDate: '2026-03-10',
  isLate: false,
  lateDays: null,
  isHeldUp: false,
  durationDays: 37,
  actualStartDate: null,
  actualEndDate: null,
  assignedUser: null,
  assignedVendor: null,
  area: null,
  budgetLineCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleMilestoneDetail: MilestoneDetail = {
  id: 1,
  title: 'Foundation Complete',
  description: 'All foundation work done.',
  targetDate: '2026-03-15',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItems: [sampleWorkItemSummary],
  dependentWorkItems: [],
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const emptyMilestoneDetail: MilestoneDetail = {
  ...sampleMilestoneDetail,
  workItems: [],
  dependentWorkItems: [],
};

function makeDefaultListResponses() {
  mockListWorkItems.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
  });
  mockListHouseholdItems.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
  });
  mockFetchMilestoneLinkedHouseholdItems.mockResolvedValue([]);
}

describe('MilestoneDetailPage', () => {
  let MilestoneDetailPageModule: typeof MilestoneDetailPageTypes;

  beforeEach(async () => {
    mockGetMilestone.mockReset();
    mockUpdateMilestone.mockReset();
    mockDeleteMilestone.mockReset();
    mockShowToast.mockReset();
    mockShowUndoToast.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'milestone', id: '1', effects: [] });
    mockLinkWorkItem.mockReset();
    mockUnlinkWorkItem.mockReset();
    mockAddDependentWorkItem.mockReset();
    mockRemoveDependentWorkItem.mockReset();
    mockFetchMilestoneLinkedHouseholdItems.mockReset();
    mockListWorkItems.mockReset();
    mockListHouseholdItems.mockReset();
    mockCreateHouseholdItemDep.mockReset();
    mockDeleteHouseholdItemDep.mockReset();

    if (!MilestoneDetailPageModule) {
      MilestoneDetailPageModule = await import('./MilestoneDetailPage.js');
    }
  });

  function renderPage(
    id: string = '1',
    entry: string | { pathname: string; state?: unknown } = `/project/milestones/${id}`,
  ) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/project/milestones/:id"
            element={<MilestoneDetailPageModule.MilestoneDetailPage />}
          />
          <Route path="/project/milestones" element={<div>Milestones List</div>} />
          <Route path="/schedule" element={<div>Schedule</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading text while fetching', () => {
      mockGetMilestone.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  // ─── 404 / invalid id ────────────────────────────────────────────────────────

  describe('not found state', () => {
    it('shows not found state for invalid (NaN) id', async () => {
      renderPage('not-a-number');

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.getByText(/not found/i)).toBeInTheDocument();
      // Not-found state has no tab row; only the "Back to Milestones" link is present.
      expect(screen.getByRole('link', { name: /back to milestones/i })).toBeInTheDocument();
    });

    it('shows not found state when API returns 404', async () => {
      mockGetMilestone.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Milestone not found' }),
      );

      renderPage('999');

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows not found state for non-404 ApiClientError (milestone stays null)', async () => {
      // When getMilestone rejects with a non-404 error, the component sets error state
      // but milestone stays null. The `if (is404 || !milestone)` guard triggers,
      // rendering the notFound template (no role="alert" in that template).
      mockGetMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Database error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // The notFound template renders since milestone is null
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });

    it('shows not found state for non-ApiClientError (milestone stays null)', async () => {
      // Same: any fetch failure leaves milestone=null → notFound template
      mockGetMilestone.mockRejectedValueOnce(new Error('Network timeout'));

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // The notFound template renders since milestone is null
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  // ─── View mode ───────────────────────────────────────────────────────────

  describe('view mode', () => {
    beforeEach(() => {
      makeDefaultListResponses();
    });

    it('renders milestone title in heading', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Foundation Complete');
      });
    });

    it('renders milestone description when present', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('All foundation work done.')).toBeInTheDocument();
      });
    });

    it('renders linked work item title', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Pour Foundation')).toBeInTheDocument();
      });
    });

    it('shows "no items linked" message when no work items or HI linked', async () => {
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Foundation Complete');
      });
      // No linked items message should appear
    });

    it('shows edit button', async () => {
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });
    });

    it('shows delete button', async () => {
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });
    });

    it('renders unlink button for each linked work item', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByTestId(`unlink-work-item-${sampleWorkItemSummary.id}`),
        ).toBeInTheDocument();
      });
    });

    it('renders projected date when work items have end dates', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await waitFor(() => {
        // projected date section visible
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Foundation Complete');
      });
    });

    it('computes the projected date from the forecast end of a late contributor, not its planned end', async () => {
      mockGetMilestone.mockResolvedValueOnce({
        ...sampleMilestoneDetail,
        targetDate: '2026-03-10',
        workItems: [
          {
            ...sampleWorkItemSummary,
            status: 'not_started',
            startDate: '2026-03-05',
            endDate: '2026-03-08',
            projectedStartDate: '2026-03-10',
            projectedEndDate: '2026-03-13',
            isLate: true,
            lateDays: 5,
          },
        ],
      });

      renderPage();

      await screen.findByText('Mar 13, 2026');
      expect(screen.getByText(/3\s+days\s+late/)).toBeInTheDocument();
      expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
    });

    it('falls back to the planned end when a contributor has no forecast end', async () => {
      mockGetMilestone.mockResolvedValueOnce({
        ...sampleMilestoneDetail,
        targetDate: '2026-03-10',
        workItems: [
          {
            ...sampleWorkItemSummary,
            endDate: '2026-03-08',
            projectedEndDate: null,
          },
        ],
      });

      renderPage();

      await screen.findByText('Mar 8, 2026');
      expect(screen.getByText(/2\s+days\s+ahead/)).toBeInTheDocument();
    });

    it('renders "back to milestones" button', async () => {
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });
    });
  });

  // ─── Edit mode ───────────────────────────────────────────────────────────

  describe('edit mode', () => {
    beforeEach(() => {
      makeDefaultListResponses();
    });

    it('switches to edit form when Edit button is clicked', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));

      expect(screen.getByTestId('milestone-title-input')).toBeInTheDocument();
      expect(screen.getByTestId('milestone-target-date-input')).toBeInTheDocument();
      expect(screen.getByTestId('save-milestone-button')).toBeInTheDocument();
    });

    it('pre-fills form with existing milestone data', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));

      expect(screen.getByTestId('milestone-title-input')).toHaveValue('Foundation Complete');
      expect(screen.getByTestId('milestone-target-date-input')).toHaveValue('2026-03-15');
    });

    it('calls updateMilestone on save', async () => {
      const user = userEvent.setup();
      mockGetMilestone
        .mockResolvedValueOnce(emptyMilestoneDetail)
        .mockResolvedValueOnce(emptyMilestoneDetail);
      mockUpdateMilestone.mockResolvedValueOnce({
        id: 1,
        title: 'Foundation Complete Updated',
        description: null,
        targetDate: '2026-03-15',
        isCompleted: false,
        completedAt: null,
        color: null,
        workItemCount: 0,
        dependentWorkItemCount: 0,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));
      await user.click(screen.getByTestId('save-milestone-button'));

      await waitFor(() => {
        expect(mockUpdateMilestone).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            title: 'Foundation Complete',
            targetDate: '2026-03-15',
          }),
        );
      });
    });

    it('shows error banner when update fails', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockUpdateMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));
      await user.click(screen.getByTestId('save-milestone-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
        expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      });
    });

    it('shows validation error when title is cleared before saving', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));
      await user.clear(screen.getByTestId('milestone-title-input'));
      // Use fireEvent.submit to bypass native HTML required validation so the
      // JS handler runs and calls setError() with the validation message
      fireEvent.submit(screen.getByTestId('save-milestone-button').closest('form')!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockUpdateMilestone).not.toHaveBeenCalled();
    });

    it('returns to view mode when Cancel is clicked', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));
      expect(screen.getByTestId('milestone-title-input')).toBeInTheDocument();

      // Click cancel
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelBtn);

      expect(screen.queryByTestId('milestone-title-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
    });
  });

  // ─── Delete flow ──────────────────────────────────────────────────────────

  describe('delete flow', () => {
    beforeEach(() => {
      makeDefaultListResponses();
    });

    it('shows delete confirmation modal when delete button clicked', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('delete-milestone-button'));

      expect(
        screen.getByRole('alertdialog', { name: 'Delete Foundation Complete?' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('milestone-delete-cancel')).toHaveFocus();
    });

    it('lists what the delete also removes and asks the endpoint for this milestone', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'milestone',
        id: '1',
        effects: [
          { kind: 'milestoneLinks', count: 2 },
          { kind: 'milestoneWaits', count: 0 },
        ],
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('delete-milestone-button'));

      await waitFor(() =>
        expect(screen.getByTestId('milestone-delete-consequences')).toHaveTextContent(
          'Milestones it no longer counts toward: 2',
        ),
      );
      expect(screen.queryByText(/no longer waits for/)).toBeNull();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('milestone', 1);
    });

    it('a 409 hides the action and keeps Cancel', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockDeleteMilestone.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('delete-milestone-button'));
      await user.click(await enabledConfirm());
      await waitFor(() => expect(screen.queryByTestId('milestone-delete-confirm')).toBeNull());
      expect(screen.getByTestId('milestone-delete-cancel')).toBeInTheDocument();
    });

    it('navigates to milestones list after successful delete', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockDeleteMilestone.mockResolvedValueOnce(undefined);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('delete-milestone-button'));
      await user.click(await enabledConfirm());

      await waitFor(() => {
        expect(mockDeleteMilestone).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/milestones');
      });
      expect(screen.getByTestId('location-type')).toHaveTextContent('REPLACE');
    });

    it('shows error banner when delete fails', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockDeleteMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('delete-milestone-button'));
      await user.click(await enabledConfirm());

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
        expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      });
    });
  });

  // ─── Item search / link ──────────────────────────────────────────────────

  describe('item search input', () => {
    beforeEach(() => {
      makeDefaultListResponses();
    });

    it('renders item search input', async () => {
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('item-search-input')).toBeInTheDocument();
      });
    });

    it('renders dep search input', async () => {
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('dep-search-input')).toBeInTheDocument();
      });
    });
  });

  // ─── Completed milestone ──────────────────────────────────────────────────

  describe('status menu (#2209)', () => {
    const TOKEN = { token: `u_${'e'.repeat(32)}`, expiresAt: '2026-08-07T10:00:30.000Z' };
    let realFetch: typeof globalThis.fetch;
    let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

    function respond(body: unknown) {
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body } as Response);
    }
    const writes = () =>
      mockFetch.mock.calls.filter(
        ([, init]) => init?.method === 'PATCH' || init?.method === 'POST',
      );
    const lastWrite = () => {
      const [url, init] = writes()[writes().length - 1]!;
      return { url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null };
    };

    beforeEach(() => {
      makeDefaultListResponses();
      realFetch = globalThis.fetch;
      mockFetch = jest.fn<typeof globalThis.fetch>();
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    async function loaded(detail: MilestoneDetail = emptyMilestoneDetail) {
      mockGetMilestone.mockResolvedValue(detail);
      renderPage();
      await screen.findByRole('heading', { level: 1, name: detail.title });
    }

    it('replaces the completion checkbox with a status menu', async () => {
      await loaded();
      expect(screen.getByTestId('milestone-status')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('offers only "Mark reached" for an upcoming milestone and asks when it was reached', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-status'));
      expect(screen.getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Mark reached›']);
      fireEvent.click(screen.getByTestId('milestone-status-option-reached'));
      expect(screen.getByRole('dialog', { name: 'When was it reached?' })).toBeInTheDocument();
      // The target date lies in the past, so the "On target" chip is offered.
      expect(screen.getByTestId('milestone-status-date-planned')).toHaveTextContent('On target');
    });

    it('"On target" sends the target date as the completion date and offers Undo', async () => {
      respond({ ...emptyMilestoneDetail, isCompleted: true, undo: TOKEN });
      await loaded();

      fireEvent.click(screen.getByTestId('milestone-status'));
      fireEvent.click(screen.getByTestId('milestone-status-option-reached'));
      fireEvent.click(screen.getByTestId('milestone-status-date-planned'));

      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(lastWrite()).toEqual({
        url: '/api/milestones/1',
        method: 'PATCH',
        body: { isCompleted: true, completedAt: '2026-03-15' },
      });
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalledTimes(1));
      expect(mockShowUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Foundation Complete is now “Reached”.',
          dedupeKey: 'milestone:1',
        }),
      );
    });

    it('"Today" sends today as the completion date', async () => {
      respond({ ...emptyMilestoneDetail, isCompleted: true });
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-status'));
      fireEvent.click(screen.getByTestId('milestone-status-option-reached'));
      fireEvent.click(screen.getByTestId('milestone-status-date-today'));
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(lastWrite().body).toEqual({
        isCompleted: true,
        completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(mockShowUndoToast).not.toHaveBeenCalled();
    });

    it('a reached milestone offers the way back to "Upcoming" and sends isCompleted false', async () => {
      respond({ ...emptyMilestoneDetail, isCompleted: false, undo: TOKEN });
      await loaded({
        ...emptyMilestoneDetail,
        isCompleted: true,
        completedAt: '2026-03-10T12:00:00.000Z',
      });

      fireEvent.click(screen.getByTestId('milestone-status'));
      expect(screen.getAllByRole('menuitem').map((r) => r.textContent)).toEqual([
        'Back to “Upcoming”',
      ]);
      fireEvent.click(screen.getByTestId('milestone-status-option-not_reached'));

      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(lastWrite().body).toEqual({ isCompleted: false });
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
      expect(mockShowUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Foundation Complete is now “Upcoming”.' }),
      );
    });

    it('Undo posts the token and reloads the milestone', async () => {
      respond({ ...emptyMilestoneDetail, isCompleted: true, undo: TOKEN });
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-status'));
      fireEvent.click(screen.getByTestId('milestone-status-option-reached'));
      fireEvent.click(screen.getByTestId('milestone-status-date-today'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());

      const loadsBefore = mockGetMilestone.mock.calls.length;
      respond({ restored: [], retractedEventIds: [] });
      const options = mockShowUndoToast.mock.calls[0]![0] as { onUndo: () => Promise<void> };
      await act(async () => {
        await options.onUndo();
      });
      expect(lastWrite().url).toBe(`/api/undo/${TOKEN.token}`);
      expect(mockGetMilestone.mock.calls.length).toBeGreaterThan(loadsBefore);
    });

    it('a failed change toasts the generic copy and shows no Undo', async () => {
      mockFetch.mockRejectedValue(new Error('RAW-LOCAL'));
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-status'));
      fireEvent.click(screen.getByTestId('milestone-status-option-reached'));
      fireEvent.click(screen.getByTestId('milestone-status-date-today'));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('error', 'The status could not be changed.'),
      );
      expect(mockShowUndoToast).not.toHaveBeenCalled();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });
  });

  describe('completed milestone', () => {
    beforeEach(() => {
      makeDefaultListResponses();
    });

    it('shows completed status badge for a completed milestone', async () => {
      const completedMilestone: MilestoneDetail = {
        ...emptyMilestoneDetail,
        isCompleted: true,
        completedAt: '2026-03-10T12:00:00.000Z',
      };
      mockGetMilestone.mockResolvedValueOnce(completedMilestone);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Foundation Complete');
      });
      // Status badge should show "completed" — multiple elements may match /completed/i
      // (status badge + completedAt label), so use getAllByText and assert at least one exists
      expect(screen.getAllByText(/completed/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Reached').length).toBeGreaterThan(0);
      expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
    });
  });

  // ─── Issue #1239 — AreaBreadcrumb on linked work item rows ──────────────────

  describe('area breadcrumb on linked work item rows (Issue #1239)', () => {
    beforeEach(() => {
      makeDefaultListResponses();
    });

    it('shows area breadcrumb for linked WI with ancestors', async () => {
      const wiWithArea: WorkItemSummary = {
        ...sampleWorkItemSummary,
        area: {
          id: 'area-3',
          name: 'Living Room',
          color: null,
          ancestors: [{ id: 'area-1', name: 'Ground Floor', color: null }],
        },
      };
      mockGetMilestone.mockResolvedValueOnce({
        ...sampleMilestoneDetail,
        workItems: [wiWithArea],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Pour Foundation')).toBeInTheDocument();
      });

      // AreaBreadcrumb compact variant renders ancestors joined with ›; Tooltip duplicates text
      expect(screen.getAllByText('Ground Floor › Living Room').length).toBeGreaterThan(0);
    });

    it('shows "No area" muted text for linked WI with null area', async () => {
      const wiNoArea: WorkItemSummary = {
        ...sampleWorkItemSummary,
        area: null,
      };
      mockGetMilestone.mockResolvedValueOnce({
        ...sampleMilestoneDetail,
        workItems: [wiNoArea],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Pour Foundation')).toBeInTheDocument();
      });

      expect(screen.getByText('No area')).toBeInTheDocument();
    });

    it('shows area breadcrumb in item search dropdown when work item has ancestors', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      // Return a work item with area in the list
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            ...sampleWorkItemSummary,
            id: 'wi-search-area',
            title: 'Roofing',
            area: {
              id: 'area-roof',
              name: 'Roof',
              color: null,
              ancestors: [{ id: 'area-ext', name: 'Exterior', color: null }],
            },
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('item-search-input')).toBeInTheDocument();
      });

      // Type into the inline search to open dropdown
      const searchInput = screen.getByTestId('item-search-input');
      await user.type(searchInput, 'Roof');

      // Dropdown should show the item with its breadcrumb
      await waitFor(() => {
        expect(screen.getByText('Roofing')).toBeInTheDocument();
      });

      // Tooltip duplicates the text node; use getAllByText
      expect(screen.getAllByText('Exterior › Roof').length).toBeGreaterThan(0);
    });

    it('shows "No area" in item search dropdown for work item with null area', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            ...sampleWorkItemSummary,
            id: 'wi-search-no-area',
            title: 'Plumbing',
            area: null,
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('item-search-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('item-search-input');
      await user.type(searchInput, 'Plumb');

      await waitFor(() => {
        expect(screen.getByText('Plumbing')).toBeInTheDocument();
      });

      expect(screen.getByText('No area')).toBeInTheDocument();
    });
  });

  // ─── #2131: household-item quick-link and dependent-work-item errors ────────

  describe('translated link errors (#2129, #2131)', () => {
    const householdItem: HouseholdItemSummary = {
      id: 'hi-1',
      name: 'Kitchen Island',
      description: null,
      category: 'hic-furniture',
      status: 'planned',
      vendor: null,
      area: null,
      quantity: 1,
      orderDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      targetDeliveryDate: null,
      isLate: false,
      url: null,
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    async function quickLinkHouseholdItem(rejection: unknown) {
      const user = userEvent.setup();
      makeDefaultListResponses();
      mockListHouseholdItems.mockResolvedValue({
        items: [householdItem],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockCreateHouseholdItemDep.mockRejectedValue(rejection as never);
      renderPage();
      const input = await screen.findByTestId('item-search-input');
      await user.type(input, 'Kitchen');
      await user.click(await screen.findByRole('button', { name: /Kitchen Island/ }));
    }

    it('household item quick-link 409 CIRCULAR_DEPENDENCY shows the circular copy', async () => {
      await quickLinkHouseholdItem(
        new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'RAW-SERVER-SENTINEL' }),
      );
      expect(await screen.findByText(enErrors.CIRCULAR_DEPENDENCY)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('household item quick-link 409 DUPLICATE_DEPENDENCY shows the duplicate copy', async () => {
      await quickLinkHouseholdItem(
        new ApiClientError(409, { code: 'DUPLICATE_DEPENDENCY', message: 'RAW-SERVER-SENTINEL' }),
      );
      expect(await screen.findByText(enErrors.DUPLICATE_DEPENDENCY)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('household item quick-link plain Error shows the fallback copy, not the local text', async () => {
      await quickLinkHouseholdItem(new Error('RAW-LOCAL'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    describe('work item link / dependent handlers', () => {
      const sentinelError = () =>
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' });

      async function expectAlertText(text: string) {
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(text);
        expect(alert).not.toHaveTextContent(/RAW-/);
      }

      beforeEach(() => {
        makeDefaultListResponses();
        mockListWorkItems.mockResolvedValue({
          items: [{ ...sampleWorkItemSummary, id: 'wi-200', title: 'Install Windows' }],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        });
      });

      it('quick-link work item: ApiClientError shows the code copy, plain Error the failedLink copy', async () => {
        const user = userEvent.setup();
        mockGetMilestone.mockResolvedValue(emptyMilestoneDetail);
        mockLinkWorkItem.mockRejectedValueOnce(sentinelError());
        mockLinkWorkItem.mockRejectedValueOnce(new Error('RAW-LOCAL'));
        renderPage();
        const input = await screen.findByTestId('item-search-input');
        await user.type(input, 'Install');
        await user.click(await screen.findByRole('button', { name: /Install Windows/ }));
        await expectAlertText(enErrors.INTERNAL_ERROR);
        await user.click(await screen.findByRole('button', { name: /Install Windows/ }));
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent(
            enSchedule.milestones.detail.failedLink,
          );
        });
      });

      it('unlink work item: ApiClientError shows the code copy, plain Error the failedUnlink copy', async () => {
        mockGetMilestone.mockResolvedValue(sampleMilestoneDetail);
        mockUnlinkWorkItem.mockRejectedValueOnce(sentinelError());
        mockUnlinkWorkItem.mockRejectedValueOnce(new Error('RAW-LOCAL'));
        renderPage();
        fireEvent.click(await screen.findByTestId('unlink-work-item-wi-100'));
        await expectAlertText(enErrors.INTERNAL_ERROR);
        fireEvent.click(screen.getByTestId('unlink-work-item-wi-100'));
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent(
            enSchedule.milestones.detail.failedUnlink,
          );
        });
      });

      it('unlink household item: ApiClientError shows the code copy, plain Error the failedUnlink copy', async () => {
        mockGetMilestone.mockResolvedValue(emptyMilestoneDetail);
        mockFetchMilestoneLinkedHouseholdItems.mockResolvedValue([
          { id: 'hi-9', name: 'Sofa', category: 'hic-furniture', status: 'planned' } as never,
        ]);
        mockDeleteHouseholdItemDep.mockRejectedValueOnce(sentinelError() as never);
        mockDeleteHouseholdItemDep.mockRejectedValueOnce(new Error('RAW-LOCAL') as never);
        renderPage();
        fireEvent.click(await screen.findByTestId('unlink-household-item-hi-9'));
        await expectAlertText(enErrors.INTERNAL_ERROR);
        fireEvent.click(screen.getByTestId('unlink-household-item-hi-9'));
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent(
            enSchedule.milestones.detail.failedUnlink,
          );
        });
      });

      it('add dependent work item: ApiClientError shows the code copy, plain Error the failedAddDependent copy', async () => {
        const user = userEvent.setup();
        mockGetMilestone.mockResolvedValue(emptyMilestoneDetail);
        mockAddDependentWorkItem.mockRejectedValueOnce(sentinelError());
        mockAddDependentWorkItem.mockRejectedValueOnce(new Error('RAW-LOCAL'));
        renderPage();
        const input = await screen.findByTestId('dep-search-input');
        await user.type(input, 'Install');
        await user.click(await screen.findByRole('button', { name: /Install Windows/ }));
        await expectAlertText(enErrors.INTERNAL_ERROR);
        await user.click(await screen.findByRole('button', { name: /Install Windows/ }));
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent(
            enSchedule.milestones.detail.failedAddDependent,
          );
        });
      });

      it('remove dependent work item: ApiClientError shows the code copy, plain Error the failedRemoveDependent copy', async () => {
        mockGetMilestone.mockResolvedValue({
          ...emptyMilestoneDetail,
          dependentWorkItems: [sampleWorkItemSummary],
        });
        mockRemoveDependentWorkItem.mockRejectedValueOnce(sentinelError());
        mockRemoveDependentWorkItem.mockRejectedValueOnce(new Error('RAW-LOCAL'));
        renderPage();
        fireEvent.click(await screen.findByTestId('remove-dep-work-item-wi-100'));
        await expectAlertText(enErrors.INTERNAL_ERROR);
        fireEvent.click(screen.getByTestId('remove-dep-work-item-wi-100'));
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent(
            enSchedule.milestones.detail.failedRemoveDependent,
          );
        });
      });
    });
  });

  // ── Page identity (#2202) ──────────────────────────────────────────────────

  describe('page identity (#2202)', () => {
    const h1s = () => screen.queryAllByRole('heading', { level: 1 });

    beforeEach(() => {
      makeDefaultListResponses();
      document.title = 'initial';
    });

    it('shows one h1 with the milestone title and sets the tab title under Tasks', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      expect(
        await screen.findByRole('heading', { name: 'Foundation Complete', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
      await waitFor(() =>
        expect(document.title).toBe('Foundation Complete \u00B7 Tasks \u00B7 Cornerstone'),
      );
    });

    it('falls back to "Untitled milestone" for a whitespace-only title', async () => {
      mockGetMilestone.mockResolvedValueOnce({ ...sampleMilestoneDetail, title: '   ' });

      renderPage();

      expect(
        await screen.findByRole('heading', { name: 'Untitled milestone', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
    });

    it('shows the typed h1 "Milestone" with the trail while loading', async () => {
      mockGetMilestone.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByRole('heading', { name: 'Milestone', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(
        within(nav)
          .getAllByRole('link')
          .map((a) => (a.textContent ?? '').replace('\u2039', '')),
      ).toEqual(['Tasks', 'Milestones']);
    });

    it('promotes the not-found text to the single h1 and keeps the trail', async () => {
      mockGetMilestone.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Milestone not found' }),
      );

      renderPage('999');

      expect(
        await screen.findByRole('heading', { name: 'Milestone not found', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
      expect(screen.getByRole('navigation', { name: 'You are here' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Back to Milestones' })).toHaveAttribute(
        'href',
        '/project/milestones',
      );
    });

    it('removes the old back, To Schedule and To Milestones buttons', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await screen.findByRole('heading', { name: 'Foundation Complete', level: 1 });
      expect(screen.queryByRole('button', { name: /to schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to milestones/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to milestones/i })).not.toBeInTheDocument();
    });

    it('offers Back to Calendar from the calendar, keeping the trail Tasks > Milestones', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage('1', {
        pathname: '/project/milestones/1',
        state: { origin: { to: '/schedule/calendar?calendarMode=week' } },
      });

      await screen.findByRole('heading', { name: 'Foundation Complete', level: 1 });
      expect(screen.getByRole('link', { name: /Back to Calendar/ })).toHaveAttribute(
        'href',
        '/schedule/calendar?calendarMode=week',
      );
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getAllByRole('link')).toHaveLength(2);
    });

    it('offers Back to a task by name when opened from that task', async () => {
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage('1', {
        pathname: '/project/milestones/1',
        state: { origin: { to: '/project/work-items/wi-9', name: 'Synthetic task' } },
      });

      await screen.findByRole('heading', { name: 'Foundation Complete', level: 1 });
      expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Synthetic task');
    });

    it('passes origin (with the milestone title) to a linked task link', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(sampleMilestoneDetail);

      renderPage();

      await user.click(await screen.findByRole('link', { name: 'Pour Foundation' }));

      expect(screen.getByTestId('location')).toHaveTextContent('/project/work-items/wi-100');
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        origin: { to: '/project/milestones/1', name: 'Foundation Complete' },
      });
    });
  });
});
