/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent, act } from '@testing-library/react';
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

jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: jest.fn().mockReturnValue({
    visibleColumns: new Set(['title', 'targetDate', 'status', 'workItemCount', 'description']),
    isLoaded: true,
    toggleColumn: jest.fn(),
    resetToDefaults: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: jest.fn(),
}));

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: () => null,
}));

const mockNavigate = jest.fn();

jest.unstable_mockModule('react-router-dom', async () => {
  const actual = await import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string | null | undefined, fallback = '—') => d ?? fallback,
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
  formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
  formatPercent: (n: number) => `${n.toFixed(2)}%`,
  computeActualDuration: () => null,
  useFormatters: () => ({
    formatDate: (d: string | null | undefined, fallback = '—') => d ?? fallback,
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMilestone(id: number, overrides: Partial<MilestoneSummary> = {}): MilestoneSummary {
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

const MILESTONE_A = makeMilestone(1, { title: 'Alpha Phase', isCompleted: true, workItemCount: 3 });
const MILESTONE_B = makeMilestone(2, { title: 'Beta Phase', isCompleted: false, workItemCount: 1 });

const SAMPLE_MILESTONES = [MILESTONE_A, MILESTONE_B];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('MilestonesPage', () => {
  let MilestonesPage: React.ComponentType;

  beforeEach(async () => {
    jest.clearAllMocks();
    if (!MilestonesPage) {
      const mod = await import('./MilestonesPage.js');
      MilestonesPage =
        (mod as { MilestonesPage?: React.ComponentType }).MilestonesPage ??
        (mod as { default: React.ComponentType }).default;
    }
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

  it('renders skeleton (role=status) while API call is pending', () => {
    mockListMilestones.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ── 2. Successful load ──────────────────────────────────────────────────────

  it('renders milestone titles after data loads', async () => {
    mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha Phase')).toBeInTheDocument();
      expect(screen.getByText('Beta Phase')).toBeInTheDocument();
    });
  });

  // ── 3. Error state ──────────────────────────────────────────────────────────

  it('shows error banner when API rejects', async () => {
    mockListMilestones.mockRejectedValue(new Error('Server error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // ── 4. Empty state ──────────────────────────────────────────────────────────

  it('shows empty state (no table body) when no milestones exist', async () => {
    mockListMilestones.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(document.querySelector('tbody')).not.toBeInTheDocument();
    });
  });

  // ── 5. Row click navigates ──────────────────────────────────────────────────

  it('clicking a milestone row navigates to the milestone detail path', async () => {
    mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);
    renderPage();
    await waitFor(() => screen.getByText('Alpha Phase'));

    const rows = document.querySelectorAll('tbody tr');
    fireEvent.click(rows[0] as HTMLElement);

    expect(mockNavigate).toHaveBeenCalledWith(`/project/milestones/${MILESTONE_A.id}`);
  });

  // ── 6. New milestone button ─────────────────────────────────────────────────

  it('renders a button or link to create a new milestone', async () => {
    mockListMilestones.mockResolvedValue(SAMPLE_MILESTONES);
    renderPage();
    await waitFor(() => screen.getByText('Alpha Phase'));

    // The "New Milestone" button may use i18n key or the english text.
    // Either a button with the key or an <a> pointing to /new is acceptable.
    const hasNewButton =
      screen.queryAllByRole('button').some((btn) => {
        const text = btn.textContent ?? '';
        return text.toLowerCase().includes('new') || text.includes('milestones.newMilestone');
      }) ||
      screen.queryAllByRole('link').some((link) => {
        return link.getAttribute('href')?.includes('/new');
      });

    expect(hasNewButton).toBe(true);
  });

  // ── 7. Delete flow — confirm ────────────────────────────────────────────────

  it('confirms delete: calls deleteMilestone with the milestone id', async () => {
    mockListMilestones
      .mockResolvedValueOnce(SAMPLE_MILESTONES)
      .mockResolvedValue([MILESTONE_B]);
    mockDeleteMilestone.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => screen.getByText('Alpha Phase'));

    fireEvent.click(screen.getByTestId(`milestone-menu-button-${MILESTONE_A.id}`));
    fireEvent.click(screen.getByTestId(`milestone-delete-${MILESTONE_A.id}`));

    await waitFor(() => {
      expect(screen.getAllByText('Alpha Phase').length).toBeGreaterThan(0);
    });

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
      expect(mockDeleteMilestone).toHaveBeenCalledWith(MILESTONE_A.id);
    });
  });
});
