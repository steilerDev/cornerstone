import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  AGREEMENT_FIELDS,
  CHANGE_VALUES,
  baseFroms,
  extractRouterRoutes,
  extractRouterRoutesChecked,
  loadRouteModule,
  run,
  validateRouteMap,
} from './build-routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'build-routes.mjs');
const FIXTURE_APP = join(HERE, '__fixtures__/App.fixture.tsx');
const FIXTURE_ROUTES_APP = join(HERE, '__fixtures__/App.routes.fixture.tsx');
const FIXTURE_ROUTES_DIR = join(HERE, '__fixtures__/routes');
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
  entry('/budget', { kind: 'redirect', to: '/budget/overview' }),
  entry('/budget/items/:itemId'),
  entry('/budget/overview'),
  entry('/legacy/:id', { kind: 'redirect', to: '/tasks/:id' }),
  entry('/login', { guard: 'public' }),
  entry('/old-login', { kind: 'redirect', guard: 'public', to: '/login' }),
  entry('/tasks'),
];

/**
 * Write a synthetic shared/src/routes module into a root: the fixture files, with routeMap.ts
 * regenerated from `map` and any `files` overrides applied.
 */
function writeRouteModule(root, map, files = {}) {
  const dir = join(root, 'shared/src/routes');
  mkdirSync(dir, { recursive: true });
  for (const file of readdirSync(FIXTURE_ROUTES_DIR)) {
    copyFileSync(join(FIXTURE_ROUTES_DIR, file), join(dir, file));
  }
  writeFileSync(join(dir, 'routeMap.ts'), `export const ROUTE_MAP = ${JSON.stringify(map)};\n`);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const asModuleMap = (map) => map.map((e) => ({ ...e, stage: 'done' }));

function makeRoot({ routemap = FIXTURE_MAP, app = true, module = asModuleMap(FIXTURE_MAP) } = {}) {
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
  if (module) writeRouteModule(root, module);
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
    const without = FIXTURE_MAP.filter((e) => e.from !== '/tasks');
    const root = makeRoot({ routemap: without, module: asModuleMap(without) });
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

// --- shared route module (stage-aware checks) ---------------------------------------

const BASE_MAP = [
  {
    id: 'tasks',
    from: '/tasks',
    to: '/tasks',
    kind: 'page',
    change: 'kept',
    section: 'Tasks',
    guard: 'member',
    gate: 'none',
    permanent: false,
    carries: [],
    stage: 'done',
  },
  {
    id: 'task',
    from: '/tasks/:id',
    to: '/tasks/:id',
    kind: 'page',
    change: 'kept',
    section: 'Tasks',
    guard: 'member',
    gate: 'none',
    permanent: true,
    carries: [],
    stage: 'done',
    parent: 'tasks',
  },
  {
    id: 'admin',
    from: '/admin',
    to: '/admin',
    kind: 'page',
    change: 'kept',
    section: 'System',
    guard: 'admin',
    gate: 'none',
    permanent: false,
    carries: [],
    stage: 'done',
  },
  {
    id: 'review',
    from: '/review',
    to: '/review',
    kind: 'page',
    change: 'kept',
    section: 'Money',
    guard: 'member',
    gate: 'paperless',
    permanent: false,
    carries: [],
    stage: 'done',
  },
  {
    from: '/old/:id',
    to: '/tasks/:id',
    kind: 'redirect',
    change: 'redirect',
    section: 'Tasks',
    guard: 'member',
    gate: 'none',
    permanent: false,
    carries: ['*'],
    stage: 'done',
  },
  {
    from: '/review (Paperless off)',
    to: '/tasks',
    kind: 'redirect',
    change: 'conditional',
    section: 'Money',
    guard: 'member',
    gate: 'paperless',
    permanent: false,
    carries: ['*'],
    stage: 'done',
    match: { condition: 'paperless-off', appliesTo: ['review'] },
  },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const mutate = (map, from, over) => map.map((e) => (e.from === from ? { ...e, ...over } : e));
const curated = (map) => map.map((e) => ({ ...e, note: 'A note' }));
const GENERATOR_ERROR =
  'App.tsx:1: unrecognised route generator: the callback must render <Route path={r.from} element={<RouteRedirect rule={r} />} />';
const ROUTES_APP_SRC = readFileSync(FIXTURE_ROUTES_APP, 'utf8');
const ADMIN_GUARD_BLOCK =
  /<Route element=\{<RoleGuard allow=\{\['admin'\]\} \/>\}>\s*(<Route path=\{routePattern\('admin'\)\}.*\/>)\s*<\/Route>/;
const GENERATOR_BLOCK = /\{LIVE_REDIRECT_ROUTES\.map[\s\S]*?\)\)\}/;

function makeModuleRoot({
  map = BASE_MAP,
  routemap = curated(map ?? BASE_MAP),
  app = ROUTES_APP_SRC,
  files,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'build-routes-mod-'));
  roots.push(root);
  mkdirSync(join(root, 'plan/restructure'), { recursive: true });
  mkdirSync(join(root, 'client/src'), { recursive: true });
  writeFileSync(join(root, 'client/src/App.tsx'), app);
  writeFileSync(join(root, 'plan/restructure/routemap.json'), JSON.stringify(routemap));
  if (map) writeRouteModule(root, map, files);
  return root;
}

async function errorsOf(opts) {
  const root = makeModuleRoot(opts);
  return (await run({ root, mode: 'write' })).errors;
}

describe('loadRouteModule', () => {
  it('loads the fixture module as source and exposes its exports', async () => {
    const root = makeModuleRoot();
    const mod = await loadRouteModule(root);
    assert.equal(mod.routePattern('task'), '/tasks/:id');
    assert.deepEqual(
      mod.LIVE_REDIRECT_ROUTES.map((r) => [r.from, r.target]),
      [['/old/:id', '/tasks/:id']],
    );
  });

  it('keeps the checked-in fixture routeMap.ts equal to the BASE_MAP used by the tests', async () => {
    const root = makeModuleRoot();
    writeFileSync(
      join(root, 'shared/src/routes/routeMap.ts'),
      readFileSync(join(FIXTURE_ROUTES_DIR, 'routeMap.ts'), 'utf8'),
    );
    const mod = await loadRouteModule(root);
    assert.deepEqual(clone(mod.ROUTE_MAP), BASE_MAP);
  });

  it('removes its temp directory after loading and after failing', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'build-routes-tmpdir-'));
    roots.push(sandbox);
    const good = makeModuleRoot();
    const bad = makeModuleRoot({
      files: { 'index.ts': "import x from 'node:fs'; export { x };" },
    });
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = sandbox;
    try {
      await loadRouteModule(good);
      assert.deepEqual(readdirSync(sandbox), []);
      await assert.rejects(loadRouteModule(bad));
      assert.deepEqual(readdirSync(sandbox), []);
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
  });

  it('rejects an external import', async () => {
    const root = makeModuleRoot({
      files: { 'routeUrl.ts': "import fs from 'node:fs';\nexport { fs };" },
    });
    await assert.rejects(
      loadRouteModule(root),
      /shared\/src\/routes\/routeUrl\.ts imports 'node:fs' — the route map must be self-contained/,
    );
  });

  it('rejects an external re-export and a parent-directory import', async () => {
    await assert.rejects(
      loadRouteModule(makeModuleRoot({ files: { 'index.ts': "export { x } from 'pkg';" } })),
      /imports 'pkg'/,
    );
    await assert.rejects(
      loadRouteModule(
        makeModuleRoot({ files: { 'types.ts': "import { y } from '../y.js'; export { y };" } }),
      ),
      /imports '\.\.\/y\.js'/,
    );
  });

  it('ignores test and declaration files', async () => {
    const root = makeModuleRoot({
      files: {
        'routeMap.test.ts': "import { it } from '@jest/globals'; it('x', () => {});",
        'extra.d.ts': "import 'somewhere';",
      },
    });
    const mod = await loadRouteModule(root);
    assert.equal(mod.ROUTE_MAP.length, BASE_MAP.length);
  });

  it('fails when the folder is missing', async () => {
    const root = makeModuleRoot({ map: null });
    await assert.rejects(loadRouteModule(root), /route module missing: .*shared\/src\/routes/);
  });

  it('fails when index.ts is missing', async () => {
    const root = makeModuleRoot();
    rmSync(join(root, 'shared/src/routes/index.ts'));
    await assert.rejects(loadRouteModule(root), /shared\/src\/routes\/index\.ts is missing/);
  });
});

describe('extractRouterRoutes with a route module', () => {
  let mod;
  let routes;
  before(async () => {
    mod = await loadRouteModule(makeModuleRoot());
    routes = extractRouterRoutesChecked(ROUTES_APP_SRC, mod).routes;
  });
  const find = (path) => routes.find((r) => r.path === path);

  it('resolves routePattern(id) paths through the module', () => {
    assert.deepEqual(routes.map((r) => r.path).sort(), [
      '/admin',
      '/old/:id',
      '/review',
      '/tasks',
      '/tasks/:id',
    ]);
  });

  it('reads RoleGuard allow={["admin"]} as the admin guard, and plain pages as member', () => {
    assert.equal(find('/admin').guard, 'admin');
    assert.equal(find('/tasks').guard, 'member');
  });

  it('marks pages under a RouteGate as gated, and others as not gated', () => {
    assert.equal(find('/review').gated, true);
    assert.equal(find('/tasks').gated, undefined);
  });

  it('expands LIVE_REDIRECT_ROUTES.map into redirect routes', () => {
    assert.deepEqual(find('/old/:id'), {
      path: '/old/:id',
      guard: 'member',
      kind: 'redirect',
      target: '/tasks/:id',
    });
  });

  it('keeps the member guard when a RoleGuard also allows members', () => {
    const src = `<Routes><Route element={<AuthGuard />}><Route element={<RoleGuard allow={['admin', 'member']} />}>
      <Route path="a" element={<A />} /></Route></Route></Routes>`;
    assert.equal(extractRouterRoutesChecked(src, mod).routes[0].guard, 'member');
  });

  it('reports a RoleGuard whose allow is not an array literal of strings', () => {
    for (const allow of ['{ROLES}', "{[ROLE, 'admin']}", '"admin"']) {
      const src = `<Routes><Route element={<RoleGuard allow=${allow} />}>
        <Route path="a" element={<A />} /></Route></Routes>`;
      const { errors } = extractRouterRoutesChecked(src, mod);
      assert.deepEqual(errors, ['App.tsx:1: RoleGuard allow must be an array literal of strings']);
    }
  });

  it('reports an unknown route id once, without a second unreadable-path error', () => {
    const src = `<Routes><Route path={routePattern('nope')} element={<A />} /></Routes>`;
    const { errors, routes: out } = extractRouterRoutesChecked(src, mod);
    assert.deepEqual(errors, ["App.tsx:1: unknown route id 'nope'"]);
    assert.deepEqual(out, []);
  });

  it('reports routePattern calls it cannot read statically', () => {
    for (const call of [
      'routePattern(id)',
      'routePattern()',
      "routePattern('a', 'b')",
      "other('tasks')",
    ]) {
      const src = `<Routes><Route path={${call}} element={<A />} /></Routes>`;
      assert.deepEqual(extractRouterRoutesChecked(src, mod).errors, [
        'App.tsx:1: unreadable route path',
      ]);
    }
  });

  it('reports routePattern when no route module is loaded', () => {
    const src = `<Routes><Route path={routePattern('tasks')} element={<A />} /></Routes>`;
    assert.deepEqual(extractRouterRoutesChecked(src).errors, ['App.tsx:1: unreadable route path']);
  });

  it('reports a generator whose callback does not render a RouteRedirect route', () => {
    const shapes = [
      '(r) => <Route path={r.from} element={<div />} />',
      '(r) => <div />',
      '(r) => { return <Route path={r.from} element={<Other />} />; }',
      '(r) => { log(r); }',
      'makeRoutes',
      '(r) => <Route path={r.from} />',
    ];
    for (const shape of shapes) {
      const src = `<Routes><Route element={<AuthGuard />}>{LIVE_REDIRECT_ROUTES.map(${shape})}</Route></Routes>`;
      assert.deepEqual(extractRouterRoutesChecked(src, mod).errors, [GENERATOR_ERROR], shape);
    }
  });

  it('rejects a generator whose Route path is not the item from', () => {
    const wrongPaths = ['{r.path}', '{r.target}', '{r}', '"/fixed"', '{other.from}', '{r.from.x}'];
    for (const path of wrongPaths) {
      const src = `<Routes>{LIVE_REDIRECT_ROUTES.map((r) => <Route path=${path} element={<RouteRedirect rule={r} />} />)}</Routes>`;
      assert.deepEqual(extractRouterRoutesChecked(src, mod).errors, [GENERATOR_ERROR], path);
    }
  });

  it('rejects a generator whose RouteRedirect rule is not the item', () => {
    const wrongRules = ['{r.target}', '{other}', '{{ ...r }}', '"r"'];
    for (const rule of wrongRules) {
      const src = `<Routes>{LIVE_REDIRECT_ROUTES.map((r) => <Route path={r.from} element={<RouteRedirect rule=${rule} />} />)}</Routes>`;
      assert.deepEqual(extractRouterRoutesChecked(src, mod).errors, [GENERATOR_ERROR], rule);
    }
  });

  it('rejects a generator whose callback parameter is destructured or missing', () => {
    for (const callback of [
      '({ from }) => <Route path={from} element={<RouteRedirect rule={from} />} />',
      '() => <Route path={r.from} element={<RouteRedirect rule={r} />} />',
    ]) {
      const src = `<Routes>{LIVE_REDIRECT_ROUTES.map(${callback})}</Routes>`;
      assert.deepEqual(extractRouterRoutesChecked(src, mod).errors, [GENERATOR_ERROR], callback);
    }
  });

  it('follows a renamed callback parameter', () => {
    const src = `<Routes>{LIVE_REDIRECT_ROUTES.map((item) => <Route path={item.from} element={<RouteRedirect rule={item} />} />)}</Routes>`;
    const out = extractRouterRoutesChecked(src, mod);
    assert.deepEqual(out.errors, []);
    assert.equal(out.routes.length, 1);
  });

  it('accepts block-bodied and parenthesised generator callbacks', () => {
    const src = `<Routes>{LIVE_REDIRECT_ROUTES.map(function (r) {
      return (<Route path={r.from} element={(<RouteRedirect rule={r} />)} />);
    })}</Routes>`;
    const out = extractRouterRoutesChecked(src, mod);
    assert.deepEqual(out.errors, []);
    assert.equal(out.routes.length, 1);
  });

  it('reports a generator when no route module is loaded', () => {
    const src = `<Routes>{LIVE_REDIRECT_ROUTES.map((r) => <Route path={r.from} element={<RouteRedirect rule={r} />} />)}</Routes>`;
    assert.deepEqual(extractRouterRoutesChecked(src).errors, [
      'App.tsx:1: unrecognised route generator (route module not loaded)',
    ]);
  });

  it('ignores other .map() expressions among the route children', () => {
    const src = `<Routes>{OTHER.map((r) => <Route path={r} element={<A />} />)}</Routes>`;
    assert.deepEqual(extractRouterRoutesChecked(src, mod), { routes: [], errors: [] });
  });
});

describe('validateRouteMap against the shared route module', () => {
  it('accepts the consistent fixture module, router and routemap.json', async () => {
    assert.deepEqual(await errorsOf(), []);
  });

  it('exports the agreement fields', () => {
    assert.deepEqual(AGREEMENT_FIELDS, [
      'to',
      'kind',
      'change',
      'section',
      'guard',
      'gate',
      'permanent',
      'carries',
    ]);
  });

  describe('agreement between routemap.json and the shared map', () => {
    const DIFFS = {
      to: '/elsewhere',
      kind: 'redirect',
      change: 'moved',
      section: 'Other',
      guard: 'public',
      gate: 'paperless',
      permanent: true,
      carries: ['q'],
    };
    for (const field of AGREEMENT_FIELDS) {
      it(`reports drift in ${field}`, async () => {
        const routemap = curated(mutate(BASE_MAP, '/tasks', { [field]: DIFFS[field] }));
        const errors = await errorsOf({ routemap });
        assert.ok(
          errors.some((e) => e.startsWith(`route map drift: /tasks ${field} differs (shared: `)),
          errors.join('\n'),
        );
      });
    }

    it('shows both values in the drift message', async () => {
      const routemap = curated(mutate(BASE_MAP, '/tasks', { carries: ['q'] }));
      const errors = await errorsOf({ routemap });
      assert.ok(
        errors.includes(
          'route map drift: /tasks carries differs (shared: [], routemap.json: ["q"])',
        ),
        errors.join('\n'),
      );
    });

    it('reports an entry missing from routemap.json', async () => {
      const routemap = curated(BASE_MAP.filter((e) => e.from !== '/admin'));
      const errors = await errorsOf({ routemap });
      assert.ok(errors.includes('route map drift: /admin is missing in routemap.json'));
    });

    it('reports an entry missing from the shared map', async () => {
      const map = BASE_MAP.filter((e) => e.from !== '/admin');
      const errors = await errorsOf({ map, routemap: curated(BASE_MAP) });
      assert.ok(errors.includes('route map drift: /admin is missing in the shared route map'));
    });

    it('reports a different entry order', async () => {
      const routemap = curated([...BASE_MAP].reverse());
      const errors = await errorsOf({ routemap });
      assert.ok(
        errors.includes(
          'route map drift: the shared route map and routemap.json list entries in a different order',
        ),
      );
    });

    it('does not report an order error when entries are missing', async () => {
      const routemap = curated(BASE_MAP.slice(1));
      const errors = await errorsOf({ routemap });
      assert.ok(!errors.some((e) => e.includes('different order')));
    });
  });

  describe('structure of the shared map', () => {
    const cases = [
      [
        'an unknown stage',
        () => mutate(BASE_MAP, '/tasks', { stage: 'maybe' }),
        'shared route /tasks: stage must be one of done, interim, planned',
      ],
      [
        'interim on a non-interim entry',
        () => mutate(BASE_MAP, '/tasks', { interim: 'page' }),
        'shared route /tasks: interim is only valid on interim entries',
      ],
      [
        'an interim entry without an interim form',
        () => mutate(BASE_MAP, '/tasks', { stage: 'interim' }),
        'shared route /tasks: interim entries need an interim form',
      ],
      [
        'a duplicate id',
        () => mutate(BASE_MAP, '/admin', { id: 'tasks' }),
        'shared route id tasks is duplicated',
      ],
      [
        'a parent that is not an id',
        () => mutate(BASE_MAP, '/tasks/:id', { parent: 'ghost' }),
        "shared route /tasks/:id: parent 'ghost' is not a route id",
      ],
      [
        'an appliesTo that is not an id',
        () =>
          mutate(BASE_MAP, '/review (Paperless off)', {
            match: { condition: 'paperless-off', appliesTo: ['ghost'] },
          }),
        "shared route /review (Paperless off): appliesTo 'ghost' is not a route id",
      ],
    ];
    for (const [name, build, expected] of cases) {
      it(`reports ${name}`, async () => {
        const map = build();
        const errors = await errorsOf({ map, routemap: curated(map) });
        assert.ok(errors.includes(expected), errors.join('\n'));
      });
    }

    it('reports a ROUTE_MAP that is not an array', async () => {
      const root = makeModuleRoot({
        files: {
          'index.ts':
            'export const ROUTE_MAP = {};\nexport const routePattern = (id: string) => `/${id}`;\nexport const effectiveTarget = () => null;\nexport const LIVE_REDIRECT_ROUTES = [];',
          'routeUrl.ts': '',
          'redirects.ts': '',
        },
      });
      const { errors } = await run({ root, mode: 'write' });
      assert.ok(errors.includes('shared route map: ROUTE_MAP must be an array'), errors.join('\n'));
    });
  });

  describe('served and planned entries', () => {
    it('reports a planned entry the router serves', async () => {
      const map = mutate(BASE_MAP, '/review', { stage: 'planned' });
      const errors = await errorsOf({ map });
      assert.ok(
        errors.includes('planned route /review is served by the router'),
        errors.join('\n'),
      );
    });

    it('accepts a planned entry the router does not serve', async () => {
      const planned = {
        id: 'later',
        from: '/later',
        to: '/later',
        kind: 'page',
        change: 'new',
        section: 'Tasks',
        guard: 'member',
        gate: 'none',
        permanent: false,
        carries: [],
        stage: 'planned',
      };
      assert.deepEqual(await errorsOf({ map: [...BASE_MAP, planned] }), []);
    });

    it('reports a served entry the router does not serve', async () => {
      const ghost = { ...BASE_MAP[0], id: 'ghost', from: '/ghost', to: '/ghost' };
      const errors = await errorsOf({ map: [...BASE_MAP, ghost] });
      assert.ok(
        errors.includes('route-map entry /ghost is not served by the router'),
        errors.join('\n'),
      );
    });

    it('does not require conditional entries to be served', async () => {
      const errors = await errorsOf();
      assert.ok(!errors.some((e) => e.includes('(Paperless off)')));
    });

    it('reports a redirect whose target differs from the effective target', async () => {
      const app = ROUTES_APP_SRC.replace(
        GENERATOR_BLOCK,
        '<Route path="/old/:id" element={<ParamRedirect to="/wrong/:id" />} />',
      );
      const errors = await errorsOf({ app });
      assert.ok(
        errors.includes(
          'route /old/:id must redirect to /tasks/:id, the router serves a redirect to /wrong/:id',
        ),
        errors.join('\n'),
      );
    });

    it('reports a redirect the router serves as a page', async () => {
      const app = ROUTES_APP_SRC.replace(
        GENERATOR_BLOCK,
        '<Route path="/old/:id" element={<OldPage />} />',
      );
      const errors = await errorsOf({ app });
      assert.ok(
        errors.includes('route /old/:id must redirect to /tasks/:id, the router serves a page'),
        errors.join('\n'),
      );
    });

    it('reports a page the router serves as a redirect', async () => {
      const app = ROUTES_APP_SRC.replace(
        "<Route path={routePattern('tasks')} element={<TasksPage />} />",
        '<Route path={routePattern(\'tasks\')} element={<Navigate to="/elsewhere" />} />',
      );
      const errors = await errorsOf({ app });
      assert.ok(
        errors.includes(
          'route /tasks must be served as a page, the router redirects it to /elsewhere',
        ),
        errors.join('\n'),
      );
    });

    it('accepts an interim redirect and an interim page', async () => {
      const map = [
        { ...BASE_MAP[0], stage: 'interim', interim: 'page' },
        ...BASE_MAP.slice(1, 4),
        { ...BASE_MAP[4], stage: 'interim', interim: '/tasks/:id', to: '/final/:id' },
        BASE_MAP[5],
      ];
      assert.deepEqual(await errorsOf({ map }), []);
    });
  });

  describe('live query maps', () => {
    const queryMap = (from) => ({
      from: `${from}?view=calendar`,
      to: '/tasks',
      kind: 'redirect',
      change: 'query-map',
      section: 'Tasks',
      guard: 'member',
      gate: 'none',
      permanent: false,
      carries: ['*'],
      stage: 'done',
      match: { query: { view: 'calendar' } },
    });

    it('accepts a live query map whose base path is served as a page', async () => {
      assert.deepEqual(await errorsOf({ map: [...BASE_MAP, queryMap('/tasks')] }), []);
    });

    it('accepts a live query map whose base path is served as a redirect', async () => {
      assert.deepEqual(await errorsOf({ map: [...BASE_MAP, queryMap('/old/:id')] }), []);
    });

    it('reports a live query map whose base path is not served', async () => {
      const errors = await errorsOf({ map: [...BASE_MAP, queryMap('/nowhere')] });
      assert.ok(
        errors.includes('live query map /nowhere?view=calendar has no served base path'),
        errors.join('\n'),
      );
    });

    it('ignores a planned query map with an unserved base path', async () => {
      const planned = { ...queryMap('/nowhere'), stage: 'planned' };
      assert.deepEqual(await errorsOf({ map: [...BASE_MAP, planned] }), []);
    });
  });

  describe('guards and gates', () => {
    it('reports an admin entry the router guards as member', async () => {
      const app = ROUTES_APP_SRC.replace(ADMIN_GUARD_BLOCK, '$1');
      const errors = await errorsOf({ app });
      assert.ok(
        errors.includes('route /admin guard differs (router: member, route map: admin)'),
        errors.join('\n'),
      );
    });

    it('reports a member entry the router guards as admin', async () => {
      const map = mutate(BASE_MAP, '/admin', { guard: 'member' });
      const errors = await errorsOf({ map });
      assert.ok(
        errors.includes('route /admin guard differs (router: admin, route map: member)'),
        errors.join('\n'),
      );
    });

    it('reports a live gate rule on a page that is not wrapped in RouteGate', async () => {
      const app = ROUTES_APP_SRC.replace('<RouteGate rules={[]} />', '<Fragment />');
      const errors = await errorsOf({ app });
      assert.ok(
        errors.includes(
          'route /review has a live paperless-off rule but is not wrapped in RouteGate',
        ),
        errors.join('\n'),
      );
    });

    it('checks a live not-admin rule against the router guard', async () => {
      const rule = {
        from: '/admin (member)',
        to: '/admin',
        kind: 'redirect',
        change: 'conditional',
        section: 'System',
        guard: 'admin',
        gate: 'none',
        permanent: false,
        carries: ['*'],
        stage: 'done',
        match: { condition: 'not-admin', appliesTo: ['admin'] },
      };
      const map = [...BASE_MAP, rule];
      assert.deepEqual(await errorsOf({ map }), []);
      const app = ROUTES_APP_SRC.replace(ADMIN_GUARD_BLOCK, '$1');
      const errors = await errorsOf({ map, app });
      assert.ok(
        errors.some((e) => e.includes('admin-only in the route map')),
        errors.join('\n'),
      );
    });

    it('ignores planned conditional rules', async () => {
      const map = mutate(BASE_MAP, '/review (Paperless off)', { stage: 'planned' });
      const app = ROUTES_APP_SRC.replace('<RouteGate rules={[]} />', '<Fragment />');
      assert.deepEqual(await errorsOf({ map, app }), []);
    });
  });

  it('keeps the old behaviour (no stage checks) when no module is passed', () => {
    const map = FIXTURE_MAP.map((e) => ({ ...e }));
    assert.deepEqual(validateRouteMap(map, fixtureRoutes()), []);
  });
});

describe('run with the route module', () => {
  it('reports a missing route module by path and still checks the rest', async () => {
    const root = makeRoot({ module: null });
    const res = await run({ root, mode: 'write' });
    assert.ok(res.errors.some((e) => /^route module missing: .*shared\/src\/routes$/.test(e)));
  });

  it('reports a route module with an external import', async () => {
    const root = makeModuleRoot({ files: { 'index.ts': "import 'node:fs';" } });
    const res = await run({ root, mode: 'write' });
    assert.ok(
      res.errors.some((e) =>
        e.includes("imports 'node:fs' — the route map must be self-contained"),
      ),
      res.errors.join('\n'),
    );
  });

  it('passes in check mode after write for the module-based fixture', async () => {
    const root = makeModuleRoot();
    await run({ root, mode: 'write' });
    const res = await run({ root, mode: 'check' });
    assert.deepEqual(res.errors, []);
  });

  it('lists generator-expanded redirects in router-routes.json', async () => {
    const root = makeModuleRoot();
    await run({ root, mode: 'write' });
    const json = JSON.parse(
      readFileSync(join(root, 'plan/restructure/router-routes.json'), 'utf8'),
    );
    const old = json.routes.find((r) => r.path === '/old/:id');
    assert.equal(old.kind, 'redirect');
    assert.equal(old.target, '/tasks/:id');
    assert.ok(existsSync(join(root, 'shared/src/routes/index.ts')));
  });
});
