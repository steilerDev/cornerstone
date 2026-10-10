import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard for #2136: a union-derived i18n key must come from `I18N_UNION_KEYS` (unionKeys.ts), never
 * from a template literal. This walks the production client sources and pins the exact set of
 * remaining template-literal `t()` keys / key-variable assignments to an explicit allow-list of
 * NON-union sites. Adding a template-literal key anywhere else fails the test.
 */

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `t(`…${` — a template-literal key passed straight to `t`. */
const T_CALL_RE = /\bt\(\s*`[^`]*?\$\{/g;
/** `= `a.b.${` — a key built into a variable that is later passed to `t`. */
const KEY_VAR_RE = /=\s*`[A-Za-z][\w.]*\.\$\{/g;

/** Returns each flagged snippet found in `source`. */
function findTemplateLiteralKeys(source: string): string[] {
  return [...source.matchAll(T_CALL_RE), ...source.matchAll(KEY_VAR_RE)].map((m) => m[0]);
}

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collectSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Non-union sites: dynamic suffixes that are not members of a shared `as const` tuple. */
const ALLOW_LIST: readonly { file: string; snippet: string }[] = [
  // `_one` / `_other` plural suffix ternaries
  {
    file: 'lib/reportContent/buildReportContent.ts',
    snippet: 't(`sourceReports.table.attachmentsNoteNoType_${',
  },
  {
    file: 'lib/reportContent/buildReportContent.ts',
    snippet: 't(`sourceReports.table.attachmentsNote_${',
  },
  // Local copy-key tables / title keys, not shared unions
  { file: 'components/documents/LinkedDocumentsSection.tsx', snippet: 't(`linkedDocuments.${' },
  { file: 'components/documents/LinkedDocumentsSection.tsx', snippet: 't(`linkedDocuments.${' },
  {
    file: 'components/SourceBudgetLinePanel/SourceBudgetLinePanel.tsx',
    snippet: 't(`sources.lines.${',
  },
  // Capitalised palette colour key
  { file: 'components/photos/PhotoAnnotator/ToolPalette.tsx', snippet: 't(`color${' },
  // Not an i18n key: a user-preference storage key
  { file: 'hooks/useColumnPreferences.ts', snippet: '= `table.${' },
];

const toId = (file: string, snippet: string) => `${file} :: ${snippet}`;

describe('template-literal i18n keys (#2136)', () => {
  it('flags every template-literal t() key and key-variable assignment', () => {
    expect(findTemplateLiteralKeys('const a = t(`x.${y}`);')).toEqual(['t(`x.${']);
    expect(findTemplateLiteralKeys('const k = `detailPage.sourceType.${type}`;')).toEqual([
      '= `detailPage.sourceType.${',
    ]);
    expect(findTemplateLiteralKeys("const a = t('static.key');")).toEqual([]);
  });

  it('matches exactly the allow-listed non-union sites', () => {
    const found = collectSourceFiles(srcRoot)
      .flatMap((file) => {
        const rel = path.relative(srcRoot, file).split(path.sep).join('/');
        return findTemplateLiteralKeys(fs.readFileSync(file, 'utf8')).map((s) => toId(rel, s));
      })
      .sort();
    const allowed = ALLOW_LIST.map((a) => toId(a.file, a.snippet)).sort();

    // A new entry here means a template-literal key was introduced. If it enumerates a union,
    // add the union to I18N_UNION_KEYS (client/src/i18n/unionKeys.ts) and use `set.key(member)`
    // instead, so unionKeys.test.ts verifies every member has a translation in every locale.
    expect(found).toEqual(allowed);
  });
});
