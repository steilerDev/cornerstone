/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type { MilestoneSummary } from '@cornerstone/shared';
import type React from 'react';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockDeleteMilestone = jest.fn<typeof MilestonesApiTypes.deleteMilestone>();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  deleteMilestone: mockDeleteMilestone,
  getMilestone: jest.fn(),
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
}));

// ── DataTable column preferences mock ────────────────────────────────────────

const mockToggleColumn = jest.fn();
const mockResetToDefaults = jest.fn();
const mockUseColumnPreferences = jest.fn();

jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: mockUseColumnPreferences,
}));

// ── Keyboard shortcuts / help mocks ──────────────────────────────────────────

const mockUseKeyboardShortcuts = jest.fn();

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: mockUseKeyboardShortcuts,
}));

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: () => null,
}));

// ── Navigate mock ─────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.unstable_mockModule('react-router-dom', async () => {
  const actual = await import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
      maximumFractionDigits: 2,
    }).format(n);
  return {
    formatDate: fmtDate,
    formatCurrency: fmtCurrency,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatDate: fmtDate,
      formatCurrency: fmtCurrency,
      formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMilestone(
  id: number,
  overrides: Partial<MilestoneSummary> = {},
): MilestoneSummary {
  return {
    id,
    title: `Milestone ${id}`,
    description: null,
    targetDate: '2026-06-01',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemCount: 0,
    dependentWorkItemCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const MILESTONE_ALPHA = makeMilestone(1, {
  title: 'Alpha Phase',
  targetDate: '2026-03-15',
  isCompleted: true,
  workItemCount: 3,
});
const MILESTONE_BETA = makeMilestone(2, {
  title: 'Beta Phase',
  targetDate: '2026-05-01',
  isCompleted: false,
  workItemCount: 1,
});
const MILESTONE_GAMMA = makeMilestone(3, {
  title: 'Gamma Phase',
  targetDate: '2026-07-20',
  isCompleted: false,
  workItemCount: 0,
});

const SAMPLE_MILESTONES = [MILESTONE_ALPHA, MILESTONE_BETA, MILESTONE_GAMMA];
const ALL_COLUMN_KEYS = ['title', 'targetDate', 'status', 'workItemCount', 'description'];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('MilestonesPage', () => {
  let MilestonesPage: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(async () => {
    if (!MilestonesPage) {
      const mod = await import('./MilestonesPage.js');
      MilestonesPage = (mod as { MilestonesPage?: React.ComponentType; default?: React.ComponentType }).MilestonesPage ??
        (mod as { default: React.ComponentType }).default;
    }

    mockListMilestones.mockReset();
    mockDeleteMilestone.mockReset();
    mockNavigate.mockReset();
    mockToggleColumn.mockReset();
    mockResetToDefaults.mockReset();
    mockUseKeyboardShortcuts.mockReset();

    mockUseColumnPreferences.mockReturnValue({
      visibleColumns: new Set(ALL_COLUMN_KEYS),
      isLoaded: true,
      toggleColumn: mockToggleColumn,
      resetToDefaults: mockResetToDefaults,
    });

    // Capture shortcuts so individual tests can inspect/invoke them
    mockUseKeyboardShortcuts.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/milestones']}>
        <MilestonesPage />
      </MemoryRouter>,
    );
  }

  // ── 1. Loading state ────────────────────────────────────────────────────────

  describe('1. Loading state', () => {
    it('renders skeleton (role=status) while API call is pending', () => {
      mockListMilestones.mockReturnValue(new Promise(() => {})); // never resolves

      renderPage();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // ── 2. Successful load ──────────────────────────────────────────────────────

  describe('2. Successful load', () => {
    it('renders all three milestone titles after data loads', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Alpha Phase')).toBeInTheDocument();
        expect(screen.getByText('Beta Phase')).toBeInTheDocument();
        expect(screen.getByText('Gamma Phase')).toBeInTheDocument();
      });
    });
  });

  // ── 3. Error state ──────────────────────────────────────────────────────────

  describe('3. Error state', () => {
    it('shows error banner (role=alert) when API rejects', async () => {
      mockListMilestones.mockRejectedValue(new Error('Server error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ── 4. Empty state ──────────────────────────────────────────────────────────

  describe('4. Empty state', () => {
    it('shows empty state when no milestones exist — no skeleton, no table body', async () => {
      mockListMilestones.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        // Skeleton gone (loading complete)
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        // No error
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        // No table body (DataTable renders EmptyState instead)
        expect(document.querySelector('tbody')).not.toBeInTheDocument();
      });
    });
  });

  // ── 5. Search filtering ─────────────────────────────────────────────────────

  describe('5. Search filtering', () => {
    it('typing "Alpha" filters to only the Alpha milestone', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Alpha' } });

      expect(screen.getByText('Alpha Phase')).toBeInTheDocument();
      expect(screen.queryByText('Beta Phase')).not.toBeInTheDocument();
      expect(screen.queryByText('Gamma Phase')).not.toBeInTheDocument();
    });
  });

  // ── 6. Status filter ────────────────────────────────────────────────────────

  describe('6. Status filter', () => {
    it('applying completed enum filter shows only completed milestones', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // The status column header has a filter button (aria-label contains "filter")
      // In i18n test environment the aria-label is the translation key.
      // Find the filter trigger button for the status column by looking at all
      // buttons inside the column header that contain 'status' in the column header.
      // In tests, i18next returns the key: 'milestones.table.headers.status'
      const statusHeader = screen.getByRole('columnheader', {
        name: (name) =>
          name.includes('headers.status') || name.toLowerCase().includes('status'),
      });
      const filterButton = within(statusHeader).getByRole('button');
      fireEvent.click(filterButton);

      // The EnumFilter popover should now be visible with "completed" and "pending" checkboxes.
      // Since the enum options use t() keys, look for labels or the checkbox ids.
      const completedCheckbox = document.getElementById('enum-completed') as HTMLInputElement;
      expect(completedCheckbox).not.toBeNull();

      // Click the completed option (the containing div handles click)
      const completedItem = completedCheckbox.closest('[class]') as HTMLElement;
      fireEvent.click(completedItem);

      // Click Apply
      const applyBtn = screen.getByRole('button', {
        name: (name) =>
          name.toLowerCase().includes('apply') || name.includes('dataTable.filter'),
      });
      fireEvent.click(applyBtn);

      // Now only Alpha (isCompleted=true) should be visible
      await waitFor(() => {
        expect(screen.getByText('Alpha Phase')).toBeInTheDocument();
        expect(screen.queryByText('Beta Phase')).not.toBeInTheDocument();
        expect(screen.queryByText('Gamma Phase')).not.toBeInTheDocument();
      });
    });
  });

  // ── 7. Sort by targetDate ───────────────────────────────────────────────────

  describe('7. Sort by targetDate', () => {
    it('clicking targetDate column header sorts milestones in ascending date order', async () => {
      // Feed in reverse order so we can verify sorting actually changes the order
      mockListMilestones.mockResolvedValue([MILESTONE_GAMMA, MILESTONE_BETA, MILESTONE_ALPHA]);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // Before sort, Gamma is first (fed first, no sort applied)
      let rows = document.querySelectorAll('tbody tr');
      expect(rows[0].textContent).toContain('Gamma Phase');

      // Click targetDate column header to sort ascending.
      // In tests, i18next returns the key as-is: 'milestones.table.headers.targetDate'.
      // The th also contains the filter button emoji '🔽', so use textContent-based matcher.
      const targetDateHeader = screen.getByRole('columnheader', {
        name: (name) =>
          name.includes('targetDate') || name.toLowerCase().includes('target') || name.toLowerCase().includes('date'),
      });
      fireEvent.click(targetDateHeader);

      // After sort ascending, Alpha (Mar 15) is earliest — should be first
      rows = document.querySelectorAll('tbody tr');
      expect(rows[0].textContent).toContain('Alpha Phase');
      expect(rows[2].textContent).toContain('Gamma Phase');
    });
  });

  // ── 8. Row click navigates ──────────────────────────────────────────────────

  describe('8. Row click navigation', () => {
    it('clicking a milestone row calls navigate with the milestone detail path', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      const rows = document.querySelectorAll('tbody tr');
      fireEvent.click(rows[0] as HTMLElement);

      expect(mockNavigate).toHaveBeenCalledWith(`/project/milestones/${MILESTONE_ALPHA.id}`);
    });
  });

  // ── 9. Actions menu — edit ──────────────────────────────────────────────────

  describe('9. Actions menu — edit', () => {
    it('clicking edit in the actions menu navigates to the milestone detail page', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // Open actions menu for ALPHA
      fireEvent.click(screen.getByTestId(`milestone-menu-button-${MILESTONE_ALPHA.id}`));

      // Click edit
      fireEvent.click(screen.getByTestId(`milestone-edit-${MILESTONE_ALPHA.id}`));

      expect(mockNavigate).toHaveBeenCalledWith(`/project/milestones/${MILESTONE_ALPHA.id}`);
    });
  });

  // ── 10. Delete flow — confirm ───────────────────────────────────────────────

  describe('10. Delete flow — confirm', () => {
    it('opens modal, confirms, calls deleteMilestone with milestone id', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);
      mockDeleteMilestone.mockResolvedValue(undefined);
      // After delete reload, return fewer milestones
      mockListMilestones.mockResolvedValueOnce(SAMPLE_MILESTONES);
      mockListMilestones.mockResolvedValue([MILESTONE_BETA, MILESTONE_GAMMA]);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // Open actions menu
      fireEvent.click(screen.getByTestId(`milestone-menu-button-${MILESTONE_ALPHA.id}`));
      // Click delete button — opens modal
      fireEvent.click(screen.getByTestId(`milestone-delete-${MILESTONE_ALPHA.id}`));

      // Modal title should be visible (i18n key returned as-is)
      await waitFor(() => {
        // The delete modal is present (either by title or by the milestone name in the body)
        expect(screen.getAllByText('Alpha Phase').length).toBeGreaterThan(0);
      });

      // Find the delete confirmation button — it has danger/delete styling
      // In i18n key mode the button text is 'milestones.delete.delete'
      // or it could be 'Delete' — match both
      const confirmDeleteBtn = screen.getAllByRole('button').find((btn) => {
        const text = btn.textContent ?? '';
        return (
          text === 'Delete' ||
          text === 'milestones.delete.delete' ||
          btn.className?.includes('btnConfirmDelete') ||
          btn.getAttribute('data-testid') === 'confirm-delete'
        );
      });

      expect(confirmDeleteBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(confirmDeleteBtn!);
      });

      await waitFor(() => {
        expect(mockDeleteMilestone).toHaveBeenCalledWith(MILESTONE_ALPHA.id);
      });
    });
  });

  // ── 11. Delete flow — cancel ────────────────────────────────────────────────

  describe('11. Delete flow — cancel', () => {
    it('opens modal, cancels, deleteMilestone is NOT called', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // Open actions menu and click delete
      fireEvent.click(screen.getByTestId(`milestone-menu-button-${MILESTONE_ALPHA.id}`));
      fireEvent.click(screen.getByTestId(`milestone-delete-${MILESTONE_ALPHA.id}`));

      // Modal should be open
      await waitFor(() => {
        // milestone name appears in the modal body
        expect(screen.getAllByText('Alpha Phase').length).toBeGreaterThan(0);
      });

      // Find cancel button
      const cancelBtn = screen.getAllByRole('button').find((btn) => {
        const text = btn.textContent ?? '';
        return text === 'Cancel' || text === 'milestones.delete.cancel';
      });
      expect(cancelBtn).toBeDefined();
      fireEvent.click(cancelBtn!);

      // deleteMilestone must not have been called
      expect(mockDeleteMilestone).not.toHaveBeenCalled();

      // Modal is dismissed — cancel button no longer present
      await waitFor(() => {
        const stillPresent = screen.queryAllByRole('button').find((btn) => {
          const text = btn.textContent ?? '';
          return text === 'Cancel' || text === 'milestones.delete.cancel';
        });
        expect(stillPresent).toBeUndefined();
      });
    });
  });

  // ── 12. Delete error ────────────────────────────────────────────────────────

  describe('12. Delete error', () => {
    it('shows error banner when deleteMilestone rejects', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);
      mockDeleteMilestone.mockRejectedValue(new Error('Delete failed'));

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      fireEvent.click(screen.getByTestId(`milestone-menu-button-${MILESTONE_ALPHA.id}`));
      fireEvent.click(screen.getByTestId(`milestone-delete-${MILESTONE_ALPHA.id}`));

      await waitFor(() => {
        expect(screen.getAllByText('Alpha Phase').length).toBeGreaterThan(0);
      });

      const confirmDeleteBtn = screen.getAllByRole('button').find((btn) => {
        const text = btn.textContent ?? '';
        return (
          text === 'Delete' ||
          text === 'milestones.delete.delete' ||
          btn.className?.includes('btnConfirmDelete')
        );
      });

      expect(confirmDeleteBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(confirmDeleteBtn!);
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ── 13. Keyboard shortcut 'n' ───────────────────────────────────────────────

  describe('13. Keyboard shortcut n', () => {
    it('pressing "n" navigates to /project/milestones/new', async () => {
      // Capture shortcuts passed to useKeyboardShortcuts
      let capturedShortcuts: { key: string; handler: () => void; description: string }[] = [];

      mockUseKeyboardShortcuts.mockImplementation((...args: unknown[]) => {
        capturedShortcuts = args[0] as { key: string; handler: () => void; description: string }[];
      });

      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      const nShortcut = capturedShortcuts.find((s) => s.key === 'n');
      expect(nShortcut).toBeDefined();

      act(() => {
        nShortcut!.handler();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/project/milestones/new');
    });
  });

  // ── 14. WorkItemCount column ────────────────────────────────────────────────

  describe('14. WorkItemCount column', () => {
    it('renders the workItemCount value for each milestone row', async () => {
      mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // ALPHA has workItemCount=3, BETA has 1, GAMMA has 0
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      // At least one cell should render '0' for GAMMA
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 15. Badge status ────────────────────────────────────────────────────────

  describe('15. Badge status', () => {
    it('completed milestone renders Badge with "completed" value — renders a distinguishable badge', async () => {
      // Render only the completed milestone so we can isolate its badge
      mockListMilestones.mockResolvedValue([MILESTONE_ALPHA]);

      renderPage();

      await waitFor(() => screen.getByText('Alpha Phase'));

      // The Badge component renders the label for the 'completed' variant.
      // In tests, i18next returns the translation key as the label, so the badge
      // will contain 'milestones.status.completed' or the resolved English text.
      // Either way a badge element is rendered in the status cell.
      // Verify the status column contains something non-empty that corresponds
      // to the completed state (not '—' or blank).
      const rows = document.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);

      const statusCell = Array.from(rows[0].querySelectorAll('td')).find((td) => {
        const text = td.textContent ?? '';
        return (
          text.toLowerCase().includes('completed') ||
          text.includes('milestones.status')
        );
      });

      expect(statusCell).toBeDefined();
    });

    it('pending milestone renders Badge with "pending" value', async () => {
      mockListMilestones.mockResolvedValue([MILESTONE_BETA]);

      renderPage();

      await waitFor(() => screen.getByText('Beta Phase'));

      const rows = document.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);

      const statusCell = Array.from(rows[0].querySelectorAll('td')).find((td) => {
        const text = td.textContent ?? '';
        return (
          text.toLowerCase().includes('pending') ||
          text.includes('milestones.status')
        );
      });

      expect(statusCell).toBeDefined();
    });
  });
});
