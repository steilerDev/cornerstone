/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type { MilestoneDetail, WorkItemSummary } from '@cornerstone/shared';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateHouseholdItemDep = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeleteHouseholdItemDep = jest.fn<any>();

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
    }),
  };
});

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleWorkItemSummary: WorkItemSummary = {
  id: 'wi-100',
  title: 'Pour Foundation',
  status: 'in_progress',
  startDate: '2026-02-01',
  endDate: '2026-03-10',
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

  function renderPage(id: string = '1') {
    return render(
      <MemoryRouter initialEntries={[`/project/milestones/${id}`]}>
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
      expect(screen.getByRole('link', { name: /back|milestones/i })).toBeInTheDocument();
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
    it('shows error banner for non-404 ApiClientError', async () => {
      mockGetMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Database error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Database error')).toBeInTheDocument();
    });

    it('shows generic error for non-ApiClientError', async () => {
      mockGetMilestone.mockRejectedValueOnce(new Error('Network timeout'));

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
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
        expect(screen.getByTestId(`unlink-work-item-${sampleWorkItemSummary.id}`)).toBeInTheDocument();
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
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Update failed' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('edit-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-milestone-button'));
      await user.click(screen.getByTestId('save-milestone-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Update failed')).toBeInTheDocument();
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
      await user.click(screen.getByTestId('save-milestone-button'));

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

      expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
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
      await user.click(screen.getByTestId('confirm-delete-milestone'));

      await waitFor(() => {
        expect(mockDeleteMilestone).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/milestones');
      });
    });

    it('shows error banner when delete fails', async () => {
      const user = userEvent.setup();
      mockGetMilestone.mockResolvedValueOnce(emptyMilestoneDetail);
      mockDeleteMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Delete failed' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('delete-milestone-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('delete-milestone-button'));
      await user.click(screen.getByTestId('confirm-delete-milestone'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
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
      // Status badge should show "completed"
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });
  });
});
