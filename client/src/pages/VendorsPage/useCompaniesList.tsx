import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TradeListItem, VendorListItem } from '@cornerstone/shared';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import type { ObjectListController } from '../../components/ObjectList/useObjectList.js';
import type {
  ObjectListConfig,
  ObjectListLabels,
  ObjectListPage,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';
import { matchTradeIds } from '../../lib/tradeSearch.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import {
  COMPANY_DEFAULT_SORT,
  COMPANY_LEGACY_COLUMN_KEYS,
  NONE_KEY,
  companiesListApiParams,
  tradeChips,
} from './companiesListUrl.js';

/** The trade chip's URL parameter. */
const TRADE_PARAM = 'tradeId';

/** What comes with every batch besides the rows. */
export interface CompanyListMeta {
  /** Companies matching only the trade chip: the "of m" of the heading. */
  readonly scopeTotal: number | undefined;
}

const getKey = (vendor: VendorListItem): string => vendor.id;

export type TradeDisplayName = (trade: { name: string; translationKey: string | null }) => string;

export interface UseCompaniesListOptions {
  readonly trades: readonly TradeListItem[];
  /** The trades could not be loaded: the list shows no trade chips. */
  readonly tradesFailed: boolean;
  readonly displayName: TradeDisplayName;
}

export interface UseCompaniesListResult {
  readonly list: ObjectListController<VendorListItem, CompanyListMeta>;
  readonly config: ObjectListConfig<VendorListItem>;
  readonly labels: ObjectListLabels;
  /** Companies of the current trade without a search ("n of m" in the heading). */
  readonly scopeTotal: number | null;
}

/**
 * The Companies list: URL state and the batch-loaded rows (`useObjectList`), the ObjectList
 * config (trade chips, group by Trade, sort) and the labels. Fetching never depends on the
 * translator; the search-matched trades are read from a ref at fetch time.
 */
export function useCompaniesList(options: UseCompaniesListOptions): UseCompaniesListResult {
  const { trades, tradesFailed, displayName } = options;
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation('settings');
  const [searchParams] = useSearchParams();
  const activeTradeId = searchParams.get(TRADE_PARAM);

  const config = useMemo((): ObjectListConfig<VendorListItem> => {
    const chips = tradesFailed
      ? null
      : tradeChips(
          trades,
          displayName,
          activeTradeId,
          i18n.language,
          t('companies.list.moreTrades'),
        );
    return {
      listKey: 'companies',
      testIdPrefix: 'companies',
      chips: chips
        ? {
            param: TRADE_PARAM,
            ariaLabel: t('companies.list.tradeFilterLabel'),
            options: chips.options,
            overflow: chips.overflow,
          }
        : undefined,
      groupBy: {
        options: [
          {
            value: 'trade',
            label: t('companies.list.groupBy.trade'),
            last: [NONE_KEY],
            groupOf: (vendor) =>
              vendor.trade
                ? { key: vendor.trade.id, label: displayName(vendor.trade) }
                : { key: NONE_KEY, label: t('companies.list.noTrade') },
          },
        ],
      },
      sort: {
        options: [
          { value: 'name', label: t('companies.list.sort.name') },
          { value: 'trade', label: t('companies.list.sort.trade') },
          { value: 'still_to_pay', label: t('companies.list.sort.stillToPay') },
          { value: 'last_on_site', label: t('companies.list.sort.lastOnSite') },
          { value: 'created_at', label: t('companies.list.sort.createdAt') },
          { value: 'updated_at', label: t('companies.list.sort.updatedAt') },
        ],
        defaultValue: COMPANY_DEFAULT_SORT,
        defaultOrder: 'asc',
      },
      legacyColumnKeys: COMPANY_LEGACY_COLUMN_KEYS,
    };
  }, [t, trades, tradesFailed, displayName, activeTradeId, i18n.language]);

  // The trades whose name matches the search are read at fetch time, so a trades refetch alone
  // never reloads the list.
  const tradesRef = useRef({ trades, displayName });
  useEffect(() => {
    tradesRef.current = { trades, displayName };
  });

  const fetchPage = useCallback(
    async (
      query: ObjectListQuery,
      page: number,
      pageSize: number,
    ): Promise<ObjectListPage<VendorListItem, CompanyListMeta>> => {
      const known = tradesRef.current;
      const response = await fetchVendors({
        ...companiesListApiParams(query, matchTradeIds(query.q, known.trades, known.displayName)),
        page,
        pageSize,
      });
      return {
        items: response.vendors,
        totalItems: response.pagination.totalItems,
        meta: { scopeTotal: response.scopeTotal },
      };
    },
    [],
  );

  const list = useObjectList<VendorListItem, CompanyListMeta>({ config, fetchPage, getKey });

  const labels = useMemo(
    (): ObjectListLabels => ({
      title: tCommon('navigation.companies'),
      search: t('companies.list.search'),
      resultCount: (count) => t('companies.list.resultCount', { count }),
      empty: t('companies.list.emptyTitle'),
      emptyDescription: t('companies.list.emptyDescription'),
      noMatch: t('companies.list.noMatch'),
      loadFailed: t('companies.list.loadError'),
    }),
    [t, tCommon],
  );

  return { list, config, labels, scopeTotal: list.meta?.scopeTotal ?? null };
}
