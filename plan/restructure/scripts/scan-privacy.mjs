#!/usr/bin/env node
// scan-privacy.mjs -- fails when restructure material contains personal data (Q18).
//
// Profiles:
//   contact  email, phone, iban, street, postcode-city (used on PR title/body)
//   full     contact + money amounts (used on plan/restructure files)
// An optional denylist built locally from a private database adds exact-term matching.
// The denylist exists in memory only, and matches are never printed unmasked.
//
// Usage: node plan/restructure/scripts/scan-privacy.mjs [--stdin] [--profile contact|full]
//          [--denylist-db <path>] [paths...]
// Exit 0 = clean, 1 = findings, 2 = usage or IO error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { REPO_ROOT, RESTRUCTURE_DIR, isMain } from './lib/io.mjs';

const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];
const ALLOWED_EMAIL_TLDS = ['example', 'test', 'invalid'];
const ALLOWED_EMAILS = ['noreply@anthropic.com'];
const ALLOWED_EMAIL_SUFFIXES = ['users.noreply.github.com'];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_INTL_RE = /(?<![\w.-])(?:\+|00)[1-9]\d{0,2}(?:[\s./-]?\(?\d+\)?){2,}/g;
const PHONE_DE_RE = /(?<![\w.-])0\d{2,5}[\s/-]\d{3,}(?:[\s/-]?\d+)*/g;
const IBAN_RE = /\bDE(?:\s?\d){20}\b/g;
const STREET_SUFFIX = 'stra(?:ß|ss)e|str\\.|weg|gasse|allee|platz|ring|damm|ufer';
const STREET_RE = new RegExp(
  `(?:\\p{Lu}\\p{L}{2,}(?:${STREET_SUFFIX})|\\p{Lu}\\p{L}*\\s(?:Stra(?:ß|ss)e|Str\\.|Weg|Gasse|Allee|Platz|Ring|Damm|Ufer))\\s+\\d{1,4}\\s?[a-z]?(?![\\p{L}\\d])`,
  'gu',
);
const POSTCODE_RE = /(?<![\d.,-])\d{5}\s+\p{Lu}\p{L}+/gu;
const MONEY_RE = /-?€\s?\d|\d\s?(?:€|EUR\b|Euro\b)|\b(?:EUR|Euro)\s?\d/g;

/**
 * @param {string} email
 * @returns {boolean} true when the address is on the synthetic/allowed list
 */
function isAllowedEmail(email) {
  const lower = email.toLowerCase();
  if (ALLOWED_EMAILS.includes(lower)) return true;
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  if (ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  if (ALLOWED_EMAIL_SUFFIXES.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return ALLOWED_EMAIL_TLDS.includes(tld);
}

const digitCount = (s) => (s.match(/\d/g) ?? []).length;

/**
 * @param {string} s
 * @returns {string} first char followed by asterisks
 */
export function mask(s) {
  return s.length <= 1 ? '*' : s[0] + '*'.repeat(s.length - 1);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {Array<string | { term: string, source?: string }>} denylist
 * @returns {Array<{ re: RegExp, source: string }>}
 */
function compileDenylist(denylist) {
  return denylist
    .map((entry) => (typeof entry === 'string' ? { term: entry, source: 'term' } : entry))
    .filter((e) => e.term && e.term.length >= 1)
    .map((e) => ({
      re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(e.term)}(?![\\p{L}\\p{N}])`, 'giu'),
      source: e.source ?? 'term',
    }));
}

/**
 * Scan text for personal data.
 * @param {string} text
 * @param {{ profile?: 'contact'|'full', denylist?: Array<string | { term: string, source?: string }> }} [opts]
 * @returns {{ line: number, column: number, category: string, match: string }[]}
 */
export function scanText(text, { profile = 'full', denylist = [] } = {}) {
  const findings = [];
  const compiled = compileDenylist(denylist);
  const lines = text.split(/\r?\n/);
  lines.forEach((content, i) => {
    const add = (index, category, match) =>
      findings.push({ line: i + 1, column: index + 1, category, match });

    for (const m of content.matchAll(EMAIL_RE)) {
      if (!isAllowedEmail(m[0])) add(m.index, 'email', m[0]);
    }
    const ibanSpans = [...content.matchAll(IBAN_RE)].map((m) => [m.index, m.index + m[0].length]);
    for (const [start] of ibanSpans) add(start, 'iban', content.slice(start).match(IBAN_RE)[0]);
    const seenPhones = new Set();
    for (const re of [PHONE_INTL_RE, PHONE_DE_RE]) {
      for (const m of content.matchAll(re)) {
        const value = m[0].trimEnd();
        const inIban = ibanSpans.some(([s, e]) => m.index < e && m.index + value.length > s);
        if (inIban || seenPhones.has(m.index)) continue;
        if (digitCount(value) >= 7 && !/^\d{4}-\d{2}-\d{2}/.test(value)) {
          seenPhones.add(m.index);
          add(m.index, 'phone', value);
        }
      }
    }
    for (const m of content.matchAll(STREET_RE)) add(m.index, 'street', m[0]);
    for (const m of content.matchAll(POSTCODE_RE)) {
      if (!/\s(?:Euro|EUR)$/.test(m[0])) add(m.index, 'postcode-city', m[0]);
    }
    if (profile === 'full') {
      for (const m of content.matchAll(MONEY_RE)) add(m.index, 'money', m[0]);
    }
    for (const { re, source } of compiled) {
      for (const m of content.matchAll(re)) add(m.index, `denylist:${source}`, m[0]);
    }
  });
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}

// --- denylist from a private database ---------------------------------------

/** Generic role words that must never become denylist terms (they appear in guard values etc.). */
export const DENYLIST_STOPWORDS = new Set([
  'admin',
  'member',
  'user',
  'owner',
  'guest',
  'test',
  'demo',
]);

/** @param {number} n @returns {string[]} the amount rendered in plain, en and de grouping */
function renderAmount(n) {
  const fixed = n.toFixed(2);
  const [int, frac] = fixed.split('.');
  const group = (sep) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return [
    String(n),
    fixed,
    `${group(',')}.${frac}`,
    `${group('.')},${frac}`,
    group(','),
    group('.'),
  ];
}

/**
 * Build a denylist from a real database (read-only). Terms stay in memory.
 * Tables and columns that do not exist are skipped, so older or newer schemas work.
 * @param {string} dbPath
 * @returns {Promise<Array<{ term: string, source: string }>>}
 */
export async function loadDenylistFromDb(dbPath) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const terms = new Map();
  const add = (value, source) => {
    if (value === null || value === undefined) return;
    const term = String(value).trim();
    if (
      term.length >= 4 &&
      !DENYLIST_STOPWORDS.has(term.toLowerCase()) &&
      !terms.has(term.toLowerCase())
    ) {
      terms.set(term.toLowerCase(), { term, source });
    }
  };
  const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all();
  const textColumns = (table, wanted) => {
    const cols = new Set(columnsOf(table).map((c) => c.name));
    return wanted.filter((c) => cols.has(c));
  };
  const rowsOf = (table, cols) =>
    cols.length === 0 ? [] : db.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();

  try {
    const plain = {
      vendors: ['name', 'phone', 'email', 'address'],
      vendor_contacts: ['name', 'first_name', 'last_name', 'phone', 'email'],
      budget_sources: ['name', 'reference', 'contact_address'],
      invoices: ['invoice_number'],
    };
    for (const [table, wanted] of Object.entries(plain)) {
      const cols = textColumns(table, wanted);
      for (const row of rowsOf(table, cols)) for (const c of cols) add(row[c], table);
    }

    const userCols = textColumns('users', ['display_name', 'email']);
    for (const row of rowsOf('users', userCols)) {
      add(row.display_name, 'users');
      add(row.email, 'users');
      for (const token of String(row.display_name ?? '').split(/\s+/)) add(token, 'users');
    }

    if (columnsOf('app_settings').length > 0) {
      for (const row of db.prepare('SELECT key, value FROM app_settings').all()) {
        if (/household|address|name|city|town/i.test(String(row.key))) {
          add(row.value, 'app_settings');
        }
      }
    }

    for (const table of [
      'invoices',
      'invoice_deposits',
      'budget_sources',
      'work_item_budgets',
      'household_item_budgets',
    ]) {
      const realCols = columnsOf(table)
        .filter((c) => /REAL|FLOAT|DOUBLE|NUMERIC/i.test(String(c.type)))
        .map((c) => c.name);
      for (const row of rowsOf(table, realCols)) {
        for (const c of realCols) {
          const n = row[c];
          if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) < 100) continue;
          for (const form of renderAmount(Math.abs(n))) add(form, `money:${table}`);
        }
      }
    }
  } finally {
    db.close();
  }
  return [...terms.values()];
}

// --- file walking ------------------------------------------------------------

const SCAN_EXTENSIONS = new Set(['.json', '.md', '.mjs', '.txt', '.ts', '.tsx', '.js', '.cjs']);

/**
 * @param {string} path file or directory
 * @returns {string[]} scannable files (recursive), skipping tests and node_modules
 */
export function collectFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  const out = [];
  for (const name of readdirSync(path).sort()) {
    if (name === 'node_modules') continue;
    const full = join(path, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectFiles(full));
    else if (SCAN_EXTENSIONS.has(extname(name)) && !/\.test\.[^.]+$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Scan files and format findings (masked) as `file:line:col category masked`.
 * @param {string[]} paths
 * @param {{ profile?: 'contact'|'full', denylist?: any[], cwd?: string }} [opts]
 * @returns {string[]}
 */
export function scanPaths(paths, { profile = 'full', denylist = [], cwd = REPO_ROOT } = {}) {
  const lines = [];
  for (const p of paths) {
    for (const file of collectFiles(p)) {
      const found = scanText(readFileSync(file, 'utf8'), { profile, denylist });
      for (const f of found) {
        lines.push(`${relative(cwd, file)}:${f.line}:${f.column} ${f.category} ${mask(f.match)}`);
      }
    }
  }
  return lines;
}

// --- CLI ---------------------------------------------------------------------

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { stdin: false, profile: 'full', denylistDb: null, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stdin') opts.stdin = true;
    else if (a === '--profile') opts.profile = argv[++i];
    else if (a === '--denylist-db') {
      opts.denylistDb = argv[++i];
      if (!opts.denylistDb) throw new Error('--denylist-db needs a path');
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.paths.push(a);
  }
  if (!['contact', 'full'].includes(opts.profile)) {
    throw new Error('--profile must be contact or full');
  }
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`scan-privacy: ${err.message}`);
    process.exit(2);
  }
  try {
    const denylist = opts.denylistDb ? await loadDenylistFromDb(opts.denylistDb) : [];
    let lines;
    if (opts.stdin) {
      const text = readFileSync(0, 'utf8');
      lines = scanText(text, { profile: opts.profile, denylist }).map(
        (f) => `stdin:${f.line}:${f.column} ${f.category} ${mask(f.match)}`,
      );
    } else {
      const paths = opts.paths.length > 0 ? opts.paths : [RESTRUCTURE_DIR];
      lines = scanPaths(paths, { profile: opts.profile, denylist });
    }
    if (lines.length > 0) {
      console.error(lines.join('\n'));
      console.error(
        `scan-privacy: ${lines.length} finding(s) -- remove or replace with synthetic data`,
      );
      process.exit(1);
    }
    console.log('scan-privacy: clean');
  } catch (err) {
    console.error(`scan-privacy: ${err.message}`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) await main();
