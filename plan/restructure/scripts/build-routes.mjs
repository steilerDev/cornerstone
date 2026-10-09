#!/usr/bin/env node
// build-routes.mjs -- extracts the routes the React router serves from client/src/App.tsx and
// checks them against the curated route map (plan/restructure/routemap.json).
//
// Generates plan/restructure/router-routes.json (never hand-edit it).
// Usage: node plan/restructure/scripts/build-routes.mjs [--check|--write]
// Exit 0 = ok, 1 = drift or validation errors, 2 = usage or IO error.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT, formatJson, isMain, readJson, writeOrCheck } from './lib/io.mjs';

export const CHANGE_VALUES = [
  'kept',
  'new',
  'moved',
  'merged',
  'retired',
  'redirect',
  'retargeted',
  'repair',
  'query-map',
  'conditional',
  'redirect-becomes-page',
];
const NOT_ROUTER_SERVED = new Set(['new', 'repair', 'query-map', 'conditional']);
const KINDS = ['page', 'redirect'];
const GUARDS = ['public', 'member', 'admin'];
const GATES = ['none', 'paperless', 'paperless+ai'];
const WRAPPERS = new Set(['Suspense', 'React.Suspense', 'ErrorBoundary', 'Fragment']);

// --- router extraction ---------------------------------------------------------

function tagNameOf(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText();
}

function attrsOf(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes.properties.filter(ts.isJsxAttribute);
}

function attr(node, name) {
  return attrsOf(node).find((a) => a.name.getText() === name);
}

function stringValue(attribute) {
  const init = attribute?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return undefined;
}

function isJsx(node) {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
}

function childRoutes(node) {
  if (!ts.isJsxElement(node)) return [];
  return node.children.filter((c) => isJsx(c) && tagNameOf(c) === 'Route');
}

/** @returns {{ kind: 'page', element: string } | { kind: 'redirect', target: string } | null} */
function analyseElement(routeNode, parentPath, onError) {
  const a = attr(routeNode, 'element');
  if (!a?.initializer || !ts.isJsxExpression(a.initializer) || !a.initializer.expression) {
    return null;
  }
  let el = a.initializer.expression;
  while (ts.isParenthesizedExpression(el)) el = el.expression;
  const find = (node) => {
    if (ts.isJsxFragment(node)) {
      return node.children.filter(isJsx).map(find).find(Boolean) ?? null;
    }
    if (!isJsx(node)) return null;
    const tag = tagNameOf(node);
    if (WRAPPERS.has(tag)) {
      const inner = ts.isJsxElement(node) ? node.children.filter(isJsx) : [];
      return inner.map(find).find(Boolean) ?? null;
    }
    if (tag === 'Navigate' || tag === 'ParamRedirect') {
      const to = stringValue(attr(node, 'to'));
      if (to === undefined) {
        onError(node, 'unreadable redirect target');
        return null;
      }
      return { kind: 'redirect', target: to.startsWith('/') ? to : joinPaths(parentPath, to) };
    }
    if (/^[A-Z]/.test(tag)) return { kind: 'page', element: tag };
    return null;
  };
  return find(el);
}

function joinPaths(parent, child) {
  const joined = `${parent}/${child}`.replace(/\/+/g, '/');
  const trimmed = joined.length > 1 ? joined.replace(/\/$/, '') : joined;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Extract every route the router serves from the TSX source of the app component.
 * @param {string} tsxSource
 * @returns {{ path: string, kind: 'page'|'redirect', guard: 'public'|'member', element?: string, target?: string }[]}
 */
export function extractRouterRoutesChecked(tsxSource) {
  const sf = ts.createSourceFile(
    'App.tsx',
    tsxSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out = [];
  const errors = [];
  const onError = (node, message) =>
    errors.push(
      `App.tsx:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${message}`,
    );

  function visit(node, parentPath, guard) {
    const pathAttr = attr(node, 'path');
    const path = stringValue(pathAttr);
    if (pathAttr && path === undefined) onError(node, 'unreadable route path');
    const isIndex = Boolean(attr(node, 'index'));
    let full = parentPath;
    if (path !== undefined) {
      full = path.startsWith('/') ? path : joinPaths(parentPath === '/' ? '' : parentPath, path);
      if (path === '*' && parentPath === '/') full = '*';
    }
    let nextGuard = guard;
    const el = attr(node, 'element');
    if (path === undefined && !isIndex && el) {
      const expr = el.initializer?.expression;
      if (expr && isJsx(expr) && tagNameOf(expr) === 'AuthGuard') nextGuard = 'member';
    }
    if (path !== undefined || isIndex) {
      const analysed = analyseElement(node, full === '*' ? '/' : full, onError);
      if (analysed) {
        const route = { path: full, guard: nextGuard };
        out.push({ ...route, ...analysed });
      }
    }
    for (const child of childRoutes(node)) visit(child, full, nextGuard);
  }

  function findRoots(node) {
    if (isJsx(node) && tagNameOf(node) === 'Routes') {
      if (ts.isJsxElement(node)) {
        for (const child of node.children.filter((c) => isJsx(c) && tagNameOf(c) === 'Route')) {
          visit(child, '/', 'public');
        }
      }
      return;
    }
    ts.forEachChild(node, findRoots);
  }
  findRoots(sf);

  out.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  return { routes: out, errors };
}

/**
 * Extract every route the router serves from the TSX source of the app component.
 * Routes whose path or redirect target is not a string literal are not dropped silently:
 * use extractRouterRoutesChecked to receive them as errors.
 * @param {string} tsxSource
 */
export function extractRouterRoutes(tsxSource) {
  return extractRouterRoutesChecked(tsxSource).routes;
}

// --- route-map validation -------------------------------------------------------

/**
 * Split a route-map `from` into the plain base paths it covers.
 * "/a?x=1", "/b (member)", "/c, /d (admin)" -> ["/a", "/b", "/c", "/d"]
 * @param {string} from
 * @returns {string[]}
 */
export function baseFroms(from) {
  return String(from)
    .split(', ')
    .map((part) =>
      part
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/[?#].*$/, '')
        .trim(),
    )
    .filter(Boolean);
}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * @param {any[]} routemap curated route-map entries
 * @param {{ path: string }[]} routerRoutes output of extractRouterRoutes
 * @returns {string[]} error messages (empty when valid)
 */
export function validateRouteMap(routemap, routerRoutes) {
  const errors = [];
  if (!Array.isArray(routemap)) return ['routemap.json must be an array of entries'];

  const seen = new Set();
  routemap.forEach((entry, i) => {
    const label = entry?.from ?? `#${i}`;
    if (!nonEmpty(entry?.from)) errors.push(`route-map entry #${i} has no "from"`);
    else if (seen.has(entry.from)) errors.push(`route-map entry ${entry.from} is duplicated`);
    else seen.add(entry.from);
    if (!KINDS.includes(entry?.kind))
      errors.push(`route-map entry ${label}: kind must be one of ${KINDS.join(', ')}`);
    if (!CHANGE_VALUES.includes(entry?.change)) {
      errors.push(`route-map entry ${label}: change must be one of ${CHANGE_VALUES.join(', ')}`);
    }
    if (!GUARDS.includes(entry?.guard))
      errors.push(`route-map entry ${label}: guard must be one of ${GUARDS.join(', ')}`);
    if (!GATES.includes(entry?.gate))
      errors.push(`route-map entry ${label}: gate must be one of ${GATES.join(', ')}`);
    if (typeof entry?.permanent !== 'boolean')
      errors.push(`route-map entry ${label}: permanent must be a boolean`);
    if (!Array.isArray(entry?.carries) || entry.carries.some((c) => typeof c !== 'string')) {
      errors.push(`route-map entry ${label}: carries must be an array of strings`);
    }
    if (!nonEmpty(entry?.section))
      errors.push(`route-map entry ${label}: section must not be empty`);
    if (!nonEmpty(entry?.to)) errors.push(`route-map entry ${label}: to must not be empty`);
    if (!nonEmpty(entry?.note)) errors.push(`route-map entry ${label}: note must not be empty`);
  });

  const mapBases = new Set();
  for (const entry of routemap) {
    if (nonEmpty(entry?.from)) for (const b of baseFroms(entry.from)) mapBases.add(b);
  }
  const routerPaths = new Set(routerRoutes.map((r) => r.path));

  for (const path of [...routerPaths].sort()) {
    if (!mapBases.has(path)) {
      errors.push(
        `router route ${path} has no route-map entry — add it to plan/restructure/routemap.json`,
      );
    }
  }
  for (const entry of routemap) {
    if (!nonEmpty(entry?.from) || NOT_ROUTER_SERVED.has(entry.change)) continue;
    const unserved = baseFroms(entry.from).filter((b) => !routerPaths.has(b));
    if (unserved.length > 0)
      errors.push(`route-map entry ${entry.from} is not served by the router`);
  }
  return errors;
}

// --- run ---------------------------------------------------------------------------

/**
 * @param {{ root?: string, mode?: 'check'|'write' }} [opts]
 * @returns {Promise<{ name: string, errors: string[], notes: string[] }>}
 */
export async function run({ root = REPO_ROOT, mode = 'check' } = {}) {
  const name = 'route map';
  const appPath = join(root, 'client/src/App.tsx');
  const mapPath = join(root, 'plan/restructure/routemap.json');
  const outPath = join(root, 'plan/restructure/router-routes.json');
  const errors = [];
  const notes = [];

  if (!existsSync(appPath)) return { name, errors: [`input missing: ${appPath}`], notes };
  const extracted = extractRouterRoutesChecked(readFileSync(appPath, 'utf8'));
  const routes = extracted.routes;
  errors.push(...extracted.errors);
  notes.push(`${routes.length} router routes extracted from client/src/App.tsx`);

  const content = await formatJson(outPath, { routes });
  const res = writeOrCheck(outPath, content, mode);
  if (!res.ok) errors.push('router-routes.json is stale — run npm run plan:build');
  else if (mode === 'write' && res.changed) notes.push('router-routes.json written');

  if (!existsSync(mapPath)) {
    errors.push('input missing: plan/restructure/routemap.json (curated route map)');
  } else {
    errors.push(...validateRouteMap(readJson(mapPath), routes));
  }
  return { name, errors, notes };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--check' && a !== '--write');
  if (unknown.length > 0) {
    console.error(`build-routes: unknown argument ${unknown[0]} (use --check or --write)`);
    process.exit(2);
  }
  try {
    const result = await run({ mode: args.includes('--write') ? 'write' : 'check' });
    result.notes.forEach((n) => console.log(n));
    result.errors.forEach((e) => console.error(e));
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`build-routes: ${err.message}`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) await main();
