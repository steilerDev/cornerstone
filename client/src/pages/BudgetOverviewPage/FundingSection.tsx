import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { MoneySourceFigures } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { BudgetBar } from '../../components/BudgetBar/BudgetBar.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import styles from './BudgetOverviewPage.module.css';

export interface FundingSectionProps {
  readonly sources: readonly MoneySourceFigures[];
}

/** One row per funding source: how much of it the cost lines use. Rows are not links. */
export function FundingSection({ sources }: FundingSectionProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const userText = useUserText();
  const originState = useOriginState();
  const headingId = useId();

  return (
    <section className={styles.funding} aria-labelledby={headingId} data-testid="money-funding">
      <div className={styles.fundingHeader}>
        <h2 id={headingId} className={styles.sectionHeading}>
          {t('overview.funding.heading')}
        </h2>
        <NavAnchor
          to={routeUrl('financing')}
          state={originState}
          className={styles.fundingManage}
          data-testid="money-funding-manage"
        >
          {t('overview.funding.manage')} <span aria-hidden="true">›</span>
        </NavAnchor>
      </div>
      {sources.length === 0 ? (
        <EmptyState
          message={t('overview.funding.empty')}
          action={{
            label: t('overview.funding.emptyAction'),
            href: routeUrl('financing'),
            state: originState,
          }}
        />
      ) : (
        <ul className={styles.fundingList}>
          {sources.map((source) => (
            <li
              key={source.id}
              className={styles.fundingRow}
              data-testid={`money-funding-row-${source.id}`}
            >
              <div className={styles.fundingLine}>
                <span {...userText(styles.fundingName)}>{source.name}</span>
                <span className={styles.fundingAmounts}>
                  <span className={styles.fundingLabel}>
                    {t('overview.funding.allocatedLabel')}
                  </span>{' '}
                  <span>
                    {t('overview.funding.amountOf', {
                      allocated: formatCurrency(source.allocated),
                      amount: formatCurrency(source.amount),
                    })}
                  </span>
                </span>
              </div>
              <BudgetBar
                segments={[
                  {
                    key: 'allocated',
                    value: Math.min(source.allocated, source.amount),
                    color: 'var(--color-budget-allocated)',
                    label: t('overview.funding.allocatedLabel'),
                  },
                ]}
                maxValue={source.amount}
                overflow={source.overAllocated}
                overflowNote={
                  source.overAllocated > 0
                    ? t('overview.funding.overAllocated', {
                        amount: formatCurrency(source.overAllocated),
                      })
                    : undefined
                }
                height="sm"
                formatValue={formatCurrency}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
