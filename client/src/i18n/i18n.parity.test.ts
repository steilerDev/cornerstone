import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Import all English namespace files
import enCommon from './en/common.json';
import enErrors from './en/errors.json';
import enAuth from './en/auth.json';
import enDashboard from './en/dashboard.json';
import enWorkItems from './en/workItems.json';
import enHouseholdItems from './en/householdItems.json';
import enBudget from './en/budget.json';
import enSchedule from './en/schedule.json';
import enDiary from './en/diary.json';
import enDocuments from './en/documents.json';
import enSettings from './en/settings.json';
import enAreas from './en/areas.json';
import enPhotoViewer from './en/photoViewer.json';
import enPhotoAnnotator from './en/photoAnnotator.json';

// Import all German namespace files
import deCommon from './de/common.json';
import deErrors from './de/errors.json';
import deAuth from './de/auth.json';
import deDashboard from './de/dashboard.json';
import deWorkItems from './de/workItems.json';
import deHouseholdItems from './de/householdItems.json';
import deBudget from './de/budget.json';
import deSchedule from './de/schedule.json';
import deDiary from './de/diary.json';
import deDocuments from './de/documents.json';
import deSettings from './de/settings.json';
import deAreas from './de/areas.json';
import dePhotoViewer from './de/photoViewer.json';
import dePhotoAnnotator from './de/photoAnnotator.json';

// ─── Namespace registry ─────────────────────────────────────────────────────
//
// This list must be kept in sync with the `resources`/`ns` arrays in
// `client/src/i18n/index.ts`. Scenario 6 below cross-checks its length
// against the actual file count in `client/src/i18n/en/` so that adding or
// removing a namespace file without updating this array fails loudly instead
// of silently skipping parity/duplicate-key coverage for the new namespace.
const NAMESPACES: { name: string; en: Record<string, unknown>; de: Record<string, unknown> }[] = [
  { name: 'common', en: enCommon, de: deCommon },
  { name: 'errors', en: enErrors, de: deErrors },
  { name: 'auth', en: enAuth, de: deAuth },
  { name: 'dashboard', en: enDashboard, de: deDashboard },
  { name: 'workItems', en: enWorkItems, de: deWorkItems },
  { name: 'householdItems', en: enHouseholdItems, de: deHouseholdItems },
  { name: 'budget', en: enBudget, de: deBudget },
  { name: 'schedule', en: enSchedule, de: deSchedule },
  { name: 'diary', en: enDiary, de: deDiary },
  { name: 'documents', en: enDocuments, de: deDocuments },
  { name: 'settings', en: enSettings, de: deSettings },
  { name: 'areas', en: enAreas, de: deAreas },
  { name: 'photoViewer', en: enPhotoViewer, de: dePhotoViewer },
  { name: 'photoAnnotator', en: enPhotoAnnotator, de: dePhotoAnnotator },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively flattens a nested translation object into dot-delimited leaf keys. */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(flatten(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

/**
 * Recursive-descent duplicate-key scanner over raw JSON text.
 *
 * This is intentionally NOT a naive brace-counter: a shallow single-pass
 * brace-counting approach produces false positives on files containing
 * `{{interpolation}}` placeholders adjacent to nested-object boundaries
 * (discovered while authoring this test — a first-draft brace counter
 * flagged `entryTypes`/`status`/`actions`/`description`/`loadError` as
 * duplicates when they were not). This implementation tracks a proper
 * scope stack via recursive `parseValue()`/`parseObject()` descent so only
 * genuine same-scope duplicate keys are reported.
 */
function findDuplicateKeys(text: string): string[] {
  let i = 0;
  const n = text.length;
  const scopeStack: Set<string>[] = [];
  const dups: string[] = [];

  function skipWs() {
    while (i < n && /\s/.test(text[i]!)) i++;
  }
  function parseString(): string {
    i++; // opening quote
    let s = '';
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\') {
        s += text[i]! + text[i + 1]!;
        i += 2;
      } else {
        s += text[i];
        i++;
      }
    }
    i++; // closing quote
    return s;
  }
  function parseValue(): void {
    skipWs();
    const c = text[i];
    if (c === '{') {
      i++;
      scopeStack.push(new Set());
      skipWs();
      while (text[i] !== '}') {
        skipWs();
        const key = parseString();
        skipWs();
        i++; // colon
        const scope = scopeStack[scopeStack.length - 1]!;
        if (scope.has(key)) dups.push(key);
        else scope.add(key);
        parseValue();
        skipWs();
        if (text[i] === ',') {
          i++;
          skipWs();
        }
      }
      i++; // closing brace
      scopeStack.pop();
    } else if (c === '[') {
      i++;
      skipWs();
      while (text[i] !== ']') {
        parseValue();
        skipWs();
        if (text[i] === ',') {
          i++;
          skipWs();
        }
      }
      i++;
    } else if (c === '"') {
      parseString();
    } else {
      while (i < n && !/[,}\]\s]/.test(text[i]!)) i++;
    }
  }
  parseValue();
  return dups;
}

// ─── Scenario 6: namespace registration completeness ───────────────────────

describe('i18n namespace registration', () => {
  it('NAMESPACES array length matches the number of en/*.json files on disk', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const enDir = path.join(dirname, 'en');
    const fileCount = fs.readdirSync(enDir).filter((f) => f.endsWith('.json')).length;

    expect(NAMESPACES.length).toBe(fileCount);
  });
});

// ─── Scenario 7: recursive key-flatten parity per namespace ────────────────

describe('i18n en/de key parity', () => {
  for (const { name, en, de } of NAMESPACES) {
    describe(`${name} en/de parity`, () => {
      it('has identical key sets', () => {
        const enKeys = new Set(flatten(en));
        const deKeys = new Set(flatten(de));

        const missingInDe = [...enKeys].filter((k) => !deKeys.has(k));
        const extraInDe = [...deKeys].filter((k) => !enKeys.has(k));

        expect(missingInDe).toEqual([]);
        expect(extraInDe).toEqual([]);
      });
    });
  }
});

// ─── Scenario 8: duplicate-key guard across all locale files ───────────────

describe('findDuplicateKeys parser self-tests', () => {
  it('flags a genuine same-scope duplicate key', () => {
    expect(findDuplicateKeys('{"a": {"x": 1, "x": 2}}')).toEqual(['x']);
  });

  it('does not flag identically named keys in different scopes', () => {
    expect(findDuplicateKeys('{"a": {"x": 1}, "b": {"x": 2}}')).toEqual([]);
  });

  it('does not flag an interpolation placeholder adjacent to a nested object boundary', () => {
    expect(findDuplicateKeys('{"a": {"b": "{{count}} items"}, "c": {"b": 2}}')).toEqual([]);
  });
});

describe('i18n duplicate JSON key guard', () => {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const locales = ['en', 'de'] as const;

  for (const locale of locales) {
    const localeDir = path.join(dirname, locale);
    const files = fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      it(`${locale}/${file} has no duplicate keys within any single object`, () => {
        const text = fs.readFileSync(path.join(localeDir, file), 'utf-8');
        expect(findDuplicateKeys(text)).toEqual([]);
      });
    }
  }
});

// ─── #1959: inline PDF labels must not be able to wrap mid-label ───────────
//
// `overviewPdf.ts` renders three labels as a bracketed inline suffix on the report's
// allocated-amount cell — `(${label})` at 8pt in a 75pt-wide column. If such a label contains an
// ordinary space, pdfmake wraps at it and splits the brackets across two lines: `ux-designer`
// measured a real render producing `€4,000.00 (less` / `deposit)` in EN and `(Teilbetrag) (abzgl.` /
// `Abschlag)` in DE, in a document sent to a bank. The fix was U+00A0 (same glyph advance, so no
// width or geometry constant moved).
//
// WHY THIS LIVES HERE, and not only as a literal in realRender.test.ts. Both exist, deliberately,
// because they catch different things:
//   - The literal in realRender.test.ts pins WIRING — that the deposit-reduced label of the REPORT
//     language reaches the allocated-amount cell. It is what catches a cross-key or cross-locale
//     mix-up (rendering `splitNote` where `depositReducedNote` belongs). A "contains no space"
//     assertion there would happily pass while the wrong label rendered.
//   - This test pins the TYPOGRAPHIC INVARIANT, and it is the one that survives copy edits: reword
//     the labels freely and it still holds. It also covers every locale and every future label
//     automatically, which is the real regression surface — the next translator to add a
//     two-word inline label, or anyone who "fixes" an NBSP mismatch by retyping a plain space
//     (the two are visually identical), fails here.
describe('#1959 inline PDF label typography', () => {
  const budget = NAMESPACES.find((ns) => ns.name === 'budget')!;
  // Iterate the namespace entry's own locale keys so a newly added locale is covered without
  // touching this test (the registry above is the single source of truth for which locales exist).
  const localeBundles = Object.entries(budget).filter(([k]) => k !== 'name') as [
    string,
    Record<string, unknown>,
  ][];

  /** Reads a dot-delimited string leaf out of a locale bundle, failing loudly if it is absent. */
  function label(bundle: Record<string, unknown>, dottedPath: string): string {
    let node: unknown = bundle;
    for (const segment of dottedPath.split('.')) {
      if (node === null || typeof node !== 'object') {
        throw new Error(`${dottedPath} — segment "${segment}" has no parent object`);
      }
      node = (node as Record<string, unknown>)[segment];
    }
    if (typeof node !== 'string') {
      throw new Error(`${dottedPath} is missing or not a string (got ${typeof node})`);
    }
    return node;
  }

  it('covers every registered locale (guards against this suite silently testing only one)', () => {
    expect(localeBundles.map(([locale]) => locale).sort()).toEqual(['de', 'en']);
  });

  // These two keys exist for no purpose other than the bracketed inline suffix, so the constraint
  // is unconditional for them.
  for (const key of ['splitInlineLabel', 'depositReducedInlineLabel']) {
    for (const [locale, bundle] of localeBundles) {
      it(`${locale}: sourceReports.table.${key} contains no breaking space (U+0020) — it would split the brackets across lines`, () => {
        const value = label(bundle, `sourceReports.table.${key}`);
        // Positive anchor first: a non-empty label, so the absence assertion below cannot pass on
        // an empty or missing string.
        expect(value.length).toBeGreaterThan(0);
        expect(value).not.toContain(' ');
        // Any whitespace this label does contain must be exactly U+00A0. Asserted on the whole
        // string rather than only U+0020, so a "fix" swapping in some other whitespace is caught:
        // a tab or U+2009 thin space would still break the line, and even U+202F (narrow NBSP,
        // which does not break) is rejected deliberately — it has a NARROWER glyph advance than
        // U+00A0, and "same advance, so no width or geometry constant moved" is precisely what
        // made this fix safe to land without re-measuring the column budgets.
        // '\u00A0' as an escape, not a literal — this file is the one telling everyone else
        // that an invisible NBSP is the hazard, so it must not smuggle one into its own
        // source. (It did, on first writing. Caught by scanning this file's own codepoints.)
        const breaking = [...value].filter((c) => /\s/u.test(c) && c !== '\u00A0');
        expect(breaking).toEqual([]);
      });
    }
  }

  // `attachmentType.deposit` is the third label rendered bracketed inline — but unlike the two
  // above it is SHARED: buildReportContent.ts also comma-joins it into the flowing attachments-note
  // prose ("2 attachments: Quotation, Invoice"), where a non-breaking space would be over-reach.
  // So it is held to the weaker invariant that actually matters: it is a single word today, hence
  // has nothing to wrap at. If this ever fails, that is a decision point, not a typo — the new
  // multi-word value needs the same U+00A0 treatment as depositReducedInlineLabel, because it
  // renders in the same narrow bracketed slot.
  for (const [locale, bundle] of localeBundles) {
    it(`${locale}: sourceReports.table.attachmentType.deposit is a single word, so the bracketed inline form cannot wrap`, () => {
      const value = label(bundle, 'sourceReports.table.attachmentType.deposit');
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toMatch(/\s/u);
    });
  }
});
