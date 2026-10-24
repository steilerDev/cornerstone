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
  getSearchableNames,
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

  it('addresses German users with du', () => {
    expect(GLOSSARY.meta.addressForm.de.form).toBe('du');
    expect(GLOSSARY.meta.addressForm.de.rule.length).toBeGreaterThan(0);
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
      ['costLine.estimate', 'Estimate', 'singular'],
      ['costLine.offered', 'Offered', 'singular'],
      ['costLine.invoiced', 'Invoiced', 'singular'],
      ['costLine.paid', 'Paid', 'singular'],
      ['costLine.submitted', 'Submitted', 'singular'],
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
    // Append-only: former names are permanent search aliases. Removing an entry is forbidden.
    // [canon, former name] for every `formerly` entry of glossary v1.
    const PERMANENT_ALIASES: [string, string][] = [
      ['Home', 'Dashboard'],
      ['Home', 'Overview'],
      ['Home', 'Project'],
      ['Home', 'Projekt'],
      ['Home', 'Projektübersicht'],
      ['Task', 'Work item'],
      ['Task', 'Work items'],
      ['Task', 'Arbeitspaket'],
      ['Task', 'Arbeitspakete'],
      ['Purchase', 'Household item'],
      ['Purchase', 'Household items'],
      ['Purchase', 'Haushaltsartikel'],
      ['Site diary', 'Construction diary'],
      ['Site diary', 'Diary'],
      ['Site diary', 'Tagebuch'],
      ['Caption', 'Photo description'],
      ['Company', 'Vendor'],
      ['Company', 'Vendors'],
      ['Company', 'Auftragnehmer'],
      ['Contact person', 'Contact'],
      ['Offer', 'Quotation'],
      ['Offer', 'Quotations'],
      ['Offer', 'Quote'],
      ['Area', 'Room'],
      ['Area', 'Location'],
      ['Money', 'Budget'],
      ['Cost line', 'Budget line'],
      ['Cost line', 'Budget lines'],
      ['Cost line', 'Budgetposition'],
      ['Cost line', 'Budgetpositionen'],
      ['Cost line', 'Line item'],
      ['Cost line', 'Allocation'],
      ['Basis', 'Confidence'],
      ['Professional estimate', 'Pro estimate'],
      ['Progress payment', 'Deposit'],
      ['Progress payment', 'Deposits'],
      ['Progress payment', 'Instalment'],
      ['Funding source', 'Budget source'],
      ['Funding source', 'Budget sources'],
      ['Funding source', 'Source'],
      ['Funding source', 'Sources'],
      ['Funding source', 'Budgetquelle'],
      ['Funding source', 'Budgetquellen'],
      ['Funding source', 'Geldquellen'],
      ['Own funds', 'Discretionary'],
      ['Grant', 'Subsidy'],
      ['Grant', 'Subsidies'],
      ['Grant', 'Subsidy program'],
      ['Grant', 'Payback'],
      ['Grant', 'Rückzahlung'],
      ['Grant', 'Zuschuss'],
      ['Grant', 'Zuschüsse'],
      ['Draw-down request', 'Claim'],
      ['Bank report', 'Reports'],
      ['Bank report', 'Berichte'],
      ['Trade', 'Specialty'],
      ['Cost category', 'Budget category'],
      ['Cost category', 'Budget categories'],
      ['Purchase category', 'Household item category'],
      ['Purchase category', 'Household item categories'],
      ['House', 'Household'],
      ['History', 'Automatic diary entries'],
      ['Checklist', 'Subtasks'],
      ['Checklist', 'Teilaufgaben'],
      ['Checklist item', 'Subtask'],
      ['Checklist item', 'Teilaufgabe'],
      ['Note', 'General note'],
      ['Note', 'Allgemeine Notiz'],
      ['Who', 'Assigned to'],
      ['Who', 'Responsible'],
      ['AI certainty', 'Confidence'],
      ['Schedule', 'Gantt'],
      ['Schedule', 'Gantt chart'],
      ['Schedule', 'Gantt-Diagramm'],
      ['Schedule', 'Timeline'],
      ['Project setup', 'Manage'],
      ['Project setup', 'Verwalten'],
      ['Account', 'Profile'],
      ['Account', 'Profil'],
      ['Users', 'User management'],
      ['Users', 'Benutzerverwaltung'],
      ['Daily log', 'Tägliches Protokoll'],
      ['Daily log', 'Tagesprotokoll'],
      ['Site visit', 'Inspection'],
      ['Site visit', 'Standortbesuch'],
      ['Site visit', 'Ortstermin'],
      ['Defect', 'Issue'],
      ['Defect', 'Problem'],
      ['Late', 'Delayed'],
      ['Holds up', 'Blocked by this'],
      ['To pay', 'Pending'],
      ['To pay', 'Open'],
      ['To pay', 'Ausstehend'],
      ['Paid', 'Paid so far'],
      ['Paid', 'Actual spend'],
      ['Submitted', 'Claimed'],
      ['Done', 'Completed'],
      ['Ordered', 'Purchased'],
      ['Ordered', 'Gekauft'],
      ['Delivery scheduled', 'Scheduled'],
      ['Delivered', 'Arrived'],
      ['Delivered', 'Angekommen'],
      ['Upcoming', 'Pending'],
      ['Used up', 'Exhausted'],
      ['Fixed', 'Resolved'],
      ['Left to spend', 'Remaining budget'],
      ['Left to spend', 'Headroom'],
      ['Expected cost', 'Committed'],
      ['Expected cost', 'Cost basis'],
      ['Expected cost', 'Planned cost range'],
      ['Expected grants', 'Expected payback'],
      ['After grants', 'Net'],
      ['After grants', 'Net cost'],
      ['Still to pay', 'Outstanding balance'],
      ['Still to pay', 'Pending amount'],
      ['Not yet paid', 'Outstanding'],
      ['Ready to submit', 'Claimable'],
      ['Remaining on offer', 'Remaining amount'],
      ['Allocated', 'Utilized'],
      ['Over-allocated', 'Overflow'],
      ['Split', 'Itemize'],
      ['Split', 'Itemization'],
      ['Calendar & contacts sync', 'DAV access'],
      ['Sign-in method', 'Authentication'],
      ['Single sign-on', 'OIDC'],
      ['Single sign-on', 'SSO'],
    ];

    it('lists every current former name (the literal list cannot fall behind)', () => {
      const current = GLOSSARY.terms.flatMap((t) => t.formerly.map((f) => `${t.canon}|${f}`));
      const pinned = new Set(PERMANENT_ALIASES.map(([c, f]) => `${c}|${f}`));
      expect(current.filter((entry) => !pinned.has(entry))).toEqual([]);
    });

    it.each(PERMANENT_ALIASES)('%s still resolves from its former name "%s"', (canon, former) => {
      expect(canons(findTermsByAlias(former))).toContain(canon);
      expect(getSearchAliases().get(canon)).toContain(former);
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
      addressForm: { de: { form: 'du', rule: 'Informal address everywhere.' } },
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
    ['a missing addressForm', (r) => delete r._meta.addressForm, '_meta.addressForm'],
    [
      'an addressForm that is not an object',
      (r) => (r._meta.addressForm = 'du'),
      '_meta.addressForm',
    ],
    ['an addressForm array', (r) => (r._meta.addressForm = []), '_meta.addressForm'],
    ['a missing de address form', (r) => delete r._meta.addressForm.de, '_meta.addressForm.de'],
    [
      'an extra locale in addressForm',
      (r) => (r._meta.addressForm.en = { form: 'you', rule: 'x' }),
      '_meta.addressForm.en',
    ],
    [
      'an extra key in an address form entry',
      (r) => (r._meta.addressForm.de.note = 'x'),
      '_meta.addressForm.de.note',
    ],
    [
      'a blank address form',
      (r) => (r._meta.addressForm.de.form = '  '),
      '_meta.addressForm.de.form',
    ],
    [
      'a blank address rule',
      (r) => (r._meta.addressForm.de.rule = ''),
      '_meta.addressForm.de.rule',
    ],
    ['an unknown _meta key', (r) => (r._meta.bogus = 1), '_meta.bogus'],
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

  describe('findTermsByAlias folds spellings', () => {
    const folded: Glossary = parseGlossary(
      (() => {
        const raw = validRaw() as Mutable;
        raw.terms.Widget.de.singular = 'Müller Fußleiste';
        raw.terms.Widget.formerly = ['Café Ärger'];
        return raw;
      })(),
    );

    it.each(['Muller Fussleiste', 'Mueller Fussleiste', 'MÜLLER FUßLEISTE', 'müller fussleiste'])(
      'finds the term by the spelling "%s"',
      (query) => {
        expect(canons(findTermsByAlias(query, folded))).toEqual(['Widget']);
      },
    );

    it('maps ß to ss in both directions', () => {
      expect(canons(findTermsByAlias('Fußleiste', folded))).toEqual([]);
      expect(canons(findTermsByAlias('Müller Fußleiste', folded))).toEqual(['Widget']);
      expect(canons(findTermsByAlias('Mueller Fußleiste', folded))).toEqual(['Widget']);
    });

    it('ignores accents on a former name', () => {
      expect(canons(findTermsByAlias('cafe arger', folded))).toEqual(['Widget']);
      expect(canons(findTermsByAlias('CAFÉ ÄRGER', folded))).toEqual(['Widget']);
      expect(canons(findTermsByAlias('cafe aerger', folded))).toEqual(['Widget']);
    });

    it('is exact after folding (no substring match)', () => {
      expect(findTermsByAlias('Muller', folded)).toEqual([]);
    });
  });

  describe('sentenceOne form key (#2223)', () => {
    it('is accepted as a form key and kept on the term', () => {
      const parsed = parseGlossary(
        mutated((r) => {
          r.terms.Widget.en.sentenceOne = '{{count}} widget';
          r.terms.Widget.de.sentenceOne = '{{count}} Ding';
        }),
      );
      const widget = parsed.terms.find((t) => t.canon === 'Widget')!;
      expect(widget.en.sentenceOne).toBe('{{count}} widget');
      expect(widget.de.sentenceOne).toBe('{{count}} Ding');
    });

    it('is not a search alias or searchable name', () => {
      const parsed = parseGlossary(
        mutated((r) => {
          r.terms.Widget.en.sentenceOne = 'One widget phrase';
        }),
      );
      const names = getSearchableNames(parsed.terms.find((t) => t.canon === 'Widget')!);
      expect(names.map((n) => n.text)).not.toContain('One widget phrase');
      expect(canons(findTermsByAlias('One widget phrase', parsed))).toEqual([]);
    });

    it('the real glossary carries it on Late in both locales (singular day late)', () => {
      const late = term('Late');
      expect(late.en.sentenceOne).toBe('{{count}} day late');
      expect(late.de.sentenceOne).toContain('{{count}}');
    });
  });

  describe('getSearchableNames', () => {
    const named: Glossary = parseGlossary(
      (() => {
        const raw = validRaw() as Mutable;
        const widget = raw.terms.Widget;
        widget.en.verb = 'Widgetize';
        widget.en.noun = 'Widgeting';
        widget.de.verb = 'Dingsen';
        widget.de.noun = 'Dingserei';
        widget.de.shortForm = 'Ding';
        widget.en.note = 'Not a name';
        widget.en.chip = 'Chip {{n}}';
        widget.en.sentence = 'Sentence {{n}}';
        return raw;
      })(),
    );
    const names = getSearchableNames(named.terms.find((t) => t.canon === 'Widget')!);
    const textOf = (former: boolean) => names.filter((n) => n.former === former).map((n) => n.text);

    it('starts with the canon, flagged as current', () => {
      expect(names[0]).toEqual({ text: 'Widget', former: false });
    });

    it('includes verb, noun and short forms of every locale as current names', () => {
      expect(textOf(false)).toEqual(
        expect.arrayContaining(['Widgetize', 'Widgeting', 'Dingsen', 'Dingserei', 'Ding']),
      );
    });

    it('flags former names and only those', () => {
      expect(textOf(true)).toEqual(['Gizmo']);
    });

    it('excludes notes, chips and sentence templates', () => {
      const all = names.map((n) => n.text);
      expect(all).not.toContain('Not a name');
      expect(all).not.toContain('Chip {{n}}');
      expect(all).not.toContain('Sentence {{n}}');
    });

    it('returns every real term at least its canon', () => {
      for (const t of GLOSSARY.terms) {
        expect(getSearchableNames(t)[0]).toEqual({ text: t.canon, former: false });
        expect(
          getSearchableNames(t)
            .filter((n) => n.former)
            .map((n) => n.text),
        ).toEqual([...t.formerly]);
      }
    });

    it('finds a term through its verb and noun forms', () => {
      expect(canons(findTermsByAlias('widgetize', named))).toEqual(['Widget']);
      expect(canons(findTermsByAlias('Dingserei', named))).toEqual(['Widget']);
    });
  });

  it('getBannedSynonyms flattens entries and attaches the owning canon', () => {
    expect(getBannedSynonyms(synthetic)).toEqual([
      { word: 'Gadget', locale: 'en', context: 'in tests', use: 'Widget' },
      { word: 'Doohickey', locale: 'de', use: 'Gizmo2' },
    ]);
  });
});
