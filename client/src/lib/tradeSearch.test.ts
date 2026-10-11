import { describe, it, expect } from '@jest/globals';
import { TRADE_IDS_MAX } from '@cornerstone/shared';
import { matchTradeIds, sortTradesByDisplayName } from './tradeSearch.js';

type T = { id: string; name: string; translationKey: string | null };

const trade = (id: string, name: string, translationKey: string | null = null): T => ({
  id,
  name,
  translationKey,
});

const GERMAN: Record<string, string> = {
  'trades.tiling': 'Fliesenarbeiten',
  'trades.roofing': 'Dachdecker',
  'trades.joinery': 'Tischler',
};
const display = (t: Pick<T, 'name' | 'translationKey'>) =>
  t.translationKey ? (GERMAN[t.translationKey] ?? t.name) : t.name;

describe('matchTradeIds', () => {
  const trades = [
    trade('t1', 'Tiling', 'trades.tiling'),
    trade('t2', 'Roofing', 'trades.roofing'),
    trade('t3', 'Custom Roofing Extras'),
  ];

  it('matches the displayed (translated) name, not the stored name', () => {
    expect(matchTradeIds('fliesen', trades, display)).toEqual(['t1']);
    expect(matchTradeIds('tiling', trades, display)).toEqual([]);
  });

  it('matches a substring anywhere in the name', () => {
    expect(matchTradeIds('decker', trades, display)).toEqual(['t2']);
  });

  it('returns every trade whose name contains the query, in list order', () => {
    expect(
      matchTradeIds('roof', [trade('a', 'Roofing'), trade('b', 'Flat Roofing')], display),
    ).toEqual(['a', 'b']);
  });

  it('folds case, umlauts and digraphs on both sides', () => {
    expect(
      matchTradeIds('TISCHLER', trades.concat(trade('t4', 'Joinery', 'trades.joinery')), display),
    ).toEqual(['t4']);
    expect(
      matchTradeIds('mueller', [trade('m', 'Müller Spezial'), trade('n', 'Other')], display),
    ).toEqual(['m']);
    expect(matchTradeIds('fussboden', [trade('f', 'Fußboden')], display)).toEqual(['f']);
  });

  it.each(['', '   ', '̈'])('returns no ids for the empty query %j', (query) => {
    expect(matchTradeIds(query, trades, display)).toEqual([]);
  });

  it('returns no ids for an empty trade list', () => {
    expect(matchTradeIds('roof', [], display)).toEqual([]);
  });

  it('caps the result at TRADE_IDS_MAX ids', () => {
    const many = Array.from({ length: TRADE_IDS_MAX + 20 }, (_, i) => trade(`t${i}`, `Trade ${i}`));

    const ids = matchTradeIds('trade', many, display);

    expect(ids).toHaveLength(TRADE_IDS_MAX);
    expect(ids[0]).toBe('t0');
    expect(ids[TRADE_IDS_MAX - 1]).toBe(`t${TRADE_IDS_MAX - 1}`);
  });

  it('returns exactly TRADE_IDS_MAX when that many match', () => {
    const exact = Array.from({ length: TRADE_IDS_MAX }, (_, i) => trade(`t${i}`, `Trade ${i}`));
    expect(matchTradeIds('trade', exact, display)).toHaveLength(TRADE_IDS_MAX);
  });
});

describe('sortTradesByDisplayName', () => {
  it('sorts A-Z by the displayed name', () => {
    const sorted = sortTradesByDisplayName(
      [
        trade('1', 'Tiling', 'trades.tiling'),
        trade('2', 'Roofing', 'trades.roofing'),
        trade('3', 'Zeta'),
      ],
      display,
      'de',
    );
    // Dachdecker, Fliesenarbeiten, Zeta
    expect(sorted.map((x) => x.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by the English names when the display name is the stored name', () => {
    const sorted = sortTradesByDisplayName(
      [trade('1', 'Tiling'), trade('2', 'Roofing'), trade('3', 'Plumbing')],
      (x) => x.name,
      'en',
    );
    expect(sorted.map((x) => x.id)).toEqual(['3', '2', '1']);
  });

  it('ignores case and accents when comparing (base sensitivity)', () => {
    const sorted = sortTradesByDisplayName(
      [trade('1', 'zebra'), trade('2', 'Ärmel'), trade('3', 'apple')],
      (x) => x.name,
      'de',
    );
    expect(sorted.map((x) => x.id)).toEqual(['3', '2', '1']);
  });

  it('uses the locale: a umlaut sorts with its base letter in German', () => {
    const sorted = sortTradesByDisplayName(
      [trade('1', 'Zimmerei'), trade('2', 'Öfen'), trade('3', 'Maler')],
      (x) => x.name,
      'de',
    );
    expect(sorted.map((x) => x.id)).toEqual(['3', '2', '1']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = [trade('1', 'B'), trade('2', 'A')];
    const sorted = sortTradesByDisplayName(input, (x) => x.name, 'en');

    expect(sorted).not.toBe(input);
    expect(input.map((x) => x.id)).toEqual(['1', '2']);
    expect(sorted.map((x) => x.id)).toEqual(['2', '1']);
  });

  it('keeps the extra fields of the items', () => {
    const rich = [{ ...trade('1', 'A'), vendorCount: 7 }];
    expect(sortTradesByDisplayName(rich, (x) => x.name, 'en')[0]!.vendorCount).toBe(7);
  });
});
