import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ROUTE_MAP } from '@cornerstone/shared';

/**
 * AC1/AC4 (#2201): the route map is the only source of app route paths. No string literal that
 * looks like an app URL may appear in client sources, the server's URL writers, or the E2E page
 * objects/fixtures. Build URLs with `routeUrl()` / `routePattern()` instead.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** First segments of every route-map `from` (except `*` and `/`), computed from the map. */
const PREFIXES: readonly string[] = [
  ...new Set(
    ROUTE_MAP.flatMap((e) => {
      const first = e.from.split(/[/?# ]/).filter((s) => s.length > 0)[0];
      return first === undefined || first === '*' ? [] : [first];
    }),
  ),
];
const APP_PATH_RE = new RegExp(`^/(${PREFIXES.join('|')})(?:[/?#]|$)`);

function walkFiles(dir: string, accept: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist' ? [] : walkFiles(full, accept);
    }
    return accept(full) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join('/');
const isSource = (f: string) =>
  /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts');

function clientFiles(): string[] {
  const root = path.join(REPO_ROOT, 'client/src');
  return walkFiles(root, (f) => {
    const r = rel(f);
    if (!isSource(f)) return false;
    if (r.startsWith('client/src/i18n/')) return false;
    if (/^client\/src\/lib\/[A-Za-z]+Api\.ts$/.test(r)) return false;
    return r !== 'client/src/lib/apiClient.ts' && r !== 'client/src/lib/budgetApiFactory.ts';
  });
}

/** Every non-test server source file (route registrations are exempt, see isExemptArgument). */
function serverFiles(): string[] {
  return walkFiles(path.join(REPO_ROOT, 'server/src'), isSource);
}

/** The server files that write app URLs into vCards, iCal feeds and OIDC redirects. */
const SERVER_URL_WRITERS = [
  'server/src/services/vendorVcard.ts',
  'server/src/services/calendarIcal.ts',
  'server/src/routes/oidc.ts',
  'server/src/services/oidcService.ts',
].map((f) => path.join(REPO_ROOT, f));

function e2eFiles(): string[] {
  const pages = walkFiles(path.join(REPO_ROOT, 'e2e/pages'), isSource);
  return [...pages, path.join(REPO_ROOT, 'e2e/fixtures/testData.ts')].filter((f) =>
    fs.existsSync(f),
  );
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

const FASTIFY_REGISTRARS = new Set(['get', 'post', 'put', 'patch', 'delete', 'route']);

/**
 * Call arguments that are API or server-route paths, not app routes:
 * - the first argument of a function imported from an `apiClient` module,
 * - the first argument of `fastify.get|post|put|patch|delete|route(`.
 */
function isExemptArgument(node: ts.Node, apiClientNames: ReadonlySet<string>): boolean {
  const call = node.parent;
  if (!ts.isCallExpression(call) || call.arguments[0] !== node) return false;
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return apiClientNames.has(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'fastify' &&
    FASTIFY_REGISTRARS.has(callee.name.text)
  );
}

function apiClientImports(sf: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!/apiClient(\.js)?$/.test(stmt.moduleSpecifier.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.add(el.name.text);
    }
  }
  return names;
}

function scanSource(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const apiNames = apiClientImports(sf);
  const findings: Finding[] = [];

  function visit(node: ts.Node) {
    let text: string | undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node)) text = node.text;
    const inModuleSpec =
      node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent));
    if (text !== undefined && !inModuleSpec && APP_PATH_RE.test(text)) {
      const anchor = ts.isTemplateHead(node) ? node.parent : node;
      if (!isExemptArgument(anchor, apiNames)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        findings.push({ file: rel(file), line, snippet: node.getText().slice(0, 80) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return findings;
}

/** Narrow allow-list for API paths assembled in a variable before the call. */
const ALLOW_LIST: readonly { file: string; snippet: string; reason: string }[] = [];

function scanFiles(files: readonly string[]): Finding[] {
  return files.flatMap((f) => scanSource(f, fs.readFileSync(f, 'utf8')));
}

const format = (findings: readonly Finding[]) =>
  findings.map((f) => `${f.file}:${f.line}  ${f.snippet}`);

function unallowed(findings: readonly Finding[]): Finding[] {
  return findings.filter(
    (f) => !ALLOW_LIST.some((a) => a.file === f.file && f.snippet.includes(a.snippet)),
  );
}

describe('scanSource (the guard itself)', () => {
  const scan = (src: string) => scanSource('x.tsx', src).map((f) => f.snippet);

  it('computes its prefixes from the route map, including legacy ones', () => {
    for (const prefix of ['project', 'budget', 'settings', 'work-items', 'companies', 'login']) {
      expect(PREFIXES).toContain(prefix);
    }
    expect(PREFIXES).not.toContain('*');
  });

  it('flags string, no-substitution template and template-head literals', () => {
    expect(scan("const a = '/project/work-items';")).toHaveLength(1);
    expect(scan('const a = `/budget/invoices`;')).toHaveLength(1);
    expect(scan('const a = `/settings/vendors/${id}`;')).toHaveLength(1);
    expect(scan("const a = '/login?error=x';")).toHaveLength(1);
    expect(scan("const a = '/diary#top';")).toHaveLength(1);
    expect(scan("const a = '/project';")).toHaveLength(1);
  });

  it('leaves non-app strings alone', () => {
    expect(scan("const a = '/api/work-items';")).toHaveLength(0);
    expect(scan("const a = '/projects';")).toHaveLength(0);
    expect(scan("const a = 'project/x';")).toHaveLength(0);
    expect(scan("const a = '/';")).toHaveLength(0);
  });

  it('exempts the first argument of functions imported from apiClient', () => {
    expect(scan("import { get } from './apiClient.js';\nget('/work-items');")).toHaveLength(0);
    expect(
      scan("import { post as send } from '../lib/apiClient';\nsend(`/invoices/${1}`);"),
    ).toHaveLength(0);
  });

  it('does not exempt other arguments or other callees', () => {
    expect(scan("import { get } from './apiClient.js';\nget('/x', '/work-items');")).toHaveLength(
      1,
    );
    expect(scan("other('/work-items');")).toHaveLength(1);
    expect(scan("navigate('/project/work-items');")).toHaveLength(1);
  });

  it('exempts fastify route registrations', () => {
    expect(scan("fastify.get('/budget/x', async () => 1);")).toHaveLength(0);
    expect(scan("fastify.route('/budget/x');")).toHaveLength(0);
    expect(scan("app.get('/budget/x');")).toHaveLength(1);
  });

  it('ignores import and export specifiers', () => {
    expect(scan("import x from '/project/x.js';\nexport * from '/budget/y.js';")).toHaveLength(0);
  });

  it('reports file, line and snippet', () => {
    const [finding] = scanSource('client/src/x.tsx', "\n\nconst a = '/project/x';");
    expect(finding).toMatchObject({ line: 3, snippet: "'/project/x'" });
  });
});

describe('no string-literal app paths (AC1)', () => {
  it('finds the source files it is meant to scan', () => {
    expect(clientFiles().length).toBeGreaterThan(300);
    expect(clientFiles()).toContain(path.join(REPO_ROOT, 'client/src/App.tsx'));
    expect(clientFiles().some((f) => rel(f).startsWith('client/src/i18n/'))).toBe(false);
  });

  it('has no app-path literals in client/src', () => {
    expect(format(unallowed(scanFiles(clientFiles())))).toEqual([]);
  });

  it('has no app-path literals in server/src (outside route registrations)', () => {
    expect(serverFiles().length).toBeGreaterThan(50);
    for (const writer of SERVER_URL_WRITERS) expect(serverFiles()).toContain(writer);
    expect(format(unallowed(scanFiles(serverFiles())))).toEqual([]);
  });

  it('has no app-path literals in the E2E page objects and test-data fixtures', () => {
    expect(e2eFiles().length).toBeGreaterThan(5);
    expect(format(unallowed(scanFiles(e2eFiles())))).toEqual([]);
  });

  it('has no stale allow-list entries', () => {
    const all = scanFiles([...clientFiles(), ...serverFiles(), ...e2eFiles()]);
    const stale = ALLOW_LIST.filter(
      (a) => !all.some((f) => f.file === a.file && f.snippet.includes(a.snippet)),
    );
    expect(stale).toEqual([]);
  });
});

describe('E2E page objects use the route map (AC4)', () => {
  const ROUTES_BARREL = /from\s+['"][^'"]*shared\/src\/routes\/index\.js['"]/;
  const ROUTES_FIXTURE =
    /import\s*\{[^}]*\bROUTES\b[^}]*\}\s*from\s+['"][^'"]*fixtures\/testData\.js['"]/;
  const navigates = (source: string) =>
    source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .some((line) => /\bgoto\(/.test(line));

  it('rebuilds the ROUTES fixture from the shared route map', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'e2e/fixtures/testData.ts'), 'utf8');
    expect(source).toMatch(ROUTES_BARREL);
  });

  it('gets its URLs from the route map in every page object that navigates', () => {
    const pages = walkFiles(path.join(REPO_ROOT, 'e2e/pages'), isSource);
    const navigating = pages.filter((f) => navigates(fs.readFileSync(f, 'utf8')));
    expect(navigating.length).toBeGreaterThan(5);
    const missing = navigating
      .filter((f) => {
        const source = fs.readFileSync(f, 'utf8');
        return !ROUTES_BARREL.test(source) && !ROUTES_FIXTURE.test(source);
      })
      .map(rel);
    expect(missing).toEqual([]);
  });
});
