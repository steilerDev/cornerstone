import { describe, it, expect } from '@jest/globals';
import {
  EMPTY_DIARY_FILTERS,
  activeFilterCount,
  hasAnyFilter,
  readDiaryFilters,
  writeDiaryFilters,
} from './diaryQuery.js';

describe('readDiaryFilters', () => {
  it('returns the empty state for no params', () => {
    expect(readDiaryFilters(new URLSearchParams())).toEqual(EMPTY_DIARY_FILTERS);
  });

  it('reads every key', () => {
    const state = readDiaryFilters(
      new URLSearchParams(
        'q=slab&types=daily_log,delivery&dateFrom=2026-10-01&dateTo=2026-10-31&areaId=a1&companyId=c1&status=draft',
      ),
    );
    expect(state).toEqual({
      q: 'slab',
      types: ['daily_log', 'delivery'],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      areaId: 'a1',
      companyId: 'c1',
      drafts: true,
    });
  });

  it('drops unknown and empty types', () => {
    const state = readDiaryFilters(new URLSearchParams('types=daily_log,bogus,,'));
    expect(state.types).toEqual(['daily_log']);
  });

  it('treats the old ?status=saved link like no status', () => {
    expect(readDiaryFilters(new URLSearchParams('status=saved')).drafts).toBe(false);
  });
});

describe('writeDiaryFilters', () => {
  it('merges a patch into the previous params and keeps unrelated keys', () => {
    const next = writeDiaryFilters(new URLSearchParams('foo=1&q=old'), {
      q: 'new',
      types: ['issue', 'site_visit'],
      areaId: 'a1',
    });
    expect(next.get('foo')).toBe('1');
    expect(next.get('q')).toBe('new');
    expect(next.get('types')).toBe('issue,site_visit');
    expect(next.get('areaId')).toBe('a1');
  });

  it('writes dates, company and drafts', () => {
    const next = writeDiaryFilters(new URLSearchParams(), {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      companyId: 'c1',
      drafts: true,
    });
    expect(next.toString()).toBe('dateFrom=2026-10-01&dateTo=2026-10-31&companyId=c1&status=draft');
  });

  it('drops keys whose value is empty', () => {
    const next = writeDiaryFilters(
      new URLSearchParams(
        'q=a&types=issue&dateFrom=2026-10-01&dateTo=2026-10-02&areaId=a&companyId=c&status=draft',
      ),
      { q: '', types: [], dateFrom: '', dateTo: '', areaId: '', companyId: '', drafts: false },
    );
    expect(next.toString()).toBe('');
  });

  it('leaves keys outside the patch alone and always drops page', () => {
    const next = writeDiaryFilters(new URLSearchParams('page=3&q=keep'), { areaId: 'a1' });
    expect(next.has('page')).toBe(false);
    expect(next.get('q')).toBe('keep');
  });

  it('does not mutate the previous params', () => {
    const prev = new URLSearchParams('q=a');
    writeDiaryFilters(prev, { q: '' });
    expect(prev.get('q')).toBe('a');
  });
});

describe('activeFilterCount and hasAnyFilter', () => {
  it('does not count the search text', () => {
    expect(activeFilterCount({ ...EMPTY_DIARY_FILTERS, q: 'slab' })).toBe(0);
  });

  it('counts each type, area, company, from, to and drafts', () => {
    expect(
      activeFilterCount({
        q: 'slab',
        types: ['daily_log', 'issue'],
        dateFrom: '2026-10-01',
        dateTo: '2026-10-31',
        areaId: 'a1',
        companyId: 'c1',
        drafts: true,
      }),
    ).toBe(7);
  });

  it('counts single fields as one', () => {
    expect(activeFilterCount({ ...EMPTY_DIARY_FILTERS, dateFrom: '2026-10-01' })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_DIARY_FILTERS, dateTo: '2026-10-01' })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_DIARY_FILTERS, drafts: true })).toBe(1);
  });

  it('hasAnyFilter includes the search text', () => {
    expect(hasAnyFilter(EMPTY_DIARY_FILTERS)).toBe(false);
    expect(hasAnyFilter({ ...EMPTY_DIARY_FILTERS, q: 'x' })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_DIARY_FILTERS, areaId: 'a' })).toBe(true);
  });
});
