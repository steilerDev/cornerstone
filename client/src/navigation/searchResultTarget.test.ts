import { describe, it, expect } from '@jest/globals';
import { SEARCH_RESULT_TYPES, getRouteEntry, routeUrl } from '@cornerstone/shared';
import type { SearchResultItem } from '@cornerstone/shared';
import { searchResultTarget } from './searchResultTarget.js';

function item(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    id: '42',
    label: 'Synthetic',
    sublabel: null,
    matchedField: 'title',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath: null,
    parent: null,
    ...overrides,
  };
}

describe('searchResultTarget', () => {
  it.each([
    ['work_item', routeUrl('workItem', { id: '42' })],
    ['milestone', routeUrl('milestone', { id: '42' })],
    ['household_item', routeUrl('householdItem', { id: '42' })],
    ['invoice', routeUrl('invoice', { id: '42' })],
    ['vendor', routeUrl('company', { id: '42' })],
    ['diary_entry', routeUrl('diaryEntry', { id: '42' })],
  ] as const)('opens a %s in the app at its own page', (type, href) => {
    expect(searchResultTarget(type, item())).toEqual({ kind: 'app', href });
  });

  it('returns a target for every search result type', () => {
    for (const type of SEARCH_RESULT_TYPES) {
      const target = searchResultTarget(type, item());
      expect(target).not.toBeNull();
    }
  });

  describe('budget_line', () => {
    it('opens the parent work item', () => {
      const parent = { type: 'work_item', id: '7', label: 'T' } as const;
      expect(searchResultTarget('budget_line', item({ parent }))).toEqual({
        kind: 'app',
        href: routeUrl('workItem', { id: '7' }),
      });
    });

    it('opens the parent household item', () => {
      const parent = { type: 'household_item', id: '8', label: 'P' } as const;
      expect(searchResultTarget('budget_line', item({ parent }))).toEqual({
        kind: 'app',
        href: routeUrl('householdItem', { id: '8' }),
      });
    });

    it('opens the linked invoice of an orphan line', () => {
      const parent = { type: 'invoice', id: '9', label: 'INV-1' } as const;
      expect(searchResultTarget('budget_line', item({ parent }))).toEqual({
        kind: 'app',
        href: routeUrl('invoice', { id: '9' }),
      });
    });

    it('falls back to the budget overview without a parent', () => {
      expect(searchResultTarget('budget_line', item({ parent: null }))).toEqual({
        kind: 'app',
        href: routeUrl('budgetOverview'),
      });
    });
  });

  describe('defensive exhaustiveness fallbacks', () => {
    it('returns null for an unknown result type from a newer server', () => {
      const unknown = 'future_type' as unknown as Parameters<typeof searchResultTarget>[0];
      expect(searchResultTarget(unknown, item())).toBeNull();
    });

    it('returns null for an unknown budget-line parent type', () => {
      const parent = {
        type: 'future',
        id: '1',
        label: null,
      } as unknown as SearchResultItem['parent'];
      expect(searchResultTarget('budget_line', item({ parent }))).toBeNull();
    });
  });

  describe('former interim targets (all routes served now)', () => {
    it('area opens the area page of the hit now that route `area` is served (#2251)', () => {
      expect(getRouteEntry('area').stage).toBe('done');
      const href = routeUrl('area', { id: 'a-7' });
      expect(href).toBe('/areas/a-7');
      expect(searchResultTarget('area', item({ id: 'a-7' }))).toEqual({
        kind: 'app',
        href,
      });
    });
  });

  describe('paperless_document (#2252)', () => {
    it('opens the Documents page with the details panel of the hit', () => {
      expect(getRouteEntry('documents').stage).toBe('done');
      expect(searchResultTarget('paperless_document', item({ id: '5' }))).toEqual({
        kind: 'app',
        href: '/documents?doc=5',
      });
    });

    it('never opens Paperless itself (no external target)', () => {
      expect(searchResultTarget('paperless_document', item({ id: '5' }))?.kind).toBe('app');
    });

    it('encodes the id in the query', () => {
      expect(searchResultTarget('paperless_document', item({ id: 'a/b c' }))).toEqual({
        kind: 'app',
        href: '/documents?doc=a%2Fb+c',
      });
    });
  });
});
