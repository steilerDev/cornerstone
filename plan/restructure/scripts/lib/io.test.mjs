import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';
import { REPO_ROOT, RESTRUCTURE_DIR, formatJson, isMain, readJson, writeOrCheck } from './io.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'io-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe('paths', () => {
  it('resolves the repository root and restructure directory', () => {
    assert.ok(REPO_ROOT.length > 1);
    assert.equal(RESTRUCTURE_DIR, join(REPO_ROOT, 'plan/restructure'));
  });
});

describe('readJson', () => {
  it('parses a JSON file', () => {
    const p = join(tmp, 'a.json');
    writeFileSync(p, '{"a":[1,2]}');
    assert.deepEqual(readJson(p), { a: [1, 2] });
  });
  it('throws on invalid JSON and on a missing file', () => {
    const p = join(tmp, 'bad.json');
    writeFileSync(p, '{');
    assert.throws(() => readJson(p));
    assert.throws(() => readJson(join(tmp, 'missing.json')));
  });
});

describe('formatJson', () => {
  it('produces Prettier-formatted JSON ending in a newline', async () => {
    const p = join(tmp, 'f.json');
    const out = await formatJson(p, { b: [1, 2, 3], a: { c: 'x' } });
    assert.ok(out.endsWith('\n'));
    assert.deepEqual(JSON.parse(out), { b: [1, 2, 3], a: { c: 'x' } });
    const config = (await prettier.resolveConfig(p)) ?? {};
    assert.equal(await prettier.check(out, { ...config, parser: 'json' }), true);
  });
});

describe('writeOrCheck', () => {
  it('check mode reports a missing file as changed and not ok', () => {
    assert.deepEqual(writeOrCheck(join(tmp, 'new.json'), 'x', 'check'), {
      ok: false,
      changed: true,
    });
  });
  it('write mode creates parent directories and writes the content', () => {
    const p = join(tmp, 'deep/er/file.json');
    assert.deepEqual(writeOrCheck(p, 'hello', 'write'), { ok: true, changed: true });
    assert.equal(readFileSync(p, 'utf8'), 'hello');
  });
  it('is unchanged and ok when the content already matches, in both modes', () => {
    const p = join(tmp, 'same.json');
    writeFileSync(p, 'same');
    assert.deepEqual(writeOrCheck(p, 'same', 'check'), { ok: true, changed: false });
    assert.deepEqual(writeOrCheck(p, 'same', 'write'), { ok: true, changed: false });
  });
  it('check mode never modifies a differing file', () => {
    const p = join(tmp, 'diff.json');
    writeFileSync(p, 'old');
    assert.deepEqual(writeOrCheck(p, 'new', 'check'), { ok: false, changed: true });
    assert.equal(readFileSync(p, 'utf8'), 'old');
  });
  it('write mode overwrites a differing file', () => {
    const p = join(tmp, 'over.json');
    writeFileSync(p, 'old');
    writeOrCheck(p, 'new', 'write');
    assert.equal(readFileSync(p, 'utf8'), 'new');
  });
});

describe('isMain', () => {
  it('is true only for the entry script URL', () => {
    assert.equal(isMain(pathToFileURL(process.argv[1]).href), true);
    assert.equal(isMain('file:///somewhere/else.mjs'), false);
  });
  it('is false when there is no entry script', () => {
    const saved = process.argv[1];
    process.argv[1] = '';
    try {
      assert.equal(isMain('file:///x.mjs'), false);
    } finally {
      process.argv[1] = saved;
    }
  });
});
