/**
 * Database-layer disposable helpers.
 *
 * Implements the Disposable protocol (Symbol.dispose) for SQLite database
 * operations that need guaranteed cleanup on scope exit, including on thrown
 * exceptions. Safe for production and test code.
 */

import type { Database } from 'better-sqlite3';

/**
 * Disables SQLite foreign key enforcement for the duration of a `using` scope.
 * FK is OFF on construction, ON on dispose. On any exit path (including throw)
 * FK is re-enabled. Matches the existing migrate.ts convention of unconditionally
 * re-enabling FK at the end of each migration.
 */
export function foreignKeysDisabled(db: Database): Disposable {
  db.pragma('foreign_keys = OFF');
  return {
    [Symbol.dispose](): void {
      db.pragma('foreign_keys = ON');
    },
  };
}
