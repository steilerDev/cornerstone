import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type { FinancingSource } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { BudgetBar } from '../../components/BudgetBar/BudgetBar.js';
import { DocumentsPanelButton } from '../../components/DocumentsPanel/index.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { financingBar } from './financingBar.js';
import styles from './FinancingPage.module.css';

export interface FinancingSourceCardProps {
  readonly source: FinancingSource;
  readonly originState: OriginState;
}

/** A loan or credit line draws down against invoices; savings and Own funds do not. */
function isLoanType(source: FinancingSource): boolean {
  return source.sourceType === 'bank_loan' || source.sourceType === 'credit_line';
}

/**
 * One loan or own-funds card of the Financing page: type and status, the five figures, the
 * allocation bar and, for loans, what is ready to submit. Figures come from the money service.
 */
export function FinancingSourceCard({ source, originState }: FinancingSourceCardProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatSignedCurrency, formatPercent } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const userText = useUserText();
  const navigate = useNavigate();

  const loan = isLoanType(source);
  const over = source.overAllocated > 0;
  const bar = financingBar(source, {
    submitted: t('financing.figures.submitted'),
    paid: t('financing.figures.paid'),
    allocated: t('financing.figures.allocated'),
  });
  const typeLabel = t(I18N_UNION_KEYS.fundingSourceType.key(source.sourceType));
  const { id } = source;

  return (
    <article className={styles.card} data-testid={`financing-source-${id}`}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardName}>
          <NavAnchor
            {...userText(styles.cardLink)}
            to={routeUrl('fundingSource', { id })}
            state={originState}
          >
            {source.name}
          </NavAnchor>
        </h3>
        {loan && (
          <OverflowMenu
            triggerAriaLabel={t('financing.cardActions', { name: source.name })}
            data-testid={`financing-source-menu-${id}`}
            items={[
              {
                id: 'bank-report',
                label: t('financing.actions.prepareBankReport'),
                onClick: () =>
                  void navigate(routeUrl('bankReport', undefined, { sourceId: id }), {
                    state: originState,
                  }),
                testId: `financing-source-bank-report-${id}`,
              },
            ]}
          />
        )}
      </header>
      <div className={styles.badges}>
        <Badge
          variants={{ type: { label: typeLabel, className: badgeStyles.neutral } }}
          value="type"
        />
        <Badge variants={statusVariants.fundingSource} value={source.status} />
        {source.interestRate !== null && !source.isDiscretionary && (
          <span className={styles.muted}>
            {t('financing.rateValue', { rate: formatRate(source.interestRate, formatPercent) })}
          </span>
        )}
      </div>

      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>{t('financing.figures.amount')}</dt>
          <dd>{formatCurrency(source.amount)}</dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.figures.allocated')}</dt>
          <dd>{formatCurrency(source.allocated)}</dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.figures.paid')}</dt>
          <dd>
            <span data-figure="paid">{formatCurrency(source.paid)}</span>
          </dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.figures.submitted')}</dt>
          <dd>{formatCurrency(source.submitted)}</dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.figures.unallocated')}</dt>
          <dd
            className={over ? styles.danger : undefined}
            data-testid={`financing-source-unallocated-${id}`}
          >
            {over
              ? formatSignedCurrency(-source.overAllocated)
              : formatCurrency(source.unallocated)}
          </dd>
        </div>
      </dl>

      <BudgetBar
        segments={bar.segments}
        maxValue={bar.maxValue}
        overflow={bar.overflow}
        overflowNote={
          over
            ? t('financing.overAllocatedBy', { amount: formatCurrency(source.overAllocated) })
            : undefined
        }
        height="sm"
        formatValue={formatCurrency}
      />

      <footer className={styles.cardFooter}>
        {loan && (
          <p
            className={
              source.readyToSubmit.count === 0 ? `${styles.ready} ${styles.muted}` : styles.ready
            }
          >
            <span>{t('financing.readyToSubmit')}</span>{' '}
            <span data-testid={`financing-source-ready-count-${id}`}>
              {source.readyToSubmit.count}
            </span>
            <span aria-hidden="true"> · </span>
            <span data-figure="ready-to-submit">{formatCurrency(source.readyToSubmit.amount)}</span>
          </p>
        )}
        <DocumentsPanelButton
          entityType="budget_source"
          entityId={id}
          contextName={source.name}
          linkAction
          testId={`financing-source-docs-${id}`}
        />
      </footer>
    </article>
  );
}

export default FinancingSourceCard;
