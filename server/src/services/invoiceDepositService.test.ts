/**
 * Unit + integration tests for invoiceDepositService.ts
 *
 * Story #1403 — Invoice Deposits Foundation (backend-only)
 * Covers all 39 service-level scenarios from the test plan.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  createDeposit,
  updateDeposit,
  deleteDeposit,
  listDepositsForInvoice,
} from './invoiceDepositService.js';
import * as invoiceService from './invoiceService.js';
import {
  NotFoundError,
  DepositsExceedInvoiceTotalError,
  InvalidDepositStatusTransitionError,
  InvalidDepositDateForStatusError,
} from '../errors/AppError.js';

describe('invoiceDepositService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  let tsOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function createTestUser(email: string): string {
    const id = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date(Date.now() + tsOffset++).toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
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

  function createTestVendor(name = 'Test Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name,
        tradeId: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestInvoice(vendorId: string, amount = 1000, invoiceNumber?: string): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: invoiceNumber ?? null,
        amount,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    tsOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Setup helpers ──────────────────────────────────────────────────────────

  function setup() {
    const userId = createTestUser('user@example.com');
    const vendorId = createTestVendor();
    const invoiceId = createTestInvoice(vendorId, 1000, 'INV-001');
    return { userId, vendorId, invoiceId };
  }

  // ─── Sum invariant ──────────────────────────────────────────────────────────

  describe('Sum invariant', () => {
    it('scenario 1: create deposit within headroom succeeds', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      expect(deposit.amount).toBe(300);
      expect(deposit.status).toBe('pending');
    });

    it('scenario 2: create deposit equal to full invoice amount succeeds (Σ = total, final = 0)', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 1000, dueDate: '2026-02-01' }, userId);

      expect(deposit.amount).toBe(1000);
    });

    it('scenario 3: create deposit exceeding invoice amount throws DepositsExceedInvoiceTotalError with correct details', () => {
      const { userId, invoiceId } = setup();

      expect(() => {
        createDeposit(db, invoiceId, { amount: 1001, dueDate: '2026-02-01' }, userId);
      }).toThrow(DepositsExceedInvoiceTotalError);

      try {
        createDeposit(db, invoiceId, { amount: 1001, dueDate: '2026-02-01' }, userId);
      } catch (e) {
        const err = e as DepositsExceedInvoiceTotalError;
        expect(err.details).toMatchObject({
          invoiceTotal: 1000,
          currentDepositSum: 0,
          requestedAmount: 1001,
          availableHeadroom: 1000,
        });
      }
    });

    it('scenario 4: first and second deposits within headroom succeed; third that exceeds is rejected', () => {
      const { userId, invoiceId } = setup();

      createDeposit(db, invoiceId, { amount: 400, dueDate: '2026-02-01' }, userId);
      createDeposit(db, invoiceId, { amount: 400, dueDate: '2026-02-02' }, userId);

      expect(() => {
        createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-03' }, userId);
      }).toThrow(DepositsExceedInvoiceTotalError);

      try {
        createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-03' }, userId);
      } catch (e) {
        const err = e as DepositsExceedInvoiceTotalError;
        expect(err.details).toMatchObject({
          invoiceTotal: 1000,
          currentDepositSum: 800,
          requestedAmount: 300,
          availableHeadroom: 200,
        });
      }
    });

    it('scenario 5: update deposit amount within headroom succeeds', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      const updated = updateDeposit(db, invoiceId, deposit.id, { amount: 500 });

      expect(updated.amount).toBe(500);
    });

    it('scenario 6: update deposit amount that would exceed invoice total throws DepositsExceedInvoiceTotalError', () => {
      const { userId, invoiceId } = setup();

      createDeposit(db, invoiceId, { amount: 400, dueDate: '2026-02-01' }, userId);
      const deposit2 = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-02' }, userId);

      // deposit2 is 300, other is 400 — trying to update deposit2 to 700 would make total 1100
      expect(() => {
        updateDeposit(db, invoiceId, deposit2.id, { amount: 700 });
      }).toThrow(DepositsExceedInvoiceTotalError);
    });

    it('scenario 7: update deposit amount to same value succeeds (self-exclusion)', () => {
      const { userId, invoiceId } = setup();

      // Two deposits totalling exactly 1000
      createDeposit(db, invoiceId, { amount: 600, dueDate: '2026-02-01' }, userId);
      const deposit2 = createDeposit(db, invoiceId, { amount: 400, dueDate: '2026-02-02' }, userId);

      // Update deposit2 to same amount — should be fine because it self-excludes
      const updated = updateDeposit(db, invoiceId, deposit2.id, { amount: 400 });

      expect(updated.amount).toBe(400);
    });
  });

  // ─── State machine — allowed transitions ────────────────────────────────────

  describe('State machine — allowed transitions', () => {
    it('scenario 8: pending → paid succeeds; paidDate auto-set to today', () => {
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      expect(deposit.status).toBe('pending');

      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'paid' });

      expect(updated.status).toBe('paid');
      expect(updated.paidDate).toBe(today);
      expect(updated.claimedDate).toBeNull();
    });

    it('scenario 9: paid → claimed succeeds; claimedDate auto-set to today', () => {
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      expect(deposit.status).toBe('paid');

      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });

      expect(updated.status).toBe('claimed');
      expect(updated.claimedDate).toBe(today);
      expect(updated.paidDate).not.toBeNull(); // preserved
    });

    it('scenario 10: paid → pending (correction) succeeds; both paidDate and claimedDate cleared', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );

      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'pending' });

      expect(updated.status).toBe('pending');
      expect(updated.paidDate).toBeNull();
      expect(updated.claimedDate).toBeNull();
    });

    it('scenario 11: claimed → paid (correction) succeeds; claimedDate cleared, paidDate preserved', () => {
      const { userId, invoiceId } = setup();

      // Create as paid first, then promote to claimed
      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-01-20' },
        userId,
      );
      const claimed = updateDeposit(db, invoiceId, deposit.id, {
        status: 'claimed',
        claimedDate: '2026-01-25',
      });
      expect(claimed.status).toBe('claimed');
      expect(claimed.paidDate).toBe('2026-01-20');
      expect(claimed.claimedDate).toBe('2026-01-25');

      const reverted = updateDeposit(db, invoiceId, deposit.id, { status: 'paid' });

      expect(reverted.status).toBe('paid');
      expect(reverted.claimedDate).toBeNull();
      expect(reverted.paidDate).toBe('2026-01-20'); // preserved
    });
  });

  // ─── State machine — disallowed transitions ─────────────────────────────────

  describe('State machine — disallowed transitions', () => {
    it('scenario 12: pending → claimed throws InvalidDepositStatusTransitionError with correct details', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });
      }).toThrow(InvalidDepositStatusTransitionError);

      try {
        updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });
      } catch (e) {
        const err = e as InvalidDepositStatusTransitionError;
        expect(err.details).toMatchObject({
          from: 'pending',
          to: 'claimed',
          allowedTargets: ['paid'],
        });
      }
    });

    it('scenario 13: claimed → pending throws InvalidDepositStatusTransitionError with correct details', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      const claimed = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });
      expect(claimed.status).toBe('claimed');

      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { status: 'pending' });
      }).toThrow(InvalidDepositStatusTransitionError);

      try {
        updateDeposit(db, invoiceId, deposit.id, { status: 'pending' });
      } catch (e) {
        const err = e as InvalidDepositStatusTransitionError;
        expect(err.details).toMatchObject({
          from: 'claimed',
          to: 'pending',
          allowedTargets: ['paid'],
        });
      }
    });
  });

  // ─── Date side effects ──────────────────────────────────────────────────────

  describe('Date side effects', () => {
    it('scenario 14: pending → paid without explicit paidDate uses today', () => {
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'paid' });

      expect(updated.paidDate).toBe(today);
    });

    it('scenario 15: pending → paid with explicit paidDate uses the supplied date', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      const updated = updateDeposit(db, invoiceId, deposit.id, {
        status: 'paid',
        paidDate: '2026-01-15',
      });

      expect(updated.paidDate).toBe('2026-01-15');
    });

    it('scenario 16: paid → claimed without claimedDate uses today', () => {
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });

      expect(updated.claimedDate).toBe(today);
    });

    it('scenario 17: paid → pending clears both dates', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-01-10' },
        userId,
      );
      expect(deposit.paidDate).toBe('2026-01-10');

      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'pending' });

      expect(updated.paidDate).toBeNull();
      expect(updated.claimedDate).toBeNull();
    });

    it('scenario 18: claimed → paid clears claimedDate and preserves paidDate', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-01-10' },
        userId,
      );
      const claimed = updateDeposit(db, invoiceId, deposit.id, {
        status: 'claimed',
        claimedDate: '2026-01-15',
      });
      expect(claimed.paidDate).toBe('2026-01-10');
      expect(claimed.claimedDate).toBe('2026-01-15');

      const reverted = updateDeposit(db, invoiceId, deposit.id, { status: 'paid' });

      expect(reverted.claimedDate).toBeNull();
      expect(reverted.paidDate).toBe('2026-01-10');
    });
  });

  // ─── Date editing without status change ─────────────────────────────────────

  describe('Date editing without status change', () => {
    it('scenario 19: update paidDate when status is paid succeeds', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );

      const updated = updateDeposit(db, invoiceId, deposit.id, { paidDate: '2026-01-20' });

      expect(updated.paidDate).toBe('2026-01-20');
      expect(updated.status).toBe('paid');
    });

    it('scenario 20: update paidDate when status is claimed succeeds (paid already happened)', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-01-10' },
        userId,
      );
      const claimed = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });
      expect(claimed.status).toBe('claimed');

      const updated = updateDeposit(db, invoiceId, deposit.id, { paidDate: '2026-01-12' });

      expect(updated.paidDate).toBe('2026-01-12');
      expect(updated.status).toBe('claimed');
    });

    it('scenario 21: update paidDate when status is pending throws InvalidDepositDateForStatusError', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      expect(deposit.status).toBe('pending');

      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { paidDate: '2026-01-20' });
      }).toThrow(InvalidDepositDateForStatusError);
    });

    it('scenario 22: update claimedDate when status is claimed succeeds', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      const claimed = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });
      expect(claimed.status).toBe('claimed');

      const updated = updateDeposit(db, invoiceId, deposit.id, { claimedDate: '2026-02-01' });

      expect(updated.claimedDate).toBe('2026-02-01');
      expect(updated.status).toBe('claimed');
    });

    it('scenario 23: update claimedDate when status is paid throws InvalidDepositDateForStatusError', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );

      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { claimedDate: '2026-02-01' });
      }).toThrow(InvalidDepositDateForStatusError);
    });
  });

  // ─── Creation with non-pending initial status ────────────────────────────────

  describe('Creation with non-pending initial status', () => {
    it('scenario 24: create with status = paid succeeds; paidDate auto-set', () => {
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );

      expect(deposit.status).toBe('paid');
      expect(deposit.paidDate).toBe(today);
    });

    it('scenario 25: create with status = claimed throws InvalidDepositStatusTransitionError (pending → claimed disallowed)', () => {
      const { userId, invoiceId } = setup();

      expect(() => {
        createDeposit(
          db,
          invoiceId,
          { amount: 300, dueDate: '2026-02-01', status: 'claimed' },
          userId,
        );
      }).toThrow(InvalidDepositStatusTransitionError);

      try {
        createDeposit(
          db,
          invoiceId,
          { amount: 300, dueDate: '2026-02-01', status: 'claimed' },
          userId,
        );
      } catch (e) {
        const err = e as InvalidDepositStatusTransitionError;
        expect(err.details).toMatchObject({
          from: 'pending',
          to: 'claimed',
          allowedTargets: ['paid'],
        });
      }
    });
  });

  // ─── Ordering of listDepositsForInvoice ─────────────────────────────────────

  describe('listDepositsForInvoice ordering', () => {
    it('scenario 26a: deposits returned ordered by dueDate ASC regardless of creation order', () => {
      const { userId, invoiceId } = setup();

      // Created in order A -> B -> C, but dueDates are out of order: Mar, Jan, Feb
      // Expected return order: B (Jan) -> C (Feb) -> A (Mar) — sorted by dueDate ASC
      const dA = createDeposit(
        db,
        invoiceId,
        { amount: 100, dueDate: '2026-03-15' }, // created first, due last
        userId,
      );
      const dB = createDeposit(
        db,
        invoiceId,
        { amount: 200, dueDate: '2026-01-15' }, // created second, due first
        userId,
      );
      const dC = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-15' }, // created third, due second
        userId,
      );

      const deposits = listDepositsForInvoice(db, invoiceId);

      expect(deposits).toHaveLength(3);
      // Order must be dueDate ASC: Jan (B) -> Feb (C) -> Mar (A)
      expect(deposits[0]!.id).toBe(dB.id);
      expect(deposits[1]!.id).toBe(dC.id);
      expect(deposits[2]!.id).toBe(dA.id);
    });

    it('scenario 26b: deposits with same dueDate are ordered by createdAt ASC (tie-breaker)', () => {
      const { userId } = setup();
      // Use a fresh invoice so only these deposits are present.
      // Create a new vendor + invoice directly (avoids a second setup() which would collide on the
      // users.email UNIQUE constraint since setup() always inserts user@example.com).
      const tieVendorId = createTestVendor('Tie Vendor');
      const tieInvoiceId = createTestInvoice(tieVendorId, 2000);

      // Both deposits share the same dueDate; creation order determines final order
      const dFirst = createDeposit(
        db,
        tieInvoiceId,
        { amount: 150, dueDate: '2026-05-01' }, // created first
        userId,
      );
      const dSecond = createDeposit(
        db,
        tieInvoiceId,
        { amount: 250, dueDate: '2026-05-01' }, // created second
        userId,
      );

      const deposits = listDepositsForInvoice(db, tieInvoiceId);

      expect(deposits).toHaveLength(2);
      // Same dueDate — earlier createdAt must come first
      expect(deposits[0]!.id).toBe(dFirst.id);
      expect(deposits[1]!.id).toBe(dSecond.id);
    });
  });

  // ─── Cascade delete ─────────────────────────────────────────────────────────

  describe('Cascade delete', () => {
    it('scenario 27: deleting parent invoice cascades to deposits', () => {
      const { userId, vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 2000);

      createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      createDeposit(db, invoiceId, { amount: 400, dueDate: '2026-02-02' }, userId);

      const depositsBefore = db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.invoiceId, invoiceId))
        .all();
      expect(depositsBefore).toHaveLength(2);

      // Delete invoice directly (cascade)
      db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId)).run();

      const depositsAfter = db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.invoiceId, invoiceId))
        .all();
      expect(depositsAfter).toHaveLength(0);
    });
  });

  // ─── getInvoiceById embeds deposits ─────────────────────────────────────────

  describe('getInvoiceById embeds deposits', () => {
    it('scenario 28: invoice with 2 deposits embeds them and computes finalPaymentAmount as total minus ALL deposits', () => {
      const { userId, vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 1000);

      // d1 = paid (200), d2 = claimed (300); both reduce finalPaymentAmount
      const d1 = createDeposit(
        db,
        invoiceId,
        { amount: 200, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      const d2 = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-03-01' }, userId);

      // Advance d2 through pending -> paid -> claimed
      updateDeposit(db, invoiceId, d2.id, { status: 'paid' });
      updateDeposit(db, invoiceId, d2.id, { status: 'claimed' });

      const invoice = invoiceService.getInvoiceById(db, invoiceId);

      expect(invoice.deposits).toHaveLength(2);
      expect(invoice.deposits.some((d) => d.id === d1.id)).toBe(true);
      expect(invoice.deposits.some((d) => d.id === d2.id)).toBe(true);
      // finalPaymentAmount = 1000 - 200 (paid) - 300 (claimed) = 500
      // All deposits (regardless of status) are subtracted from the invoice amount
      expect(invoice.finalPaymentAmount).toBe(500);
    });

    it('scenario 29: invoice with no deposits has empty deposits array and finalPaymentAmount = amount', () => {
      const { vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 500);

      const invoice = invoiceService.getInvoiceById(db, invoiceId);

      expect(invoice.deposits).toHaveLength(0);
      expect(invoice.finalPaymentAmount).toBe(500);
    });
  });

  // ─── listAllInvoices does NOT embed deposits ─────────────────────────────────

  describe('listAllInvoices does not embed deposits', () => {
    it('scenario 30: invoice in list response has empty deposits and finalPaymentAmount = invoice amount', () => {
      const { userId, vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 800);

      createDeposit(db, invoiceId, { amount: 200, dueDate: '2026-02-01', status: 'paid' }, userId);
      createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-02' }, userId);

      const result = invoiceService.listAllInvoices(db, {});

      const listed = result.invoices.find((inv) => inv.id === invoiceId);
      expect(listed).toBeDefined();
      expect(listed!.deposits).toHaveLength(0);
      expect(listed!.finalPaymentAmount).toBe(800); // = invoice.amount, not computed
    });
  });

  // ─── Quotation parent status ─────────────────────────────────────────────────

  describe('Quotation parent invoice', () => {
    it('scenario 31: create deposit on quotation invoice succeeds (no gate on parent status)', () => {
      const { userId, vendorId } = setup();
      const invoiceId = `invoice-${Date.now()}-quotation`;
      const ts = new Date(Date.now() + tsOffset++).toISOString();
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          invoiceNumber: 'QUOT-001',
          amount: 1000,
          date: '2026-01-15',
          dueDate: null,
          status: 'quotation',
          notes: null,
          createdBy: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      expect(deposit.amount).toBe(300);
    });
  });

  // ─── Diary auto-events ───────────────────────────────────────────────────────

  describe('Diary auto-events', () => {
    type DiaryRow = typeof schema.diaryEntries.$inferSelect;

    function getAllDiaryEntries(): DiaryRow[] {
      return db.select().from(schema.diaryEntries).all();
    }

    it('scenario 32: update to paid with diaryAutoEvents=true creates a diary entry', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      updateDeposit(db, invoiceId, deposit.id, { status: 'paid' }, true);

      const entries = getAllDiaryEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);

      const entry = entries.find((e: DiaryRow) => e.sourceEntityId === deposit.id);
      expect(entry).toBeDefined();
      expect(entry!.entryType).toBe('invoice_status');
      expect(entry!.sourceEntityType).toBe('invoice_deposit');
      expect(entry!.sourceEntityId).toBe(deposit.id);
    });

    it('scenario 33: update to paid with diaryAutoEvents=false creates no diary entry', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      updateDeposit(db, invoiceId, deposit.id, { status: 'paid' }, false);

      const entries = getAllDiaryEntries();
      const depositEntries = entries.filter((e: DiaryRow) => e.sourceEntityId === deposit.id);
      expect(depositEntries).toHaveLength(0);
    });

    it('scenario 34: update to claimed creates diary entry', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
        false, // don't create paid diary entry — isolate claimed test
      );
      updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' }, true);

      const entries = getAllDiaryEntries();
      const depositEntries = entries.filter((e: DiaryRow) => e.sourceEntityId === deposit.id);
      expect(depositEntries).toHaveLength(1);
      expect(depositEntries[0]!.sourceEntityType).toBe('invoice_deposit');
    });

    it('scenario 35: update to pending (from paid) does not create diary entry', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
        false, // suppress diary entry for paid creation
      );
      updateDeposit(db, invoiceId, deposit.id, { status: 'pending' }, true);

      const entries = getAllDiaryEntries();
      const depositEntries = entries.filter((e: DiaryRow) => e.sourceEntityId === deposit.id);
      // pending is not a triggering status — no new entry
      expect(depositEntries).toHaveLength(0);
    });
  });

  // ─── Not found (404 / NotFoundError) ────────────────────────────────────────

  describe('Not found errors', () => {
    it('scenario 36: createDeposit with non-existent invoiceId throws NotFoundError', () => {
      const userId = createTestUser('user2@example.com');

      expect(() => {
        createDeposit(db, 'nonexistent-invoice-id', { amount: 100, dueDate: '2026-02-01' }, userId);
      }).toThrow(NotFoundError);
    });

    it('scenario 37: updateDeposit with non-existent depositId throws NotFoundError', () => {
      const { invoiceId } = setup();

      expect(() => {
        updateDeposit(db, invoiceId, 'nonexistent-deposit-id', { amount: 100 });
      }).toThrow(NotFoundError);
    });

    it('scenario 38: updateDeposit with depositId from a different invoice throws NotFoundError', () => {
      const { userId, vendorId, invoiceId } = setup();
      const invoice2Id = createTestInvoice(vendorId, 500);

      const deposit = createDeposit(db, invoiceId, { amount: 200, dueDate: '2026-02-01' }, userId);

      expect(() => {
        updateDeposit(db, invoice2Id, deposit.id, { amount: 100 });
      }).toThrow(NotFoundError);
    });

    it('scenario 39: deleteDeposit with non-existent depositId throws NotFoundError', () => {
      const { invoiceId } = setup();

      expect(() => {
        deleteDeposit(db, invoiceId, 'nonexistent-deposit-id');
      }).toThrow(NotFoundError);
    });
  });

  // ─── Additional coverage: deleteDeposit success path ────────────────────────

  describe('deleteDeposit success path', () => {
    it('deletes an existing deposit', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 200, dueDate: '2026-02-01' }, userId);

      expect(() => {
        deleteDeposit(db, invoiceId, deposit.id);
      }).not.toThrow();

      const remaining = db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.id, deposit.id))
        .all();
      expect(remaining).toHaveLength(0);
    });
  });

  // ─── Additional coverage: listDepositsForInvoice errors ────────────────────

  describe('listDepositsForInvoice', () => {
    it('throws NotFoundError for non-existent invoice', () => {
      expect(() => {
        listDepositsForInvoice(db, 'nonexistent-invoice-id');
      }).toThrow(NotFoundError);
    });

    it('returns empty array for invoice with no deposits', () => {
      const { invoiceId } = setup();

      const result = listDepositsForInvoice(db, invoiceId);
      expect(result).toHaveLength(0);
    });
  });

  // ─── Diary auto-event on createDeposit with paid status ─────────────────────

  describe('createDeposit diary event', () => {
    type DiaryRow = typeof schema.diaryEntries.$inferSelect;

    it('creates diary entry when creating deposit with status=paid and diaryAutoEvents=true', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'paid' },
        userId,
        true,
      );

      const entries: DiaryRow[] = db.select().from(schema.diaryEntries).all();
      const depositEntries = entries.filter((e: DiaryRow) => e.sourceEntityId === deposit.id);
      expect(depositEntries).toHaveLength(1);
      expect(depositEntries[0]!.sourceEntityType).toBe('invoice_deposit');
    });

    it('does not create diary entry when creating pending deposit (no status change)', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01' },
        userId,
        true,
      );

      const entries: DiaryRow[] = db.select().from(schema.diaryEntries).all();
      const depositEntries = entries.filter((e: DiaryRow) => e.sourceEntityId === deposit.id);
      expect(depositEntries).toHaveLength(0);
    });
  });
});
