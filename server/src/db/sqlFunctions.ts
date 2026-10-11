import type Database from 'better-sqlite3';
import { foldSearchText, searchDigits } from '@cornerstone/shared';

/**
 * Registers the application-defined SQL functions on a connection:
 * - `fold(text)`: case/accent/German-digraph-insensitive form (same as the client's fold)
 * - `digits(text)`: digits only, for phone number matching
 * Both return NULL for NULL input.
 */
export function registerSqlFunctions(sqlite: Database.Database): void {
  sqlite.function('fold', { deterministic: true }, (v: unknown) =>
    v == null ? null : foldSearchText(String(v)),
  );
  sqlite.function('digits', { deterministic: true }, (v: unknown) =>
    v == null ? null : searchDigits(String(v)),
  );
}
