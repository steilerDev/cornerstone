import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  clicksFromPath,
  destinationSection,
  pathsInTo,
  pathsMatch,
  run,
  summarize,
  validateCapmap,
} from './build-capmap.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'build-capmap.mjs');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const routemap = [
  { from: '/tasks', kind: 'page', change: 'kept', section: 'Tasks', permanent: true },
  { from: '/tasks/:id', kind: 'page', change: 'kept', section: 'Tasks', permanent: false },
  {
    from: '/old',
    kind: 'redirect',
    change: 'redirect',
    section: 'Tasks',
    permanent: true,
    to: '/tasks',
  },
  {
    from: '/budget?tab=a, /money',
    kind: 'page',
    change: 'moved',
    section: 'Budget',
    permanent: false,
  },
];

const inventory = [
  { id: 'CAP-A', domain: 'tasks', frequency: 'daily' },
  { id: 'CAP-B', domain: 'tasks', frequency: 'weekly' },
  { id: 'CAP-C', domain: 'budget', frequency: 'rare' },
];

function placement(over = {}) {
  return {
    name: 'Name',
    from: 'Old place',
    to: 'Tasks > List (/tasks)',
    change: 'same',
    gate: 'none',
    ...over,
  };
}
const goodCapmap = () => ({
  'CAP-A': placement(),
  'CAP-B': placement({ to: 'Settings > Tools', change: 'moved', gate: 'ai' }),
  'CAP-C': placement({
    to: 'Budget > Overview (/budget)',
    change: 'demoted',
    clicks: 2,
    clickPath: 'Home > Budget (1) > Overview (2)',
  }),
});
const validate = (capmap, inv = inventory, rm = routemap) =>
  validateCapmap({ inventory: inv, capmap, routemap: rm });

describe('clicksFromPath', () => {
  it('takes the highest step marker of a single path', () => {
    assert.equal(clicksFromPath('A (1) > B (2)'), 2);
  });
  it('returns the minimum over ";"-separated alternatives', () => {
    assert.equal(clicksFromPath('A (1) > B (2) > C (3); Search (1)'), 1);
    assert.equal(clicksFromPath('A (1); B (1) > C (2)'), 1);
  });
  it('counts an alternative without markers as zero clicks', () => {
    assert.equal(clicksFromPath('Always visible; A (1)'), 0);
  });
});

describe('pathsInTo and pathsMatch', () => {
  it('extracts parenthesised app paths and trims punctuation, query and hash', () => {
    assert.deepEqual(pathsInTo('X (/a/b), Y (/c/:id:) and Z (/d?x=1) W (/e#f.)'), [
      '/a/b',
      '/c/:id',
      '/d',
      '/e',
    ]);
  });
  it('ignores parentheses that are not paths', () => {
    assert.deepEqual(pathsInTo('Tasks (daily) > list'), []);
  });
  it('matches segment-wise and treats :param as a wildcard in either direction', () => {
    assert.ok(pathsMatch('/tasks/42', '/tasks/:id'));
    assert.ok(pathsMatch('/tasks/:id', '/tasks/42'));
    assert.ok(!pathsMatch('/tasks/42', '/tasks'));
    assert.ok(!pathsMatch('/tasks/a', '/budget/a'));
  });
  it('destinationSection returns the text before the first " > "', () => {
    assert.equal(destinationSection('Settings > Tools > X'), 'Settings');
    assert.equal(destinationSection('Alone'), 'Alone');
  });
});

describe('validateCapmap', () => {
  it('accepts a valid map', () => {
    assert.deepEqual(validate(goodCapmap()), []);
  });

  it('rejects non-array inventory and non-object capmap', () => {
    assert.deepEqual(validate({}, {}), ['capabilities.json must be an array']);
    assert.deepEqual(validate([]), ['capmap.json must be an object keyed by capability id']);
    assert.deepEqual(validate(null), ['capmap.json must be an object keyed by capability id']);
  });

  it('reports an inventory id missing from the capmap', () => {
    const cm = goodCapmap();
    delete cm['CAP-A'];
    assert.deepEqual(validate(cm), ['capability CAP-A has no placement']);
  });

  it('reports a capmap key missing from the inventory', () => {
    const cm = { ...goodCapmap(), 'CAP-X': placement() };
    assert.deepEqual(validate(cm), ['capmap key CAP-X is not in capabilities.json']);
  });

  it('reports a non-object entry as having no placement', () => {
    const cm = { ...goodCapmap(), 'CAP-A': null };
    assert.deepEqual(validate(cm), ['capability CAP-A has no placement']);
  });

  it('reports empty to, unknown change and removed as no placement', () => {
    for (const over of [{ to: '' }, { to: '  ' }, { change: 'removed' }, { change: 'bogus' }]) {
      const cm = { ...goodCapmap(), 'CAP-A': placement(over) };
      assert.deepEqual(validate(cm), ['capability CAP-A has no placement'], JSON.stringify(over));
    }
    const cm = { ...goodCapmap(), 'CAP-A': placement({ change: undefined }) };
    assert.deepEqual(validate(cm), ['capability CAP-A has no placement']);
  });

  it('accepts every placement change value', () => {
    for (const change of ['same', 'promoted', 'consolidated-entry-points', 'merged', 'moved']) {
      const cm = { ...goodCapmap(), 'CAP-A': placement({ change }) };
      assert.deepEqual(validate(cm), [], change);
    }
  });

  it('reports a gate outside the capmap gate list', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ gate: 'lunar' }) };
    assert.match(
      validate(cm)[0],
      /^CAP-A gate must be one of none, paperless, paperless\+ai, ai, oidc/,
    );
    for (const gate of ['none', 'paperless', 'paperless+ai', 'ai', 'oidc']) {
      assert.deepEqual(validate({ ...goodCapmap(), 'CAP-A': placement({ gate }) }), [], gate);
    }
  });

  it('reports an empty name or from', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ name: '', from: ' ' }) };
    assert.deepEqual(validate(cm), [
      'CAP-A name must not be empty',
      'CAP-A from must not be empty',
    ]);
  });

  it('reports clicks above the bound', () => {
    const cm = {
      ...goodCapmap(),
      'CAP-A': placement({ clicks: 3, clickPath: 'A (1) > B (2) > C (3)' }),
    };
    assert.deepEqual(validate(cm), ['CAP-A clicks 3 exceeds the bound 2']);
  });

  it('reports a clickPath whose derived clicks exceed the bound even if clicks claims less', () => {
    const cm = {
      ...goodCapmap(),
      'CAP-A': placement({ clicks: 2, clickPath: 'A (1) > B (2) > C (3)' }),
    };
    assert.deepEqual(validate(cm), ['CAP-A clicks 3 exceeds the bound 2']);
  });

  it('reports non-integer and negative clicks', () => {
    for (const clicks of [1.5, -1, '2']) {
      const cm = { ...goodCapmap(), 'CAP-A': placement({ clicks, clickPath: 'A (1)' }) };
      assert.ok(
        validate(cm).includes('CAP-A clicks must be an integer between 0 and 2'),
        String(clicks),
      );
    }
  });

  it('reports a demoted capability without clicks', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ change: 'demoted' }) };
    assert.deepEqual(validate(cm), ['CAP-A is demoted but has no clicks']);
    const withNull = { ...goodCapmap(), 'CAP-A': placement({ change: 'demoted', clicks: null }) };
    assert.deepEqual(validate(withNull), ['CAP-A is demoted but has no clicks']);
  });

  it('reports clicks without a clickPath', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ clicks: 1 }) };
    assert.deepEqual(validate(cm), ['CAP-A has clicks but no clickPath']);
  });

  it('reports clicks that do not match the clickPath', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ clicks: 1, clickPath: 'A (1) > B (2)' }) };
    assert.deepEqual(validate(cm), ['CAP-A clicks 1 does not match its clickPath (2)']);
  });

  it('uses the minimum over alternatives for the click check', () => {
    const ok = {
      ...goodCapmap(),
      'CAP-A': placement({ clicks: 1, clickPath: 'A (1) > B (2) > C (3); Search (1)' }),
    };
    assert.deepEqual(validate(ok), []);
    const bad = {
      ...goodCapmap(),
      'CAP-A': placement({ clicks: 2, clickPath: 'A (1) > B (2) > C (3); Search (1)' }),
    };
    assert.deepEqual(validate(bad), ['CAP-A clicks 2 does not match its clickPath (1)']);
  });

  it('reports a destination path missing from the route map', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ to: 'Tasks > X (/nowhere)' }) };
    assert.deepEqual(validate(cm), ['CAP-A destination path /nowhere is not in the route map']);
  });

  it('matches :param in the destination against route patterns and vice versa', () => {
    const cm = {
      ...goodCapmap(),
      'CAP-A': placement({ to: 'Tasks > Detail (/tasks/42)' }),
      'CAP-B': placement({ to: 'Tasks > Detail (/tasks/:taskId)' }),
    };
    assert.deepEqual(validate(cm), []);
  });

  it('accepts destinations matching a redirect target, query-stripped or comma-listed from', () => {
    const cm = {
      ...goodCapmap(),
      'CAP-A': placement({ to: 'Budget > A (/budget)' }),
      'CAP-B': placement({ to: 'Budget > B (/money)' }),
    };
    assert.deepEqual(validate(cm), []);
  });

  it('does not take redirect-kind from values as page patterns', () => {
    const cm = { ...goodCapmap(), 'CAP-A': placement({ to: 'Tasks > X (/old)' }) };
    assert.deepEqual(validate(cm), ['CAP-A destination path /old is not in the route map']);
  });

  it('tolerates a missing route map', () => {
    const errors = validateCapmap({ inventory, capmap: goodCapmap(), routemap: undefined });
    assert.deepEqual(errors, [
      'CAP-A destination path /tasks is not in the route map',
      'CAP-C destination path /budget is not in the route map',
    ]);
  });
});

describe('summarize', () => {
  const summary = summarize({ inventory, capmap: goodCapmap(), routemap });

  it('counts capabilities by change, gate, section and domain', () => {
    assert.equal(summary.capabilities.total, 3);
    assert.deepEqual(summary.capabilities.byChange, { demoted: 1, moved: 1, same: 1 });
    assert.deepEqual(summary.capabilities.byGate, { ai: 1, none: 2 });
    assert.deepEqual(summary.capabilities.byDestinationSection, {
      Budget: 1,
      Settings: 1,
      Tasks: 1,
    });
    assert.deepEqual(summary.capabilities.byDomain, { budget: 1, tasks: 2 });
  });

  it('builds the clicks histogram from entries that carry clicks', () => {
    assert.deepEqual(summary.capabilities.clicksHistogram, { 2: 1 });
  });

  it('counts daily and weekly capabilities whose destination is Settings (metric 3.1)', () => {
    assert.equal(summary.capabilities.dailyWeeklyInSettings, 1);
    const cm = goodCapmap();
    cm['CAP-A'] = placement({ to: 'Settings > Other' });
    cm['CAP-C'] = placement({ to: 'Settings > Rare' });
    const s = summarize({ inventory, capmap: cm, routemap });
    assert.equal(s.capabilities.dailyWeeklyInSettings, 2, 'rare frequency is not counted');
  });

  it('uses "unknown" as the domain of a capability that is not in the inventory', () => {
    const s = summarize({ inventory: [], capmap: { Z: placement() }, routemap: [] });
    assert.deepEqual(s.capabilities.byDomain, { unknown: 1 });
  });

  it('counts routes by kind, change and section and lists permanent URLs sorted', () => {
    assert.equal(summary.routes.total, 4);
    assert.deepEqual(summary.routes.byKind, { page: 3, redirect: 1 });
    assert.deepEqual(summary.routes.byChange, { kept: 2, moved: 1, redirect: 1 });
    assert.deepEqual(summary.routes.bySection, { Budget: 1, Tasks: 3 });
    assert.deepEqual(summary.routes.permanent, ['/old', '/tasks']);
  });

  it('is deterministic with sorted keys', () => {
    assert.equal(
      JSON.stringify(summarize({ inventory, capmap: goodCapmap(), routemap })),
      JSON.stringify(summary),
    );
    assert.deepEqual(Object.keys(summary.capabilities.byChange), ['demoted', 'moved', 'same']);
  });
});

function makeRoot({ capmap = goodCapmap(), omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'build-capmap-'));
  roots.push(root);
  const dir = join(root, 'plan/restructure');
  mkdirSync(dir, { recursive: true });
  const files = {
    'capabilities.json': inventory,
    'capmap.json': capmap,
    'routemap.json': routemap,
  };
  for (const [name, data] of Object.entries(files)) {
    if (!omit.includes(name)) writeFileSync(join(dir, name), JSON.stringify(data));
  }
  return root;
}

describe('run', () => {
  it('check reports a missing summary.json as stale, then passes after write', async () => {
    const root = makeRoot();
    const stale = await run({ root, mode: 'check' });
    assert.deepEqual(stale.errors, ['summary.json is stale — run npm run plan:build']);

    const written = await run({ root, mode: 'write' });
    assert.deepEqual(written.errors, []);
    assert.ok(written.notes.includes('summary.json written'));
    assert.ok(written.notes.includes('3 capabilities placed'));

    assert.deepEqual((await run({ root, mode: 'check' })).errors, []);
  });

  it('detects drift when the capmap changes after a write', async () => {
    const root = makeRoot();
    await run({ root, mode: 'write' });
    const cm = goodCapmap();
    cm['CAP-A'].gate = 'oidc';
    writeFileSync(join(root, 'plan/restructure/capmap.json'), JSON.stringify(cm));
    const res = await run({ root, mode: 'check' });
    assert.deepEqual(res.errors, ['summary.json is stale — run npm run plan:build']);
  });

  it('write does not announce a second write when nothing changed', async () => {
    const root = makeRoot();
    await run({ root, mode: 'write' });
    const second = await run({ root, mode: 'write' });
    assert.ok(!second.notes.includes('summary.json written'));
  });

  it('writes Prettier-formatted summary.json', async () => {
    const root = makeRoot();
    await run({ root, mode: 'write' });
    const path = join(root, 'plan/restructure/summary.json');
    const config = (await prettier.resolveConfig(path)) ?? {};
    assert.equal(
      await prettier.check(readFileSync(path, 'utf8'), { ...config, parser: 'json' }),
      true,
    );
  });

  it('returns validation errors and writes no summary when invalid', async () => {
    const cm = goodCapmap();
    cm['CAP-A'].to = '';
    const root = makeRoot({ capmap: cm });
    const res = await run({ root, mode: 'write' });
    assert.deepEqual(res.errors, ['capability CAP-A has no placement']);
    assert.throws(() => readFileSync(join(root, 'plan/restructure/summary.json')));
  });

  it('names every missing input file', async () => {
    const root = makeRoot({ omit: ['capabilities.json', 'capmap.json'] });
    const res = await run({ root });
    assert.deepEqual(res.errors, [
      'input missing: plan/restructure/capabilities.json (curated data)',
      'input missing: plan/restructure/capmap.json (curated data)',
    ]);
    assert.equal(res.name, 'capability map');
  });
});

describe('CLI', () => {
  it('exits 2 on an unknown argument', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown argument --nope/);
  });
});
