import { TRADE_IDS_MAX, foldSearchText } from '@cornerstone/shared';
import type { TradeResponse } from '@cornerstone/shared';

type TradeLike = Pick<TradeResponse, 'name' | 'translationKey'>;

/** Ids of trades whose display name contains the folded query (substring), at most TRADE_IDS_MAX. */
export function matchTradeIds(
  query: string,
  trades: readonly (TradeLike & Pick<TradeResponse, 'id'>)[],
  displayName: (trade: TradeLike) => string,
): string[] {
  const needle = foldSearchText(query);
  if (needle === '') return [];
  const ids: string[] = [];
  for (const trade of trades) {
    if (foldSearchText(displayName(trade)).includes(needle)) {
      ids.push(trade.id);
      if (ids.length >= TRADE_IDS_MAX) break;
    }
  }
  return ids;
}

/** A-Z by display name in the UI language. */
export function sortTradesByDisplayName<T extends TradeLike>(
  trades: readonly T[],
  displayName: (trade: T) => string,
  locale: string,
): T[] {
  return [...trades].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), locale, { sensitivity: 'base' }),
  );
}
