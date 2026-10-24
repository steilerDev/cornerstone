import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
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
  oversubscribedSubsidyNames?: string[];
}

function formatRange(min: number, max: number, fc: (n: number) => string): string {
  if (Math.abs(max - min) < 0.01) return fc(min);
  return `${fc(min)} – ${fc(max)}`;
}

export function BudgetCostOverview({
  budgetLines,
  subsidyPayback,
  oversubscribedSubsidyNames,
}: BudgetCostOverviewProps) {
  const { t } = useTranslation('budget');
  const { t: tCost } = useTranslation('costLines');
  const { vatRate } = useLocale();
  const { formatCurrency } = useFormatters();
  if (budgetLines.length === 0) return null;

  const { totalPlanned, totalMinPlanned, totalMaxPlanned, hasPlannedRange, allInvoiced } =
    computeBudgetTotals(budgetLines, vatRate);

  // Linked lines count at face value (ADR-039): costs are known once every line is linked.
  const costsKnown = allInvoiced;

  const hasSubsidyPayback =
    subsidyPayback !== null &&
    subsidyPayback.subsidies.length > 0 &&
    subsidyPayback.maxTotalPayback > 0;

  // When every budget line is linked, costs are known — collapse to single values.
  // The server-side payback should already return equal min/max when all lines are invoiced,
  // but we force collapse here for a definitive single-number display.
  const effectivePaybackMin =
    costsKnown && hasSubsidyPayback
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
        {/* First row: the cost after grants when grants apply, else the expected cost */}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>
            {hasSubsidyPayback ? tCost('overview.afterGrants') : tCost('overview.expectedCost')}
          </span>
          <span className={hasSubsidyPayback ? styles.budgetValueHighlighted : styles.budgetValue}>
            {formatRange(expectedCostMin, expectedCostMax, formatCurrency)}
          </span>
        </div>

        {/* Planned Range — always shown; struck-through only when ALL lines are invoiced */}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{tCost('overview.plannedCost')}</span>
          <span className={costsKnown ? styles.budgetValueMuted : styles.budgetValue}>
            {hasPlannedRange
              ? `${formatCurrency(totalMinPlanned)} – ${formatCurrency(totalMaxPlanned)}`
              : formatCurrency(totalPlanned)}
          </span>
        </div>

        {/* Expected Payback — shown below planned range when subsidies apply */}
        {hasSubsidyPayback && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t('overview.expectedPayback')}</span>
            <span
              className={styles.budgetValuePayback}
              aria-live="polite"
              aria-atomic="true"
              aria-label={
                effectivePaybackMin === effectivePaybackMax
                  ? tCost('overview.payback', { amount: formatCurrency(effectivePaybackMin) })
                  : tCost('overview.paybackRange', {
                      min: formatCurrency(effectivePaybackMin),
                      max: formatCurrency(effectivePaybackMax),
                    })
              }
            >
              {formatRange(effectivePaybackMin, effectivePaybackMax, formatCurrency)}
            </span>
          </div>
        )}

        {oversubscribedSubsidyNames && oversubscribedSubsidyNames.length > 0 && (
          <div className={styles.oversubscribedNote}>
            <span className={styles.oversubscribedIcon}>&#9888;</span>
            <span>
              {tCost('overview.oversubscribed', {
                count: oversubscribedSubsidyNames.length,
                names: oversubscribedSubsidyNames.join(', '),
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
