/**
 * Unit tests for sourceReportService.revertSubmission (Story #2243, contract 14).
 *
 * Real in-memory DB. The submission is created through `markInvoicesClaimed` (real flow) for the
 * happy path, and with hand-written events (explicit `created_at`) where event order, old
 * batches or odd metadata matter.
 *
 * Covers: restore of invoices and progress payments, event metadata (key order, new batchId,
 * revertOf last), 404 / 409 codes with `details.items`, "a 409 writes nothing", AC7 (reads only
 * events, no config), the shared status vocabulary (REPORT_TYPE_INVOICE_STATUSES).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { REPORT_TYPE_INVOICE_STATUSES, SOURCE_REPORT_TYPES } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  markInvoicesClaimed,
  revertSubmission,
  REPORT_TYPE_STATUSES,
} from './sourceReportService.js';
import {
  NotFoundError,
  SubmissionAlreadyRevertedError,
  SubmissionChangedError,
} from '../errors/AppError.js';
import { __resetLedgerForTests } from './statusEventLedger.js';

const OLD = '2020-01-01T00:00:00.000Z';

describe('revertSubmission', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let counter = 0;
  let userId: string;
  let sourceId: string;
  let vendorId: string;

  beforeEach(() => {
    __resetLedgerForTests();
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    counter = 0;
    userId = insertUser();
    sourceId = insertSource();
    vendorId = insertVendor();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Fixtures ───────────────────────────────────────────────────────────

  function insertUser(): string {
    const id = `user-${++counter}`;
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.test`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'x',
        createdAt: OLD,
        updatedAt: OLD,
      })
      .run();
    return id;
  }

  function insertSource(): string {
    const id = `src-${++counter}`;
    db.insert(schema.budgetSources)
      .values({
        id,
        name: 'Test Loan',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        isDiscretionary: false,
        status: 'active',
        createdAt: OLD,
        updatedAt: OLD,
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = `vendor-${++counter}`;
    db.insert(schema.vendors)
      .values({ id, name: 'Test Vendor', createdAt: OLD, updatedAt: OLD })
      .run();
    return id;
  }

  function insertInvoice(overrides: Partial<typeof schema.invoices.$inferInsert> = {}): string {
    const id = overrides.id ?? `inv-${++counter}`;
    db.insert(schema.invoices)
      .values({
        vendorId,
        amount: 1000,
        date: '2026-01-15',
        status: 'pending',
        invoiceNumber: `INV-${counter}`,
        createdAt: OLD,
        updatedAt: OLD,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertDeposit(
    invoiceId: string,
    overrides: Partial<typeof schema.invoiceDeposits.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `dep-${++counter}`;
    db.insert(schema.invoiceDeposits)
      .values({
        invoiceId,
        amount: 100,
        dueDate: '2026-01-01',
        status: 'pending',
        entryType: 'deposit',
        createdAt: OLD,
        updatedAt: OLD,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  /** Hand-written automatic invoice_status event with an explicit created_at (event order). */
  function insertEvent(
    invoiceId: string,
    meta: Record<string, unknown>,
    createdAt: string,
    overrides: Partial<typeof schema.diaryEntries.$inferInsert> = {},
  ): void {
    db.insert(schema.diaryEntries)
      .values({
        id: randomUUID(),
        entryType: 'invoice_status',
        entryDate: createdAt.slice(0, 10),
        title: null,
        body: '',
        metadata: JSON.stringify(meta),
        status: 'saved',
        isAutomatic: true,
        sourceEntityType: 'invoice',
        sourceEntityId: invoiceId,
        createdBy: userId,
        createdAt,
        updatedAt: createdAt,
        ...overrides,
      })
      .run();
  }

  const submissionMeta = (
    batchId: string,
    from: unknown,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    v: 1,
    event: 'status_changed',
    from,
    to: 'claimed',
    subjectLabel: 'X',
    batchId,
    budgetSourceId: sourceId,
    ...extra,
  });

  function events() {
    return db
      .select()
      .from(schema.diaryEntries)
      .all()
      .filter((e) => e.isAutomatic && e.entryType === 'invoice_status');
  }

  function invoiceRow(id: string) {
    return db
      .select()
      .from(schema.invoices)
      .all()
      .find((i) => i.id === id)!;
  }

  function depositRow(id: string) {
    return db
      .select()
      .from(schema.invoiceDeposits)
      .all()
      .find((d) => d.id === id)!;
  }

  /** Snapshot of everything a revert may write, to prove a 409 writes nothing. */
  function snapshot(): string {
    return JSON.stringify([
      db.select().from(schema.invoices).all(),
      db.select().from(schema.invoiceDeposits).all(),
      db.select().from(schema.diaryEntries).all(),
    ]);
  }

  // ─── Scenario 1: happy path ─────────────────────────────────────────────

  describe('happy path (real mark-claimed flow)', () => {
    it('restores pending and paid invoices and pending and paid progress payments', () => {
      const invPending = insertInvoice({ status: 'pending' });
      const invPaid = insertInvoice({ status: 'paid' });
      const parent = insertInvoice({ status: 'pending' });
      const depPending = insertDeposit(parent, { status: 'pending', amount: 100 });
      const depPaid = insertDeposit(parent, {
        status: 'paid',
        amount: 200,
        paidDate: '2026-01-05',
      });

      const submitted = markInvoicesClaimed(
        db,
        sourceId,
        [invPending, invPaid],
        [depPending, depPaid],
        userId,
      );
      expect(invoiceRow(invPending).status).toBe('claimed');
      expect(depositRow(depPaid).claimedDate).not.toBeNull();

      const result = revertSubmission(db, submitted.batchId, userId);

      expect(invoiceRow(invPending).status).toBe('pending');
      expect(invoiceRow(invPaid).status).toBe('paid');
      expect(depositRow(depPending).status).toBe('pending');
      expect(depositRow(depPaid).status).toBe('paid');
      // claimedDate cleared, paidDate untouched, updatedAt bumped
      expect(depositRow(depPaid).claimedDate).toBeNull();
      expect(depositRow(depPaid).paidDate).toBe('2026-01-05');
      expect(depositRow(depPaid).updatedAt > OLD).toBe(true);
      expect(invoiceRow(invPaid).updatedAt > OLD).toBe(true);
      // the parent invoice itself was never in the submission
      expect(invoiceRow(parent).status).toBe('pending');

      expect([...result.restoredInvoiceIds].sort()).toEqual([invPending, invPaid].sort());
      expect([...result.restoredDepositIds].sort()).toEqual([depPending, depPaid].sort());
      expect(result.batchId).not.toBe(submitted.batchId);
    });

    it('writes revert events with a new batchId and revertOf as the last metadata key', () => {
      const inv = insertInvoice({ status: 'paid', amount: 1234.5, invoiceNumber: 'R-1' });
      const parent = insertInvoice({ status: 'pending', invoiceNumber: 'P-1' });
      const dep = insertDeposit(parent, { status: 'pending', amount: 75 });
      const submitted = markInvoicesClaimed(db, sourceId, [inv], [dep], userId);
      const before = events().length;

      const result = revertSubmission(db, submitted.batchId, userId);

      const revertEvents = events().filter((e) => JSON.parse(e.metadata!).revertOf !== undefined);
      expect(events().length).toBe(before + 2);
      expect(revertEvents).toHaveLength(2);

      const invEvent = revertEvents.find((e) => e.sourceEntityId === inv)!;
      expect(invEvent.metadata).toBe(
        JSON.stringify({
          v: 1,
          event: 'status_changed',
          from: 'claimed',
          to: 'paid',
          subjectLabel: 'R-1',
          amount: 1234.5,
          batchId: result.batchId,
          budgetSourceId: sourceId,
          revertOf: submitted.batchId,
        }),
      );
      expect(invEvent.createdBy).toBe(userId);

      // The deposit -> pending row IS written (ADR-040 deviation), subject is the parent invoice
      const depEvent = revertEvents.find((e) => e.sourceEntityId === parent)!;
      const depMeta = JSON.parse(depEvent.metadata!);
      expect(Object.keys(depMeta)).toEqual([
        'v',
        'event',
        'from',
        'to',
        'subjectLabel',
        'amount',
        'depositEntryType',
        'depositId',
        'batchId',
        'budgetSourceId',
        'revertOf',
      ]);
      expect(depMeta).toMatchObject({
        from: 'claimed',
        to: 'pending',
        subjectLabel: 'P-1',
        amount: 75,
        depositId: dep,
        batchId: result.batchId,
        revertOf: submitted.batchId,
      });
      expect(result.batchId).not.toBe(submitted.batchId);
    });

    it('returns ids in event order (first event per key) regardless of insert order', () => {
      const a = insertInvoice({ status: 'claimed' });
      const b = insertInvoice({ status: 'claimed' });
      const parent = insertInvoice({ status: 'pending' });
      const d1 = insertDeposit(parent, { status: 'claimed' });
      const d2 = insertDeposit(parent, { status: 'claimed' });
      const batch = randomUUID();
      // Written out of order on purpose; created_at defines the order. d2 occurs twice.
      insertEvent(
        parent,
        submissionMeta(batch, 'pending', { depositId: d2 }),
        '2026-02-01T10:00:03.000Z',
      );
      insertEvent(b, submissionMeta(batch, 'paid'), '2026-02-01T10:00:01.000Z');
      insertEvent(a, submissionMeta(batch, 'pending'), '2026-02-01T10:00:02.000Z');
      insertEvent(
        parent,
        submissionMeta(batch, 'pending', { depositId: d1 }),
        '2026-02-01T10:00:04.000Z',
      );
      insertEvent(
        parent,
        submissionMeta(batch, 'paid', { depositId: d2 }),
        '2026-02-01T10:00:05.000Z',
      );

      const result = revertSubmission(db, batch, userId);

      expect(result.restoredInvoiceIds).toEqual([b, a]);
      expect(result.restoredDepositIds).toEqual([d2, d1]);
      // first event per key wins: d2 restored to its first `from`
      expect(depositRow(d2).status).toBe('pending');
      expect(invoiceRow(b).status).toBe('paid');
    });

    it('omits budgetSourceId on the revert events of an old batch that never had one', () => {
      const inv = insertInvoice({ status: 'claimed' });
      const batch = randomUUID();
      const meta = submissionMeta(batch, 'pending');
      delete meta.budgetSourceId;
      insertEvent(inv, meta, '2026-02-01T10:00:00.000Z');

      revertSubmission(db, batch, null);

      const revertEvent = events().find((e) => JSON.parse(e.metadata!).revertOf === batch)!;
      expect(JSON.parse(revertEvent.metadata!)).not.toHaveProperty('budgetSourceId');
      expect(revertEvent.createdBy).toBeNull();
    });

    it('takes budgetSourceId from the first event that names one', () => {
      const a = insertInvoice({ status: 'claimed' });
      const b = insertInvoice({ status: 'claimed' });
      const batch = randomUUID();
      const bare = submissionMeta(batch, 'pending');
      delete bare.budgetSourceId;
      insertEvent(a, bare, '2026-02-01T10:00:00.000Z');
      insertEvent(b, submissionMeta(batch, 'pending'), '2026-02-01T10:00:01.000Z');

      revertSubmission(db, batch, userId);

      const revertEvent = events().find((e) => JSON.parse(e.metadata!).revertOf === batch)!;
      expect(JSON.parse(revertEvent.metadata!).budgetSourceId).toBe(sourceId);
    });
  });

  // ─── Scenario 3: AC7 ────────────────────────────────────────────────────

  describe('AC7: reads only the batch events', () => {
    it('reverts a deposit-only batch', () => {
      const parent = insertInvoice({ status: 'pending' });
      const d1 = insertDeposit(parent, { status: 'pending' });
      const d2 = insertDeposit(parent, { status: 'paid', paidDate: '2026-01-03' });
      const submitted = markInvoicesClaimed(db, sourceId, [], [d1, d2], userId);
      expect(submitted.claimedInvoiceIds).toEqual([]);

      const result = revertSubmission(db, submitted.batchId, userId);

      expect(result.restoredInvoiceIds).toEqual([]);
      expect([...result.restoredDepositIds].sort()).toEqual([d1, d2].sort());
      expect(depositRow(d1).status).toBe('pending');
      expect(depositRow(d2).status).toBe('paid');
      expect(invoiceRow(parent).status).toBe('pending');
    });

    it('takes no config input and the source never reads configuration', () => {
      expect(revertSubmission.length).toBeLessThanOrEqual(3);
      const source = readFileSync(new URL('./sourceReportService.ts', import.meta.url), 'utf8');
      const start = source.indexOf('export function revertSubmission');
      const body = source.slice(start);
      expect(body).not.toMatch(/process\.env|config\.|DIARY_AUTO_EVENTS|getConfig/);
    });
  });

  // ─── Scenario 2: errors ─────────────────────────────────────────────────

  describe('404', () => {
    it('throws NotFoundError for an unknown batch id', () => {
      expect(() => revertSubmission(db, randomUUID(), userId)).toThrow(NotFoundError);
      expect(() => revertSubmission(db, randomUUID(), userId)).toThrow('Submission not found');
    });

    it('throws NotFoundError for a revert batch id (revert events carry revertOf)', () => {
      const inv = insertInvoice({ status: 'pending' });
      const submitted = markInvoicesClaimed(db, sourceId, [inv], [], userId);
      const reverted = revertSubmission(db, submitted.batchId, userId);

      expect(() => revertSubmission(db, reverted.batchId, userId)).toThrow(NotFoundError);
    });

    it('ignores events that are not automatic invoice_status submission events', () => {
      const inv = insertInvoice({ status: 'claimed' });
      const batch = randomUUID();
      insertEvent(inv, submissionMeta(batch, 'pending'), OLD, { isAutomatic: false });
      insertEvent(inv, { ...submissionMeta(batch, 'pending'), to: 'paid' }, OLD);
      insertEvent(inv, submissionMeta(batch, 'pending'), OLD, { metadata: 'not json' });

      expect(() => revertSubmission(db, batch, userId)).toThrow(NotFoundError);
    });
  });

  describe('409 SUBMISSION_ALREADY_REVERTED', () => {
    it('is thrown on a second revert and writes nothing', () => {
      const inv = insertInvoice({ status: 'pending' });
      const submitted = markInvoicesClaimed(db, sourceId, [inv], [], userId);
      revertSubmission(db, submitted.batchId, userId);
      const before = snapshot();

      let error: unknown;
      try {
        revertSubmission(db, submitted.batchId, userId);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(SubmissionAlreadyRevertedError);
      expect((error as SubmissionAlreadyRevertedError).statusCode).toBe(409);
      expect((error as SubmissionAlreadyRevertedError).code).toBe('SUBMISSION_ALREADY_REVERTED');
      expect(snapshot()).toBe(before);
    });
  });

  describe('409 SUBMISSION_CHANGED', () => {
    function catchChanged(batch: string): SubmissionChangedError {
      try {
        revertSubmission(db, batch, userId);
      } catch (e) {
        expect(e).toBeInstanceOf(SubmissionChangedError);
        return e as SubmissionChangedError;
      }
      throw new Error('expected SubmissionChangedError');
    }

    it('lists an invoice moved back to paid, writes nothing, and keeps the other items', () => {
      const moved = insertInvoice({ status: 'pending' });
      const stillClaimed = insertInvoice({ status: 'pending' });
      const submitted = markInvoicesClaimed(db, sourceId, [moved, stillClaimed], [], userId);
      sqlite.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(moved);
      const before = snapshot();

      const error = catchChanged(submitted.batchId);

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('SUBMISSION_CHANGED');
      expect(error.details).toEqual({ items: [{ type: 'invoice', id: moved, status: 'paid' }] });
      expect(snapshot()).toBe(before);
      expect(invoiceRow(stillClaimed).status).toBe('claimed');
    });

    it('lists a deleted invoice with status null', () => {
      const gone = insertInvoice({ status: 'pending' });
      const kept = insertInvoice({ status: 'pending' });
      const submitted = markInvoicesClaimed(db, sourceId, [gone, kept], [], userId);
      sqlite.prepare('DELETE FROM invoices WHERE id = ?').run(gone);
      const before = snapshot();

      const error = catchChanged(submitted.batchId);

      expect(error.details).toEqual({ items: [{ type: 'invoice', id: gone, status: null }] });
      expect(snapshot()).toBe(before);
    });

    it('lists a progress payment that is no longer claimed', () => {
      const parent = insertInvoice({ status: 'pending' });
      const inv = insertInvoice({ status: 'pending' });
      const dep = insertDeposit(parent, { status: 'pending' });
      const submitted = markInvoicesClaimed(db, sourceId, [inv], [dep], userId);
      sqlite.prepare("UPDATE invoice_deposits SET status = 'paid' WHERE id = ?").run(dep);
      const before = snapshot();

      const error = catchChanged(submitted.batchId);

      expect(error.details).toEqual({
        items: [{ type: 'progress_payment', id: dep, status: 'paid' }],
      });
      expect(snapshot()).toBe(before);
      expect(invoiceRow(inv).status).toBe('claimed');
    });

    it('lists a deleted progress payment with status null', () => {
      const parent = insertInvoice({ status: 'pending' });
      const dep = insertDeposit(parent, { status: 'pending' });
      const other = insertDeposit(parent, { status: 'pending' });
      const submitted = markInvoicesClaimed(db, sourceId, [], [dep, other], userId);
      sqlite.prepare('DELETE FROM invoice_deposits WHERE id = ?').run(dep);

      const error = catchChanged(submitted.batchId);

      expect(error.details).toEqual({
        items: [{ type: 'progress_payment', id: dep, status: null }],
      });
    });

    it('treats an event whose `from` is neither pending nor paid as a changed item', () => {
      const inv = insertInvoice({ status: 'claimed' });
      const batch = randomUUID();
      insertEvent(inv, submissionMeta(batch, 'quotation'), OLD);
      const before = snapshot();

      const error = catchChanged(batch);

      expect(error.details).toEqual({ items: [{ type: 'invoice', id: inv, status: 'claimed' }] });
      expect(snapshot()).toBe(before);
    });
  });

  // ─── Scenario 6: shared statuses ────────────────────────────────────────

  describe('REPORT_TYPE_STATUSES vs shared REPORT_TYPE_INVOICE_STATUSES', () => {
    it('has exactly the three report types, each Set equal to the shared tuple', () => {
      expect(Object.keys(REPORT_TYPE_STATUSES).sort()).toEqual([...SOURCE_REPORT_TYPES].sort());
      expect(Object.keys(REPORT_TYPE_INVOICE_STATUSES).sort()).toEqual(
        [...SOURCE_REPORT_TYPES].sort(),
      );
      for (const type of SOURCE_REPORT_TYPES) {
        expect([...REPORT_TYPE_STATUSES[type]].sort()).toEqual(
          [...REPORT_TYPE_INVOICE_STATUSES[type]].sort(),
        );
      }
    });
  });
});
