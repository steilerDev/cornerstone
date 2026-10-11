import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRouteServed } from '@cornerstone/shared';
import type { RouteId } from '@cornerstone/shared';
import { GLOSSARY } from '../i18n/glossary.js';
import type { Glossary, GlossaryTerm } from '../i18n/glossary.js';
import { NAV_SECTIONS } from './navConfig.js';
import type { NavContext, NavLabelKey } from './navConfig.js';
import { findSearchDestinations } from './searchDestinations.js';

const I18N_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../i18n');

function labelsOf(locale: 'en' | 'de'): (key: NavLabelKey) => string {
  const common = JSON.parse(
    fs.readFileSync(path.join(I18N_DIR, locale, 'common.json'), 'utf8'),
  ) as {
    navigation: Record<string, string>;
  };
  return (key) => common.navigation[key.replace(/^navigation\./, '')] ?? key;
}

const EN = labelsOf('en');
const DE = labelsOf('de');

const ADMIN: NavContext = { role: 'admin', paperlessConfigured: true };
const MEMBER: NavContext = { role: 'member', paperlessConfigured: true };

function routesOf(query: string, ctx: NavContext = ADMIN, labelOf = EN): RouteId[] {
  return findSearchDestinations(query, ctx, labelOf).map((d) => d.route);
}

describe('findSearchDestinations: AC4 alias words', () => {
  // [word, expected route, expected query, resolved through a former name]
  const AC4: [string, RouteId, Record<string, string> | undefined, boolean][] = [
    ['vendor', 'companies', undefined, true],
    ['claimed', 'invoices', { status: 'claimed' }, true],
    ['work item', 'workItems', undefined, true],
    ['Gantt', 'scheduleGantt', undefined, true],
    ['Timeline', 'scheduleGantt', undefined, true],
    ['Zeitplan', 'scheduleGantt', undefined, false],
    ['Calendar', 'scheduleCalendar', undefined, false],
    ['Milestones', 'milestones', undefined, false],
  ];

  it.each(AC4)('"%s" resolves to %s', (word, route, query, viaFormerName) => {
    const hits = findSearchDestinations(word, ADMIN, EN);
    const hit = hits.find(
      (h) => h.route === route && JSON.stringify(h.query) === JSON.stringify(query),
    );
    expect(hit).toBeDefined();
    expect(hit!.viaFormerName).toBe(viaFormerName);
    // The best hit for an alias is the destination itself, not an unrelated entry.
    expect(hits[0]!.route).toBe(route);
  });

  it.each([
    ['Firmen', 'companies'],
    ['Auftragnehmer', 'companies'],
    ['Aufgaben', 'workItems'],
    ['Arbeitspaket', 'workItems'],
    ['Eingereicht', 'invoices'],
    ['Meilensteine', 'milestones'],
    ['Kalender', 'scheduleCalendar'],
    ['Bautagebuch', 'diary'],
    ['Rechnungen', 'invoices'],
    ['Anschaffungen', 'householdItems'],
    ['Gantt-Diagramm', 'scheduleGantt'],
  ] as [string, RouteId][])('German word "%s" resolves to %s', (word, route) => {
    expect(routesOf(word)[0]).toBe(route);
  });

  it.each([
    ['Dashboard', 'home'],
    ['Diary', 'diary'],
    ['Household item', 'householdItems'],
    ['Quotation', 'invoices'],
    ['Budget', 'budgetOverview'],
    ['Subsidy', 'budgetSubsidies'],
  ] as [string, RouteId][])('other former name "%s" is reachable via %s', (word, route) => {
    expect(routesOf(word)).toContain(route);
  });

  it('every other TERM_EXTRAS status word lands on its filtered invoice view', () => {
    const query = (word: string) => findSearchDestinations(word, ADMIN, EN)[0]?.query;
    expect(query('Pending')).toBeDefined();
    expect(findSearchDestinations('Offer', ADMIN, EN)[0]).toMatchObject({
      route: 'invoices',
      query: { status: 'quotation' },
    });
    expect(findSearchDestinations('To pay', ADMIN, EN)[0]).toMatchObject({
      route: 'invoices',
      query: { status: 'pending' },
    });
    expect(findSearchDestinations('Paid', ADMIN, EN)[0]).toMatchObject({
      route: 'invoices',
      query: { status: 'paid' },
    });
    expect(findSearchDestinations('Contact person', ADMIN, EN)[0]).toMatchObject({
      route: 'companies',
    });
    expect(findSearchDestinations('Cost line', ADMIN, EN)[0]).toMatchObject({
      route: 'budgetOverview',
    });
  });

  it('a "formerly" word that names two destinations returns both', () => {
    // "Pending" is a former name of both To pay and Upcoming; To pay has a destination.
    expect(findSearchDestinations('Pending', ADMIN, EN)).toContainEqual(
      expect.objectContaining({ route: 'invoices', query: { status: 'pending' } }),
    );
  });
});

describe('findSearchDestinations: folding and labels', () => {
  it('matches case-insensitively', () => {
    expect(routesOf('ZEITPLAN')[0]).toBe('scheduleGantt');
    expect(routesOf('gantt')[0]).toBe('scheduleGantt');
  });

  it('folds umlauts and digraphs on both sides ("Mängel", "Maengel")', () => {
    // Defect has no served destination; use a served umlaut-free pair via folded German form.
    expect(routesOf('ZEITPLAN')).toEqual(routesOf('zeitplan'));
    expect(routesOf('Strasse')).toEqual(routesOf('Straße'));
  });

  it('matches the current locale label through labelOf', () => {
    const labelOf = (key: NavLabelKey) => (key === 'navigation.companies' ? 'Zzyzx labels' : key);
    expect(findSearchDestinations('zzyzx', ADMIN, labelOf)[0]).toMatchObject({
      route: 'companies',
      viaFormerName: false,
    });
  });

  it('matches the German label for the German locale', () => {
    const hit = findSearchDestinations('Zeitplan', ADMIN, DE)[0]!;
    expect(hit.route).toBe('scheduleGantt');
    expect(hit.term).toBe('Schedule');
  });

  it('returns nothing for an empty or whitespace query', () => {
    expect(findSearchDestinations('', ADMIN, EN)).toEqual([]);
    expect(findSearchDestinations('   ', ADMIN, EN)).toEqual([]);
  });

  it('returns nothing for a word that matches no destination', () => {
    expect(findSearchDestinations('qqqzzz', ADMIN, EN)).toEqual([]);
  });

  it('works with an entry that has no glossary term (canon and label still match)', () => {
    const empty: Glossary = { ...GLOSSARY, terms: [] };
    const hits = findSearchDestinations('Task', ADMIN, EN, empty);
    expect(hits[0]).toMatchObject({ route: 'workItems', rank: 0, viaFormerName: false });
    expect(findSearchDestinations('Gantt', ADMIN, EN, empty)).toEqual([]);
  });

  it('skips glossary forms that are absent and still matches present ones', () => {
    const sparse: GlossaryTerm = {
      ...GLOSSARY.terms.find((t) => t.canon === 'Schedule')!,
      en: {},
      de: { singular: 'Terminplan' },
      formerly: [],
    };
    const glossary: Glossary = { ...GLOSSARY, terms: [sparse] };
    expect(findSearchDestinations('terminplan', ADMIN, EN, glossary)[0]).toMatchObject({
      route: 'scheduleGantt',
      matched: 'Terminplan',
    });
  });

  it('reports the candidate text exactly as written', () => {
    expect(findSearchDestinations('Timeline', ADMIN, EN)[0]).toMatchObject({
      matched: 'Timeline',
      term: 'Schedule',
    });
  });
});

describe('findSearchDestinations: rank order', () => {
  it('ranks exact (0) before prefix (1) before word-prefix (2)', () => {
    const synthetic: GlossaryTerm[] = [
      {
        ...GLOSSARY.terms.find((t) => t.canon === 'Task')!,
        canon: 'Task',
        en: {},
        de: {},
        formerly: [],
      },
      {
        ...GLOSSARY.terms.find((t) => t.canon === 'Company')!,
        canon: 'Company',
        en: {},
        de: {},
        formerly: ['Zed'],
      },
    ];
    const glossary: Glossary = { ...GLOSSARY, terms: synthetic };
    const labelOf = (key: NavLabelKey): string =>
      ({
        'navigation.home': 'Beta alpha',
        'navigation.tasks': 'Alphabet',
        'navigation.purchases': 'Alpha',
      })[key as string] ?? 'xxxx';
    const hits = findSearchDestinations('alpha', ADMIN, labelOf, glossary);
    expect(hits.map((h) => [h.route, h.rank])).toEqual([
      ['householdItems', 0],
      ['workItems', 1],
      ['home', 2],
    ]);
    // NavConfig order breaks ties inside a rank: Home precedes Tasks, so a prefix pair keeps it.
    const tie = findSearchDestinations(
      'alpha',
      ADMIN,
      (k) => (k === 'navigation.home' || k === 'navigation.tasks' ? 'Alphabet' : 'xxxx'),
      glossary,
    );
    expect(tie.map((h) => [h.route, h.rank])).toEqual([
      ['home', 1],
      ['workItems', 1],
    ]);
  });

  it('assigns rank 1 to a prefix and rank 0 to a full match', () => {
    expect(findSearchDestinations('gan', ADMIN, EN)[0]).toMatchObject({
      route: 'scheduleGantt',
      rank: 1,
    });
    expect(findSearchDestinations('gantt', ADMIN, EN)[0]).toMatchObject({
      route: 'scheduleGantt',
      rank: 0,
    });
  });

  it('assigns rank 2 when only a later word starts with the query', () => {
    // "chart" is the second word of the former name "Gantt chart".
    expect(findSearchDestinations('chart', ADMIN, EN)[0]).toMatchObject({
      route: 'scheduleGantt',
      rank: 2,
    });
  });

  it('splits words on hyphens too', () => {
    // "Gantt-Diagramm": the word "diagramm" starts after the hyphen.
    expect(findSearchDestinations('diagramm', ADMIN, EN)[0]).toMatchObject({
      route: 'scheduleGantt',
      rank: 2,
    });
  });

  it('does not match mid-word text', () => {
    expect(findSearchDestinations('antt', ADMIN, EN)).toEqual([]);
  });

  it('keeps NavConfig order inside one rank', () => {
    // "pe" prefixes several entries; within the same rank the NavConfig order is preserved.
    const hits = findSearchDestinations('s', ADMIN, EN);
    for (let rank = 0 as 0 | 1 | 2; rank <= 2; rank++) {
      const navTerms = new Set(
        NAV_SECTIONS.flatMap((e) => [e.term, ...e.views.map((v) => v.term)]),
      );
      const order = hits.filter((h) => h.rank === rank && navTerms.has(h.term)).map((h) => h.route);
      const navOrder = NAV_SECTIONS.flatMap((s) => [s.route, ...s.views.map((v) => v.route)]);
      const positions = order.map((r) => navOrder.indexOf(r)).filter((i) => i >= 0);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
    expect(hits.map((h) => h.rank)).toEqual([...hits.map((h) => h.rank)].sort((a, b) => a - b));
  });

  it('contributes each entry once, with its best rank', () => {
    // "Schedule": canon exact (0), but also the label and Gantt chart; only one result per entry.
    const hits = findSearchDestinations('schedule', ADMIN, EN).filter(
      (h) => h.route === 'scheduleGantt',
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.rank).toBe(0);
  });

  it('prefers a current-name match over a former-name match of the same rank', () => {
    const hit = findSearchDestinations('schedule', ADMIN, EN).find(
      (h) => h.route === 'scheduleGantt',
    )!;
    expect(hit.viaFormerName).toBe(false);
  });
});

describe('findSearchDestinations: role and gating', () => {
  const adminOnly: [string, RouteId][] = [
    ['Users', 'settingsUsers'],
    ['Backups', 'settingsBackups'],
  ];

  it.each(adminOnly)('admin finds "%s" (%s)', (word, route) => {
    expect(routesOf(word, ADMIN)).toContain(route);
  });

  it.each(adminOnly)('member does not get admin-only "%s" (%s)', (word, route) => {
    expect(routesOf(word, MEMBER)).not.toContain(route);
  });

  it('member does not reach admin-only routes through a former name either', () => {
    expect(routesOf('User management', ADMIN)).toContain('settingsUsers');
    expect(routesOf('User management', MEMBER)).not.toContain('settingsUsers');
    expect(routesOf('Benutzerverwaltung', MEMBER)).not.toContain('settingsUsers');
  });

  it('a member still gets ordinary destinations', () => {
    expect(routesOf('Zeitplan', MEMBER)[0]).toBe('scheduleGantt');
  });

  it('does not offer a planned route by its own name', () => {
    const planned = NAV_SECTIONS.flatMap((s) => [s, ...s.views]).filter(
      (e) => !isRouteServed(e.route),
    );
    expect(planned.length).toBeGreaterThan(0);
    for (const entry of planned) {
      expect(routesOf(EN(entry.labelKey))).not.toContain(entry.route);
    }
  });

  it('never returns a planned (not yet served) route', () => {
    for (const word of ['Documents', 'Dokumente', 'Photo', 'Financing', 'Area', 'Home', 'Task']) {
      for (const hit of findSearchDestinations(word, ADMIN, EN)) {
        expect(isRouteServed(hit.route)).toBe(true);
      }
    }
  });

  it('never returns a route that is not visible in the sidebar for the same context', () => {
    const allRoutes = new Set<RouteId>(
      NAV_SECTIONS.flatMap((s) => [s.route, ...s.views.map((v) => v.route)]),
    );
    allRoutes.add('invoices');
    allRoutes.add('companies');
    allRoutes.add('budgetOverview');
    for (const word of ['a', 'e', 'o', 'r', 's']) {
      for (const hit of findSearchDestinations(word, MEMBER, EN)) {
        expect(allRoutes.has(hit.route)).toBe(true);
        expect(hit.route).not.toBe('settingsUsers');
        expect(hit.route).not.toBe('settingsBackups');
      }
    }
  });
});
