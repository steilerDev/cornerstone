// paperlessStatusNeeded skips a gated route that is not served. Today's only real gated route is
// `documents` and it is served, so the lookup is patched to mark it unserved (a future plan
// revision can reintroduce planned ids).
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import type * as NavConfigTypes from './navConfig.js';

let paperlessStatusNeeded: typeof NavConfigTypes.paperlessStatusNeeded;
let NAV_SECTIONS: typeof NavConfigTypes.NAV_SECTIONS;
let isRouteVisible: typeof NavConfigTypes.isRouteVisible;
let navSections: typeof NavConfigTypes.navSections;

beforeAll(async () => {
  const actual = await import('@cornerstone/shared');
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...actual,
    isRouteServed: (id: Parameters<typeof actual.isRouteServed>[0]) =>
      id === 'documents' ? false : actual.isRouteServed(id),
  }));
  ({ paperlessStatusNeeded, NAV_SECTIONS, isRouteVisible, navSections } =
    await import('./navConfig.js'));
});

describe('route visibility with an unserved route', () => {
  it('treats an unserved route as not visible and drops its section', () => {
    const ctx = { role: 'admin', paperlessConfigured: true } as const;
    expect(isRouteVisible('documents', ctx)).toBe(false);
    expect(navSections(ctx).map((s) => s.route)).not.toContain('documents');
  });
});

describe('paperlessStatusNeeded with an unserved gated route', () => {
  it('ignores the gated route when it is not served (default and explicit sections)', () => {
    expect(paperlessStatusNeeded()).toBe(false);
    expect(paperlessStatusNeeded(NAV_SECTIONS)).toBe(false);
  });
});
