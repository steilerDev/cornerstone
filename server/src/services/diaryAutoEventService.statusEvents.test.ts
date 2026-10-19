/**
 * Tests for the status-event rules in diaryAutoEventService.ts (ADR-040):
 * W1 (same-status skip), W3 (A -> B -> A retraction inside the undo window, same user, undoable
 * callers only, row metadata must match the ledger), W4 (collector pushes written / retracted
 * events), and the deposit writer's paid / claimed gate.
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
  type EventContext,
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

/** An undoable user action (the PATCH status routes). */
const U1: EventContext = { userId: 'u1', undoable: true };
const U2: EventContext = { userId: 'u2', undoable: true };
/** A user action that never takes part in W3 (bank report, quotation conversion, deposit create). */
const U1_PLAIN: EventContext = { userId: 'u1' };

function deposit(id: string, invoiceId = 'inv-1', entryType: 'deposit' | 'refund' = 'deposit') {
  return { id, invoiceId, amount: 300, entryType };
}

describe('diaryAutoEventService status events (#2209, ADR-040 W1/W3/W4)', () => {
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
    const now = START.toISOString();
    for (const id of ['u1', 'u2']) {
      db.insert(schema.users)
        .values({
          id,
          email: `${id}@example.test`,
          displayName: id,
          role: 'member',
          authProvider: 'local',
          passwordHash: 'x',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    sqlite.close();
  });

  describe('createAutomaticDiaryEntry', () => {
    it('returns the id of the row it inserted, with title NULL and body empty', () => {
      const id = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-08-07',
        { v: 1, event: 'legacy' },
        'work_item',
        'wi',
        null,
      );
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      const row = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
      expect(row?.isAutomatic).toBe(true);
      expect(row?.sourceEntityId).toBe('wi');
      expect(row?.title).toBeNull();
      expect(row?.body).toBe('');
      expect(row?.metadata).toBe('{"v":1,"event":"legacy"}');
    });

    it('returns a different id per call and stores createdBy', () => {
      const a = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-08-07',
        { v: 1, event: 'legacy' },
        null,
        null,
        'u1',
      );
      const b = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-08-07',
        { v: 1, event: 'legacy' },
        null,
        null,
        null,
      );
      expect(a).not.toBe(b);
      expect(db.select().from(diaryEntries).where(eq(diaryEntries.id, a)).get()?.createdBy).toBe(
        'u1',
      );
    });
  });

  describe('W1: from === to', () => {
    it.each([
      ['work item', () => onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'in_progress', U1)],
      ['invoice', () => onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'paid', U1)],
      ['deposit', () => onDepositStatusChanged(db, deposit('d'), 'N', 'paid', 'paid', U1)],
      ['subsidy', () => onSubsidyStatusChanged(db, 's', 'S', 'approved', 'approved', U1)],
    ])('%s: writes no event and records nothing in the ledger', (_label, call) => {
      call();
      expect(rows()).toHaveLength(0);
    });
  });

  describe('W3: A -> B -> A retraction', () => {
    it('retracts the first event and writes nothing (same user, undoable, inside the window)', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      expect(rows('work_item_status')).toHaveLength(1);
      advance(1000);
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows()).toHaveLength(0);
      expect(getLedgerEntry(subjectKey('work_item_status', 'work_item', 'w'))).toBeUndefined();
    });

    it('writes a second event for a different user', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U2);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('writes a second event at exactly the window boundary', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      advance(UNDO_WINDOW_MS);
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('writes a second event at 30 001 ms', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      advance(UNDO_WINDOW_MS + 1);
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('retracts 1 ms before the boundary', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      advance(UNDO_WINDOW_MS - 1);
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows()).toHaveLength(0);
    });

    it('does not retract without an acting user, and records the event without a user', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress');
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started');
      expect(rows('work_item_status')).toHaveLength(2);
      expect(getLedgerEntry(subjectKey('work_item_status', 'work_item', 'w'))?.userId).toBeNull();
    });

    it('never retracts for a non-undoable context, and the ledger records no user for it', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', U1_PLAIN);
      expect(getLedgerEntry(subjectKey('invoice_status', 'invoice', 'i'))?.userId).toBeNull();
      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', U1_PLAIN);
      expect(rows('invoice_status')).toHaveLength(2);
    });

    it('a non-undoable first event is not retracted by an undoable reverse of the same user', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', U1_PLAIN);
      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', U1);
      expect(rows('invoice_status')).toHaveLength(2);
    });

    it('stores createdBy for user-initiated events, even when not undoable', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', U1_PLAIN);
      expect(rows()[0]!.createdBy).toBe('u1');
    });

    it('does not retract when the new change is not the exact reverse (A -> B -> C)', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'completed', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('does not retract across subjects', () => {
      onWorkItemStatusChanged(db, 'w1', 'T', 'not_started', 'in_progress', U1);
      onWorkItemStatusChanged(db, 'w2', 'T', 'in_progress', 'not_started', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('does not retract an invoice event with a deposit event that shares the id', () => {
      onInvoiceStatusChanged(db, 'x', 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('x', 'inv-x'), 'N', 'paid', 'pending', U1);
      expect(rows('invoice_status')).toHaveLength(1);
    });

    it('retracts invoice and subsidy events the same way', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', U1);
      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', U1);
      onSubsidyStatusChanged(db, 's', 'S', 'eligible', 'applied', U1);
      onSubsidyStatusChanged(db, 's', 'S', 'applied', 'eligible', U1);
      expect(rows()).toHaveLength(0);
    });

    it('never deletes a row that is no longer automatic, and writes a normal event instead', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      sqlite.prepare('UPDATE diary_entries SET is_automatic = 0').run();
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows()).toHaveLength(2);
      expect(rows().filter((r) => r.isAutomatic)).toHaveLength(1);
    });

    it('drops the ledger entry and writes a normal event when the ledgered row is already gone', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      sqlite.prepare('DELETE FROM diary_entries').run();
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows()).toHaveLength(1);
      expect(JSON.parse(rows()[0]!.metadata!)).toMatchObject({
        from: 'in_progress',
        to: 'not_started',
      });
    });

    it('falls through to a normal write when the row metadata.to was tampered with', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      sqlite
        .prepare(`UPDATE diary_entries SET metadata = json_set(metadata, '$.to', 'completed')`)
        .run();
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('falls through to a normal write when the row metadata.from was tampered with', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      sqlite
        .prepare(`UPDATE diary_entries SET metadata = json_set(metadata, '$.from', 'completed')`)
        .run();
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('falls through to a normal write when the row has no metadata (legacy row)', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      sqlite.prepare('UPDATE diary_entries SET metadata = NULL').run();
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      expect(rows('work_item_status')).toHaveLength(2);
    });

    it('is fire-and-forget: a failing retraction lookup is logged, never thrown', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      sqlite.exec('DROP TABLE diary_entries');
      expect(() =>
        onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1),
      ).not.toThrow();
      expect(warn).toHaveBeenCalled();
    });

    it('always writes: with DIARY_AUTO_EVENTS=false in the environment an event is still recorded', () => {
      const previous = process.env.DIARY_AUTO_EVENTS;
      process.env.DIARY_AUTO_EVENTS = 'false';
      try {
        onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      } finally {
        if (previous === undefined) delete process.env.DIARY_AUTO_EVENTS;
        else process.env.DIARY_AUTO_EVENTS = previous;
      }
      expect(rows('work_item_status')).toHaveLength(1);
      expect(getLedgerEntry(subjectKey('work_item_status', 'work_item', 'w'))).toBeDefined();
    });
  });

  describe('deposit writer gate (AC-17) and ledger key per deposit (D-16)', () => {
    it('writes for paid and claimed targets, with the invoice as the row subject', () => {
      onDepositStatusChanged(db, deposit('d1', 'inv-1'), 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('d2', 'inv-1'), 'N', 'pending', 'claimed', U1);
      const written = rows('invoice_status');
      expect(written).toHaveLength(2);
      expect(written.every((r) => r.sourceEntityType === 'invoice')).toBe(true);
      expect(written.every((r) => r.sourceEntityId === 'inv-1')).toBe(true);
    });

    it('never inserts a row for a move to pending', () => {
      onDepositStatusChanged(db, deposit('d'), 'N', 'paid', 'pending', U1);
      onDepositStatusChanged(db, deposit('d'), 'N', 'claimed', 'pending', U1);
      expect(rows()).toHaveLength(0);
    });

    it('pending -> paid -> pending leaves zero rows; pending -> paid -> claimed -> paid keeps two', () => {
      onDepositStatusChanged(db, deposit('d'), 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('d'), 'N', 'paid', 'pending', U1);
      expect(rows()).toHaveLength(0);

      onDepositStatusChanged(db, deposit('e'), 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('e'), 'N', 'paid', 'claimed', U1);
      expect(rows()).toHaveLength(2);
    });

    it('claimed -> paid reversal retracts the claimed event', () => {
      onDepositStatusChanged(db, deposit('d'), 'N', 'paid', 'claimed', U1);
      onDepositStatusChanged(db, deposit('d'), 'N', 'claimed', 'paid', U1);
      expect(rows()).toHaveLength(0);
    });

    it('two different deposits of one invoice do not retract each other', () => {
      onDepositStatusChanged(db, deposit('d1', 'inv-1'), 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('d2', 'inv-1'), 'N', 'paid', 'pending', U1);
      expect(rows('invoice_status')).toHaveLength(1);
      expect(JSON.parse(rows()[0]!.metadata!)).toMatchObject({ depositId: 'd1' });
    });

    it('a retraction removes only that deposit event, not a sibling payment of the same invoice', () => {
      onDepositStatusChanged(db, deposit('d1', 'inv-1'), 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('d2', 'inv-1'), 'N', 'pending', 'paid', U1);
      onDepositStatusChanged(db, deposit('d2', 'inv-1'), 'N', 'paid', 'pending', U1);
      const left = rows('invoice_status');
      expect(left).toHaveLength(1);
      expect(JSON.parse(left[0]!.metadata!)).toMatchObject({ depositId: 'd1' });
    });

    it('a non-undoable deposit event (create) is not retracted by a later undoable reverse', () => {
      onDepositStatusChanged(db, deposit('d'), 'N', 'pending', 'paid', U1_PLAIN);
      onDepositStatusChanged(db, deposit('d'), 'N', 'paid', 'pending', U1);
      expect(rows()).toHaveLength(1);
    });

    it('does not retract when the stored deposit row metadata disagrees with the ledger', () => {
      onDepositStatusChanged(db, deposit('d'), 'N', 'pending', 'paid', U1);
      sqlite
        .prepare(`UPDATE diary_entries SET metadata = json_set(metadata, '$.to', 'claimed')`)
        .run();
      onDepositStatusChanged(db, deposit('d'), 'N', 'paid', 'pending', U1);
      expect(rows()).toHaveLength(1);
    });
  });

  describe('collector (W4)', () => {
    it('records written event ids in the active collection', () => {
      const c = beginCollection();
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      endCollection(c);
      expect(c.written).toEqual([rows('work_item_status')[0]!.id]);
      expect(c.retracted).toEqual([]);
    });

    it('records the full deleted row of a retraction', () => {
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      const original = rows()[0]!;
      const c = beginCollection();
      onWorkItemStatusChanged(db, 'w', 'T', 'in_progress', 'not_started', U1);
      endCollection(c);
      expect(c.written).toEqual([]);
      expect(c.retracted).toHaveLength(1);
      expect(c.retracted[0]!.row).toEqual(original);
      expect(c.retracted[0]!.key).toBe(subjectKey('work_item_status', 'work_item', 'w'));
      expect(c.retracted[0]!.entry.eventId).toBe(original.id);
    });

    it('collects nothing when no collection is active', () => {
      expect(activeCollection()).toBeUndefined();
      onWorkItemStatusChanged(db, 'w', 'T', 'not_started', 'in_progress', U1);
      expect(rows()).toHaveLength(1);
    });
  });
});
