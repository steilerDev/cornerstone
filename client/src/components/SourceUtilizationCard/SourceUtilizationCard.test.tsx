/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { BudgetSource } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// SourceUtilizationCard has no context deps so no mocks are needed before the import.
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
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', name: 'My Construction Loan' },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('My Construction Loan')).toBeInTheDocument();
  });

  // ── Test 3: Type badge — bank_loan ───────────────────────────────────────

  it('renders "Bank Loan" type badge for bank_loan source type', () => {
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', sourceType: 'bank_loan' },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Bank Loan')).toBeInTheDocument();
  });

  // ── Test 4: Type badge — credit_line ─────────────────────────────────────

  it('renders "Credit Line" type badge for credit_line source type', () => {
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', sourceType: 'credit_line' },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Credit Line')).toBeInTheDocument();
  });

  // ── Test 5: Type badge — savings ─────────────────────────────────────────

  it('renders "Savings" type badge for savings source type', () => {
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', sourceType: 'savings' },
    ];

    renderWithRouter(<SourceUtilizationCard sources={sources} />);

    expect(screen.getByText('Savings')).toBeInTheDocument();
  });

  // ── Test 6: Type badge — other ───────────────────────────────────────────

  it('renders "Other" type badge for other source type', () => {
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1', sourceType: 'other' },
    ];

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
    const sources: BudgetSource[] = [
      { ...baseSource, id: 'bs-1' },
    ];

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
});
