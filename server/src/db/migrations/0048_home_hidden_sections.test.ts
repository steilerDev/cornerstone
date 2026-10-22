/**
 * Migration integration tests for 0048_home_hidden_sections.sql (#2230, contract 18).
 *
 * The migration is data-only: it maps each user's legacy `dashboard.hiddenCards` preference to the
 * new `home.hiddenSections` preference. A section is hidden only if EVERY old card that maps into
 * it was hidden; it never touches the legacy row, never overwrites an existing new row, writes
 * nothing when no section qualifies, ignores malformed values without failing, and is idempotent.
 * All fixture data is synthetic.
 *
 * Mutations these tests catch:
 *  - "any" instead of "all" cards of a group hiding its section;
 *  - the `recent-diary` card not mapping to latest-from-site;
 *  - a row inserted with `[]` when nothing qualifies;
 *  - the stored array order or spacing differing from JSON.stringify of the tuple order;
 *  - an existing home.hiddenSections row overwritten, or the legacy row changed / deleted;
 *  - malformed JSON, non-arrays or non-string members aborting the migration or mapping wrongly;
 *  - one user's cards leaking into another user's row;
 *  - a second run inserting again, or failing on the UNIQUE(user_id, key) constraint.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { HOME_HIDEABLE_SECTION_IDS } from '@cornerstone/shared';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET_MIGRATION = '0048_home_hidden_sections.sql';

const LEGACY_KEY = 'dashboard.hiddenCards';
const NEW_KEY = 'home.hiddenSections';
const TS = '2026-03-01T10:00:00.000Z';

const THIS_WEEK_CARDS = ['upcoming-milestones', 'critical-path', 'mini-gantt'];
const PULSE_CARDS = ['budget-summary', 'work-item-progress', 'invoice-pipeline'];
const LATEST_CARDS = ['recent-diary'];

/** Apply every migration sorting before TARGET_MIGRATION (derived from the real directory). */
function setupPreMigrationDb(db: Database.Database): void {
  const preFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0048-test-'));
  const symlinks: string[] = [];
  for (const file of preFiles) {
    const linkPath = join(tempDir, file);
    symlinkSync(join(MIGRATIONS_DIR, file), linkPath);
    symlinks.push(linkPath);
  }

  try {
    runMigrations(db, tempDir);
  } finally {
    for (const linkPath of symlinks) {
      if (existsSync(linkPath)) unlinkSync(linkPath);
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function targetSql(): string {
  return readFileSync(join(MIGRATIONS_DIR, TARGET_MIGRATION), 'utf-8');
}

interface PrefRow {
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

describe('Migration 0048: home hidden sections', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    setupPreMigrationDb(db);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  function user(id: string): string {
    db.prepare(
      `INSERT INTO users (id, email, display_name, role, auth_provider, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, 'member', 'local', 'x', ?, ?)`,
    ).run(id, `${id}@example.test`, `Person ${id}`, TS, TS);
    return id;
  }

  function pref(userId: string, key: string, value: string): void {
    db.prepare(
      `INSERT INTO user_preferences (user_id, key, value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(userId, key, value, TS, TS);
  }

  /** A user whose legacy hidden cards are exactly `cards` (stored as JSON). */
  function userWithCards(id: string, cards: unknown): string {
    user(id);
    pref(id, LEGACY_KEY, typeof cards === 'string' ? cards : JSON.stringify(cards));
    return id;
  }

  function rows(userId: string, key: string): PrefRow[] {
    return db
      .prepare('SELECT * FROM user_preferences WHERE user_id = ? AND key = ? ORDER BY id')
      .all(userId, key) as PrefRow[];
  }

  function hidden(userId: string): string | null {
    const found = rows(userId, NEW_KEY);
    expect(found.length).toBeLessThanOrEqual(1);
    return found[0]?.value ?? null;
  }

  function migrate(): void {
    db.exec(targetSql());
  }

  // ─── Mapping ───────────────────────────────────────────────────────────────

  describe('mapping', () => {
    it('hides all three sections when every mapped card was hidden', () => {
      userWithCards('u1', [...THIS_WEEK_CARDS, ...PULSE_CARDS, ...LATEST_CARDS]);
      migrate();
      expect(hidden('u1')).toBe('["this-week","pulse","latest-from-site"]');
    });

    it('hides this-week only when all of upcoming-milestones, critical-path and mini-gantt are hidden', () => {
      userWithCards('u1', THIS_WEEK_CARDS);
      migrate();
      expect(hidden('u1')).toBe('["this-week"]');
    });

    it('hides pulse only when all of budget-summary, work-item-progress and invoice-pipeline are hidden', () => {
      userWithCards('u1', PULSE_CARDS);
      migrate();
      expect(hidden('u1')).toBe('["pulse"]');
    });

    it('hides latest-from-site when recent-diary is hidden', () => {
      userWithCards('u1', ['recent-diary']);
      migrate();
      expect(hidden('u1')).toBe('["latest-from-site"]');
    });

    it.each([
      ['this-week', THIS_WEEK_CARDS],
      ['pulse', PULSE_CARDS],
    ])('keeps %s visible when only some of its cards were hidden', (_section, cards) => {
      for (let n = 0; n < cards.length; n += 1) {
        const partial = cards.filter((_c, i) => i !== n);
        userWithCards(`u-${_section}-${n}`, partial);
      }
      migrate();
      for (let n = 0; n < cards.length; n += 1) {
        expect(hidden(`u-${_section}-${n}`)).toBeNull();
      }
    });

    it('keeps this-week visible but hides pulse and latest-from-site in a mixed set', () => {
      userWithCards('u1', ['upcoming-milestones', 'mini-gantt', ...PULSE_CARDS, 'recent-diary']);
      migrate();
      expect(hidden('u1')).toBe('["pulse","latest-from-site"]');
    });

    it.each([
      [
        ['this-week', 'latest-from-site'],
        [...THIS_WEEK_CARDS, ...LATEST_CARDS],
      ],
      [
        ['this-week', 'pulse'],
        [...PULSE_CARDS, ...THIS_WEEK_CARDS],
      ],
      [
        ['pulse', 'latest-from-site'],
        [...LATEST_CARDS, ...PULSE_CARDS],
      ],
    ])('writes %j comma-separated in section order whatever the stored order', (ids, cards) => {
      userWithCards('u1', cards);
      migrate();
      expect(hidden('u1')).toBe(JSON.stringify(ids));
    });

    it('writes ids in HOME_HIDEABLE_SECTION_IDS order and exactly as JSON.stringify would', () => {
      userWithCards('u1', [...LATEST_CARDS, ...PULSE_CARDS, ...THIS_WEEK_CARDS]);
      migrate();
      const expected = HOME_HIDEABLE_SECTION_IDS.filter((id) => id !== 'tidy-up');
      expect(hidden('u1')).toBe(JSON.stringify(expected));
      expect(JSON.parse(hidden('u1')!)).toEqual(expected);
    });

    it('never hides tidy-up or needs-attention', () => {
      userWithCards('u1', [
        ...THIS_WEEK_CARDS,
        ...PULSE_CARDS,
        ...LATEST_CARDS,
        'tidy-up',
        'needs-attention',
      ]);
      migrate();
      const value = JSON.parse(hidden('u1')!) as string[];
      expect(value).not.toContain('tidy-up');
      expect(value).not.toContain('needs-attention');
    });

    it('ignores unknown and duplicate card ids', () => {
      userWithCards('u1', ['nonsense', 'recent-diary', 'recent-diary', 'mini-gantt']);
      migrate();
      expect(hidden('u1')).toBe('["latest-from-site"]');
    });

    it('does not count a duplicated card as two cards of a group', () => {
      userWithCards('u1', ['mini-gantt', 'mini-gantt', 'critical-path']);
      migrate();
      expect(hidden('u1')).toBeNull();
    });

    it('writes no row when no section qualifies', () => {
      userWithCards('u-empty', []);
      userWithCards('u-other', ['nonsense', 'subsidy-pipeline']);
      userWithCards('u-partial', ['mini-gantt']);
      migrate();
      for (const id of ['u-empty', 'u-other', 'u-partial']) expect(hidden(id)).toBeNull();
      const total = db
        .prepare('SELECT COUNT(*) AS n FROM user_preferences WHERE key = ?')
        .get(NEW_KEY) as { n: number };
      expect(total.n).toBe(0);
    });

    it('maps each user separately', () => {
      userWithCards('u1', THIS_WEEK_CARDS);
      userWithCards('u2', LATEST_CARDS);
      userWithCards('u3', ['mini-gantt']);
      user('u4');
      migrate();
      expect(hidden('u1')).toBe('["this-week"]');
      expect(hidden('u2')).toBe('["latest-from-site"]');
      expect(hidden('u3')).toBeNull();
      expect(hidden('u4')).toBeNull();
    });
  });

  // ─── Row details ───────────────────────────────────────────────────────────

  describe('the written row', () => {
    it('uses an ISO-8601 millisecond UTC timestamp like the preferences service', () => {
      userWithCards('u1', LATEST_CARDS);
      migrate();
      const row = rows('u1', NEW_KEY)[0]!;
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(row.updated_at).toBe(row.created_at);
      expect(new Date(row.created_at).toISOString()).toBe(row.created_at);
    });

    it('is a value the strict PATCH validation would accept', async () => {
      const { validateHomePreferenceValue } = await import('@cornerstone/shared');
      userWithCards('u1', [...THIS_WEEK_CARDS, ...PULSE_CARDS, ...LATEST_CARDS]);
      migrate();
      expect(validateHomePreferenceValue(NEW_KEY, hidden('u1')!)).toBeNull();
    });
  });

  // ─── Non-destructive ───────────────────────────────────────────────────────

  describe('non-destructive', () => {
    it('leaves dashboard.hiddenCards unchanged, including its timestamps', () => {
      const cards = JSON.stringify([...THIS_WEEK_CARDS, 'recent-diary']);
      userWithCards('u1', cards);
      const before = rows('u1', LEGACY_KEY);
      migrate();
      expect(rows('u1', LEGACY_KEY)).toEqual(before);
      expect(before[0]!.value).toBe(cards);
    });

    it('leaves a legacy row alone even when it produces no new row', () => {
      userWithCards('u1', ['mini-gantt']);
      const before = rows('u1', LEGACY_KEY);
      migrate();
      expect(rows('u1', LEGACY_KEY)).toEqual(before);
    });

    it('does not touch other preferences', () => {
      userWithCards('u1', LATEST_CARDS);
      pref('u1', 'theme', 'dark');
      pref('u1', 'attention.snoozed', '{}');
      const before = rows('u1', 'theme');
      migrate();
      expect(rows('u1', 'theme')).toEqual(before);
      expect(rows('u1', 'attention.snoozed')).toHaveLength(1);
    });

    it('does not overwrite an existing home.hiddenSections row (even an empty one)', () => {
      userWithCards('u-kept', [...THIS_WEEK_CARDS, ...PULSE_CARDS, ...LATEST_CARDS]);
      pref('u-kept', NEW_KEY, '["pulse"]');
      userWithCards('u-empty', LATEST_CARDS);
      pref('u-empty', NEW_KEY, '[]');
      const before = rows('u-kept', NEW_KEY);
      migrate();
      expect(rows('u-kept', NEW_KEY)).toEqual(before);
      expect(hidden('u-kept')).toBe('["pulse"]');
      expect(hidden('u-empty')).toBe('[]');
    });

    it('does not create a row for a user who only has home.hiddenSections', () => {
      user('u1');
      pref('u1', NEW_KEY, '["pulse"]');
      migrate();
      expect(rows('u1', NEW_KEY)).toHaveLength(1);
    });

    it('leaves no helper table behind', () => {
      userWithCards('u1', LATEST_CARDS);
      migrate();
      const leftovers = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE name LIKE '%home_hidden_calc%'
           UNION SELECT name FROM sqlite_temp_master WHERE name LIKE '%home_hidden_calc%'`,
        )
        .all();
      expect(leftovers).toEqual([]);
    });
  });

  // ─── Malformed legacy values ───────────────────────────────────────────────

  describe('malformed legacy values', () => {
    it.each([
      ['not JSON', 'not json {'],
      ['an empty string', ''],
      ['truncated JSON', '["mini-gantt"'],
      ['an object', '{"mini-gantt":true}'],
      ['a string', '"recent-diary"'],
      ['a number', '42'],
      ['a boolean', 'true'],
      ['null', 'null'],
    ])('writes no row and does not fail for %s', (_label, value) => {
      userWithCards('u-bad', value);
      userWithCards('u-good', LATEST_CARDS);
      expect(() => migrate()).not.toThrow();
      expect(hidden('u-bad')).toBeNull();
      expect(hidden('u-good')).toBe('["latest-from-site"]');
      expect(rows('u-bad', LEGACY_KEY)[0]!.value).toBe(value);
    });

    it('ignores non-string members (numbers, nulls, nested arrays) without failing', () => {
      userWithCards('u1', [1, null, ['recent-diary'], { card: 'recent-diary' }, true]);
      userWithCards('u2', [1, 'recent-diary', null]);
      expect(() => migrate()).not.toThrow();
      expect(hidden('u1')).toBeNull();
      expect(hidden('u2')).toBe('["latest-from-site"]');
    });

    it('does not let a numeric 3-length array pass for a card group', () => {
      userWithCards('u1', [1, 2, 3]);
      migrate();
      expect(hidden('u1')).toBeNull();
    });
  });

  // ─── Idempotence ───────────────────────────────────────────────────────────

  describe('idempotence', () => {
    it('running the SQL twice yields the same rows and no UNIQUE violation', () => {
      userWithCards('u1', [...THIS_WEEK_CARDS, ...LATEST_CARDS]);
      userWithCards('u2', ['mini-gantt']);
      userWithCards('u3', 'not json {');
      migrate();
      const first = db.prepare('SELECT * FROM user_preferences ORDER BY id').all();
      expect(() => migrate()).not.toThrow();
      const second = db.prepare('SELECT * FROM user_preferences ORDER BY id').all();
      expect(second).toEqual(first);
      expect(rows('u1', NEW_KEY)).toHaveLength(1);
    });

    it('does not restore a hidden-sections choice the user changed after the first run', () => {
      userWithCards('u1', [...THIS_WEEK_CARDS, ...LATEST_CARDS]);
      migrate();
      db.prepare('UPDATE user_preferences SET value = ? WHERE user_id = ? AND key = ?').run(
        '[]',
        'u1',
        NEW_KEY,
      );
      migrate();
      expect(hidden('u1')).toBe('[]');
    });

    it('runs on an empty table and on a database without legacy rows', () => {
      expect(() => migrate()).not.toThrow();
      user('u1');
      pref('u1', 'theme', 'light');
      expect(() => migrate()).not.toThrow();
      expect(hidden('u1')).toBeNull();
    });
  });

  // ─── Through the migration runner ──────────────────────────────────────────

  describe('through the runner', () => {
    it('applies once inside the runner transaction and is recorded as applied', () => {
      userWithCards('u1', [...PULSE_CARDS, ...LATEST_CARDS]);

      const dir = mkdtempSync(join(tmpdir(), 'cs-mig-0048-run-'));
      const link = join(dir, TARGET_MIGRATION);
      symlinkSync(join(MIGRATIONS_DIR, TARGET_MIGRATION), link);
      try {
        runMigrations(db, dir);
        runMigrations(db, dir);
      } finally {
        unlinkSync(link);
        rmSync(dir, { recursive: true, force: true });
      }

      expect(hidden('u1')).toBe('["pulse","latest-from-site"]');
      const applied = db
        .prepare('SELECT COUNT(*) AS n FROM _migrations WHERE name = ?')
        .get(TARGET_MIGRATION) as { n: number };
      expect(applied.n).toBe(1);
    });
  });
});
