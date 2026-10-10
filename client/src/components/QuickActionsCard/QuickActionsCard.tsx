import { routeUrl } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useOriginState } from '../../navigation/useOriginState.js';
import styles from './QuickActionsCard.module.css';

/**
 * Quick actions card for the dashboard.
 * Provides prominent "New Work Item" button and quick navigation links
 * to common sections of the application.
 */
export function QuickActionsCard() {
  const { t } = useTranslation('dashboard');
  const originState = useOriginState();

  return (
    <div className={styles.container}>
      {/* Primary action: New Work Item */}
      <Link to={routeUrl('workItemNew')} state={originState} className={styles.primaryAction}>
        {t('cards.quickActions.newWorkItem')}
      </Link>

      {/* Quick navigation links grid */}
      <div className={styles.linksGrid}>
        <Link
          to={routeUrl('workItems')}
          className={styles.quickLink}
          aria-label={t('cards.quickActions.workItems')}
        >
          {t('cards.quickActions.workItems')}
        </Link>
        <Link
          to={routeUrl('schedule')}
          className={styles.quickLink}
          aria-label={t('cards.quickActions.timeline')}
        >
          {t('cards.quickActions.timeline')}
        </Link>
        <Link
          to={routeUrl('budgetOverview')}
          className={styles.quickLink}
          aria-label={t('cards.quickActions.budget')}
        >
          {t('cards.quickActions.budget')}
        </Link>
        <Link
          to={routeUrl('invoices')}
          className={styles.quickLink}
          aria-label={t('cards.quickActions.invoices')}
        >
          {t('cards.quickActions.invoices')}
        </Link>
        <Link
          to={routeUrl('vendors')}
          className={styles.quickLink}
          aria-label={t('cards.quickActions.vendors')}
        >
          {t('cards.quickActions.vendors')}
        </Link>
      </div>
    </div>
  );
}

export default QuickActionsCard;
