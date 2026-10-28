import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';
import type { HouseholdItemListRow, HouseholdItemListTotals } from '@cornerstone/shared';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import type { ObjectListController } from '../../components/ObjectList/useObjectList.js';
import type {
  ObjectListConfig,
  ObjectListLabels,
  ObjectListPage,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { listHouseholdItemRows } from '../../lib/householdItemsApi.js';
import { areaPathLabel } from '../../lib/home/recentAreas.js';
import { usePurchaseListFilters } from './PurchaseListFilters.js';
import type { PurchaseCategories } from './PurchaseListFilters.js';
import {
  NONE_KEY,
  PURCHASE_DEFAULT_SORT,
  PURCHASE_LEGACY_COLUMN_KEYS,
  purchasesListApiParams,
} from './purchasesListUrl.js';

/** What comes with every batch besides the rows. */
export interface PurchaseListMeta {
  /** Rows matching only the status chip: the "of m" of the heading. */
  readonly scopeTotal: number;
  /** Expected cost, Invoiced and Paid over every row matching the query. */
  readonly totals: HouseholdItemListTotals;
}

const getKey = (row: HouseholdItemListRow): string => row.id;

export interface UsePurchasesListResult {
  readonly list: ObjectListController<HouseholdItemListRow, PurchaseListMeta>;
  readonly config: ObjectListConfig<HouseholdItemListRow>;
  readonly labels: ObjectListLabels;
  /** Rows of the current chip without search or filters ("n of m" in the heading). */
  readonly scopeTotal: number | null;
}

/**
 * The Purchases list: URL state and the batch-loaded rows (`useObjectList`), the ObjectList
 * config (status chips, group by Status / Area / Company, sort, filters) and the labels.
 * Fetching never depends on the translator.
 */
export function usePurchasesList(categories: PurchaseCategories): UsePurchasesListResult {
  const { t } = useTranslation('householdItems');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  const filters = usePurchaseListFilters(categories);

  const config = useMemo(
    (): ObjectListConfig<HouseholdItemListRow> => ({
      listKey: 'householdItems',
      testIdPrefix: 'purchases',
      chips: {
        options: HOUSEHOLD_ITEM_STATUSES.map((status) => ({
          value: status,
          label: statusVariants.purchase[status].label,
        })),
      },
      groupBy: {
        defaultValue: 'status',
        options: [
          {
            value: 'status',
            label: t('list.groupBy.status'),
            server: true,
            order: HOUSEHOLD_ITEM_STATUSES,
            groupOf: (row) => ({
              key: row.status,
              label: statusVariants.purchase[row.status].label,
              done: row.status === 'arrived',
            }),
          },
          {
            value: 'area',
            label: t('list.groupBy.area'),
            last: [NONE_KEY],
            groupOf: (row) =>
              row.area
                ? { key: row.area.id, label: areaPathLabel(row.area) }
                : { key: NONE_KEY, label: t('list.group.noArea') },
          },
          {
            value: 'company',
            label: t('list.groupBy.company'),
            last: [NONE_KEY],
            groupOf: (row) =>
              row.vendor
                ? { key: row.vendor.id, label: row.vendor.name }
                : { key: NONE_KEY, label: t('list.group.noCompany') },
          },
        ],
      },
      sort: {
        options: [
          { value: 'name', label: t('list.sort.name') },
          { value: 'status', label: t('list.sort.status') },
          { value: 'category', label: t('list.sort.category') },
          { value: 'delivery', label: t('list.sort.delivery') },
          { value: 'target_delivery_date', label: t('list.sort.targetDelivery') },
          { value: 'actual_delivery_date', label: t('list.sort.deliveredOn') },
          { value: 'order_date', label: t('list.sort.orderDate') },
          { value: 'expected_cost', label: t('list.sort.expectedCost') },
          { value: 'invoiced', label: t('list.sort.invoiced') },
        ],
        defaultValue: PURCHASE_DEFAULT_SORT,
        defaultOrder: 'asc',
      },
      filters,
      legacyColumnKeys: PURCHASE_LEGACY_COLUMN_KEYS,
    }),
    [t, statusVariants, filters],
  );

  const fetchPage = useCallback(
    async (
      query: ObjectListQuery,
      page: number,
      pageSize: number,
    ): Promise<ObjectListPage<HouseholdItemListRow, PurchaseListMeta>> => {
      const response = await listHouseholdItemRows({
        ...purchasesListApiParams(query),
        page,
        pageSize,
      });
      return {
        items: response.items,
        totalItems: response.pagination.totalItems,
        groupCounts: response.groupCounts,
        meta: { scopeTotal: response.scopeTotal, totals: response.totals },
      };
    },
    [],
  );

  const list = useObjectList<HouseholdItemListRow, PurchaseListMeta>({
    config,
    fetchPage,
    getKey,
  });

  const labels = useMemo(
    (): ObjectListLabels => ({
      title: tCommon('navigation.purchases'),
      search: t('list.search'),
      resultCount: (count) => t('list.resultCount', { count }),
      empty: t('list.empty'),
      emptyDescription: t('list.emptyDescription'),
      noMatch: t('list.noMatch'),
      loadFailed: t('list.loadFailed'),
    }),
    [t, tCommon],
  );

  return { list, config, labels, scopeTotal: list.meta?.scopeTotal ?? null };
}
