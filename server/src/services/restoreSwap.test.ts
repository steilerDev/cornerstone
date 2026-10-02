/**
 * Unit tests for restoreSwap.ts (restore marker, content swap, rollback, startup recovery).
 *
 * Failure injection uses jest.spyOn(fs, 'renameSync') etc. on the default `node:fs` import, which
 * restoreSwap.ts also uses. Each test names the mutation it guards against ("Guards:").
 */

import { jest, describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { disposableTempDir } from '../test-helpers/disposables.js';
import {
  BACKUP_MANIFEST_FILE,
  PRE_RESTORE_PREFIX,
  RESTORE_STAGING_PREFIX,
  RESTORE_STATE_FILE,
  RESTORE_STATE_TMP,
  dbSidecars,
  finalizeSwap,
  isExcludedFromArchive,
  isRestoreReservedEntry,
  readRestoreState,
  recoverInterruptedRestore,
  rollbackSwap,
  swapIntoDataDir,
  writeRestoreState,
  type RestoreState,
} from './restoreSwap.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLogger() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { logger, asFastify: logger as unknown as FastifyBaseLogger };
}

/** Recursive name -> content map ('<dir>' for directories); detects any byte-level difference. */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const name of fs.readdirSync(path.join(root, rel)).sort()) {
      const childRel = path.join(rel, name);
      const full = path.join(root, childRel);
      if (fs.statSync(full).isDirectory()) {
        out[childRel] = '<dir>';
        walk(childRel);
      } else {
        out[childRel] = fs.readFileSync(full, 'utf-8');
      }
    }
  };
  walk('');
  return out;
}

function write(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const STATE: RestoreState = {
  phase: 'moving-aside',
  staging: `${RESTORE_STAGING_PREFIX}1`,
  preRestore: `${PRE_RESTORE_PREFIX}1`,
};

const ORIGINALS: Record<string, string> = {
  'cornerstone.db': 'orig-db',
  'photos/a.jpg': 'orig-photo',
  'notes.txt': 'orig-notes',
};

/** A dataDir holding the original tree, a staged tree and an initial 'moving-aside' marker. */
function buildDataDir(root: string): {
  state: RestoreState;
  originalSnapshot: Record<string, string>;
} {
  for (const [rel, content] of Object.entries(ORIGINALS)) write(root, rel, content);
  write(root, 'lost+found/keep', 'reserved');
  write(root, `${STATE.staging}/cornerstone.db`, 'new-db');
  write(root, `${STATE.staging}/photos/b.jpg`, 'new-photo');
  write(root, `${STATE.staging}/extra.txt`, 'new-extra');
  const state = { ...STATE };
  writeRestoreState(root, state);
  const originalSnapshot: Record<string, string> = {};
  Object.assign(originalSnapshot, ORIGINALS, { photos: '<dir>' });
  return { state, originalSnapshot };
}

/** Throw on the first renameSync whose source matches; every other call passes through. */
function failRenameOnce(match: (src: string) => boolean): jest.SpiedFunction<typeof fs.renameSync> {
  const real = fs.renameSync.bind(fs);
  let failed = false;
  return jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
    if (!failed && match(String(src))) {
      failed = true;
      throw Object.assign(new Error('injected rename failure'), { code: 'EIO' });
    }
    return real(src, dest);
  }) as typeof fs.renameSync);
}

/** The original (non-reserved) part of a data dir, for comparing against a reinstated tree. */
function originalsOnly(root: string): Record<string, string> {
  const snap = snapshotTree(root);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(snap)) {
    const top = k.split(path.sep)[0]!;
    if (isRestoreReservedEntry(top)) continue;
    out[k] = v;
  }
  return out;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Predicates ─────────────────────────────────────────────────────────────

describe('isRestoreReservedEntry()', () => {
  it.each([
    ['.restore-staging-1', true],
    ['.restore-state.json', true],
    ['.restore-state.json.tmp', true],
    ['.pre-restore-1', true],
    ['lost+found', true],
    ['cornerstone.db', false],
    ['photos', false],
    // Guards: a loose substring/endsWith match instead of startsWith
    ['my.restore-notes', false],
    ['x.pre-restore-1', false],
    ['lost+found2', false],
    ['restore-staging', false],
  ])('%s -> %s', (name, expected) => {
    expect(isRestoreReservedEntry(name)).toBe(expected);
  });
});

describe('dbSidecars()', () => {
  it('lists the wal, shm and journal names for the given db name', () => {
    // Guards: a missing sidecar (e.g. -journal dropped) leaking into archives
    expect(dbSidecars('cornerstone.db')).toEqual([
      'cornerstone.db-wal',
      'cornerstone.db-shm',
      'cornerstone.db-journal',
    ]);
  });
});

describe('isExcludedFromArchive()', () => {
  const db = 'cornerstone.db';
  const snap = 'cornerstone-backup-2026-01-15T020000Z.db';

  it.each([
    // [name, excluded, reason / guarded mutation]
    ['cornerstone.db', true, 'live db must never be archived'],
    ['cornerstone.db-wal', true, 'wal sidecar'],
    ['cornerstone.db-shm', true, 'shm sidecar'],
    ['cornerstone.db-journal', true, 'journal sidecar'],
    ['.restore-staging-1', true, 'staging dir'],
    ['.pre-restore-1', true, 'pre-restore dir'],
    ['.restore-state.json', true, 'marker'],
    ['.restore-state.json.tmp', true, 'marker tmp'],
    ['lost+found', true, 'lost+found'],
    ['cornerstone-backup-old.db', true, 'stray snapshot of another backup'],
    [snap, false, 'the current snapshot must be archived'],
    ['cornerstone-backup-manifest.json', false, 'the manifest must be archived'],
    ['photos', false, 'regular content'],
    ['other.db', false, 'a non-snapshot .db file is user content'],
    ['cornerstone-backup-x.txt', false, 'snapshot pattern requires .db'],
  ])('%s -> excluded=%s (%s)', (name, expected) => {
    expect(isExcludedFromArchive(name, db, snap)).toBe(expected);
  });

  it('uses the supplied dbName for sidecars (a differently named live db is excluded, the default name is not)', () => {
    // Guards: hard-coding "cornerstone.db" instead of using dbName
    expect(isExcludedFromArchive('test.db-wal', 'test.db', snap)).toBe(true);
    expect(isExcludedFromArchive('cornerstone.db-wal', 'test.db', snap)).toBe(false);
  });
});

// ─── Marker IO ──────────────────────────────────────────────────────────────

describe('writeRestoreState() / readRestoreState()', () => {
  it('round-trips the state and leaves no tmp file behind', () => {
    using dir = disposableTempDir('swap-marker-');
    writeRestoreState(dir.path, STATE);

    expect(readRestoreState(dir.path)).toEqual(STATE);
    // Guards: leaving the tmp file (rename replaced by copy) or skipping the rename
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_TMP))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(true);
  });

  it('overwrites an existing marker with the new phase', () => {
    using dir = disposableTempDir('swap-marker-');
    writeRestoreState(dir.path, STATE);
    writeRestoreState(dir.path, { ...STATE, phase: 'swapped' });
    // Guards: a write that appends/keeps the stale phase
    expect(readRestoreState(dir.path)?.phase).toBe('swapped');
  });

  it('fsyncs the file and then the directory (durable write order)', () => {
    using dir = disposableTempDir('swap-marker-');
    const fsyncSpy = jest.spyOn(fs, 'fsyncSync');
    const renameSpy = jest.spyOn(fs, 'renameSync');

    writeRestoreState(dir.path, STATE);

    // Guards: dropping either fsync (file before rename, directory after rename)
    expect(fsyncSpy).toHaveBeenCalledTimes(2);
    expect(fsyncSpy.mock.invocationCallOrder[0]!).toBeLessThan(
      renameSpy.mock.invocationCallOrder[0]!,
    );
    expect(fsyncSpy.mock.invocationCallOrder[1]!).toBeGreaterThan(
      renameSpy.mock.invocationCallOrder[0]!,
    );
  });

  it('closes the tmp file descriptor and propagates the error when the write fails', () => {
    using dir = disposableTempDir('swap-marker-');
    const closeSpy = jest.spyOn(fs, 'closeSync');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => writeRestoreState(dir.path, STATE)).toThrow('disk full');
    // Guards: fd leak (close not in finally) and swallowing the error
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });

  it('returns null when no marker exists', () => {
    using dir = disposableTempDir('swap-marker-');
    // Guards: throwing on ENOENT
    expect(readRestoreState(dir.path)).toBeNull();
  });

  it('rethrows a non-ENOENT read error instead of reporting "no marker"', () => {
    using dir = disposableTempDir('swap-marker-');
    // A directory in place of the marker file gives EISDIR
    fs.mkdirSync(path.join(dir.path, RESTORE_STATE_FILE));
    // Guards: treating every read error as "no marker" (would sweep a state we cannot read)
    expect(() => readRestoreState(dir.path)).toThrow(/EISDIR/);
  });

  it.each([
    ['bad JSON', '{not json'],
    ['JSON null', 'null'],
    ['JSON string', '"moving-in"'],
    ['empty object', '{}'],
    ['unknown phase', JSON.stringify({ ...STATE, phase: 'exploding' })],
    ['non-string phase', JSON.stringify({ ...STATE, phase: 3 })],
    ['staging path traversal', JSON.stringify({ ...STATE, staging: '../x' })],
    ['staging wrong prefix', JSON.stringify({ ...STATE, staging: 'photos' })],
    [
      'staging with slash',
      JSON.stringify({ ...STATE, staging: `${RESTORE_STAGING_PREFIX}1/../..` }),
    ],
    [
      'staging with backslash',
      JSON.stringify({ ...STATE, staging: `${RESTORE_STAGING_PREFIX}1\\x` }),
    ],
    ['preRestore wrong prefix', JSON.stringify({ ...STATE, preRestore: 'photos' })],
    ['preRestore with slash', JSON.stringify({ ...STATE, preRestore: `${PRE_RESTORE_PREFIX}1/x` })],
    ['preRestore is staging-prefixed', JSON.stringify({ ...STATE, preRestore: STATE.staging })],
    ['staging non-string', JSON.stringify({ ...STATE, staging: 5 })],
    ['missing preRestore', JSON.stringify({ phase: 'moving-in', staging: STATE.staging })],
  ])('throws a manual-inspection error for an invalid marker: %s', (_label, body) => {
    using dir = disposableTempDir('swap-marker-');
    fs.writeFileSync(path.join(dir.path, RESTORE_STATE_FILE), body);
    // Guards: accepting any of these shapes (the basenames are later joined into rm -rf paths)
    expect(() => readRestoreState(dir.path)).toThrow(
      /Invalid restore marker .*inspect it manually/,
    );
  });

  it.each(['moving-aside', 'moving-in', 'swapped'] as const)('accepts phase %s', (phase) => {
    using dir = disposableTempDir('swap-marker-');
    writeRestoreState(dir.path, { ...STATE, phase });
    // Guards: a phase missing from the allow-list
    expect(readRestoreState(dir.path)?.phase).toBe(phase);
  });
});

// ─── swapIntoDataDir ────────────────────────────────────────────────────────

describe('swapIntoDataDir()', () => {
  it('moves originals into pre-restore, staged entries into the data dir, and ends in phase swapped', () => {
    using dir = disposableTempDir('swap-ok-');
    const { state } = buildDataDir(dir.path);

    swapIntoDataDir(dir.path, state);

    expect(state.phase).toBe('swapped');
    expect(readRestoreState(dir.path)?.phase).toBe('swapped');
    // Restored content is live
    expect(fs.readFileSync(path.join(dir.path, 'cornerstone.db'), 'utf-8')).toBe('new-db');
    expect(fs.readFileSync(path.join(dir.path, 'photos/b.jpg'), 'utf-8')).toBe('new-photo');
    expect(fs.readFileSync(path.join(dir.path, 'extra.txt'), 'utf-8')).toBe('new-extra');
    // Guards: originals merged into the restored tree instead of replaced
    expect(fs.existsSync(path.join(dir.path, 'photos/a.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, 'notes.txt'))).toBe(false);
    // Originals are preserved in pre-restore until finalize
    expect(fs.readFileSync(path.join(dir.path, state.preRestore, 'photos/a.jpg'), 'utf-8')).toBe(
      'orig-photo',
    );
    expect(fs.readFileSync(path.join(dir.path, state.preRestore, 'notes.txt'), 'utf-8')).toBe(
      'orig-notes',
    );
    // Staging is drained
    expect(fs.readdirSync(path.join(dir.path, state.staging))).toEqual([]);
  });

  it('never moves reserved entries (lost+found, marker, staging) aside', () => {
    using dir = disposableTempDir('swap-reserved-');
    const { state } = buildDataDir(dir.path);

    swapIntoDataDir(dir.path, state);

    // Guards: swapping with a blanket readdir (would move the marker and staging into pre-restore)
    expect(fs.readFileSync(path.join(dir.path, 'lost+found/keep'), 'utf-8')).toBe('reserved');
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(true);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(true);
    expect(fs.existsSync(path.join(dir.path, state.preRestore, 'lost+found'))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.preRestore, RESTORE_STATE_FILE))).toBe(false);
  });

  it('flips the marker only after each loop completes, atomically (no tmp file, parseable marker)', () => {
    using dir = disposableTempDir('swap-flip-');
    const { state } = buildDataDir(dir.path);
    const real = fs.renameSync.bind(fs);
    const flips: Array<{
      phase: string | undefined;
      tmpPresent: boolean;
      stagingEntriesLeft: string[];
    }> = [];
    jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
      real(src, dest);
      if (String(dest).endsWith(RESTORE_STATE_FILE)) {
        flips.push({
          phase: readRestoreState(dir.path)?.phase,
          tmpPresent: fs.existsSync(path.join(dir.path, RESTORE_STATE_TMP)),
          stagingEntriesLeft: fs.readdirSync(path.join(dir.path, state.staging)),
        });
      }
    }) as typeof fs.renameSync);

    swapIntoDataDir(dir.path, state);

    expect(flips.map((f) => f.phase)).toEqual(['moving-in', 'swapped']);
    // Guards: a non-atomic marker write leaving the tmp file
    expect(flips.every((f) => !f.tmpPresent)).toBe(true);
    // Guards: flipping to moving-in before every original was moved aside
    expect(fs.readdirSync(path.join(dir.path, state.preRestore)).sort()).toEqual([
      'cornerstone.db',
      'notes.txt',
      'photos',
    ]);
    // Guards: flipping to swapped before the staged entries were all moved in
    expect(flips[0]!.stagingEntriesLeft.sort()).toEqual(['cornerstone.db', 'extra.txt', 'photos']);
    expect(flips[1]!.stagingEntriesLeft).toEqual([]);
  });

  it('rolls back cleanly (byte-identical) when a rename fails during the moving-aside loop', () => {
    using dir = disposableTempDir('swap-fail-aside-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    // Fail on the 2nd original being moved aside, so exactly one original is already moved
    let calls = 0;
    failRenameOnce((src) => {
      if (src.includes(state.staging) || src.includes(RESTORE_STATE_TMP)) return false;
      calls += 1;
      return calls === 2;
    });

    expect(() => swapIntoDataDir(dir.path, state)).toThrow('injected rename failure');
    expect(state.phase).toBe('moving-aside');
    jest.restoreAllMocks();

    rollbackSwap(dir.path, state);

    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    // Guards: rollback leaving the pre-restore dir, staging or marker behind
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
    expect(fs.readFileSync(path.join(dir.path, 'lost+found/keep'), 'utf-8')).toBe('reserved');
  });

  it('rolls back cleanly and leaves no restored entries when a rename fails during the moving-in loop', () => {
    using dir = disposableTempDir('swap-fail-in-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    let stagedMoves = 0;
    failRenameOnce((src) => {
      if (!src.includes(state.staging)) return false;
      stagedMoves += 1;
      return stagedMoves === 2;
    });

    expect(() => swapIntoDataDir(dir.path, state)).toThrow('injected rename failure');
    expect(state.phase).toBe('moving-in');
    expect(readRestoreState(dir.path)?.phase).toBe('moving-in');
    jest.restoreAllMocks();

    rollbackSwap(dir.path, state);

    // Guards: skipping the "delete restored entries" step for phase moving-in
    // (new-db / b.jpg / extra.txt would be left mixed into the original tree)
    expect(snapshotTree(dir.path)['extra.txt']).toBeUndefined();
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });
});

// ─── rollbackSwap ───────────────────────────────────────────────────────────

describe('rollbackSwap()', () => {
  it('refuses to roll back a completed swap', () => {
    using dir = disposableTempDir('swap-rb-swapped-');
    // Guards: allowing rollback after the restored data went live
    expect(() => rollbackSwap(dir.path, { ...STATE, phase: 'swapped' })).toThrow(
      'Cannot roll back a completed swap',
    );
  });

  it('tolerates a pre-restore dir that was never created (failure before mkdir)', () => {
    using dir = disposableTempDir('swap-rb-nopre-');
    const { state, originalSnapshot } = buildDataDir(dir.path);

    rollbackSwap(dir.path, state);

    // Guards: readdirSync(pre) on a missing directory throwing ENOENT
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });

  it('replaces an entry that an in-flight request re-created in the data dir with the original', () => {
    using dir = disposableTempDir('swap-rb-recreate-');
    const { state } = buildDataDir(dir.path);
    // Simulate: all originals moved aside, then a request re-created "photos"
    const pre = path.join(dir.path, state.preRestore);
    fs.mkdirSync(pre);
    for (const e of ['cornerstone.db', 'photos', 'notes.txt']) {
      fs.renameSync(path.join(dir.path, e), path.join(pre, e));
    }
    write(dir.path, 'photos/recreated.jpg', 'recreated');

    rollbackSwap(dir.path, state);

    // Guards: renameSync over a non-empty directory (ENOTEMPTY) or keeping the re-created copy
    expect(fs.readFileSync(path.join(dir.path, 'photos/a.jpg'), 'utf-8')).toBe('orig-photo');
    expect(fs.existsSync(path.join(dir.path, 'photos/recreated.jpg'))).toBe(false);
  });

  it('keeps the marker when pre-restore cannot be removed (marker is deleted last)', () => {
    using dir = disposableTempDir('swap-rb-marker-last-');
    const { state } = buildDataDir(dir.path);
    fs.mkdirSync(path.join(dir.path, state.preRestore));
    jest.spyOn(fs, 'rmdirSync').mockImplementation(() => {
      throw Object.assign(new Error('not empty'), { code: 'ENOTEMPTY' });
    });

    expect(() => rollbackSwap(dir.path, state)).toThrow('not empty');
    // Guards: deleting the marker before the final cleanup steps (a crash would then lose the state)
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(true);
  });

  it('keeps the marker and its phase when moving an original back fails', () => {
    using dir = disposableTempDir('swap-rb-rename-fail-');
    const { state } = buildDataDir(dir.path);
    const pre = path.join(dir.path, state.preRestore);
    fs.mkdirSync(pre);
    fs.renameSync(path.join(dir.path, 'notes.txt'), path.join(pre, 'notes.txt'));
    failRenameOnce((src) => src.startsWith(pre));

    expect(() => rollbackSwap(dir.path, state)).toThrow('injected rename failure');
    // Guards: marker deleted despite an incomplete rollback
    expect(readRestoreState(dir.path)?.phase).toBe('moving-aside');
  });
});

// ─── finalizeSwap ───────────────────────────────────────────────────────────

describe('finalizeSwap()', () => {
  it('removes staging, pre-restore and the marker but keeps restored data', () => {
    using dir = disposableTempDir('swap-final-');
    const { state } = buildDataDir(dir.path);
    swapIntoDataDir(dir.path, state);

    finalizeSwap(dir.path, state);

    // Guards: deleting restored data, or leaving the originals (pre-restore) behind
    expect(fs.readFileSync(path.join(dir.path, 'cornerstone.db'), 'utf-8')).toBe('new-db');
    expect(fs.readFileSync(path.join(dir.path, 'photos/b.jpg'), 'utf-8')).toBe('new-photo');
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });

  it('keeps the marker when removing pre-restore fails (marker is deleted last)', () => {
    using dir = disposableTempDir('swap-final-last-');
    const { state } = buildDataDir(dir.path);
    swapIntoDataDir(dir.path, state);
    const realRm = fs.rmSync.bind(fs);
    jest.spyOn(fs, 'rmSync').mockImplementation(((p: string, o?: fs.RmOptions) => {
      if (String(p).endsWith(state.preRestore)) throw new Error('EBUSY');
      return realRm(p, o);
    }) as typeof fs.rmSync);

    expect(() => finalizeSwap(dir.path, state)).toThrow('EBUSY');
    // Guards: unlinking the marker first, which would orphan a pre-restore dir with no marker
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(true);
  });
});

// ─── Rollback failure then startup recovery (scenario 13) ───────────────────

/** Runs a swap that fails while moving the 2nd staged entry in, leaving phase 'moving-in'. */
function failSwapDuringMovingIn(root: string, state: RestoreState): void {
  let stagedMoves = 0;
  failRenameOnce((src) => {
    if (!src.includes(state.staging)) return false;
    stagedMoves += 1;
    return stagedMoves === 2;
  });
  expect(() => swapIntoDataDir(root, state)).toThrow('injected rename failure');
  jest.restoreAllMocks();
}

describe('rollback that itself fails, then startup recovery', () => {
  it('after the first move-back fails the marker says moving-aside and recovery reinstates all originals', () => {
    using dir = disposableTempDir('swap-rb-recover-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    const pre = path.join(dir.path, state.preRestore);
    failSwapDuringMovingIn(dir.path, state);
    expect(readRestoreState(dir.path)?.phase).toBe('moving-in');

    failRenameOnce((src) => src.startsWith(pre));
    expect(() => rollbackSwap(dir.path, state)).toThrow('injected rename failure');
    jest.restoreAllMocks();

    // Guards: leaving the marker at moving-in after the restored entries were deleted
    // (a retry would then delete whatever was moved back)
    expect(readRestoreState(dir.path)?.phase).toBe('moving-aside');
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(true);

    const { logger, asFastify } = makeLogger();
    recoverInterruptedRestore(dir.path, 'cornerstone.db', asFastify);

    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      { phase: 'moving-aside' },
      'Interrupted restore was rolled back; original data reinstated',
    );
  });

  it('DATA-LOSS REGRESSION: a rollback that fails after reinstating one original does not lose it on recovery', () => {
    using dir = disposableTempDir('swap-rb-idempotent-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    const pre = path.join(dir.path, state.preRestore);
    failSwapDuringMovingIn(dir.path, state);

    // The first original goes back, the second rename-back fails
    let backMoves = 0;
    failRenameOnce((src) => {
      if (!src.startsWith(pre)) return false;
      backMoves += 1;
      return backMoves === 2;
    });
    expect(() => rollbackSwap(dir.path, state)).toThrow('injected rename failure');
    jest.restoreAllMocks();
    // One original is already back in dataDir and one is still in pre-restore
    expect(fs.readdirSync(pre)).toHaveLength(2);

    recoverInterruptedRestore(dir.path, 'cornerstone.db', makeLogger().asFastify);

    // Guards: the original idempotency bug (marker left at moving-in, so recovery rm -rf'd the
    // already reinstated original and it was lost)
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
  });

  it('a failed phase flip during rollback keeps the marker at moving-in and recovery still reinstates all originals', () => {
    using dir = disposableTempDir('swap-rb-flip-fail-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    failSwapDuringMovingIn(dir.path, state);
    // Fail the marker's atomic rename (tmp -> marker) during the rollback's flip
    // (disk and memory agree on moving-in, so the up-front re-assert is skipped: the 1st marker
    // write is the moving-aside flip itself)
    failRenameOnce((src) => src.endsWith(RESTORE_STATE_TMP));

    expect(() => rollbackSwap(dir.path, state)).toThrow('injected rename failure');
    jest.restoreAllMocks();

    // Guards: advancing the marker without persisting it, or persisting a half-written marker
    expect(readRestoreState(dir.path)?.phase).toBe('moving-in');
    // Originals were not touched yet (still in pre-restore): the flip precedes the move-back
    expect(fs.existsSync(path.join(dir.path, 'cornerstone.db'))).toBe(false);

    recoverInterruptedRestore(dir.path, 'cornerstone.db', makeLogger().asFastify);

    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });
});

// ─── Disk one flip ahead of memory ("disk ahead") ───────────────────────────

/**
 * Leaves the marker on disk at 'swapped' (the flip's rename landed, then the directory fsync
 * threw) while the in-memory state is still 'moving-in'. All staged entries are already live.
 */
function diskAheadOfMemory(root: string): {
  state: RestoreState;
  originalSnapshot: Record<string, string>;
} {
  const { state, originalSnapshot } = buildDataDir(root);
  const realFsync = fs.fsyncSync.bind(fs);
  let calls = 0;
  // Writes after the initial one: moving-in flip = fsyncs 1+2, swapped flip = fsyncs 3 (file) + 4 (dir)
  jest.spyOn(fs, 'fsyncSync').mockImplementation(((fd: number) => {
    if (++calls === 4)
      throw Object.assign(new Error('injected dir fsync failure'), { code: 'EIO' });
    return realFsync(fd);
  }) as typeof fs.fsyncSync);
  expect(() => swapIntoDataDir(root, state)).toThrow('injected dir fsync failure');
  jest.restoreAllMocks();
  // Preconditions of the scenario (non-vacuous)
  expect(readRestoreState(root)?.phase).toBe('swapped');
  expect(state.phase).toBe('moving-in');
  expect(fs.readFileSync(path.join(root, 'cornerstone.db'), 'utf-8')).toBe('new-db');
  return { state, originalSnapshot };
}

/** Throw on the tmp -> marker rename numbered in `failOn` (1-based, counted from the call). */
function failMarkerRenames(failOn: number[]): void {
  const real = fs.renameSync.bind(fs);
  let n = 0;
  jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
    if (String(src).endsWith(RESTORE_STATE_TMP) && failOn.includes(++n)) {
      throw Object.assign(new Error('injected marker rename failure'), { code: 'EIO' });
    }
    return real(src, dest);
  }) as typeof fs.renameSync);
}

/** Snapshot minus the marker tmp file and the (now eagerly deleted) staging directory. */
const withoutTmpAndStaging = (
  snap: Record<string, string>,
  staging: string,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(snap).filter(
      ([k]) => k !== RESTORE_STATE_TMP && k.split(path.sep)[0] !== staging,
    ),
  );

describe('rollbackSwap() when the marker on disk is ahead of the in-memory phase', () => {
  it('touches nothing when the re-assert write fails, and recovery then finalizes keeping the restored data', () => {
    using dir = disposableTempDir('swap-ahead-reassert-fail-');
    const { state } = diskAheadOfMemory(dir.path);
    const before = withoutTmpAndStaging(snapshotTree(dir.path), state.staging);
    failMarkerRenames([1]);

    expect(() => rollbackSwap(dir.path, state)).toThrow('injected marker rename failure');
    jest.restoreAllMocks();

    // Guards: a rollback that deletes restored entries before re-asserting the phase (the disk
    // says 'swapped', so the restored data would be gone and recovery would finalize an empty dir).
    // Staging (empty here, never the only copy of anything) is deleted first by design.
    expect(withoutTmpAndStaging(snapshotTree(dir.path), state.staging)).toEqual(before);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(readRestoreState(dir.path)?.phase).toBe('swapped');

    recoverInterruptedRestore(dir.path, 'cornerstone.db', makeLogger().asFastify);

    expect(fs.readFileSync(path.join(dir.path, 'cornerstone.db'), 'utf-8')).toBe('new-db');
    expect(fs.readFileSync(path.join(dir.path, 'photos/b.jpg'), 'utf-8')).toBe('new-photo');
    expect(fs.readFileSync(path.join(dir.path, 'extra.txt'), 'utf-8')).toBe('new-extra');
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });

  it('re-asserts moving-in on disk first; if the later moving-aside flip then fails, recovery reinstates every original byte-identical', () => {
    using dir = disposableTempDir('swap-ahead-flip-fail-');
    const { state, originalSnapshot } = diskAheadOfMemory(dir.path);
    // 1st marker rename = the re-assert (succeeds), 2nd = the moving-aside flip (fails)
    failMarkerRenames([2]);

    expect(() => rollbackSwap(dir.path, state)).toThrow('injected marker rename failure');
    jest.restoreAllMocks();

    // Guards: skipping the re-assert (the disk would still say 'swapped' although the restored
    // entries were just deleted, so recovery would finalize and delete the originals in pre-restore)
    expect(readRestoreState(dir.path)?.phase).toBe('moving-in');
    expect(fs.existsSync(path.join(dir.path, 'extra.txt'))).toBe(false);

    recoverInterruptedRestore(dir.path, 'cornerstone.db', makeLogger().asFastify);

    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });
});

// ─── D1: rollback/recovery on a full volume ─────────────────────────────────

const enospc = () =>
  Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });

/** Spy on openSync: records marker-tmp opens in `events` and throws ENOSPC while `failWhile()`. */
function enospcOnMarkerTmp(failWhile: () => boolean, events: string[] = []) {
  const real = fs.openSync as unknown as (...a: unknown[]) => number;
  return jest.spyOn(fs, 'openSync').mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
    if (String(p).endsWith(RESTORE_STATE_TMP)) {
      events.push('open-tmp');
      if (failWhile()) throw enospc();
    }
    return real.call(fs, p, ...rest);
  }) as typeof fs.openSync);
}

/** moving-aside: the "photos" original was already moved into pre-restore; staging is populated. */
function halfAside(root: string) {
  const { state, originalSnapshot } = buildDataDir(root);
  const pre = path.join(root, state.preRestore);
  fs.mkdirSync(pre);
  fs.renameSync(path.join(root, 'photos'), path.join(pre, 'photos'));
  return { state, originalSnapshot, pre };
}

/** moving-in: all originals in pre-restore, half of the staged entries already moved in. */
function halfIn(root: string) {
  const { state, originalSnapshot } = buildDataDir(root);
  const pre = path.join(root, state.preRestore);
  fs.mkdirSync(pre);
  for (const e of ['cornerstone.db', 'photos', 'notes.txt']) {
    fs.renameSync(path.join(root, e), path.join(pre, e));
  }
  fs.renameSync(
    path.join(root, state.staging, 'cornerstone.db'),
    path.join(root, 'cornerstone.db'),
  );
  fs.renameSync(path.join(root, state.staging, 'extra.txt'), path.join(root, 'extra.txt'));
  writeRestoreState(root, { ...state, phase: 'moving-in' });
  return { state: { ...state, phase: 'moving-in' as const }, originalSnapshot, pre };
}

describe('rollback and startup recovery on a full volume (D1)', () => {
  it('recovers a moving-aside restore although every marker write fails with ENOSPC', () => {
    using dir = disposableTempDir('swap-enospc-aside-');
    const { state, originalSnapshot } = halfAside(dir.path);
    const events: string[] = [];
    enospcOnMarkerTmp(() => true, events);

    expect(() =>
      recoverInterruptedRestore(dir.path, 'cornerstone.db', makeLogger().asFastify),
    ).not.toThrow();

    // Guards: an unconditional re-assert write (disk and memory agree, so no write is needed;
    // on a full volume it would fail every startup before anything is reinstated)
    expect(events).toEqual([]);
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });

  it('moving-in: deletes staging BEFORE the first marker write, so the flip fits once staging space is freed', () => {
    using dir = disposableTempDir('swap-enospc-in-');
    const { state, originalSnapshot } = halfIn(dir.path);
    const stagingPath = path.join(dir.path, state.staging);
    const events: string[] = [];
    // ENOSPC only while staging still occupies the volume
    enospcOnMarkerTmp(() => fs.existsSync(stagingPath), events);
    const realRm = fs.rmSync.bind(fs);
    jest.spyOn(fs, 'rmSync').mockImplementation(((p: fs.PathLike, o?: fs.RmOptions) => {
      if (String(p) === stagingPath) events.push('rm-staging');
      return realRm(p, o);
    }) as typeof fs.rmSync);

    recoverInterruptedRestore(dir.path, 'cornerstone.db', makeLogger().asFastify);

    // Guards: deleting staging after (or without) freeing it first: the marker write would hit ENOSPC
    expect(events[0]).toBe('rm-staging');
    expect(events.indexOf('rm-staging')).toBeLessThan(events.indexOf('open-tmp'));
    expect(events).toContain('open-tmp'); // the moving-aside flip really happened
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(stagingPath)).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
  });

  it('makes zero marker writes when the disk phase already equals the in-memory phase (moving-aside)', () => {
    using dir = disposableTempDir('swap-nowrite-');
    const { state, originalSnapshot } = halfAside(dir.path);
    expect(readRestoreState(dir.path)?.phase).toBe(state.phase);
    const events: string[] = [];
    enospcOnMarkerTmp(() => false, events); // record only

    rollbackSwap(dir.path, state);

    // Guards: a redundant write when nothing differs
    expect(events).toEqual([]);
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
  });

  it('still writes the marker when the disk is ahead of memory (the re-assert is not skipped)', () => {
    using dir = disposableTempDir('swap-write-when-ahead-');
    const { state } = diskAheadOfMemory(dir.path);
    const events: string[] = [];
    enospcOnMarkerTmp(() => false, events);

    rollbackSwap(dir.path, state);

    // Guards: dropping the re-assert altogether (b and c would then also fail)
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Marker file mode ───────────────────────────────────────────────────────

const itNonRoot = process.getuid?.() === 0 ? it.skip : it;

describe('writeRestoreState() file mode', () => {
  /** Mode of the tmp file at the moment it is renamed over the marker. */
  function captureTmpModeAtRename(): { modes: number[] } {
    const captured: { modes: number[] } = { modes: [] };
    const real = fs.renameSync.bind(fs);
    jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
      if (String(src).endsWith(RESTORE_STATE_TMP))
        captured.modes.push(fs.statSync(src).mode & 0o777);
      return real(src, dest);
    }) as typeof fs.renameSync);
    return captured;
  }

  itNonRoot('creates the tmp file with mode 0600', () => {
    using dir = disposableTempDir('swap-mode-new-');
    const captured = captureTmpModeAtRename();

    writeRestoreState(dir.path, STATE);

    // Guards: openSync(tmp, 'w') with the default 0666 & ~umask
    expect(captured.modes).toEqual([0o600]);
    expect(fs.statSync(path.join(dir.path, RESTORE_STATE_FILE)).mode & 0o777).toBe(0o600);
  });

  itNonRoot('replaces a stale 0644 tmp file instead of reusing its mode and content', () => {
    using dir = disposableTempDir('swap-mode-stale-');
    const stale = path.join(dir.path, RESTORE_STATE_TMP);
    fs.writeFileSync(
      stale,
      'stale crash leftover that is much longer than the new marker body'.repeat(5),
    );
    fs.chmodSync(stale, 0o644);
    const captured = captureTmpModeAtRename();

    writeRestoreState(dir.path, STATE);

    // Guards: no unlink before open (an existing file keeps its 0644 mode; 'w' truncates only content)
    expect(captured.modes).toEqual([0o600]);
    expect(readRestoreState(dir.path)).toEqual(STATE);
  });
});

// ─── recoverInterruptedRestore ──────────────────────────────────────────────

describe('recoverInterruptedRestore()', () => {
  const DB = 'cornerstone.db';

  it('is a no-op when the data dir does not exist', () => {
    using dir = disposableTempDir('swap-rec-missing-');
    const missing = path.join(dir.path, 'nope');
    const { logger, asFastify } = makeLogger();

    expect(() => recoverInterruptedRestore(missing, DB, asFastify)).not.toThrow();
    // Guards: creating the directory or throwing ENOENT on a first-ever start
    expect(fs.existsSync(missing)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('without a marker sweeps stray artifacts and keeps user data, the live db and sidecars', () => {
    using dir = disposableTempDir('swap-rec-sweep-');
    write(dir.path, DB, 'live');
    write(dir.path, `${DB}-wal`, 'wal');
    write(dir.path, 'photos/a.jpg', 'photo');
    write(dir.path, 'lost+found/keep', 'reserved');
    write(dir.path, 'cornerstone-backup-old.db', 'stray snapshot');
    write(dir.path, BACKUP_MANIFEST_FILE, '{}');
    write(dir.path, `${RESTORE_STAGING_PREFIX}1/x`, 'staged');
    write(dir.path, RESTORE_STATE_TMP, 'tmp');
    const { logger, asFastify } = makeLogger();

    recoverInterruptedRestore(dir.path, DB, asFastify);

    expect(Object.keys(snapshotTree(dir.path)).sort()).toEqual([
      DB,
      `${DB}-wal`,
      'lost+found',
      path.join('lost+found', 'keep'),
      'photos',
      path.join('photos', 'a.jpg'),
    ]);
    // Guards: sweeping too little (each stray) or too much (live db / user data)
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('without a marker keeps a snapshot-patterned file only when it is the live database name', () => {
    using dir = disposableTempDir('swap-rec-livename-');
    // A deployment whose DB file itself matches the snapshot pattern
    write(dir.path, 'cornerstone-backup-live.db', 'live');
    write(dir.path, 'cornerstone-backup-other.db', 'stray');

    recoverInterruptedRestore(dir.path, 'cornerstone-backup-live.db', makeLogger().asFastify);

    // Guards: dropping the `entry !== dbName` exemption (would delete the live database)
    expect(fs.readdirSync(dir.path)).toEqual(['cornerstone-backup-live.db']);
  });

  it('without a marker removes an empty pre-restore directory', () => {
    using dir = disposableTempDir('swap-rec-emptypre-');
    fs.mkdirSync(path.join(dir.path, `${PRE_RESTORE_PREFIX}x`));
    const { logger, asFastify } = makeLogger();

    recoverInterruptedRestore(dir.path, DB, asFastify);

    // Guards: leaving empty pre-restore dirs forever, or warning for a harmless empty one
    expect(fs.readdirSync(dir.path)).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('without a marker keeps a non-empty pre-restore directory (possibly the only copy of the data) and warns', () => {
    using dir = disposableTempDir('swap-rec-nonemptypre-');
    write(dir.path, `${PRE_RESTORE_PREFIX}x/photos/a.jpg`, 'only copy');
    const { logger, asFastify } = makeLogger();

    recoverInterruptedRestore(dir.path, DB, asFastify);

    // Guards: rm -rf of a non-empty pre-restore dir (data loss), and a silent skip
    expect(
      fs.readFileSync(path.join(dir.path, `${PRE_RESTORE_PREFIX}x/photos/a.jpg`), 'utf-8'),
    ).toBe('only copy');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { path: path.join(dir.path, `${PRE_RESTORE_PREFIX}x`) },
      'Leftover pre-restore directory found without a restore marker; leaving it in place',
    );
  });

  it('phase moving-aside with half the originals moved: reinstates every original', () => {
    using dir = disposableTempDir('swap-rec-aside-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    const pre = path.join(dir.path, state.preRestore);
    fs.mkdirSync(pre);
    fs.renameSync(path.join(dir.path, 'photos'), path.join(pre, 'photos'));
    const { logger, asFastify } = makeLogger();

    recoverInterruptedRestore(dir.path, DB, asFastify);

    // Guards: leaving moved-aside originals in pre-restore, or deleting un-moved originals
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(pre)).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      { phase: 'moving-aside' },
      'Interrupted restore was rolled back; original data reinstated',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('phase moving-in with half the restored entries moved: only originals remain', () => {
    using dir = disposableTempDir('swap-rec-in-');
    const { state, originalSnapshot } = buildDataDir(dir.path);
    const pre = path.join(dir.path, state.preRestore);
    fs.mkdirSync(pre);
    for (const e of ['cornerstone.db', 'photos', 'notes.txt']) {
      fs.renameSync(path.join(dir.path, e), path.join(pre, e));
    }
    // Half of the staged entries already moved in; marker says moving-in
    fs.renameSync(
      path.join(dir.path, state.staging, 'cornerstone.db'),
      path.join(dir.path, 'cornerstone.db'),
    );
    fs.renameSync(
      path.join(dir.path, state.staging, 'extra.txt'),
      path.join(dir.path, 'extra.txt'),
    );
    writeRestoreState(dir.path, { ...state, phase: 'moving-in' });
    const { logger, asFastify } = makeLogger();

    recoverInterruptedRestore(dir.path, DB, asFastify);

    // Guards: keeping restored entries (new-db / extra.txt) after the rollback
    expect(originalsOnly(dir.path)).toEqual(originalSnapshot);
    expect(fs.existsSync(path.join(dir.path, 'extra.txt'))).toBe(false);
    expect(fs.existsSync(pre)).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      { phase: 'moving-in' },
      'Interrupted restore was rolled back; original data reinstated',
    );
  });

  it('phase swapped: keeps the restored data and removes staging, pre-restore and the marker', () => {
    using dir = disposableTempDir('swap-rec-swapped-');
    const { state } = buildDataDir(dir.path);
    swapIntoDataDir(dir.path, state);
    const { logger, asFastify } = makeLogger();

    recoverInterruptedRestore(dir.path, DB, asFastify);

    // Guards: rolling back a finished restore (would resurrect the pre-restore data)
    expect(fs.readFileSync(path.join(dir.path, 'cornerstone.db'), 'utf-8')).toBe('new-db');
    expect(fs.readFileSync(path.join(dir.path, 'photos/b.jpg'), 'utf-8')).toBe('new-photo');
    expect(fs.existsSync(path.join(dir.path, 'notes.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.preRestore))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, state.staging))).toBe(false);
    expect(fs.existsSync(path.join(dir.path, RESTORE_STATE_FILE))).toBe(false);
    expect(logger.info).toHaveBeenCalledWith('Completed cleanup of a finished restore');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['bad JSON', '{oops'],
    ['unknown phase', JSON.stringify({ ...STATE, phase: 'nope' })],
    ['staging "../x"', JSON.stringify({ ...STATE, staging: '../x' })],
    ['preRestore "photos"', JSON.stringify({ ...STATE, preRestore: 'photos' })],
  ])('an invalid marker (%s) throws and leaves the data dir untouched', (_label, body) => {
    using dir = disposableTempDir('swap-rec-invalid-');
    write(dir.path, DB, 'live');
    write(dir.path, 'photos/a.jpg', 'photo');
    write(dir.path, `${RESTORE_STAGING_PREFIX}1/x`, 'staged');
    write(dir.path, 'cornerstone-backup-old.db', 'stray');
    write(dir.path, RESTORE_STATE_FILE, body);
    const before = snapshotTree(dir.path);

    expect(() => recoverInterruptedRestore(dir.path, DB, makeLogger().asFastify)).toThrow(
      /Invalid restore marker/,
    );
    // Guards: falling through to the no-marker sweep (or a guessed rollback) on an unreadable marker
    expect(snapshotTree(dir.path)).toEqual(before);
  });
});
