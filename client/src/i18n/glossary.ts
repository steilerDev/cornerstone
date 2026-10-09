/**
 * Typed, validated accessor over glossary.json (schema v2, glossary v1, #2192).
 *
 * Pure data: no i18next / react-i18next import. Consumers (search aliases in NavConfig / the
 * search UI, banned-synonym checks) read the parsed glossary through the helpers below.
 */
import rawGlossary from './glossary.json';

export const GLOSSARY_GROUPS = [
  'primaryNoun',
  'supportingNoun',
  'view',
  'diaryType',
  'scheduleWord',
  'statusWord',
  'figureWord',
  'homeWord',
  'historyEventType',
  'tabWord',
  'verb',
  'photoMarkup',
  'general',
] as const;
export type GlossaryGroup = (typeof GLOSSARY_GROUPS)[number];

/** Locales a term carries forms for: English plus every `_meta.locales` entry. */
export const GLOSSARY_LOCALES = ['de'] as const;
export type GlossaryExtraLocale = (typeof GLOSSARY_LOCALES)[number];
export type GlossaryLocale = 'en' | GlossaryExtraLocale;

export const GLOSSARY_FORM_KEYS = [
  'singular',
  'plural',
  'verb',
  'noun',
  'chip',
  'sentence',
  'shortForm',
  'shortFormNote',
  'note',
] as const;
export type GlossaryFormKey = (typeof GLOSSARY_FORM_KEYS)[number];
export type GlossaryForms = Partial<Record<GlossaryFormKey, string>>;

export const GLOSSARY_DE_SOURCES = ['approved', 'shipped'] as const;
export type GlossaryDeSource = (typeof GLOSSARY_DE_SOURCES)[number];

export interface GlossaryBannedWord {
  word: string;
  locale: GlossaryLocale;
  context?: string;
}

export interface GlossaryTerm {
  /** The English canon: the key in glossary.json. */
  canon: string;
  groups: readonly GlossaryGroup[];
  en: GlossaryForms;
  de: GlossaryForms;
  deSource: GlossaryDeSource;
  /** One line, English. */
  definition: string;
  doNotUse: readonly GlossaryBannedWord[];
  /** Former names: permanent search aliases (never removed). */
  formerly: readonly string[];
}

export interface GlossaryMeta {
  schemaVersion: 2;
  glossaryVersion: string;
  locales: readonly GlossaryExtraLocale[];
  lastUpdated: string;
  approval: {
    owner: { decision: string; date: string };
    translatorSignOff: { agent: 'translator'; date: string; statement: string };
  };
  transition: string;
}

export interface Glossary {
  meta: GlossaryMeta;
  terms: readonly GlossaryTerm[];
}

export interface GlossaryBannedSynonym extends GlossaryBannedWord {
  use: string;
}

export class GlossaryFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlossaryFormatError';
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, problem: string): never {
  throw new GlossaryFormatError(`${path}: ${problem}`);
}

function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) return fail(path, 'must be an object');
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(path, 'must be a non-empty string');
  }
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, 'must be an array');
  return value as unknown[];
}

function expectOnlyKeys(record: UnknownRecord, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, 'unknown key');
  }
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function parseMeta(raw: unknown): GlossaryMeta {
  const meta = expectRecord(raw, '_meta');
  if (meta.schemaVersion !== 2) fail('_meta.schemaVersion', 'must be 2');
  const glossaryVersion = expectString(meta.glossaryVersion, '_meta.glossaryVersion');
  const lastUpdated = expectString(meta.lastUpdated, '_meta.lastUpdated');
  const transition = expectString(meta.transition, '_meta.transition');

  const locales = expectArray(meta.locales, '_meta.locales').map((locale, i) => {
    if (!includes(GLOSSARY_LOCALES, locale)) {
      return fail(`_meta.locales[${i}]`, `must be one of ${GLOSSARY_LOCALES.join(', ')}`);
    }
    return locale;
  });

  const approval = expectRecord(meta.approval, '_meta.approval');
  const owner = expectRecord(approval.owner, '_meta.approval.owner');
  const signOff = expectRecord(approval.translatorSignOff, '_meta.approval.translatorSignOff');
  if (signOff.agent !== 'translator') {
    fail('_meta.approval.translatorSignOff.agent', 'must be "translator"');
  }

  return {
    schemaVersion: 2,
    glossaryVersion,
    locales,
    lastUpdated,
    approval: {
      owner: {
        decision: expectString(owner.decision, '_meta.approval.owner.decision'),
        date: expectString(owner.date, '_meta.approval.owner.date'),
      },
      translatorSignOff: {
        agent: 'translator',
        date: expectString(signOff.date, '_meta.approval.translatorSignOff.date'),
        statement: expectString(signOff.statement, '_meta.approval.translatorSignOff.statement'),
      },
    },
    transition,
  };
}

function parseForms(raw: unknown, path: string): GlossaryForms {
  const record = expectRecord(raw, path);
  const forms: GlossaryForms = {};
  for (const [key, value] of Object.entries(record)) {
    if (!includes(GLOSSARY_FORM_KEYS, key)) return fail(`${path}.${key}`, 'unknown form key');
    forms[key] = expectString(value, `${path}.${key}`);
  }
  if (forms.singular === undefined && forms.verb === undefined) {
    fail(path, 'must have at least one of singular or verb');
  }
  return forms;
}

function parseBannedWord(raw: unknown, path: string): GlossaryBannedWord {
  const record = expectRecord(raw, path);
  expectOnlyKeys(record, ['word', 'locale', 'context'], path);
  const word = expectString(record.word, `${path}.word`);
  const bannedLocales: readonly GlossaryLocale[] = ['en', ...GLOSSARY_LOCALES];
  if (!includes(bannedLocales, record.locale)) {
    return fail(`${path}.locale`, `must be one of ${bannedLocales.join(', ')}`);
  }
  const banned: GlossaryBannedWord = { word, locale: record.locale };
  if (record.context !== undefined) {
    banned.context = expectString(record.context, `${path}.context`);
  }
  return banned;
}

const TERM_KEYS: readonly string[] = [
  'groups',
  'en',
  ...GLOSSARY_LOCALES,
  'deSource',
  'definition',
  'doNotUse',
  'formerly',
];

function parseTerm(canon: string, raw: unknown): GlossaryTerm {
  const path = `terms["${canon}"]`;
  const term = expectRecord(raw, path);
  expectOnlyKeys(term, TERM_KEYS, path);

  const groupsRaw = expectArray(term.groups, `${path}.groups`);
  if (groupsRaw.length === 0) fail(`${path}.groups`, 'must not be empty');
  const groups = groupsRaw.map((group, i) => {
    if (!includes(GLOSSARY_GROUPS, group)) {
      return fail(`${path}.groups[${i}]`, 'must be a known glossary group');
    }
    return group;
  });
  if (new Set(groups).size !== groups.length) fail(`${path}.groups`, 'must not repeat a group');

  if (!includes(GLOSSARY_DE_SOURCES, term.deSource)) {
    fail(`${path}.deSource`, `must be one of ${GLOSSARY_DE_SOURCES.join(', ')}`);
  }

  const definition = expectString(term.definition, `${path}.definition`);
  if (definition.includes('\n') || definition.length > 200) {
    fail(`${path}.definition`, 'must be one non-empty line of at most 200 characters');
  }

  const doNotUse = expectArray(term.doNotUse, `${path}.doNotUse`).map((entry, i) =>
    parseBannedWord(entry, `${path}.doNotUse[${i}]`),
  );

  const formerly = expectArray(term.formerly, `${path}.formerly`).map((name, i) =>
    expectString(name, `${path}.formerly[${i}]`),
  );
  const seen = new Set<string>();
  for (const name of formerly) {
    const lower = name.toLocaleLowerCase('de');
    if (seen.has(lower)) fail(`${path}.formerly`, `duplicate former name "${name}"`);
    seen.add(lower);
  }

  return {
    canon,
    groups,
    en: parseForms(term.en, `${path}.en`),
    de: parseForms(term.de, `${path}.de`),
    deSource: term.deSource as GlossaryDeSource,
    definition,
    doNotUse,
    formerly,
  };
}

/** Structural validation of a parsed glossary.json; throws GlossaryFormatError with the path. */
export function parseGlossary(raw: unknown): Glossary {
  const root = expectRecord(raw, '$');
  const meta = parseMeta(root._meta);
  const termsRaw = expectRecord(root.terms, 'terms');
  const entries = Object.entries(termsRaw);
  if (entries.length === 0) fail('terms', 'must not be empty');
  return { meta, terms: entries.map(([canon, value]) => parseTerm(canon, value)) };
}

/** The parsed glossary.json (throws at import if the file is malformed). */
export const GLOSSARY: Glossary = parseGlossary(rawGlossary);

function normalizeQuery(value: string): string {
  return value.trim().normalize('NFC').toLocaleLowerCase('de');
}

/** canon → former names, for every term (terms with no former names map to []). */
export function getSearchAliases(
  glossary: Glossary = GLOSSARY,
): ReadonlyMap<string, readonly string[]> {
  return new Map(glossary.terms.map((term) => [term.canon, term.formerly]));
}

/** Forms that count as searchable names (notes, chips and sentence templates do not). */
const ALIAS_FORM_KEYS = ['singular', 'plural', 'verb', 'noun', 'shortForm'] as const;

/**
 * Terms whose canon, its singular/plural/verb/noun/shortForm in any locale, or a former name equals the query, case-insensitively after
 * trim + NFC + toLocaleLowerCase('de'). Empty/blank query → [].
 */
export function findTermsByAlias(
  query: string,
  glossary: Glossary = GLOSSARY,
): readonly GlossaryTerm[] {
  const needle = normalizeQuery(query);
  if (needle === '') return [];
  return glossary.terms.filter((term) => {
    const candidates: string[] = [term.canon, ...term.formerly];
    for (const forms of [term.en, term.de]) {
      for (const key of ALIAS_FORM_KEYS) {
        const form = forms[key];
        if (form !== undefined) candidates.push(form);
      }
    }
    return candidates.some((candidate) => normalizeQuery(candidate) === needle);
  });
}

/** Every doNotUse entry of every term, flattened, with `use` = the owning term's canon. */
export function getBannedSynonyms(glossary: Glossary = GLOSSARY): readonly GlossaryBannedSynonym[] {
  return glossary.terms.flatMap((term) =>
    term.doNotUse.map((banned) => ({ ...banned, use: term.canon })),
  );
}
