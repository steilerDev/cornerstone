/**
 * Tests for the #2209 status-event rules in diaryAutoEventService.ts:
 * W1 (same-status skip), W3 (A -> B -> A retraction inside the undo window, same user),
 * W4 (collector pushes written / retracted events), and the deposit writer's paid / claimed gate.
 * Also covers diaryService.createAutomaticDiaryEntry returning the new id.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { diaryEntries } from '../db/schema.js';
import {
  onDepositStatusChanged,
  onInvoiceStatusChanged,
  onSubsidyStatusChanged,
  onWorkItemStatusChanged,
} from './diaryAutoEventService.js';
import { createAutomaticDiaryEntry } from './diaryService.js';
import {
  __resetLedgerForTests,
  activeCollection,
  beginCollection,
  endCollection,
  getLedgerEntry,
  subjectKey,
} from './statusEventLedger.js';

const START = new Date('2026-08-07T10:00:00.000Z');

describe('diaryAutoEventService status events (#2209)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  function rows(entryType?: string) {
    const all = db.select().from(diaryEntries).all();
    return entryType ? all.filter((r) => r.entryType === entryType) : all;
  }

  function advance(ms: number) {
    jest.setSystemTime(new Date(Date.now() + ms));
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    __resetLedgerForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    sqlite.close();
  });

  describe('createAutomaticDiaryEntry', () => {
    it('returns the id of the row it inserted', () => {
      const id = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-08-07',
        't',
        'b',
        'work_item',
        'wi',
      );
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      const row = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
      expect(row?.isAutomatic).toBe(true);
      expect(row?.sourceEntityId).toBe('wi');
    });

    it('returns a different id per call', () => {
      const a = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-08-07',
        't',
        'b',
        null,
        null,
      );
      const b = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-08-07',
        't',
        'b',
        null,
        null,
      );
      expect(a).not.toBe(b);
    });
  });

  describe('W1: from === to', () => {
    it.each([
      [
        'work item',
        () => onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'in_progress', 'u1'),
      ],
      ['invoice', () => onInvoiceStatusChanged(db, true, 'i', 'N', 'paid', 'paid', 'u1')],
      ['deposit', () => onDepositStatusChanged(db, true, 'd', 'N', 'paid', 'paid', 'u1')],
      ['subsidy', () => onSubsidyStatusChanged(db, true, 's', 'S', 'approved', 'approved', 'u1')],
    ])('%s: writes no event and records nothing in the ledger', (_label, call) => {
      call();
      expect(rows()).toHaveLength(0);
    });
  });

  describe('W3: A -> B -> A retraction', () => {
    it('retracts the first event and writes nothing (same user, inside the window)', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      expect(rows('work_item_status')).toHaveLength(1);
      advance(1000);
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows()).toHaveLength(0);
      expect(getLedgerEntry(subjectKey('work_item_status', 'work_item', 'w'))).toBeUndefined();
    });

    it('writes a second event for a different user', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u2');
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('writes a second event at exactly the window boundary', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      advance(UNDO_WINDOW_MS);
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('retracts 1 ms before the boundary', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      advance(UNDO_WINDOW_MS - 1);
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows()).toHaveLength(0);
    });

    it('does not retract when the actor is unknown (null), and records the event without a user', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress');
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started');
      expect(rows('work_item_status')).toHaveLength(2);
      expect(getLedgerEntry(subjectKey('work_item_status', 'work_item', 'w'))?.userId).toBeNull();
    });

    it('does not retract when the new change is not the exact reverse (A -> B -> C)', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'completed', 'u1');
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('does not retract across subjects', () => {
      onWorkItemStatusChanged(db, true, 'w1', 'T', 'not_started', 'in_progress', 'u1');
      onWorkItemStatusChanged(db, true, 'w2', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('does not retract an invoice event with a deposit event that shares the id', () => {
      onInvoiceStatusChanged(db, true, 'x', 'N', 'pending', 'paid', 'u1');
      onDepositStatusChanged(db, true, 'x', 'N', 'paid', 'pending', 'u1');
      expect(rows('invoice_status')).toHaveLength(1);
    });

    it('retracts invoice and subsidy events the same way', () => {
      onInvoiceStatusChanged(db, true, 'i', 'N', 'pending', 'paid', 'u1');
      onInvoiceStatusChanged(db, true, 'i', 'N', 'paid', 'pending', 'u1');
      onSubsidyStatusChanged(db, true, 's', 'S', 'eligible', 'applied', 'u1');
      onSubsidyStatusChanged(db, true, 's', 'S', 'applied', 'eligible', 'u1');
      expect(rows()).toHaveLength(0);
    });

    it('never deletes a row that is no longer automatic, but still writes nothing', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      sqlite.prepare('UPDATE diary_entries SET is_automatic = 0').run();
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows()).toHaveLength(1);
    });

    it('drops the ledger entry and writes nothing when the ledgered row is already gone', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      sqlite.prepare('DELETE FROM diary_entries').run();
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows()).toHaveLength(0);
    });

    it('is fire-and-forget: a failing retraction lookup is logged, never thrown', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      sqlite.exec('DROP TABLE diary_entries');
      expect(() =>
        onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1'),
      ).not.toThrow();
      expect(warn).toHaveBeenCalled();
    });

    it('diaryAutoEvents=false: nothing written, nothing recorded, no error', () => {
      onWorkItemStatusChanged(db, false, 'w', 'T', 'not_started', 'in_progress', 'u1');
      onWorkItemStatusChanged(db, false, 'w', 'T', 'in_progress', 'not_started', 'u1');
      expect(rows()).toHaveLength(0);
      expect(getLedgerEntry(subjectKey('work_item_status', 'work_item', 'w'))).toBeUndefined();
    });
  });

  describe('deposit writer gate (AC-17)', () => {
    it('writes for paid and claimed targets', () => {
      onDepositStatusChanged(db, true, 'd1', 'N', 'pending', 'paid', 'u1');
      onDepositStatusChanged(db, true, 'd2', 'N', 'pending', 'claimed', 'u1');
      expect(rows('invoice_status')).toHaveLength(2);
    });

    it('never inserts a row for a move to pending', () => {
      onDepositStatusChanged(db, true, 'd', 'N', 'paid', 'pending', 'u1');
      onDepositStatusChanged(db, true, 'd', 'N', 'claimed', 'pending', 'u1');
      expect(rows()).toHaveLength(0);
    });

    it('pending -> paid -> pending leaves zero rows; pending -> paid -> claimed -> paid keeps two', () => {
      onDepositStatusChanged(db, true, 'd', 'N', 'pending', 'paid', 'u1');
      onDepositStatusChanged(db, true, 'd', 'N', 'paid', 'pending', 'u1');
      expect(rows()).toHaveLength(0);

      onDepositStatusChanged(db, true, 'e', 'N', 'pending', 'paid', 'u1');
      onDepositStatusChanged(db, true, 'e', 'N', 'paid', 'claimed', 'u1');
      expect(rows()).toHaveLength(2);
    });

    it('claimed -> paid reversal retracts the claimed event', () => {
      onDepositStatusChanged(db, true, 'd', 'N', 'paid', 'claimed', 'u1');
      onDepositStatusChanged(db, true, 'd', 'N', 'claimed', 'paid', 'u1');
      expect(rows()).toHaveLength(0);
    });
  });

  describe('collector (W4)', () => {
    it('records written event ids in the active collection', () => {
      const c = beginCollection();
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      endCollection(c);
      expect(c.written).toEqual([rows('work_item_status')[0]!.id]);
      expect(c.retracted).toEqual([]);
    });

    it('records the full deleted row of a retraction', () => {
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      const original = rows()[0]!;
      const c = beginCollection();
      onWorkItemStatusChanged(db, true, 'w', 'T', 'in_progress', 'not_started', 'u1');
      endCollection(c);
      expect(c.written).toEqual([]);
      expect(c.retracted).toHaveLength(1);
      expect(c.retracted[0]!.row).toEqual(original);
      expect(c.retracted[0]!.key).toBe(subjectKey('work_item_status', 'work_item', 'w'));
      expect(c.retracted[0]!.entry.eventId).toBe(original.id);
    });

    it('collects nothing when no collection is active', () => {
      expect(activeCollection()).toBeUndefined();
      onWorkItemStatusChanged(db, true, 'w', 'T', 'not_started', 'in_progress', 'u1');
      expect(rows()).toHaveLength(1);
    });
  });
});
