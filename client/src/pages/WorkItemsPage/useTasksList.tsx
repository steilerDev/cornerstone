import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TASK_TIME_WINDOWS, WORK_ITEM_STATUSES } from '@cornerstone/shared';
import type { WorkItemListRow } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { queryKey } from '../../components/ObjectList/objectListUrl.js';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import type { ObjectListController } from '../../components/ObjectList/useObjectList.js';
import type {
  ObjectListConfig,
  ObjectListLabels,
  ObjectListPage,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { listWorkItemRows } from '../../lib/workItemsApi.js';
import { useTaskListFilters } from './TaskListFilters.js';
import {
  NONE_KEY,
  TASK_DEFAULT_SORT,
  TASK_LEGACY_COLUMN_KEYS,
  areaPathLabel,
  tasksListApiParams,
} from './tasksListUrl.js';

/** What comes with every batch besides the rows. */
export interface TaskListMeta {
  /** Rows matching only the status chip: the "of m" of the heading. */
  readonly scopeTotal: number;
}

/** `ids` of GET /api/work-items is capped at 100 keys; above that the host reloads instead. */
const MAX_REFRESH_IDS = 100;

const getKey = (row: WorkItemListRow): string => row.id;

/** The figures a row refresh read, for the host's announcement; null after a reload fallback. */
export interface RefreshedFigures {
  /** Every Late task of the current query (group=time only), else null. */
  readonly lateCount: number | null;
}

export interface UseTasksListResult {
  readonly list: ObjectListController<WorkItemListRow, TaskListMeta>;
  readonly config: ObjectListConfig<WorkItemListRow>;
  readonly labels: ObjectListLabels;
  /** Rows of the current chip without search or filters ("n of m" in the heading). */
  readonly scopeTotal: number | null;
  /**
   * Fresh rows and counts after a change, without a reload: rows that still match are patched in
   * place, a row that left the list is removed, and the totals and group counts follow. Falls
   * back to one reload when that is not possible (resolves null then).
   */
  readonly refreshRows: (keys: readonly string[]) => Promise<RefreshedFigures | null>;
}

/**
 * The Tasks list: URL state and the batch-loaded rows (`useObjectList`), the ObjectList config
 * (status chips, group by Time / Area / Company / Status, sort, filters), the labels and the
 * row refresh used after a status change. Fetching never depends on the translator.
 */
export function useTasksList(): UseTasksListResult {
  const { t } = useTranslation('workItems');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  const filters = useTaskListFilters();

  const config = useMemo(
    (): ObjectListConfig<WorkItemListRow> => ({
      listKey: 'workItems',
      testIdPrefix: 'tasks',
      chips: {
        options: WORK_ITEM_STATUSES.map((status) => ({
          value: status,
          label: statusVariants.task[status].label,
        })),
      },
      groupBy: {
        defaultValue: 'time',
        options: [
          {
            value: 'time',
            label: t('list.groupBy.time'),
            server: true,
            order: TASK_TIME_WINDOWS,
            groupOf: (row) => ({
              key: row.timeWindow,
              label: t(I18N_UNION_KEYS.taskTimeWindow.key(row.timeWindow)),
              badge:
                row.timeWindow === 'late' ? (
                  <Badge variants={statusVariants.attentionTier} value="late" />
                ) : undefined,
              done: row.timeWindow === 'done',
            }),
          },
          {
            value: 'area',
            label: t('list.groupBy.area'),
            last: [NONE_KEY],
            groupOf: (row) =>
              row.area
                ? {
                    key: row.area.id,
                    label: areaPathLabel(row.area),
                  }
                : { key: NONE_KEY, label: t('list.group.noArea') },
          },
          {
            value: 'company',
            label: t('list.groupBy.company'),
            last: [NONE_KEY],
            groupOf: (row) =>
              row.assignedVendor
                ? { key: row.assignedVendor.id, label: row.assignedVendor.name }
                : { key: NONE_KEY, label: t('list.group.noCompany') },
          },
          {
            value: 'status',
            label: t('list.groupBy.status'),
            order: WORK_ITEM_STATUSES,
            groupOf: (row) => ({
              key: row.status,
              label: statusVariants.task[row.status].label,
              done: row.status === 'completed',
            }),
          },
        ],
      },
      sort: {
        options: [
          { value: 'start_date', label: t('list.sort.startDate') },
          { value: 'end_date', label: t('list.sort.endDate') },
          { value: 'title', label: t('list.sort.title') },
          { value: 'status', label: t('list.sort.status') },
          { value: 'expected_cost', label: t('list.sort.expectedCost') },
          { value: 'created_at', label: t('list.sort.created') },
        ],
        defaultValue: TASK_DEFAULT_SORT,
        defaultOrder: 'asc',
      },
      filters,
      legacyColumnKeys: TASK_LEGACY_COLUMN_KEYS,
    }),
    [t, statusVariants, filters],
  );

  const fetchPage = useCallback(
    async (
      query: ObjectListQuery,
      page: number,
      pageSize: number,
    ): Promise<ObjectListPage<WorkItemListRow, TaskListMeta>> => {
      const response = await listWorkItemRows({ ...tasksListApiParams(query), page, pageSize });
      return {
        items: response.items,
        totalItems: response.pagination.totalItems,
        groupCounts: response.groupCounts,
        meta: { scopeTotal: response.scopeTotal },
      };
    },
    [],
  );

  const list = useObjectList<WorkItemListRow, TaskListMeta>({ config, fetchPage, getKey });
  const listRef = useRef(list);
  listRef.current = list;

  // The scope total of the current batch, or the newer one a row refresh fetched for it.
  const [scopeOverride, setScopeOverride] = useState<{
    readonly seq: number;
    readonly scopeTotal: number;
  } | null>(null);
  const scopeTotal =
    scopeOverride?.seq === list.fetchSequence
      ? scopeOverride.scopeTotal
      : (list.meta?.scopeTotal ?? null);

  const refreshRows = useCallback(
    async (keys: readonly string[]): Promise<RefreshedFigures | null> => {
      const current = listRef.current;
      if (keys.length === 0) return null;
      if (keys.length > MAX_REFRESH_IDS) {
        current.refresh();
        return null;
      }
      const startKey = queryKey(current.query);
      const params = tasksListApiParams(current.query);
      const results = await Promise.all([
        listWorkItemRows({ ...params, ids: keys }),
        listWorkItemRows({ ...params, page: 1, pageSize: 1 }),
      ]).catch(() => null);
      const latest = listRef.current;
      if (!results) {
        latest.refresh();
        return null;
      }
      // The query changed meanwhile: the answer belongs to a list that is no longer shown.
      if (queryKey(latest.query) !== startKey) return null;
      const [rows, figures] = results;
      const fresh = new Map(rows.items.map((row) => [row.id, row]));
      const loaded = new Map(latest.items.map((row) => [row.id, row]));
      // With rows still on the server a moved row would shift the offset paging: reload.
      const moved = rows.items.some((row) => {
        const before = loaded.get(row.id);
        return before !== undefined && before.timeWindow !== row.timeWindow;
      });
      if (latest.hasMore && moved && latest.query.serverGroup === 'time') {
        latest.refresh();
        return null;
      }
      for (const [id, row] of fresh) latest.updateItem(id, () => row);
      for (const key of keys) {
        if (!fresh.has(key)) latest.removeItem(key);
      }
      latest.setCounts({
        totalItems: figures.pagination.totalItems,
        groupCounts: figures.groupCounts ?? null,
      });
      setScopeOverride({ seq: latest.fetchSequence, scopeTotal: figures.scopeTotal });
      return { lateCount: figures.groupCounts?.late ?? null };
    },
    [],
  );

  const labels = useMemo(
    (): ObjectListLabels => ({
      title: tCommon('navigation.tasks'),
      search: t('list.search'),
      resultCount: (count) => t('list.resultCount', { count }),
      selectAll: t('list.selectAll'),
      empty: t('list.empty'),
      emptyDescription: t('list.emptyDescription'),
      noMatch: t('list.noMatch'),
      loadFailed: t('list.loadFailed'),
    }),
    [t, tCommon],
  );

  return { list, config, labels, scopeTotal, refreshRows };
}
