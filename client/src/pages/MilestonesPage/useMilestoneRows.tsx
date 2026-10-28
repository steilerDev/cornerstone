import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { MilestoneListRow } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { ObjectListProps } from '../../components/ObjectList/ObjectList.js';
import type { ObjectListColumn } from '../../components/ObjectList/types.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/index.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { milestoneBadgeProps } from '../../lib/milestoneStatusLabel.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import type { MilestoneListMeta } from './useMilestonesList.js';
import styles from './MilestonesPage.module.css';

type RowProps = Pick<
  ObjectListProps<MilestoneListRow, MilestoneListMeta>,
  'title' | 'renderSecondary' | 'columns' | 'renderStatus' | 'rowMenu' | 'facts'
>;

/** "—" for the eye and "Not set" for a screen reader. */
function NotSet() {
  const { t } = useTranslation('schedule');
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className={shared.srOnly}>{t('milestones.list.row.notSet')}</span>
    </>
  );
}

/** The first non-empty line of the description, or null. */
function firstLine(description: string | null): string | null {
  const line = description?.split('\n').find((candidate) => candidate.trim() !== '');
  return line === undefined ? null : line.trim();
}

export interface UseMilestoneRowsOptions {
  readonly onDelete: (item: MilestoneListRow) => void;
}

/**
 * How the Milestones list draws a row: title with the first line of the description, the Target,
 * Projected, Waits for and Holds up columns, the status word, the ⋯ menu and the card's three
 * facts.
 */
export function useMilestoneRows({ onDelete }: UseMilestoneRowsOptions): RowProps {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const originState = useOriginState();
  const navigate = useNavigate();

  const columns = useMemo(
    (): ObjectListColumn<MilestoneListRow>[] => [
      {
        key: 'target',
        label: t('milestones.list.columns.target'),
        sortValue: 'target_date',
        render: (item) => formatDate(item.targetDate),
      },
      {
        key: 'projected',
        label: t('milestones.list.columns.projected'),
        sortValue: 'projected_date',
        render: (item) =>
          item.projectedDate === null ? <NotSet /> : formatDate(item.projectedDate),
      },
      {
        key: 'waitsFor',
        label: t('milestones.list.columns.waitsFor'),
        sortValue: 'waits_for',
        align: 'end',
        render: (item) =>
          item.workItemCount === 0 ? (
            <NotSet />
          ) : (
            t('milestones.list.row.taskCount', { count: item.workItemCount })
          ),
      },
      {
        key: 'holdsUp',
        label: t('milestones.list.columns.holdsUp'),
        align: 'end',
        render: (item) =>
          item.holdsUp === null ? (
            <NotSet />
          ) : (
            <span
              data-figure="holds-up"
              data-testid={dataTableTestId('milestones-holds-up', item.id, 'table')}
            >
              {t('milestones.list.row.taskCount', { count: item.holdsUp.count })}
            </span>
          ),
      },
      {
        key: 'description',
        label: t('milestones.list.columns.description'),
        defaultVisible: false,
        render: (item) => {
          const line = firstLine(item.description);
          return line === null ? (
            <NotSet />
          ) : (
            <span className={styles.description} title={line}>
              {line}
            </span>
          );
        },
      },
      {
        key: 'reachedOn',
        label: t('milestones.list.columns.reachedOn'),
        defaultVisible: false,
        render: (item) => (item.completedAt === null ? <NotSet /> : formatDate(item.completedAt)),
      },
    ],
    [t, formatDate],
  );

  return {
    title: (item) => ({
      text: item.title,
      to: routeUrl('milestone', { id: item.id }),
      isUserText: true,
    }),
    renderSecondary: (item) => {
      const line = firstLine(item.description);
      return line === null ? null : (
        <span className={styles.secondary} title={line}>
          {line}
        </span>
      );
    },
    columns,
    renderStatus: (item, surface) => (
      <Badge
        {...milestoneBadgeProps(statusVariants.milestone, tCommon, item)}
        testId={dataTableTestId('milestones-status', item.id, surface)}
      />
    ),
    rowMenu: (item, surface): readonly OverflowMenuEntry[] => [
      {
        id: 'open',
        label: t('milestones.list.row.open'),
        onClick: () =>
          void navigate(routeUrl('milestone', { id: item.id }), { state: originState }),
        testId: dataTableTestId('milestones-open', item.id, surface),
      },
      {
        id: 'delete',
        label: tCommon('button.delete'),
        variant: 'destructive',
        onClick: () => onDelete(item),
        testId: dataTableTestId('milestones-delete', item.id, surface),
      },
    ],
    facts: (item) => [
      { key: 'target', keep: true, content: formatDate(item.targetDate) },
      {
        key: 'projected',
        content: item.projectedDate === null ? <NotSet /> : formatDate(item.projectedDate),
      },
      {
        key: 'waitsFor',
        content:
          item.workItemCount === 0 ? (
            <NotSet />
          ) : (
            t('milestones.list.row.taskCount', { count: item.workItemCount })
          ),
      },
    ],
  };
}
