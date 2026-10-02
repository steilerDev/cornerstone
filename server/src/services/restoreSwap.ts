/**
 * Restore swap machinery: reserved names, crash-safe restore marker, synchronous
 * content swap of the data directory, rollback, finalize and startup recovery.
 *
 * The data directory itself is never renamed (it is typically a Docker VOLUME mount
 * point); only its entries are moved. All fs access is synchronous and goes through the
 * default `fs` import so tests can spy on individual functions.
 *
 * This module must not import from backupService (the db plugin imports it).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';

export const RESTORE_STAGING_PREFIX = '.restore-staging-';
export const PRE_RESTORE_PREFIX = '.pre-restore-';
export const RESTORE_STATE_FILE = '.restore-state.json';
export const RESTORE_STATE_TMP = '.restore-state.json.tmp';
export const BACKUP_MANIFEST_FILE = 'cornerstone-backup-manifest.json';
export const BACKUP_SNAPSHOT_PATTERN = /^cornerstone-backup-.+\.db$/;

/** Names the restore machinery owns; never archived, never moved by the swap. */
export function isRestoreReservedEntry(name: string): boolean {
  return name.startsWith('.restore-') || name.startsWith('.pre-restore-') || name === 'lost+found';
}

/** SQLite sidecar file names for a database file name. */
export function dbSidecars(dbName: string): string[] {
  return [`${dbName}-wal`, `${dbName}-shm`, `${dbName}-journal`];
}

/** Top-level dataDir entries excluded from a v2 archive. */
export function isExcludedFromArchive(name: string, dbName: string, snapshotName: string): boolean {
  return (
    isRestoreReservedEntry(name) ||
    name === dbName ||
    dbSidecars(dbName).includes(name) ||
    (BACKUP_SNAPSHOT_PATTERN.test(name) && name !== snapshotName)
  );
}

export type RestorePhase = 'moving-aside' | 'moving-in' | 'swapped';

/** Marker contents; staging and preRestore are basenames inside the data directory. */
export interface RestoreState {
  phase: RestorePhase;
  staging: string;
  preRestore: string;
}

const PHASES: readonly string[] = ['moving-aside', 'moving-in', 'swapped'];

function isBareName(value: unknown, prefix: string): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(prefix) &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

/** Atomically (re)write the marker: tmp file, fsync, rename, fsync the directory. */
export function writeRestoreState(dataDir: string, state: RestoreState): void {
  const tmpPath = path.join(dataDir, RESTORE_STATE_TMP);
  const markerPath = path.join(dataDir, RESTORE_STATE_FILE);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(state));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, markerPath);
  const dirFd = fs.openSync(dataDir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
}

/** Read the marker. Returns null when absent; throws when present but invalid. */
export function readRestoreState(dataDir: string): RestoreState | null {
  const markerPath = path.join(dataDir, RESTORE_STATE_FILE);
  let raw: string;
  try {
    raw = fs.readFileSync(markerPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const invalid = () =>
    new Error(`Invalid restore marker ${markerPath} — inspect it manually before restarting`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (typeof parsed !== 'object' || parsed === null) throw invalid();
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.phase !== 'string' ||
    !PHASES.includes(candidate.phase) ||
    !isBareName(candidate.staging, RESTORE_STAGING_PREFIX) ||
    !isBareName(candidate.preRestore, PRE_RESTORE_PREFIX)
  ) {
    throw invalid();
  }
  return {
    phase: candidate.phase as RestorePhase,
    staging: candidate.staging,
    preRestore: candidate.preRestore,
  };
}

/**
 * Move the originals aside, then move the staged entries in.
 * Precondition: the marker was already written with phase 'moving-aside'.
 */
export function swapIntoDataDir(dataDir: string, state: RestoreState): void {
  const staging = path.join(dataDir, state.staging);
  const pre = path.join(dataDir, state.preRestore);

  fs.mkdirSync(pre);
  for (const entry of fs.readdirSync(dataDir)) {
    if (isRestoreReservedEntry(entry)) continue;
    fs.renameSync(path.join(dataDir, entry), path.join(pre, entry));
  }
  writeRestoreState(dataDir, { ...state, phase: 'moving-in' });
  state.phase = 'moving-in';

  for (const entry of fs.readdirSync(staging)) {
    fs.renameSync(path.join(staging, entry), path.join(dataDir, entry));
  }
  writeRestoreState(dataDir, { ...state, phase: 'swapped' });
  state.phase = 'swapped';
}

/** Reinstate the original entries and discard restored ones. The marker is deleted last. */
export function rollbackSwap(dataDir: string, state: RestoreState): void {
  if (state.phase === 'swapped') {
    throw new Error('Cannot roll back a completed swap');
  }
  const staging = path.join(dataDir, state.staging);
  const pre = path.join(dataDir, state.preRestore);

  // Re-assert the phase being rolled back from on disk BEFORE any destructive step. The disk may
  // be one flip ahead of memory (a flip whose rename landed but whose fsync threw). If this write
  // throws, nothing has been touched and whatever the marker says remains consistent with the
  // data: 'swapped' means every staged entry was moved in, so finalizing keeps the restored data.
  writeRestoreState(dataDir, { ...state });

  if (state.phase === 'moving-in') {
    for (const entry of fs.readdirSync(dataDir)) {
      if (isRestoreReservedEntry(entry)) continue;
      fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true });
    }
    // Restored entries are gone: from here on every non-reserved entry in dataDir is original.
    // Persist that before moving originals back, so a crash mid move-back re-runs as
    // 'moving-aside' (which never deletes originals) instead of re-deleting restored-back originals.
    writeRestoreState(dataDir, { ...state, phase: 'moving-aside' });
    state.phase = 'moving-aside';
  }

  if (fs.existsSync(pre)) {
    for (const entry of fs.readdirSync(pre)) {
      const target = path.join(dataDir, entry);
      // Only possible as a re-creation by an in-flight request
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
      fs.renameSync(path.join(pre, entry), target);
    }
  }

  fs.rmSync(staging, { recursive: true, force: true });
  if (fs.existsSync(pre)) {
    fs.rmdirSync(pre);
  }
  fs.unlinkSync(path.join(dataDir, RESTORE_STATE_FILE));
}

/** Delete staging and the moved-aside originals. The marker is deleted last. */
export function finalizeSwap(dataDir: string, state: RestoreState): void {
  fs.rmSync(path.join(dataDir, state.staging), { recursive: true, force: true });
  fs.rmSync(path.join(dataDir, state.preRestore), { recursive: true, force: true });
  fs.unlinkSync(path.join(dataDir, RESTORE_STATE_FILE));
}

/**
 * Startup recovery: finish or roll back an interrupted restore, and sweep stray
 * artifacts when no marker exists. Throws on an invalid marker.
 */
export function recoverInterruptedRestore(
  dataDir: string,
  dbName: string,
  logger: FastifyBaseLogger,
): void {
  if (!fs.existsSync(dataDir)) return;

  const state = readRestoreState(dataDir);

  if (state === null) {
    for (const entry of fs.readdirSync(dataDir)) {
      const full = path.join(dataDir, entry);
      if (entry.startsWith(PRE_RESTORE_PREFIX)) {
        try {
          fs.rmdirSync(full);
        } catch {
          logger.warn(
            { path: full },
            'Leftover pre-restore directory found without a restore marker; leaving it in place',
          );
        }
        continue;
      }
      if (
        entry.startsWith(RESTORE_STAGING_PREFIX) ||
        entry === RESTORE_STATE_TMP ||
        entry === BACKUP_MANIFEST_FILE ||
        (BACKUP_SNAPSHOT_PATTERN.test(entry) && entry !== dbName)
      ) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
    return;
  }

  if (state.phase === 'swapped') {
    finalizeSwap(dataDir, state);
    logger.info('Completed cleanup of a finished restore');
    return;
  }

  const phase = state.phase;
  rollbackSwap(dataDir, state);
  logger.warn({ phase }, 'Interrupted restore was rolled back; original data reinstated');
}
