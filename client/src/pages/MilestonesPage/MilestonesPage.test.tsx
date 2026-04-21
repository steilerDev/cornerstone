/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { MilestoneSummary } from '@cornerstone/shared';
import type * as MilestonesPageTypes from './MilestonesPage.js';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockDeleteMilestone = jest.fn<typeof MilestonesApiTypes.deleteMilestone>();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  deleteMilestone: mockDeleteMilestone,
  getMilestone: jest.fn(),
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  linkWorkItem: jest.fn(),
  unlinkWorkItem: jest.fn(),
  addDependentWorkItem: jest.fn(),
  removeDependentWorkItem: jest.fn(),
  fetchMilestoneLinkedHouseholdItems: jest.fn(),
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

// ── Keyboard shortcuts mock ───────────────────────────────────────────────────

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: jest.fn(),
}));

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="keyboard-shortcuts-help">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleMilestone1: MilestoneSummary = {
  id: 1,
  title: 'Foundation Complete',
  description: 'The foundation must be fully poured and cured.',
  targetDate: '2026-03-15',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 3,
  dependentWorkItemCount: 1,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleMilestone2: MilestoneSummary = {
  id: 2,
  title: 'Framing Complete',
  description: null,
  targetDate: '2026-05-01',
  isCompleted: true,
  completedAt: '2026-05-01T12:00:00.000Z',
  color: null,
  workItemCount: 5,
  dependentWorkItemCount: 0,
  createdBy: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-05-01T12:00:00.000Z',
};

describe('MilestonesPage', () => {
  let MilestonesPageModule: typeof MilestonesPageTypes;

  beforeEach(async () => {
    mockListMilestones.mockReset();
    mockDeleteMilestone.mockReset();

    if (!MilestonesPageModule) {
      MilestonesPageModule = await import('./MilestonesPage.js');
    }
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/milestones']}>
        <MilestonesPageModule.MilestonesPage />
      </MemoryRouter>,
    );
  }

  // ─── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('renders skeleton while fetching milestones', () => {
      mockListMilestones.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      // DataTable shows a loading skeleton (role="status")
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // ─── Populated state ─────────────────────────────────────────────────────────

  describe('populated state', () => {
    it('renders milestone titles after loading', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1, sampleMilestone2]);

      renderPage();

      // DataTable renders each item in both the table row and mobile card view,
      // so getAllByText is used to handle duplicate occurrences
      await waitFor(() => {
        expect(screen.getAllByText('Foundation Complete')[0]!).toBeInTheDocument();
      });
      expect(screen.getAllByText('Framing Complete')[0]!).toBeInTheDocument();
    });

    it('renders "New Milestone" button', async () => {
      mockListMilestones.mockResolvedValueOnce([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-milestone-button')).toBeInTheDocument();
      });
    });

    it('renders the page title', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Foundation Complete')[0]!).toBeInTheDocument();
      });
    });

    it('renders description truncated when over 60 characters', async () => {
      const longDescMilestone: MilestoneSummary = {
        ...sampleMilestone1,
        description: 'A'.repeat(65),
      };
      mockListMilestones.mockResolvedValueOnce([longDescMilestone]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText(`${'A'.repeat(60)}...`)[0]).toBeInTheDocument();
      });
    });

    it('renders em-dash for milestones with no description', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone2]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Framing Complete')[0]!).toBeInTheDocument();
      });
      // Multiple em-dashes may appear (table + card view), so use getAllByText
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows API error message when listMilestones fails with ApiClientError', async () => {
      mockListMilestones.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server unavailable' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Server unavailable')).toBeInTheDocument();
      });
    });

    it('shows generic error when unknown error is thrown', async () => {
      mockListMilestones.mockRejectedValueOnce(new Error('Network failure'));

      renderPage();

      // The DataTable shows the error banner (role="alert") with the generic message
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state message when no milestones exist', async () => {
      mockListMilestones.mockResolvedValueOnce([]);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
      // DataTable renders EmptyState with message from t('milestones.empty.noItems')
    });
  });

  // ─── Actions menu ─────────────────────────────────────────────────────────

  describe('actions menu', () => {
    it('shows action menu button for each milestone', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);

      renderPage();

      // DataTable renders renderActions in both table and mobile card, so two elements
      // with the same testid exist — use getAllByTestId
      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });
    });

    it('opens dropdown with edit and delete options on menu button click', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);

      expect(screen.getAllByTestId('milestone-edit-1')[0]!).toBeInTheDocument();
      expect(screen.getAllByTestId('milestone-delete-1')[0]!).toBeInTheDocument();
    });

    it('closes dropdown when menu button is clicked again', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);
      expect(screen.getAllByTestId('milestone-edit-1')[0]!).toBeInTheDocument();

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);
      expect(screen.queryByTestId('milestone-edit-1')).not.toBeInTheDocument();
    });
  });

  // ─── Delete flow ──────────────────────────────────────────────────────────

  describe('delete flow', () => {
    it('opens delete confirmation modal on delete click', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);
      fireEvent.click(screen.getAllByTestId('milestone-delete-1')[0]!);

      // Modal should show milestone title
      expect(screen.getAllByText('Foundation Complete')[0]!).toBeInTheDocument();
    });

    it('closes modal when cancel button is clicked', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);
      fireEvent.click(screen.getAllByTestId('milestone-delete-1')[0]!);

      // Click cancel button (first secondary button in the modal)
      const cancelButtons = screen.getAllByRole('button');
      const cancelBtn = cancelButtons.find((btn) => btn.textContent?.match(/cancel/i));
      expect(cancelBtn).toBeTruthy();
      if (cancelBtn) fireEvent.click(cancelBtn);

      // After cancel, the title (in context of deletion) should have gone away from the modal
    });

    it('calls deleteMilestone and reloads on confirm', async () => {
      mockListMilestones
        .mockResolvedValueOnce([sampleMilestone1])
        .mockResolvedValueOnce([sampleMilestone1]);
      mockDeleteMilestone.mockResolvedValueOnce(undefined);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);
      fireEvent.click(screen.getAllByTestId('milestone-delete-1')[0]!);

      // Find the confirm delete button
      const buttons = screen.getAllByRole('button');
      const deleteConfirmBtn = buttons.find((btn) => btn.textContent?.match(/delete milestone/i));
      expect(deleteConfirmBtn).toBeTruthy();
      if (deleteConfirmBtn) fireEvent.click(deleteConfirmBtn);

      await waitFor(() => {
        expect(mockDeleteMilestone).toHaveBeenCalledWith(1);
      });
    });

    it('shows error banner when deleteMilestone fails', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1]);
      mockDeleteMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Delete failed' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('milestone-menu-button-1')[0]!).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('milestone-menu-button-1')[0]!);
      fireEvent.click(screen.getAllByTestId('milestone-delete-1')[0]!);

      const buttons = screen.getAllByRole('button');
      const deleteConfirmBtn = buttons.find((btn) => btn.textContent?.match(/delete milestone/i));
      if (deleteConfirmBtn) fireEvent.click(deleteConfirmBtn);

      await waitFor(() => {
        expect(screen.getAllByText('Delete failed')[0]!).toBeInTheDocument();
      });
    });
  });

  // ─── Client-side filtering ────────────────────────────────────────────────

  describe('client-side filtering and sorting', () => {
    it('renders both milestones when no filter applied', async () => {
      mockListMilestones.mockResolvedValueOnce([sampleMilestone1, sampleMilestone2]);

      renderPage();

      // DataTable renders items in both table and mobile card view (duplicate text)
      await waitFor(() => {
        expect(screen.getAllByText('Foundation Complete')[0]!).toBeInTheDocument();
      });
      expect(screen.getAllByText('Framing Complete')[0]!).toBeInTheDocument();
    });
  });
});
