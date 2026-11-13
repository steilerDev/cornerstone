import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaNowItem, AreaPageSummary } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FeedRow } from '../../components/FeedRow/FeedRow.js';
import { SectionCardFrame } from '../../components/SectionCard/SectionCardFrame.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { quietKindForDepth } from '../AreasPage/areaTree.js';
import styles from './AreaDetailPage.module.css';

export interface AreaNowSectionProps {
  readonly summary: AreaPageSummary;
  readonly originState: OriginState;
}

/** Now & next here: the most relevant open tasks and purchases, then the ancestor context rows. */
export function AreaNowSection({ summary, originState }: AreaNowSectionProps) {
  const { t } = useTranslation('areas');
  const { area, counts, nowAndNext, ancestorContext } = summary;
  const areaId = area.id;

  return (
    <SectionCardFrame id="area-now" title={t('detail.sections.now')}>
      {nowAndNext.length === 0 ? (
        <EmptyState message={t('detail.now.empty', { area: area.name })} />
      ) : (
        <ul className={styles.feedList}>
          {nowAndNext.map((item) => (
            <NowRow key={`${item.type}-${item.id}`} item={item} originState={originState} />
          ))}
        </ul>
      )}
      {counts.workItems.total > 0 || counts.householdItems.total > 0 ? (
        <div className={styles.moreRow}>
          {counts.workItems.total > 0 ? (
            <NavAnchor
              to={routeUrl('workItems', undefined, { areaId })}
              state={originState}
              className={styles.moreLink}
              data-testid="area-now-all-tasks"
            >
              {t('detail.now.allTasks', { count: counts.workItems.total })}
              <span aria-hidden="true"> →</span>
            </NavAnchor>
          ) : null}
          {counts.householdItems.total > 0 ? (
            <NavAnchor
              to={routeUrl('householdItems', undefined, { areaId })}
              state={originState}
              className={styles.moreLink}
              data-testid="area-now-all-purchases"
            >
              {t('detail.now.allPurchases', { count: counts.householdItems.total })}
              <span aria-hidden="true"> →</span>
            </NavAnchor>
          ) : null}
        </div>
      ) : null}
      {ancestorContext.length > 0 ? (
        <ul
          aria-label={t('detail.now.contextLabel')}
          className={styles.contextList}
          data-testid="area-context"
        >
          {ancestorContext.map((entry) => (
            <li key={entry.areaId}>
              <NavAnchor
                to={routeUrl('area', { id: entry.areaId })}
                state={originState}
                className={styles.contextLink}
                data-testid={`area-context-${entry.areaId}`}
              >
                {contextText(entry, t)}
              </NavAnchor>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCardFrame>
  );
}

/** "Whole floor (no room) · 2 tasks · 1 purchase": the Areas index quiet-row wording. */
function contextText(entry: AreaPageSummary['ancestorContext'][number], t: TFunction): string {
  const kind = quietKindForDepth(entry.depth);
  const label =
    kind === 'building'
      ? t('index.quiet.building')
      : kind === 'floor'
        ? t('index.quiet.floor')
        : t('index.quiet.other', { name: entry.name });
  const parts = [label];
  if (entry.workItemCount > 0) {
    parts.push(t('index.delete.taskCount', { count: entry.workItemCount }));
  }
  if (entry.householdItemCount > 0) {
    parts.push(t('index.delete.purchaseCount', { count: entry.householdItemCount }));
  }
  return parts.join(' · ');
}

function NowRow({ item, originState }: { item: AreaNowItem; originState: OriginState }) {
  const { t: tc } = useTranslation('common');
  const { t: tWork } = useTranslation('workItems');
  const { t: tHousehold } = useTranslation('householdItems');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const isTask = item.type === 'work_item';

  const kindVariants = {
    [item.type]: {
      label: tc(isTask ? 'navigation.task' : 'navigation.purchase'),
      className: badgeStyles.neutral,
    },
  };
  const late = item.isLate && item.lateDays ? item.lateDays : null;
  let status;
  if (late !== null) {
    status = (
      <Badge
        {...scheduleSignalBadgeProps({ signal: 'late', days: late }, statusVariants.scheduleSignal)}
      />
    );
  } else if (item.type === 'work_item') {
    status = <Badge variants={statusVariants.task} value={item.status} />;
  } else {
    status = <Badge variants={statusVariants.purchase} value={item.status} />;
  }

  let dates: string | null = null;
  if (item.type === 'work_item') {
    if (item.startDate && item.endDate) {
      dates = tWork('taskPage.strip.dateRange', {
        start: formatDate(item.startDate),
        end: formatDate(item.endDate),
      });
    } else if (item.startDate ?? item.endDate) {
      dates = formatDate((item.startDate ?? item.endDate)!);
    }
  } else if (item.deliveryDate) {
    dates = tHousehold('purchasePage.strip.target', { date: formatDate(item.deliveryDate) });
  }

  // Follows the title, so it opens with the separator (as the Home agenda rows do).
  const contextParts = [dates, item.companyName].filter((part): part is string => !!part);
  const context = contextParts.length > 0 ? ` · ${contextParts.join(' · ')}` : undefined;

  return (
    <FeedRow
      variant="object"
      severity="none"
      badges={
        <>
          <Badge variants={kindVariants} value={item.type} />
          {status}
        </>
      }
      title={item.title}
      titleLink={{
        to: routeUrl(isTask ? 'workItem' : 'householdItem', { id: item.id }),
        state: originState,
      }}
      context={context}
      testId={`area-now-${item.type}-${item.id}`}
    />
  );
}
