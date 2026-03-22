/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock API modules BEFORE importing the component
const mockListMilestones = jest.fn<() => Promise<unknown>>();
const mockDeleteMilestone = jest.fn<() => Promise<void>>();

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

// ─── Mock: useKeyboardShortcuts hook ─────────────────────────────────────────

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: () => undefined,
}));

// ─── Mock: KeyboardShortcutsHelp component ────────────────────────────────────

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: () => null,
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

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
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

describe('MilestonesPage — layout consistency (Issue #1142)', () => {
  let MilestonesPage: React.ComponentType;

  beforeEach(async () => {
    if (!MilestonesPage) {
      const module = await import('./MilestonesPage.js');
      MilestonesPage = module.MilestonesPage;
    }

    mockListMilestones.mockReset();
    mockDeleteMilestone.mockReset();

    mockListMilestones.mockResolvedValue([]);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/milestones']}>
        <MilestonesPage />
      </MemoryRouter>,
    );
  }

  // ─── Page layout ────────────────────────────────────────────────────────────

  describe('page layout', () => {
    it('renders an <h1> page title', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "New Milestone" primary action button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new milestone/i })).toBeInTheDocument();
      });
    });

    it('"New Milestone" button is accessible by role, has testid, and is not disabled', async () => {
      renderPage();

      await waitFor(() => {
        const btn = screen.getByTestId('new-milestone-button');
        expect(btn).toBeVisible();
        expect(btn).not.toBeDisabled();
      });
    });
  });
});
