import { useTranslation } from 'react-i18next';
import type { MilestoneDetail } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type { ObjectTabId } from '../../components/ObjectTabs/objectTabIds.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { milestoneBadgeProps, milestoneDisplayStatus } from '../../lib/milestoneStatusLabel.js';
import styles from './MilestoneDetailPage.module.css';

export interface UseMilestoneSummaryFactsOptions {
  readonly milestone: MilestoneDetail;
  readonly tabs: ObjectTabsController;
}

/** The strip of the milestone page: Target, Projected (Reached), Against target, Counts toward. */
export function useMilestoneSummaryFacts({
  milestone,
  tabs,
}: UseMilestoneSummaryFactsOptions): SummaryFact[] {
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();

  const tabFact = (
    id: string,
    tab: ObjectTabId,
    label: string,
    value: SummaryFact['value'],
    emptyText?: string,
  ): SummaryFact => ({
    id,
    kind: 'tab',
    href: tabs.hrefFor(tab),
    onActivate: () => tabs.select(tab, { focusPanel: true }),
    label,
    value,
    ...(emptyText ? { emptyText } : {}),
  });

  const { isCompleted, completedAt, targetDate, projectedDate, workItems } = milestone;
  const facts: SummaryFact[] = [];

  facts.push(
    tabFact('target', 'overview', t('milestones.detail.strip.target'), formatDate(targetDate)),
  );

  if (isCompleted && completedAt !== null) {
    facts.push(
      tabFact(
        'projected',
        'overview',
        t('milestones.detail.strip.reached'),
        formatDate(completedAt.slice(0, 10)),
      ),
    );
  } else {
    facts.push(
      tabFact(
        'projected',
        'work',
        t('milestones.detail.strip.projected'),
        projectedDate ? formatDate(projectedDate) : null,
        workItems.length === 0
          ? t('milestones.detail.strip.noTasksYet')
          : t('milestones.detail.strip.noDatesYet'),
      ),
    );
  }

  const badge = milestoneBadgeProps(statusVariants.milestone, tc, {
    isCompleted,
    targetDate,
    projectedDate,
  });
  // "On target" claims a projection: without one the helper's own word (Upcoming) stays.
  if (
    projectedDate !== null &&
    milestoneDisplayStatus({ isCompleted, targetDate, projectedDate }).status === 'upcoming'
  ) {
    badge.variants = {
      ...badge.variants,
      upcoming: {
        ...badge.variants.upcoming!,
        label: t('milestones.detail.strip.onTarget'),
      },
    };
  }
  facts.push(
    tabFact(
      'againstTarget',
      'work',
      t('milestones.detail.strip.againstTarget'),
      <Badge testId="milestone-against-target" {...badge} />,
    ),
  );

  const total = workItems.length;
  const open = workItems.filter((item) => item.status !== 'completed').length;
  facts.push(
    tabFact(
      'countsToward',
      'work',
      t('milestones.detail.strip.countsToward'),
      total === 0 ? null : (
        <>
          {t('milestones.detail.strip.tasks', { count: total })}
          <span className={styles.remark}>
            {' · '}
            {t('milestones.detail.strip.open', { count: open })}
          </span>
        </>
      ),
      t('milestones.detail.strip.noneYet'),
    ),
  );

  return facts;
}
