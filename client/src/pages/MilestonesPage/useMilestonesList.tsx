import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MilestoneListRow } from '@cornerstone/shared';
import {
  DateRangeFilter,
  NumberRangeFilter,
} from '../../components/ObjectList/ObjectListRangeFilters.js';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import type { ObjectListController } from '../../components/ObjectList/useObjectList.js';
import type {
  ObjectListConfig,
  ObjectListFilterDef,
  ObjectListLabels,
  ObjectListPage,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { listMilestoneRows } from '../../lib/milestonesApi.js';
import {
  MILESTONE_DEFAULT_SORT,
  MILESTONE_LEGACY_COLUMN_KEYS,
  selectMilestoneRows,
} from './milestonesListUrl.js';

/** What comes with every batch besides the rows. */
export interface MilestoneListMeta {
  /** Rows matching only the status chip: the "of m" of the heading. */
  readonly scopeTotal: number;
}

const getKey = (row: MilestoneListRow): string => String(row.id);

export interface UseMilestonesListResult {
  readonly list: ObjectListController<MilestoneListRow, MilestoneListMeta>;
  readonly config: ObjectListConfig<MilestoneListRow>;
  readonly labels: ObjectListLabels;
  /** Rows of the current chip without search or filters ("n of m" in the heading). */
  readonly scopeTotal: number | null;
}

/**
 * The Milestones list: URL state and the rows (`useObjectList`), the ObjectList config (Upcoming
 * and Reached chips, sort, Target date and Waits for filters; no grouping) and the labels. The
 * endpoint returns every milestone, so filtering, sorting and paging run here. Fetching never
 * depends on the translator.
 */
export function useMilestonesList(): UseMilestonesListResult {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();

  const filters = useMemo((): ObjectListFilterDef[] => {
    const dateLabels = {
      from: t('milestones.list.filters.from'),
      to: t('milestones.list.filters.to'),
    };
    return [
      {
        param: 'targetDate',
        label: t('milestones.list.filters.targetDate'),
        render: (ctx) => (
          <DateRangeFilter ctx={ctx} testId="milestones-filter-targetDate" labels={dateLabels} />
        ),
      },
      {
        param: 'waitsFor',
        label: t('milestones.list.filters.waitsFor'),
        render: (ctx) => (
          <NumberRangeFilter
            ctx={ctx}
            testId="milestones-filter-waitsFor"
            labels={{
              min: t('milestones.list.filters.min'),
              max: t('milestones.list.filters.max'),
            }}
            step="1"
          />
        ),
      },
    ];
  }, [t]);

  const config = useMemo(
    (): ObjectListConfig<MilestoneListRow> => ({
      listKey: 'milestones',
      testIdPrefix: 'milestones',
      chips: {
        options: [
          { value: 'upcoming', label: statusVariants.milestone.upcoming.label },
          { value: 'reached', label: statusVariants.milestone.reached.label },
        ],
      },
      sort: {
        options: [
          { value: 'target_date', label: t('milestones.list.sort.targetDate') },
          { value: 'title', label: t('milestones.list.sort.title') },
          { value: 'projected_date', label: t('milestones.list.sort.projectedDate') },
          { value: 'status', label: t('milestones.list.sort.status') },
          { value: 'waits_for', label: t('milestones.list.sort.waitsFor') },
        ],
        defaultValue: MILESTONE_DEFAULT_SORT,
        defaultOrder: 'asc',
      },
      filters,
      legacyColumnKeys: MILESTONE_LEGACY_COLUMN_KEYS,
    }),
    [t, statusVariants, filters],
  );

  const fetchPage = useCallback(
    async (
      query: ObjectListQuery,
      page: number,
      pageSize: number,
    ): Promise<ObjectListPage<MilestoneListRow, MilestoneListMeta>> => {
      const { items, scopeTotal } = selectMilestoneRows(await listMilestoneRows(), query);
      return {
        items: items.slice((page - 1) * pageSize, page * pageSize),
        totalItems: items.length,
        meta: { scopeTotal },
      };
    },
    [],
  );

  const list = useObjectList<MilestoneListRow, MilestoneListMeta>({ config, fetchPage, getKey });
  const scopeTotal = list.meta?.scopeTotal ?? null;

  const labels = useMemo(
    (): ObjectListLabels => ({
      title: tCommon('navigation.milestones'),
      search: t('milestones.list.search'),
      resultCount: (count) => t('milestones.list.resultCount', { count }),
      empty: t('milestones.list.empty'),
      emptyDescription: t('milestones.list.emptyDescription'),
      noMatch: t('milestones.list.noMatch'),
      loadFailed: t('milestones.list.loadFailed'),
    }),
    [t, tCommon],
  );

  return { list, config, labels, scopeTotal };
}
