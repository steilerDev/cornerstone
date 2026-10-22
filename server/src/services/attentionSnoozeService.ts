/**
 * "Not now" storage for the attention service (#2229, contract 18 key `attention.snoozed`).
 *
 * One `user_preferences` row per user: JSON `{ "<row key>": "YYYY-MM-DD" }`, the date being the
 * day the snooze ends (exclusive: the row is hidden while `today < until`). Reads are lenient so
 * a corrupt value can never break the Home page; writes are bounded and transactional.
 */

import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { userPreferences } from '../db/schema.js';
import {
  ATTENTION_NOT_NOW_DAYS,
  ATTENTION_SNOOZE_MAX_BYTES,
  ATTENTION_SNOOZE_MAX_KEYS,
  ATTENTION_SNOOZED_PREFERENCE_KEY,
  isAttentionRowKey,
} from '@cornerstone/shared';
import type { AttentionNotNowResponse } from '@cornerstone/shared';
import { ValidationError } from '../errors/AppError.js';
import { deletePreference, upsertPreference } from './preferencesService.js';
import { addDaysUtc } from './shared/holdsUp.js';
import { isValidIsoDate } from './shared/validators.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The caller's snoozes (row key -> until). Lenient: anything unusable is ignored. */
export function readSnoozes(db: Pick<DbType, 'select'>, userId: string): Map<string, string> {
  const snoozes = new Map<string, string>();
  const row = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.key, ATTENTION_SNOOZED_PREFERENCE_KEY),
      ),
    )
    .get();
  if (!row) return snoozes;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return snoozes;
  }
  if (!isPlainObject(parsed)) return snoozes;
  for (const [key, until] of Object.entries(parsed)) {
    if (isAttentionRowKey(key) && typeof until === 'string' && isValidIsoDate(until)) {
      snoozes.set(key, until);
    }
  }
  return snoozes;
}

/**
 * Strict validation of a client-written `attention.snoozed` value (PATCH preferences).
 * Throws `ValidationError` (details `{ key }`) on any violation.
 */
export function validateSnoozedPreferenceValue(value: string): void {
  const fail = (reason: string): never => {
    throw new ValidationError(`Invalid ${ATTENTION_SNOOZED_PREFERENCE_KEY} value`, {
      key: ATTENTION_SNOOZED_PREFERENCE_KEY,
      reason,
    });
  };

  if (value.length > ATTENTION_SNOOZE_MAX_BYTES) fail('too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail('not_json');
  }
  if (!isPlainObject(parsed)) return fail('not_object');
  const entries = Object.entries(parsed);
  if (entries.length > ATTENTION_SNOOZE_MAX_KEYS) fail('too_many_keys');
  for (const [key, until] of entries) {
    if (!isAttentionRowKey(key)) fail('bad_key');
    if (typeof until !== 'string' || !isValidIsoDate(until)) fail('bad_date');
  }
}

/**
 * Drop ended snoozes, add `extra` (never evicted), then evict the earliest-ending snoozes until
 * the value fits both the key cap and the byte cap (JSON length).
 */
function pruned(
  snoozes: Map<string, string>,
  today: string,
  extra?: [string, string],
): Array<[string, string]> {
  const live = [...snoozes].filter(([, until]) => until > today);
  // Map keys are unique, so (until, key) is a strict total order
  live.sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : 1));
  const tail: Array<[string, string]> = extra ? [extra] : [];
  const build = (drop: number): Array<[string, string]> => [...live.slice(drop), ...tail];

  let drop = 0;
  while (
    drop < live.length &&
    (live.length - drop + tail.length > ATTENTION_SNOOZE_MAX_KEYS ||
      JSON.stringify(Object.fromEntries(build(drop))).length > ATTENTION_SNOOZE_MAX_BYTES)
  ) {
    drop += 1;
  }
  return build(drop);
}

function write(db: DbType, userId: string, entries: Array<[string, string]>): void {
  if (entries.length === 0) {
    deletePreference(db, userId, ATTENTION_SNOOZED_PREFERENCE_KEY);
    return;
  }
  upsertPreference(
    db,
    userId,
    ATTENTION_SNOOZED_PREFERENCE_KEY,
    JSON.stringify(Object.fromEntries(entries)),
  );
}

/** Snooze `key` for the caller until today + 7 days (re-snoozing resets it). */
export function snooze(
  db: DbType,
  userId: string,
  key: string,
  today: string,
): AttentionNotNowResponse {
  const snoozedUntil = addDaysUtc(today, ATTENTION_NOT_NOW_DAYS);
  db.transaction(() => {
    const current = readSnoozes(db, userId);
    current.delete(key);
    write(db, userId, pruned(current, today, [key, snoozedUntil]));
  });
  return { key, snoozedUntil };
}

/** Remove the caller's snooze for `key` (the Undo). Idempotent. */
export function unsnooze(db: DbType, userId: string, key: string, today: string): void {
  db.transaction(() => {
    const current = readSnoozes(db, userId);
    current.delete(key);
    write(db, userId, pruned(current, today));
  });
}
