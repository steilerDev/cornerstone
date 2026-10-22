// No served route is an interim alias any more (Home, #2230, was the last), so the alias loop of
// navLabelKeyForRoute is exercised against a fixture: a NavConfig view whose route-map entry is
// mocked as `interim` with the alias URL of the `dashboard` redirect (`/project/overview`).
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import type * as PageIdentityTypes from './pageIdentity.js';
import type { NavSection, NavView } from './navConfig.js';

let navLabelKeyForRoute: typeof PageIdentityTypes.navLabelKeyForRoute;
const aliasView: { -readonly [K in keyof NavView]: NavView[K] } = {
  route: 'home',
  labelKey: 'navigation.home',
  term: 'Home',
  interimUntil: 'financing',
};

beforeAll(async () => {
  const actual = await import('./navConfig.js');
  const shared = await import('@cornerstone/shared');
  const tasks = actual.NAV_SECTIONS.find((s) => s.id === 'tasks') as NavSection;
  jest.unstable_mockModule('./navConfig.js', () => ({
    ...actual,
    NAV_SECTIONS: [{ ...tasks, views: [aliasView] }],
  }));
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...shared,
    getRouteEntry: (id: Parameters<typeof shared.getRouteEntry>[0]) => {
      const entry = shared.getRouteEntry(id);
      // The fixture view stands in for a not-yet-built page served at the alias URL.
      return id === 'home'
        ? { ...entry, stage: 'interim', interim: shared.getRouteEntry('dashboard').from }
        : entry;
    },
  }));
  ({ navLabelKeyForRoute } = await import('./pageIdentity.js'));
});

describe('navLabelKeyForRoute alias loop and interim views', () => {
  it('labels the alias page through a regular view (proves the fixture reaches the alias loop)', () => {
    delete aliasView.interimUntil;
    expect(navLabelKeyForRoute('dashboard')).toBe('navigation.home');
  });

  it('does not label the alias page through an interim view', () => {
    aliasView.interimUntil = 'financing';
    expect(navLabelKeyForRoute('dashboard')).toBeNull();
  });
});
