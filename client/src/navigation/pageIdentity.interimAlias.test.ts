// No real interim Money view is an alias (its route-map `interim` is 'page' or it is done), so
// the alias loop of navLabelKeyForRoute can only be exercised against a fixture NavConfig whose
// view stands in for the Home alias (`dashboard` is the served page at the alias URL).
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
  const tasks = actual.NAV_SECTIONS.find((s) => s.id === 'tasks') as NavSection;
  jest.unstable_mockModule('./navConfig.js', () => ({
    ...actual,
    NAV_SECTIONS: [{ ...tasks, views: [aliasView] }],
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
