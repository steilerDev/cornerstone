#!/usr/bin/env node
// build-baseline.mjs -- measures the UI pattern counts of client/src and compares them with the
// committed baseline (plan/restructure/baseline.json). Counting rules are documented verbatim in
// plan/restructure/README.md; the baseline may only rise through allowedAdditions, or by a money label that is an English glossary form.
//
// Usage: node plan/restructure/scripts/build-baseline.mjs [--check|--write] [--client <dir>]
//   --check (default): exit 1 on rises; drops, new screens and consumed allowed additions
//                      print the notice "baseline is behind" and exit 0
//   --write: refuses (exit 1) while unallowed rises exist; otherwise rewrites `measured`,
//            moves consumed names out of allowedAdditions, keeps `audited` untouched
// Exit codes: 0 ok, 1 rises or refused write, 2 usage or IO error.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT, formatJson, isMain, readJson, writeOrCheck } from './lib/io.mjs';

// --- constants --------------------------------------------------------------------

const MONEY_WORDS = [
  'remaining',
  'budget(?:ed)?',
  'costs?',
  'paid',
  'unpaid',
  'outstanding',
  'amount',
  'total',
  'spent',
  'spend',
  '(?:un|over-?)allocated',
  'allocated',
  'claimable',
  'claimed',
  'payback',
  'headroom',
  'overflow',
  'net',
  'committed',
  'utili[sz]ed',
  'available',
  'balance',
  'price',
  'estimated?',
  'funding',
  'grants?',
  'subsid(?:y|ies)',
  'left to spend',
  'to pay',
  'deposits?',
  'refunds?',
  '(?:un)?invoiced',
  'payable',
  'expected cost',
  'actual cost',
  'planned cost',
];
const MONEY_RE = new RegExp(`\\b(?:${MONEY_WORDS.join('|')})\\b`);

const INITIAL_ALLOWED_ADDITIONS = [
  'TopBar',
  'BottomBar',
  'MoreSheet',
  'UserMenu',
  'Breadcrumbs',
  'CommandSearch',
  'CreateMenu',
  'ObjectForm',
  'ObjectHeader',
  'SummaryStrip',
  'SectionCard',
  'RelatedList',
  'FeedRow',
  'AttentionList',
  'StatTile',
  'MoneyFigure',
  'CostLineTable',
  'CostLineForm',
  'ReschedulePanel',
  'CaptureScreen',
  'TagChips',
  'RapidCamera',
  'ObjectTabs',
  'StatusMenu',
  'UndoToast',
  'ConfirmDialog',
  'EntityPicker',
  'ObjectList',
  'ReferenceList',
  'TreeTable',
  'DocumentsPanel',
];

const v = (code, description) => ({ code, description, examples: [] });

/** Hand-audited pattern inventories (names only, no data). Never recomputed by --write. */
const INITIAL_AUDITED = {
  createPatterns: {
    count: 11,
    variants: [
      v('Pg', 'dedicated /new page (work item, household item, milestone)'),
      v('PgD', 'draft-first page that continues on the edit page (diary entry)'),
      v('M', 'shared Modal (invoice, vendor, user, contact, deposit)'),
      v('Mh', 'hand-rolled modal (vendor-page invoice create, document link browser)'),
      v('IFt', 'header-toggled inline form (financing sources, subsidy programs)'),
      v('IFa', 'always-visible inline form (taxonomy management)'),
      v('IR', 'inline input row (work-item notes, subtasks)'),
      v('PK', 'picker modal with a create step (invoice add budget line)'),
      v('WF', 'multi-step flow page (Paperless invoice review, auto-itemize)'),
      v('Up', 'upload (photos on the diary edit page)'),
      v(
        'SPc',
        '"+ Add new X" inside a search picker (vendor in Paperless review and auto-itemize)',
      ),
    ],
  },
  saveModels: {
    count: 9,
    variants: [
      v('click', 'click-to-edit with Save and Cancel (work-item title)'),
      v('imm', 'immediate on change (work-item status, area, assignee)'),
      v('auto', 'per-field autosave with a status glyph (work-item dates)'),
      v('EP', 'separate edit page (household item, diary entry)'),
      v('ET', 'view/edit toggle (milestone card, vendor information)'),
      v('EM', 'edit modal (invoice, budget line)'),
      v('ER', 'inline row edit (sources, subsidies, taxonomy rows)'),
      v('DA', 'draft autosave then promote (diary draft)'),
      v('dirty', 'Save revealed on change (photo metadata side panel)'),
    ],
  },
  confirmationMechanisms: {
    count: 5,
    doubleConfirmations: 1,
    variants: [
      v('M', 'shared Modal'),
      v('Mh', 'hand-rolled modal'),
      v('CI', 'inline Confirm/Cancel swap (household-item budget line)'),
      v('WC', 'window.confirm (vendor contacts section, calendar access card)'),
      v('none', 'immediate removal (milestone unlink)'),
      v('double', 'modal plus inline confirm (work-item budget line)'),
    ],
  },
};

// --- file helpers -------------------------------------------------------------------

const isTestFile = (p) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '__mocks__') continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const isSourceFile = (p) => /\.tsx?$/.test(p) && !/\.d\.ts$/.test(p) && !isTestFile(p);

// --- CSS ----------------------------------------------------------------------------

/**
 * Tolerant CSS block tokenizer: returns flat rules (descending into at-rules like @media).
 * @param {string} cssText
 * @returns {{ selectors: string[], decls: [string, string][] }[]}
 */
export function parseCss(cssText) {
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  let start = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ';' || ch === '}') {
      start = i + 1;
      i++;
    } else if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const prelude = text.slice(start, i).trim();
      const body = text.slice(i + 1, j - 1);
      if (prelude.startsWith('@')) {
        if (!/^@(?:keyframes|font-face|-webkit-keyframes)/.test(prelude)) {
          rules.push(...parseCss(body));
        }
      } else if (prelude) {
        const decls = body
          .split(';')
          .map((d) => d.trim())
          .filter((d) => d && !d.includes('{'))
          .map((d) => {
            const k = d.indexOf(':');
            return k < 0 ? null : [d.slice(0, k).trim(), d.slice(k + 1).trim()];
          })
          .filter(Boolean);
        rules.push({ selectors: prelude.split(',').map((s) => s.trim()), decls });
      }
      i = j;
      start = j;
    } else {
      i++;
    }
  }
  return rules;
}

/**
 * Is `cls` a primary-button class in the CSS module at `cssPath`? A primary class has a plain
 * `.cls` rule declaring background(-color) exactly var(--color-primary), or composing one.
 * @param {string} cssPath absolute path
 * @param {string} cls
 * @param {(path: string) => string | null} readCss returns the file text or null
 * @param {Set<string>} [seen]
 * @returns {boolean}
 */
export function isPrimaryClass(cssPath, cls, readCss, seen = new Set()) {
  const key = `${cssPath}#${cls}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const text = readCss(cssPath);
  if (text === null) return false;
  for (const rule of parseCss(text)) {
    if (!rule.selectors.includes(`.${cls}`)) continue;
    for (const [prop, value] of rule.decls) {
      if (
        (prop === 'background' || prop === 'background-color') &&
        value === 'var(--color-primary)'
      ) {
        return true;
      }
      if (prop === 'composes') {
        const m = value.match(/^(.*?)(?:\s+from\s+['"]([^'"]+)['"]|\s+from\s+global)?$/);
        const names = (m?.[1] ?? '').split(/\s+/).filter(Boolean);
        const target = m?.[2] ? resolve(dirname(cssPath), m[2]) : cssPath;
        if (names.some((n) => isPrimaryClass(target, n, readCss, seen))) return true;
      }
    }
  }
  return false;
}

// --- per-file analysis ---------------------------------------------------------------

function tagOf(node) {
  return (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
}

function jsxAttrs(node) {
  return (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties.filter(
    ts.isJsxAttribute,
  );
}

function literalText(attribute) {
  const init = attribute?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return undefined;
}

function isTranslateSearchCall(attribute) {
  const init = attribute?.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return false;
  const e = init.expression;
  if (!ts.isCallExpression(e) || e.expression.getText() !== 't') return false;
  const first = e.arguments[0];
  return Boolean(first && ts.isStringLiteral(first) && /search/i.test(first.text));
}

/**
 * Analyse one source file.
 * @param {string} filePath absolute path
 * @param {string} text
 * @param {{ readCss: (p: string) => string | null, countSearch: boolean, countDialogs: boolean }} ctx
 * @returns {{ imports: string[], destinations: number, primaryButtons: number, searchFields: number,
 *   windowConfirm: number, handRolledDialogs: number }}
 */
export function analyzeFile(filePath, text, ctx) {
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
  const result = {
    imports: [],
    destinations: 0,
    primaryButtons: 0,
    searchFields: 0,
    windowConfirm: 0,
    handRolledDialogs: 0,
  };
  const routerTags = new Set();
  const cssImports = new Map(); // local identifier -> absolute css path

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (spec.startsWith('.')) result.imports.push(spec);
      const clause = stmt.importClause;
      if (
        spec === 'react-router-dom' &&
        clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings)
      ) {
        for (const el of clause.namedBindings.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (imported === 'Link' || imported === 'NavLink') routerTags.add(el.name.text);
        }
      }
      if (spec.endsWith('.module.css') && clause?.name) {
        cssImports.set(clause.name.text, resolve(dirname(filePath), spec));
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text.startsWith('.')
    ) {
      result.imports.push(stmt.moduleSpecifier.text);
    }
  }

  const classNameIsPrimary = (expr) => {
    let found = false;
    const check = (n) => {
      if (found) return;
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const css = cssImports.get(n.expression.text);
        if (css && isPrimaryClass(css, n.name.text, ctx.readCss)) found = true;
      } else if (
        ts.isElementAccessExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.argumentExpression &&
        ts.isStringLiteralLike(n.argumentExpression)
      ) {
        const css = cssImports.get(n.expression.text);
        if (css && isPrimaryClass(css, n.argumentExpression.text, ctx.readCss)) found = true;
      }
      ts.forEachChild(n, check);
    };
    check(expr);
    return found;
  };

  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node);
      const attrs = jsxAttrs(node);
      const byName = (n) => attrs.find((a) => a.name.getText() === n);
      if (routerTags.has(tag)) result.destinations++;
      const cn = byName('className');
      if (cn?.initializer && classNameIsPrimary(cn.initializer)) result.primaryButtons++;
      if (/^[a-z]/.test(tag)) {
        if (ctx.countSearch && tag === 'input') {
          const type = literalText(byName('type'));
          const role = literalText(byName('role'));
          if (
            type === 'search' ||
            role === 'searchbox' ||
            isTranslateSearchCall(byName('placeholder')) ||
            isTranslateSearchCall(byName('aria-label'))
          ) {
            result.searchFields++;
          }
        }
        if (
          ctx.countDialogs &&
          (literalText(byName('role')) === 'dialog' || byName('aria-modal'))
        ) {
          result.handRolledDialogs++;
        }
      }
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const el of node.elements) {
        if (
          ts.isObjectLiteralExpression(el) &&
          el.properties.some((p) => p.name && p.name.getText() === 'to')
        ) {
          result.destinations++;
        }
      }
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.getText() === 'window.confirm') result.windowConfirm++;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg) && arg.text.startsWith('.'))
          result.imports.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return result;
}

/** Resolve a relative import spec from `fromFile` to an existing source file, or null. */
export function resolveImport(fromFile, spec, exists) {
  const base = resolve(dirname(fromFile), spec.replace(/\.[cm]?jsx?$/, ''));
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

// --- audit ----------------------------------------------------------------------------

function flatten(obj, out = []) {
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') out.push(val);
    else if (val && typeof val === 'object') flatten(val, out);
  }
  return out;
}

/** Normalise an English UI string for money-label detection. */
export function normalizeLabel(s) {
  return s
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/[\s:…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Measure the UI pattern counts of the client source tree.
 * @param {string} clientSrcDir path to client/src
 */
export function auditClient(clientSrcDir) {
  const src = resolve(clientSrcDir);
  const files = walk(src).filter(isSourceFile);
  const fileSet = new Set(files);
  const cssCache = new Map();
  const readCss = (p) => {
    if (!cssCache.has(p)) cssCache.set(p, existsSync(p) ? readFileSync(p, 'utf8') : null);
    return cssCache.get(p);
  };
  const analysisCache = new Map();
  const analyse = (file) => {
    if (!analysisCache.has(file)) {
      const rel = relative(src, file).split(sep).join('/');
      const isPicker = rel.startsWith('components/SearchPicker/') || /Picker[^/]*\.tsx$/.test(rel);
      analysisCache.set(
        file,
        analyzeFile(file, readFileSync(file, 'utf8'), {
          readCss,
          countSearch: !isPicker,
          countDialogs: !rel.startsWith('components/Modal/'),
        }),
      );
    }
    return analysisCache.get(file);
  };

  const closure = (entries) => {
    const seen = new Set();
    const queue = [...entries];
    while (queue.length > 0) {
      const f = queue.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      for (const spec of analyse(f).imports) {
        const target = resolveImport(f, spec, (p) => fileSet.has(p));
        if (target && !seen.has(target)) queue.push(target);
      }
    }
    return [...seen];
  };
  const sumCounts = (list) =>
    list.reduce(
      (acc, f) => {
        const a = analyse(f);
        acc.destinations += a.destinations;
        acc.primaryButtons += a.primaryButtons;
        acc.searchFields += a.searchFields;
        return acc;
      },
      { destinations: 0, primaryButtons: 0, searchFields: 0 },
    );

  const screens = {};
  const pagesDir = join(src, 'pages');
  if (existsSync(pagesDir)) {
    for (const name of readdirSync(pagesDir).sort()) {
      const dir = join(pagesDir, name);
      if (name === 'shared' || !statSync(dir).isDirectory()) continue;
      const entries = files.filter((f) => f.startsWith(dir + sep));
      screens[name] = sumCounts(closure(entries));
    }
  }
  const shellFile = join(src, 'components/AppShell/AppShell.tsx');
  if (fileSet.has(shellFile)) screens.shell = sumCounts(closure([shellFile]));

  // shared components
  const compDir = join(src, 'components');
  const names = [];
  for (const f of files) {
    if (!f.endsWith('.tsx') || !f.startsWith(compDir + sep)) continue;
    const rel = relative(compDir, f)
      .split(sep)
      .join('/')
      .replace(/\.tsx$/, '');
    const parts = rel.split('/');
    const base = parts[parts.length - 1];
    if (!/^[A-Z]/.test(base)) continue;
    const sameDir = parts.length >= 2 && parts[parts.length - 2] === base;
    const domain = parts.length === 2 && /^[a-z]/.test(parts[0]);
    if (sameDir || domain) names.push(rel);
  }
  names.sort();

  // money labels
  const labels = new Set();
  const enDir = join(src, 'i18n/en');
  for (const f of walk(enDir).filter((p) => extname(p) === '.json')) {
    for (const value of flatten(readJson(f))) {
      const norm = normalizeLabel(value);
      if (norm && norm.split(' ').length <= 4 && MONEY_RE.test(norm)) labels.add(norm);
    }
  }
  const moneyValues = [...labels].sort();

  const totals = files.reduce(
    (acc, f) => {
      const a = analyse(f);
      acc.windowConfirm += a.windowConfirm;
      acc.handRolledDialogs += a.handRolledDialogs;
      return acc;
    },
    { windowConfirm: 0, handRolledDialogs: 0 },
  );

  return {
    screens: Object.fromEntries(Object.entries(screens).sort(([a], [b]) => a.localeCompare(b))),
    sharedComponents: { count: names.length, names },
    moneyLabels: { count: moneyValues.length, values: moneyValues },
    windowConfirm: totals.windowConfirm,
    handRolledDialogs: totals.handRolledDialogs,
  };
}

// --- comparison -----------------------------------------------------------------------

/** English forms a glossary term may appear as (client/src/i18n/glossary.json, schema v2). */
const GLOSSARY_EN_FORM_KEYS = [
  'singular',
  'plural',
  'verb',
  'noun',
  'chip',
  'sentence',
  'shortForm',
];

/**
 * Normalised English forms of every glossary term — the owner-approved vocabulary. A new money
 * label equal to one of them is recorded by plan:build, not counted as a rise.
 * @param {any} glossary parsed glossary.json (missing/odd shapes yield an empty set)
 * @returns {Set<string>}
 */
export function glossaryLabels(glossary) {
  const out = new Set();
  const terms = glossary?.terms;
  if (!terms || typeof terms !== 'object') return out;
  for (const term of Object.values(terms)) {
    for (const k of GLOSSARY_EN_FORM_KEYS) {
      const value = term?.en?.[k];
      if (typeof value !== 'string' || value === '') continue;
      const norm = normalizeLabel(value);
      if (norm) out.add(norm);
    }
  }
  return out;
}

/**
 * Compare a measurement with the baseline.
 * @param {any} baseline parsed baseline.json
 * @param {ReturnType<typeof auditClient>} measured
 * @param {Set<string>} [approvedLabels] normalised glossary labels (see glossaryLabels)
 * @returns {{ rises: string[], drops: string[], unrecorded: string[] }}
 */
export function compareBaseline(baseline, measured, approvedLabels = new Set()) {
  const rises = [];
  const drops = [];
  const unrecorded = [];
  const base = baseline?.measured ?? {};
  const allowed = new Set(baseline?.allowedAdditions?.sharedComponents ?? []);
  const compareNumber = (label, oldValue, newValue) => {
    if (newValue > oldValue) rises.push(`${label}: ${oldValue} → ${newValue}`);
    else if (newValue < oldValue) drops.push(`${label}: ${oldValue} → ${newValue}`);
  };

  const baseScreens = base.screens ?? {};
  for (const [name, m] of Object.entries(measured.screens)) {
    const b = baseScreens[name];
    if (!b) {
      unrecorded.push(`${name}: new screen not in baseline`);
      if (m.primaryButtons > 1)
        rises.push(`${name}.primaryButtons: (new screen) → ${m.primaryButtons}`);
      if (m.searchFields > 1) rises.push(`${name}.searchFields: (new screen) → ${m.searchFields}`);
      continue;
    }
    for (const metric of ['destinations', 'primaryButtons', 'searchFields']) {
      compareNumber(`${name}.${metric}`, b[metric] ?? 0, m[metric]);
    }
  }
  for (const name of Object.keys(baseScreens)) {
    if (!(name in measured.screens)) drops.push(`${name}: screen removed`);
  }

  const baseNames = new Set(base.sharedComponents?.names ?? []);
  for (const n of measured.sharedComponents.names) {
    if (allowed.has(basename(n)))
      unrecorded.push(`sharedComponents: ${basename(n)} not yet recorded`);
    if (baseNames.has(n)) continue;
    if (!allowed.has(basename(n))) {
      rises.push(`sharedComponents: new component ${n} is not in allowedAdditions`);
    }
  }
  for (const n of baseNames) {
    if (!measured.sharedComponents.names.includes(n)) drops.push(`sharedComponents: ${n} removed`);
  }

  const baseLabels = new Set(base.moneyLabels?.values ?? []);
  for (const label of measured.moneyLabels.values) {
    if (baseLabels.has(label)) continue;
    if (approvedLabels.has(label))
      unrecorded.push(`moneyLabels: glossary label "${label}" not yet recorded`);
    else rises.push(`moneyLabels: new label "${label}"`);
  }
  for (const label of baseLabels) {
    if (!measured.moneyLabels.values.includes(label)) drops.push(`moneyLabels: "${label}" removed`);
  }

  compareNumber('windowConfirm', base.windowConfirm ?? 0, measured.windowConfirm);
  compareNumber('handRolledDialogs', base.handRolledDialogs ?? 0, measured.handRolledDialogs);
  return { rises, drops, unrecorded };
}

/**
 * Build the next baseline document. Keeps `audited` and unconsumed allowedAdditions.
 * @param {any | null} existing parsed baseline.json, or null to seed one
 * @param {ReturnType<typeof auditClient>} measured
 */
export function buildBaseline(existing, measured) {
  const consumed = new Set(measured.sharedComponents.names.map((n) => basename(n)));
  const allowed = (
    existing?.allowedAdditions?.sharedComponents ?? INITIAL_ALLOWED_ADDITIONS
  ).filter((n) => !consumed.has(n));
  return {
    schemaVersion: 1,
    measured,
    allowedAdditions: { sharedComponents: allowed },
    audited: existing?.audited ?? structuredClone(INITIAL_AUDITED),
  };
}

// --- run ------------------------------------------------------------------------------

/**
 * @param {{ root?: string, mode?: 'check'|'write', clientDir?: string }} [opts]
 * @returns {Promise<{ name: string, errors: string[], notes: string[] }>}
 */
export async function run({ root = REPO_ROOT, mode = 'check', clientDir } = {}) {
  const name = 'pattern baseline';
  const clientSrc = clientDir ?? join(root, 'client/src');
  const baselinePath = join(root, 'plan/restructure/baseline.json');
  if (!existsSync(clientSrc)) return { name, errors: [`input missing: ${clientSrc}`], notes: [] };

  const measured = auditClient(clientSrc);
  const glossaryPath = join(clientSrc, 'i18n/glossary.json');
  const approved = existsSync(glossaryPath) ? glossaryLabels(readJson(glossaryPath)) : new Set();
  const existing = existsSync(baselinePath) ? readJson(baselinePath) : null;
  const errors = [];
  const notes = [];

  if (mode === 'check') {
    if (!existing) {
      return {
        name,
        errors: ['input missing: plan/restructure/baseline.json — run npm run plan:build'],
        notes,
      };
    }
    const { rises, drops, unrecorded } = compareBaseline(existing, measured, approved);
    errors.push(...rises);
    const behind = [...drops, ...unrecorded];
    if (behind.length > 0) {
      notes.push('baseline is behind: run npm run plan:build');
      behind.forEach((d) => notes.push(`  ${d}`));
    }
    return { name, errors, notes };
  }

  if (existing) {
    const { rises } = compareBaseline(existing, measured, approved);
    if (rises.length > 0) {
      return { name, errors: ['refusing to write while rises exist:', ...rises], notes };
    }
  }
  const next = buildBaseline(existing, measured);
  const res = writeOrCheck(baselinePath, await formatJson(baselinePath, next), 'write');
  notes.push(res.changed ? 'baseline.json written' : 'baseline.json unchanged');
  return { name, errors, notes };
}

async function main() {
  const args = process.argv.slice(2);
  let mode = 'check';
  let clientDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') mode = 'check';
    else if (args[i] === '--write') mode = 'write';
    else if (args[i] === '--client') clientDir = args[++i];
    else {
      console.error(
        `build-baseline: unknown argument ${args[i]} (use --check, --write, --client <dir>)`,
      );
      process.exit(2);
    }
  }
  try {
    const result = await run({ mode, clientDir });
    result.notes.forEach((n) => console.log(n));
    result.errors.forEach((e) => console.error(e));
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`build-baseline: ${err.message}`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) await main();
