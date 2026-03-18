import type { BaseBudgetLine } from '@cornerstone/shared';
import { computeBudgetTotals } from '../../lib/budgetConstants.js';
import { useFormatters } from '../../lib/formatters.js';
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

function formatRange(min: number, max: number, fc: (n: number) => string): string {
  if (Math.abs(max - min) < 0.01) return fc(min);
  return `${fc(min)} – ${fc(max)}`;
}

export function BudgetCostOverview({ budgetLines, subsidyPayback }: BudgetCostOverviewProps) {
  const { formatCurrency } = useFormatters();
  if (budgetLines.length === 0) return null;

  const { totalPlanned, totalMinPlanned, totalMaxPlanned, hasPlannedRange, allInvoiced } =
    computeBudgetTotals(budgetLines);

  const hasSubsidyPayback =
    subsidyPayback !== null &&
    subsidyPayback.subsidies.length > 0 &&
    subsidyPayback.maxTotalPayback > 0;

  // When all budget lines are invoiced, costs are known — collapse to single values.
  // The server-side payback should already return equal min/max when all lines are invoiced,
  // but we force collapse here for a definitive single-number display.
  const effectivePaybackMin =
    allInvoiced && hasSubsidyPayback
      ? subsidyPayback!.maxTotalPayback
      : hasSubsidyPayback
        ? subsidyPayback!.minTotalPayback
        : 0;
  const effectivePaybackMax = hasSubsidyPayback ? subsidyPayback!.maxTotalPayback : 0;

  // Expected Cost = Planned Range - Expected Payback (straight subtraction)
  const rawExpectedCostA = totalMinPlanned - effectivePaybackMin;
  const rawExpectedCostB = totalMaxPlanned - effectivePaybackMax;
  const expectedCostMin = Math.min(rawExpectedCostA, rawExpectedCostB);
  const expectedCostMax = Math.max(rawExpectedCostA, rawExpectedCostB);

  return (
    <div className={styles.budgetSummary}>
      <div className={styles.summaryRows}>
        {/* Expected Cost — always shown as primary value */}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Expected Cost</span>
          <span className={hasSubsidyPayback ? styles.budgetValueHighlighted : styles.budgetValue}>
            {formatRange(expectedCostMin, expectedCostMax, formatCurrency)}
          </span>
        </div>

        {/* Planned Range — always shown; struck-through only when ALL lines are invoiced */}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Planned Cost</span>
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
                effectivePaybackMin === effectivePaybackMax
                  ? `Expected subsidy payback: ${formatCurrency(effectivePaybackMin)}`
                  : `Expected subsidy payback: ${formatCurrency(effectivePaybackMin)} to ${formatCurrency(effectivePaybackMax)}`
              }
            >
              {formatRange(effectivePaybackMin, effectivePaybackMax, formatCurrency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
