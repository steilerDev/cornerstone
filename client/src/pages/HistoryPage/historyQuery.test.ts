import { describe, it, expect } from '@jest/globals';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import {
  readHistoryFilters,
  writeHistoryFilters,
  toHistoryQuery,
  localDayKey,
  dayKeyOf,
  hasActiveFilters,
} from './historyQuery.js';
import type { HistoryFilters } from './historyQuery.js';

const EMPTY: HistoryFilters = {
  type: null,
  object: null,
  q: '',
  dateFrom: '',
  dateTo: '',
  includeDiary: false,
};

describe('readHistoryFilters', () => {
  it('returns empty filters for an empty URL', () => {
    expect(readHistoryFilters(new URLSearchParams())).toEqual(EMPTY);
  });

  it('parses every valid key', () => {
    const f = readHistoryFilters(
      new URLSearchParams(
        'type=payment&object=invoice:inv-1&q=T-001&dateFrom=2026-01-01&dateTo=2026-01-31&include=diary',
      ),
    );
    expect(f).toEqual({
      type: 'payment',
      object: { entityType: 'invoice', entityId: 'inv-1' },
      q: 'T-001',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      includeDiary: true,
    });
  });

  it('ignores invalid values', () => {
    const f = readHistoryFilters(
      new URLSearchParams(
        'type=bogus&object=budget_source:x&dateFrom=01-01-2026&dateTo=nope&include=other',
      ),
    );
    expect(f).toEqual(EMPTY);
  });

  it('ignores an object without id and an unmatched pattern', () => {
    expect(readHistoryFilters(new URLSearchParams('object=invoice:')).object).toBeNull();
    expect(readHistoryFilters(new URLSearchParams('object=invoice')).object).toBeNull();
  });
});

describe('writeHistoryFilters', () => {
  it('sets keys and keeps unknown ones', () => {
    const next = writeHistoryFilters(new URLSearchParams('keep=1'), {
      type: 'submission',
      object: { entityType: 'work_item', entityId: 'w-1' },
      q: 'abc',
      dateFrom: '2026-02-01',
      dateTo: '2026-02-02',
      includeDiary: true,
    });
    expect(Object.fromEntries(next)).toEqual({
      keep: '1',
      type: 'submission',
      object: 'work_item:w-1',
      q: 'abc',
      dateFrom: '2026-02-01',
      dateTo: '2026-02-02',
      include: 'diary',
    });
  });

  it('deletes keys for empty values', () => {
    const prev = new URLSearchParams(
      'type=payment&object=invoice:i&q=x&dateFrom=2026-01-01&dateTo=2026-01-02&include=diary&keep=1',
    );
    const next = writeHistoryFilters(prev, {
      type: null,
      object: null,
      q: '',
      dateFrom: '',
      dateTo: '',
      includeDiary: false,
    });
    expect(Object.fromEntries(next)).toEqual({ keep: '1' });
  });

  it('leaves keys alone that are not in the patch and does not mutate prev', () => {
    const prev = new URLSearchParams('type=payment&q=x');
    const next = writeHistoryFilters(prev, { q: 'y' });
    expect(next.get('type')).toBe('payment');
    expect(next.get('q')).toBe('y');
    expect(prev.get('q')).toBe('x');
  });
});

describe('writeHistoryFilters: undefined patch values', () => {
  it('treats an explicitly undefined value like an empty one and removes the key', () => {
    const prev = new URLSearchParams('type=payment&q=x&dateFrom=2026-01-01&dateTo=2026-01-02');
    const next = writeHistoryFilters(prev, {
      type: undefined,
      q: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(next.toString()).toBe('');
  });
});

describe('toHistoryQuery', () => {
  it('sends only paging for empty filters', () => {
    expect(toHistoryQuery(EMPTY, 1, 25, false)).toEqual({ page: 1, pageSize: 25 });
  });

  it('maps every filter, trims q and flags', () => {
    expect(
      toHistoryQuery(
        {
          type: 'payment',
          object: { entityType: 'invoice', entityId: 'inv-1' },
          q: '  T-001 ',
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          includeDiary: true,
        },
        3,
        25,
        true,
      ),
    ).toEqual({
      page: 3,
      pageSize: 25,
      type: 'payment',
      entityType: 'invoice',
      entityId: 'inv-1',
      q: 'T-001',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      includeDiary: true,
      showHidden: true,
    });
  });

  it('drops a whitespace-only q', () => {
    expect(toHistoryQuery({ ...EMPTY, q: '   ' }, 1, 25, false)).not.toHaveProperty('q');
  });
});

describe('day keys', () => {
  it('localDayKey formats the local date with zero padding', () => {
    const d = new Date(2026, 0, 5, 12, 0, 0);
    expect(localDayKey(d.toISOString())).toBe('2026-01-05');
  });

  it('dayKeyOf uses createdAt for automatic and entryDate for manual rows', () => {
    const created = new Date(2026, 2, 9, 10, 0, 0).toISOString();
    const auto = { isAutomatic: true, createdAt: created, entryDate: '2020-01-01' };
    const manual = { isAutomatic: false, createdAt: created, entryDate: '2026-03-07' };
    expect(dayKeyOf(auto as DiaryEntrySummary)).toBe('2026-03-09');
    expect(dayKeyOf(manual as DiaryEntrySummary)).toBe('2026-03-07');
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty filters and for the include toggle alone', () => {
    expect(hasActiveFilters(EMPTY)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY, includeDiary: true })).toBe(false);
  });

  it.each([
    ['type', { type: 'payment' as const }],
    ['object', { object: { entityType: 'invoice' as const, entityId: 'i' } }],
    ['q', { q: 'x' }],
    ['dateFrom', { dateFrom: '2026-01-01' }],
    ['dateTo', { dateTo: '2026-01-01' }],
  ])('is true when %s is set', (_name, patch) => {
    expect(hasActiveFilters({ ...EMPTY, ...patch })).toBe(true);
  });
});
