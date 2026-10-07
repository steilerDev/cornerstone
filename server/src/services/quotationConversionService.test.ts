/**
 * Unit + integration tests for quotationConversionService.ts
 *
 * Story #2107 — Convert a quotation into the final invoice (atomic, in place).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { ConvertQuotationRequest } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { convertQuotation } from './quotationConversionService.js';
import { listAllInvoices } from './invoiceService.js';
import { getSourceReport } from './sourceReportService.js';
import {
  AppError,
  InvoiceNotQuotationError,
  ItemizedSumExceedsInvoiceError,
  NotFoundError,
  ValidationError,
} from '../errors/AppError.js';

describe('quotationConversionService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let counter = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    counter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Fixture helpers ────────────────────────────────────────────────────────

  function ts(): string {
    return new Date(Date.now() + counter++).toISOString();
  }

  function insertUser(): string {
    const id = `user-${++counter}`;
    const now = ts();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = `vendor-${++counter}`;
    const now = ts();
    db.insert(schema.vendors).values({ id, name: 'Vendor', createdAt: now, updatedAt: now }).run();
    return id;
  }

  function insertInvoice(
    vendorId: string,
    overrides: Partial<typeof schema.invoices.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `inv-${++counter}`;
    const now = ts();
    db.insert(schema.invoices)
      .values({
        vendorId,
        amount: 10000,
        date: '2026-01-15',
        status: 'quotation',
        invoiceNumber: 'Q-1',
        notes: 'Existing notes',
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertBudgetSource(): string {
    const id = `src-${++counter}`;
    const now = ts();
    db.insert(schema.budgetSources)
      .values({
        id,
        name: 'Source',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        isDiscretionary: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /** Creates a work item + budget and links it to the invoice. Returns the IBL id. */
  function insertLine(invoiceId: string, amount: number, sourceId: string | null = null): string {
    const wiId = `wi-${++counter}`;
    const budgetId = `wib-${counter}`;
    const now = ts();
    db.insert(schema.workItems)
      .values({
        id: wiId,
        title: `WI ${counter}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const id = randomUUID();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: budgetId,
        itemizedAmount: amount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertDeposit(
    invoiceId: string,
    overrides: Partial<typeof schema.invoiceDeposits.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `dep-${++counter}`;
    const now = ts();
    db.insert(schema.invoiceDeposits)
      .values({
        invoiceId,
        amount: 100,
        dueDate: '2026-01-01',
        status: 'pending',
        entryType: 'deposit',
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertDocumentLink(
    invoiceId: string,
    paperlessDocumentId: number,
    attachmentType: 'quotation' | 'deposit' | 'invoice' | null,
  ): string {
    const id = randomUUID();
    db.insert(schema.documentLinks)
      .values({
        id,
        entityType: 'invoice',
        entityId: invoiceId,
        paperlessDocumentId,
        attachmentType,
        createdAt: ts(),
      })
      .run();
    return id;
  }

  function getInvoiceRow(id: string) {
    return db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).get()!;
  }

  function getLineRows(invoiceId: string) {
    return db
      .select()
      .from(schema.invoiceBudgetLines)
      .where(eq(schema.invoiceBudgetLines.invoiceId, invoiceId))
      .all()
      .sort((a, b) => a.itemizedAmount - b.itemizedAmount);
  }

  function getDepositRows(invoiceId: string) {
    return db
      .select()
      .from(schema.invoiceDeposits)
      .where(eq(schema.invoiceDeposits.invoiceId, invoiceId))
      .all()
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function getLinks(invoiceId: string) {
    return db
      .select()
      .from(schema.documentLinks)
      .where(eq(schema.documentLinks.entityId, invoiceId))
      .all();
  }

  /** Standard scenario: 10,000 quotation with two lines (6,000 and 3,000). */
  function setup() {
    const userId = insertUser();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId);
    const line6k = insertLine(invoiceId, 6000);
    const line3k = insertLine(invoiceId, 3000);
    return { userId, vendorId, invoiceId, line6k, line3k };
  }

  function request(overrides: Partial<ConvertQuotationRequest> = {}): ConvertQuotationRequest {
    return {
      amount: 10500,
      date: '2026-03-01',
      status: 'pending',
      conversionNote: 'Converted from quotation of 10,000.00 on 2026-03-01.',
      ...overrides,
    };
  }

  function diaryEntries() {
    return db.select().from(schema.diaryEntries).all();
  }

  // ─── Happy path ─────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('scenario 1: converts in place, updating fields, notes, line amounts and derived totals', () => {
      const { userId, vendorId, invoiceId, line6k, line3k } = setup();

      const result = convertQuotation(
        db,
        invoiceId,
        request({
          invoiceNumber: 'INV-2026-1',
          dueDate: '2026-04-01',
          budgetLines: [
            { id: line6k, itemizedAmount: 6300 },
            { id: line3k, itemizedAmount: 3150 },
          ],
        }),
        userId,
      );

      expect(result.id).toBe(invoiceId);
      expect(result.vendorId).toBe(vendorId);
      expect(result.status).toBe('pending');
      expect(result.amount).toBe(10500);
      expect(result.date).toBe('2026-03-01');
      expect(result.invoiceNumber).toBe('INV-2026-1');
      expect(result.dueDate).toBe('2026-04-01');
      expect(result.notes).toBe(
        'Existing notes\n\nConverted from quotation of 10,000.00 on 2026-03-01.',
      );
      expect(result.budgetLines.map((l) => l.itemizedAmount).sort((a, b) => a - b)).toEqual([
        3150, 6300,
      ]);
      expect(result.remainingAmount).toBe(1050);
      expect(result.finalPaymentAmount).toBe(10500);

      // Persisted in place: still exactly one invoice
      expect(db.select().from(schema.invoices).all()).toHaveLength(1);
      expect(getLineRows(invoiceId).map((l) => l.itemizedAmount)).toEqual([3150, 6300]);
    });

    it('scenario 2: status paid produces a paid invoice', () => {
      const { userId, invoiceId } = setup();

      const result = convertQuotation(db, invoiceId, request({ status: 'paid' }), userId);

      expect(result.status).toBe('paid');
      expect(getInvoiceRow(invoiceId).status).toBe('paid');
    });

    it('keeps invoiceNumber and dueDate when omitted, clears them when null', () => {
      const { userId, invoiceId } = setup();
      db.update(schema.invoices)
        .set({ dueDate: '2026-05-01' })
        .where(eq(schema.invoices.id, invoiceId))
        .run();

      const kept = convertQuotation(db, invoiceId, request(), userId);
      expect(kept.invoiceNumber).toBe('Q-1');
      expect(kept.dueDate).toBe('2026-05-01');
    });

    it('clears invoiceNumber and dueDate when null, and treats blank number as null', () => {
      const { userId, invoiceId } = setup();
      db.update(schema.invoices)
        .set({ dueDate: '2026-05-01' })
        .where(eq(schema.invoices.id, invoiceId))
        .run();

      const cleared = convertQuotation(
        db,
        invoiceId,
        request({ invoiceNumber: '   ', dueDate: null }),
        userId,
      );
      expect(cleared.invoiceNumber).toBeNull();
      expect(cleared.dueDate).toBeNull();
    });

    it('trims a provided invoice number', () => {
      const { userId, invoiceId } = setup();

      const result = convertQuotation(db, invoiceId, request({ invoiceNumber: '  X-9  ' }), userId);

      expect(result.invoiceNumber).toBe('X-9');
    });

    it('works for a quotation with no budget lines', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor());

      const result = convertQuotation(db, invoiceId, request(), userId);

      expect(result.status).toBe('pending');
      expect(result.budgetLines).toEqual([]);
    });
  });

  // ─── Diary ──────────────────────────────────────────────────────────────────

  describe('diary event', () => {
    it('scenario 3a: fires quotation -> new status after commit when enabled', () => {
      const { userId, invoiceId } = setup();

      convertQuotation(db, invoiceId, request({ status: 'paid' }), userId, true);

      const entries = diaryEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.entryType).toBe('invoice_status');
      expect(entries[0]!.title).toBe('Status changed from Quotation to Paid');
      expect(entries[0]!.sourceEntityId).toBe(invoiceId);
    });

    it('scenario 3b: does not fire when disabled', () => {
      const { userId, invoiceId } = setup();

      convertQuotation(db, invoiceId, request(), userId, false);

      expect(diaryEntries()).toHaveLength(0);
    });

    it('does not fire when the conversion is rejected', () => {
      const { userId, invoiceId } = setup();

      expect(() => convertQuotation(db, invoiceId, request({ amount: 100 }), userId, true)).toThrow(
        ItemizedSumExceedsInvoiceError,
      );

      expect(diaryEntries()).toHaveLength(0);
    });

    it('uses N/A in the diary body when the invoice has no number', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor(), { invoiceNumber: null });

      convertQuotation(db, invoiceId, request(), userId, true);

      expect(diaryEntries()[0]!.body).toContain('N/A');
    });
  });

  // ─── Notes ──────────────────────────────────────────────────────────────────

  describe('notes', () => {
    it('scenario 4a: notes null gives notes equal to the conversion note', () => {
      const { userId, invoiceId } = setup();

      const result = convertQuotation(
        db,
        invoiceId,
        request({ notes: null, conversionNote: 'History line' }),
        userId,
      );

      expect(result.notes).toBe('History line');
    });

    it('scenario 4b: omitted notes keep the existing notes as the base', () => {
      const { userId, invoiceId } = setup();

      const result = convertQuotation(
        db,
        invoiceId,
        request({ conversionNote: 'History line' }),
        userId,
      );

      expect(result.notes).toBe('Existing notes\n\nHistory line');
    });

    it('uses provided notes as base and trims both parts', () => {
      const { userId, invoiceId } = setup();

      const result = convertQuotation(
        db,
        invoiceId,
        request({ notes: '  New base  ', conversionNote: '  History  ' }),
        userId,
      );

      expect(result.notes).toBe('New base\n\nHistory');
    });

    it('omitted notes with an existing null note gives only the conversion note', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor(), { notes: null });

      const result = convertQuotation(db, invoiceId, request({ conversionNote: 'Only' }), userId);

      expect(result.notes).toBe('Only');
    });

    it('scenario 14a: whitespace-only conversionNote throws ValidationError', () => {
      const { userId, invoiceId } = setup();

      expect(() =>
        convertQuotation(db, invoiceId, request({ conversionNote: '   ' }), userId),
      ).toThrow(ValidationError);
      expect(getInvoiceRow(invoiceId).status).toBe('quotation');
    });

    it('scenario 14b: combined notes over 10,000 characters throw ValidationError', () => {
      const { userId, invoiceId } = setup();

      expect(() =>
        convertQuotation(
          db,
          invoiceId,
          request({ notes: 'a'.repeat(9999), conversionNote: 'bbbb' }),
          userId,
        ),
      ).toThrow(ValidationError);
      expect(getInvoiceRow(invoiceId).notes).toBe('Existing notes');
    });

    it('combined notes of exactly 10,000 characters are accepted', () => {
      const { userId, invoiceId } = setup();

      // 9996 + 2 (separator) + 2 = 10000
      const result = convertQuotation(
        db,
        invoiceId,
        request({ notes: 'a'.repeat(9996), conversionNote: 'bb' }),
        userId,
      );

      expect(result.notes!.length).toBe(10000);
    });
  });

  // ─── Status and lookup guards ───────────────────────────────────────────────

  describe('guards', () => {
    it.each(['pending', 'paid', 'claimed'] as const)(
      'scenario 5: status %s throws InvoiceNotQuotationError and changes nothing',
      (status) => {
        const userId = insertUser();
        const invoiceId = insertInvoice(insertVendor(), { status });
        const before = getInvoiceRow(invoiceId);

        let caught: unknown;
        try {
          convertQuotation(db, invoiceId, request(), userId);
        } catch (e) {
          caught = e;
        }

        expect(caught).toBeInstanceOf(InvoiceNotQuotationError);
        const err = caught as InvoiceNotQuotationError;
        expect(err.code).toBe('INVOICE_NOT_QUOTATION');
        expect(err.statusCode).toBe(409);
        expect(err.details).toEqual({ status });
        expect(getInvoiceRow(invoiceId)).toEqual(before);
      },
    );

    it('scenario 6: unknown invoice throws NotFoundError', () => {
      const userId = insertUser();

      expect(() => convertQuotation(db, 'does-not-exist', request(), userId)).toThrow(
        NotFoundError,
      );
    });

    it('rejects a non-positive amount with ValidationError', () => {
      const { userId, invoiceId } = setup();

      expect(() => convertQuotation(db, invoiceId, request({ amount: 0 }), userId)).toThrow(
        ValidationError,
      );
    });

    it('rejects an invalid date with ValidationError', () => {
      const { userId, invoiceId } = setup();

      expect(() =>
        convertQuotation(db, invoiceId, request({ date: 'not-a-date' }), userId),
      ).toThrow(ValidationError);
      expect(() =>
        convertQuotation(db, invoiceId, request({ date: '2026-99-99' }), userId),
      ).toThrow(ValidationError);
    });

    it('rejects an invalid dueDate with ValidationError', () => {
      const { userId, invoiceId } = setup();

      expect(() =>
        convertQuotation(db, invoiceId, request({ dueDate: 'garbage' }), userId),
      ).toThrow(ValidationError);
    });

    it('scenario 15: dueDate before date throws ValidationError; equal dates are accepted', () => {
      const { userId, invoiceId } = setup();

      expect(() =>
        convertQuotation(
          db,
          invoiceId,
          request({ date: '2026-03-01', dueDate: '2026-02-28' }),
          userId,
        ),
      ).toThrow(ValidationError);
      expect(getInvoiceRow(invoiceId).status).toBe('quotation');

      const ok = convertQuotation(
        db,
        invoiceId,
        request({ date: '2026-03-01', dueDate: '2026-03-01' }),
        userId,
      );
      expect(ok.dueDate).toBe('2026-03-01');
    });

    it('rejects an impossible calendar date (2026-02-31) and leaves the invoice unchanged', () => {
      const { userId, invoiceId } = setup();
      const before = getInvoiceRow(invoiceId);

      expect(() =>
        convertQuotation(db, invoiceId, request({ date: '2026-02-31' }), userId),
      ).toThrow(ValidationError);

      expect(getInvoiceRow(invoiceId)).toEqual(before);
    });

    it('rejects an impossible calendar dueDate (2026-02-30)', () => {
      const { userId, invoiceId } = setup();
      const before = getInvoiceRow(invoiceId);

      expect(() =>
        convertQuotation(db, invoiceId, request({ dueDate: '2026-02-30' }), userId),
      ).toThrow(ValidationError);

      expect(getInvoiceRow(invoiceId)).toEqual(before);
    });

    it('omitted dueDate with a stored due date before the new date throws VALIDATION_ERROR and writes nothing', () => {
      const { userId, invoiceId } = setup();
      db.update(schema.invoices)
        .set({ dueDate: '2026-02-01T00:00:00.000Z' })
        .where(eq(schema.invoices.id, invoiceId))
        .run();
      const before = getInvoiceRow(invoiceId);

      let caught: unknown;
      try {
        convertQuotation(db, invoiceId, request({ date: '2026-03-01' }), userId);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).code).toBe('VALIDATION_ERROR');
      expect(getInvoiceRow(invoiceId)).toEqual(before);
    });

    it('omitted dueDate with a stored due date on or after the new date succeeds and keeps it', () => {
      const { userId, invoiceId } = setup();
      db.update(schema.invoices)
        .set({ dueDate: '2026-03-01' })
        .where(eq(schema.invoices.id, invoiceId))
        .run();

      const result = convertQuotation(db, invoiceId, request({ date: '2026-03-01' }), userId);

      expect(result.status).toBe('pending');
      expect(result.dueDate).toBe('2026-03-01');
    });

    it('omitted dueDate with a null stored due date succeeds', () => {
      const { userId, invoiceId } = setup();
      expect(getInvoiceRow(invoiceId).dueDate).toBeNull();

      const result = convertQuotation(db, invoiceId, request(), userId);

      expect(result.status).toBe('pending');
      expect(result.dueDate).toBeNull();
    });
  });

  // ─── Budget lines ───────────────────────────────────────────────────────────

  describe('budget lines', () => {
    it('scenario 7: a line id from another invoice throws NotFoundError and rolls back', () => {
      const { userId, invoiceId, line6k } = setup();
      const otherInvoice = insertInvoice(insertVendor(), { status: 'pending' });
      const foreignLine = insertLine(otherInvoice, 500);

      expect(() =>
        convertQuotation(
          db,
          invoiceId,
          request({
            budgetLines: [
              { id: line6k, itemizedAmount: 6300 },
              { id: foreignLine, itemizedAmount: 100 },
            ],
          }),
          userId,
        ),
      ).toThrow(NotFoundError);

      const row = getInvoiceRow(invoiceId);
      expect(row.status).toBe('quotation');
      expect(row.amount).toBe(10000);
      expect(row.notes).toBe('Existing notes');
      expect(getLineRows(invoiceId).map((l) => l.itemizedAmount)).toEqual([3000, 6000]);
      expect(getLineRows(otherInvoice).map((l) => l.itemizedAmount)).toEqual([500]);
    });

    it('scenario 8: duplicate line ids throw ValidationError', () => {
      const { userId, invoiceId, line6k } = setup();

      expect(() =>
        convertQuotation(
          db,
          invoiceId,
          request({
            budgetLines: [
              { id: line6k, itemizedAmount: 100 },
              { id: line6k, itemizedAmount: 200 },
            ],
          }),
          userId,
        ),
      ).toThrow(ValidationError);
    });

    it('rejects a non-positive itemizedAmount with ValidationError', () => {
      const { userId, invoiceId, line6k } = setup();

      expect(() =>
        convertQuotation(
          db,
          invoiceId,
          request({ budgetLines: [{ id: line6k, itemizedAmount: 0 }] }),
          userId,
        ),
      ).toThrow(ValidationError);
    });

    it('scenario 9: omitted budgetLines with amount below existing itemized total is rejected', () => {
      const { userId, invoiceId } = setup();

      let caught: unknown;
      try {
        convertQuotation(db, invoiceId, request({ amount: 8000 }), userId);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ItemizedSumExceedsInvoiceError);
      const err = caught as ItemizedSumExceedsInvoiceError;
      expect(err.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
      expect(err.details).toEqual({ invoiceTotal: 8000, itemizedTotal: 9000 });
      expect(getInvoiceRow(invoiceId).status).toBe('quotation');
      expect(getInvoiceRow(invoiceId).amount).toBe(10000);
    });

    it('accepts an itemized total exactly equal to the final amount', () => {
      const { userId, invoiceId } = setup();

      const result = convertQuotation(db, invoiceId, request({ amount: 9000 }), userId);

      expect(result.remainingAmount).toBe(0);
    });

    it('scenario 10: float noise (332.85 + 333.04 + 334.11 against 1000) passes', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor(), { amount: 1000 });
      insertLine(invoiceId, 332.85);
      insertLine(invoiceId, 333.04);
      insertLine(invoiceId, 334.11);

      const result = convertQuotation(db, invoiceId, request({ amount: 1000 }), userId);

      expect(result.status).toBe('pending');
      expect(result.budgetLines).toHaveLength(3);
    });

    it('unlisted lines stay unchanged when only some lines are updated', () => {
      const { userId, invoiceId, line6k } = setup();

      convertQuotation(
        db,
        invoiceId,
        request({ budgetLines: [{ id: line6k, itemizedAmount: 7000 }] }),
        userId,
      );

      expect(getLineRows(invoiceId).map((l) => l.itemizedAmount)).toEqual([3000, 7000]);
    });
  });

  // ─── Deposits ───────────────────────────────────────────────────────────────

  describe('deposits', () => {
    it('scenario 11: paid deposit 6,000 with final 5,000 converts successfully and deposit rows stay byte-identical (#2188)', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor());
      insertDeposit(invoiceId, { amount: 6000, status: 'paid', paidDate: '2026-01-20' });
      const before = getDepositRows(invoiceId);

      const result = convertQuotation(db, invoiceId, request({ amount: 5000 }), userId);

      expect(result.status).toBe('pending');
      expect(result.amount).toBe(5000);
      expect(result.finalPaymentAmount).toBe(0);
      expect(getInvoiceRow(invoiceId).status).toBe('pending');
      expect(getInvoiceRow(invoiceId).amount).toBe(5000);
      expect(getDepositRows(invoiceId)).toEqual(before);
      expect(before).toHaveLength(1);
      expect(before[0]!.amount).toBe(6000);
    });

    it('over-deposit with a refund present also converts and leaves both rows unchanged', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor());
      insertDeposit(invoiceId, { amount: 6000, status: 'paid', paidDate: '2026-01-20' });
      insertDeposit(invoiceId, { amount: 500, entryType: 'refund', status: 'pending' });
      const before = getDepositRows(invoiceId);

      const result = convertQuotation(db, invoiceId, request({ amount: 5000 }), userId);

      expect(result.amount).toBe(5000);
      expect(getDepositRows(invoiceId)).toEqual(before);
    });

    it('over-deposit does not mask the itemized-sum check (itemized over the final amount still rejects)', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor());
      insertLine(invoiceId, 9000);
      insertDeposit(invoiceId, { amount: 6000, status: 'paid', paidDate: '2026-01-20' });

      expect(() => convertQuotation(db, invoiceId, request({ amount: 8000 }), userId)).toThrow(
        ItemizedSumExceedsInvoiceError,
      );
      expect(getInvoiceRow(invoiceId).status).toBe('quotation');
    });

    it('accepts net deposits exactly equal to the final amount', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor());
      insertDeposit(invoiceId, { amount: 5000, status: 'paid', paidDate: '2026-01-20' });

      const result = convertQuotation(db, invoiceId, request({ amount: 5000 }), userId);

      expect(result.finalPaymentAmount).toBe(0);
    });

    it('scenario 12: a claimed deposit stays claimed with its claimedDate unchanged', () => {
      const userId = insertUser();
      const invoiceId = insertInvoice(insertVendor());
      const depId = insertDeposit(invoiceId, {
        amount: 2000,
        status: 'claimed',
        paidDate: '2026-01-20',
        claimedDate: '2026-01-25',
      });

      convertQuotation(db, invoiceId, request(), userId);

      const dep = db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.id, depId))
        .get()!;
      expect(dep.status).toBe('claimed');
      expect(dep.claimedDate).toBe('2026-01-25');
      expect(dep.amount).toBe(2000);
    });
  });

  // ─── Document link ──────────────────────────────────────────────────────────

  describe('paperless document link', () => {
    it('scenario 13a: no existing link creates an invoice-tier link; other quotation links are unchanged', () => {
      const { userId, invoiceId } = setup();
      const otherLink = insertDocumentLink(invoiceId, 7, 'quotation');

      convertQuotation(db, invoiceId, request({ paperlessDocumentId: 42 }), userId);

      const links = getLinks(invoiceId);
      expect(links).toHaveLength(2);
      const created = links.find((l) => l.paperlessDocumentId === 42)!;
      expect(created.attachmentType).toBe('invoice');
      expect(created.createdBy).toBe(userId);
      const untouched = links.find((l) => l.id === otherLink)!;
      expect(untouched.attachmentType).toBe('quotation');
    });

    it('scenario 13b: an existing null-tier link is upgraded to invoice', () => {
      const { userId, invoiceId } = setup();
      const linkId = insertDocumentLink(invoiceId, 42, null);

      convertQuotation(db, invoiceId, request({ paperlessDocumentId: 42 }), userId);

      const links = getLinks(invoiceId);
      expect(links).toHaveLength(1);
      expect(links[0]!.id).toBe(linkId);
      expect(links[0]!.attachmentType).toBe('invoice');
    });

    it('scenario 13c: an existing invoice-tier link is a no-op', () => {
      const { userId, invoiceId } = setup();
      const linkId = insertDocumentLink(invoiceId, 42, 'invoice');

      const result = convertQuotation(db, invoiceId, request({ paperlessDocumentId: 42 }), userId);

      expect(result.status).toBe('pending');
      const links = getLinks(invoiceId);
      expect(links).toHaveLength(1);
      expect(links[0]!.id).toBe(linkId);
      expect(links[0]!.attachmentType).toBe('invoice');
    });

    it.each(['quotation', 'deposit'] as const)(
      'scenario 13d: an existing %s-tier link on the same document throws 409 and rolls back everything',
      (tier) => {
        const { userId, invoiceId, line6k } = setup();
        insertDocumentLink(invoiceId, 42, tier);

        let caught: unknown;
        try {
          convertQuotation(
            db,
            invoiceId,
            request({
              paperlessDocumentId: 42,
              budgetLines: [{ id: line6k, itemizedAmount: 6300 }],
            }),
            userId,
            true,
          );
        } catch (e) {
          caught = e;
        }

        expect(caught).toBeInstanceOf(AppError);
        const err = caught as AppError;
        expect(err.code).toBe('DUPLICATE_DOCUMENT_LINK');
        expect(err.statusCode).toBe(409);

        const row = getInvoiceRow(invoiceId);
        expect(row.status).toBe('quotation');
        expect(row.amount).toBe(10000);
        expect(row.notes).toBe('Existing notes');
        expect(getLineRows(invoiceId).map((l) => l.itemizedAmount)).toEqual([3000, 6000]);
        expect(getLinks(invoiceId)[0]!.attachmentType).toBe(tier);
        expect(diaryEntries()).toHaveLength(0);
      },
    );
  });

  // ─── Downstream views ───────────────────────────────────────────────────────

  describe('downstream views', () => {
    it('scenario 16a: listAllInvoices summary counts the invoice under pending and no longer quotation', () => {
      const { userId, invoiceId } = setup();
      const before = listAllInvoices(db, {}).summary;
      expect(before.quotation.count).toBe(1);
      expect(before.pending.count).toBe(0);

      convertQuotation(db, invoiceId, request(), userId);

      const after = listAllInvoices(db, {}).summary;
      expect(after.quotation.count).toBe(0);
      expect(after.pending.count).toBe(1);
    });

    it('scenario 16b: a converted invoice appears in the claim report where the quotation did not', async () => {
      const userId = insertUser();
      const sourceId = insertBudgetSource();
      const invoiceId = insertInvoice(insertVendor());
      insertLine(invoiceId, 5000, sourceId);
      const config = { paperlessEnabled: false } as const;

      const before = await getSourceReport(db, 'claim', sourceId, config);
      expect(before.invoices).toHaveLength(0);

      convertQuotation(db, invoiceId, request(), userId);

      const after = await getSourceReport(db, 'claim', sourceId, config);
      expect(after.invoices).toHaveLength(1);
      expect(after.invoices[0]!.status).toBe('pending');
    });
  });
});
