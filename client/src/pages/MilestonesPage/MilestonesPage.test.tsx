/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { MilestoneSummary } from '@cornerstone/shared';
import type React from 'react';

// ── Minimal mocks ────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockListMilestones = jest.fn();
const mockDeleteMilestone = jest.fn();

jest.unstable_mockModule('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
  MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => children,
}));

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  deleteMilestone: mockDeleteMilestone,
  getMilestone: jest.fn(),
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
}));

jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: () => ({
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

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: unknown) => d ?? '—',
  formatCurrency: (n: number) => `€${n}`,
  formatTime: (d: unknown) => d ?? '—',
  formatDateTime: (d: unknown) => d ?? '—',
  formatPercent: (n: number) => `${n}%`,
  computeActualDuration: () => null,
  useFormatters: () => ({
    formatDate: (d: unknown) => d ?? '—',
    formatCurrency: (n: number) => `€${n}`,
    formatTime: (d: unknown) => d ?? '—',
    formatDateTime: (d: unknown) => d ?? '—',
    formatPercent: (n: number) => `${n}%`,
  }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────────

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

  it('renders loading skeleton initially', () => {
    mockListMilestones.mockReturnValue(new Promise(() => {}));
    render(<MilestonesPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders milestone titles after load', async () => {
    const milestones = [makeMilestone(1, { title: 'Alpha' }), makeMilestone(2, { title: 'Beta' })];
    mockListMilestones.mockResolvedValue(milestones);
    render(<MilestonesPage />);
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('shows new milestone button', async () => {
    mockListMilestones.mockResolvedValue([]);
    render(<MilestonesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('new-milestone-button')).toBeInTheDocument();
    });
  });

  it('navigates on row click', async () => {
    mockListMilestones.mockResolvedValue([makeMilestone(5, { title: 'Foundation' })]);
    render(<MilestonesPage />);
    await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
    const row = screen.getByText('Foundation').closest('tr');
    if (row) fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/project/milestones/5');
  });
});
