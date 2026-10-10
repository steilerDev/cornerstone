// Once Financing is served, the interim Money views vanish from navSections on their own and
// Financing appears (decision D2). No such route is served today, so the lookup is patched.
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import type * as NavConfigTypes from './navConfig.js';

let navSections: typeof NavConfigTypes.navSections;

beforeAll(async () => {
  const actual = await import('@cornerstone/shared');
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...actual,
    isRouteServed: (id: Parameters<typeof actual.isRouteServed>[0]) =>
      id === 'financing' ? true : actual.isRouteServed(id),
  }));
  ({ navSections } = await import('./navConfig.js'));
});

const moneyViews = () =>
  navSections({ role: 'admin', paperlessConfigured: true })
    .find((s) => s.id === 'money')
    ?.views.map((v) => v.route);

describe('navSections once Financing is served', () => {
  it('drops the three interim Money views and shows Financing', () => {
    expect(moneyViews()).toEqual(['invoices', 'financing']);
  });
});
