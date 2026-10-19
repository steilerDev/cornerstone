import { describe, it, expect } from '@jest/globals';
import { getRouteEntry, routeUrl } from '@cornerstone/shared';
import {
  CREATE_MENU_ENTRY_IDS,
  CREATE_TARGETS,
  createHref,
  quickLogHref,
  visibleCreateEntries,
} from './createEntries.js';

describe('createEntries', () => {
  it('lists the entries in menu order (AC1)', () => {
    expect(CREATE_MENU_ENTRY_IDS).toEqual([
      'diaryEntry',
      'task',
      'purchase',
      'invoice',
      'offer',
      'company',
      'milestone',
      'fundingSource',
      'grant',
    ]);
  });

  it('shows Funding source and Grant only on Money pages', () => {
    expect(visibleCreateEntries(false)).toEqual([
      'diaryEntry',
      'task',
      'purchase',
      'invoice',
      'offer',
      'company',
      'milestone',
    ]);
    expect(visibleCreateEntries(true)).toEqual([...CREATE_MENU_ENTRY_IDS]);
  });

  it('marks only the four ObjectForm targets as dialogs', () => {
    const dialogs = CREATE_MENU_ENTRY_IDS.filter((id) => CREATE_TARGETS[id].dialog);
    expect(dialogs).toEqual(['task', 'purchase', 'company', 'milestone']);
  });

  it('serves every target route and the route map carries every key the target sends', () => {
    for (const id of CREATE_MENU_ENTRY_IDS) {
      const target = CREATE_TARGETS[id];
      const entry = getRouteEntry(target.route) as { carries?: readonly string[] };
      expect(entry).toBeDefined();
      const carries = entry.carries ?? [];
      // The dialog and invoice routes declare the pre-fill and query keys they read.
      if (target.dialog || target.route === 'invoices') {
        for (const key of [...target.prefill, ...Object.keys(target.query)]) {
          expect(carries).toContain(key);
        }
      }
    }
  });

  describe('createHref', () => {
    const all = { areaId: 'a1', companyId: 'c1', date: '2026-03-01' };

    it('adds only the keys each target accepts', () => {
      expect(createHref('task', all)).toBe(routeUrl('workItemNew', undefined, { areaId: 'a1' }));
      expect(createHref('purchase', all)).toBe(
        routeUrl('householdItemNew', undefined, { areaId: 'a1', companyId: 'c1' }),
      );
      expect(createHref('milestone', all)).toBe(
        routeUrl('milestoneNew', undefined, { date: '2026-03-01' }),
      );
      expect(createHref('diaryEntry', all)).toBe(
        routeUrl('diaryEntryNew', undefined, { areaId: 'a1', date: '2026-03-01' }),
      );
      expect(createHref('company', all)).toBe(routeUrl('companyNew'));
      expect(createHref('fundingSource', all)).toBe(
        routeUrl('budgetSources', undefined, { create: '1' }),
      );
      expect(createHref('grant', all)).toBe(
        routeUrl('budgetSubsidies', undefined, { create: '1' }),
      );
    });

    it('presets kind=offer only for the Offer row', () => {
      expect(createHref('offer', all)).toBe(
        routeUrl('invoices', undefined, { create: '1', kind: 'offer', companyId: 'c1' }),
      );
      expect(createHref('invoice', all)).toBe(
        routeUrl('invoices', undefined, { create: '1', companyId: 'c1' }),
      );
      expect(createHref('invoice', {})).not.toContain('kind');
    });

    it('opens the Company row at /companies/new and sends no query, whatever the context (#2213)', () => {
      expect(createHref('company', {})).toBe('/companies/new');
      expect(createHref('company', { areaId: 'a1', companyId: 'c1', date: '2026-03-01' })).toBe(
        '/companies/new',
      );
      expect(CREATE_TARGETS.company).toMatchObject({
        route: 'companyNew',
        query: {},
        prefill: [],
        moneyOnly: false,
        dialog: true,
      });
    });

    it('drops invalid pre-fill values', () => {
      expect(createHref('milestone', { date: '2026-02-30' })).toBe(routeUrl('milestoneNew'));
      expect(createHref('task', { areaId: 'a/b' })).toBe(routeUrl('workItemNew'));
    });
  });
});

describe('quickLogHref', () => {
  const all = { areaId: 'a1', companyId: 'c1', date: '2026-03-01' };

  it('keeps the area, drops date and company, and orders areaId before start', () => {
    expect(quickLogHref('note', all)).toBe('/diary/new?areaId=a1&start=note');
    expect(quickLogHref('note', all)).toBe(
      routeUrl('diaryEntryNew', undefined, { areaId: 'a1', start: 'note' }),
    );
  });

  it.each(['photo', 'note', 'delivery'] as const)(
    'sends only start=%s without a context',
    (mode) => {
      expect(quickLogHref(mode, {})).toBe(`/diary/new?start=${mode}`);
    },
  );

  it('never back-dates: a calendar page date is not carried', () => {
    expect(quickLogHref('photo', { date: '2026-03-01' })).not.toContain('date');
  });

  it('drops an invalid area id', () => {
    expect(quickLogHref('delivery', { areaId: 'a/b' })).toBe('/diary/new?start=delivery');
  });

  it('is served by a route that carries start, areaId and date', () => {
    const entry = getRouteEntry('diaryEntryNew') as { carries?: readonly string[] };
    expect(entry.carries).toEqual(expect.arrayContaining(['start', 'areaId', 'date']));
  });
});
