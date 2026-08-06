#!/usr/bin/env node
// i18n-audit.mjs -- deterministic translation audit. Replaces the translator
// agent's hand-executed audit protocol; the agent runs this and fixes findings.
//
// Checks:
//   1. Key parity: every key present in en/<ns>.json exists in de/<ns>.json
//      (and vice versa), for every locale in glossary.json _meta.locales.
//   2. Usage coverage: every static t('key') / t('ns:key') / i18nKey="..."
//      call site resolves to a key in en AND all other locales.
//   3. Duplicate keys: repeated keys at the same object path in a locale file
//      (JSON.parse silently keeps the last one).
//   4. Glossary (warnings only): English glossary terms appearing verbatim in
//      non-English locale values (suggests an untranslated term).
//
// Usage: node scripts/i18n-audit.mjs
// Exit 0 = clean (warnings allowed), exit 1 = hard findings.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const I18N_DIR = 'client/src/i18n';
const SRC_DIR = 'client/src';
const EN = 'en';
const DEFAULT_NS = 'common';

const glossary = JSON.parse(readFileSync(join(I18N_DIR, 'glossary.json'), 'utf8'));
const locales = [EN, ...(glossary._meta?.locales ?? [])];

const findings = [];
const warnings = [];

// --- load + flatten locale files -------------------------------------------

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out);
    else out[path] = v;
  }
  return out;
}

/** keys[locale][ns] = { flatKey: value } */
const keys = {};
for (const locale of locales) {
  keys[locale] = {};
  for (const file of readdirSync(join(I18N_DIR, locale)).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    keys[locale][ns] = flatten(JSON.parse(readFileSync(join(I18N_DIR, locale, file), 'utf8')));
  }
}

// --- 1. parity --------------------------------------------------------------

const namespaces = [...new Set(locales.flatMap((l) => Object.keys(keys[l])))];
for (const ns of namespaces) {
  for (const locale of locales) {
    if (!keys[locale][ns]) {
      findings.push(`parity: namespace file ${locale}/${ns}.json is missing entirely`);
    }
  }
  for (const a of locales) {
    for (const b of locales) {
      if (a === b || !keys[a][ns] || !keys[b][ns]) continue;
      for (const k of Object.keys(keys[a][ns])) {
        if (!(k in keys[b][ns])) findings.push(`parity: ${ns}:${k} exists in ${a} but not in ${b}`);
      }
    }
  }
}

// --- 2. usage coverage ------------------------------------------------------

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || p.includes(`${SRC_DIR}/i18n`)) continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$/.test(entry.name)) {
      yield p;
    }
  }
}

// A key "resolves" if it exists exactly, as a plural family (key_one/_other/...),
// or as an object prefix (returnObjects usage).
function resolves(ns, key, locale) {
  const table = keys[locale]?.[ns];
  if (!table) return false;
  if (key in table) return true;
  return Object.keys(table).some((k) => k.startsWith(`${key}_`) || k.startsWith(`${key}.`));
}

for (const file of walk(SRC_DIR)) {
  const src = readFileSync(file, 'utf8');
  // Namespaces this file binds via useTranslation(...) -- all quoted strings
  // inside the call's parens (handles arrays and ternaries).
  const fileNs = [];
  let sawUseTranslation = false;
  for (const m of src.matchAll(/useTranslation\(([^)]*)\)/g)) {
    sawUseTranslation = true;
    for (const s of m[1].matchAll(/['"]([\w.-]+)['"]/g)) fileNs.push(s[1]);
    if (m[1].trim() === '') fileNs.push(DEFAULT_NS); // useTranslation() = default ns
  }

  const sites = [];
  for (const m of src.matchAll(/(?<![\w$.])t\(\s*(['"`])([^'"`\n]+?)\1/g)) sites.push(m[2]);
  for (const m of src.matchAll(/i18nKey\s*=\s*(['"])([^'"\n]+?)\1/g)) sites.push(m[2]);

  for (const raw of sites) {
    if (raw.includes('${')) continue; // dynamic key -- not statically checkable
    let ns = null;
    let key = raw;
    if (raw.includes(':'))
      [ns, key] = [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)];
    // Without an explicit ns prefix, the namespace can only be resolved when
    // this file itself binds one via useTranslation (t passed in as a prop is
    // not statically checkable -- skip rather than guess).
    if (!ns && !sawUseTranslation) continue;
    const candidates = ns ? [ns] : fileNs.length ? fileNs : [DEFAULT_NS];
    for (const locale of locales) {
      if (!candidates.some((c) => resolves(c, key, locale))) {
        findings.push(
          `coverage: ${file}: t('${raw}') does not resolve in ${locale} (namespaces tried: ${candidates.join(', ')})`,
        );
      }
    }
  }
}

// --- 3. duplicate keys ------------------------------------------------------

for (const locale of locales) {
  for (const file of readdirSync(join(I18N_DIR, locale)).filter((f) => f.endsWith('.json'))) {
    const lines = readFileSync(join(I18N_DIR, locale, file), 'utf8').split('\n');
    const stack = [];
    const seen = new Map();
    for (const [i, line] of lines.entries()) {
      const keyMatch = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:/);
      if (keyMatch) {
        const path = [...stack, keyMatch[1]].join('.');
        if (seen.has(path)) {
          findings.push(
            `duplicate: ${locale}/${file} line ${i + 1}: key "${path}" already defined at line ${seen.get(path)}`,
          );
        } else {
          seen.set(path, i + 1);
        }
        if (/\{\s*$/.test(line)) stack.push(keyMatch[1]);
      }
      if (/^\s*\}/.test(line) && stack.length > 0) stack.pop();
    }
  }
}

// --- 4. glossary term leakage (warnings) ------------------------------------

for (const [term, perLocale] of Object.entries(glossary.terms ?? {})) {
  for (const locale of locales.filter((l) => l !== EN)) {
    const forms = Object.values(perLocale?.[locale] ?? {});
    if (forms.includes(term)) continue; // translation intentionally equals English
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (const ns of Object.keys(keys[locale])) {
      for (const [k, v] of Object.entries(keys[locale][ns])) {
        if (typeof v === 'string' && re.test(v)) {
          warnings.push(
            `glossary: ${locale}/${ns}.json ${k}: contains English term "${term}" -- expected "${forms.join('" / "')}"`,
          );
        }
      }
    }
  }
}

// --- report -----------------------------------------------------------------

console.log(`# i18n audit\n`);
console.log(`Locales: ${locales.join(', ')} | Namespaces: ${namespaces.length}\n`);
if (findings.length === 0) console.log('No hard findings.');
else {
  console.log(`## Findings (${findings.length})\n`);
  for (const f of findings) console.log(`- ${f}`);
}
if (warnings.length > 0) {
  console.log(`\n## Warnings (${warnings.length}, non-blocking)\n`);
  for (const w of warnings) console.log(`- ${w}`);
}
process.exit(findings.length > 0 ? 1 : 0);
