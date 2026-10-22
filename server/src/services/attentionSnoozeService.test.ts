/**
 * "Not now" storage of the attention service (#2229, contract 18 key `attention.snoozed`).
 * Real in-memory SQLite with migrations; synthetic users and keys.
 *
 * Mutations these tests catch:
 *  - a snooze of 6 or 8 days instead of 7, an inclusive "until" (row hidden on until itself);
 *  - no pruning of ended snoozes (`until <= today`) on write;
 *  - the 500-key cap evicting the wrong entries (latest instead of earliest, key order of ties,
 *    or evicting when merely re-snoozing an existing key at the cap);
 *  - a 500 -> 501 or 16384 -> 16385 boundary shift in the strict validator;
 *  - a lenient read that throws (bad JSON, array, bad key, bad date);
 *  - a write outside one transaction; DELETE leaving an empty `{}` row behind;
 *  - one user's snooze touching another user's row.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { ATTENTION_SNOOZED_PREFERENCE_KEY } from '@cornerstone/shared';
import {
  readSnoozes,
  snooze,
  unsnooze,
  validateSnoozedPreferenceValue,
} from './attentionSnoozeService.js';

const TODAY = '2026-03-10';
const KEY_A = 'N4:invoice:inv-1';
const KEY_B = 'N1:work_item:wi-1';

type Db = BetterSQLite3Database<typeof schema>;

describe('attentionSnoozeService', () => {
  let sqlite: Database.Database;
  let db: Db;

  function insertUser(id: string) {
    const now = '2026-03-01T00:00:00.000Z';
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.test`,
        displayName: `User ${id}`,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function putRaw(userId: string, value: string) {
    const now = '2026-03-01T00:00:00.000Z';
    db.insert(schema.userPreferences)
      .values({
        userId,
        key: ATTENTION_SNOOZED_PREFERENCE_KEY,
        value,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function rawOf(userId: string): string | null {
    const row = db
      .select()
      .from(schema.userPreferences)
      .where(
        and(
          eq(schema.userPreferences.userId, userId),
          eq(schema.userPreferences.key, ATTENTION_SNOOZED_PREFERENCE_KEY),
        ),
      )
      .get();
    return row ? row.value : null;
  }

  function storedOf(userId: string): Record<string, string> {
    const raw = rawOf(userId);
    return raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    insertUser('u1');
    insertUser('u2');
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── readSnoozes (lenient) ──────────────────────────────────────────────────

  describe('readSnoozes', () => {
    it('returns an empty map when the user has no snooze row', () => {
      expect(readSnoozes(db, 'u1').size).toBe(0);
    });

    it('reads a valid value', () => {
      putRaw('u1', JSON.stringify({ [KEY_A]: '2026-03-17', [KEY_B]: '2026-03-12' }));
      expect([...readSnoozes(db, 'u1')]).toEqual([
        [KEY_A, '2026-03-17'],
        [KEY_B, '2026-03-12'],
      ]);
    });

    it.each([
      ['unparsable JSON', '{not json'],
      ['an array', '["N1:work_item:wi-1"]'],
      ['null', 'null'],
      ['a string', '"2026-03-17"'],
      ['a number', '17'],
    ])('ignores %s without throwing', (_label, raw) => {
      putRaw('u1', raw);
      expect(readSnoozes(db, 'u1').size).toBe(0);
    });

    it('ignores entries with a bad key, a bad date or a non-string value, keeping the good ones', () => {
      putRaw(
        'u1',
        JSON.stringify({
          [KEY_A]: '2026-03-17',
          'H3:diary_entry:d-1': '2026-03-17',
          'not a key': '2026-03-17',
          [KEY_B]: '2026-02-30',
          'N5:invoice:i2': 20260317,
          'N5:invoice:i3': '17.03.2026',
          'N5:invoice:i4': null,
        }),
      );
      expect([...readSnoozes(db, 'u1')]).toEqual([[KEY_A, '2026-03-17']]);
    });

    it('reads only the caller (per-user isolation)', () => {
      putRaw('u1', JSON.stringify({ [KEY_A]: '2026-03-17' }));
      expect(readSnoozes(db, 'u2').size).toBe(0);
    });
  });

  // ─── validateSnoozedPreferenceValue (strict) ────────────────────────────────

  describe('validateSnoozedPreferenceValue', () => {
    const fails = (value: string, reason: string) => {
      let caught: unknown;
      try {
        validateSnoozedPreferenceValue(value);
      } catch (e) {
        caught = e;
      }
      expect(caught).toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: { key: 'attention.snoozed', reason },
      });
    };

    it('accepts an empty object and a valid object', () => {
      expect(() => validateSnoozedPreferenceValue('{}')).not.toThrow();
      expect(() =>
        validateSnoozedPreferenceValue(JSON.stringify({ [KEY_A]: '2026-03-17' })),
      ).not.toThrow();
    });

    it('rejects unparsable JSON', () => fails('{nope', 'not_json'));
    it.each(['[]', 'null', '"x"', '5', 'true'])('rejects %s (not a plain object)', (v) =>
      fails(v, 'not_object'),
    );
    it('rejects a bad key', () =>
      fails(JSON.stringify({ 'H3:diary_entry:x': '2026-03-17' }), 'bad_key'));
    it('rejects a key with a slash', () =>
      fails(JSON.stringify({ 'N1:work_item:a/b': '2026-03-17' }), 'bad_key'));
    it('rejects a date that is not a real date', () =>
      fails(JSON.stringify({ [KEY_A]: '2026-02-30' }), 'bad_date'));
    it('rejects a date in another format', () =>
      fails(JSON.stringify({ [KEY_A]: '10.03.2026' }), 'bad_date'));
    it('rejects a non-string date', () => fails(JSON.stringify({ [KEY_A]: 20260317 }), 'bad_date'));

    const entries = (n: number) =>
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: n }, (_, i) => [`N1:work_item:${i}`, '2026-03-17']),
        ),
      );

    it('accepts 500 entries and rejects 501', () => {
      const ok = entries(500);
      expect(ok.length).toBeLessThanOrEqual(16384);
      expect(() => validateSnoozedPreferenceValue(ok)).not.toThrow();
      const tooMany = entries(501);
      expect(tooMany.length).toBeLessThanOrEqual(16384);
      fails(tooMany, 'too_many_keys');
    });

    it('accepts a 16384-character value and rejects 16385', () => {
      const pad = (n: number) => `{}${' '.repeat(n - 2)}`;
      expect(pad(16384)).toHaveLength(16384);
      expect(() => validateSnoozedPreferenceValue(pad(16384))).not.toThrow();
      fails(pad(16385), 'too_large');
    });
  });

  // ─── snooze ─────────────────────────────────────────────────────────────────

  describe('snooze', () => {
    it('hides the key until today + 7 days and returns it', () => {
      expect(snooze(db, 'u1', KEY_A, TODAY)).toEqual({ key: KEY_A, snoozedUntil: '2026-03-17' });
      expect(storedOf('u1')).toEqual({ [KEY_A]: '2026-03-17' });
    });

    it('crosses a month end correctly', () => {
      expect(snooze(db, 'u1', KEY_A, '2026-03-28').snoozedUntil).toBe('2026-04-04');
    });

    it('does not require the key to be a current row (no existence oracle)', () => {
      expect(() => snooze(db, 'u1', 'N11:subsidy_program:never-existed', TODAY)).not.toThrow();
    });

    it('re-snoozing resets the key to today + 7', () => {
      snooze(db, 'u1', KEY_A, '2026-03-08');
      expect(storedOf('u1')[KEY_A]).toBe('2026-03-15');
      snooze(db, 'u1', KEY_A, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_A]: '2026-03-17' });
    });

    it('keeps other live snoozes and adds the new one', () => {
      snooze(db, 'u1', KEY_A, TODAY);
      snooze(db, 'u1', KEY_B, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_A]: '2026-03-17', [KEY_B]: '2026-03-17' });
    });

    it('prunes ended snoozes on write: until <= today is dropped, until = today + 1 stays', () => {
      putRaw(
        'u1',
        JSON.stringify({
          'N5:invoice:ended-before': '2026-03-09',
          'N5:invoice:ends-today': TODAY,
          'N5:invoice:ends-tomorrow': '2026-03-11',
        }),
      );
      snooze(db, 'u1', KEY_A, TODAY);
      expect(Object.keys(storedOf('u1')).sort()).toEqual(
        [KEY_A, 'N5:invoice:ends-tomorrow'].sort(),
      );
    });

    it('drops unusable stored entries when rewriting (lenient read, clean write)', () => {
      putRaw('u1', JSON.stringify({ bogus: 'x', [KEY_B]: '2026-03-20' }));
      snooze(db, 'u1', KEY_A, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_B]: '2026-03-20', [KEY_A]: '2026-03-17' });
    });

    it('recovers from a corrupt stored value by starting afresh', () => {
      putRaw('u1', '{broken');
      snooze(db, 'u1', KEY_A, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_A]: '2026-03-17' });
    });

    it('never touches another user (per-user isolation)', () => {
      snooze(db, 'u1', KEY_A, TODAY);
      expect(rawOf('u2')).toBeNull();
      snooze(db, 'u2', KEY_B, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_A]: '2026-03-17' });
      expect(storedOf('u2')).toEqual({ [KEY_B]: '2026-03-17' });
    });

    describe('500-key cap', () => {
      const id = (i: number) => `N1:work_item:${String(i).padStart(3, '0')}`;
      function seedFull() {
        // k0000..k0002 share the earliest end (ties -> key ascending); the rest end later
        const value: Record<string, string> = {};
        for (let i = 0; i < 500; i++) {
          value[id(i)] = i < 3 ? '2026-03-11' : `2026-03-${String(12 + (i % 15)).padStart(2, '0')}`;
        }
        putRaw('u1', JSON.stringify(value));
        return value;
      }

      it('evicts the entry with the earliest end (ties: key ascending) to fit a new key', () => {
        seedFull();
        snooze(db, 'u1', KEY_A, TODAY);
        const stored = storedOf('u1');
        expect(Object.keys(stored)).toHaveLength(500);
        expect(stored[KEY_A]).toBe('2026-03-17');
        expect(stored[id(0)]).toBeUndefined();
        expect(stored[id(1)]).toBe('2026-03-11');
        expect(stored[id(2)]).toBe('2026-03-11');
      });

      it('evicts exactly one entry per new key, in the same order', () => {
        seedFull();
        snooze(db, 'u1', KEY_A, TODAY);
        snooze(db, 'u1', KEY_B, TODAY);
        const stored = storedOf('u1');
        expect(Object.keys(stored)).toHaveLength(500);
        expect(stored[id(0)]).toBeUndefined();
        expect(stored[id(1)]).toBeUndefined();
        expect(stored[id(2)]).toBe('2026-03-11');
      });

      it('re-snoozing an existing key at the cap evicts nothing', () => {
        const seeded = seedFull();
        snooze(db, 'u1', id(499), TODAY);
        const stored = storedOf('u1');
        expect(Object.keys(stored)).toHaveLength(500);
        expect(stored[id(0)]).toBe(seeded[id(0)]);
        expect(stored[id(499)]).toBe('2026-03-17');
      });

      it('prefers pruning ended entries over evicting live ones', () => {
        const seeded = seedFull();
        // make k0003 an ended snooze: pruned, so no live entry needs to be evicted
        putEnded(seeded);
        snooze(db, 'u1', KEY_A, TODAY);
        const stored = storedOf('u1');
        expect(Object.keys(stored)).toHaveLength(500);
        expect(stored[id(0)]).toBe('2026-03-11');
        expect(stored[id(3)]).toBeUndefined();
      });

      function putEnded(seeded: Record<string, string>) {
        db.update(schema.userPreferences)
          .set({ value: JSON.stringify({ ...seeded, [id(3)]: '2026-03-09' }) })
          .where(eq(schema.userPreferences.userId, 'u1'))
          .run();
      }
    });
  });

  // ─── unsnooze ───────────────────────────────────────────────────────────────

  describe('unsnooze', () => {
    it('removes the key and keeps the others', () => {
      snooze(db, 'u1', KEY_A, TODAY);
      snooze(db, 'u1', KEY_B, TODAY);
      unsnooze(db, 'u1', KEY_A, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_B]: '2026-03-17' });
    });

    it('deletes the preference row when nothing is left (no empty {})', () => {
      snooze(db, 'u1', KEY_A, TODAY);
      unsnooze(db, 'u1', KEY_A, TODAY);
      expect(rawOf('u1')).toBeNull();
    });

    it('is idempotent: unknown key, no row, repeated calls', () => {
      expect(() => unsnooze(db, 'u1', KEY_A, TODAY)).not.toThrow();
      expect(rawOf('u1')).toBeNull();
      snooze(db, 'u1', KEY_B, TODAY);
      unsnooze(db, 'u1', KEY_A, TODAY);
      unsnooze(db, 'u1', KEY_A, TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_B]: '2026-03-17' });
    });

    it('prunes ended snoozes on write', () => {
      putRaw('u1', JSON.stringify({ [KEY_A]: '2026-03-09', [KEY_B]: '2026-03-20' }));
      unsnooze(db, 'u1', 'N5:invoice:other', TODAY);
      expect(storedOf('u1')).toEqual({ [KEY_B]: '2026-03-20' });
    });

    it('removing the only (ended) entry deletes the row', () => {
      putRaw('u1', JSON.stringify({ [KEY_A]: '2026-03-09' }));
      unsnooze(db, 'u1', KEY_B, TODAY);
      expect(rawOf('u1')).toBeNull();
    });

    it("never touches another user's snooze", () => {
      snooze(db, 'u1', KEY_A, TODAY);
      snooze(db, 'u2', KEY_A, TODAY);
      unsnooze(db, 'u1', KEY_A, TODAY);
      expect(rawOf('u1')).toBeNull();
      expect(storedOf('u2')).toEqual({ [KEY_A]: '2026-03-17' });
    });
  });

  // ─── 16 KB byte cap (the stored value always passes the PATCH validator) ────

  describe('byte cap', () => {
    const longKey = (i: number) => `N1:work_item:${String(i).padStart(4, '0')}${'x'.repeat(60)}`;

    function seedLong(n: number) {
      const value: Record<string, string> = {};
      for (let i = 0; i < n; i++) {
        // earlier index = earlier end, so eviction order is predictable
        const day = 11 + Math.floor(i / 40);
        value[longKey(i)] = `2026-03-${String(day).padStart(2, '0')}`;
      }
      putRaw('u1', JSON.stringify(value));
    }

    it('snooze with 500 max-length keys stores at most 16384 characters, validates, and keeps the new key', () => {
      seedLong(500);
      const newKey = `N4:invoice:${'n'.repeat(64)}`;
      snooze(db, 'u1', newKey, TODAY);
      const raw = rawOf('u1')!;
      expect(raw.length).toBeLessThanOrEqual(16384);
      expect(() => validateSnoozedPreferenceValue(raw)).not.toThrow();
      const stored = JSON.parse(raw) as Record<string, string>;
      expect(stored[newKey]).toBe('2026-03-17');
      expect(Object.keys(stored).length).toBeLessThan(500);
    });

    it('evicts the earliest-ending entries first (ties by key) and never the new entry', () => {
      seedLong(500);
      const newKey = `N4:invoice:${'n'.repeat(64)}`;
      snooze(db, 'u1', newKey, TODAY);
      const stored = JSON.parse(rawOf('u1')!) as Record<string, string>;
      const kept = Object.keys(stored).filter((k) => k !== newKey);
      // survivors are a suffix of the (until, key) order: everything dropped sorts before them
      const survivorsMin = kept.map((k) => longKey(0) && k).sort()[0]!;
      expect(stored[longKey(0)]).toBeUndefined();
      expect(stored[longKey(499)]).toBeDefined();
      const idx = (k: string) =>
        Number(k.slice('N1:work_item:'.length, 'N1:work_item:'.length + 4));
      const indexes = kept.map(idx).sort((a, b) => a - b);
      expect(indexes[indexes.length - 1]).toBe(499);
      expect(indexes).toEqual(Array.from({ length: indexes.length }, (_, i) => indexes[0]! + i));
      expect(survivorsMin).toBeDefined();
    });

    it('unsnooze also keeps an oversized stored value within the byte cap', () => {
      seedLong(500);
      unsnooze(db, 'u1', 'N9:invoice:not-there', TODAY);
      const raw = rawOf('u1')!;
      expect(raw.length).toBeLessThanOrEqual(16384);
      expect(() => validateSnoozedPreferenceValue(raw)).not.toThrow();
    });

    it('does not evict anything when the value already fits', () => {
      seedLong(50);
      snooze(db, 'u1', KEY_A, TODAY);
      expect(Object.keys(storedOf('u1'))).toHaveLength(51);
    });
  });

  // ─── Transaction ────────────────────────────────────────────────────────────

  describe('transaction', () => {
    it('snooze and unsnooze each run read-modify-write inside exactly one db.transaction', () => {
      const spy = jest.spyOn(db, 'transaction');
      snooze(db, 'u1', KEY_A, TODAY);
      expect(spy).toHaveBeenCalledTimes(1);
      unsnooze(db, 'u1', KEY_A, TODAY);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('a failing write rolls back and leaves the previous value intact', () => {
      snooze(db, 'u1', KEY_A, TODAY);
      sqlite.exec(
        `CREATE TRIGGER fail_prefs_update BEFORE UPDATE ON user_preferences
         BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`,
      );
      expect(() => snooze(db, 'u1', KEY_B, TODAY)).toThrow(/forced failure/);
      sqlite.exec('DROP TRIGGER fail_prefs_update');
      expect(storedOf('u1')).toEqual({ [KEY_A]: '2026-03-17' });
    });
  });
});
