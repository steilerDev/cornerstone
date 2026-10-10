import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFECT_ID, run } from './check-defects.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Temp repo root with the given files (path -> content) and registry object or raw text. */
function makeRoot(registry, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-defects-'));
  roots.push(root);
  mkdirSync(join(root, 'plan/restructure'), { recursive: true });
  if (registry !== undefined) {
    const text = typeof registry === 'string' ? registry : JSON.stringify(registry);
    writeFileSync(join(root, 'plan/restructure/defects.json'), text);
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const TEST = 'client/src/a.test.ts';

/** Later-story entries D-<from>..D-<to>, to keep the id range contiguous. */
const fillers = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    id: `D-${String(from + i).padStart(2, '0')}`,
    story: '4.6',
  }));

describe('check-defects run()', () => {
  it('passes when every listed file exists and names its id, and reports the counts', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-01', story: 10, tests: [TEST, 'e2e/tests/a.spec.ts'] },
          { id: 'D-02', story: 11, tests: [TEST] },
        ],
        later: [{ id: 'D-03', story: '4.6' }],
      },
      {
        [TEST]: "it('D-01: x', () => {}); it('D-02 y', () => {});",
        'e2e/tests/a.spec.ts': "test('[D-01] z', () => {});",
      },
    );
    const part = await run({ root });
    assert.equal(part.name, 'defects');
    assert.deepEqual(part.errors, []);
    assert.deepEqual(part.notes, ['defects: 2 Phase-0 ids, 2 test files']);
  });

  it('accepts the mode argument without changing the result', async () => {
    const root = makeRoot(
      { defects: [{ id: 'D-01', story: 1, tests: [TEST] }] },
      { [TEST]: 'D-01' },
    );
    assert.deepEqual((await run({ root, mode: 'write' })).errors, []);
  });

  it('reports a missing registry by file name', async () => {
    const part = await run({ root: makeRoot(undefined) });
    assert.deepEqual(part.errors, ['plan/restructure/defects.json is missing']);
  });

  it('reports invalid JSON by file name', async () => {
    const part = await run({ root: makeRoot('{ nope') });
    assert.equal(part.errors.length, 1);
    assert.match(part.errors[0], /^plan\/restructure\/defects\.json is not valid JSON/);
  });

  it('requires "defects" to be an array', async () => {
    const part = await run({ root: makeRoot({ later: [] }) });
    assert.deepEqual(part.errors, ['plan/restructure/defects.json: "defects" must be an array']);
  });

  it('tolerates a registry without a "later" list', async () => {
    const root = makeRoot(
      { defects: [{ id: 'D-01', story: 1, tests: [TEST] }] },
      { [TEST]: 'D-01' },
    );
    assert.deepEqual((await run({ root })).errors, []);
  });

  it('rejects an invalid defect id', async () => {
    const root = makeRoot({
      defects: [
        { id: 'D-1', story: 1, tests: [TEST] },
        { id: 7, story: 1, tests: [TEST] },
      ],
    });
    const part = await run({ root });
    assert.equal(part.errors.length, 2);
    assert.match(part.errors[0], /invalid defect id "D-1"/);
    assert.match(part.errors[1], /invalid defect id 7/);
  });

  it('rejects an id listed twice, also across defects and later', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-01', story: 1, tests: [TEST] },
          { id: 'D-01', story: 1, tests: [TEST] },
        ],
        later: [{ id: 'D-01', story: '4.6' }],
      },
      { [TEST]: 'D-01' },
    );
    const part = await run({ root });
    assert.deepEqual(part.errors, ['D-01: listed more than once', 'D-01: listed more than once']);
  });

  it('requires a positive integer story', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-01', story: 0, tests: [TEST] },
          { id: 'D-02', story: '12', tests: [TEST] },
        ],
      },
      { [TEST]: 'D-01 D-02' },
    );
    assert.deepEqual((await run({ root })).errors, [
      'D-01: story must be a positive integer',
      'D-02: story must be a positive integer',
    ]);
  });

  it('rejects empty or missing tests', async () => {
    const root = makeRoot({
      defects: [
        { id: 'D-01', story: 1, tests: [] },
        { id: 'D-02', story: 1 },
      ],
    });
    assert.deepEqual((await run({ root })).errors, [
      'D-01: tests must be a non-empty array of test file paths',
      'D-02: tests must be a non-empty array of test file paths',
    ]);
  });

  it('rejects parent-directory, absolute and non-string paths', async () => {
    const root = makeRoot({
      defects: [
        { id: 'D-01', story: 1, tests: ['../x.test.ts', '/etc/x.test.ts', 'a/../b.test.ts', 5] },
      ],
    });
    const part = await run({ root });
    assert.equal(part.errors.length, 4);
    for (const e of part.errors) assert.match(e, /^D-01: .* is not a repo-relative path$/);
  });

  it('rejects a listed file that is not a test file', async () => {
    const root = makeRoot(
      { defects: [{ id: 'D-01', story: 1, tests: ['client/src/a.ts'] }] },
      { 'client/src/a.ts': 'D-01' },
    );
    assert.match((await run({ root })).errors[0], /^D-01: client\/src\/a\.ts is not a test file/);
  });

  it('rejects a listed file that does not exist', async () => {
    const root = makeRoot({ defects: [{ id: 'D-01', story: 1, tests: [TEST] }] });
    assert.deepEqual((await run({ root })).errors, [`D-01: ${TEST} does not exist`]);
  });

  it('rejects a listed file that does not contain the id', async () => {
    const root = makeRoot(
      { defects: [{ id: 'D-01', story: 1, tests: [TEST] }] },
      { [TEST]: "it('no tag', () => {});" },
    );
    assert.deepEqual((await run({ root })).errors, [`D-01: ${TEST} does not name D-01`]);
  });

  it('matches the id as a whole token: D-1 never matches D-10, D-01 never D-011', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-10', story: 1, tests: ['a.test.ts'] },
          { id: 'D-01', story: 1, tests: ['b.test.ts'] },
          { id: 'D-02', story: 1, tests: ['c.test.ts'] },
        ],
        later: fillers(3, 9),
      },
      {
        'a.test.ts': "it('D-1 only', () => {}); it('xD-10', () => {});",
        'b.test.ts': "it('D-011 only', () => {});",
        'c.test.ts': "it('[D-02]', () => {});",
      },
    );
    assert.deepEqual((await run({ root })).errors, [
      'D-10: a.test.ts does not name D-10',
      'D-01: b.test.ts does not name D-01',
    ]);
  });

  it('matches an id at the very start of a file, but not one glued to a hyphen prefix', async () => {
    const root = makeRoot(
      {
        defects: [{ id: 'D-03', story: 1, tests: ['a.test.ts', 'b.test.ts'] }],
        later: fillers(1, 2),
      },
      { 'a.test.ts': 'D-03: starts the file\n', 'b.test.ts': "it('X-D-03', () => {});" },
    );
    assert.deepEqual((await run({ root })).errors, ['D-03: b.test.ts does not name D-03']);
  });

  it('counts a file shared by several ids once', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-01', story: 1, tests: [TEST] },
          { id: 'D-02', story: 1, tests: [TEST] },
        ],
      },
      { [TEST]: 'D-01 D-02' },
    );
    assert.deepEqual((await run({ root })).notes, ['defects: 2 Phase-0 ids, 1 test files']);
  });

  it('fails when a middle id is missing and names it', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-01', story: 1, tests: [TEST] },
          { id: 'D-03', story: 1, tests: [TEST] },
        ],
      },
      { [TEST]: 'D-01 D-03' },
    );
    assert.deepEqual((await run({ root })).errors, [
      'plan/restructure/defects.json: ids must cover D-01 to D-03 without gaps; missing D-02',
    ]);
  });

  it('passes when the gap is filled by a later-story id', async () => {
    const root = makeRoot(
      {
        defects: [
          { id: 'D-01', story: 1, tests: [TEST] },
          { id: 'D-03', story: 1, tests: [TEST] },
        ],
        later: [{ id: 'D-02', story: '4.6' }],
      },
      { [TEST]: 'D-01 D-03' },
    );
    assert.deepEqual((await run({ root })).errors, []);
  });

  it('names every missing id', async () => {
    const root = makeRoot(
      { defects: [{ id: 'D-05', story: 1, tests: [TEST] }], later: [{ id: 'D-02', story: '4.6' }] },
      { [TEST]: 'D-05' },
    );
    assert.deepEqual((await run({ root })).errors, [
      'plan/restructure/defects.json: ids must cover D-01 to D-05 without gaps; missing D-01, D-03, D-04',
    ]);
  });

  it('exports the id pattern', () => {
    assert.ok(DEFECT_ID.test('D-38'));
    assert.ok(!DEFECT_ID.test('D-380'));
  });
});

describe('check-defects CLI', () => {
  it('prints notes and exits 0 or 1 consistently with the findings', () => {
    const r = spawnSync(process.execPath, [join(HERE, 'check-defects.mjs')], { encoding: 'utf8' });
    assert.match(r.stdout, /defects: \d+ Phase-0 ids, \d+ test files/);
    assert.ok([0, 1].includes(r.status));
    assert.equal(r.status === 1, /ERROR /.test(r.stdout));
    if (r.status === 0) assert.match(r.stdout, /ok/);
  });
});
