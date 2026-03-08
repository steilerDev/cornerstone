import type { BaseBudgetLine } from '@cornerstone/shared';
import { computeBudgetTotals, type BudgetTotals } from '../../lib/budgetConstants.js';
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

  const { totalPlanned, totalActualCost, totalMinPlanned, totalMaxPlanned, hasPlannedRange } =
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
    <>
      <div className={styles.budgetSummary}>
        <div className={styles.propertyGrid}>
          {/* Expected Cost — always shown as primary value */}
          <div className={styles.property}>
            <span className={styles.propertyLabel}>Expected Cost</span>
            <span
              className={
                hasSubsidyPayback ? styles.budgetValueHighlighted : styles.budgetValue
              }
            >
              {formatRange(expectedCostMin, expectedCostMax)}
            </span>
          </div>

          {/* Planned Range — shown when subsidies exist (so user sees pre-payback range) */}
          {hasSubsidyPayback && (
            <div className={styles.property}>
              <span className={styles.propertyLabel}>Planned Range</span>
              <span className={styles.budgetValueMuted}>
                {hasPlannedRange
                  ? `${formatCurrency(totalMinPlanned)} – ${formatCurrency(totalMaxPlanned)}`
                  : formatCurrency(totalPlanned)}
              </span>
            </div>
          )}

          {/* Total Actual Cost — shown when any invoices exist */}
          {totalActualCost > 0 && (
            <div className={styles.property}>
              <span className={styles.propertyLabel}>Total Actual Cost</span>
              <span className={styles.budgetValue}>{formatCurrency(totalActualCost)}</span>
            </div>
          )}

          <div className={styles.property}>
            <span className={styles.propertyLabel}>Lines</span>
            <span className={styles.budgetValue}>{budgetLines.length}</span>
          </div>
        </div>
      </div>

      {/* Expected Subsidy Payback — shown when non-rejected subsidies are linked */}
      {subsidyPayback !== null && subsidyPayback.subsidies.length > 0 && (
        <div
          className={`${styles.subsidyPaybackRow} ${subsidyPayback.maxTotalPayback > 0 ? styles.subsidyPaybackRowActive : styles.subsidyPaybackRowZero}`}
        >
          <span className={styles.subsidyPaybackLabel}>Expected Payback</span>
          <span
            className={styles.subsidyPaybackAmount}
            aria-live="polite"
            aria-atomic="true"
            aria-label={
              subsidyPayback.minTotalPayback === subsidyPayback.maxTotalPayback
                ? `Expected subsidy payback: ${formatCurrency(subsidyPayback.minTotalPayback)}`
                : `Expected subsidy payback: ${formatCurrency(subsidyPayback.minTotalPayback)} to ${formatCurrency(subsidyPayback.maxTotalPayback)}`
            }
          >
            {formatRange(subsidyPayback.minTotalPayback, subsidyPayback.maxTotalPayback)}
          </span>
          {subsidyPayback.subsidies.length > 0 && (
            <div className={styles.subsidyPaybackChips} aria-label="Per-subsidy breakdown">
              {subsidyPayback.subsidies.map((entry) => (
                <span
                  key={entry.subsidyProgramId}
                  className={styles.subsidyPaybackChip}
                  aria-label={
                    entry.minPayback === entry.maxPayback
                      ? `${entry.name}: ${formatCurrency(entry.minPayback)}`
                      : `${entry.name}: ${formatCurrency(entry.minPayback)} to ${formatCurrency(entry.maxPayback)}`
                  }
                >
                  {entry.name}: {formatRange(entry.minPayback, entry.maxPayback)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
