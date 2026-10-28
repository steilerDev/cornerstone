import { describe, it, expect } from '@jest/globals';
import type { TradeListItem } from '@cornerstone/shared';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import {
  COMPANY_DEFAULT_SORT,
  COMPANY_LEGACY_COLUMN_KEYS,
  COMPANY_SORTS,
  NONE_KEY,
  companiesListApiParams,
  tradeChips,
} from './companiesListUrl.js';

function query(overrides: Partial<ObjectListQuery> = {}): ObjectListQuery {
  return {
    q: '',
    chip: 'all',
    searchingAll: false,
    serverGroup: null,
    sortBy: 'name',
    sortOrder: 'asc',
    isDefaultSort: true,
    filters: {},
    ...overrides,
  };
}

describe('companiesListApiParams', () => {
  it('sends the default sort for a bare list, never page or pageSize', () => {
    const params = companiesListApiParams(query(), []);

    expect(params).toEqual({ sortBy: 'name', sortOrder: 'asc' });
    expect(params).not.toHaveProperty('page');
    expect(params).not.toHaveProperty('pageSize');
  });

  it('sends the search, the trade chip and the trades whose name matched', () => {
    expect(companiesListApiParams(query({ q: 'tile', chip: 't-1' }), ['t-2', 't-3'])).toEqual({
      q: 'tile',
      tradeId: 't-1',
      tradeIds: 't-2,t-3',
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('sends no tradeId for All and no tradeIds without a match', () => {
    const params = companiesListApiParams(query({ chip: 'all' }), []);

    expect(params).not.toHaveProperty('tradeId');
    expect(params).not.toHaveProperty('tradeIds');
  });

  it.each(COMPANY_SORTS)('passes the %s sort through with its direction', (sortBy) => {
    expect(companiesListApiParams(query({ sortBy, sortOrder: 'desc' }), [])).toMatchObject({
      sortBy,
      sortOrder: 'desc',
    });
  });

  it('sends no sort for a sort the server does not know', () => {
    const params = companiesListApiParams(query({ sortBy: 'phone', sortOrder: 'desc' }), []);

    expect(params).not.toHaveProperty('sortBy');
    expect(params).not.toHaveProperty('sortOrder');
  });
});

describe('constants', () => {
  it('sorts by name by default and groups companies without a trade under one key', () => {
    expect(COMPANY_DEFAULT_SORT).toBe('name');
    expect(NONE_KEY).toBe('__none__');
  });

  it('drops only the old Name column key', () => {
    expect(COMPANY_LEGACY_COLUMN_KEYS).toEqual({ name: null });
  });
});

describe('tradeChips', () => {
  const trade = (id: string, name: string, vendorCount: number): TradeListItem =>
    ({ id, name, translationKey: null, vendorCount }) as TradeListItem;
  const displayName = (t: { name: string }) => t.name;
  const chips = (trades: TradeListItem[], activeId: string | null = null) =>
    tradeChips(trades, displayName, activeId, 'en', 'More trades');

  it('is null when no trade has a company', () => {
    expect(chips([])).toBeNull();
    expect(chips([trade('t-1', 'Roofing', 0)])).toBeNull();
  });

  it('shows up to four trades with companies, A to Z, without a More menu', () => {
    const result = chips([
      trade('t-3', 'Tiling', 1),
      trade('t-1', 'Electrical', 2),
      trade('t-2', 'Plumbing', 3),
      trade('t-0', 'Unused', 0),
    ]);

    expect(result!.options.map((o) => [o.value, o.label])).toEqual([
      ['t-1', 'Electrical'],
      ['t-2', 'Plumbing'],
      ['t-3', 'Tiling'],
    ]);
    expect(result!.overflow).toBeUndefined();
  });

  const five = [
    trade('t-a', 'Alpha', 5),
    trade('t-b', 'Bravo', 4),
    trade('t-c', 'Charlie', 3),
    trade('t-d', 'Delta', 2),
    trade('t-e', 'Echo', 1),
    trade('t-z', 'Zulu', 0),
  ];

  it('with more than four, shows the four with the most companies A to Z and lists every used trade in More', () => {
    const result = chips([...five].reverse());

    expect(result!.options.map((o) => o.label)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(result!.overflow!.label).toBe('More trades');
    expect(result!.overflow!.options.map((o) => o.label)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ]);
  });

  it('breaks ties in the count A to Z', () => {
    const result = chips([
      trade('t-1', 'Delta', 2),
      trade('t-2', 'Charlie', 2),
      trade('t-3', 'Bravo', 2),
      trade('t-4', 'Alpha', 2),
      trade('t-5', 'Echo', 2),
    ]);

    expect(result!.options.map((o) => o.label)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('adds the selected trade outside the top four as a fifth chip', () => {
    const result = chips(five, 't-e');

    expect(result!.options.map((o) => o.label)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ]);
  });

  it('shows a selected trade that has no company as a chip, but not in More', () => {
    const result = chips(five, 't-z');

    expect(result!.options.map((o) => o.label)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Zulu',
    ]);
    expect(result!.overflow!.options.map((o) => o.label)).not.toContain('Zulu');
  });

  it('shows a lone selected trade without companies as the only chip', () => {
    const result = chips([trade('t-z', 'Zulu', 0)], 't-z');

    expect(result!.options.map((o) => o.label)).toEqual(['Zulu']);
    expect(result!.overflow).toBeUndefined();
  });

  it('does not repeat a selected trade that is already a chip', () => {
    const result = chips(five, 't-a');

    expect(result!.options).toHaveLength(4);
  });

  it('ignores a selected id that is not a trade', () => {
    expect(chips(five, 't-gone')!.options).toHaveLength(4);
  });

  it('orders by the display name in the given locale', () => {
    const result = tradeChips(
      [trade('t-1', 'Zaun', 1), trade('t-2', 'Übergabe', 1)],
      displayName,
      null,
      'de',
      'Mehr',
    );

    expect(result!.options.map((o) => o.label)).toEqual(['Übergabe', 'Zaun']);
  });
});
