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

const NO_PAPERLESS = { paperlessBaseUrl: null };

describe('searchResultTarget', () => {
  it.each([
    ['work_item', routeUrl('workItem', { id: '42' })],
    ['milestone', routeUrl('milestone', { id: '42' })],
    ['household_item', routeUrl('householdItem', { id: '42' })],
    ['invoice', routeUrl('invoice', { id: '42' })],
    ['vendor', routeUrl('company', { id: '42' })],
    ['diary_entry', routeUrl('diaryEntry', { id: '42' })],
  ] as const)('opens a %s in the app at its own page', (type, href) => {
    expect(searchResultTarget(type, item(), NO_PAPERLESS)).toEqual({ kind: 'app', href });
  });

  it('returns a target for every search result type', () => {
    for (const type of SEARCH_RESULT_TYPES) {
      const target = searchResultTarget(type, item(), { paperlessBaseUrl: 'https://p.example' });
      expect(target).not.toBeNull();
    }
  });

  describe('budget_line', () => {
    it('opens the parent work item', () => {
      const parent = { type: 'work_item', id: '7', label: 'T' } as const;
      expect(searchResultTarget('budget_line', item({ parent }), NO_PAPERLESS)).toEqual({
        kind: 'app',
        href: routeUrl('workItem', { id: '7' }),
      });
    });

    it('opens the parent household item', () => {
      const parent = { type: 'household_item', id: '8', label: 'P' } as const;
      expect(searchResultTarget('budget_line', item({ parent }), NO_PAPERLESS)).toEqual({
        kind: 'app',
        href: routeUrl('householdItem', { id: '8' }),
      });
    });

    it('opens the linked invoice of an orphan line', () => {
      const parent = { type: 'invoice', id: '9', label: 'INV-1' } as const;
      expect(searchResultTarget('budget_line', item({ parent }), NO_PAPERLESS)).toEqual({
        kind: 'app',
        href: routeUrl('invoice', { id: '9' }),
      });
    });

    it('falls back to the budget overview without a parent', () => {
      expect(searchResultTarget('budget_line', item({ parent: null }), NO_PAPERLESS)).toEqual({
        kind: 'app',
        href: routeUrl('budgetOverview'),
      });
    });
  });

  describe('defensive exhaustiveness fallbacks', () => {
    it('returns null for an unknown result type from a newer server', () => {
      const unknown = 'future_type' as unknown as Parameters<typeof searchResultTarget>[0];
      expect(searchResultTarget(unknown, item(), NO_PAPERLESS)).toBeNull();
    });

    it('returns null for an unknown budget-line parent type', () => {
      const parent = {
        type: 'future',
        id: '1',
        label: null,
      } as unknown as SearchResultItem['parent'];
      expect(searchResultTarget('budget_line', item({ parent }), NO_PAPERLESS)).toBeNull();
    });
  });

  describe('interim targets (routes not yet served)', () => {
    it('area opens the Manage areas tab while route `area` is planned', () => {
      expect(getRouteEntry('area').stage).toBe('planned');
      const href = routeUrl('settingsManage', undefined, { tab: 'areas' });
      expect(href).toContain('tab=areas');
      expect(searchResultTarget('area', item(), NO_PAPERLESS)).toEqual({ kind: 'app', href });
    });

    it('paperless documents open in Paperless while route `documents` is planned', () => {
      expect(getRouteEntry('documents').stage).toBe('planned');
      expect(
        searchResultTarget('paperless_document', item({ id: '5' }), {
          paperlessBaseUrl: 'https://paperless.example',
        }),
      ).toEqual({ kind: 'external', href: 'https://paperless.example/documents/5/details' });
    });

    it('INTERIM PIN: when `area` or `documents` is served, update searchResultTarget and this test', () => {
      // Fails on purpose when the Area page / Documents page story flips the stage: the mapper must
      // then link to routeUrl('area', { id }) / the Documents page instead of the interim target.
      const flipped = (['area', 'documents'] as const).filter(
        (id) => getRouteEntry(id).stage !== 'planned',
      );
      expect(flipped).toEqual([]);
    });
  });

  describe('paperless_document', () => {
    it('strips trailing slashes from the base URL', () => {
      expect(
        searchResultTarget('paperless_document', item({ id: '5' }), {
          paperlessBaseUrl: 'https://paperless.example///',
        }),
      ).toEqual({ kind: 'external', href: 'https://paperless.example/documents/5/details' });
    });

    it('keeps a base path', () => {
      expect(
        searchResultTarget('paperless_document', item({ id: '5' }), {
          paperlessBaseUrl: 'https://host.example/paperless/',
        }),
      ).toEqual({ kind: 'external', href: 'https://host.example/paperless/documents/5/details' });
    });

    it('encodes the id', () => {
      expect(
        searchResultTarget('paperless_document', item({ id: 'a/b c' }), {
          paperlessBaseUrl: 'https://p.example',
        }),
      ).toEqual({ kind: 'external', href: 'https://p.example/documents/a%2Fb%20c/details' });
    });

    it('returns null without a Paperless base URL', () => {
      expect(searchResultTarget('paperless_document', item(), NO_PAPERLESS)).toBeNull();
    });
  });
});
