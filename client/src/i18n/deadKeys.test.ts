import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18N_UNION_KEYS } from './unionKeys.js';

/**
 * Guard for #2259 (AC1): every English leaf key must be referenced by production code. A key
 * counts as used when a string literal equals it (bare or `ns:`-prefixed), when it is reached
 * through a plural/context suffix, a concatenation prefix, a `t(` template head, or an
 * `I18N_UNION_KEYS` member. Reference-data keys in SQL migrations also count.
 */

const i18nDir = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = path.resolve(i18nDir, '..');
const repoRoot = path.resolve(clientSrc, '../..');

type Resources = Record<string, Record<string, unknown>>;
interface UnionLike {
  ns: string;
  key(member: string): string;
  members: readonly string[];
}
interface Usage {
  literals: Set<string>;
  prefixes: string[];
}

const LITERAL_RE = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$\\\n]*)`/g;
const T_TEMPLATE_HEAD_RE = /\bt\(\s*`([^`]*?)\$\{/g;

/** Flatten nested JSON to dot-path leaf keys. */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

/** Collect literals and `t(` template heads from one source text into `usage`. */
function collectUsage(source: string, usage: Usage): void {
  for (const m of source.matchAll(LITERAL_RE)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    if (value === '') continue;
    usage.literals.add(value);
    if (value.endsWith('.')) usage.prefixes.push(value);
  }
  for (const m of source.matchAll(T_TEMPLATE_HEAD_RE)) {
    const head = m[1] ?? '';
    if (head !== '') usage.prefixes.push(head);
  }
}

function unionKeyLiterals(sets: readonly UnionLike[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) for (const member of set.members) out.add(`${set.ns}:${set.key(member)}`);
  return out;
}

/** Returns `ns:key` for every leaf of `resources` that no usage rule reaches. */
function findDeadKeys(
  resources: Resources,
  usage: Usage,
  unionKeys: ReadonlySet<string>,
): string[] {
  const isUsedForm = (ns: string, key: string): boolean =>
    usage.literals.has(key) || usage.literals.has(`${ns}:${key}`) || unionKeys.has(`${ns}:${key}`);

  const dead: string[] = [];
  for (const [ns, tree] of Object.entries(resources)) {
    for (const key of flatten(tree)) {
      const stripped1 = key.replace(/_[a-z]+$/, '');
      const stripped2 = stripped1.replace(/_[a-z]+$/, '');
      const used =
        isUsedForm(ns, key) ||
        isUsedForm(ns, stripped1) ||
        isUsedForm(ns, stripped2) ||
        usage.prefixes.some((p) => key.startsWith(p) || `${ns}:${key}`.startsWith(p));
      if (!used) dead.push(`${ns}:${key}`);
    }
  }
  return dead.sort();
}

function scan(sources: string[], resources: Resources, sets: readonly UnionLike[] = []): string[] {
  const usage: Usage = { literals: new Set(), prefixes: [] };
  for (const s of sources) collectUsage(s, usage);
  return findDeadKeys(resources, usage, unionKeyLiterals(sets));
}

function walk(dir: string, exts: RegExp, skipTests: boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') return [];
      if (full === path.join(clientSrc, 'test')) return [];
      return walk(full, exts, skipTests);
    }
    if (!exts.test(entry.name)) return [];
    if (skipTests && /\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

describe('dead i18n keys (#2259)', () => {
  it('reports exactly the unreferenced leaf (literal reference)', () => {
    const resources = { ns: { a: { used: 'x', dead: 'y' } } };
    expect(scan(["t('a.used')"], resources)).toEqual(['ns:a.dead']);
  });

  it('treats an ns-prefixed literal as a reference', () => {
    const resources = { ns: { a: { dead: 'y' } } };
    expect(scan(["t('ns:a.dead')"], resources)).toEqual([]);
  });

  it('resolves plural and context suffixes, but not orphans', () => {
    const resources = {
      ns: { count_one: 'a', count_other: 'b', label_range_one: 'c', orphan_one: 'd' },
    };
    expect(scan(["t('count')", "t('label')"], resources)).toEqual(['ns:orphan_one']);
  });

  it('uses only t( template heads, never other template strings', () => {
    const resources = { ns: { colourRed: 'r', table: { col: 'c' } } };
    const sources = ['t(`colour${x}`)', 'const k = `table.${x}`;'];
    expect(scan(sources, resources)).toEqual(['ns:table.col']);
  });

  it('counts concatenation prefixes ending in a dot', () => {
    const resources = { ns: { group: { one: '1' } } };
    expect(scan(["t('group.' + id)"], resources)).toEqual([]);
  });

  it('counts union members and leaves other keys dead', () => {
    const resources = { ns: { kind: { a: 'A', b: 'B' } } };
    const sets: UnionLike[] = [{ ns: 'ns', key: (m) => `kind.${m}`, members: ['a'] }];
    expect(scan([], resources, sets)).toEqual(['ns:kind.b']);
  });

  it('counts literals from SQL reference data', () => {
    const resources = { ns: { trades: { plumbing: 'Plumbing' } } };
    expect(scan(["INSERT INTO t VALUES ('trades.plumbing');"], resources)).toEqual([]);
  });

  describe('real sources', () => {
    const enDir = path.join(i18nDir, 'en');
    const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith('.json'));
    const resources: Resources = Object.fromEntries(
      enFiles.map((f) => [
        f.replace(/\.json$/, ''),
        JSON.parse(fs.readFileSync(path.join(enDir, f), 'utf8')) as Record<string, unknown>,
      ]),
    );

    it('scans every English namespace file', () => {
      expect(Object.keys(resources)).toHaveLength(17);
    });

    it('finds no English key without a production reference', () => {
      const files = [
        ...walk(clientSrc, /\.(ts|tsx)$/, true),
        ...walk(path.join(repoRoot, 'shared/src'), /\.ts$/, true),
        ...walk(path.join(repoRoot, 'server/src'), /\.ts$/, true),
        ...walk(path.join(repoRoot, 'server/src/db/migrations'), /\.sql$/, false),
      ];
      const sources = files.map((f) => fs.readFileSync(f, 'utf8'));
      const dead = scan(sources, resources, Object.values(I18N_UNION_KEYS) as UnionLike[]);
      const message =
        dead.length === 0
          ? ''
          : `Dead i18n keys:\n${dead.join('\n')}\nDelete it from en and de, or reference it. ` +
            'If it is built dynamically, add it to I18N_UNION_KEYS.';
      expect({ dead, message }).toEqual({ dead: [], message: '' });
    });
  });
});
