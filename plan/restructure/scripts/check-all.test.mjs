import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runAll } from './check-all.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-all.mjs');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const REDIRECT_TARGETS = {
  '/budget': '/budget/overview',
  '/legacy/:id': '/tasks/:id',
  '/old-login': '/login',
};

const routemap = [
  ['*', 'public'],
  ['/', 'member'],
  ['/budget', 'member', 'redirect'],
  ['/budget/items/:itemId', 'member'],
  ['/budget/overview', 'member'],
  ['/legacy/:id', 'member', 'redirect'],
  ['/login', 'public'],
  ['/old-login', 'public', 'redirect'],
  ['/tasks', 'member'],
].map(([from, guard, kind = 'page']) => ({
  from,
  kind,
  stage: 'done',
  change: 'kept',
  guard,
  gate: 'none',
  permanent: false,
  carries: [],
  section: 'Section',
  to: REDIRECT_TARGETS[from] ?? '/target',
  note: 'A note',
}));

const inventory = [{ id: 'CAP-A', domain: 'tasks', frequency: 'daily' }];
const capmap = {
  'CAP-A': { name: 'Name', from: 'Old', to: 'Tasks > List (/tasks)', change: 'same', gate: 'none' },
};

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'check-all-'));
  roots.push(root);
  const dir = join(root, 'plan/restructure');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'client/src/pages/HomePage'), { recursive: true });
  copyFileSync(join(HERE, '__fixtures__/App.fixture.tsx'), join(root, 'client/src/App.tsx'));
  writeFileSync(
    join(root, 'client/src/pages/HomePage/HomePage.tsx'),
    'export const HomePage = () => null;',
  );
  writeFileSync(join(dir, 'routemap.json'), JSON.stringify(routemap));
  // Synthetic shared route module that agrees with the route map above.
  const routesDir = join(root, 'shared/src/routes');
  mkdirSync(routesDir, { recursive: true });
  for (const file of readdirSync(join(HERE, '__fixtures__/routes'))) {
    copyFileSync(join(HERE, '__fixtures__/routes', file), join(routesDir, file));
  }
  writeFileSync(
    join(routesDir, 'routeMap.ts'),
    `export const ROUTE_MAP = ${JSON.stringify(routemap)};\n`,
  );
  writeFileSync(join(dir, 'capabilities.json'), JSON.stringify(inventory));
  writeFileSync(join(dir, 'capmap.json'), JSON.stringify(capmap));
  writeFileSync(join(dir, 'defects.json'), JSON.stringify({ defects: [], later: [] }));
  return root;
}

const byName = (parts) => Object.fromEntries(parts.map((p) => [p.name, p]));

describe('runAll', () => {
  it('runs the five parts in order', async () => {
    const root = makeRoot();
    const parts = await runAll({ root, mode: 'write' });
    assert.deepEqual(
      parts.map((p) => p.name),
      ['route map', 'capability map', 'pattern baseline', 'defects', 'privacy'],
    );
  });

  it('passes on consistent data after write and again in check mode', async () => {
    const root = makeRoot();
    const written = await runAll({ root, mode: 'write' });
    assert.deepEqual(
      written.flatMap((p) => p.errors),
      [],
    );
    const checked = await runAll({ root });
    assert.deepEqual(
      checked.flatMap((p) => p.errors),
      [],
    );
  });

  it('check mode reports every generated file as stale before the first write', async () => {
    const root = makeRoot();
    const parts = byName(await runAll({ root, mode: 'check' }));
    assert.deepEqual(parts['route map'].errors, [
      'router-routes.json is stale — run npm run plan:build',
    ]);
    assert.deepEqual(parts['capability map'].errors, [
      'summary.json is stale — run npm run plan:build',
    ]);
    assert.match(parts['pattern baseline'].errors[0], /input missing: .*baseline\.json/);
    assert.deepEqual(parts.defects.errors, []);
    assert.deepEqual(parts.privacy.errors, []);
  });

  it('one failing part does not stop the others from running', async () => {
    const root = makeRoot();
    await runAll({ root, mode: 'write' });
    const bad = capmap['CAP-A'];
    writeFileSync(
      join(root, 'plan/restructure/capmap.json'),
      JSON.stringify({ 'CAP-A': { ...bad, to: '' } }),
    );
    writeFileSync(join(root, 'plan/restructure/notes.md'), 'call +49 30 1234567\n');
    const parts = byName(await runAll({ root }));
    assert.deepEqual(parts['capability map'].errors, ['capability CAP-A has no placement']);
    assert.deepEqual(parts['route map'].errors, []);
    assert.deepEqual(parts['pattern baseline'].errors, []);
    assert.equal(parts.privacy.errors.length, 2);
    assert.match(parts.privacy.errors[0], /notes\.md:1:6 phone \+\*+/);
    assert.match(parts.privacy.errors[1], /personal data found/);
  });

  it('turns an unexpected exception in a part into an error naming the part', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'plan/restructure/capmap.json'), '{ not json');
    const parts = byName(await runAll({ root }));
    assert.equal(parts['capability map'].errors.length, 1);
    assert.match(parts['capability map'].errors[0], /^capability map failed unexpectedly: /);
    assert.equal(parts['route map'].name, 'route map', 'other parts still ran');
  });

  it('reports missing inputs by file name instead of crashing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-all-empty-'));
    roots.push(root);
    mkdirSync(join(root, 'plan/restructure'), { recursive: true });
    const parts = byName(await runAll({ root }));
    assert.match(parts['route map'].errors[0], /input missing: .*App\.tsx/);
    assert.equal(parts['capability map'].errors.length, 3);
    assert.match(parts['pattern baseline'].errors[0], /input missing: .*client\/src/);
    assert.deepEqual(parts.defects.errors, ['plan/restructure/defects.json is missing']);
    assert.deepEqual(parts.privacy.errors, []);
  });

  it('the defects part fails on its own when a listed test does not name its defect id', async () => {
    const root = makeRoot();
    await runAll({ root, mode: 'write' });
    mkdirSync(join(root, 'client/src'), { recursive: true });
    writeFileSync(join(root, 'client/src/a.test.ts'), "it('covers nothing', () => {});\n");
    writeFileSync(
      join(root, 'plan/restructure/defects.json'),
      JSON.stringify({ defects: [{ id: 'D-01', story: 1, tests: ['client/src/a.test.ts'] }] }),
    );
    const parts = byName(await runAll({ root }));
    assert.deepEqual(parts.defects.errors, ['D-01: client/src/a.test.ts does not name D-01']);
    assert.deepEqual(parts['route map'].errors, []);
    assert.deepEqual(parts['capability map'].errors, []);
  });

  it('privacy uses the full profile (money amounts fail)', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'plan/restructure/notes.txt'), 'cost 5 EUR\n');
    const parts = byName(await runAll({ root }));
    assert.match(parts.privacy.errors[0], /notes\.txt:1:\d+ money/);
  });

  it('privacy skips *.test.mjs files under plan/restructure', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'plan/restructure/x.test.mjs'), 'cost 5 EUR +49 30 1234567\n');
    const parts = byName(await runAll({ root }));
    assert.deepEqual(parts.privacy.errors, []);
  });
});

describe('CLI', () => {
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  it('exits 2 on an unknown argument', () => {
    const r = cli('--nope');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown argument --nope/);
  });

  it('prints one section per part and exits 0 or 1 consistently with the summary line', () => {
    // Check mode only: reads whatever plan data exists, writes nothing. Asserts structure,
    // not the content of the real plan files.
    const r = cli('--check');
    for (const name of ['route map', 'capability map', 'pattern baseline', 'defects', 'privacy']) {
      assert.ok(r.stdout.includes(`== ${name} ==`), name);
    }
    assert.ok([0, 1].includes(r.status));
    assert.ok(r.stdout.includes(r.status === 0 ? 'plan:check passed' : 'plan:check failed'));
    assert.equal(r.status === 1, /ERROR /.test(r.stdout));
  });
});
