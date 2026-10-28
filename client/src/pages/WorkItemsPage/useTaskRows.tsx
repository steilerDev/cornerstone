import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { WorkItemListRow } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { AreaLink } from '../../components/AreaLink/AreaLink.js';
import { Badge } from '../../components/Badge/Badge.js';
import { GrantChips } from '../../components/Badge/GrantChips.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { ObjectListProps } from '../../components/ObjectList/ObjectList.js';
import type { ObjectListColumn, ObjectListSurface } from '../../components/ObjectList/types.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/index.js';
import { taskTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { toBcp47Locale, useFormatters } from '../../lib/formatters.js';
import { plannedRangeText, scheduleSignalOf } from '../../lib/scheduleDates.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import { TaskRowCommand } from './TaskRowCommand.js';
import type { TaskActions } from './useTaskActions.js';
import { areaPathLabel } from './tasksListUrl.js';
import type { TaskListMeta } from './useTasksList.js';
import styles from './WorkItemsPage.module.css';

type RowProps = Pick<
  ObjectListProps<WorkItemListRow, TaskListMeta>,
  'title' | 'renderSecondary' | 'columns' | 'renderStatus' | 'renderCommand' | 'rowMenu' | 'facts'
>;

/** "—" for the eye and "Not set" for a screen reader. */
function NotSet() {
  const { t } = useTranslation('workItems');
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className={shared.srOnly}>{t('list.row.notSet')}</span>
    </>
  );
}

/** The company the task is assigned to, else the household member; null when neither. */
function whoOf(item: WorkItemListRow): string | null {
  return item.assignedVendor?.name ?? item.assignedUser?.displayName ?? null;
}

export interface UseTaskRowsOptions {
  readonly actions: TaskActions;
}

/**
 * How the Tasks list draws a row: title with the area link and grant chip, the Dates, Who,
 * Expected cost and Waits for / Holds up columns, the status with its markers, the Start / Mark
 * done command, the ⋯ menu and the card's three facts.
 */
export function useTaskRows({ actions }: UseTaskRowsOptions): RowProps {
  const { t } = useTranslation('workItems');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency, formatDate } = useFormatters();
  const { resolvedLocale } = useLocale();
  const statusVariants = useStatusBadgeVariants();
  const originState = useOriginState();
  const navigate = useNavigate();
  const userText = useUserText();

  const columns = useMemo(
    (): ObjectListColumn<WorkItemListRow>[] => [
      {
        key: 'dates',
        label: t('list.columns.dates'),
        sortValue: 'start_date',
        render: (item) => {
          const range = plannedRangeText(
            item.startDate,
            item.endDate,
            toBcp47Locale(resolvedLocale),
            formatDate,
          );
          if (range === null) return <NotSet />;
          return (
            <span className={item.status === 'completed' ? styles.muted : undefined}>{range}</span>
          );
        },
      },
      {
        key: 'who',
        label: t('list.columns.who'),
        render: (item) => {
          const who = whoOf(item);
          return who === null ? (
            <NotSet />
          ) : (
            <span className={styles.who} title={who}>
              {who}
            </span>
          );
        },
      },
      {
        key: 'expectedCost',
        label: t('list.columns.expectedCost'),
        sortValue: 'expected_cost',
        align: 'end',
        render: (item) =>
          item.expectedCost === null ? (
            <NotSet />
          ) : (
            <span className={styles.amount}>{formatCurrency(item.expectedCost)}</span>
          ),
      },
      {
        key: 'relations',
        label: t('list.columns.relations'),
        render: (item) => {
          const { waitsFor, holdsUp } = item;
          if (waitsFor === null && holdsUp === null) return null;
          return (
            <div className={styles.relations}>
              {waitsFor ? (
                <span className={styles.relationLine}>
                  <span className={styles.muted}>{t('list.row.waitsFor')}</span>{' '}
                  <NavAnchor
                    to={routeUrl('workItem', { id: waitsFor.id })}
                    state={originState}
                    {...userText(styles.relationLink)}
                    data-testid={dataTableTestId('tasks-waits-for', item.id, 'table')}
                  >
                    {waitsFor.title}
                  </NavAnchor>
                  {waitsFor.more > 0 ? (
                    <span className={styles.muted}>
                      {' '}
                      {t('list.row.more', { count: waitsFor.more })}
                    </span>
                  ) : null}
                </span>
              ) : null}
              {holdsUp ? (
                <span
                  className={styles.relationLine}
                  data-figure="holds-up"
                  data-testid={dataTableTestId('tasks-holds-up', item.id, 'table')}
                >
                  {tCommon('attention.holdsUp.tasks', { count: holdsUp.count })}
                </span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [t, tCommon, resolvedLocale, formatDate, formatCurrency, originState, userText],
  );

  const markers = (item: WorkItemListRow, surface: ObjectListSurface): ReactNode[] => {
    if (item.status === 'completed') return [];
    const found: ReactNode[] = [];
    const signal = scheduleSignalOf(item);
    if (signal) {
      found.push(
        <Badge
          key="signal"
          {...scheduleSignalBadgeProps(signal, statusVariants.scheduleSignal)}
          testId={dataTableTestId('tasks-schedule-signal', item.id, surface)}
        />,
      );
    }
    if (item.isCritical) {
      found.push(
        <Badge
          key="critical"
          variants={statusVariants.criticalSignal}
          value="critical"
          testId={dataTableTestId('tasks-critical', item.id, surface)}
        />,
      );
    }
    // At most two markers in the table, only the first on a card.
    return found.slice(0, surface === 'card' ? 1 : 2);
  };

  return {
    title: (item) => ({
      text: item.title,
      to: routeUrl('workItem', { id: item.id }),
      isUserText: true,
    }),
    renderSecondary: (item) => (
      <>
        {item.area ? (
          <AreaLink
            areaId={item.area.id}
            className={styles.areaLink}
            testId={dataTableTestId('tasks-area', item.id, 'table')}
          >
            {areaPathLabel(item.area)}
          </AreaLink>
        ) : (
          <span className={styles.muted}>{t('list.group.noArea')}</span>
        )}
        <GrantChips
          grants={item.grants}
          testId={dataTableTestId('work-item-grants', item.id, 'table')}
        />
      </>
    ),
    columns,
    renderStatus: (item, surface) => (
      <>
        <Badge
          variants={statusVariants.task}
          value={item.status}
          testId={dataTableTestId('tasks-status', item.id, surface)}
        />
        {markers(item, surface)}
      </>
    ),
    renderCommand: (item) => (
      <TaskRowCommand
        item={item}
        actions={actions}
        testId={dataTableTestId('tasks-command', item.id, 'table')}
      />
    ),
    rowMenu: (item, surface): readonly OverflowMenuEntry[] => {
      const entries: OverflowMenuEntry[] = [];
      if (item.status === 'completed') {
        entries.push({
          id: 'reopen',
          label: t('list.row.reopen'),
          onClick: () => void actions.reopen(item),
          testId: dataTableTestId('tasks-reopen', item.id, surface),
        });
      } else if (surface === 'card') {
        // On a card the command is the first entry; the date step is the table's StatusMenu.
        const to = item.status === 'not_started' ? 'in_progress' : 'completed';
        const forward = taskTransitions(tCommon, item).find((transition) => transition.to === to)!;
        entries.push({
          id: 'command',
          label: forward.label,
          onClick: () => void actions.applyStatus(item, to, null),
          testId: dataTableTestId('tasks-command', item.id, 'card'),
        });
      }
      entries.push(
        {
          id: 'open',
          label: t('list.row.open'),
          onClick: () =>
            void navigate(routeUrl('workItem', { id: item.id }), { state: originState }),
          testId: dataTableTestId('tasks-open', item.id, surface),
        },
        {
          id: 'delete',
          label: tCommon('button.delete'),
          variant: 'destructive',
          onClick: () => actions.requestDelete(item),
          testId: dataTableTestId('tasks-delete', item.id, surface),
        },
      );
      return entries;
    },
    facts: (item) => [
      {
        key: 'area',
        keep: true,
        content: <AreaBreadcrumb area={item.area} variant="compact" />,
      },
      { key: 'who', content: whoOf(item) ?? <NotSet /> },
      {
        key: 'end',
        content: item.endDate ? (
          formatDate(item.endDate)
        ) : item.expectedCost !== null ? (
          formatCurrency(item.expectedCost)
        ) : (
          <NotSet />
        ),
      },
    ],
  };
}
