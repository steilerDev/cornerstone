/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { BaseBudgetLine } from '@cornerstone/shared';
import type * as BudgetCostOverviewModule from './BudgetCostOverview.js';
import type { SubsidyPaybackData } from './BudgetCostOverview.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mutable so each test can choose the VAT rate that useLocale() reports.
const mockLocaleValue = {
  locale: 'en',
  resolvedLocale: 'en',
  currency: 'EUR',
  vatRate: 0.19,
  setLocale: jest.fn(),
  syncWithServer: jest.fn(),
};

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: unknown }) => children,
  useLocale: () => mockLocaleValue,
}));

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const formatCurrency = (n: number) => '€' + n.toFixed(2);
  return {
    formatCurrency,
    useFormatters: () => ({ formatCurrency }),
  };
});

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  Trans: ({ children }: { children: unknown }) => children,
}));

// ─── Dynamic import after mocks ───────────────────────────────────────────────

let BudgetCostOverview: (typeof BudgetCostOverviewModule)['BudgetCostOverview'];

beforeEach(async () => {
  ({ BudgetCostOverview } =
    (await import('./BudgetCostOverview.js')) as typeof BudgetCostOverviewModule);
  mockLocaleValue.vatRate = 0.19;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildLine(overrides: Partial<BaseBudgetLine> = {}): BaseBudgetLine {
  return {
    id: 'bl-1',
    description: null,
    plannedAmount: 100,
    confidence: 'invoice',
    confidenceMargin: 0,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    invoiceLink: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    ...overrides,
  } as BaseBudgetLine;
}

function payback(min: number, max: number): SubsidyPaybackData {
  return {
    minTotalPayback: min,
    maxTotalPayback: max,
    subsidies: [{ subsidyProgramId: 'sp-1', name: 'Grant', minPayback: min, maxPayback: max }],
  };
}

function valueOf(label: string): HTMLElement {
  return screen.getByText(label).nextElementSibling as HTMLElement;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetCostOverview', () => {
  it('renders nothing when there are no budget lines', () => {
    const { container } = render(<BudgetCostOverview budgetLines={[]} subsidyPayback={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('VAT rate from LocaleContext', () => {
    it('grosses a net line up with the default rate (100 net -> 119.00)', () => {
      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ includesVat: false })]}
          subsidyPayback={null}
        />,
      );

      expect(valueOf('Planned Cost')).toHaveTextContent('€119.00');
      expect(valueOf('Expected Cost')).toHaveTextContent('€119.00');
    });

    it('passes the configured rate through: vatRate=0.2 grosses 100 net up to 120.00', () => {
      mockLocaleValue.vatRate = 0.2;

      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ includesVat: false })]}
          subsidyPayback={null}
        />,
      );

      expect(valueOf('Planned Cost')).toHaveTextContent('€120.00');
      expect(valueOf('Expected Cost')).toHaveTextContent('€120.00');
    });

    it('does not gross up a gross-stored line at any rate', () => {
      mockLocaleValue.vatRate = 0.2;

      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ includesVat: true })]}
          subsidyPayback={null}
        />,
      );

      expect(valueOf('Planned Cost')).toHaveTextContent('€100.00');
    });

    it('applies the confidence margin to the grossed-up amount (range 96.00 - 144.00 at 0.2)', () => {
      mockLocaleValue.vatRate = 0.2;

      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ includesVat: false, confidence: 'own_estimate' })]}
          subsidyPayback={null}
        />,
      );

      expect(valueOf('Planned Cost')).toHaveTextContent('€96.00 – €144.00');
      expect(valueOf('Expected Cost')).toHaveTextContent('€96.00 – €144.00');
    });
  });

  describe('subsidy payback', () => {
    it('shows the expected payback row and subtracts it from the planned range', () => {
      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ confidence: 'own_estimate' })]}
          subsidyPayback={payback(10, 20)}
        />,
      );

      // Planned 80 - 120; expected cost = min(80-10, 120-20) .. max(...) = 70 - 100
      expect(valueOf('Expected Cost')).toHaveTextContent('€70.00 – €100.00');
      const paybackValue = valueOf('overview.expectedPayback');
      expect(paybackValue).toHaveTextContent('€10.00 – €20.00');
      expect(paybackValue).toHaveAttribute(
        'aria-label',
        'Expected subsidy payback: €10.00 to €20.00',
      );
      expect(paybackValue).toHaveClass('budgetValuePayback');
    });

    it('uses a single-value aria-label when min and max payback are equal', () => {
      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ confidence: 'invoice' })]}
          subsidyPayback={payback(15, 15)}
        />,
      );

      expect(valueOf('overview.expectedPayback')).toHaveAttribute(
        'aria-label',
        'Expected subsidy payback: €15.00',
      );
    });

    it('collapses payback to the max value when all lines are invoiced', () => {
      render(
        <BudgetCostOverview
          budgetLines={[buildLine({ invoiceCount: 1, actualCost: 100 })]}
          subsidyPayback={payback(10, 20)}
        />,
      );

      expect(valueOf('overview.expectedPayback')).toHaveTextContent('€20.00');
      expect(valueOf('Expected Cost')).toHaveTextContent('€80.00');
      // Planned range is de-emphasised (muted) once costs are fully known
      expect(valueOf('Planned Cost')).toHaveClass('budgetValueMuted');
    });

    it('keeps the range when all invoiced lines are quotations', () => {
      render(
        <BudgetCostOverview
          budgetLines={[
            buildLine({
              invoiceCount: 1,
              actualCost: 100,
              invoiceLink: {
                invoiceBudgetLineId: 'ibl-1',
                invoiceId: 'inv-1',
                invoiceNumber: null,
                invoiceDate: '2026-01-01',
                invoiceStatus: 'quotation',
                itemizedAmount: 100,
                vendorId: null,
                vendorName: null,
              },
            }),
          ]}
          subsidyPayback={null}
        />,
      );

      expect(valueOf('Planned Cost')).toHaveTextContent('€95.00 – €105.00');
      expect(valueOf('Planned Cost')).toHaveClass('budgetValue');
    });

    it.each([
      ['null payback', null],
      ['no subsidies', { minTotalPayback: 0, maxTotalPayback: 0, subsidies: [] }],
      ['zero max payback', { ...payback(0, 0) }],
    ])('hides the payback row for %s', (_label, data) => {
      render(<BudgetCostOverview budgetLines={[buildLine()]} subsidyPayback={data} />);

      expect(screen.queryByText('overview.expectedPayback')).not.toBeInTheDocument();
      expect(valueOf('Expected Cost')).toHaveClass('budgetValue');
    });

    it('highlights the expected cost when a payback applies', () => {
      render(<BudgetCostOverview budgetLines={[buildLine()]} subsidyPayback={payback(5, 5)} />);

      expect(valueOf('Expected Cost')).toHaveClass('budgetValueHighlighted');
    });
  });

  describe('oversubscribed subsidies note', () => {
    it('renders a singular message for one oversubscribed subsidy', () => {
      render(
        <BudgetCostOverview
          budgetLines={[buildLine()]}
          subsidyPayback={null}
          oversubscribedSubsidyNames={['Grant A']}
        />,
      );

      expect(screen.getByText('Grant A is oversubscribed')).toBeInTheDocument();
    });

    it('renders a plural message listing all oversubscribed subsidies', () => {
      render(
        <BudgetCostOverview
          budgetLines={[buildLine()]}
          subsidyPayback={null}
          oversubscribedSubsidyNames={['Grant A', 'Grant B']}
        />,
      );

      expect(screen.getByText('Grant A, Grant B are oversubscribed')).toBeInTheDocument();
    });

    it('renders no note when the list is empty or omitted', () => {
      const { rerender } = render(
        <BudgetCostOverview
          budgetLines={[buildLine()]}
          subsidyPayback={null}
          oversubscribedSubsidyNames={[]}
        />,
      );
      expect(screen.queryByText(/oversubscribed/)).not.toBeInTheDocument();

      rerender(<BudgetCostOverview budgetLines={[buildLine()]} subsidyPayback={null} />);
      expect(screen.queryByText(/oversubscribed/)).not.toBeInTheDocument();
    });
  });
});
