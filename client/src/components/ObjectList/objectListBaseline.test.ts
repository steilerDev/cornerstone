/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level pins for the pattern baseline (EPIC-21): the plan analyzer measures ObjectList's
// import closure at 0 destinations, 1 search field and 2 primary buttons. The 2nd "primary" is
// the Filters active-count badge (`shared.filtersToggleCount` in ObjectListFiltersPanel.tsx):
// its background is primary, but it is not a button. The one real primary button is the
// "New ‹object›" button in ObjectListHeader.tsx.
const DIR = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(DIR)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), 'utf8') }));

const BANNED = [
  'DataTable',
  'DataTableCard',
  'DataTableColumnSettings',
  'DataTableFilterPopover',
  'DataTableHeader',
  'DataTablePagination',
  'DataTableRow',
];

describe('ObjectList pattern baseline', () => {
  it('has exactly one className={styles.primary}, in ObjectListHeader.tsx', () => {
    const hits = sources.filter((s) => s.text.includes('className={styles.primary}'));
    expect(hits.map((h) => h.file)).toEqual(['ObjectListHeader.tsx']);
    const count = hits[0]?.text.split('className={styles.primary}').length ?? 0;
    expect(count - 1).toBe(1);
  });

  it('has the Filters count badge (not a button) as the only other primary-coloured element', () => {
    const badge = sources.filter((s) => s.text.includes('filtersToggleCount'));
    expect(badge.map((s) => s.file)).toEqual(['ObjectListFiltersPanel.tsx']);
  });

  it('imports none of the paged DataTable files (types included)', () => {
    for (const { file, text } of sources) {
      for (const name of BANNED) {
        const re = new RegExp(`from\\s+['"][^'"]*DataTable/${name}(\\.js)?['"]`);
        expect({ file, name, imported: re.test(text) }).toEqual({ file, name, imported: false });
      }
      const filters = /from\s+['"][^'"]*DataTable\/filters\//.test(text);
      expect({ file, filters }).toEqual({ file, filters: false });
    }
  });

  it('uses no router Link and no target attribute', () => {
    for (const { file, text } of sources) {
      const link = /import\s*{[^}]*\bLink\b[^}]*}\s*from\s*'react-router/.test(text);
      expect({ file, link }).toEqual({ file, link: false });
      expect({ file, target: /\btarget=/.test(text) }).toEqual({ file, target: false });
    }
  });

  it('has exactly one search field, in ObjectListToolbar.tsx', () => {
    const hits = sources.filter((s) => /type="search"|role="searchbox"/.test(s.text));
    expect(hits.map((h) => h.file)).toEqual(['ObjectListToolbar.tsx']);
    const count = (hits[0]?.text.match(/type="search"|role="searchbox"/g) ?? []).length;
    expect(count).toBe(1);
  });
});
