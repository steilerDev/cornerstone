/**
 * Unit tests for diaryAutoEventService.ts (the system event writer, ADR-040).
 *
 * EPIC-13 Story #808; EPIC-21 #2223. Covers each writer's row (v1 metadata, no English text),
 * W2 milestone de-duplication through the stored metadata, and fire-and-forget behaviour. The
 * exact metadata shapes and key order live in diaryAutoEventService.metadata.test.ts.
 * Uses a real in-memory SQLite DB with migrations.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { diaryEntries } from '../db/schema.js';
import {
  onWorkItemStatusChanged,
  onInvoiceStatusChanged,
  onMilestoneDelayed,
  onSubsidyStatusChanged,
  onInvoiceCreated,
  onDepositStatusChanged,
  SYSTEM_CONTEXT,
} from './diaryAutoEventService.js';
import { __resetLedgerForTests } from './statusEventLedger.js';

describe('diaryAutoEventService', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let sqlite: ReturnType<typeof Database>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'diary-auto-event-test-'));
    const dbPath = join(tempDir, 'test.db');
    sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite, undefined);
    db = drizzle(sqlite, { schema });
    __resetLedgerForTests();
  });

  afterEach(() => {
    if (sqlite.open) sqlite.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    jest.restoreAllMocks();
  });

  function getAllEntries() {
    return db.select().from(diaryEntries).all();
  }

  function metaOf(index = 0): Record<string, unknown> {
    return JSON.parse(getAllEntries()[index]!.metadata!) as Record<string, unknown>;
  }

  function insertUser(id: string): void {
    const now = '2026-03-01T00:00:00.000Z';
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

  describe('onWorkItemStatusChanged', () => {
    it('writes an automatic row with no English text and the parameters in metadata', () => {
      onWorkItemStatusChanged(db, 'wi-1', 'Task A', 'not_started', 'in_progress');

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);
      const entry = entries[0]!;
      expect(entry.entryType).toBe('work_item_status');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('work_item');
      expect(entry.sourceEntityId).toBe('wi-1');
      expect(entry.createdBy).toBeNull();
      expect(entry.title).toBeNull();
      expect(entry.body).toBe('');
      expect(metaOf()).toMatchObject({
        v: 1,
        event: 'status_changed',
        from: 'not_started',
        to: 'in_progress',
        subjectLabel: 'Task A',
      });
    });

    it('stores the acting user in created_by', () => {
      insertUser('user-1');
      onWorkItemStatusChanged(db, 'wi-2', 'Task A', 'not_started', 'completed', {
        userId: 'user-1',
      });
      expect(getAllEntries()[0]!.createdBy).toBe('user-1');
    });

    it('the system context has no user and is not undoable', () => {
      expect(SYSTEM_CONTEXT).toEqual({ userId: null });
    });
  });

  describe('onInvoiceStatusChanged', () => {
    it('writes an invoice_status row with the number as subjectLabel', () => {
      onInvoiceStatusChanged(db, 'inv-1', 'INV-T-001', 'pending', 'paid');

      const entry = getAllEntries()[0]!;
      expect(entry.entryType).toBe('invoice_status');
      expect(entry.sourceEntityType).toBe('invoice');
      expect(entry.sourceEntityId).toBe('inv-1');
      expect(entry.body).toBe('');
      expect(metaOf().subjectLabel).toBe('INV-T-001');
    });

    it.each([null, ''])('stores subjectLabel null for the invoice number %p (no "N/A")', (num) => {
      onInvoiceStatusChanged(db, 'inv-2', num, 'pending', 'claimed');
      expect(metaOf().subjectLabel).toBeNull();
      expect(getAllEntries()[0]!.body).toBe('');
    });

    it('carries amount and batchId when given', () => {
      onInvoiceStatusChanged(db, 'inv-3', 'INV-T-003', 'pending', 'claimed', SYSTEM_CONTEXT, {
        amount: 1200,
        batchId: 'batch-1',
      });
      expect(metaOf()).toMatchObject({ amount: 1200, batchId: 'batch-1' });
    });
  });

  describe('onMilestoneDelayed (W2)', () => {
    function insertMilestone(id: number, opts: { completed?: boolean } = {}) {
      const now = '2026-03-01T00:00:00.000Z';
      db.insert(schema.milestones)
        .values({
          id,
          title: `Milestone ${id}`,
          targetDate: '2026-03-01',
          isCompleted: opts.completed ?? false,
          completedAt: opts.completed ? '2026-03-02T10:00:00.000Z' : null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    it('writes a milestone_delay row with the dates and delay in metadata', () => {
      insertMilestone(42);
      onMilestoneDelayed(db, 42, 'Milestone A', '2026-03-01', '2026-03-15');

      const entry = getAllEntries()[0]!;
      expect(entry.entryType).toBe('milestone_delay');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('milestone');
      expect(entry.sourceEntityId).toBe('42');
      expect(entry.createdBy).toBeNull();
      expect(entry.title).toBeNull();
      expect(entry.body).toBe('');
      expect(metaOf()).toEqual({
        v: 1,
        event: 'milestone_delayed',
        targetDate: '2026-03-01',
        projectedDate: '2026-03-15',
        delayDays: 14,
        subjectLabel: 'Milestone A',
      });
    });

    it('converts milestoneId (number) to string for sourceEntityId', () => {
      insertMilestone(999);
      onMilestoneDelayed(db, 999, 'Milestone B', '2026-03-01', '2026-03-10');
      expect(getAllEntries()[0]!.sourceEntityId).toBe('999');
    });

    it('D-16: writes nothing for a completed milestone (AC4)', () => {
      insertMilestone(5, { completed: true });
      onMilestoneDelayed(db, 5, 'Done Milestone', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(0);
    });

    it('writes nothing when the milestone row does not exist', () => {
      onMilestoneDelayed(db, 777, 'Ghost', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(0);
    });

    it('writes nothing when the projected date is not later than the target date', () => {
      insertMilestone(6);
      onMilestoneDelayed(db, 6, 'On Time', '2026-03-01', '2026-03-01');
      onMilestoneDelayed(db, 6, 'Early', '2026-03-01', '2026-02-20');
      expect(getAllEntries()).toHaveLength(0);
    });

    it('D-16: does not repeat an entry for the same projected date (AC3)', () => {
      insertMilestone(7);
      onMilestoneDelayed(db, 7, 'Repeat', '2026-03-01', '2026-03-15');
      onMilestoneDelayed(db, 7, 'Repeat', '2026-03-01', '2026-03-15');
      onMilestoneDelayed(db, 7, 'Repeat', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(1);
    });

    it('writes a new entry for every real change of the projected date, including a return to an earlier one', () => {
      insertMilestone(8);
      onMilestoneDelayed(db, 8, 'Moving', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(1);
      onMilestoneDelayed(db, 8, 'Moving', '2026-03-01', '2026-03-20');
      expect(getAllEntries()).toHaveLength(2);
      onMilestoneDelayed(db, 8, 'Moving', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(3);
      onMilestoneDelayed(db, 8, 'Moving', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(3);
    });

    it('compares against the newest event by insertion order when created_at ties', () => {
      insertMilestone(13);
      onMilestoneDelayed(db, 13, 'Tie', '2026-03-01', '2026-03-15');
      onMilestoneDelayed(db, 13, 'Tie', '2026-03-01', '2026-03-20');
      sqlite.prepare("UPDATE diary_entries SET created_at = '2026-03-02T00:00:00.000Z'").run();
      // The latest is the 20th; repeating the 15th is a real change, repeating the 20th is not
      onMilestoneDelayed(db, 13, 'Tie', '2026-03-01', '2026-03-20');
      expect(getAllEntries()).toHaveLength(2);
      onMilestoneDelayed(db, 13, 'Tie', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(3);
    });

    it('is not suppressed by another milestone entry with the same projected date', () => {
      insertMilestone(9);
      insertMilestone(10);
      onMilestoneDelayed(db, 9, 'First', '2026-03-01', '2026-03-15');
      onMilestoneDelayed(db, 10, 'Second', '2026-03-01', '2026-03-15');
      const entries = getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.sourceEntityId).sort()).toEqual(['10', '9']);
    });

    it('writes when the latest event is a legacy row without a projected date', () => {
      insertMilestone(11);
      db.insert(diaryEntries)
        .values({
          id: 'legacy-1',
          entryType: 'milestone_delay',
          entryDate: '2026-03-02',
          title: null,
          body: '',
          metadata: JSON.stringify({ v: 1, event: 'legacy' }),
          isAutomatic: true,
          sourceEntityType: 'milestone',
          sourceEntityId: '11',
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        })
        .run();
      onMilestoneDelayed(db, 11, 'Legacy MS', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(2);
    });

    it('writes when the latest event has malformed metadata (de-dup lookup ignores it)', () => {
      insertMilestone(14);
      db.insert(diaryEntries)
        .values({
          id: 'broken-1',
          entryType: 'milestone_delay',
          entryDate: '2026-03-02',
          title: 'Old',
          body: 'Old text',
          metadata: '{not json',
          isAutomatic: true,
          sourceEntityType: 'milestone',
          sourceEntityId: '14',
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        })
        .run();
      onMilestoneDelayed(db, 14, 'Broken MS', '2026-03-01', '2026-03-15');
      expect(getAllEntries()).toHaveLength(2);
    });

    it('writes nothing and does not throw when the de-dup lookup fails', () => {
      insertMilestone(12);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      jest.spyOn(db, 'select').mockImplementation(() => {
        throw new Error('db down');
      });
      expect(() => onMilestoneDelayed(db, 12, 'Broken', '2026-03-01', '2026-03-15')).not.toThrow();
      expect(warn).toHaveBeenCalled();
      jest.restoreAllMocks();
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  describe('onSubsidyStatusChanged', () => {
    it('writes a subsidy_status row with the grant name as subjectLabel', () => {
      onSubsidyStatusChanged(db, 'sub-1', 'Grant A', 'applied', 'approved');

      const entry = getAllEntries()[0]!;
      expect(entry.entryType).toBe('subsidy_status');
      expect(entry.sourceEntityType).toBe('subsidy_program');
      expect(entry.sourceEntityId).toBe('sub-1');
      expect(entry.title).toBeNull();
      expect(metaOf()).toMatchObject({ from: 'applied', to: 'approved', subjectLabel: 'Grant A' });
    });
  });

  describe('onInvoiceCreated', () => {
    it('writes an invoice_created row with vendor and amount', () => {
      insertUser('user-9');
      onInvoiceCreated(
        db,
        { id: 'inv-100', invoiceNumber: 'INV-T-100', amount: 1200, status: 'pending' },
        { id: 'vendor-1', name: 'Company A' },
        { userId: 'user-9' },
      );

      const entry = getAllEntries()[0]!;
      expect(entry.entryType).toBe('invoice_created');
      expect(entry.sourceEntityType).toBe('invoice');
      expect(entry.sourceEntityId).toBe('inv-100');
      expect(entry.createdBy).toBe('user-9');
      expect(entry.body).toBe('');
      expect(metaOf()).toMatchObject({
        subjectLabel: 'INV-T-100',
        vendorId: 'vendor-1',
        vendorName: 'Company A',
        amount: 1200,
        invoiceStatus: 'pending',
      });
    });

    it('stores subjectLabel null for an invoice without a number', () => {
      onInvoiceCreated(
        db,
        { id: 'inv-101', invoiceNumber: null, amount: 10, status: 'quotation' },
        { id: 'vendor-1', name: 'Company A' },
      );
      expect(metaOf().subjectLabel).toBeNull();
      expect(metaOf().invoiceStatus).toBe('quotation');
      expect(getAllEntries()[0]!.createdBy).toBeNull();
    });
  });

  describe('onDepositStatusChanged (#1403, D-16)', () => {
    const dep = { id: 'dep-1', invoiceId: 'inv-1', amount: 300, entryType: 'deposit' as const };

    it('writes an invoice_status row whose subject is the invoice and which names the payment', () => {
      onDepositStatusChanged(db, dep, 'INV-T-001', 'pending', 'paid');

      const entry = getAllEntries()[0]!;
      expect(entry.entryType).toBe('invoice_status');
      expect(entry.sourceEntityType).toBe('invoice');
      expect(entry.sourceEntityId).toBe('inv-1');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.createdBy).toBeNull();
      expect(metaOf()).toMatchObject({
        depositId: 'dep-1',
        depositEntryType: 'deposit',
        amount: 300,
        subjectLabel: 'INV-T-001',
      });
    });

    it('writes nothing for a move to pending', () => {
      onDepositStatusChanged(db, dep, 'INV-T-001', 'paid', 'pending');
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  describe('fire-and-forget behavior', () => {
    it('does not propagate errors and warns via console.warn when DB write fails', () => {
      jest.restoreAllMocks();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      // Close the database to force an error in createAutomaticDiaryEntry
      sqlite.close();

      expect(() => {
        onWorkItemStatusChanged(db, 'wi-fail', 'Failing WI', 'not_started', 'in_progress');
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
      const firstCallArgs = warnSpy.mock.calls[0]!;
      expect(firstCallArgs[0]).toContain('[diaryAutoEvent]');
    });

    it('a created_by that does not exist is swallowed and logged, not thrown', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(() =>
        onWorkItemStatusChanged(db, 'wi-fk', 'Task A', 'not_started', 'in_progress', {
          userId: 'no-such-user',
        }),
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
      expect(getAllEntries()).toHaveLength(0);
    });
  });
});
