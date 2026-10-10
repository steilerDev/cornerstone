import { describe, it, expect } from '@jest/globals';
import { getRouteEntry, isRouteServed } from '@cornerstone/shared';
import enCommon from '../i18n/en/common.json';
import deCommon from '../i18n/de/common.json';
import { GLOSSARY } from '../i18n/glossary.js';
import {
  MORE_SHEET,
  NAV_LABEL_KEYS,
  NAV_SECTIONS,
  PHONE_BAR,
  navSections,
  type NavContext,
  type NavSection,
  type NavSectionId,
} from './navConfig.js';

const ADMIN: NavContext = { role: 'admin', paperlessConfigured: true };
const MEMBER: NavContext = { role: 'member', paperlessConfigured: true };

/** ADR-038 §1 section order. */
const SECTION_ORDER: readonly NavSectionId[] = [
  'home',
  'tasks',
  'purchases',
  'diary',
  'photos',
  'money',
  'companies',
  'areas',
  'history',
  'documents',
  'settings',
];

function lookup(tree: unknown, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
}

/** Nav keys are `navigation.*` in the common namespace. */
const stripNamespace = (key: string) => key;

const allViews = NAV_SECTIONS.flatMap((s) => s.views.map((v) => ({ section: s, view: v })));
const ids = (sections: readonly NavSection[]) => sections.map((s) => s.id);
const viewRoutes = (section: NavSection | undefined) => section?.views.map((v) => v.route) ?? [];

describe('NAV_SECTIONS', () => {
  it('lists the 11 sections in ADR-038 order', () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(SECTION_ORDER);
  });

  it('points every section and view at an existing route-map entry', () => {
    for (const section of NAV_SECTIONS) {
      expect(() => getRouteEntry(section.route)).not.toThrow();
      for (const view of section.views) expect(() => getRouteEntry(view.route)).not.toThrow();
    }
  });

  it('keeps every route id unique across sections and views', () => {
    const routes = [...NAV_SECTIONS.map((s) => s.route), ...allViews.map((v) => v.view.route)];
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('uses only declared label keys', () => {
    const declared = new Set<string>(NAV_LABEL_KEYS);
    for (const section of NAV_SECTIONS) {
      expect(declared.has(section.labelKey)).toBe(true);
      expect(declared.has(section.mainViewLabelKey)).toBe(true);
      for (const view of section.views) expect(declared.has(view.labelKey)).toBe(true);
    }
  });

  it('declares every label key in the tuple at least once in the data', () => {
    const used = new Set<string>([
      ...NAV_SECTIONS.flatMap((s) => [s.labelKey, s.mainViewLabelKey]),
      ...allViews.map((v) => v.view.labelKey),
    ]);
    expect([...used].sort()).toEqual([...NAV_LABEL_KEYS].sort());
  });

  it('has a term in the glossary for every section and view', () => {
    const canons = new Set(GLOSSARY.terms.map((t) => t.canon));
    for (const section of NAV_SECTIONS) {
      expect({ id: section.id, known: canons.has(section.term) }).toEqual({
        id: section.id,
        known: true,
      });
    }
    for (const { view } of allViews) {
      expect({ term: view.term, known: canons.has(view.term) }).toEqual({
        term: view.term,
        known: true,
      });
    }
  });

  it('uses the glossary plural (or singular) as the English label of every entry', () => {
    const entries = [
      ...NAV_SECTIONS.map((s) => ({ term: s.term, key: s.labelKey })),
      ...allViews.map(({ view }) => ({ term: view.term, key: view.labelKey })),
    ];
    for (const { term, key } of entries) {
      const forms = GLOSSARY.terms.find((t) => t.canon === term)?.en;
      const expected = forms?.plural ?? forms?.singular;
      expect({ key, label: lookup(enCommon, stripNamespace(key)) }).toEqual({
        key,
        label: expected,
      });
    }
  });

  it('puts the secondary and footer groups where the information architecture says', () => {
    expect(NAV_SECTIONS.filter((s) => s.group === 'primary').map((s) => s.id)).toEqual([
      'home',
      'tasks',
      'purchases',
      'diary',
      'photos',
      'money',
      'companies',
    ]);
    expect(NAV_SECTIONS.filter((s) => s.group === 'secondary').map((s) => s.id)).toEqual([
      'areas',
      'history',
      'documents',
    ]);
    expect(NAV_SECTIONS.filter((s) => s.group === 'footer').map((s) => s.id)).toEqual(['settings']);
  });

  it('lets Settings open Project setup while labelling the section Settings', () => {
    const settings = NAV_SECTIONS.find((s) => s.id === 'settings');
    expect(settings?.labelKey).toBe('navigation.settings');
    expect(settings?.mainViewLabelKey).toBe('navigation.projectSetup');
  });

  it('carries no property named "to" (baseline guard: nav data holds route ids, not paths)', () => {
    const found: string[] = [];
    const scan = (node: unknown, trail: string) => {
      if (Array.isArray(node)) node.forEach((n, i) => scan(n, `${trail}[${i}]`));
      else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'to') found.push(`${trail}.${key}`);
          scan(value, `${trail}.${key}`);
        }
      }
    };
    scan({ NAV_SECTIONS, PHONE_BAR, MORE_SHEET, NAV_LABEL_KEYS }, 'nav');
    expect(found).toEqual([]);
  });
});

describe('NAV_LABEL_KEYS', () => {
  it('is a literal tuple of navigation.* keys without duplicates', () => {
    expect(NAV_LABEL_KEYS).toHaveLength(21);
    expect(new Set(NAV_LABEL_KEYS).size).toBe(NAV_LABEL_KEYS.length);
    for (const key of NAV_LABEL_KEYS) expect(key).toMatch(/^navigation\.[A-Za-z]+$/);
  });

  it('exists in the English and the German common namespace', () => {
    for (const key of NAV_LABEL_KEYS) {
      const en = lookup(enCommon, key);
      const de = lookup(deCommon, key);
      expect({ key, en: typeof en, nonEmpty: String(en).length > 0 }).toEqual({
        key,
        en: 'string',
        nonEmpty: true,
      });
      expect({ key, de: typeof de, nonEmpty: String(de).length > 0 }).toEqual({
        key,
        de: 'string',
        nonEmpty: true,
      });
    }
  });

  // Page-identity words (#2202): h1 fallbacks, trail/Back wording, not-found titles. They live in
  // `navigation.*` but are not nav labels, so the tuple does not declare them.
  const PAGE_IDENTITY_KEYS = [
    'youAreHere',
    'backTo',
    'task',
    'purchase',
    'milestone',
    'untitledTask',
    'untitledPurchase',
    'untitledMilestone',
    'newTask',
    'newPurchase',
    'newMilestone',
    'editPurchase',
    'taskNotFound',
    'purchaseNotFound',
  ] as const;

  it('has no navigation key in either locale that the tuple or the page-identity words do not declare', () => {
    const declared = new Set<string>([
      ...NAV_LABEL_KEYS.map((k) => k.replace('navigation.', '')),
      ...PAGE_IDENTITY_KEYS,
    ]);
    for (const tree of [enCommon, deCommon]) {
      const keys = Object.keys((tree as { navigation: Record<string, string> }).navigation);
      expect(keys.filter((k) => !declared.has(k))).toEqual([]);
    }
  });

  it('has every page-identity word, non-empty, in both locales', () => {
    for (const [locale, tree] of [
      ['en', enCommon],
      ['de', deCommon],
    ] as const) {
      const navigation = (tree as { navigation: Record<string, string> }).navigation;
      for (const key of PAGE_IDENTITY_KEYS) {
        expect({ locale, key, value: typeof navigation[key] }).toEqual({
          locale,
          key,
          value: 'string',
        });
        expect((navigation[key] ?? '').trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the {{origin}} placeholder verbatim in "Back to ..." in both locales', () => {
    for (const tree of [enCommon, deCommon]) {
      const navigation = (tree as { navigation: Record<string, string> }).navigation;
      expect(navigation.backTo).toContain('{{origin}}');
    }
  });
});

describe('PHONE_BAR and MORE_SHEET', () => {
  it('lists the phone bar left to right', () => {
    expect(PHONE_BAR).toEqual(['home', 'diary', 'capture', 'photos', 'more']);
  });

  it('covers all 11 sections exactly once between the phone bar and the More sheet', () => {
    const inBar = PHONE_BAR.filter(
      (id): id is Exclude<(typeof PHONE_BAR)[number], 'capture' | 'more'> =>
        id !== 'capture' && id !== 'more',
    );
    const covered = [...inBar, ...MORE_SHEET.flat()];
    expect([...covered].sort()).toEqual([...SECTION_ORDER].sort());
    expect(new Set(covered).size).toBe(11);
  });

  it('groups the More sheet as work, reference and settings', () => {
    expect(MORE_SHEET).toEqual([
      ['tasks', 'purchases', 'money', 'companies'],
      ['areas', 'history', 'documents'],
      ['settings'],
    ]);
  });
});

describe('navSections', () => {
  it('shows every served section to an admin and hides planned ones', () => {
    const shown = ids(navSections(ADMIN));
    for (const section of NAV_SECTIONS) {
      expect(shown.includes(section.id)).toBe(isRouteServed(section.route));
    }
  });

  it('keeps the order of NAV_SECTIONS', () => {
    const shown = ids(navSections(ADMIN));
    const expected = SECTION_ORDER.filter((id) => shown.includes(id));
    expect(shown).toEqual(expected);
  });

  it('hides planned sections: areas, history, documents', () => {
    const shown = ids(navSections(ADMIN));
    for (const planned of ['areas', 'history', 'documents'] as const) {
      expect(shown).not.toContain(planned);
    }
  });

  it('keeps companies, whose interim route is served', () => {
    expect(ids(navSections(ADMIN))).toContain('companies');
  });

  it('hides planned views: financing and integrations', () => {
    const sections = navSections(ADMIN);
    expect(viewRoutes(sections.find((s) => s.id === 'money'))).not.toContain('financing');
    expect(viewRoutes(sections.find((s) => s.id === 'settings'))).not.toContain(
      'settingsIntegrations',
    );
  });

  it('shows the served views to an admin', () => {
    const sections = navSections(ADMIN);
    expect(viewRoutes(sections.find((s) => s.id === 'tasks'))).toEqual([
      'scheduleGantt',
      'scheduleCalendar',
      'milestones',
    ]);
    expect(viewRoutes(sections.find((s) => s.id === 'money'))).toEqual(['invoices']);
    expect(viewRoutes(sections.find((s) => s.id === 'settings'))).toEqual([
      'settingsProfile',
      'settingsUsers',
      'settingsBackups',
    ]);
  });

  it('hides the admin-only views from a member', () => {
    const settings = navSections(MEMBER).find((s) => s.id === 'settings');
    expect(viewRoutes(settings)).toEqual(['settingsProfile']);
  });

  it('does not change which sections a member sees (no section is admin-only today)', () => {
    expect(ids(navSections(MEMBER))).toEqual(ids(navSections(ADMIN)));
  });

  it('hides Paperless-gated routes when Paperless is not configured', () => {
    const off = navSections({ role: 'admin', paperlessConfigured: false });
    const all = [...off.map((s) => s.route), ...off.flatMap((s) => s.views.map((v) => v.route))];
    for (const route of all) {
      const gate = getRouteEntry(route).gate;
      expect(['paperless', 'paperless+ai']).not.toContain(gate);
    }
  });

  it('returns copies: filtering views never mutates NAV_SECTIONS', () => {
    const before = NAV_SECTIONS.map((s) => s.views.length);
    navSections(MEMBER);
    expect(NAV_SECTIONS.map((s) => s.views.length)).toEqual(before);
  });
});
