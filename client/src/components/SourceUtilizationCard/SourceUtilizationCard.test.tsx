/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { BudgetSource } from '@cornerstone/shared';

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

// Dynamic import — must happen after jest.unstable_mockModule calls.
let SourceUtilizationCard: React.ComponentType<{ sources: BudgetSource[] }>;

const baseSource: BudgetSource = {
  id: 'bs-1',
  name: 'Construction Loan',
  sourceType: 'bank_loan',
  totalAmount: 200000,
  usedAmount: 100000,
  availableAmount: 100000,
  claimedAmount: 50000,
  unclaimedAmount: 50000,
  actualAvailableAmount: 150000,
  paidAmount: 100000,
  projectedAmount: 120000,
  projectedMinAmount: 100000,
  projectedMaxAmount: 140000,
  isDiscretionary: false,
  interestRate: 3.5,
  terms: null,
  notes: null,
  status: 'active',
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('SourceUtilizationCard', () => {
  beforeEach(async () => {
    if (!SourceUtilizationCard) {
      const module = await import('./SourceUtilizationCard.js');
      SourceUtilizationCard = module.SourceUtilizationCard;
    }
  });

  // ── Test 1: Renders source rows ──────────────────────────────────────────

  it('renders one data-testid="source-row" element per budget source', () => {
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', name: 'Construction Loan' },
      { ...baseSource, id: 'bs-2', name: 'Savings Account', sourceType: 'savings' },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    const rows = screen.getAllByTestId('source-row');
    expect(rows).toHaveLength(2);
  });

  // ── Test 2: Source name displayed ────────────────────────────────────────

  it('displays the source name within each source row', () => {
    const sources: BudgetSource[] = [{ ...baseSource, id: 'bs-1', name: 'My Construction Loan' }];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('My Construction Loan')).toBeInTheDocument();
  });

  // ── Test 3: Type badge — bank_loan ───────────────────────────────────────

  it('renders "Bank Loan" type badge for bank_loan source type', () => {
    const sources: BudgetSource[] = [{ ...baseSource, id: 'bs-1', sourceType: 'bank_loan' }];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Bank Loan')).toBeInTheDocument();
  });

  // ── Test 4: Type badge — credit_line ─────────────────────────────────────

  it('renders "Credit Line" type badge for credit_line source type', () => {
    const sources: BudgetSource[] = [{ ...baseSource, id: 'bs-1', sourceType: 'credit_line' }];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Credit Line')).toBeInTheDocument();
  });

  // ── Test 5: Type badge — savings ─────────────────────────────────────────

  it('renders "Savings" type badge for savings source type', () => {
    const sources: BudgetSource[] = [{ ...baseSource, id: 'bs-1', sourceType: 'savings' }];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Savings')).toBeInTheDocument();
  });

  // ── Test 6: Type badge — other ───────────────────────────────────────────

  it('renders "Other" type badge for other source type', () => {
    const sources: BudgetSource[] = [{ ...baseSource, id: 'bs-1', sourceType: 'other' }];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  // ── Test 7: Currency amounts displayed ───────────────────────────────────

  it('renders used and total amounts as formatted EUR currency values', () => {
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', usedAmount: 75000, totalAmount: 150000 },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    const usedEl = screen.getByTestId('source-used');
    const totalEl = screen.getByTestId('source-total');
    expect(usedEl).toHaveTextContent('€75,000.00');
    expect(totalEl).toHaveTextContent('€150,000.00');
  });

  // ── Test 8: BudgetBar rendered ───────────────────────────────────────────

  it('renders a BudgetBar with role="img" for each source row', () => {
    const sources: BudgetSource[] = [{ ...baseSource, id: 'bs-1' }];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    // BudgetBar renders with role="img"
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  // ── Test 9: Sorting — exhausted sorts before active ──────────────────────

  it('sorts exhausted sources before active sources', () => {
    const sources: BudgetSource[] = [
      {
        ...baseSource,
        id: 'bs-active',
        name: 'Active Source',
        status: 'active',
        totalAmount: 100000,
        usedAmount: 50000, // 50% utilization
      },
      {
        ...baseSource,
        id: 'bs-exhausted',
        name: 'Exhausted Source',
        status: 'exhausted',
        totalAmount: 100000,
        usedAmount: 100000, // 100% utilization (also exhausted)
      },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    const rows = screen.getAllByTestId('source-row');
    expect(rows).toHaveLength(2);
    // Exhausted source must appear first
    expect(rows[0]).toHaveTextContent('Exhausted Source');
    expect(rows[1]).toHaveTextContent('Active Source');
  });

  // ── Test 10: Empty sources — no rows rendered ────────────────────────────

  it('renders no source-row elements when sources array is empty', () => {
    renderWithRouter(<SourceUtilizationCard sources={[]} />);

    expect(screen.queryByTestId('source-row')).toBeNull();
  });

  // ── Story #478: Responsive, Dark Mode & Accessibility ─────────────────────

  // Test 11: sr-only utilization percentage — normal case
  it('renders a visually hidden element with "50% utilized" for a source with usedAmount=500 and totalAmount=1000', () => {
    const source: BudgetSource = {
      ...baseSource,
      id: 'bs-pct',
      usedAmount: 500,
      totalAmount: 1000,
      availableAmount: 500,
    };

    const { container } = renderWithRouter(<SourceUtilizationCard sources={[source]} />);

    // The sr-only span is not accessible by role — query via text content
    // Identity-obj-proxy mocks CSS modules, so className becomes the key name
    // We rely on text content rather than CSS visibility
    const allText = container.textContent ?? '';
    expect(allText).toContain('50% utilized');
  });

  // Test 12: sr-only utilization percentage — zero total
  it('renders "0% utilized" in the sr-only span when totalAmount is 0', () => {
    const source: BudgetSource = {
      ...baseSource,
      id: 'bs-zero',
      usedAmount: 0,
      totalAmount: 0,
      availableAmount: 0,
      actualAvailableAmount: 0,
    };

    const { container } = renderWithRouter(<SourceUtilizationCard sources={[source]} />);

    const allText = container.textContent ?? '';
    expect(allText).toContain('0% utilized');
  });
});
