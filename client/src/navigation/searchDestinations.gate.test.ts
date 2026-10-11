// No served route is Paperless-gated today, so the gate is exercised against a patched route lookup
// (same technique as navConfig.gate.test.ts). Gated: invoices (paperless), scheduleCalendar (paperless+ai).
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import type * as SharedTypes from '@cornerstone/shared';
import type * as DestinationTypes from './searchDestinations.js';

let findSearchDestinations: typeof DestinationTypes.findSearchDestinations;

beforeAll(async () => {
  const actual = await import('@cornerstone/shared');
  const gated: Record<string, 'paperless' | 'paperless+ai'> = {
    invoices: 'paperless',
    scheduleCalendar: 'paperless+ai',
  };
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...actual,
    getRouteEntry: (id: Parameters<typeof SharedTypes.getRouteEntry>[0]) => {
      const entry = actual.getRouteEntry(id);
      return gated[id] ? { ...entry, gate: gated[id] } : entry;
    },
  }));
  ({ findSearchDestinations } = await import('./searchDestinations.js'));
});

const label = (key: string) => key;
const WITHOUT = { role: 'admin', paperlessConfigured: false } as const;
const WITH = { role: 'admin', paperlessConfigured: true } as const;

describe('findSearchDestinations with Paperless-gated routes', () => {
  it('hides a gated view and its filtered term extras when Paperless is not configured', () => {
    for (const word of [
      'Invoice',
      'Submitted',
      'claimed',
      'To pay',
      'Paid',
      'Offer',
      'Quotation',
    ]) {
      const routes = findSearchDestinations(word, WITHOUT, label).map((d) => d.route);
      expect(routes).not.toContain('invoices');
    }
  });

  it('hides a paperless+ai view when Paperless is not configured', () => {
    const routes = findSearchDestinations('Calendar', WITHOUT, label).map((d) => d.route);
    expect(routes).not.toContain('scheduleCalendar');
  });

  it('keeps ungated destinations when Paperless is not configured', () => {
    expect(findSearchDestinations('Gantt', WITHOUT, label)[0]?.route).toBe('scheduleGantt');
    expect(findSearchDestinations('vendor', WITHOUT, label)[0]?.route).toBe('companies');
  });

  it('returns the gated destinations when Paperless is configured', () => {
    expect(findSearchDestinations('claimed', WITH, label)[0]).toMatchObject({
      route: 'invoices',
      query: { status: 'claimed' },
    });
    expect(findSearchDestinations('Calendar', WITH, label).map((d) => d.route)).toContain(
      'scheduleCalendar',
    );
  });
});
