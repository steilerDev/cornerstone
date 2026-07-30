/**
 * Unit tests for client/src/pages/ReportWizardPage/Step2Source.tsx
 *
 * Covers: discretionary-last ordering + de-emphasis, per-use-case amount label, skeleton
 * loading state, selection wiring.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { BudgetSource } from '@cornerstone/shared';
import type { Step2Source as Step2SourceType } from './Step2Source.js';

const t = ((key: string) => key) as unknown as TFunction;

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  }),
}));

let Step2Source: typeof Step2SourceType;

beforeAll(async () => {
  ({ Step2Source } = await import('./Step2Source.js'));
});

function makeSource(overrides: Partial<BudgetSource> = {}): BudgetSource {
  return {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    totalAmount: 100000,
    usedAmount: 0,
    availableAmount: 100000,
    claimedAmount: 0,
    unclaimedAmount: 0,
    paidAmount: 0,
    actualAvailableAmount: 100000,
    projectedAmount: 0,
    projectedMinAmount: 0,
    projectedMaxAmount: 0,
    interestRate: null,
    terms: null,
    notes: null,
    reference: null,
    contactAddress: null,
    status: 'active',
    isDiscretionary: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Step2Source', () => {
  it('renders a Skeleton (no radiogroup) while isLoading is true', () => {
    render(
      <Step2Source
        sources={[makeSource()]}
        amounts={new Map()}
        isLoading={true}
        value={null}
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders one radio per source once loaded', () => {
    const sources = [
      makeSource({ id: 'src-1', name: 'Home Loan' }),
      makeSource({ id: 'src-2', name: 'Savings' }),
    ];
    render(
      <Step2Source
        sources={sources}
        amounts={new Map()}
        isLoading={false}
        value={null}
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    // Each source name appears twice (once in the color Badge, once in the .sourceName span).
    expect(screen.getAllByText('Home Loan')).toHaveLength(2);
    expect(screen.getAllByText('Savings')).toHaveLength(2);
  });

  it('sorts discretionary sources after all non-discretionary sources', () => {
    const sources = [
      makeSource({ id: 'src-disc', name: 'Discretionary Fund', sourceType: 'discretionary' }),
      makeSource({ id: 'src-1', name: 'Home Loan' }),
      makeSource({ id: 'src-2', name: 'Savings' }),
    ];
    render(
      <Step2Source
        sources={sources}
        amounts={new Map()}
        isLoading={false}
        value={null}
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    const names = screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value);
    expect(names).toEqual(['src-1', 'src-2', 'src-disc']);
  });

  it('shows a "Discretionary" badge only for discretionary sources', () => {
    const sources = [
      makeSource({ id: 'src-1', name: 'Home Loan' }),
      makeSource({ id: 'src-disc', name: 'Discretionary Fund', sourceType: 'discretionary' }),
    ];
    render(
      <Step2Source
        sources={sources}
        amounts={new Map()}
        isLoading={false}
        value={null}
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('sourceReports.discretionary')).toBeInTheDocument();
  });

  it.each([
    ['budget-overview', 'sourceReports.amountLabel.overview'],
    ['claim', 'sourceReports.amountLabel.claim'],
    ['proof-of-funds', 'sourceReports.amountLabel.proofOfFunds'],
  ] as const)('shows the "%s" use-case amount label', (useCase, expectedLabel) => {
    render(
      <Step2Source
        sources={[makeSource()]}
        amounts={new Map([['src-1', 1000]])}
        isLoading={false}
        value={null}
        useCase={useCase}
        onChange={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it('displays the amount from the amounts map, formatted as currency', () => {
    render(
      <Step2Source
        sources={[makeSource({ id: 'src-1' })]}
        amounts={new Map([['src-1', 1234.5]])}
        isLoading={false}
        value={null}
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('€1234.50')).toBeInTheDocument();
  });

  it('defaults to 0 when a source has no entry in the amounts map', () => {
    render(
      <Step2Source
        sources={[makeSource({ id: 'src-1' })]}
        amounts={new Map()}
        isLoading={false}
        value={null}
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('€0.00')).toBeInTheDocument();
  });

  it('checks the radio matching the current value', () => {
    const sources = [makeSource({ id: 'src-1' }), makeSource({ id: 'src-2' })];
    render(
      <Step2Source
        sources={sources}
        amounts={new Map()}
        isLoading={false}
        value="src-2"
        useCase="claim"
        onChange={jest.fn()}
        t={t}
      />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.find((r) => r.value === 'src-2')?.checked).toBe(true);
    expect(radios.find((r) => r.value === 'src-1')?.checked).toBe(false);
  });

  it('calls onChange with the selected source id when a source row is clicked', () => {
    const onChange = jest.fn();
    const sources = [makeSource({ id: 'src-1' }), makeSource({ id: 'src-2' })];
    render(
      <Step2Source
        sources={sources}
        amounts={new Map()}
        isLoading={false}
        value={null}
        useCase="claim"
        onChange={onChange}
        t={t}
      />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    fireEvent.click(radios.find((r) => r.value === 'src-2')!);
    expect(onChange).toHaveBeenCalledWith('src-2');
  });
});
