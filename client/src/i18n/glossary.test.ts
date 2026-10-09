import { describe, it, expect } from '@jest/globals';
import rawGlossary from './glossary.json';
import enCommon from './en/common.json';
import deCommon from './de/common.json';
import {
  GLOSSARY,
  GlossaryFormatError,
  findTermsByAlias,
  getBannedSynonyms,
  getSearchAliases,
  parseGlossary,
} from './glossary.js';
import type { Glossary, GlossaryGroup, GlossaryTerm } from './glossary.js';

function term(canon: string): GlossaryTerm {
  const found = GLOSSARY.terms.find((t) => t.canon === canon);
  if (!found) throw new Error(`glossary term "${canon}" not found`);
  return found;
}

const canons = (terms: readonly GlossaryTerm[]): string[] => terms.map((t) => t.canon);

describe('glossary.json (real file)', () => {
  it('parses as schema v2, glossary v1, with German as the only extra locale', () => {
    expect(GLOSSARY.meta.schemaVersion).toBe(2);
    expect(GLOSSARY.meta.glossaryVersion).toBe('v1');
    expect(GLOSSARY.meta.locales).toEqual(['de']);
    expect(GLOSSARY.terms.length).toBeGreaterThan(100);
  });

  describe('AC1: every term is complete', () => {
    it.each(GLOSSARY.terms.map((t) => [t.canon, t] as const))(
      '%s has a one-line definition, en and de forms, valid groups and both arrays',
      (_canon, t) => {
        expect(t.definition.trim()).not.toBe('');
        expect(t.definition).not.toContain('\n');
        expect(t.definition.length).toBeLessThanOrEqual(200);
        expect(Object.keys(t.en).length).toBeGreaterThanOrEqual(1);
        expect(Object.keys(t.de).length).toBeGreaterThanOrEqual(1);
        expect(t.groups.length).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(t.doNotUse)).toBe(true);
        expect(Array.isArray(t.formerly)).toBe(true);
      },
    );
  });

  describe('AC1: required v1 terms per group', () => {
    const REQUIRED: Record<string, string[]> = {
      primaryNoun: [
        'Home',
        'Task',
        'Purchase',
        'Site diary',
        'Diary entry',
        'Photo',
        'Spot',
        'Orientation',
        'Company',
        'Contact person',
        'Offer',
        'Invoice',
        'Area',
        'Money',
      ],
      supportingNoun: [
        'Milestone',
        'Cost line',
        'Progress payment',
        'Funding source',
        'Own funds',
        'Grant',
        'Draw-down request',
        'Bank report',
        'Trade',
        'Cost category',
        'Purchase category',
        'House',
        'History',
        'Checklist item',
        'Note',
        'Who',
      ],
      scheduleWord: [
        'Late',
        'Early',
        'Waits for',
        'Holds up',
        'Held up',
        'Counts toward',
        'Waiting for this milestone',
        'Critical',
      ],
      homeWord: ['Needs attention', 'Tidy up', 'This week', 'Not now'],
      historyEventType: [
        'Status change',
        'Payment',
        'Invoice recorded',
        'Milestone moved',
        'Grant status',
        'Submission',
      ],
      tabWord: ['Overview', 'Timing', 'Work', 'Cost', 'Payment', 'Site diary', 'History'],
      verb: [
        'New',
        'Add',
        'Link',
        'Remove',
        'Delete',
        'Edit',
        'Save',
        'Cancel',
        'Log',
        'Mark',
        'Start',
        'Split',
      ],
      diaryType: ['Daily log', 'Site visit', 'Delivery', 'Defect', 'Note'],
    };

    it.each(Object.entries(REQUIRED))('group %s contains its required terms', (group, wanted) => {
      const inGroup = GLOSSARY.terms
        .filter((t) => t.groups.includes(group as GlossaryGroup))
        .map((t) => t.canon);
      expect(wanted.filter((w) => !inGroup.includes(w))).toEqual([]);
    });

    it('the tab word Payment has the plural Payments', () => {
      expect(term('Payment').en.plural).toBe('Payments');
    });
  });

  describe('AC2: approved German (Q12 core terms)', () => {
    const GERMAN: [string, string][] = [
      ['Task', 'Aufgabe'],
      ['Purchase', 'Anschaffung'],
      ['Company', 'Firma'],
      ['Offer', 'Angebot'],
      ['Cost line', 'Kostenposition'],
      ['Progress payment', 'Abschlagszahlung'],
      ['Submitted', 'Eingereicht'],
      ['To pay', 'Zu zahlen'],
      ['Site visit', 'Begehung'],
      ['Site diary', 'Bautagebuch'],
      ['Late', 'Verspätet'],
      ['Waits for', 'Wartet auf'],
      ['Holds up', 'Hält auf'],
      ['Home', 'Start'],
      ['Money', 'Finanzen'],
      ['Grant', 'Förderprogramm'],
      ['Funding source', 'Finanzierungsquelle'],
      ['Draw-down request', 'Mittelabruf'],
    ];

    it.each(GERMAN)('%s is "%s" in German', (canon, german) => {
      const de = term(canon).de;
      expect(de.singular ?? de.verb).toBe(german);
    });

    it('every German form is approved or shipped, never proposed', () => {
      for (const t of GLOSSARY.terms) {
        expect(['approved', 'shipped']).toContain(t.deSource);
      }
    });

    it('carries a dated translator sign-off', () => {
      const signOff = GLOSSARY.meta.approval.translatorSignOff;
      expect(signOff.agent).toBe('translator');
      expect(signOff.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('carry-over from schema v1', () => {
    it('keeps the measured Abschlag short form and its 75pt column note', () => {
      const de = term('Progress payment').de;
      expect(de.shortForm).toBe('Abschlag');
      expect(de.shortFormNote).toContain('75pt');
    });

    it('keeps the Spot German note', () => {
      const note = term('Spot').de.note;
      expect(typeof note).toBe('string');
      expect(note?.length).toBeGreaterThan(0);
    });
  });

  describe('AC3: statusVocabulary labels are the glossary canon verbatim', () => {
    // [path under statusVocabulary, glossary canon, form key]
    const MAPPING: [string, string, 'singular' | 'chip'][] = [
      ['invoice.pending', 'To pay', 'singular'],
      ['invoice.paid', 'Paid', 'singular'],
      ['invoice.claimed', 'Submitted', 'singular'],
      ['invoice.quotation', 'Offer', 'singular'],
      ['progressPayment.pending', 'To pay', 'singular'],
      ['progressPayment.paid', 'Paid', 'singular'],
      ['progressPayment.claimed', 'Submitted', 'singular'],
      ['task.not_started', 'Not started', 'singular'],
      ['task.in_progress', 'In progress', 'singular'],
      ['task.completed', 'Done', 'singular'],
      ['scheduleSignal.late', 'Late', 'chip'],
      ['scheduleSignal.held_up', 'Held up', 'singular'],
      ['scheduleSignal.critical', 'Critical', 'singular'],
      ['purchase.planned', 'Planned', 'singular'],
      ['purchase.purchased', 'Ordered', 'singular'],
      ['purchase.scheduled', 'Delivery scheduled', 'singular'],
      ['purchase.arrived', 'Delivered', 'singular'],
      ['milestone.upcoming', 'Upcoming', 'singular'],
      ['milestone.late', 'Late', 'chip'],
      ['milestone.early', 'Early', 'chip'],
      ['milestone.reached', 'Reached', 'singular'],
      ['grant.eligible', 'Eligible', 'singular'],
      ['grant.applied', 'Applied', 'singular'],
      ['grant.approved', 'Approved', 'singular'],
      ['grant.received', 'Received', 'singular'],
      ['grant.rejected', 'Rejected', 'singular'],
      ['fundingSource.active', 'Active', 'singular'],
      ['fundingSource.exhausted', 'Used up', 'singular'],
      ['fundingSource.closed', 'Closed', 'singular'],
      ['defect.open', 'Open', 'singular'],
      ['defect.in_progress', 'Being fixed', 'singular'],
      ['defect.resolved', 'Fixed', 'singular'],
      ['budgetVerdict.on_budget', 'On budget', 'singular'],
      ['budgetVerdict.over_budget', 'Over budget', 'singular'],
      ['diaryType.daily_log', 'Daily log', 'singular'],
      ['diaryType.site_visit', 'Site visit', 'singular'],
      ['diaryType.delivery', 'Delivery', 'singular'],
      ['diaryType.issue', 'Defect', 'singular'],
      ['diaryType.general_note', 'Note', 'singular'],
    ];

    function leaf(json: unknown, path: string): unknown {
      let node: unknown = (json as { statusVocabulary: unknown }).statusVocabulary;
      for (const segment of path.split('.')) {
        node = (node as Record<string, unknown>)[segment];
      }
      return node;
    }

    function leafPaths(node: unknown, prefix = ''): string[] {
      if (typeof node === 'string') return [prefix];
      return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
        leafPaths(v, prefix ? `${prefix}.${k}` : k),
      );
    }

    it.each(MAPPING)('%s equals the glossary form of %s in en and de', (path, canon, formKey) => {
      const t = term(canon);
      expect(leaf(enCommon, path)).toBe(t.en[formKey]);
      expect(leaf(deCommon, path)).toBe(t.de[formKey]);
    });

    it('the mapping table covers every statusVocabulary leaf in both locales', () => {
      const mapped = MAPPING.map(([path]) => path).sort();
      const enLeaves = leafPaths((enCommon as { statusVocabulary: unknown }).statusVocabulary);
      const deLeaves = leafPaths((deCommon as { statusVocabulary: unknown }).statusVocabulary);
      expect(enLeaves.sort()).toEqual(mapped);
      expect(deLeaves.sort()).toEqual(mapped);
    });
  });

  describe('AC4: former names are permanent search aliases', () => {
    // Removing an alias is forbidden: former names stay searchable forever.
    const PERMANENT_ALIASES = [
      'Work item',
      'Arbeitspaket',
      'Household item',
      'Haushaltsartikel',
      'Vendor',
      'Auftragnehmer',
      'Quotation',
      'Budget line',
      'Budgetposition',
      'Budget source',
      'Budgetquelle',
      'Geldquellen',
      'Subsidy',
      'Zuschüsse',
      'Payback',
      'Deposit',
      'Itemize',
      'Dashboard',
      'Projektübersicht',
      'Gantt',
      'Gantt chart',
      'Gantt-Diagramm',
      'Timeline',
      'Claimed',
      'Pending',
      'Inspection',
      'Standortbesuch',
      'Subtask',
      'Teilaufgabe',
      'Manage',
      'Verwalten',
      'Profile',
    ];

    it('removing a former name is forbidden: every permanent alias is still present', () => {
      const all = new Set([...getSearchAliases().values()].flat());
      expect(PERMANENT_ALIASES.filter((alias) => !all.has(alias))).toEqual([]);
    });

    it('maps Task to its former name Work item', () => {
      expect(getSearchAliases().get('Task')).toContain('Work item');
    });

    it('lists every term, with an empty array when it has no former names', () => {
      const aliases = getSearchAliases();
      expect(aliases.size).toBe(GLOSSARY.terms.length);
      expect(aliases.get('Spot')).toEqual([]);
    });

    it('no term lists its own canon form as a former name', () => {
      for (const t of GLOSSARY.terms) {
        const own = new Set(
          [t.canon, ...Object.values(t.en), ...Object.values(t.de)].map((v) =>
            v.toLocaleLowerCase('de'),
          ),
        );
        const clash = t.formerly.filter((f) => own.has(f.toLocaleLowerCase('de')));
        expect({ term: t.canon, clash }).toEqual({ term: t.canon, clash: [] });
      }
    });
  });

  describe('findTermsByAlias', () => {
    it('finds a former name case-insensitively', () => {
      expect(canons(findTermsByAlias('vendor'))).toEqual(['Company']);
      expect(canons(findTermsByAlias('  GANTT '))).toEqual(['Schedule']);
      expect(canons(findTermsByAlias('claimed'))).toEqual(['Submitted']);
      expect(canons(findTermsByAlias('Arbeitspaket'))).toEqual(['Task']);
    });

    it('finds a term by a canon form in either locale', () => {
      expect(canons(findTermsByAlias('Aufgabe'))).toEqual(['Task']);
      expect(canons(findTermsByAlias('task'))).toContain('Task');
    });

    it('returns every term sharing an ambiguous former name', () => {
      const found = canons(findTermsByAlias('Pending'));
      expect(found).toContain('To pay');
      expect(found).toContain('Upcoming');
    });

    it('returns nothing for blank or unknown queries', () => {
      expect(findTermsByAlias('')).toEqual([]);
      expect(findTermsByAlias('   ')).toEqual([]);
      expect(findTermsByAlias('no-such-word')).toEqual([]);
    });
  });

  describe('AC5: banned synonyms', () => {
    // The plan's 41 banned words as (word, locale) pairs.
    const BANNED: [string, 'en' | 'de'][] = [
      ['Inspection', 'en'],
      ['Work item', 'en'],
      ['Arbeitspaket', 'de'],
      ['Household item', 'en'],
      ['Haushaltsartikel', 'de'],
      ['Vendor', 'en'],
      ['Auftragnehmer', 'de'],
      ['Quotation', 'en'],
      ['Quote', 'en'],
      ['Budget line', 'en'],
      ['Line item', 'en'],
      ['Itemize', 'en'],
      ['Budget source', 'en'],
      ['Sources', 'en'],
      ['Geldquellen', 'de'],
      ['Discretionary', 'en'],
      ['Payback', 'en'],
      ['Subsidy', 'en'],
      ['Zuschüsse', 'de'],
      ['Claimed', 'en'],
      ['Claimable', 'en'],
      ['Pending', 'en'],
      ['Outstanding', 'en'],
      ['Open', 'en'],
      ['Remaining', 'en'],
      ['Paid so far', 'en'],
      ['Committed', 'en'],
      ['Net', 'en'],
      ['Delayed', 'en'],
      ['Running over', 'en'],
      ['Downstream', 'en'],
      ['Blocks', 'en'],
      ['Timeline', 'en'],
      ['Gantt', 'en'],
      ['Dashboard', 'en'],
      ['Overview', 'en'],
      ['Manage', 'en'],
      ['Household', 'en'],
      ['Standortbesuch', 'de'],
      ['Tägliches Protokoll', 'de'],
      ['item', 'en'],
    ];

    it('lists all 41 banned words of the plan', () => {
      expect(BANNED).toHaveLength(41);
      const have = new Set(getBannedSynonyms().map((b) => `${b.locale}:${b.word}`));
      expect(BANNED.filter(([word, locale]) => !have.has(`${locale}:${word}`))).toEqual([]);
    });

    it('every banned entry points at an existing glossary term', () => {
      const names = new Set(GLOSSARY.terms.map((t) => t.canon));
      for (const banned of getBannedSynonyms()) {
        expect(names.has(banned.use)).toBe(true);
      }
    });

    it('a banned word that is also a canon form of any term carries a context', () => {
      const canonForms = new Set(
        GLOSSARY.terms.flatMap((t) =>
          [t.canon, ...Object.values(t.en), ...Object.values(t.de)].map((v) =>
            v.toLocaleLowerCase('de'),
          ),
        ),
      );
      const collisions = getBannedSynonyms().filter((b) =>
        canonForms.has(b.word.toLocaleLowerCase('de')),
      );
      expect(collisions.filter((b) => b.context === undefined)).toEqual([]);
      const words = collisions.map((b) => b.word);
      expect(words).toContain('Open');
      expect(words).toContain('Overview');
    });
  });
});

function validRaw(): Record<string, unknown> {
  return {
    _meta: {
      schemaVersion: 2,
      glossaryVersion: 'v0',
      locales: ['de'],
      lastUpdated: '2026-01-01',
      approval: {
        owner: { decision: 'test', date: '2026-01-01' },
        translatorSignOff: { agent: 'translator', date: '2026-01-01', statement: 'ok' },
      },
      transition: 'none',
    },
    terms: {
      Widget: {
        groups: ['general'],
        en: { singular: 'Widget', plural: 'Widgets' },
        de: { singular: 'Dingsda' },
        deSource: 'approved',
        definition: 'A synthetic test term.',
        doNotUse: [{ word: 'Gadget', locale: 'en', context: 'in tests' }],
        formerly: ['Gizmo'],
      },
      Gizmo2: {
        groups: ['verb'],
        en: { verb: 'Gizmo it' },
        de: { verb: 'Gizmo-en' },
        deSource: 'shipped',
        definition: 'Another synthetic term.',
        doNotUse: [{ word: 'Doohickey', locale: 'de' }],
        formerly: [],
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mutable = Record<string, any>;

function mutated(mutate: (raw: Mutable) => void): unknown {
  const raw = JSON.parse(JSON.stringify(validRaw())) as Mutable;
  mutate(raw);
  return raw;
}

describe('parseGlossary', () => {
  it('parses a minimal valid glossary', () => {
    const parsed = parseGlossary(validRaw());
    expect(parsed.terms.map((t) => t.canon)).toEqual(['Widget', 'Gizmo2']);
    expect(parsed.terms[0]?.doNotUse).toEqual([
      { word: 'Gadget', locale: 'en', context: 'in tests' },
    ]);
    expect(parsed.terms[1]?.doNotUse).toEqual([{ word: 'Doohickey', locale: 'de' }]);
  });

  it('parses the real glossary.json file', () => {
    expect(parseGlossary(rawGlossary).terms).toHaveLength(GLOSSARY.terms.length);
  });

  const FAILURES: [string, (raw: Mutable) => void, string][] = [
    ['a wrong schemaVersion', (r) => (r._meta.schemaVersion = 1), '_meta.schemaVersion'],
    ['a missing _meta', (r) => delete r._meta, '_meta'],
    ['an unknown locale', (r) => (r._meta.locales = ['fr']), '_meta.locales[0]'],
    ['locales that is not an array', (r) => (r._meta.locales = 'de'), '_meta.locales'],
    ['a blank glossaryVersion', (r) => (r._meta.glossaryVersion = ' '), '_meta.glossaryVersion'],
    ['a missing transition', (r) => delete r._meta.transition, '_meta.transition'],
    ['a missing approval', (r) => delete r._meta.approval, '_meta.approval'],
    [
      'a missing translatorSignOff',
      (r) => delete r._meta.approval.translatorSignOff,
      '_meta.approval.translatorSignOff',
    ],
    [
      'a sign-off by another agent',
      (r) => (r._meta.approval.translatorSignOff.agent = 'product-owner'),
      '_meta.approval.translatorSignOff.agent',
    ],
    [
      'a sign-off without a statement',
      (r) => delete r._meta.approval.translatorSignOff.statement,
      '_meta.approval.translatorSignOff.statement',
    ],
    [
      'an owner approval without a decision',
      (r) => delete r._meta.approval.owner.decision,
      '_meta.approval.owner.decision',
    ],
    ['empty terms', (r) => (r.terms = {}), 'terms'],
    ['terms that is not an object', (r) => (r.terms = []), 'terms'],
    ['an unknown group', (r) => (r.terms.Widget.groups = ['nope']), 'terms["Widget"].groups[0]'],
    [
      'a duplicate group',
      (r) => (r.terms.Widget.groups = ['general', 'general']),
      'terms["Widget"].groups',
    ],
    ['empty groups', (r) => (r.terms.Widget.groups = []), 'terms["Widget"].groups'],
    [
      'a groups value that is no array',
      (r) => (r.terms.Widget.groups = 'x'),
      'terms["Widget"].groups',
    ],
    ['an unknown form key', (r) => (r.terms.Widget.en.bogus = 'x'), 'terms["Widget"].en.bogus'],
    [
      'an empty form value',
      (r) => (r.terms.Widget.en.singular = ''),
      'terms["Widget"].en.singular',
    ],
    ['forms that is no object', (r) => (r.terms.Widget.de = 'x'), 'terms["Widget"].de'],
    [
      'a term with neither singular nor verb',
      (r) => (r.terms.Widget.en = { plural: 'Widgets' }),
      'terms["Widget"].en',
    ],
    [
      'a proposed deSource',
      (r) => (r.terms.Widget.deSource = 'proposed'),
      'terms["Widget"].deSource',
    ],
    [
      'a multi-line definition',
      (r) => (r.terms.Widget.definition = 'one\ntwo'),
      'terms["Widget"].definition',
    ],
    [
      'a definition over 200 characters',
      (r) => (r.terms.Widget.definition = 'x'.repeat(201)),
      'terms["Widget"].definition',
    ],
    ['a missing definition', (r) => delete r.terms.Widget.definition, 'terms["Widget"].definition'],
    [
      'a doNotUse entry with a bad locale',
      (r) => (r.terms.Widget.doNotUse[0].locale = 'fr'),
      'terms["Widget"].doNotUse[0].locale',
    ],
    [
      'a doNotUse entry with an extra key',
      (r) => (r.terms.Widget.doNotUse[0].extra = 1),
      'terms["Widget"].doNotUse[0].extra',
    ],
    [
      'a doNotUse entry with an empty context',
      (r) => (r.terms.Widget.doNotUse[0].context = ''),
      'terms["Widget"].doNotUse[0].context',
    ],
    [
      'a doNotUse entry without a word',
      (r) => delete r.terms.Widget.doNotUse[0].word,
      'terms["Widget"].doNotUse[0].word',
    ],
    [
      'a doNotUse that is no array',
      (r) => (r.terms.Widget.doNotUse = {}),
      'terms["Widget"].doNotUse',
    ],
    [
      'a case-insensitive duplicate former name',
      (r) => (r.terms.Widget.formerly = ['Gizmo', 'gizmo']),
      'terms["Widget"].formerly',
    ],
    [
      'an empty former name',
      (r) => (r.terms.Widget.formerly = ['']),
      'terms["Widget"].formerly[0]',
    ],
    ['an unknown term-level key', (r) => (r.terms.Widget.extra = 1), 'terms["Widget"].extra'],
    ['a term that is no object', (r) => (r.terms.Widget = 'x'), 'terms["Widget"]'],
  ];

  it.each(FAILURES)('rejects %s with the offending path', (_name, mutate, path) => {
    let error: unknown;
    try {
      parseGlossary(mutated(mutate));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(GlossaryFormatError);
    expect((error as GlossaryFormatError).name).toBe('GlossaryFormatError');
    expect((error as GlossaryFormatError).message.startsWith(`${path}:`)).toBe(true);
  });

  it('rejects a non-object root', () => {
    expect(() => parseGlossary(null)).toThrow('$: must be an object');
    expect(() => parseGlossary([])).toThrow(GlossaryFormatError);
  });
});

describe('accessors with an injected glossary', () => {
  const synthetic: Glossary = parseGlossary(validRaw());

  it('getSearchAliases reads the injected terms', () => {
    const aliases = getSearchAliases(synthetic);
    expect(aliases.get('Widget')).toEqual(['Gizmo']);
    expect(aliases.get('Gizmo2')).toEqual([]);
    expect(aliases.has('Task')).toBe(false);
  });

  it('findTermsByAlias matches canon forms, other-locale forms and former names', () => {
    expect(canons(findTermsByAlias('gizmo', synthetic))).toEqual(['Widget']);
    expect(canons(findTermsByAlias('DINGSDA', synthetic))).toEqual(['Widget']);
    expect(canons(findTermsByAlias('widgets', synthetic))).toEqual(['Widget']);
    expect(canons(findTermsByAlias('Gizmo it', synthetic))).toEqual(['Gizmo2']);
    expect(findTermsByAlias('Task', synthetic)).toEqual([]);
  });

  describe('findTermsByAlias searches names only, not notes or templates', () => {
    const withExtras: Glossary = parseGlossary(
      (() => {
        const raw = validRaw() as Mutable;
        raw.terms.Widget.en.chip = 'Late · {{days}} d';
        raw.terms.Widget.de.note = 'Ein langer Erklaertext';
        raw.terms.Widget.de.shortForm = 'Abschlag';
        return raw;
      })(),
    );

    it('does not match a query equal to a de note text', () => {
      expect(findTermsByAlias('Ein langer Erklaertext', withExtras)).toEqual([]);
    });

    it('does not match a query equal to an en chip template', () => {
      expect(findTermsByAlias('Late · {{days}} d', withExtras)).toEqual([]);
    });

    it('matches a query equal to the de short form', () => {
      expect(canons(findTermsByAlias('abschlag', withExtras))).toEqual(['Widget']);
    });
  });

  it('getBannedSynonyms flattens entries and attaches the owning canon', () => {
    expect(getBannedSynonyms(synthetic)).toEqual([
      { word: 'Gadget', locale: 'en', context: 'in tests', use: 'Widget' },
      { word: 'Doohickey', locale: 'de', use: 'Gizmo2' },
    ]);
  });
});
