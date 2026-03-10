import type { BudgetSource, BudgetSourceType } from '@cornerstone/shared';
import { BudgetBar } from '../BudgetBar/BudgetBar.js';
import { formatCurrency } from '../../lib/formatters.js';
import styles from './SourceUtilizationCard.module.css';

interface SourceUtilizationCardProps {
  sources: BudgetSource[];
}

const SOURCE_TYPE_LABELS: Record<BudgetSourceType, string> = {
  bank_loan: 'Bank Loan',
  credit_line: 'Credit Line',
  savings: 'Savings',
  other: 'Other',
};

export function SourceUtilizationCard({ sources }: SourceUtilizationCardProps) {
  // Sort: high utilization (>= 90% or exhausted) first, then by utilization descending
  const sortedSources = [...sources].sort((a, b) => {
    const utilA = a.totalAmount > 0 ? a.usedAmount / a.totalAmount : 0;
    const utilB = b.totalAmount > 0 ? b.usedAmount / b.totalAmount : 0;

    const isHighUtilA = utilA >= 0.9 || a.status === 'exhausted';
    const isHighUtilB = utilB >= 0.9 || b.status === 'exhausted';

    if (isHighUtilA && !isHighUtilB) return -1;
    if (!isHighUtilA && isHighUtilB) return 1;

    return utilB - utilA;
  });

  return (
    <div className={styles.list}>
      {sortedSources.map((source) => {
        const maxValue = source.totalAmount > 0 ? source.totalAmount : 1;

        return (
          <div key={source.id} data-testid="source-row" className={styles.sourceRow}>
            <div className={styles.sourceHeader}>
              <span className={styles.sourceName}>{source.name}</span>
              <span
                className={`${styles.typeBadge} ${styles[`type${getTypeClass(source.sourceType)}`]}`}
              >
                {SOURCE_TYPE_LABELS[source.sourceType]}
              </span>
            </div>

            <BudgetBar
              segments={[
                {
                  key: 'used',
                  value: source.usedAmount,
                  color: 'var(--color-primary)',
                  label: 'Used',
                },
              ]}
              maxValue={maxValue}
              height="sm"
              formatValue={formatCurrency}
            />

            <span className={styles.srOnly}>
              {source.totalAmount > 0
                ? `${((source.usedAmount / source.totalAmount) * 100).toFixed(0)}% utilized`
                : '0% utilized'}
            </span>

            <div className={styles.amounts}>
              <span data-testid="source-used">{formatCurrency(source.usedAmount)}</span>
              <span>/</span>
              <span data-testid="source-total">{formatCurrency(source.totalAmount)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getTypeClass(sourceType: BudgetSourceType): string {
  const classMap: Record<BudgetSourceType, string> = {
    bank_loan: 'BankLoan',
    credit_line: 'CreditLine',
    savings: 'Savings',
    other: 'Other',
  };
  return classMap[sourceType];
}
