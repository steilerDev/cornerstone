import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY, getBannedSynonyms } from './glossary.js';

/**
 * AC1 (#2258): no banned synonym and no retired domain word in any en or de value.
 * Locale files are read from disk so the walk covers every namespace file.
 *
 * Mutation notes (each must turn a test red):
 *  - en `budget.autoItemize.vendor` back to "Vendor"                  -> "doNotUse zero tolerance"
 *  - de `common.confirmDialog.impact.subtasks` back to "…Unteraufgaben:" -> "retired domain words"
 *  - add a doNotUse entry whose word is a canon form                  -> "context-only bans are listed"
 */
const i18nRoot = path.dirname(fileURLToPath(import.meta.url));

type Json = string | { [key: string]: Json };
type Locale = 'en' | 'de';

function loadLocale(locale: Locale): Record<string, Json> {
  const dir = path.join(i18nRoot, locale);
  const result: Record<string, Json> = {};
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.json')) {
      result[file.replace(/\.json$/, '')] = JSON.parse(
        fs.readFileSync(path.join(dir, file), 'utf8'),
      ) as Json;
    }
  }
  return result;
}

function flatten(node: Json, prefix: string, out: Map<string, string>): void {
  if (typeof node === 'string') {
    out.set(prefix, node);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

function flatLocale(locale: Locale): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ns, tree] of Object.entries(loadLocale(locale))) flatten(tree, ns, out);
  return out;
}

const values: Record<Locale, Map<string, string>> = { en: flatLocale('en'), de: flatLocale('de') };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Glossary forms, longest first, so "Funding sources" is stripped before "sources" could match.
const canonForms: string[] = [
  ...new Set(
    GLOSSARY.terms.flatMap((term) =>
      [term.canon, ...Object.values(term.en), ...Object.values(term.de)].filter(
        (form) => form.trim() !== '',
      ),
    ),
  ),
].sort((a, b) => b.length - a.length);

const canonRegex = new RegExp(
  canonForms.map((form) => `(?<!\\p{L})${escapeRegExp(form)}(?!\\p{L})`).join('|'),
  'giu',
);

function strip(value: string): string {
  return value.replace(/\{\{[^}]*\}\}/g, ' ').replace(canonRegex, ' ');
}

function offenders(
  locale: Locale,
  word: string,
  suffixes: string,
): { key: string; value: string }[] {
  const re = new RegExp(`(?<!\\p{L})${escapeRegExp(word)}(?:${suffixes})?(?!\\p{L})`, 'iu');
  return [...values[locale]]
    .filter(([, value]) => re.test(strip(value)))
    .map(([key, value]) => ({ key, value }));
}

const EN_SUFFIXES = 's|es';
const DE_SUFFIXES = 'e|en|n|s|es|ern';
const suffixesFor = (locale: Locale) => (locale === 'de' ? DE_SUFFIXES : EN_SUFFIXES);

const canonSet = new Set(canonForms.map((form) => form.toLowerCase()));
const banned = getBannedSynonyms();
const contextOnly = banned.filter((entry) => canonSet.has(entry.word.toLowerCase()));
const zeroTolerance = banned.filter((entry) => !canonSet.has(entry.word.toLowerCase()));

/** Documented exceptions: the bank-facing cover letter keeps "Project" (en). */
const ALLOWED: Record<string, string[]> = {
  'budget.sourceReports.coverLetter.subject.budget-overview': ['Project'],
  'budget.sourceReports.coverLetter.body.budget-overview': ['Project'],
};

describe('doNotUse zero tolerance (AC1)', () => {
  it('lists glossary doNotUse words', () => {
    expect(zeroTolerance.length).toBeGreaterThan(20);
  });

  it.each(zeroTolerance.map((entry) => [entry.word, entry.locale] as const))(
    'no %s (%s) in any value of that locale',
    (word, locale) => {
      const hits = offenders(locale, word, suffixesFor(locale)).filter(
        ({ key }) => !(ALLOWED[key] ?? []).includes(word),
      );
      expect(hits).toEqual([]);
    },
  );
});

describe('context-only bans are listed', () => {
  it('the bans that collide with a canon form are exactly the known four', () => {
    expect([...new Set(contextOnly.map((entry) => entry.word))].sort()).toEqual([
      'Net',
      'Open',
      'Overdue',
      'Overview',
    ]);
  });
});

const RETIRED: Record<Locale, string[]> = {
  en: [
    'Work item',
    'Household item',
    'Vendor',
    'Quotation',
    'Budget line',
    'Budget source',
    'Line item',
    'Subsidy',
    'Subtask',
    'Specialty',
    'Pro estimate',
    'Itemize',
    'Headroom',
    'Construction diary',
    'Photo description',
    'Deposit',
    'Instalment',
  ],
  de: [
    'Arbeitspaket',
    'Haushaltsartikel',
    'Auftragnehmer',
    'Budgetposition',
    'Budgetquelle',
    'Geldquellen',
    'Zuschuss',
    'Zuschüsse',
    'Unteraufgabe',
    'Teilaufgabe',
    'Tägliches Protokoll',
    'Standortbesuch',
  ],
};

/**
 * Retired German word the glossary does not list as a former name (it only lists "Teilaufgabe");
 * kept in the zero-tolerance list because the scan found it as a UI label before #2258.
 */
const NOT_IN_GLOSSARY = new Set(['unteraufgabe']);

describe('retired domain words (AC1)', () => {
  const retiredEntries = (['en', 'de'] as const).flatMap((locale) =>
    RETIRED[locale].map((word) => [word, locale] as const),
  );

  it.each(retiredEntries)('%s (%s) appears in no value', (word, locale) => {
    const hits = offenders(locale, word, suffixesFor(locale)).filter(
      ({ key }) => !(ALLOWED[key] ?? []).includes(word),
    );
    expect(hits).toEqual([]);
  });

  it('every listed word is a documented former name or banned word', () => {
    const documented = new Set<string>();
    for (const term of GLOSSARY.terms) {
      for (const name of term.formerly) documented.add(name.toLowerCase());
      for (const entry of term.doNotUse) documented.add(entry.word.toLowerCase());
    }
    const undocumented = Object.values(RETIRED)
      .flat()
      .filter(
        (word) => !documented.has(word.toLowerCase()) && !NOT_IN_GLOSSARY.has(word.toLowerCase()),
      );
    expect(undocumented).toEqual([]);
  });
});

describe('the walk is non-trivial', () => {
  it('walks more than 1000 values and en and de have the same size', () => {
    expect(values.en.size).toBeGreaterThan(1000);
    expect(values.de.size).toBe(values.en.size);
  });
});
