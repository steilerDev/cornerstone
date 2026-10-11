import { describe, it, expect } from '@jest/globals';
import { getRouteEntry, routeUrl } from '@cornerstone/shared';
import {
  CREATE_MENU_ENTRY_IDS,
  CREATE_TARGETS,
  createHref,
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

  it('marks only the three ObjectForm targets as dialogs', () => {
    const dialogs = CREATE_MENU_ENTRY_IDS.filter((id) => CREATE_TARGETS[id].dialog);
    expect(dialogs).toEqual(['task', 'purchase', 'milestone']);
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
        routeUrl('diaryEntryNew', undefined, { date: '2026-03-01' }),
      );
      expect(createHref('company', all)).toBe(routeUrl('vendors', undefined, { create: '1' }));
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

    it('drops invalid pre-fill values', () => {
      expect(createHref('milestone', { date: '2026-02-30' })).toBe(routeUrl('milestoneNew'));
      expect(createHref('task', { areaId: 'a/b' })).toBe(routeUrl('workItemNew'));
    });
  });
});
