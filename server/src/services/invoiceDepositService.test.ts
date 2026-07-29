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
  RefundExceedsInvoiceError,
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

  /**
   * Like setup(), but allows a custom invoice amount (Story #1876 refund scenarios
   * use round-number invoice totals like €10,000 to match the AC's numeric examples).
   */
  function setup2(invoiceAmount: number) {
    const userId = createTestUser('user@example.com');
    const vendorId = createTestVendor();
    const invoiceId = createTestInvoice(vendorId, invoiceAmount, 'INV-001');
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

    it('scenario 8: create deposit that sums to exactly the invoice total despite floating-point summation noise (issue #1806)', () => {
      // 332.85 + 333.04 + 334.11 === 1000.0000000000001 in raw IEEE-754 arithmetic —
      // a bare `sum > total` guard would wrongly reject this exact, valid sum.
      const { userId, invoiceId } = setup();

      createDeposit(db, invoiceId, { amount: 332.85, dueDate: '2026-02-01' }, userId);
      createDeposit(db, invoiceId, { amount: 333.04, dueDate: '2026-02-02' }, userId);
      const deposit3 = createDeposit(
        db,
        invoiceId,
        { amount: 334.11, dueDate: '2026-02-03' },
        userId,
      );

      expect(deposit3.amount).toBe(334.11);
    });

    it('scenario 9: still rejects a create that genuinely exceeds the invoice total by one cent, reporting correct availableHeadroom', () => {
      const { userId, invoiceId } = setup();

      createDeposit(db, invoiceId, { amount: 332.85, dueDate: '2026-02-01' }, userId);
      createDeposit(db, invoiceId, { amount: 333.04, dueDate: '2026-02-02' }, userId);

      expect(() => {
        createDeposit(db, invoiceId, { amount: 334.12, dueDate: '2026-02-03' }, userId); // mathematically 1000.01
      }).toThrow(DepositsExceedInvoiceTotalError);

      try {
        createDeposit(db, invoiceId, { amount: 334.12, dueDate: '2026-02-03' }, userId);
      } catch (e) {
        const err = e as DepositsExceedInvoiceTotalError;
        expect(err.details).toMatchObject({
          invoiceTotal: 1000,
          requestedAmount: 334.12,
        });
        // availableHeadroom must reflect the non-float-noise remaining headroom
        // (1000 - (332.85 + 333.04)), not a value polluted by summation noise.
        expect(err.details?.availableHeadroom as number).toBeCloseTo(334.11);
      }
    });

    it('scenario 10: update that sums to exactly the invoice total despite floating-point summation noise (issue #1806)', () => {
      const { userId, invoiceId } = setup();

      createDeposit(db, invoiceId, { amount: 332.85, dueDate: '2026-02-01' }, userId);
      createDeposit(db, invoiceId, { amount: 333.04, dueDate: '2026-02-02' }, userId);
      const deposit3 = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-03' }, userId);

      const updated = updateDeposit(db, invoiceId, deposit3.id, { amount: 334.11 });

      expect(updated.amount).toBe(334.11);
    });

    it('scenario 11: still rejects an update that genuinely exceeds the invoice total by one cent, reporting correct availableHeadroom', () => {
      const { userId, invoiceId } = setup();

      createDeposit(db, invoiceId, { amount: 332.85, dueDate: '2026-02-01' }, userId);
      createDeposit(db, invoiceId, { amount: 333.04, dueDate: '2026-02-02' }, userId);
      const deposit3 = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-03' }, userId);

      expect(() => {
        updateDeposit(db, invoiceId, deposit3.id, { amount: 334.12 }); // mathematically 1000.01
      }).toThrow(DepositsExceedInvoiceTotalError);

      try {
        updateDeposit(db, invoiceId, deposit3.id, { amount: 334.12 });
      } catch (e) {
        const err = e as DepositsExceedInvoiceTotalError;
        // availableHeadroom must reflect the non-float-noise remaining headroom
        // (1000 - (332.85 + 333.04)), not a value polluted by summation noise.
        expect(err.details?.availableHeadroom as number).toBeCloseTo(334.11);
      }
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
    // Story #1878 widened ALLOWED_TRANSITIONS.pending to ['paid', 'claimed'] (deposits can
    // now be claimed directly via the source-report mark-claimed flow, or via a direct PATCH).
    // Scenario 12 (originally "pending → claimed throws") is therefore superseded — see the
    // "State machine — pending → claimed (Story #1878)" describe block below for the new,
    // now-valid behavior.

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

  // ─── State machine — pending → claimed (Story #1878) ─────────────────────────

  describe('State machine — pending → claimed (Story #1878)', () => {
    it('scenario 42: PATCH pending → claimed now succeeds (no longer throws)', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);
      expect(deposit.status).toBe('pending');

      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });

      expect(updated.status).toBe('claimed');
    });

    it('scenario 42b: PATCH pending → claimed auto-sets claimedDate to today, consistent with the paid → claimed and create-with-status=claimed paths', () => {
      // AC-14's date side-effect table auto-sets claimedDate on every arrival at 'claimed'
      // (see the paid → claimed branch in updateDeposit, and createDeposit's target-status
      // handling for 'claimed'). This asserts the newly-reachable pending → claimed
      // transition follows the same rule.
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');
      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      const updated = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });

      expect(updated.claimedDate).toBe(today);
    });

    it('scenario 43 (regression): pending → paid, paid → claimed, paid → pending, claimed → paid all remain valid', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      const paid = updateDeposit(db, invoiceId, deposit.id, { status: 'paid' });
      expect(paid.status).toBe('paid');

      const claimed = updateDeposit(db, invoiceId, deposit.id, { status: 'claimed' });
      expect(claimed.status).toBe('claimed');

      const backToPaid = updateDeposit(db, invoiceId, deposit.id, { status: 'paid' });
      expect(backToPaid.status).toBe('paid');

      const backToPending = updateDeposit(db, invoiceId, deposit.id, { status: 'pending' });
      expect(backToPending.status).toBe('pending');
    });

    it('scenario 43b (regression): claimed → pending remains disallowed', () => {
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

    it('scenario 25 (Story #1878): create with status = claimed now succeeds; both paidDate and claimedDate auto-set', () => {
      // ALLOWED_TRANSITIONS.pending now includes 'claimed' — createDeposit's initial-status
      // check (`allowedFromPending.includes(targetStatus)`) allows this directly.
      const { userId, invoiceId } = setup();
      const today = new Date().toLocaleDateString('en-CA');

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 300, dueDate: '2026-02-01', status: 'claimed' },
        userId,
      );

      expect(deposit.status).toBe('claimed');
      expect(deposit.paidDate).toBe(today);
      expect(deposit.claimedDate).toBe(today);
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
    it('scenario 30: invoice in list response has empty deposits array (regardless of finalPaymentAmount)', () => {
      const { userId, vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 800);

      createDeposit(db, invoiceId, { amount: 200, dueDate: '2026-02-01', status: 'paid' }, userId);
      createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-02' }, userId);

      const result = invoiceService.listAllInvoices(db, {});

      const listed = result.invoices.find((inv) => inv.id === invoiceId);
      expect(listed).toBeDefined();
      expect(listed!.deposits).toHaveLength(0);
    });

    // Story #1876: finalPaymentAmount on list endpoints was previously hardcoded to
    // row.amount. It is now computed via the same refund-aware formula as the detail
    // endpoint (computeFinalPaymentAmounts): 800 - 200 (paid deposit) - 300 (pending
    // deposit) = 300. This intentionally supersedes the pre-#1876 scenario 30 assertion
    // that finalPaymentAmount === invoice.amount on list rows.
    it('scenario 30b: finalPaymentAmount on list endpoint is computed (deposit-aware), matching detail endpoint formula', () => {
      const { userId, vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 800);

      createDeposit(db, invoiceId, { amount: 200, dueDate: '2026-02-01', status: 'paid' }, userId);
      createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-02' }, userId);

      const result = invoiceService.listAllInvoices(db, {});
      const listed = result.invoices.find((inv) => inv.id === invoiceId);
      expect(listed!.finalPaymentAmount).toBe(300); // 800 - 200 - 300

      const detail = invoiceService.getInvoiceById(db, invoiceId);
      expect(detail!.finalPaymentAmount).toBe(300); // matches detail endpoint
    });
  });

  // ─── Story #1876: entryType create/default/immutability/refund invariants ───

  describe('entryType (Story #1876)', () => {
    it('Scenario 1/toInvoiceDeposit: creates a refund entry and maps entryType on the returned InvoiceDeposit', () => {
      const { userId, vendorId } = setup();
      const invoiceId = createTestInvoice(vendorId, 10000);

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 1500, dueDate: '2026-02-01', status: 'paid', entryType: 'refund' },
        userId,
      );

      expect(deposit.entryType).toBe('refund');
      expect(deposit.amount).toBe(1500);
      expect(deposit.status).toBe('paid');
    });

    it('Scenario 2: entryType defaults to "deposit" when omitted', () => {
      const { userId, invoiceId } = setup();

      const deposit = createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      expect(deposit.entryType).toBe('deposit');
    });

    it('listDepositsForInvoice returns entryType for each deposit', () => {
      const { userId, invoiceId } = setup();
      createDeposit(
        db,
        invoiceId,
        { amount: 100, dueDate: '2026-02-01', entryType: 'refund' },
        userId,
      );
      createDeposit(
        db,
        invoiceId,
        { amount: 200, dueDate: '2026-02-02', entryType: 'deposit' },
        userId,
      );

      const result = listDepositsForInvoice(db, invoiceId);
      expect(result).toHaveLength(2);
      expect(result.map((d) => d.entryType).sort()).toEqual(['deposit', 'refund']);
    });

    it('Scenario 3: refund sum invariant — refunds €9,000 + new €2,000 on €10,000 invoice throws RefundExceedsInvoiceError with availableHeadroom: 1000', () => {
      const { userId, invoiceId } = setup2(10000);
      createDeposit(
        db,
        invoiceId,
        { amount: 9000, dueDate: '2026-02-01', entryType: 'refund' },
        userId,
      );

      let error: unknown;
      try {
        createDeposit(
          db,
          invoiceId,
          { amount: 2000, dueDate: '2026-02-02', entryType: 'refund' },
          userId,
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(RefundExceedsInvoiceError);
      const details = (error as RefundExceedsInvoiceError).details as {
        invoiceTotal: number;
        currentRefundSum: number;
        requestedAmount: number;
        availableHeadroom: number;
      };
      expect(details.invoiceTotal).toBe(10000);
      expect(details.currentRefundSum).toBe(9000);
      expect(details.requestedAmount).toBe(2000);
      expect(details.availableHeadroom).toBe(1000);

      // No row created
      const remaining = listDepositsForInvoice(db, invoiceId);
      expect(remaining).toHaveLength(1);
    });

    it('Scenario 3 (equal to total, no headroom left): refund exactly equal to invoice total succeeds; one more refund of any positive amount fails', () => {
      const { userId, invoiceId } = setup2(1000);
      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 1000, dueDate: '2026-02-01', entryType: 'refund' },
        userId,
      );
      expect(deposit.amount).toBe(1000);

      let error: unknown;
      try {
        createDeposit(
          db,
          invoiceId,
          { amount: 1, dueDate: '2026-02-02', entryType: 'refund' },
          userId,
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(RefundExceedsInvoiceError);
    });

    it('Scenario 4: deposit and refund sum invariants are independent — €9,000 deposits AND €9,000 refunds both succeed on a €10,000 invoice', () => {
      const { userId, invoiceId } = setup2(10000);

      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 9000, dueDate: '2026-02-01', entryType: 'deposit' },
        userId,
      );
      const refund = createDeposit(
        db,
        invoiceId,
        { amount: 9000, dueDate: '2026-02-02', entryType: 'refund' },
        userId,
      );

      expect(deposit.amount).toBe(9000);
      expect(refund.amount).toBe(9000);

      // Exceeding either cap now fails with its own distinct error code, and the
      // other type's headroom is unaffected.
      let depositError: unknown;
      try {
        createDeposit(
          db,
          invoiceId,
          { amount: 1001, dueDate: '2026-02-03', entryType: 'deposit' },
          userId,
        );
      } catch (err) {
        depositError = err;
      }
      expect(depositError).toBeInstanceOf(DepositsExceedInvoiceTotalError);

      let refundError: unknown;
      try {
        createDeposit(
          db,
          invoiceId,
          { amount: 1001, dueDate: '2026-02-04', entryType: 'refund' },
          userId,
        );
      } catch (err) {
        refundError = err;
      }
      expect(refundError).toBeInstanceOf(RefundExceedsInvoiceError);
    });

    it('updateDeposit: amount update on a refund entry is scoped to other refund entries only (not deposits)', () => {
      const { userId, invoiceId } = setup2(1000);
      createDeposit(
        db,
        invoiceId,
        { amount: 900, dueDate: '2026-02-01', entryType: 'deposit' },
        userId,
      );
      const refund = createDeposit(
        db,
        invoiceId,
        { amount: 200, dueDate: '2026-02-02', entryType: 'refund' },
        userId,
      );

      // Refund headroom is 1000 - 200 = 800 (unaffected by the €900 deposit sum,
      // which would already exceed 1000 if it were combined with the refund sum).
      const updated = updateDeposit(db, invoiceId, refund.id, { amount: 800 });
      expect(updated.amount).toBe(800);
    });

    it('updateDeposit: exceeding the refund cap on update throws RefundExceedsInvoiceError', () => {
      const { userId, invoiceId } = setup2(1000);
      const refund1 = createDeposit(
        db,
        invoiceId,
        { amount: 400, dueDate: '2026-02-01', entryType: 'refund' },
        userId,
      );
      createDeposit(
        db,
        invoiceId,
        { amount: 400, dueDate: '2026-02-02', entryType: 'refund' },
        userId,
      );

      let error: unknown;
      try {
        updateDeposit(db, invoiceId, refund1.id, { amount: 700 }); // 700 + 400 = 1100 > 1000
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(RefundExceedsInvoiceError);
    });
  });

  // ─── Story #1876: finalPaymentAmount refund-awareness (toInvoice) ───────────

  describe('finalPaymentAmount refund-awareness (Story #1876)', () => {
    it('Scenario 6: a paid refund of €1,500 on a €10,000 invoice reduces finalPaymentAmount to €8,500', () => {
      const { userId, invoiceId } = setup2(10000);
      createDeposit(
        db,
        invoiceId,
        { amount: 1500, dueDate: '2026-02-01', status: 'paid', entryType: 'refund' },
        userId,
      );

      const invoice = invoiceService.getInvoiceById(db, invoiceId);
      expect(invoice!.finalPaymentAmount).toBe(8500);
    });

    it('Scenario 7: a pending refund does not reduce finalPaymentAmount', () => {
      const { userId, invoiceId } = setup2(10000);
      createDeposit(
        db,
        invoiceId,
        { amount: 1500, dueDate: '2026-02-01', entryType: 'refund' }, // pending
        userId,
      );

      const invoice = invoiceService.getInvoiceById(db, invoiceId);
      expect(invoice!.finalPaymentAmount).toBe(10000);
    });

    it('Scenario 8: combined paid deposit €2,000 and claimed refund €1,000 on a €10,000 invoice → finalPaymentAmount = 7000', () => {
      const { userId, invoiceId } = setup2(10000);
      createDeposit(
        db,
        invoiceId,
        { amount: 2000, dueDate: '2026-02-01', status: 'paid', entryType: 'deposit' },
        userId,
      );
      const refund = createDeposit(
        db,
        invoiceId,
        {
          amount: 1000,
          dueDate: '2026-02-02',
          status: 'paid',
          entryType: 'refund',
        },
        userId,
      );
      updateDeposit(db, invoiceId, refund.id, { status: 'claimed', claimedDate: '2026-02-10' });

      const invoice = invoiceService.getInvoiceById(db, invoiceId);
      expect(invoice!.finalPaymentAmount).toBe(7000);
    });

    it('regression: zero refunds produces byte-identical finalPaymentAmount to the pre-#1876 formula', () => {
      const { userId, invoiceId } = setup2(1000);
      createDeposit(db, invoiceId, { amount: 300, dueDate: '2026-02-01' }, userId);

      const invoice = invoiceService.getInvoiceById(db, invoiceId);
      expect(invoice!.finalPaymentAmount).toBe(700); // 1000 - 300, unchanged formula
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

  // ─── Additional coverage: pre-existing validation branches ──────────────────
  //
  // These validation paths pre-date Story #1876 but were not covered by any
  // existing test in this file. Closing the gap here since this file is already
  // being extended for #1876 and CI enforces 95%+ coverage on touched files.

  describe('createDeposit validation branches', () => {
    it('throws ValidationError when amount <= 0', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(db, invoiceId, { amount: 0, dueDate: '2026-02-01' }, userId);
      }).toThrow('Amount must be greater than 0');
    });

    it('throws ValidationError for a negative amount', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(db, invoiceId, { amount: -50, dueDate: '2026-02-01' }, userId);
      }).toThrow('Amount must be greater than 0');
    });

    it('throws ValidationError for an invalid dueDate', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(db, invoiceId, { amount: 100, dueDate: 'not-a-date' }, userId);
      }).toThrow('dueDate must be a valid ISO date (YYYY-MM-DD)');
    });

    it('throws ValidationError when description exceeds 500 characters', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(
          db,
          invoiceId,
          { amount: 100, dueDate: '2026-02-01', description: 'x'.repeat(501) },
          userId,
        );
      }).toThrow('Description must be 500 characters or less');
    });

    it('throws InvalidDepositDateForStatusError when paidDate is set on a pending deposit', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(
          db,
          invoiceId,
          { amount: 100, dueDate: '2026-02-01', paidDate: '2026-02-05' },
          userId,
        );
      }).toThrow(InvalidDepositDateForStatusError);
    });

    it('throws ValidationError when paidDate is an invalid ISO date on a paid deposit', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(
          db,
          invoiceId,
          { amount: 100, dueDate: '2026-02-01', status: 'paid', paidDate: 'not-a-date' },
          userId,
        );
      }).toThrow('paidDate must be a valid ISO date (YYYY-MM-DD)');
    });

    it('throws InvalidDepositDateForStatusError when claimedDate is set on a paid (non-claimed) deposit', () => {
      const { userId, invoiceId } = setup();
      expect(() => {
        createDeposit(
          db,
          invoiceId,
          {
            amount: 100,
            dueDate: '2026-02-01',
            status: 'paid',
            claimedDate: '2026-02-05',
          },
          userId,
        );
      }).toThrow(InvalidDepositDateForStatusError);
    });

    // NOTE: createDeposit's `data.claimedDate` invalid-ISO-format check
    // (the `targetStatus === 'claimed'` branch) is unreachable via the public
    // API: creation validates the initial status transition from 'pending'
    // BEFORE validating claimedDate, and ALLOWED_TRANSITIONS['pending'] only
    // permits 'paid' as a creation-time target — 'claimed' is always rejected
    // by InvalidDepositStatusTransitionError first. Pre-existing dead branch
    // from Story #1403, out of scope for #1876 to change.
  });

  describe('updateDeposit validation branches', () => {
    it('throws ValidationError when amount <= 0', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-01' }, userId);
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { amount: 0 });
      }).toThrow('Amount must be greater than 0');
    });

    it('throws ValidationError for an invalid dueDate', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-01' }, userId);
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { dueDate: 'not-a-date' });
      }).toThrow('dueDate must be a valid ISO date (YYYY-MM-DD)');
    });

    it('throws ValidationError when description exceeds 500 characters', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-01' }, userId);
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { description: 'x'.repeat(501) });
      }).toThrow('Description must be 500 characters or less');
    });

    it('successfully updates dueDate to a valid ISO date', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-01' }, userId);
      const updated = updateDeposit(db, invoiceId, deposit.id, { dueDate: '2026-03-15' });
      expect(updated.dueDate).toBe('2026-03-15');
    });

    it('successfully updates description', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-01' }, userId);
      const updated = updateDeposit(db, invoiceId, deposit.id, { description: 'Updated note' });
      expect(updated.description).toBe('Updated note');
    });

    it('throws InvalidDepositDateForStatusError when paidDate is set without a status change on a pending deposit', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(db, invoiceId, { amount: 100, dueDate: '2026-02-01' }, userId);
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { paidDate: '2026-02-05' });
      }).toThrow(InvalidDepositDateForStatusError);
    });

    it('throws ValidationError when paidDate override is an invalid ISO date on a paid deposit', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 100, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { paidDate: 'not-a-date' });
      }).toThrow('paidDate must be a valid ISO date (YYYY-MM-DD)');
    });

    it('throws InvalidDepositDateForStatusError when claimedDate is set without a status change on a paid deposit', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 100, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { claimedDate: '2026-02-05' });
      }).toThrow(InvalidDepositDateForStatusError);
    });

    it('throws ValidationError when claimedDate override is an invalid ISO date on a claimed deposit', () => {
      const { userId, invoiceId } = setup();
      const deposit = createDeposit(
        db,
        invoiceId,
        { amount: 100, dueDate: '2026-02-01', status: 'paid' },
        userId,
      );
      updateDeposit(db, invoiceId, deposit.id, { status: 'claimed', claimedDate: '2026-02-05' });
      expect(() => {
        updateDeposit(db, invoiceId, deposit.id, { claimedDate: 'not-a-date' });
      }).toThrow('claimedDate must be a valid ISO date (YYYY-MM-DD)');
    });
  });
});
