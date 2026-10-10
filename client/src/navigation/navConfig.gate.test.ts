// No served nav route is Paperless-gated today (Documents is still planned), so the gate branch of
// navSections is exercised against a patched route lookup.
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import type * as SharedTypes from '@cornerstone/shared';
import type * as NavConfigTypes from './navConfig.js';

let navSections: typeof NavConfigTypes.navSections;

beforeAll(async () => {
  const actual = await import('@cornerstone/shared');
  const gated = new Set(['invoices', 'scheduleCalendar']);
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...actual,
    getRouteEntry: (id: Parameters<typeof SharedTypes.getRouteEntry>[0]) => {
      const entry = actual.getRouteEntry(id);
      if (!gated.has(id)) return entry;
      return { ...entry, gate: id === 'invoices' ? 'paperless' : 'paperless+ai' };
    },
  }));
  ({ navSections } = await import('./navConfig.js'));
});

const routesOf = (sections: ReturnType<typeof NavConfigTypes.navSections>) =>
  sections.flatMap((s) => s.views.map((v) => v.route));

describe('navSections with Paperless-gated routes', () => {
  it('hides paperless and paperless+ai routes when Paperless is not configured', () => {
    const routes = routesOf(navSections({ role: 'admin', paperlessConfigured: false }));
    expect(routes).not.toContain('invoices');
    expect(routes).not.toContain('scheduleCalendar');
    expect(routes).toContain('scheduleGantt');
  });

  it('shows them when Paperless is configured', () => {
    const routes = routesOf(navSections({ role: 'admin', paperlessConfigured: true }));
    expect(routes).toContain('invoices');
    expect(routes).toContain('scheduleCalendar');
  });
});
