import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * AC5 (#2205): the sidebar is the only place that lists views. No page renders a tab row, no
 * module keeps a copied tab array, and `ScheduleSubNav` / `budgetTabs` are gone. `SubNav` itself
 * stays as a component without consumers (it becomes ObjectTabs in Phase 4/5); until that story
 * deliberately relaxes rule 2, nothing outside `components/SubNav/` may import it.
 * OverflowMenu link entries (`kind: 'link'`, #2206) are menu actions, not views.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLIENT_SRC = path.join(REPO_ROOT, 'client/src');
const SUBNAV_DIR = 'client/src/components/SubNav/';

const rel = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join('/');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const hasProperty = (obj: ts.ObjectLiteralExpression, ...names: string[]): boolean =>
  obj.properties.some(
    (p) =>
      p.name !== undefined &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      names.includes(p.name.text),
  );

/** An OverflowMenu link entry: a `kind` property initialised with the string literal 'link'. */
function isMenuLinkEntry(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'kind' &&
      ts.isStringLiteral(p.initializer) &&
      p.initializer.text === 'link',
  );
}

/** The copied-tab-array shape: an array with >= 2 objects that each carry a target and a label. */
function isTabArray(node: ts.ArrayLiteralExpression): boolean {
  const tabs = node.elements.filter(
    (el): el is ts.ObjectLiteralExpression =>
      ts.isObjectLiteralExpression(el) &&
      !isMenuLinkEntry(el) &&
      hasProperty(el, 'to', 'href') &&
      hasProperty(el, 'labelKey', 'label'),
  );
  return tabs.length >= 2;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
}

/** Every violation of rules 1-4 in one source text. `file` is the repo-relative path. */
function findViolations(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const insideSubNav = file.startsWith(SUBNAV_DIR);
  const findings: Finding[] = [];
  const add = (node: ts.Node, rule: string) =>
    findings.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      rule,
    });

  const visit = (node: ts.Node) => {
    if (ts.isArrayLiteralExpression(node) && isTabArray(node)) add(node, 'copied tab array');
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (!insideSubNav && /(^|\/)SubNav(\/|$)/.test(spec)) add(node, `imports ${spec}`);
      if (/ScheduleSubNav|budgetTabs/.test(spec)) add(node, `imports ${spec}`);
    }
    if (ts.isIdentifier(node)) {
      if (!insideSubNav && node.text === 'SubNavTab') add(node, 'uses SubNavTab');
      if (node.text === 'ScheduleSubNav') add(node, 'uses ScheduleSubNav');
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'subNav') {
      add(node, 'passes a subNav prop');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

const describeFindings = (findings: readonly Finding[]) =>
  findings.map((f) => `${f.file}:${f.line} ${f.rule}`);

describe('no tab rows (AC5)', () => {
  const files = walk(CLIENT_SRC);

  it('scans the client sources', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('has no copied tab array, SubNav consumer, ScheduleSubNav or subNav prop in client sources', () => {
    const findings = files.flatMap((f) => findViolations(rel(f), fs.readFileSync(f, 'utf8')));
    expect(describeFindings(findings)).toEqual([]);
  });

  it('has deleted ScheduleSubNav and the shared budget tab list', () => {
    expect(fs.existsSync(path.join(CLIENT_SRC, 'components/ScheduleSubNav'))).toBe(false);
    expect(fs.existsSync(path.join(CLIENT_SRC, 'pages/shared/budgetTabs.ts'))).toBe(false);
    expect(fs.existsSync(path.join(CLIENT_SRC, 'pages/shared/budgetTabs.test.ts'))).toBe(false);
  });

  it('keeps SubNav itself in place for the ObjectTabs story', () => {
    expect(fs.existsSync(path.join(CLIENT_SRC, 'components/SubNav/SubNav.tsx'))).toBe(true);
  });
});

describe('the detector (self-test: each rule can fail)', () => {
  const run = (source: string, file = 'client/src/pages/XPage/XPage.tsx') =>
    describeFindings(findViolations(file, source));

  it('flags a copied tab array of two labelled targets', () => {
    const source = `const T: X[] = [{ labelKey: 'a', to: '/x' }, { labelKey: 'b', to: '/y' }];`;
    expect(run(source)).toEqual(['client/src/pages/XPage/XPage.tsx:1 copied tab array']);
  });

  it('flags the href and label spelling as well', () => {
    expect(run(`const T = [{ label: 'a', href: '/x' }, { 'label': 'b', 'href': '/y' }];`)).toEqual([
      'client/src/pages/XPage/XPage.tsx:1 copied tab array',
    ]);
  });

  it('does not flag a string tuple, a single tab or objects without both properties', () => {
    expect(run(`const MANAGE_TABS = ['areas', 'trades'] as const;`)).toEqual([]);
    expect(run(`const one = [{ label: 'a', href: '/x' }];`)).toEqual([]);
    expect(
      run(`const rows = [{ label: 'a' }, { label: 'b' }, { href: '/x' }, { href: '/y' }];`),
    ).toEqual([]);
    expect(run(`const x = [{ ...spread }, 5];`)).toEqual([]);
  });

  it('does not flag OverflowMenu link entries (kind: link) but still flags other kinds', () => {
    const link = (label: string, href: string) =>
      `{ kind: 'link', label: '${label}', href: '${href}' }`;
    const tab = (label: string, href: string) =>
      `{ kind: 'tab', label: '${label}', href: '${href}' }`;
    const flagged = ['client/src/pages/XPage/XPage.tsx:1 copied tab array'];
    expect(run(`const m = [${link('a', '/x')}, ${link('b', '/y')}];`)).toEqual([]);
    expect(
      run(`const m = [{ 'kind': 'link', label: 'a', href: '/x' }, ${link('b', '/y')}];`),
    ).toEqual([]);
    expect(run(`const m = [${tab('a', '/x')}, ${tab('b', '/y')}];`)).toEqual(flagged);
    expect(run(`const m = [${link('a', '/x')}, ${tab('b', '/y')}, ${tab('c', '/z')}];`)).toEqual(
      flagged,
    );
    expect(
      run(`const m = [{ kind: k, label: 'a', href: '/x' }, { kind: k, label: 'b', href: '/y' }];`),
    ).toEqual(flagged);
  });

  it('flags an import of SubNav from outside its folder, but not from inside it', () => {
    const source = `import { SubNav } from '../../components/SubNav/SubNav.js';`;
    expect(run(source)).toEqual([
      'client/src/pages/XPage/XPage.tsx:1 imports ../../components/SubNav/SubNav.js',
    ]);
    expect(
      run(`import { SubNav } from '../SubNav/SubNav.js';`, 'client/src/components/Y/Y.tsx'),
    ).toHaveLength(1);
    expect(run(source, 'client/src/components/SubNav/Other.tsx')).toEqual([]);
  });

  it('does not mistake a module merely named like SubNav for the component', () => {
    expect(run(`import { x } from './MySubNav.js';`)).toEqual([]);
  });

  it('flags the SubNavTab type outside the SubNav folder only', () => {
    const source = `import type { Foo } from './foo.js';\nlet t: SubNavTab[] = [];`;
    expect(run(source)).toEqual(['client/src/pages/XPage/XPage.tsx:2 uses SubNavTab']);
    expect(run(source, 'client/src/components/SubNav/SubNav.tsx')).toEqual([]);
  });

  it('flags ScheduleSubNav and budgetTabs wherever they appear', () => {
    expect(run(`import { ScheduleSubNav } from './x.js';`)).toEqual([
      'client/src/pages/XPage/XPage.tsx:1 uses ScheduleSubNav',
    ]);
    expect(run(`import { BUDGET_TABS } from '../shared/budgetTabs.js';`)).toEqual([
      'client/src/pages/XPage/XPage.tsx:1 imports ../shared/budgetTabs.js',
    ]);
  });

  it('flags a subNav JSX attribute anywhere', () => {
    const source = `const a = <PageLayout title="x" subNav={<div />} />;`;
    expect(run(source)).toEqual(['client/src/pages/XPage/XPage.tsx:1 passes a subNav prop']);
    expect(run(source, 'client/src/components/SubNav/Y.tsx')).toHaveLength(1);
  });

  it('reports the line of each violation', () => {
    const source = `\n\nconst a = <PageLayout subNav={null} />;`;
    expect(run(source)).toEqual(['client/src/pages/XPage/XPage.tsx:3 passes a subNav prop']);
  });
});
