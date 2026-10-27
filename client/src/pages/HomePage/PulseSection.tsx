import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HomePulseResponse } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { StatTile } from '../../components/StatTile/StatTile.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { getHomePulse } from '../../lib/homeApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { SectionError } from './SectionError.js';
import styles from './HomePage.module.css';

/** Pulse: three figures, each the money service's or the Tasks list's own number. */
export function PulseSection() {
  const { t } = useTranslation('home');
  const pulse = useLoadOnce(getHomePulse);
  const loading = pulse.status === 'loading';

  return (
    <FeedGroup
      heading={t(I18N_UNION_KEYS.homeSection.key('pulse'))}
      list={false}
      busy={loading}
      testId="home-pulse"
    >
      {loading ? (
        <div className={styles.tiles} data-testid="home-pulse-loading">
          <Skeleton lines={3} />
          <Skeleton lines={3} />
          <Skeleton lines={3} />
        </div>
      ) : null}
      {pulse.status === 'error' ? (
        <SectionError section="pulse" onRetry={pulse.reload} testId="home-pulse-error" />
      ) : null}
      {pulse.data ? <PulseTiles data={pulse.data} /> : null}
    </FeedGroup>
  );
}

function PulseTiles({ data }: { data: HomePulseResponse }) {
  const { t } = useTranslation('home');
  const { formatCurrency, formatSignedCurrency } = useFormatters();
  const { budgetVerdict } = useStatusBadgeVariants();
  const originState = useOriginState();
  const { leftToSpend, stillToPay, stillToPayCount, progress } = data;
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <ul className={styles.tiles}>
      {leftToSpend.verdict === null ? (
        <StatTile
          as="li"
          label={t('pulse.leftToSpend.label')}
          figureKind="left-to-spend"
          figure={'–'}
          figureLabel={t('pulse.leftToSpend.noFigure')}
          detail={t('pulse.leftToSpend.needsSetup')}
          to={routeUrl('financing')}
          state={originState}
          testId="home-pulse-left-to-spend"
        />
      ) : (
        <StatTile
          as="li"
          label={t('pulse.leftToSpend.label')}
          figureKind="left-to-spend"
          figure={formatCurrency(leftToSpend.expected)}
          detail={
            <span className={styles.tileDetail}>
              <Badge variants={budgetVerdict} value={leftToSpend.verdict} />
              <span>
                {t('pulse.range', {
                  from: formatSignedCurrency(leftToSpend.worst),
                  to: formatSignedCurrency(leftToSpend.best),
                })}
              </span>
            </span>
          }
          to={routeUrl('budgetOverview')}
          state={originState}
          testId="home-pulse-left-to-spend"
        />
      )}
      <StatTile
        as="li"
        label={t('pulse.stillToPay.label')}
        figureKind="still-to-pay"
        figure={formatCurrency(stillToPay)}
        detail={t('pulse.stillToPay.count', { count: stillToPayCount })}
        to={routeUrl('invoices')}
        state={originState}
        testId="home-pulse-still-to-pay"
      />
      <StatTile
        as="li"
        label={t('pulse.progress.label')}
        figure={t('pulse.progress.figure', { done: progress.done, total: progress.total })}
        figureSize="medium"
        detail={
          <span className={styles.tileDetail}>
            <span>{t('pulse.progress.inProgress', { count: progress.inProgress })}</span>
            <span aria-hidden="true" className={styles.bar}>
              <span className={styles.barFill} style={{ width: `${percent}%` }} />
            </span>
          </span>
        }
        to={routeUrl('workItems')}
        state={originState}
        testId="home-pulse-progress"
      />
    </ul>
  );
}
