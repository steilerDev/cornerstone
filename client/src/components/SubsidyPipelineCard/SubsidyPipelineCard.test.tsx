/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type * as CardTypes from './SubsidyPipelineCard.js';
import type { SubsidyProgram } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// ─── Mock: formatters — provides useFormatters() hook used by this component ──

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  return {
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatCurrency: fmtCurrency,
    formatTime: (d: string | null | undefined) => d ?? '—',
    formatDateTime: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: (d: string | null | undefined) => d ?? '—',
      formatTime: (d: string | null | undefined) => d ?? '—',
      formatDateTime: (d: string | null | undefined) => d ?? '—',
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// Dynamic import — must happen after any jest.unstable_mockModule calls.
let SubsidyPipelineCard: typeof CardTypes.SubsidyPipelineCard;

beforeEach(async () => {
  const mod = await import('./SubsidyPipelineCard.js');
  SubsidyPipelineCard = mod.SubsidyPipelineCard;
});

// ── Base Fixture ──────────────────────────────────────────────────────────────

const baseProgram: SubsidyProgram = {
  id: 'sp-001',
  name: 'Solar Panel Grant',
  description: null,
  eligibility: null,
  reductionType: 'fixed',
  reductionValue: 2000,
  applicationStatus: 'eligible',
  applicationDeadline: null,
  notes: null,
  maximumAmount: null,
  applicableCategories: [],
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ── Date helper ───────────────────────────────────────────────────────────────

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubsidyPipelineCard', () => {
  // ── Test 1: Empty state ──────────────────────────────────────────────────────

  it('shows empty state when subsidyPrograms is empty', () => {
    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={[]} />);

    expect(screen.getByTestId('subsidy-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('subsidy-group')).toBeNull();
  });

  // ── Test 2: Renders groups for present statuses ──────────────────────────────

  it('renders one subsidy-group per distinct status present', () => {
    const programs: SubsidyProgram[] = [
      { ...baseProgram, id: 'sp-eligible', applicationStatus: 'eligible' },
      { ...baseProgram, id: 'sp-applied-1', applicationStatus: 'applied' },
      { ...baseProgram, id: 'sp-applied-2', applicationStatus: 'applied' },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    const groups = screen.getAllByTestId('subsidy-group');
    expect(groups).toHaveLength(2);
  });

  // ── Test 3: Lifecycle order — eligible before applied before received ─────────

  it('renders groups in lifecycle order: eligible → applied → received', () => {
    const programs: SubsidyProgram[] = [
      { ...baseProgram, id: 'sp-received', applicationStatus: 'received' },
      { ...baseProgram, id: 'sp-eligible', applicationStatus: 'eligible' },
      { ...baseProgram, id: 'sp-applied', applicationStatus: 'applied' },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    const badges = screen.getAllByTestId('status-badge');
    expect(badges).toHaveLength(3);
    // First group must be 'eligible'
    expect(badges[0]!).toHaveTextContent('Eligible');
  });

  // ── Test 4: Rejected renders last ────────────────────────────────────────────

  it('renders rejected group after all lifecycle groups', () => {
    const programs: SubsidyProgram[] = [
      { ...baseProgram, id: 'sp-rejected', applicationStatus: 'rejected' },
      { ...baseProgram, id: 'sp-eligible', applicationStatus: 'eligible' },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    const badges = screen.getAllByTestId('status-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]!).toHaveTextContent('Eligible');
    expect(badges[1]!).toHaveTextContent('Rejected');
  });

  // ── Test 5: Group count ───────────────────────────────────────────────────────

  it('displays the count of programs within a group', () => {
    const programs: SubsidyProgram[] = [
      { ...baseProgram, id: 'sp-e1', applicationStatus: 'eligible' },
      { ...baseProgram, id: 'sp-e2', applicationStatus: 'eligible' },
      { ...baseProgram, id: 'sp-e3', applicationStatus: 'eligible' },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    const countEl = screen.getByTestId('group-count');
    expect(countEl).toHaveTextContent('3');
  });

  // ── Test 6: Deadline within 14 days shows warning ────────────────────────────

  it('shows a deadline-warning when applicationDeadline is 7 days from today', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);

    const programs: SubsidyProgram[] = [
      {
        ...baseProgram,
        id: 'sp-soon',
        applicationStatus: 'eligible',
        applicationDeadline: formatDateStr(soon),
      },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    expect(screen.getByTestId('deadline-warning')).toBeInTheDocument();
    expect(screen.getByTestId('deadline-warning')).toHaveTextContent('Deadline soon');
  });

  // ── Test 7: Deadline exactly 14 days away shows warning ──────────────────────

  it('shows a deadline-warning when applicationDeadline is exactly 14 days away', () => {
    const exactly14 = new Date();
    exactly14.setDate(exactly14.getDate() + 14);

    const programs: SubsidyProgram[] = [
      {
        ...baseProgram,
        id: 'sp-14days',
        applicationStatus: 'eligible',
        applicationDeadline: formatDateStr(exactly14),
      },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    expect(screen.getByTestId('deadline-warning')).toBeInTheDocument();
  });

  // ── Test 8: Deadline 15 days away — no warning ───────────────────────────────

  it('does not show a deadline-warning when applicationDeadline is 15 days away', () => {
    const future15 = new Date();
    future15.setDate(future15.getDate() + 15);

    const programs: SubsidyProgram[] = [
      {
        ...baseProgram,
        id: 'sp-15days',
        applicationStatus: 'eligible',
        applicationDeadline: formatDateStr(future15),
      },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    expect(screen.queryByTestId('deadline-warning')).toBeNull();
  });

  // ── Test 9: Null deadline — no warning ───────────────────────────────────────

  it('does not show a deadline-warning when applicationDeadline is null', () => {
    const programs: SubsidyProgram[] = [
      {
        ...baseProgram,
        id: 'sp-null-dl',
        applicationStatus: 'eligible',
        applicationDeadline: null,
      },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    expect(screen.queryByTestId('deadline-warning')).toBeNull();
  });

  // ── Test 10: Fixed reduction aggregated ──────────────────────────────────────

  it('aggregates fixed reduction amounts for a group and displays the total', () => {
    const programs: SubsidyProgram[] = [
      {
        ...baseProgram,
        id: 'sp-fixed-1',
        applicationStatus: 'eligible',
        reductionType: 'fixed',
        reductionValue: 1000,
      },
      {
        ...baseProgram,
        id: 'sp-fixed-2',
        applicationStatus: 'eligible',
        reductionType: 'fixed',
        reductionValue: 1000,
      },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    const reductionEl = screen.getByTestId('group-reduction');
    expect(reductionEl).toHaveTextContent('2,000');
  });

  // ── Test 11: Percentage reduction not included in sum ────────────────────────

  it('excludes percentage reductions from the group-reduction total', () => {
    const programs: SubsidyProgram[] = [
      {
        ...baseProgram,
        id: 'sp-fixed',
        applicationStatus: 'eligible',
        reductionType: 'fixed',
        reductionValue: 1000,
      },
      {
        ...baseProgram,
        id: 'sp-pct',
        applicationStatus: 'eligible',
        reductionType: 'percentage',
        reductionValue: 50,
      },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    // Only the fixed reduction (1000) is shown; percentage is excluded
    const reductionEl = screen.getByTestId('group-reduction');
    expect(reductionEl).toHaveTextContent('1,000');
    // Should NOT show 1,050 or 50 added in
    expect(reductionEl.textContent).not.toMatch(/1,050/);
  });

  // ── Test 12: Footer link to subsidies page ───────────────────────────────────

  it('renders a "View all subsidies" link pointing to /budget/subsidies', () => {
    const programs: SubsidyProgram[] = [
      { ...baseProgram, id: 'sp-link', applicationStatus: 'eligible' },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    const link = screen.getByRole('link', { name: /view all subsidies/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/subsidies');
  });

  // ── Test 13: Status badge text for all lifecycle statuses ────────────────────

  it('renders correct badge text for each lifecycle status', () => {
    const programs: SubsidyProgram[] = [
      { ...baseProgram, id: 'sp-elig', applicationStatus: 'eligible' },
      { ...baseProgram, id: 'sp-appl', applicationStatus: 'applied' },
      { ...baseProgram, id: 'sp-appr', applicationStatus: 'approved' },
      { ...baseProgram, id: 'sp-recv', applicationStatus: 'received' },
    ];

    renderWithRouter(<SubsidyPipelineCard subsidyPrograms={programs} />);

    expect(screen.getByText('Eligible')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
  });
});
