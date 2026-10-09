import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  analyzeFile,
  auditClient,
  buildBaseline,
  compareBaseline,
  isPrimaryClass,
  normalizeLabel,
  parseCss,
  resolveImport,
  run,
} from './build-baseline.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'build-baseline.mjs');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Write a synthetic repo root; `files` maps repo-relative paths to contents. */
function makeRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'build-baseline-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const S = 'client/src';

const ALPHA_CSS = `
/* a comment with .fake { background: var(--color-primary); } */
.btnPrimary { background: var(--color-primary); padding: 1px; }
.save { composes: btnPrimary; }
.other { composes: base from './shared.module.css'; }
.soft { background: var(--color-primary-bg); }
.multiA, .multiB { background-color: var(--color-primary); }
@media (min-width: 1px) { .inMedia { background: var(--color-primary); } }
@keyframes spin { from { transform: none; } to { transform: none; } }
.cycleA { composes: cycleB; }
.cycleB { composes: cycleA; }
.glob { composes: x from global; }
.hover:hover { background: var(--color-primary); }
.notPrimary { background: var(--color-surface); }
`;

const TREE = {
  [`${S}/pages/AlphaPage/AlphaPage.tsx`]: `
import { Link, NavLink as NL } from 'react-router-dom';
import styles from './AlphaPage.module.css';
import { Foo } from '../../components/Foo/Foo.js';
import { Hand } from '../../components/Hand/Hand.js';
import { AlphaWidget } from './AlphaWidget.js';
export function AlphaPage() {
  return (
    <div>
      <Link to="/a">a</Link>
      <NL to="/b">b</NL>
      <a href="/c">c</a>
      <button className={styles.btnPrimary}>x</button>
      <button className={\`\${styles.save} \${styles.soft}\`}>y</button>
      <button className={styles['other']}>z</button>
      <button className={styles.soft}>n</button>
      <button className={styles.inMedia}>m</button>
      <button className={styles.multiB}>m</button>
      <button className={styles.cycleA}>c</button>
      <button className={styles.glob}>g</button>
      <button className={styles.hover}>h</button>
      <button className={styles.notPrimary}>np</button>
      <button className={styles.missing}>mi</button>
      <input type="search" />
      <input role="searchbox" />
      <input placeholder={t('x.searchThings')} />
      <input aria-label={t('x.SEARCH')} />
      <input placeholder={t('x.name')} />
      <input placeholder="search literal" />
      <input type="text" />
      <Foo />
      <Hand />
      <AlphaWidget />
    </div>
  );
}
`,
  [`${S}/pages/AlphaPage/AlphaPage.module.css`]: ALPHA_CSS,
  [`${S}/pages/AlphaPage/shared.module.css`]: '.base { background-color: var(--color-primary); }',
  [`${S}/pages/AlphaPage/AlphaWidget.tsx`]: `
import { Foo } from '../../components/Foo/Foo.js';
const tabs = [{ labelKey: 'a', to: '/a' }, { labelKey: 'b', to: '/b' }, { x: 1 }];
const notAnArray = { to: '/ignored' };
export const AlphaWidget = () => <Foo tabs={tabs} other={notAnArray} />;
`,
  [`${S}/pages/AlphaPage/AlphaPage.test.tsx`]: `
import { Link } from 'react-router-dom';
export const T = () => <><Link to="/t" /><Link to="/t2" /></>;
window.confirm('test');
`,
  [`${S}/pages/BetaPage/BetaPage.tsx`]: `
import './util/index.js';
export * from './barrel.js';
import './missing.js';
export const loadIt = () => import('../../components/budget/CostThing.js');
export const BetaPage = () => <input type="search" />;
`,
  [`${S}/pages/BetaPage/barrel.ts`]: `import { VendorPicker } from '../../components/budget/VendorPicker.js';
export const x = VendorPicker;`,
  [`${S}/pages/BetaPage/util/index.ts`]: `export const links = [{ to: '/u' }];`,
  [`${S}/pages/shared/Shared.tsx`]: `
import { Link } from 'react-router-dom';
export const Shared = () => { window.confirm('x'); return <Link to="/s" />; };
`,
  [`${S}/pages/NotADir.tsx`]: 'export const N = 1;',
  [`${S}/components/AppShell/AppShell.tsx`]: `
import { NavLink } from 'react-router-dom';
import s from './AppShell.module.css';
const tabs = [{ labelKey: 'a', to: '/a' }, { labelKey: 'b', to: '/b' }];
export const AppShell = () => <nav><NavLink to="/" className={s.cta} />{tabs.length}</nav>;
`,
  [`${S}/components/AppShell/AppShell.module.css`]: '.cta { background: var(--color-primary); }',
  [`${S}/components/Foo/Foo.tsx`]: `
import { Link } from 'react-router-dom';
import './Helper.js';
export const Foo = () => { window.confirm('?'); return <Link to="/f" />; };
`,
  [`${S}/components/Foo/Helper.tsx`]:
    'export const H = () => { window.confirm("h"); return null; };',
  [`${S}/components/Foo/Foo.test.tsx`]: 'window.confirm("t");',
  [`${S}/components/Hand/Hand.tsx`]: `
export const Hand = () => (
  <div role="dialog"><section aria-modal="true" /><Dlg role="dialog" /></div>
);
`,
  [`${S}/components/Modal/Modal.tsx`]:
    'export const Modal = () => <div role="dialog" aria-modal="true" />;',
  [`${S}/components/SearchPicker/SearchPicker.tsx`]:
    'export const SP = () => <input type="search" />;',
  [`${S}/components/budget/CostThing.tsx`]: 'export const CostThing = () => null;',
  [`${S}/components/budget/VendorPicker.tsx`]:
    'export const VendorPicker = () => <input type="search" />;',
  [`${S}/components/budget/Deep/Thing.tsx`]: 'export const Thing = () => null;',
  [`${S}/components/budget/lowercase.tsx`]: 'export const l = 1;',
  [`${S}/components/Plain.tsx`]: 'export const Plain = 1;',
  [`${S}/i18n/en/common.json`]: JSON.stringify({
    a: 'Remaining budget',
    b: 'Total cost:',
    c: 'Costs…',
    d: 'Hello world',
    e: 'The total amount of everything here',
    f: 'Paid {{count}}',
    g: 'Total cost',
    h: 'Netzwerk',
    nested: { i: 'Unallocated', j: '  Over-allocated  ', n: 42 },
  }),
  [`${S}/i18n/en/readme.txt`]: 'Remaining budget not a json file',
  [`${S}/i18n/de/common.json`]: JSON.stringify({ a: 'Gesamtkosten' }),
};

const EXPECTED_SCREENS = {
  AlphaPage: { destinations: 5, primaryButtons: 5, searchFields: 4 },
  BetaPage: { destinations: 1, primaryButtons: 0, searchFields: 1 },
  shell: { destinations: 3, primaryButtons: 1, searchFields: 0 },
};

describe('parseCss', () => {
  it('returns rules with split selectors and declarations, ignoring comments', () => {
    const rules = parseCss('/* .x {} */ .a, .b { color: red; margin: 0 }');
    assert.deepEqual(rules, [
      {
        selectors: ['.a', '.b'],
        decls: [
          ['color', 'red'],
          ['margin', '0'],
        ],
      },
    ]);
  });
  it('descends into @media and skips @keyframes and @font-face', () => {
    const rules = parseCss(
      '@media (x) { .m { a: b } } @keyframes k { from { a: b } } @font-face { src: url(x) }',
    );
    assert.deepEqual(
      rules.map((r) => r.selectors),
      [['.m']],
    );
  });
  it('ignores declarations without a colon and nested blocks inside a body', () => {
    const rules = parseCss('.a { nocolon; b: c; &:hover { d: e } }');
    assert.deepEqual(rules[0].decls, [['b', 'c']]);
  });
  it('returns nothing for empty input', () => {
    assert.deepEqual(parseCss(''), []);
  });
});

describe('isPrimaryClass', () => {
  const files = {
    '/m/a.css': `.p { background: var(--color-primary); }
      .c { composes: p; }
      .x { composes: q from './b.css'; }
      .soft { background: var(--color-primary-bg); }
      .loop1 { composes: loop2; } .loop2 { composes: loop1; }
      .g { composes: foo from global; }
      .multi { composes: soft p; }
      .self, .p2 { background-color: var(--color-primary); }
      .gone { composes: z from './missing.css'; }`,
    '/m/b.css': '.q { background: var(--color-primary); }',
  };
  const read = (p) => files[p] ?? null;
  it('is true for a plain class declaring the primary background', () => {
    assert.equal(isPrimaryClass('/m/a.css', 'p', read), true);
    assert.equal(isPrimaryClass('/m/a.css', 'p2', read), true);
  });
  it('follows in-file and cross-file composes', () => {
    assert.equal(isPrimaryClass('/m/a.css', 'c', read), true);
    assert.equal(isPrimaryClass('/m/a.css', 'x', read), true);
    assert.equal(isPrimaryClass('/m/a.css', 'multi', read), true);
  });
  it('is false for the primary-bg token, unknown classes, missing files and global composes', () => {
    assert.equal(isPrimaryClass('/m/a.css', 'soft', read), false);
    assert.equal(isPrimaryClass('/m/a.css', 'nope', read), false);
    assert.equal(isPrimaryClass('/m/none.css', 'p', read), false);
    assert.equal(isPrimaryClass('/m/a.css', 'g', read), false);
    assert.equal(isPrimaryClass('/m/a.css', 'gone', read), false);
  });
  it('terminates on composes cycles', () => {
    assert.equal(isPrimaryClass('/m/a.css', 'loop1', read), false);
  });
});

describe('resolveImport', () => {
  const exists = (set) => (p) => set.includes(p);
  it('maps .js to .tsx or .ts and directories to index files', () => {
    assert.equal(resolveImport('/s/a/A.tsx', './B.js', exists(['/s/a/B.tsx'])), '/s/a/B.tsx');
    assert.equal(resolveImport('/s/a/A.tsx', './B.js', exists(['/s/a/B.ts'])), '/s/a/B.ts');
    assert.equal(resolveImport('/s/a/A.tsx', '../u', exists(['/s/u/index.tsx'])), '/s/u/index.tsx');
    assert.equal(
      resolveImport('/s/a/A.tsx', '../u/index.js', exists(['/s/u/index.ts'])),
      '/s/u/index.ts',
    );
  });
  it('prefers .tsx over .ts and returns null when nothing exists', () => {
    assert.equal(resolveImport('/s/A.tsx', './B', exists(['/s/B.ts', '/s/B.tsx'])), '/s/B.tsx');
    assert.equal(resolveImport('/s/A.tsx', './B', exists([])), null);
  });
});

describe('analyzeFile', () => {
  const ctx = { readCss: () => null, countSearch: true, countDialogs: true };
  it('collects relative static, re-export and dynamic imports but not packages', () => {
    const r = analyzeFile(
      '/s/x.ts',
      `import a from './a.js'; import b from 'react'; export { c } from './c.js'; export * from 'pkg';
       export { d };
       const m = () => import('./d.js'); const n = () => import('pkg'); const o = (v) => import(v);`,
      ctx,
    );
    assert.deepEqual(r.imports, ['./a.js', './c.js', './d.js']);
  });
  it('ignores Link-named components not imported from react-router-dom', () => {
    const r = analyzeFile(
      '/s/x.tsx',
      `import { Link } from './MyLink.js'; import { Navigate } from 'react-router-dom';
       import * as R from 'react-router-dom'; import RR from 'react-router-dom';
       export const X = () => <><Link to="/a" /><Navigate to="/b" /></>;`,
      ctx,
    );
    assert.equal(r.destinations, 0);
  });
  it('counts aliased Link and NavLink imports', () => {
    const r = analyzeFile(
      '/s/x.tsx',
      `import { Link as L, NavLink } from 'react-router-dom';
       export const X = () => <><L to="/a" /><NavLink to="/b">b</NavLink></>;`,
      ctx,
    );
    assert.equal(r.destinations, 2);
  });
  it('honours the countSearch and countDialogs switches', () => {
    const src = 'export const X = () => <><input type="search" /><div role="dialog" /></>;';
    const on = analyzeFile('/s/x.tsx', src, ctx);
    assert.deepEqual([on.searchFields, on.handRolledDialogs], [1, 1]);
    const off = analyzeFile('/s/x.tsx', src, { ...ctx, countSearch: false, countDialogs: false });
    assert.deepEqual([off.searchFields, off.handRolledDialogs], [0, 0]);
  });
  it('ignores a css module import without a default binding', () => {
    const r = analyzeFile(
      '/s/x.tsx',
      `import './a.module.css'; export const X = () => <b className={styles.a} />;`,
      ctx,
    );
    assert.equal(r.primaryButtons, 0);
  });
  it('counts window.confirm calls but not bare confirm', () => {
    const r = analyzeFile('/s/x.ts', 'window.confirm("a"); confirm("b"); window.alert("c");', ctx);
    assert.equal(r.windowConfirm, 1);
  });
  it('does not treat a non-t translate call as a search field', () => {
    const r = analyzeFile(
      '/s/x.tsx',
      `export const X = () => <><input placeholder={translate('search')} /><input placeholder={t(key)} /><input placeholder={t()} /><input placeholder /></>;`,
      ctx,
    );
    assert.equal(r.searchFields, 0);
  });
  it('treats template-literal type and role attributes as literals', () => {
    const r = analyzeFile(
      '/s/x.tsx',
      'export const X = () => <><input type={`search`} /><input type={kind} /></>;',
      ctx,
    );
    assert.equal(r.searchFields, 1);
  });
});

describe('auditClient', () => {
  const root = makeRoot(TREE);
  const audit = auditClient(join(root, S));

  it('counts per-screen destinations, primary buttons and search fields over the import closure', () => {
    assert.deepEqual(audit.screens, EXPECTED_SCREENS);
  });

  it('counts a module reached by several files in a closure only once', () => {
    // Foo is imported by AlphaPage and AlphaWidget, its Link must be counted once (5 not 6).
    assert.equal(audit.screens.AlphaPage.destinations, 5);
  });

  it('counts primary buttons via direct class, composes, cross-file composes, selector lists and @media', () => {
    // btnPrimary, save (in-file composes, template literal with soft), other (cross-file),
    // inMedia, multiB are primary. soft, cycleA, glob, hover (pseudo selector), notPrimary and a
    // missing class are not.
    assert.equal(audit.screens.AlphaPage.primaryButtons, 5);
  });

  it('does not count the primary-bg token class as a primary button', () => {
    const only = makeRoot({
      [`${S}/pages/P/P.tsx`]: `import s from './P.module.css'; export const P = () => <b className={s.soft} />;`,
      [`${S}/pages/P/P.module.css`]: '.soft { background: var(--color-primary-bg); }',
    });
    assert.equal(auditClient(join(only, S)).screens.P.primaryButtons, 0);
  });

  it('counts the search rules and excludes picker components', () => {
    assert.equal(audit.screens.AlphaPage.searchFields, 4);
    assert.equal(audit.screens.BetaPage.searchFields, 1, 'VendorPicker input is excluded');
  });

  it('builds the shell screen from AppShell with tab arrays counted as destinations', () => {
    assert.deepEqual(audit.screens.shell, EXPECTED_SCREENS.shell);
  });

  it('follows dynamic imports, barrels and directory indexes and ignores unresolved imports', () => {
    assert.equal(audit.screens.BetaPage.destinations, 1);
  });

  it('excludes pages/shared and loose files from the screen list', () => {
    assert.deepEqual(Object.keys(audit.screens), ['AlphaPage', 'BetaPage', 'shell']);
  });

  it('collects shared components by the same-basename-dir and lowercase-domain rules', () => {
    assert.deepEqual(audit.sharedComponents.names, [
      'AppShell/AppShell',
      'Foo/Foo',
      'Hand/Hand',
      'Modal/Modal',
      'SearchPicker/SearchPicker',
      'budget/CostThing',
      'budget/VendorPicker',
    ]);
    assert.equal(audit.sharedComponents.count, 7);
  });

  it('excludes helpers in PascalCase dirs, tests, deep files, lowercase files and root files', () => {
    for (const n of [
      'Foo/Helper',
      'Foo/Foo.test',
      'budget/Deep/Thing',
      'budget/lowercase',
      'Plain',
    ]) {
      assert.ok(!audit.sharedComponents.names.includes(n), n);
    }
  });

  it('normalises, dedupes and filters money labels from the English files only', () => {
    assert.deepEqual(audit.moneyLabels.values, [
      'costs',
      'over-allocated',
      'paid',
      'remaining budget',
      'total cost',
      'unallocated',
    ]);
    assert.equal(audit.moneyLabels.count, 6);
  });

  it('counts window.confirm over all non-test files including pages/shared', () => {
    assert.equal(audit.windowConfirm, 3);
  });

  it('counts hand-rolled dialogs outside components/Modal', () => {
    assert.equal(audit.handRolledDialogs, 2);
  });

  it('copes with a client tree that has no pages, shell or i18n', () => {
    const bare = makeRoot({ [`${S}/lib/x.ts`]: 'export const x = 1;' });
    assert.deepEqual(auditClient(join(bare, S)), {
      screens: {},
      sharedComponents: { count: 0, names: [] },
      moneyLabels: { count: 0, values: [] },
      windowConfirm: 0,
      handRolledDialogs: 0,
    });
  });

  it('is deterministic', () => {
    assert.deepEqual(auditClient(join(root, S)), audit);
  });
});

describe('normalizeLabel', () => {
  it('strips placeholders, trailing colon and ellipsis, collapses spaces and lowercases', () => {
    assert.equal(normalizeLabel('  Total   {{n}}  cost : '), 'total cost');
    assert.equal(normalizeLabel('Paid…'), 'paid');
    assert.equal(normalizeLabel('{{x}}'), '');
  });
});

const measuredBase = () => ({
  screens: { A: { destinations: 2, primaryButtons: 1, searchFields: 1 } },
  sharedComponents: { count: 1, names: ['Foo/Foo'] },
  moneyLabels: { count: 1, values: ['paid'] },
  windowConfirm: 2,
  handRolledDialogs: 1,
});
const baselineOf = (measured, allowed = []) => ({
  schemaVersion: 1,
  measured,
  allowedAdditions: { sharedComponents: allowed },
  audited: {},
});

describe('compareBaseline', () => {
  const same = () => compareBaseline(baselineOf(measuredBase()), measuredBase());

  it('reports no rises and no drops when nothing changed', () => {
    assert.deepEqual(same(), { rises: [], drops: [], unrecorded: [] });
  });

  for (const [metric, mutate, message] of [
    ['destinations', (m) => (m.screens.A.destinations = 3), 'A.destinations: 2 → 3'],
    ['primaryButtons', (m) => (m.screens.A.primaryButtons = 2), 'A.primaryButtons: 1 → 2'],
    ['searchFields', (m) => (m.screens.A.searchFields = 2), 'A.searchFields: 1 → 2'],
    ['windowConfirm', (m) => (m.windowConfirm = 3), 'windowConfirm: 2 → 3'],
    ['handRolledDialogs', (m) => (m.handRolledDialogs = 2), 'handRolledDialogs: 1 → 2'],
  ]) {
    it(`flags a rise in ${metric} and a drop in the opposite direction`, () => {
      const up = measuredBase();
      mutate(up);
      assert.deepEqual(compareBaseline(baselineOf(measuredBase()), up).rises, [message]);
      const down = compareBaseline(baselineOf(up), measuredBase());
      assert.deepEqual(down.rises, []);
      assert.deepEqual(down.drops, [message.replace(/: (\d+) → (\d+)/, ': $2 → $1')]);
    });
  }

  it('flags a new money label as a rise and a removed one as a drop', () => {
    const m = measuredBase();
    m.moneyLabels.values = ['paid', 'unpaid'];
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), m).rises, [
      'moneyLabels: new label "unpaid"',
    ]);
    const n = measuredBase();
    n.moneyLabels.values = [];
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), n).drops, [
      'moneyLabels: "paid" removed',
    ]);
  });

  it('flags a new shared component that is not allowed', () => {
    const m = measuredBase();
    m.sharedComponents.names = ['Foo/Foo', 'Zeta/Zeta'];
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), m).rises, [
      'sharedComponents: new component Zeta/Zeta is not in allowedAdditions',
    ]);
  });

  it('accepts a new shared component whose basename is allowed, including domain dirs', () => {
    const m = measuredBase();
    m.sharedComponents.names = ['Foo/Foo', 'ConfirmDialog/ConfirmDialog', 'budget/CostLineTable'];
    const res = compareBaseline(baselineOf(measuredBase(), ['ConfirmDialog', 'CostLineTable']), m);
    assert.deepEqual(res.rises, []);
  });

  it('reports a new in-cap screen as unrecorded, not as a rise', () => {
    const m = measuredBase();
    m.screens.B = { destinations: 3, primaryButtons: 1, searchFields: 1 };
    const res = compareBaseline(baselineOf(measuredBase()), m);
    assert.deepEqual(res.rises, []);
    assert.deepEqual(res.unrecorded, ['B: new screen not in baseline']);
  });

  it('reports an over-cap new screen as both rise and unrecorded', () => {
    const m = measuredBase();
    m.screens.B = { destinations: 0, primaryButtons: 2, searchFields: 0 };
    const res = compareBaseline(baselineOf(measuredBase()), m);
    assert.equal(res.rises.length, 1);
    assert.deepEqual(res.unrecorded, ['B: new screen not in baseline']);
  });

  it('reports an allowed addition that is measured but still allowed as not yet recorded', () => {
    const m = measuredBase();
    m.sharedComponents.names = ['Foo/Foo', 'ConfirmDialog/ConfirmDialog'];
    const res = compareBaseline(baselineOf(measuredBase(), ['ConfirmDialog']), m);
    assert.deepEqual(res.rises, []);
    assert.deepEqual(res.unrecorded, ['sharedComponents: ConfirmDialog not yet recorded']);
  });

  it('has nothing unrecorded once the allowed name was consumed into the baseline', () => {
    const m = measuredBase();
    m.sharedComponents.names = ['Foo/Foo', 'ConfirmDialog/ConfirmDialog'];
    const res = compareBaseline(baselineOf(m, []), m);
    assert.deepEqual(res.unrecorded, []);
  });

  it('reports a removed shared component as a drop', () => {
    const m = measuredBase();
    m.sharedComponents.names = [];
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), m).drops, [
      'sharedComponents: Foo/Foo removed',
    ]);
  });

  it('allows a new screen within the caps and flags it over them', () => {
    const within = measuredBase();
    within.screens.B = { destinations: 99, primaryButtons: 1, searchFields: 1 };
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), within).rises, []);

    const over = measuredBase();
    over.screens.B = { destinations: 0, primaryButtons: 2, searchFields: 2 };
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), over).rises, [
      'B.primaryButtons: (new screen) → 2',
      'B.searchFields: (new screen) → 2',
    ]);
  });

  it('reports a screen that disappeared as a drop', () => {
    const m = measuredBase();
    delete m.screens.A;
    assert.deepEqual(compareBaseline(baselineOf(measuredBase()), m).drops, ['A: screen removed']);
  });

  it('treats a missing baseline as all zeros', () => {
    const res = compareBaseline(null, measuredBase());
    assert.ok(res.rises.includes('windowConfirm: 0 → 2'));
    assert.ok(res.rises.includes('moneyLabels: new label "paid"'));
  });

  it('treats missing metrics on a baseline screen as zero', () => {
    const b = baselineOf(measuredBase());
    b.measured.screens.A = {};
    assert.deepEqual(compareBaseline(b, measuredBase()).rises, [
      'A.destinations: 0 → 2',
      'A.primaryButtons: 0 → 1',
      'A.searchFields: 0 → 1',
    ]);
  });
});

describe('buildBaseline', () => {
  it('seeds allowed additions and the audited inventories when there is no baseline', () => {
    const b = buildBaseline(null, measuredBase());
    assert.equal(b.schemaVersion, 1);
    assert.ok(b.allowedAdditions.sharedComponents.includes('ConfirmDialog'));
    assert.equal(b.allowedAdditions.sharedComponents.length, 31);
    assert.equal(b.audited.createPatterns.count, 11);
    assert.equal(b.audited.createPatterns.variants.length, 11);
    assert.equal(b.audited.saveModels.count, 9);
    assert.equal(b.audited.confirmationMechanisms.count, 5);
    assert.equal(b.audited.confirmationMechanisms.doubleConfirmations, 1);
  });

  it('moves consumed names out of allowedAdditions and keeps the others', () => {
    const m = measuredBase();
    m.sharedComponents.names = ['Foo/Foo', 'ConfirmDialog/ConfirmDialog'];
    const b = buildBaseline(null, m);
    assert.ok(!b.allowedAdditions.sharedComponents.includes('ConfirmDialog'));
    assert.ok(b.allowedAdditions.sharedComponents.includes('TopBar'));
    assert.equal(b.allowedAdditions.sharedComponents.length, 30);
  });

  it('keeps existing audited data and allowed list instead of reseeding', () => {
    const existing = {
      allowedAdditions: { sharedComponents: ['OnlyThis'] },
      audited: { custom: 1 },
    };
    const b = buildBaseline(existing, measuredBase());
    assert.deepEqual(b.allowedAdditions.sharedComponents, ['OnlyThis']);
    assert.deepEqual(b.audited, { custom: 1 });
  });

  it('returns a fresh copy of the seed so callers cannot mutate it', () => {
    const a = buildBaseline(null, measuredBase());
    a.audited.createPatterns.count = 99;
    assert.equal(buildBaseline(null, measuredBase()).audited.createPatterns.count, 11);
  });
});

describe('run', () => {
  const baselinePath = (root) => join(root, 'plan/restructure/baseline.json');

  it('check without a baseline reports the missing file', async () => {
    const root = makeRoot(TREE);
    const res = await run({ root, mode: 'check' });
    assert.equal(res.name, 'pattern baseline');
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /input missing: plan\/restructure\/baseline\.json/);
  });

  it('check reports a missing client directory', async () => {
    const root = makeRoot({ 'x.txt': 'x' });
    const res = await run({ root });
    assert.match(res.errors[0], /input missing: .*client\/src/);
  });

  it('write seeds the baseline, then check passes and write is unchanged', async () => {
    const root = makeRoot(TREE);
    const written = await run({ root, mode: 'write' });
    assert.deepEqual(written.errors, []);
    assert.deepEqual(written.notes, ['baseline.json written']);
    const doc = JSON.parse(readFileSync(baselinePath(root), 'utf8'));
    assert.deepEqual(doc.measured.screens, EXPECTED_SCREENS);
    assert.deepEqual((await run({ root, mode: 'check' })).errors, []);
    assert.deepEqual((await run({ root, mode: 'write' })).notes, ['baseline.json unchanged']);
  });

  it('writes Prettier-formatted JSON', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    const config = (await prettier.resolveConfig(baselinePath(root))) ?? {};
    assert.equal(
      await prettier.check(readFileSync(baselinePath(root), 'utf8'), { ...config, parser: 'json' }),
      true,
    );
  });

  it('check fails on a rise and names metric, old and new value', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    writeFileSync(
      join(root, S, 'components/Foo/Helper.tsx'),
      'window.confirm("a"); window.confirm("b");',
    );
    const res = await run({ root, mode: 'check' });
    assert.deepEqual(res.errors, ['windowConfirm: 3 → 4']);
  });

  it('check passes with a notice when the measurement drops', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    writeFileSync(join(root, S, 'components/Foo/Helper.tsx'), 'export const H = 1;');
    const res = await run({ root, mode: 'check' });
    assert.deepEqual(res.errors, []);
    assert.equal(res.notes[0], 'baseline is behind: run npm run plan:build');
    assert.ok(res.notes.includes('  windowConfirm: 3 → 2'));
  });

  it('check passes with a "baseline is behind" notice for an allowed addition and a new screen', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    mkdirSync(join(root, S, 'components/ConfirmDialog'), { recursive: true });
    writeFileSync(
      join(root, S, 'components/ConfirmDialog/ConfirmDialog.tsx'),
      'export const ConfirmDialog = () => null;',
    );
    mkdirSync(join(root, S, 'pages/GammaPage'), { recursive: true });
    writeFileSync(join(root, S, 'pages/GammaPage/GammaPage.tsx'), 'export const G = () => null;');
    const res = await run({ root, mode: 'check' });
    assert.deepEqual(res.errors, []);
    assert.equal(res.notes[0], 'baseline is behind: run npm run plan:build');
    assert.ok(res.notes.includes('  GammaPage: new screen not in baseline'));
    assert.ok(res.notes.includes('  sharedComponents: ConfirmDialog not yet recorded'));
  });

  it('write lowers the baseline after a drop', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    writeFileSync(join(root, S, 'components/Foo/Helper.tsx'), 'export const H = 1;');
    await run({ root, mode: 'write' });
    assert.equal(JSON.parse(readFileSync(baselinePath(root), 'utf8')).measured.windowConfirm, 2);
  });

  it('write refuses on an unallowed rise, exits with the rises and leaves the file untouched', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    const before = readFileSync(baselinePath(root), 'utf8');
    mkdirSync(join(root, S, 'components/Zeta'), { recursive: true });
    writeFileSync(join(root, S, 'components/Zeta/Zeta.tsx'), 'export const Zeta = () => null;');
    const res = await run({ root, mode: 'write' });
    assert.deepEqual(res.errors, [
      'refusing to write while rises exist:',
      'sharedComponents: new component Zeta/Zeta is not in allowedAdditions',
    ]);
    assert.equal(readFileSync(baselinePath(root), 'utf8'), before);
  });

  it('an allowed addition passes check and is consumed by write', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    mkdirSync(join(root, S, 'components/ConfirmDialog'), { recursive: true });
    writeFileSync(
      join(root, S, 'components/ConfirmDialog/ConfirmDialog.tsx'),
      'export const ConfirmDialog = () => null;',
    );
    assert.deepEqual((await run({ root, mode: 'check' })).errors, []);
    await run({ root, mode: 'write' });
    const doc = JSON.parse(readFileSync(baselinePath(root), 'utf8'));
    assert.ok(!doc.allowedAdditions.sharedComponents.includes('ConfirmDialog'));
    assert.ok(doc.measured.sharedComponents.names.includes('ConfirmDialog/ConfirmDialog'));
    assert.equal(doc.allowedAdditions.sharedComponents.length, 30);
  });

  it('keeps the audited section byte-identical across writes', async () => {
    const root = makeRoot(TREE);
    await run({ root, mode: 'write' });
    const doc = JSON.parse(readFileSync(baselinePath(root), 'utf8'));
    doc.audited = {
      createPatterns: {
        count: 3,
        variants: [{ code: 'Z', description: 'custom', examples: ['x'] }],
      },
    };
    writeFileSync(baselinePath(root), JSON.stringify(doc));
    writeFileSync(join(root, S, 'components/Foo/Helper.tsx'), 'export const H = 1;');
    await run({ root, mode: 'write' });
    const after = JSON.parse(readFileSync(baselinePath(root), 'utf8'));
    assert.deepEqual(after.audited, doc.audited);
    assert.equal(after.measured.windowConfirm, 2);
  });

  it('uses an explicit clientDir when given', async () => {
    const root = makeRoot({ ...TREE });
    const other = makeRoot({ [`${S}/lib/x.ts`]: 'export const x = 1;' });
    const res = await run({ root, mode: 'write', clientDir: join(other, S) });
    assert.deepEqual(res.errors, []);
    assert.deepEqual(JSON.parse(readFileSync(baselinePath(root), 'utf8')).measured.screens, {});
  });
});

describe('CLI', () => {
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  it('exits 2 on an unknown argument', () => {
    const r = cli('--bogus');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown argument --bogus/);
  });

  it('exits 1 and names the missing directory for a nonexistent --client', () => {
    const r = cli('--check', '--client', join(tmpdir(), 'does-not-exist-xyz'));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /input missing/);
  });
});
