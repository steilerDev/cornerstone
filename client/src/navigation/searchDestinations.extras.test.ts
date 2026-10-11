import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { foldSearchText } from '@cornerstone/shared';
import { fileURLToPath } from 'node:url';
import { GLOSSARY, findTermsByAlias, getSearchableNames } from '../i18n/glossary.js';
import type { NavContext, NavLabelKey } from './navConfig.js';
import { TERMS_WITHOUT_DESTINATION, findSearchDestinations } from './searchDestinations.js';
import type { SearchDestination } from './searchDestinations.js';

const I18N_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../i18n');
const common = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'en', 'common.json'), 'utf8')) as {
  navigation: Record<string, string>;
};
const EN = (key: NavLabelKey) => common.navigation[key.replace(/^navigation\./, '')] ?? key;
const ADMIN: NavContext = { role: 'admin', paperlessConfigured: true };

type Finder = (word: string) => readonly SearchDestination[];
const realFinder: Finder = (word) => findSearchDestinations(word, ADMIN, EN);

const fold = (value: string) => foldSearchText(value.trim());
const getTermNames = (canon: string): string[] =>
  getSearchableNames(GLOSSARY.terms.find((t) => t.canon === canon)!).map((n) => n.text);

/** Former names of terms (not in the exemption map) for which no destination of that term is found. */
function unresolvedFormerNames(find: Finder): string[] {
  const missing: string[] = [];
  for (const term of GLOSSARY.terms) {
    if (term.formerly.length === 0 || TERMS_WITHOUT_DESTINATION.has(term.canon)) continue;
    for (const name of term.formerly) {
      if (!find(name).some((d) => d.term === term.canon)) missing.push(`${term.canon}: ${name}`);
    }
  }
  return missing;
}

describe('TERM_EXTRAS destinations', () => {
  it.each([
    ['Submitted', 'invoices', { status: 'claimed' }],
    ['To pay', 'invoices', { status: 'pending' }],
    ['Paid', 'invoices', { status: 'paid' }],
    ['Offer', 'invoices', { status: 'quotation' }],
    ['Contact person', 'companies', undefined],
    ['Cost line', 'budgetOverview', undefined],
    ['Done', 'workItems', { status: 'completed' }],
    ['Ordered', 'householdItems', { status: 'purchased' }],
    ['Delivery scheduled', 'householdItems', { status: 'scheduled' }],
    ['Delivered', 'householdItems', { status: 'arrived' }],
    ['Project setup', 'settingsManage', undefined],
    ['House', 'settingsManage', { tab: 'household' }],
    ['Trade', 'settingsManage', { tab: 'trades' }],
    ['Cost category', 'settingsManage', { tab: 'budget-categories' }],
    ['Purchase category', 'settingsManage', { tab: 'hi-categories' }],
    ['Daily log', 'diary', { types: 'daily_log' }],
    ['Site visit', 'diary', { types: 'site_visit' }],
    ['Defect', 'diary', { types: 'issue' }],
  ] as const)('"%s" opens %s with %j', (word, route, query) => {
    const hit = realFinder(word).find((d) => d.term === word && d.route === route);
    expect(hit).toBeDefined();
    expect(hit!.rank).toBe(0);
    expect(hit!.query).toEqual(query);
  });

  it('finds the new extras through their former names', () => {
    const cases: [string, string, Record<string, string> | undefined][] = [
      ['Completed', 'workItems', { status: 'completed' }],
      ['Purchased', 'householdItems', { status: 'purchased' }],
      ['Arrived', 'householdItems', { status: 'arrived' }],
      ['Specialty', 'settingsManage', { tab: 'trades' }],
      ['Household', 'settingsManage', { tab: 'household' }],
      ['Budget categories', 'settingsManage', { tab: 'budget-categories' }],
      ['Household item categories', 'settingsManage', { tab: 'hi-categories' }],
      ['Inspection', 'diary', { types: 'site_visit' }],
      ['Issue', 'diary', { types: 'issue' }],
      ['Tagesprotokoll', 'diary', { types: 'daily_log' }],
    ];
    for (const [word, route, query] of cases) {
      const hit = realFinder(word).find((d) => d.route === route && d.viaFormerName);
      expect(hit?.query).toEqual(query);
    }
  });

  it('finds them in German as well', () => {
    expect(realFinder('Mangel').some((d) => d.query?.types === 'issue')).toBe(true);
    expect(realFinder('Begehung').some((d) => d.query?.types === 'site_visit')).toBe(true);
    expect(realFinder('Gewerk').some((d) => d.query?.tab === 'trades')).toBe(true);
    expect(realFinder('Abgeschlossen').some((d) => d.query?.status === 'completed')).toBe(true);
  });
});

describe('former-name coverage guard', () => {
  it('every former name of a non-exempt glossary term resolves to a destination of its term', () => {
    expect(unresolvedFormerNames(realFinder)).toEqual([]);
  });

  it('self-test: the guard fails when an extra is removed', () => {
    const baseline = unresolvedFormerNames(realFinder);
    const extraOf = (removed: string): string[] =>
      unresolvedFormerNames((word) => realFinder(word).filter((d) => d.term !== removed)).filter(
        (entry) => !baseline.includes(entry),
      );
    expect(extraOf('Done')).toEqual(['Done: Completed']);
    expect(extraOf('Trade')).toEqual(['Trade: Specialty']);
    expect(extraOf('Defect')).toEqual(['Defect: Issue', 'Defect: Problem']);
  });

  it('self-test: the guard checks the destination belongs to the term, not any hit', () => {
    const everythingIsHome: Finder = () => [
      { route: 'home', term: 'Home', matched: 'x', viaFormerName: false, rank: 0 },
    ];
    expect(unresolvedFormerNames(everythingIsHome).length).toBeGreaterThan(10);
  });
});

describe('TERMS_WITHOUT_DESTINATION', () => {
  const canons = new Map(GLOSSARY.terms.map((t) => [t.canon, t]));

  it('lists only terms that exist in the glossary and have former names', () => {
    for (const canon of TERMS_WITHOUT_DESTINATION.keys()) {
      expect(canons.has(canon)).toBe(true);
      expect(canons.get(canon)!.formerly.length).toBeGreaterThan(0);
    }
  });

  it('has no stale entries: no listed term resolves to a destination of its own', () => {
    for (const canon of TERMS_WITHOUT_DESTINATION.keys()) {
      const term = canons.get(canon)!;
      for (const word of [canon, ...term.formerly]) {
        expect(realFinder(word).filter((d) => d.term === canon)).toEqual([]);
      }
    }
  });

  it('gives every entry a non-empty reason', () => {
    for (const reason of TERMS_WITHOUT_DESTINATION.values()) {
      expect(reason.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('destinations agree with findTermsByAlias', () => {
  // Terms that have at least one destination for an admin with Paperless.
  const withDestination = new Set(
    GLOSSARY.terms
      .filter((t) => realFinder(t.canon).some((d) => d.term === t.canon))
      .map((t) => t.canon),
  );

  const SAMPLE = [
    'Zeitplan',
    'ZEITPLAN',
    'zeitplan',
    'Gantt',
    'Gantt-Diagramm',
    'Timeline',
    'vendor',
    'Auftragnehmer',
    'Arbeitspaket',
    'claimed',
    'Eingereicht',
    'Mängel',
    'Maengel',
    'Mangel',
    'Begehung',
    'Förderprogramm',
    'Foerderprogramm',
    'Forderprogramm',
    'Gewerke',
    'Kostenposition',
    'Tagesprotokoll',
    'Inspection',
  ];

  it.each(SAMPLE)('"%s": same term as findTermsByAlias (for terms with a destination)', (word) => {
    const viaAlias = findTermsByAlias(word)
      .map((t) => t.canon)
      .filter((canon) => withDestination.has(canon))
      .sort();
    const viaDestinations = [
      ...new Set(
        realFinder(word)
          .filter((d) => d.rank === 0 && getTermNames(d.term).some((n) => fold(n) === fold(word)))
          .map((d) => d.term),
      ),
    ].sort();
    expect(viaAlias.length).toBeGreaterThan(0);
    expect(viaDestinations).toEqual(viaAlias);
  });

  it('resolves verb and noun forms the same way as the shared names helper', () => {
    for (const t of GLOSSARY.terms.filter((x) => withDestination.has(x.canon))) {
      for (const name of getSearchableNames(t)) {
        expect(realFinder(name.text).some((d) => d.term === t.canon)).toBe(true);
      }
    }
  });
});
