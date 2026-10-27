import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { FinancingGrant } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { DocumentsPanelButton } from '../../components/DocumentsPanel/index.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './FinancingPage.module.css';

export interface FinancingGrantCardProps {
  readonly grant: FinancingGrant;
  readonly originState: OriginState;
}

/**
 * One grant card of the Financing page: status, rate, the cap, what is expected, the covered
 * items and the deadline. A grant has no allocation bar and nothing to submit.
 */
export function FinancingGrantCard({ grant, originState }: FinancingGrantCardProps) {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const userText = useUserText();
  // Today is read once, when the card mounts (not on every render).
  const [today] = useState(() => todayLocalIsoDate());

  const { id } = grant;
  const fixed = grant.reductionType === 'fixed';
  const rateText = fixed ? formatCurrency(grant.rate) : formatRate(grant.rate, formatPercent);
  const overdue =
    grant.deadline !== null &&
    grant.deadline < today &&
    grant.status !== 'received' &&
    grant.status !== 'rejected';

  return (
    <article className={styles.card} data-testid={`financing-grant-${id}`}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardName}>
          <NavAnchor
            {...userText(styles.cardLink)}
            to={routeUrl('grant', { id })}
            state={originState}
          >
            {grant.name}
          </NavAnchor>
        </h3>
      </header>
      <div className={styles.badges}>
        <Badge variants={statusVariants.grant} value={grant.status} />
        {fixed && (
          <span className={sharedStyles.srOnly}>{t('financing.grant.fixedReductionField')} </span>
        )}
        <Badge
          variants={{ rate: { label: rateText, className: badgeStyles.neutral } }}
          value="rate"
          testId={`financing-grant-rate-${id}`}
        />
      </div>

      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>{t('financing.grant.cap')}</dt>
          <dd>
            {grant.eligibleCostCap === null
              ? t('financing.grant.noCap')
              : formatCurrency(grant.eligibleCostCap)}
          </dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.grant.expected')}</dt>
          <dd className={styles.strong} data-testid={`financing-grant-expected-${id}`}>
            {formatCurrency(grant.expected.expected)}
          </dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.grant.covered')}</dt>
          <dd>
            <NavAnchor
              to={routeUrl('grant', { id }, { tab: 'work' })}
              state={originState}
              data-testid={`financing-grant-covered-${id}`}
            >
              {t('financing.grant.coveredCount', { count: grant.coveredItemCount })}
            </NavAnchor>
          </dd>
        </div>
        <div className={styles.figure}>
          <dt>{t('financing.grant.deadline')}</dt>
          <dd data-testid={`financing-grant-deadline-${id}`}>
            {grant.deadline === null ? (
              <>
                <span aria-hidden="true">–</span>
                <span className={sharedStyles.srOnly}>{tCommon('summaryStrip.notSet')}</span>
              </>
            ) : (
              formatDate(grant.deadline)
            )}
            {overdue && (
              <>
                {' '}
                <span className={styles.danger}>{t('financing.grant.overdue')}</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <footer className={styles.cardFooter}>
        <DocumentsPanelButton
          entityType="subsidy_program"
          entityId={id}
          contextName={grant.name}
          linkAction
          testId={`financing-grant-docs-${id}`}
        />
      </footer>
    </article>
  );
}

export default FinancingGrantCard;
