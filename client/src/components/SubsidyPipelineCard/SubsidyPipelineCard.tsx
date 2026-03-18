import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import styles from './SubsidyPipelineCard.module.css';

interface SubsidyPipelineCardProps {
  subsidyPrograms: SubsidyProgram[];
}

interface StatusGroup {
  status: string;
  label: string;
  count: number;
  totalFixedReduction: number;
  hasUpcomingDeadline: boolean;
  badgeClass: string;
}

export function SubsidyPipelineCard({ subsidyPrograms }: SubsidyPipelineCardProps) {
  const { t } = useTranslation('dashboard');
  const { formatCurrency } = useFormatters();

  // Helper to check if deadline is within 14 days (inclusive) from today and >= 0 days in future
  const isUpcomingDeadline = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const [year, month, day] = deadline.split('-').map(Number);
    const deadlineDate = new Date(year, month - 1, day);
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilDeadline >= 0 && daysUntilDeadline <= 14;
  };

  // Build status groups in lifecycle order
  const lifecycleStatuses = ['eligible', 'applied', 'approved', 'received'];
  const statusGroups: StatusGroup[] = [];

  for (const status of lifecycleStatuses) {
    const programs = subsidyPrograms.filter((p) => p.applicationStatus === status);
    if (programs.length > 0) {
      const totalFixedReduction = programs
        .filter((p) => p.reductionType === 'fixed')
        .reduce((sum, p) => sum + p.reductionValue, 0);

      const hasUpcomingDeadline = programs.some((p) => isUpcomingDeadline(p.applicationDeadline));

      const badgeClassMap: Record<string, string> = {
        eligible: styles.badgeGray,
        applied: styles.badgeBlue,
        approved: styles.badgeGreen,
        received: styles.badgeGreen,
      };

      const labelMap: Record<string, string> = {
        eligible: t('cards.subsidyPipeline.statuses.eligible'),
        applied: t('cards.subsidyPipeline.statuses.applied'),
        approved: t('cards.subsidyPipeline.statuses.approved'),
        received: t('cards.subsidyPipeline.statuses.received'),
      };

      statusGroups.push({
        status,
        label: labelMap[status],
        count: programs.length,
        totalFixedReduction,
        hasUpcomingDeadline,
        badgeClass: badgeClassMap[status],
      });
    }
  }

  // Add rejected group if any
  const rejectedPrograms = subsidyPrograms.filter((p) => p.applicationStatus === 'rejected');
  if (rejectedPrograms.length > 0) {
    statusGroups.push({
      status: 'rejected',
      label: t('cards.subsidyPipeline.statuses.rejected'),
      count: rejectedPrograms.length,
      totalFixedReduction: 0,
      hasUpcomingDeadline: false,
      badgeClass: styles.badgeRed,
    });
  }

  // Empty state
  if (statusGroups.length === 0) {
    return (
      <p data-testid="subsidy-empty" className={styles.emptyState}>
        {t('cards.subsidyPipeline.noPrograms')}
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {statusGroups.map((group) => (
          <li key={group.status} data-testid="subsidy-group" className={styles.groupRow}>
            <span data-testid="status-badge" className={`${styles.badge} ${group.badgeClass}`}>
              {group.label}
            </span>
            <span data-testid="group-count" className={styles.groupCount}>
              {group.count}{' '}
              {t(`cards.subsidyPipeline.program_${group.count === 1 ? 'one' : 'other'}`)}
            </span>
            {group.totalFixedReduction > 0 && (
              <span data-testid="group-reduction" className={styles.groupReduction}>
                {formatCurrency(group.totalFixedReduction)}
              </span>
            )}
            {group.hasUpcomingDeadline && (
              <span data-testid="deadline-warning" className={styles.deadlineWarning}>
                {t('cards.subsidyPipeline.deadlineSoon')}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className={styles.footer}>
        <Link to="/budget/subsidies" className={styles.link}>
          {t('cards.subsidyPipeline.viewAllSubsidies')}
        </Link>
      </div>
    </>
  );
}
