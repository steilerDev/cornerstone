/**
 * Disposable helpers for test resource cleanup.
 *
 * Implements the Disposable protocol so tests can use `using` declarations
 * for guaranteed cleanup on scope exit, including when exceptions are thrown.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type DisposableDatabase = Database & Disposable;

/**
 * Opens a better-sqlite3 database and returns it as a Disposable.
 * Close errors are swallowed (better-sqlite3 throws on double-close,
 * which is harmless in cleanup).
 */
export function disposableDb(filename: string = ':memory:'): DisposableDatabase {
  const db = new BetterSqlite3(filename) as DisposableDatabase;
  db[Symbol.dispose] = () => {
    try {
      if (db.open) {
        db.close();
      }
    } catch {
      // Ignore: already closed or non-actionable error
    }
  };
  return db;
}

export type DisposableTempDir = { readonly path: string } & Disposable;

/**
 * Creates a temporary directory via mkdtempSync. On dispose, recursively deletes it.
 * Deletion errors are swallowed (ENOENT is already handled by force: true; other
 * errors are non-actionable in a test cleanup context).
 */
export function disposableTempDir(prefix: string = 'cornerstone-test-'): DisposableTempDir {
  const dirPath = mkdtempSync(join(tmpdir(), prefix));
  return {
    get path(): string {
      return dirPath;
    },
    [Symbol.dispose](): void {
      try {
        rmSync(dirPath, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    },
  };
}
