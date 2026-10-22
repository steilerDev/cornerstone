/**
 * Attention deep links (#2229): rule -> route id + params + query, and the guarantee that every
 * link points at a served route.
 *
 * Mutations these tests catch:
 *  - a progress payment linking to the deposit id instead of the invoice id;
 *  - N2 group linking to a single task;
 *  - an N11/S1 link to a route that is still planned (routeUrl throws on the client);
 *  - the interim N11/S1 targets staying in place after the grant/fundingSource routes are served.
 */

import { describe, it, expect } from '@jest/globals';
import { getRouteEntry, isRouteServed, routeUrl } from '@cornerstone/shared';
import type { AttentionLink } from '@cornerstone/shared';
import { ATTENTION_LINK_ROUTES, ATTENTION_RULES } from '@cornerstone/shared';
import { attentionLinkOf } from './attentionLinks.js';

describe('attentionLinkOf', () => {
  it.each([
    ['N1', 'wi-1', { route: 'workItem', params: { id: 'wi-1' }, query: {} }],
    ['H4', 'wi-6', { route: 'workItem', params: { id: 'wi-6' }, query: {} }],
    ['N2', 'wi-7', { route: 'workItem', params: { id: 'wi-7' }, query: {} }],
    ['N3', '12', { route: 'milestone', params: { id: '12' }, query: {} }],
    ['N8', 'src-1', { route: 'bankReport', params: {}, query: { sourceId: 'src-1' } }],
    ['N9', 'off-1', { route: 'invoice', params: { id: 'off-1' }, query: {} }],
    ['H2', 'inv-9', { route: 'invoice', params: { id: 'inv-9' }, query: {} }],
    ['N10', 'hi-1', { route: 'householdItem', params: { id: 'hi-1' }, query: {} }],
    ['N12', 'd-1', { route: 'diaryEntry', params: { id: 'd-1' }, query: {} }],
    ['H1', 'd-2', { route: 'diaryEntryEdit', params: { id: 'd-2' }, query: {} }],
  ] as const)('%s for %s', (rule, subjectId, expected) => {
    expect(attentionLinkOf({ rule, subjectId })).toEqual(expected);
  });

  it('links a grouped N2 row to the task list, not to a task', () => {
    expect(attentionLinkOf({ rule: 'N2', subjectId: '2026-03-02', isGroup: true })).toEqual({
      route: 'workItems',
      params: {},
      query: {},
    });
  });

  it.each(['N4', 'N5', 'N6'] as const)(
    '%s final payment links to the invoice with no query',
    (rule) => {
      expect(attentionLinkOf({ rule, subjectId: 'inv-1' })).toEqual({
        route: 'invoice',
        params: { id: 'inv-1' },
        query: {},
      });
      expect(attentionLinkOf({ rule, subjectId: 'inv-1', invoiceId: 'inv-1' })).toEqual({
        route: 'invoice',
        params: { id: 'inv-1' },
        query: {},
      });
    },
  );

  it.each(['N4', 'N5'] as const)(
    '%s progress payment links to the invoice with ?payment=<depositId>',
    (rule) => {
      expect(
        attentionLinkOf({ rule, subjectId: 'dep-1', invoiceId: 'inv-4', depositId: 'dep-1' }),
      ).toEqual({ route: 'invoice', params: { id: 'inv-4' }, query: { payment: 'dep-1' } });
    },
  );

  it('falls back to the subject id when a progress payment has no invoice id', () => {
    expect(attentionLinkOf({ rule: 'N4', subjectId: 'inv-9', depositId: 'dep-9' })).toEqual({
      route: 'invoice',
      params: { id: 'inv-9' },
      query: { payment: 'dep-9' },
    });
  });

  it('N11 links to the subsidies list (interim) and S1 to the sources list (interim)', () => {
    expect(attentionLinkOf({ rule: 'N11', subjectId: 'gr-1' })).toEqual({
      route: 'budgetSubsidies',
      params: {},
      query: {},
    });
    expect(attentionLinkOf({ rule: 'S1', subjectId: 'src-2' })).toEqual({
      route: 'budgetSources',
      params: {},
      query: {},
    });
  });

  it('throws on an unknown rule', () => {
    expect(() => attentionLinkOf({ rule: 'N7' as never, subjectId: 'x' })).toThrow(
      /Unknown attention rule/,
    );
  });

  it('every rule yields a link to a served route that routeUrl can build', () => {
    for (const rule of [...ATTENTION_RULES, 'S1' as const]) {
      const inputs = [
        { rule, subjectId: 'id-1' },
        { rule, subjectId: 'id-1', invoiceId: 'inv-1', depositId: 'dep-1' },
        { rule, subjectId: '2026-03-02', isGroup: true },
      ];
      for (const input of inputs) {
        const link: AttentionLink = attentionLinkOf(input);
        expect((ATTENTION_LINK_ROUTES as readonly string[]).includes(link.route)).toBe(true);
        expect(isRouteServed(link.route)).toBe(true);
        const url = (routeUrl as (id: string, p: object, q: object) => string)(
          link.route,
          link.params,
          link.query,
        );
        expect(url.startsWith('/')).toBe(true);
      }
    }
  });

  it('never returns a path string in a link', () => {
    const link = attentionLinkOf({ rule: 'N1', subjectId: 'wi-1' });
    expect(Object.keys(link).sort()).toEqual(['params', 'query', 'route']);
    expect(link.route.startsWith('/')).toBe(false);
  });
});

describe('interim link targets (spec test)', () => {
  it('the grant route is still planned: when it is served, switch the N11 link in attentionLinks.ts to route "grant"', () => {
    expect(getRouteEntry('grant').stage).toBe('planned');
  });

  it('the fundingSource route is still planned: when it is served, switch the S1 link in attentionLinks.ts to route "fundingSource"', () => {
    expect(getRouteEntry('fundingSource').stage).toBe('planned');
  });
});
