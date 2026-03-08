import type { BaseBudgetLine } from '@cornerstone/shared';
import { computeBudgetTotals } from '../../lib/budgetConstants.js';
import { formatCurrency } from '../../lib/formatters.js';
import styles from './BudgetCostOverview.module.css';

export interface SubsidyPaybackData {
  minTotalPayback: number;
  maxTotalPayback: number;
  subsidies: Array<{
    subsidyProgramId: string;
    name: string;
    minPayback: number;
    maxPayback: number;
  }>;
}

export interface BudgetCostOverviewProps {
  budgetLines: BaseBudgetLine[];
  subsidyPayback: SubsidyPaybackData | null;
}

function formatRange(min: number, max: number): string {
  if (Math.abs(max - min) < 0.01) return formatCurrency(min);
  return `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

export function BudgetCostOverview({ budgetLines, subsidyPayback }: BudgetCostOverviewProps) {
  if (budgetLines.length === 0) return null;

  const { totalPlanned, totalMinPlanned, totalMaxPlanned, hasPlannedRange, allInvoiced } =
    computeBudgetTotals(budgetLines);

  const hasSubsidyPayback =
    subsidyPayback !== null &&
    subsidyPayback.subsidies.length > 0 &&
    subsidyPayback.maxTotalPayback > 0;

  // Expected Cost: when subsidies exist, cross-subtract for correct bounds
  // expectedCostMin = minPlanned - maxPayback, expectedCostMax = maxPlanned - minPayback
  const expectedCostMin = hasSubsidyPayback
    ? totalMinPlanned - subsidyPayback!.maxTotalPayback
    : totalMinPlanned;
  const expectedCostMax = hasSubsidyPayback
    ? totalMaxPlanned - subsidyPayback!.minTotalPayback
    : totalMaxPlanned;

  return (
    <div className={styles.budgetSummary}>
      <div className={styles.summaryRows}>
        {/* Expected Cost — always shown as primary value */}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Expected Cost</span>
          <span
            className={
              hasSubsidyPayback ? styles.budgetValueHighlighted : styles.budgetValue
            }
          >
            {formatRange(expectedCostMin, expectedCostMax)}
          </span>
        </div>

        {/* Planned Range — always shown; struck-through only when ALL lines are invoiced */}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Planned Range</span>
          <span className={allInvoiced ? styles.budgetValueMuted : styles.budgetValue}>
            {hasPlannedRange
              ? `${formatCurrency(totalMinPlanned)} – ${formatCurrency(totalMaxPlanned)}`
              : formatCurrency(totalPlanned)}
          </span>
        </div>

        {/* Expected Payback — shown below planned range when subsidies apply */}
        {hasSubsidyPayback && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Expected Payback</span>
            <span
              className={styles.budgetValuePayback}
              aria-live="polite"
              aria-atomic="true"
              aria-label={
                subsidyPayback!.minTotalPayback === subsidyPayback!.maxTotalPayback
                  ? `Expected subsidy payback: ${formatCurrency(subsidyPayback!.minTotalPayback)}`
                  : `Expected subsidy payback: ${formatCurrency(subsidyPayback!.minTotalPayback)} to ${formatCurrency(subsidyPayback!.maxTotalPayback)}`
              }
            >
              {formatRange(subsidyPayback!.minTotalPayback, subsidyPayback!.maxTotalPayback)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
