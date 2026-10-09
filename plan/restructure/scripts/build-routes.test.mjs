import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  CHANGE_VALUES,
  baseFroms,
  extractRouterRoutes,
  extractRouterRoutesChecked,
  run,
  validateRouteMap,
} from './build-routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'build-routes.mjs');
const FIXTURE_APP = join(HERE, '__fixtures__/App.fixture.tsx');
const fixtureRoutes = () => extractRouterRoutes(readFileSync(FIXTURE_APP, 'utf8'));
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function entry(from, over = {}) {
  return {
    from,
    kind: 'page',
    change: 'kept',
    guard: 'member',
    gate: 'none',
    permanent: false,
    carries: [],
    section: 'Section',
    to: '/target',
    note: 'A note',
    ...over,
  };
}

const FIXTURE_MAP = [
  entry('*', { guard: 'public' }),
  entry('/'),
  entry('/budget', { kind: 'redirect' }),
  entry('/budget/items/:itemId'),
  entry('/budget/overview'),
  entry('/legacy/:id', { kind: 'redirect' }),
  entry('/login', { guard: 'public' }),
  entry('/old-login', { kind: 'redirect', guard: 'public' }),
  entry('/tasks'),
];

function makeRoot({ routemap = FIXTURE_MAP, app = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'build-routes-'));
  roots.push(root);
  mkdirSync(join(root, 'plan/restructure'), { recursive: true });
  if (app) {
    mkdirSync(join(root, 'client/src'), { recursive: true });
    copyFileSync(FIXTURE_APP, join(root, 'client/src/App.tsx'));
  }
  if (routemap) {
    writeFileSync(join(root, 'plan/restructure/routemap.json'), JSON.stringify(routemap));
  }
  return root;
}

describe('extractRouterRoutes', () => {
  const routes = fixtureRoutes();
  const find = (path, kind) => routes.find((r) => r.path === path && (!kind || r.kind === kind));

  it('joins nested relative paths into full paths', () => {
    assert.ok(find('/budget/overview'));
    assert.ok(find('/budget/items/:itemId'));
  });

  it('maps a root index route to / and a nested index route to its parent path', () => {
    assert.equal(find('/').element, 'DashboardPage');
    assert.equal(find('/budget').kind, 'redirect');
  });

  it('adds nothing for pathless layout routes and emits no entry for them', () => {
    assert.ok(!routes.some((r) => r.path === '' || r.path === '//'));
    assert.equal(routes.filter((r) => r.element === 'AppShell').length, 0);
  });

  it('keeps the catch-all * path', () => {
    assert.deepEqual(find('*'), {
      path: '*',
      guard: 'public',
      kind: 'page',
      element: 'NotFoundPage',
    });
  });

  it('sees through Suspense wrappers to the page component', () => {
    assert.equal(find('/tasks').element, 'TasksPage');
  });

  it('resolves relative Navigate targets against the parent path', () => {
    assert.equal(find('/budget').target, '/budget/overview');
  });

  it('keeps absolute Navigate targets and ParamRedirect targets', () => {
    assert.equal(find('/old-login').target, '/login');
    assert.deepEqual(find('/legacy/:id'), {
      path: '/legacy/:id',
      guard: 'member',
      kind: 'redirect',
      target: '/tasks/:id',
    });
  });

  it('marks routes inside an AuthGuard layout as member and the rest as public', () => {
    assert.equal(find('/login').guard, 'public');
    assert.equal(find('/old-login').guard, 'public');
    assert.equal(find('*').guard, 'public');
    assert.equal(find('/tasks').guard, 'member');
    assert.equal(find('/').guard, 'member');
  });

  it('skips routes whose element is not a component or redirect', () => {
    assert.ok(!find('/bare'));
  });

  it('sorts by path, then kind', () => {
    const src = `<Routes>
      <Route path="a" element={<Navigate to="/b" />} />
      <Route path="a" element={<APage />} />
    </Routes>`;
    const out = extractRouterRoutes(src);
    assert.deepEqual(
      out.map((r) => r.kind),
      ['page', 'redirect'],
    );
  });

  it('handles absolute child paths, fragments, parentheses and element-less routes', () => {
    const src = `<Routes>
      <Route path="x">
        <Route path="/abs" element={(<AbsPage />)} />
        <Route path="frag" element={<><FragPage /></>} />
        <Route path="noel" />
        <Route path="expr" element={cond} />
        <Route path="dyn" element={<Navigate to={target} />} />
        <Route path="tpl" element={<Navigate to={\`/tpl-target\`} />} />
        <Route path="lower" element={<div />} />
        <Route path="emptyfrag" element={<></>} />
        <Route path="wrapempty" element={<Suspense />} />
        <Route path="fb" element={<Suspense><section /></Suspense>} />
      </Route>
    </Routes>`;
    const out = extractRouterRoutes(src);
    const byPath = Object.fromEntries(out.map((r) => [r.path, r]));
    assert.equal(byPath['/abs'].element, 'AbsPage');
    assert.equal(byPath['/x/frag'].element, 'FragPage');
    assert.equal(byPath['/x/tpl'].target, '/tpl-target');
    for (const skipped of ['/x/noel', '/x/expr', '/x/dyn', '/x/lower', '/x/emptyfrag']) {
      assert.ok(!byPath[skipped], `${skipped} should not be emitted`);
    }
    assert.ok(!byPath['/x/wrapempty']);
    assert.ok(!byPath['/x/fb']);
  });

  it('returns no routes when the source has no Routes element', () => {
    assert.deepEqual(extractRouterRoutes('const a = <div />;'), []);
  });

  it('ignores a self-closing Routes element', () => {
    assert.deepEqual(extractRouterRoutes('const a = <Routes />;'), []);
  });

  it('keeps * under a non-root parent as a relative path', () => {
    const out = extractRouterRoutes(
      '<Routes><Route path="a"><Route path="*" element={<P />} /></Route></Routes>',
    );
    assert.deepEqual(
      out.map((r) => r.path),
      ['/a/*'],
    );
  });

  it('treats an AuthGuard written as an element expression without path as member guard', () => {
    const out = extractRouterRoutes(
      '<Routes><Route element={<AuthGuard />}><Route path="m" element={<M />} /></Route></Routes>',
    );
    assert.equal(out[0].guard, 'member');
  });

  it('does not treat other layouts as guards', () => {
    const out = extractRouterRoutes(
      '<Routes><Route element={<Layout />}><Route path="m" element={<M />} /></Route></Routes>',
    );
    assert.equal(out[0].guard, 'public');
  });
});

describe('extractRouterRoutesChecked', () => {
  it('returns routes and no errors for the readable fixture, equal to extractRouterRoutes', () => {
    const src = readFileSync(FIXTURE_APP, 'utf8');
    const checked = extractRouterRoutesChecked(src);
    assert.deepEqual(checked.errors, []);
    assert.deepEqual(checked.routes, extractRouterRoutes(src));
    assert.ok(Array.isArray(extractRouterRoutes(src)));
  });

  it('reports an unreadable route path with the correct line', () => {
    const src = [
      '<Routes>',
      '  <Route path="ok" element={<OkPage />} />',
      '  <Route path={P} element={<PPage />} />',
      '  <Route',
      '    path={ROUTES.x.path}',
      '    element={<XPage />}',
      '  />',
      '</Routes>',
    ].join('\n');
    const { errors } = extractRouterRoutesChecked(src);
    assert.deepEqual(errors, [
      'App.tsx:3: unreadable route path',
      'App.tsx:4: unreadable route path',
    ]);
  });

  it('reports non-literal Navigate and ParamRedirect targets and emits no redirect for them', () => {
    const src = [
      '<Routes>',
      '  <Route path="a" element={<Navigate to={X} />} />',
      '  <Route path="b" element={<ParamRedirect to={build(1)} />} />',
      '</Routes>',
    ].join('\n');
    const { routes, errors } = extractRouterRoutesChecked(src);
    assert.deepEqual(errors, [
      'App.tsx:2: unreadable redirect target',
      'App.tsx:3: unreadable redirect target',
    ]);
    assert.deepEqual(routes, []);
  });

  it('does not re-parent children of an unreadable route silently', () => {
    const src = [
      '<Routes>',
      '  <Route path={P}>',
      '    <Route path="child" element={<Child />} />',
      '  </Route>',
      '</Routes>',
    ].join('\n');
    const { errors } = extractRouterRoutesChecked(src);
    assert.deepEqual(errors, ['App.tsx:2: unreadable route path']);
  });

  it('makes run() fail in check mode', async () => {
    const root = makeRoot();
    const appPath = join(root, 'client/src/App.tsx');
    writeFileSync(
      appPath,
      readFileSync(appPath, 'utf8').replace('path="tasks"', 'path={TASKS_PATH}'),
    );
    const res = await run({ root, mode: 'check' });
    assert.ok(res.errors.some((e) => /^App\.tsx:\d+: unreadable route path$/.test(e)));
  });
});

describe('baseFroms', () => {
  it('strips query, hash and condition and splits comma lists', () => {
    assert.deepEqual(baseFroms('/a?x=1'), ['/a']);
    assert.deepEqual(baseFroms('/b#frag'), ['/b']);
    assert.deepEqual(baseFroms('/c (member)'), ['/c']);
    assert.deepEqual(baseFroms('/d, /e (admin), /f?q=1'), ['/d', '/e', '/f']);
  });
});

describe('validateRouteMap', () => {
  const routes = fixtureRoutes();

  it('accepts a complete, valid map', () => {
    assert.deepEqual(validateRouteMap(FIXTURE_MAP, routes), []);
  });

  it('rejects a non-array map', () => {
    assert.deepEqual(validateRouteMap({}, routes), ['routemap.json must be an array of entries']);
  });

  it('reports a router path without a route-map entry', () => {
    const map = FIXTURE_MAP.filter((e) => e.from !== '/tasks');
    assert.deepEqual(validateRouteMap(map, routes), [
      'router route /tasks has no route-map entry — add it to plan/restructure/routemap.json',
    ]);
  });

  it('reports a stale legacy entry the router no longer serves', () => {
    const map = [...FIXTURE_MAP, entry('/gone')];
    assert.deepEqual(validateRouteMap(map, routes), [
      'route-map entry /gone is not served by the router',
    ]);
  });

  it('exempts new, repair, query-map and conditional entries from the reverse check', () => {
    for (const change of ['new', 'repair', 'query-map', 'conditional']) {
      const map = [...FIXTURE_MAP, entry(`/${change}-only`, { change })];
      assert.deepEqual(validateRouteMap(map, routes), [], change);
    }
  });

  it('does not exempt other change values from the reverse check', () => {
    for (const change of CHANGE_VALUES.filter(
      (c) => !['new', 'repair', 'query-map', 'conditional'].includes(c),
    )) {
      const map = [...FIXTURE_MAP, entry('/gone', { change })];
      assert.equal(validateRouteMap(map, routes).length, 1, change);
    }
  });

  it('matches query, hash, condition and comma-list entries to router paths', () => {
    const map = FIXTURE_MAP.filter((e) => e.from !== '/tasks' && e.from !== '/login').concat([
      entry('/tasks?view=list, /login (public)'),
    ]);
    assert.deepEqual(validateRouteMap(map, routes), []);
  });

  it('reports an unserved base inside a comma list', () => {
    const map = [...FIXTURE_MAP, entry('/tasks, /nowhere', { note: 'x' })];
    assert.ok(
      validateRouteMap(map, routes).includes(
        'route-map entry /tasks, /nowhere is not served by the router',
      ),
    );
  });

  const violations = [
    ['kind', { kind: 'frame' }, /kind must be one of page, redirect/],
    ['change', { change: 'bogus' }, /change must be one of/],
    ['guard', { guard: 'root' }, /guard must be one of public, member, admin/],
    ['gate', { gate: 'ai' }, /gate must be one of none, paperless, paperless\+ai/],
    ['permanent', { permanent: 'yes' }, /permanent must be a boolean/],
    ['carries type', { carries: 'a' }, /carries must be an array of strings/],
    ['carries items', { carries: [1] }, /carries must be an array of strings/],
    ['section', { section: ' ' }, /section must not be empty/],
    ['note', { note: '' }, /note must not be empty/],
  ];
  for (const [name, over, pattern] of violations) {
    it(`reports an invalid ${name}`, () => {
      const map = FIXTURE_MAP.map((e) => (e.from === '/tasks' ? { ...e, ...over } : e));
      const errors = validateRouteMap(map, routes);
      assert.equal(errors.length, 1);
      assert.match(errors[0], pattern);
      assert.match(errors[0], /\/tasks/);
    });
  }

  it('accepts every documented change value', () => {
    assert.equal(CHANGE_VALUES.length, 11);
    for (const change of CHANGE_VALUES) {
      const map = FIXTURE_MAP.map((e) => (e.from === '/tasks' ? { ...e, change } : e));
      assert.deepEqual(validateRouteMap(map, routes), [], change);
    }
  });

  it('reports a missing or empty to', () => {
    for (const over of [{ to: undefined }, { to: '' }, { to: '  ' }, { to: 5 }]) {
      const map = FIXTURE_MAP.map((e) => (e.from === '/tasks' ? { ...e, ...over } : e));
      assert.deepEqual(validateRouteMap(map, routes), [
        'route-map entry /tasks: to must not be empty',
      ]);
    }
  });

  it('reports a duplicate from', () => {
    const map = [...FIXTURE_MAP, entry('/tasks')];
    assert.deepEqual(validateRouteMap(map, routes), ['route-map entry /tasks is duplicated']);
  });

  it('reports an entry without from and does not crash on null entries', () => {
    const errors = validateRouteMap([...FIXTURE_MAP, { ...entry('x'), from: '' }, null], routes);
    assert.ok(errors.includes('route-map entry #9 has no "from"'));
    assert.ok(errors.some((e) => e.startsWith('route-map entry #10')));
  });
});

describe('run', () => {
  it('check fails with a stale message when router-routes.json is missing, then passes after write', async () => {
    const root = makeRoot();
    const stale = await run({ root, mode: 'check' });
    assert.ok(stale.errors.includes('router-routes.json is stale — run npm run plan:build'));

    const written = await run({ root, mode: 'write' });
    assert.deepEqual(written.errors, []);
    assert.ok(written.notes.includes('router-routes.json written'));

    const again = await run({ root, mode: 'check' });
    assert.deepEqual(again.errors, []);
    assert.equal(again.name, 'route map');
  });

  it('write is idempotent and does not announce a second write', async () => {
    const root = makeRoot();
    await run({ root, mode: 'write' });
    const second = await run({ root, mode: 'write' });
    assert.ok(!second.notes.includes('router-routes.json written'));
  });

  it('generated output is Prettier-formatted JSON listing the routes', async () => {
    const root = makeRoot();
    await run({ root, mode: 'write' });
    const path = join(root, 'plan/restructure/router-routes.json');
    const text = readFileSync(path, 'utf8');
    const config = (await prettier.resolveConfig(path)) ?? {};
    assert.equal(await prettier.check(text, { ...config, parser: 'json' }), true);
    assert.equal(JSON.parse(text).routes.length, fixtureRoutes().length);
  });

  it('detects drift when the committed file differs from the router', async () => {
    const root = makeRoot();
    await run({ root, mode: 'write' });
    const appPath = join(root, 'client/src/App.tsx');
    writeFileSync(
      appPath,
      readFileSync(appPath, 'utf8').replace(
        '<Route path="*"',
        '<Route path="zzz" element={<ZzzPage />} />\n<Route path="*"',
      ),
    );
    const res = await run({ root, mode: 'check' });
    assert.ok(res.errors.includes('router-routes.json is stale — run npm run plan:build'));
    assert.ok(
      res.errors.some((e) => e.startsWith('router route /zzz has no route-map entry')),
      res.errors.join('\n'),
    );
  });

  it('reports validation errors in check mode', async () => {
    const root = makeRoot({ routemap: FIXTURE_MAP.filter((e) => e.from !== '/tasks') });
    await run({ root, mode: 'write' });
    const res = await run({ root, mode: 'check' });
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /router route \/tasks has no route-map entry/);
  });

  it('reports a missing App.tsx by name', async () => {
    const root = makeRoot({ app: false });
    const res = await run({ root });
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /input missing: .*App\.tsx/);
  });

  it('reports a missing routemap.json by name', async () => {
    const root = makeRoot({ routemap: null });
    const res = await run({ root, mode: 'write' });
    assert.deepEqual(res.errors, [
      'input missing: plan/restructure/routemap.json (curated route map)',
    ]);
  });
});

describe('CLI', () => {
  it('exits 2 on an unknown argument', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown argument --bogus/);
  });
});
