#!/usr/bin/env node
// build-routes.mjs -- extracts the routes the React router serves from client/src/App.tsx and
// checks them against the curated route map (plan/restructure/routemap.json).
//
// Generates plan/restructure/router-routes.json (never hand-edit it).
// Usage: node plan/restructure/scripts/build-routes.mjs [--check|--write]
// Exit 0 = ok, 1 = drift or validation errors, 2 = usage or IO error.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
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
const STAGES = ['done', 'interim', 'planned'];
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

/**
 * Read a string attribute: a literal, or `routePattern('<id>')` resolved through the route module.
 * @param {ts.JsxAttribute | undefined} attribute
 * @param {{ routeModule?: any, onError?: (node: ts.Node, message: string) => void }} [ctx]
 */
function stringValue(attribute, ctx = {}) {
  const init = attribute?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (
      ts.isCallExpression(e) &&
      ts.isIdentifier(e.expression) &&
      e.expression.text === 'routePattern' &&
      e.arguments.length === 1 &&
      ts.isStringLiteral(e.arguments[0]) &&
      ctx.routeModule
    ) {
      const id = e.arguments[0].text;
      try {
        return ctx.routeModule.routePattern(id);
      } catch {
        ctx.onError?.(e, `unknown route id '${id}'`);
        return undefined;
      }
    }
  }
  return undefined;
}

/** Reads `allow={['admin']}`-style array literals of strings; undefined when unreadable. */
function stringArrayValue(attribute) {
  const init = attribute?.initializer;
  const e = init && ts.isJsxExpression(init) ? init.expression : undefined;
  if (!e || !ts.isArrayLiteralExpression(e)) return undefined;
  if (!e.elements.every((el) => ts.isStringLiteral(el))) return undefined;
  return e.elements.map((el) => el.text);
}

function isJsx(node) {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
}

/** Child <Route> elements and `{LIVE_REDIRECT_ROUTES.map(...)}` generator expressions, in order. */
function childRoutes(node) {
  if (!ts.isJsxElement(node)) return [];
  return node.children.filter((c) => (isJsx(c) && tagNameOf(c) === 'Route') || isRouteGenerator(c));
}

function isRouteGenerator(node) {
  if (!ts.isJsxExpression(node) || !node.expression) return false;
  const call = node.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'map' &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'LIVE_REDIRECT_ROUTES'
  );
}

/** The <Route> a generator callback renders, or null when it is not a RouteRedirect route. */
function generatorRoute(node) {
  const callback = node.expression.arguments[0];
  if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
    return null;
  }
  let body = callback.body;
  if (ts.isBlock(body)) {
    const ret = body.statements.find(ts.isReturnStatement);
    body = ret?.expression;
  }
  while (body && ts.isParenthesizedExpression(body)) body = body.expression;
  if (!body || !isJsx(body) || tagNameOf(body) !== 'Route') return null;
  const el = attr(body, 'element');
  let inner =
    el?.initializer && ts.isJsxExpression(el.initializer) ? el.initializer.expression : null;
  while (inner && ts.isParenthesizedExpression(inner)) inner = inner.expression;
  return inner && isJsx(inner) && tagNameOf(inner) === 'RouteRedirect' ? body : null;
}

/** @returns {{ kind: 'page', element: string } | { kind: 'redirect', target: string } | null} */
function analyseElement(routeNode, parentPath, onError, ctx) {
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
      const to = stringValue(attr(node, 'to'), ctx);
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
 * `routeModule` (optional) is the loaded shared route module; it resolves `routePattern('<id>')`
 * paths and `LIVE_REDIRECT_ROUTES.map(...)` generators.
 * @param {string} tsxSource
 * @param {any} [routeModule]
 * @returns {{ routes: { path: string, kind: 'page'|'redirect', guard: 'public'|'member'|'admin', gated?: true, element?: string, target?: string }[], errors: string[] }}
 */
export function extractRouterRoutesChecked(tsxSource, routeModule) {
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
  const ctx = { routeModule, onError };

  function expandGenerator(node, guard, gated) {
    if (!routeModule?.LIVE_REDIRECT_ROUTES) {
      onError(node, 'unrecognised route generator (route module not loaded)');
      return;
    }
    if (!generatorRoute(node)) {
      onError(node, 'unrecognised route generator');
      return;
    }
    for (const r of routeModule.LIVE_REDIRECT_ROUTES) {
      out.push({
        path: r.path,
        guard,
        ...(gated ? { gated: true } : {}),
        kind: 'redirect',
        target: r.target,
      });
    }
  }

  function visitChildren(node, full, guard, gated) {
    for (const child of childRoutes(node)) {
      if (isRouteGenerator(child)) expandGenerator(child, guard, gated);
      else visit(child, full, guard, gated);
    }
  }

  function visit(node, parentPath, guard, gated) {
    const pathAttr = attr(node, 'path');
    const errorsBefore = errors.length;
    const path = stringValue(pathAttr, ctx);
    if (pathAttr && path === undefined && errors.length === errorsBefore) {
      onError(node, 'unreadable route path');
    }
    const isIndex = Boolean(attr(node, 'index'));
    let full = parentPath;
    if (path !== undefined) {
      full = path.startsWith('/') ? path : joinPaths(parentPath === '/' ? '' : parentPath, path);
      if (path === '*' && parentPath === '/') full = '*';
    }
    let nextGuard = guard;
    let nextGated = gated;
    const el = attr(node, 'element');
    if (path === undefined && !isIndex && el) {
      const expr = el.initializer?.expression;
      if (expr && isJsx(expr)) {
        const tag = tagNameOf(expr);
        if (tag === 'AuthGuard') nextGuard = 'member';
        else if (tag === 'RoleGuard') {
          const allow = stringArrayValue(attr(expr, 'allow'));
          if (!allow) onError(expr, 'RoleGuard allow must be an array literal of strings');
          else if (!allow.includes('member')) nextGuard = 'admin';
        } else if (tag === 'RouteGate') nextGated = true;
      }
    }
    if (path !== undefined || isIndex) {
      const analysed = analyseElement(node, full === '*' ? '/' : full, onError, ctx);
      if (analysed) {
        const route = { path: full, guard: nextGuard, ...(nextGated ? { gated: true } : {}) };
        out.push({ ...route, ...analysed });
      }
    }
    visitChildren(node, full, nextGuard, nextGated);
  }

  function findRoots(node) {
    if (isJsx(node) && tagNameOf(node) === 'Routes') {
      visitChildren(node, '/', 'public', false);
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

/** Fields that routemap.json and the shared route map must agree on. */
export const AGREEMENT_FIELDS = [
  'to',
  'kind',
  'change',
  'section',
  'guard',
  'gate',
  'permanent',
  'carries',
];

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * Staged checks against the shared route map (shared/src/routes): agreement with routemap.json,
 * served/planned entries, guards and gates.
 * @returns {string[]}
 */
function validateAgainstModule(routemap, routerRoutes, routeModule) {
  const errors = [];
  const shared = routeModule.ROUTE_MAP;
  if (!Array.isArray(shared)) return ['shared route map: ROUTE_MAP must be an array'];

  // 1. Agreement with routemap.json (same from set and order, same field values).
  const jsonFroms = routemap.map((e) => e?.from);
  const sharedFroms = shared.map((e) => e.from);
  for (const from of sharedFroms) {
    if (!jsonFroms.includes(from))
      errors.push(`route map drift: ${from} is missing in routemap.json`);
  }
  for (const from of jsonFroms) {
    if (!sharedFroms.includes(from))
      errors.push(`route map drift: ${from} is missing in the shared route map`);
  }
  if (
    errors.length === 0 &&
    (jsonFroms.length !== sharedFroms.length || jsonFroms.some((f, i) => f !== sharedFroms[i]))
  ) {
    errors.push(
      'route map drift: the shared route map and routemap.json list entries in a different order',
    );
  }
  for (const entry of shared) {
    const curated = routemap.find((e) => e?.from === entry.from);
    if (!curated) continue;
    for (const field of AGREEMENT_FIELDS) {
      if (!isDeepStrictEqual(entry[field], curated[field])) {
        errors.push(
          `route map drift: ${entry.from} ${field} differs (shared: ${show(entry[field])}, routemap.json: ${show(curated[field])})`,
        );
      }
    }
  }

  // Structural sanity of the shared map itself.
  const ids = new Set();
  for (const entry of shared) {
    if (!STAGES.includes(entry.stage))
      errors.push(`shared route ${entry.from}: stage must be one of ${STAGES.join(', ')}`);
    if (entry.interim !== undefined && entry.stage !== 'interim') {
      errors.push(`shared route ${entry.from}: interim is only valid on interim entries`);
    }
    if (entry.stage === 'interim' && entry.interim === undefined) {
      errors.push(`shared route ${entry.from}: interim entries need an interim form`);
    }
    if (entry.id !== undefined) {
      if (ids.has(entry.id)) errors.push(`shared route id ${entry.id} is duplicated`);
      ids.add(entry.id);
    }
  }
  for (const entry of shared) {
    if (entry.parent !== undefined && !ids.has(entry.parent)) {
      errors.push(`shared route ${entry.from}: parent '${entry.parent}' is not a route id`);
    }
    for (const id of entry.match?.appliesTo ?? []) {
      if (!ids.has(id))
        errors.push(`shared route ${entry.from}: appliesTo '${id}' is not a route id`);
    }
  }

  const byFrom = new Map(routerRoutes.map((r) => [r.path, r]));
  const sharedById = new Map(shared.filter((e) => e.id).map((e) => [e.id, e]));

  // 2./3. Served entries must be served as their effective form; planned entries must not be.
  for (const entry of shared) {
    if (entry.match) continue;
    const route = byFrom.get(entry.from);
    if (entry.stage === 'planned') {
      if (route) errors.push(`planned route ${entry.from} is served by the router`);
      continue;
    }
    const target = routeModule.effectiveTarget(entry);
    if (!route) {
      errors.push(`route-map entry ${entry.from} is not served by the router`);
    } else if (target === null) {
      if (route.kind !== 'page') {
        errors.push(
          `route ${entry.from} must be served as a page, the router redirects it to ${route.target}`,
        );
      }
    } else if (route.kind !== 'redirect' || route.target !== target) {
      errors.push(
        `route ${entry.from} must redirect to ${target}, the router serves ${route.kind === 'redirect' ? `a redirect to ${route.target}` : 'a page'}`,
      );
    }
  }

  // 5. Guards of router pages.
  for (const route of routerRoutes) {
    if (route.kind !== 'page') continue;
    const entry = shared.find((e) => e.from === route.path && !e.match);
    if (entry && entry.guard !== route.guard) {
      errors.push(
        `route ${route.path} guard differs (router: ${route.guard}, route map: ${entry.guard})`,
      );
    }
  }

  // 6. Gates and role guards of live conditional entries.
  for (const entry of shared) {
    if (entry.stage !== 'done' || !entry.match?.condition) continue;
    const admin = entry.match.condition === 'not-admin';
    for (const id of entry.match.appliesTo ?? []) {
      const page = sharedById.get(id);
      const route = page ? byFrom.get(page.from) : undefined;
      if (!page || !route || route.kind !== 'page') continue;
      if (admin && route.guard !== 'admin') {
        errors.push(
          `route ${page.from} is admin-only in the route map but the router does not guard it`,
        );
      }
      if (!admin && !route.gated) {
        errors.push(
          `route ${page.from} has a live ${entry.match.condition} rule but is not wrapped in RouteGate`,
        );
      }
    }
  }
  return errors;
}

/**
 * @param {any[]} routemap curated route-map entries
 * @param {{ path: string }[]} routerRoutes output of extractRouterRoutes
 * @param {any} [routeModule] loaded shared route module; enables the stage-aware checks
 * @returns {string[]} error messages (empty when valid)
 */
export function validateRouteMap(routemap, routerRoutes, routeModule) {
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
  if (routeModule) {
    errors.push(...validateAgainstModule(routemap, routerRoutes, routeModule));
    return errors;
  }
  for (const entry of routemap) {
    if (!nonEmpty(entry?.from) || NOT_ROUTER_SERVED.has(entry.change)) continue;
    const unserved = baseFroms(entry.from).filter((b) => !routerPaths.has(b));
    if (unserved.length > 0)
      errors.push(`route-map entry ${entry.from} is not served by the router`);
  }
  return errors;
}

// --- shared route module ------------------------------------------------------------

/**
 * Load shared/src/routes as source (no build): transpile every non-test .ts file into a temp
 * dir and import its index. The folder must be self-contained (only './' imports).
 * @param {string} root repository root
 * @returns {Promise<any>} the route module (ROUTE_MAP, routePattern, LIVE_REDIRECT_ROUTES, ...)
 */
export async function loadRouteModule(root) {
  const srcDir = join(root, 'shared/src/routes');
  if (!existsSync(srcDir)) throw new Error(`route module missing: ${srcDir}`);
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !/\.(test|d)\.ts$/.test(f));
  const tmp = mkdtempSync(join(tmpdir(), 'cs-routes-'));
  try {
    for (const file of files) {
      const { outputText } = ts.transpileModule(readFileSync(join(srcDir, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      const sf = ts.createSourceFile(file, outputText, ts.ScriptTarget.ES2022, true);
      for (const stmt of sf.statements) {
        const spec =
          (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier
            ? stmt.moduleSpecifier.text
            : undefined;
        if (spec !== undefined && !spec.startsWith('./')) {
          throw new Error(
            `shared/src/routes/${file} imports '${spec}' — the route map must be self-contained`,
          );
        }
      }
      writeFileSync(join(tmp, file.replace(/\.ts$/, '.js')), outputText);
    }
    if (!existsSync(join(tmp, 'index.js')))
      throw new Error('shared/src/routes/index.ts is missing');
    return await import(pathToFileURL(join(tmp, 'index.js')).href);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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
  let routeModule;
  try {
    routeModule = await loadRouteModule(root);
  } catch (err) {
    errors.push(err.message);
  }
  const extracted = extractRouterRoutesChecked(readFileSync(appPath, 'utf8'), routeModule);
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
    errors.push(...validateRouteMap(readJson(mapPath), routes, routeModule));
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
