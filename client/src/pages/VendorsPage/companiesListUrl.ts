import { VENDOR_SORT_FIELDS } from '@cornerstone/shared';
import type { TradeListItem, VendorListQuery, VendorSortField } from '@cornerstone/shared';
import { ALL_CHIP } from '../../components/ObjectList/objectListUrl.js';
import type {
  ObjectListChipOption,
  ObjectListChipsConfig,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';

/** The server sorts of the Companies list. */
export const COMPANY_SORTS = VENDOR_SORT_FIELDS;

export const COMPANY_DEFAULT_SORT: VendorSortField = 'name';

/** The group key of companies without a trade. */
export const NONE_KEY = '__none__';

/**
 * Stored column keys of the DataTable this list replaced → the new key (null drops it). The name
 * is the always-shown title now; every other key is unchanged.
 */
export const COMPANY_LEGACY_COLUMN_KEYS: Readonly<Record<string, string | null>> = {
  name: null,
};

/** Trade chips shown before the rest move into the "More trades" menu. */
const MAX_TRADE_CHIPS = 4;

function isCompanySort(value: string): value is VendorSortField {
  return (COMPANY_SORTS as readonly string[]).includes(value);
}

/**
 * The list query as API params: search, trade chip, the trades whose name matched the search, and
 * the sort. Never includes page or pageSize.
 */
export function companiesListApiParams(
  query: ObjectListQuery,
  tradeIds: readonly string[],
): VendorListQuery {
  const params: VendorListQuery = {};
  if (query.q) params.q = query.q;
  if (tradeIds.length > 0) params.tradeIds = tradeIds.join(',');
  if (query.chip !== ALL_CHIP) params.tradeId = query.chip;
  if (isCompanySort(query.sortBy)) {
    params.sortBy = query.sortBy;
    params.sortOrder = query.sortOrder;
  }
  return params;
}

type TradeName = (trade: Pick<TradeListItem, 'name' | 'translationKey'>) => string;

/**
 * The trade chips (D8): the four trades with the most companies (ties A–Z), shown A–Z, plus the
 * selected trade as one more chip when it is outside those four. Every trade with a company is
 * in the "More trades" menu, which exists only when there are more than four. Trades without a
 * company are not offered. Null when there is nothing to filter by.
 */
export function tradeChips(
  trades: readonly TradeListItem[],
  displayName: TradeName,
  activeId: string | null,
  locale: string,
  moreLabel: string,
): Pick<ObjectListChipsConfig, 'options' | 'overflow'> | null {
  const byName = (a: TradeListItem, b: TradeListItem) =>
    displayName(a).localeCompare(displayName(b), locale, { sensitivity: 'base' });
  const used = trades.filter((trade) => trade.vendorCount > 0).sort(byName);
  const top = [...used]
    .sort((a, b) => b.vendorCount - a.vendorCount || byName(a, b))
    .slice(0, MAX_TRADE_CHIPS)
    .sort(byName);
  const asOption = (trade: TradeListItem): ObjectListChipOption => ({
    value: trade.id,
    label: displayName(trade),
  });
  const options = top.map(asOption);
  const active = trades.find((trade) => trade.id === activeId);
  if (active && !top.includes(active)) options.push(asOption(active));
  if (options.length === 0) return null;
  return {
    options,
    overflow:
      used.length > MAX_TRADE_CHIPS ? { label: moreLabel, options: used.map(asOption) } : undefined,
  };
}
