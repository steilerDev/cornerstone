import type { MoneySourceFigures } from '@cornerstone/shared';
import type { BudgetBarSegment } from '../../components/BudgetBar/BudgetBar.js';

export interface FinancingBarLabels {
  readonly submitted: string;
  readonly paid: string;
  readonly allocated: string;
}

export interface FinancingBarModel {
  readonly segments: BudgetBarSegment[];
  readonly maxValue: number;
  /** Amount allocated beyond the source's amount, drawn as the striped overflow. */
  readonly overflow: number;
}

type BarFigures = Pick<
  MoneySourceFigures,
  'amount' | 'allocated' | 'paid' | 'submitted' | 'overAllocated'
>;

/**
 * Segments of a funding source's bar, drawn left to right: Submitted, Paid but not submitted,
 * Allocated but not paid. Submitted is a subset of Paid, so the segments are differences and are
 * capped cumulatively to the source's amount; anything beyond it is the overflow.
 */
export function financingBar(source: BarFigures, labels: FinancingBarLabels): FinancingBarModel {
  const { amount } = source;
  const submitted = Math.min(source.submitted, amount);
  const paidOnly = Math.min(Math.max(0, source.paid - source.submitted), amount - submitted);
  const allocatedOnly = Math.min(
    Math.max(0, source.allocated - source.paid),
    amount - submitted - paidOnly,
  );
  return {
    segments: [
      {
        key: 'submitted',
        value: submitted,
        color: 'var(--color-budget-claimed)',
        label: labels.submitted,
        totalValue: source.submitted,
      },
      {
        key: 'paid',
        value: paidOnly,
        color: 'var(--color-budget-paid)',
        label: labels.paid,
        totalValue: source.paid,
      },
      {
        key: 'allocated',
        value: allocatedOnly,
        color: 'var(--color-budget-allocated)',
        label: labels.allocated,
        totalValue: source.allocated,
      },
    ],
    maxValue: amount > 0 ? amount : 1,
    overflow: source.overAllocated,
  };
}
