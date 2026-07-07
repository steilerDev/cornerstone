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
