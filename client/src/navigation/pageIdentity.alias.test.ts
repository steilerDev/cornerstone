import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import * as realShared from '@cornerstone/shared';
import type * as PageIdentityTypes from './pageIdentity.js';

/**
 * A NavConfig route served by an interim alias URL: the real route map has no such entry yet
 * (only an id-less redirect row), so the alias branch of `navLabelKeyForRoute` is driven with a
 * route map whose Home entry is an interim alias of `householdItemEdit`'s path.
 */
jest.unstable_mockModule('@cornerstone/shared', () => ({
  ...realShared,
  getRouteEntry: (id: Parameters<typeof realShared.getRouteEntry>[0]) => {
    const entry = realShared.getRouteEntry(id);
    if (id === 'home') {
      return { ...entry, stage: 'interim', interim: '/alias/for/budget-sources' };
    }
    if (id === 'budgetSources') return { ...entry, from: '/alias/for/budget-sources' };
    return entry;
  },
}));

let navLabelKeyForRoute: typeof PageIdentityTypes.navLabelKeyForRoute;

beforeAll(async () => {
  ({ navLabelKeyForRoute } = await import('./pageIdentity.js'));
});

describe('navLabelKeyForRoute with an interim alias route (#2231)', () => {
  it('labels a route by the NavConfig section whose interim alias is its URL', () => {
    expect(navLabelKeyForRoute('budgetSources')).toBe('navigation.home');
  });

  it('does not label a route whose URL differs from the alias', () => {
    expect(navLabelKeyForRoute('budgetSubsidies')).toBeNull();
  });
});
