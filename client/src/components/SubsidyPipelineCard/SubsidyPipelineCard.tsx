import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { Badge, type BadgeVariantMap } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import styles from './SubsidyPipelineCard.module.css';

interface SubsidyPipelineCardProps {
  subsidyPrograms: SubsidyProgram[];
}

interface StatusGroup {
  status: string;
  count: number;
  totalFixedReduction: number;
  hasUpcomingDeadline: boolean;
}

export function SubsidyPipelineCard({ subsidyPrograms }: SubsidyPipelineCardProps) {
  const { t } = useTranslation('dashboard');
  const { formatCurrency } = useFormatters();

  const statusBadgeVariants = useMemo(
    (): BadgeVariantMap => ({
      eligible: {
        label: t('cards.subsidyPipeline.statuses.eligible'),
        className: badgeStyles.subsidyEligible!,
      },
      applied: {
        label: t('cards.subsidyPipeline.statuses.applied'),
        className: badgeStyles.subsidyApplied!,
      },
      approved: {
        label: t('cards.subsidyPipeline.statuses.approved'),
        className: badgeStyles.subsidyApproved!,
      },
      received: {
        label: t('cards.subsidyPipeline.statuses.received'),
        className: badgeStyles.subsidyApproved!,
      },
      rejected: {
        label: t('cards.subsidyPipeline.statuses.rejected'),
        className: badgeStyles.subsidyRejected!,
      },
    }),
    [t],
  );

  // Helper to check if deadline is within 14 days (inclusive) from today and >= 0 days in future
  const isUpcomingDeadline = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const [year, month, day] = deadline.split('-').map(Number);
    // year, month, day are parsed from deadline string (guaranteed to be valid numeric parts)
    const deadlineDate = new Date(year!, month! - 1, day!);
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

      statusGroups.push({
        status,
        count: programs.length,
        totalFixedReduction,
        hasUpcomingDeadline,
      });
    }
  }

  // Add rejected group if any
  const rejectedPrograms = subsidyPrograms.filter((p) => p.applicationStatus === 'rejected');
  if (rejectedPrograms.length > 0) {
    statusGroups.push({
      status: 'rejected',
      count: rejectedPrograms.length,
      totalFixedReduction: 0,
      hasUpcomingDeadline: false,
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
            <Badge testId="status-badge" variants={statusBadgeVariants} value={group.status} />
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
