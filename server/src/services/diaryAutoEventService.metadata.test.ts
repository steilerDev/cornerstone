/**
 * D-16 / ADR-040: the system event writer stores version-1 parameters and no English text.
 *
 * Covers the exact stored metadata text and key order (display rule R2 compares the JSON text),
 * `title` NULL and `body` '', the acting user, the deposit event's subject (the invoice, with
 * `metadata.depositId`), `batchId`, and the W1 / W2 / W3 write rules. Real in-memory DB.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { diaryEntries } from '../db/schema.js';
import {
  onDepositStatusChanged,
  onInvoiceCreated,
  onInvoiceStatusChanged,
  onMilestoneDelayed,
  onSubsidyStatusChanged,
  onWorkItemStatusChanged,
  type EventContext,
} from './diaryAutoEventService.js';
import { __resetLedgerForTests } from './statusEventLedger.js';

const START = new Date('2026-08-07T10:00:00.000Z');
const USER = 'user-1';
const OTHER_USER = 'user-2';
const UNDOABLE: EventContext = { userId: USER, undoable: true };

describe('D-16: system events are written as v1 parameters, not English text', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  function rows() {
    return db.select().from(diaryEntries).all();
  }

  function advance(ms: number) {
    jest.setSystemTime(new Date(Date.now() + ms));
  }

  function insertMilestone(id: number, completed = false) {
    const now = START.toISOString();
    db.insert(schema.milestones)
      .values({
        id,
        title: `Milestone ${id}`,
        targetDate: '2026-03-01',
        isCompleted: completed,
        completedAt: completed ? '2026-03-02T10:00:00.000Z' : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    __resetLedgerForTests();
    const now = START.toISOString();
    for (const id of [USER, OTHER_USER]) {
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

  describe('v1 shapes and key order', () => {
    it('work item status: exact text, title NULL, body empty, creator stored', () => {
      onWorkItemStatusChanged(db, 'wi-1', 'Task A', 'not_started', 'in_progress', UNDOABLE);

      const [row] = rows();
      expect(row!.title).toBeNull();
      expect(row!.body).toBe('');
      expect(row!.createdBy).toBe(USER);
      expect(row!.isAutomatic).toBe(true);
      expect(row!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"not_started","to":"in_progress","subjectLabel":"Task A"}',
      );
    });

    it('invoice status: amount follows subjectLabel, batchId follows amount', () => {
      onInvoiceStatusChanged(
        db,
        'inv-1',
        'INV-T-001',
        'pending',
        'claimed',
        { userId: USER },
        { amount: 1200, batchId: 'batch-1' },
      );

      expect(rows()[0]!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"pending","to":"claimed","subjectLabel":"INV-T-001","amount":1200,"batchId":"batch-1"}',
      );
    });

    it('invoice status: omits amount and batchId when not given, label null without a number', () => {
      onInvoiceStatusChanged(db, 'inv-1', null, 'pending', 'paid');

      expect(rows()[0]!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"pending","to":"paid","subjectLabel":null}',
      );
    });

    it('invoice status carries the amount after the update', () => {
      onInvoiceStatusChanged(db, 'inv-1', 'INV-T-001', 'pending', 'paid', UNDOABLE, {
        amount: 1200,
      });
      expect(JSON.parse(rows()[0]!.metadata!)).toMatchObject({ amount: 1200 });
    });

    it('deposit event: invoice subject, amount, depositEntryType, depositId, then batchId', () => {
      onDepositStatusChanged(
        db,
        { id: 'dep-1', invoiceId: 'inv-1', amount: 300, entryType: 'deposit' },
        'INV-T-001',
        'pending',
        'paid',
        { userId: USER },
        { batchId: 'batch-1' },
      );

      const [row] = rows();
      expect(row!.entryType).toBe('invoice_status');
      expect(row!.sourceEntityType).toBe('invoice');
      expect(row!.sourceEntityId).toBe('inv-1');
      expect(row!.createdBy).toBe(USER);
      expect(row!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"pending","to":"paid","subjectLabel":"INV-T-001","amount":300,"depositEntryType":"deposit","depositId":"dep-1","batchId":"batch-1"}',
      );
    });

    it('refund deposit: depositEntryType refund', () => {
      onDepositStatusChanged(
        db,
        { id: 'dep-2', invoiceId: 'inv-1', amount: 50, entryType: 'refund' },
        'INV-T-001',
        'pending',
        'claimed',
      );

      expect(JSON.parse(rows()[0]!.metadata!)).toMatchObject({
        depositEntryType: 'refund',
        amount: 50,
        depositId: 'dep-2',
        to: 'claimed',
      });
      expect(rows()[0]!.metadata).not.toContain('batchId');
    });

    it('subsidy status: the grant name is the label', () => {
      onSubsidyStatusChanged(db, 'sub-1', 'Grant A', 'applied', 'approved', UNDOABLE);

      expect(rows()[0]!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"applied","to":"approved","subjectLabel":"Grant A"}',
      );
      expect(rows()[0]!.sourceEntityType).toBe('subsidy_program');
    });

    it('invoice created: vendor, amount and status, creator stored', () => {
      onInvoiceCreated(
        db,
        { id: 'inv-9', invoiceNumber: 'INV-T-009', amount: 1200, status: 'quotation' },
        { id: 'vendor-1', name: 'Company A' },
        { userId: USER },
      );

      const [row] = rows();
      expect(row!.createdBy).toBe(USER);
      expect(row!.title).toBeNull();
      expect(row!.body).toBe('');
      expect(row!.metadata).toBe(
        '{"v":1,"event":"invoice_created","subjectLabel":"INV-T-009","vendorId":"vendor-1","vendorName":"Company A","amount":1200,"invoiceStatus":"quotation"}',
      );
    });

    it('milestone delay: dates, delay and name in order; created_by NULL', () => {
      insertMilestone(4);
      onMilestoneDelayed(db, 4, 'Milestone A', '2026-03-01', '2026-03-14');

      const [row] = rows();
      expect(row!.createdBy).toBeNull();
      expect(row!.metadata).toBe(
        '{"v":1,"event":"milestone_delayed","targetDate":"2026-03-01","projectedDate":"2026-03-14","delayDays":13,"subjectLabel":"Milestone A"}',
      );
    });

    it('no event row contains English text', () => {
      insertMilestone(5);
      onWorkItemStatusChanged(db, 'wi-1', 'Task A', 'not_started', 'in_progress');
      onInvoiceStatusChanged(db, 'inv-1', 'INV-T-001', 'pending', 'paid');
      onSubsidyStatusChanged(db, 'sub-1', 'Grant A', 'applied', 'approved');
      onMilestoneDelayed(db, 5, 'Milestone A', '2026-03-01', '2026-03-14');
      for (const row of rows()) {
        expect(row.title).toBeNull();
        expect(row.body).toBe('');
      }
    });
  });

  describe('W1: no-op', () => {
    it.each([
      [
        'work item',
        () => onWorkItemStatusChanged(db, 'w', 'T', 'completed', 'completed', UNDOABLE),
      ],
      ['invoice', () => onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'paid', UNDOABLE)],
      [
        'deposit',
        () =>
          onDepositStatusChanged(
            db,
            { id: 'd', invoiceId: 'i', amount: 1, entryType: 'deposit' },
            'N',
            'paid',
            'paid',
            UNDOABLE,
          ),
      ],
      ['grant', () => onSubsidyStatusChanged(db, 's', 'S', 'approved', 'approved', UNDOABLE)],
    ])('%s: from === to writes nothing', (_label, call) => {
      call();
      expect(rows()).toHaveLength(0);
    });
  });

  describe('W2: milestone delay', () => {
    it('a completed milestone writes nothing', () => {
      insertMilestone(1, true);
      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-03-14');
      expect(rows()).toHaveLength(0);
    });

    it('projected on or before target writes nothing', () => {
      insertMilestone(1);
      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-03-01');
      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-02-25');
      expect(rows()).toHaveLength(0);
    });

    it('the same projected date as the latest event writes nothing; a different date writes one row', () => {
      insertMilestone(1);
      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-03-14');
      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-03-14');
      expect(rows()).toHaveLength(1);
      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-03-20');
      expect(rows()).toHaveLength(2);
    });

    it('a latest event that is legacy (no projectedDate) does not block the write', () => {
      insertMilestone(1);
      db.insert(diaryEntries)
        .values({
          id: 'legacy-ms',
          entryType: 'milestone_delay',
          entryDate: '2026-03-02',
          title: 'Old text',
          body: 'Old body',
          metadata: JSON.stringify({ v: 1, event: 'legacy' }),
          isAutomatic: true,
          sourceEntityType: 'milestone',
          sourceEntityId: '1',
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        })
        .run();

      onMilestoneDelayed(db, 1, 'M', '2026-03-01', '2026-03-14');

      expect(rows()).toHaveLength(2);
    });
  });

  describe('W3: A -> B -> A within the undo window', () => {
    it('same user, undoable, inside the window: the first row is deleted and nothing remains', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', UNDOABLE);
      advance(1000);
      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', UNDOABLE);
      expect(rows()).toHaveLength(0);
    });

    it('after the window (30 001 ms) both rows remain', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', UNDOABLE);
      advance(UNDO_WINDOW_MS + 1);
      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', UNDOABLE);
      expect(rows()).toHaveLength(2);
    });

    it('a different user does not retract', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', UNDOABLE);
      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', {
        userId: OTHER_USER,
        undoable: true,
      });
      expect(rows()).toHaveLength(2);
    });

    it('a non-undoable context (bank report, conversion) never retracts', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'claimed', { userId: USER });
      onInvoiceStatusChanged(db, 'i', 'N', 'claimed', 'pending', { userId: USER });
      expect(rows()).toHaveLength(2);
    });

    it('a deposit pending -> paid -> pending leaves no row, and two deposits of one invoice are independent', () => {
      const d1 = { id: 'd1', invoiceId: 'i', amount: 10, entryType: 'deposit' as const };
      const d2 = { id: 'd2', invoiceId: 'i', amount: 20, entryType: 'deposit' as const };
      onDepositStatusChanged(db, d1, 'N', 'pending', 'paid', UNDOABLE);
      onDepositStatusChanged(db, d1, 'N', 'paid', 'pending', UNDOABLE);
      expect(rows()).toHaveLength(0);

      onDepositStatusChanged(db, d1, 'N', 'pending', 'paid', UNDOABLE);
      onDepositStatusChanged(db, d2, 'N', 'pending', 'paid', UNDOABLE);
      onDepositStatusChanged(db, d2, 'N', 'paid', 'pending', UNDOABLE);
      expect(rows()).toHaveLength(1);
      expect(JSON.parse(rows()[0]!.metadata!)).toMatchObject({ depositId: 'd1' });
    });

    it('a tampered row (metadata.to changed) is not retracted; a normal row is written', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', UNDOABLE);
      sqlite
        .prepare(`UPDATE diary_entries SET metadata = json_set(metadata, '$.to', 'claimed')`)
        .run();

      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', UNDOABLE);

      expect(rows()).toHaveLength(2);
    });

    it('a failed retraction falls through to a normal write (the ledgered row is gone)', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', UNDOABLE);
      sqlite.prepare('DELETE FROM diary_entries').run();

      onInvoiceStatusChanged(db, 'i', 'N', 'paid', 'pending', UNDOABLE);

      expect(rows()).toHaveLength(1);
      expect(JSON.parse(rows()[0]!.metadata!)).toMatchObject({ from: 'paid', to: 'pending' });
    });
  });

  describe('budgetSourceId (#2224)', () => {
    it('invoice status: stored after batchId, omitted when not given', () => {
      onInvoiceStatusChanged(
        db,
        'inv-1',
        'INV-T-001',
        'pending',
        'claimed',
        { userId: USER },
        { amount: 1200, batchId: 'batch-1', budgetSourceId: 'src-1' },
      );
      onInvoiceStatusChanged(db, 'inv-2', 'INV-T-002', 'pending', 'claimed', { userId: USER });

      const [withSource, without] = rows();
      expect(withSource!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"pending","to":"claimed","subjectLabel":"INV-T-001","amount":1200,"batchId":"batch-1","budgetSourceId":"src-1"}',
      );
      expect(without!.metadata).not.toContain('budgetSourceId');
    });

    it('deposit event: key order is depositId, batchId, budgetSourceId', () => {
      onDepositStatusChanged(
        db,
        { id: 'dep-1', invoiceId: 'inv-1', entryType: 'deposit', amount: 300 },
        'INV-T-001',
        'pending',
        'claimed',
        { userId: USER },
        { batchId: 'batch-1', budgetSourceId: 'src-1' },
      );
      expect(rows()[0]!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"pending","to":"claimed","subjectLabel":"INV-T-001","amount":300,"depositEntryType":"deposit","depositId":"dep-1","batchId":"batch-1","budgetSourceId":"src-1"}',
      );
    });
  });

  describe('revertOf (#2243)', () => {
    it('invoice status: revertOf is the last key, omitted when not given', () => {
      onInvoiceStatusChanged(
        db,
        'inv-1',
        'INV-T-001',
        'claimed',
        'paid',
        { userId: USER },
        { amount: 1200, batchId: 'batch-2', budgetSourceId: 'src-1', revertOf: 'batch-1' },
      );
      onInvoiceStatusChanged(db, 'inv-2', 'INV-T-002', 'pending', 'claimed', { userId: USER });

      const [reverted, plain] = rows();
      expect(reverted!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"claimed","to":"paid","subjectLabel":"INV-T-001","amount":1200,"batchId":"batch-2","budgetSourceId":"src-1","revertOf":"batch-1"}',
      );
      expect(plain!.metadata).not.toContain('revertOf');
    });

    it('deposit event: revertOf is last and a move to pending IS written when it reverts', () => {
      onDepositStatusChanged(
        db,
        { id: 'dep-1', invoiceId: 'inv-1', entryType: 'deposit', amount: 300 },
        'INV-T-001',
        'claimed',
        'pending',
        { userId: USER },
        { batchId: 'batch-2', budgetSourceId: 'src-1', revertOf: 'batch-1' },
      );
      expect(rows()).toHaveLength(1);
      expect(rows()[0]!.metadata).toBe(
        '{"v":1,"event":"status_changed","from":"claimed","to":"pending","subjectLabel":"INV-T-001","amount":300,"depositEntryType":"deposit","depositId":"dep-1","batchId":"batch-2","budgetSourceId":"src-1","revertOf":"batch-1"}',
      );
    });
  });

  describe('batchId (W5)', () => {
    it('is omitted from events that do not carry one', () => {
      onInvoiceStatusChanged(db, 'i', 'N', 'pending', 'paid', UNDOABLE, { amount: 5 });
      expect(rows()[0]!.metadata).not.toContain('batchId');
    });

    it('is stored on the events of one batch', () => {
      onInvoiceStatusChanged(
        db,
        'i1',
        'N1',
        'pending',
        'claimed',
        { userId: USER },
        { batchId: 'b' },
      );
      onInvoiceStatusChanged(
        db,
        'i2',
        'N2',
        'pending',
        'claimed',
        { userId: USER },
        { batchId: 'b' },
      );
      expect(rows().map((r) => (JSON.parse(r.metadata!) as { batchId: string }).batchId)).toEqual([
        'b',
        'b',
      ]);
    });
  });
});
