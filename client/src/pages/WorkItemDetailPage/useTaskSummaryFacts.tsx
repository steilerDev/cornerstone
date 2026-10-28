import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { Badge } from '../../components/Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { CallButton } from '../../components/CallButton/CallButton.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type { ObjectTabId } from '../../components/ObjectTabs/objectTabIds.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { barDates, scheduleSignalOf } from '../../lib/scheduleDates.js';
import type { OriginState } from '../../navigation/origin.js';
import styles from './WorkItemDetailPage.module.css';

export interface UseTaskSummaryFactsOptions {
  readonly task: WorkItemPageDetail;
  readonly tabs: ObjectTabsController;
  readonly originState: OriginState;
  /** The Documents fact of `useDocumentsPanel`; null leaves it out. */
  readonly documentsFact: SummaryFact | null;
  /** Opens the Who and where card in edit mode. */
  readonly onOpenWhoWhere: () => void;
}

/** The strip of the task page: When, Where, Who, Expected cost, Waits for, Holds up, Documents. */
export function useTaskSummaryFacts({
  task,
  tabs,
  originState,
  documentsFact,
  onOpenWhoWhere,
}: UseTaskSummaryFactsOptions): SummaryFact[] {
  const { t } = useTranslation('workItems');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();

  const tabFact = (
    id: string,
    tab: ObjectTabId,
    label: string,
    value: SummaryFact['value'],
    extra: { readonly wide?: boolean; readonly onActivate?: () => void } = {},
  ): SummaryFact => ({
    id,
    kind: 'tab',
    href: tabs.hrefFor(tab),
    onActivate: extra.onActivate ?? (() => tabs.select(tab, { focusPanel: true })),
    label,
    value,
    ...(extra.wide ? { wide: true } : {}),
  });

  const { start, end } = barDates(task);
  const signal = scheduleSignalOf(task);
  const single = start ?? end;
  let dates: string;
  if (start && end) {
    dates = t('taskPage.strip.dateRange', { start: formatDate(start), end: formatDate(end) });
  } else if (single) {
    dates = formatDate(single);
  } else {
    dates = t('taskPage.strip.noDates');
  }

  const facts: SummaryFact[] = [];

  facts.push(
    tabFact(
      'when',
      'timing',
      t('taskPage.strip.when'),
      <>
        {dates}
        {signal ? (
          <>
            {' '}
            <Badge
              {...scheduleSignalBadgeProps(signal, statusVariants.scheduleSignal)}
              testId="work-item-schedule-signal"
            />
          </>
        ) : null}
      </>,
      { wide: signal !== null },
    ),
  );

  if (task.area) {
    facts.push({
      id: 'where',
      kind: 'link',
      // Interim until route `area` (P5.7) is served: then routeUrl('area', { id }) (as AreaLink).
      to: routeUrl('areas'),
      state: originState,
      label: t('taskPage.strip.where'),
      value: <AreaBreadcrumb area={task.area} variant="compact" />,
    });
  } else {
    facts.push(
      tabFact('where', 'overview', t('taskPage.strip.where'), null, {
        onActivate: onOpenWhoWhere,
      }),
    );
  }

  const whoName = task.assignedVendor?.name ?? task.assignedUser?.displayName ?? null;
  const phone = task.assignedVendor?.phone ?? null;
  const showsCall = task.assignedVendor !== null && phone !== null;
  facts.push({
    ...tabFact('who', 'overview', t('taskPage.strip.who'), whoName, {
      onActivate: onOpenWhoWhere,
      wide: showsCall,
    }),
    ...(task.assignedVendor && phone
      ? {
          trailing: (
            <CallButton phone={phone} name={task.assignedVendor.name} testId="task-summary-call" />
          ),
        }
      : {}),
  });

  const [grant] = task.grants;
  let grantRemark: string | null = null;
  if (grant) {
    grantRemark =
      task.grants.length > 1
        ? t('taskPage.strip.grantsMore', { name: grant.name, count: task.grants.length - 1 })
        : grant.name;
  }
  facts.push(
    tabFact(
      'cost',
      'cost',
      t('taskPage.strip.cost'),
      task.expectedCost === null ? null : (
        <>
          {formatCurrency(task.expectedCost)}
          {grantRemark ? (
            <span className={styles.remark}>
              {' · '}
              {grantRemark}
            </span>
          ) : null}
        </>
      ),
      { wide: grantRemark !== null },
    ),
  );

  facts.push(
    tabFact(
      'waitsFor',
      'timing',
      t('taskPage.strip.waitsFor'),
      task.waitsFor ? (
        <>
          {task.waitsFor.title}
          {task.waitsFor.more > 0 ? (
            <span className={styles.remark}>
              {' '}
              {t('list.row.more', { count: task.waitsFor.more })}
            </span>
          ) : null}
        </>
      ) : (
        t('taskPage.strip.nothing')
      ),
    ),
  );

  facts.push({
    ...tabFact(
      'holdsUp',
      'timing',
      t('taskPage.strip.holdsUp'),
      task.holdsUp
        ? t('taskPage.strip.taskCount', { count: task.holdsUp.count })
        : t('taskPage.strip.nothing'),
    ),
    ...(task.holdsUp ? { figureKind: 'holds-up' as const } : {}),
  });

  if (documentsFact) facts.push(documentsFact);

  return facts;
}
