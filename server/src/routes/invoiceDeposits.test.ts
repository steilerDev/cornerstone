/**
 * HTTP integration tests for invoiceDeposits.ts route handlers.
 *
 * Story #1403 — Invoice Deposits Foundation (backend-only)
 * Covers scenarios 40–56 from the test plan using both URL prefixes.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('Invoice Deposit Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  let tsOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-deposit-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    tsOffset = 0;
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${sessionToken}` };
  }

  function createTestVendor(name = 'Test Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.vendors)
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

  function createTestInvoice(
    vendorId: string,
    amount = 1000,
    status: 'pending' | 'paid' | 'claimed' | 'quotation' = 'pending',
  ): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: 'INV-TEST-001',
        amount,
        date: '2026-01-15',
        dueDate: null,
        status,
        notes: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestDeposit(
    invoiceId: string,
    userId: string,
    amount = 300,
    status: 'pending' | 'paid' | 'claimed' = 'pending',
    entryType: 'deposit' | 'refund' = 'deposit',
  ): string {
    const id = `deposit-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.invoiceDeposits)
      .values({
        id,
        invoiceId,
        amount,
        dueDate: '2026-02-01',
        paidDate: status === 'paid' || status === 'claimed' ? '2026-01-20' : null,
        claimedDate: status === 'claimed' ? '2026-01-25' : null,
        description: null,
        status,
        entryType,
        createdBy: userId,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  // ─── POST /api/invoices/:invoiceId/deposits ──────────────────────────────────

  describe('POST /api/invoices/:invoiceId/deposits', () => {
    it('scenario 40: 201 with valid body creates deposit', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 300, dueDate: '2026-02-01', description: 'First deposit' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ deposit: { amount: number; status: string } }>();
      expect(body.deposit.amount).toBe(300);
      expect(body.deposit.status).toBe('pending');
    });

    it('scenario 41: 400 missing required amount', async () => {
      const { cookie } = await createUserWithSession('user2@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { dueDate: '2026-02-01' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('scenario 42: 400 missing required dueDate', async () => {
      const { cookie } = await createUserWithSession('user3@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 300 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('scenario 43: 401 unauthenticated', async () => {
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        payload: { amount: 300, dueDate: '2026-02-01' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('scenario 44: 404 nonexistent invoice', async () => {
      const { cookie } = await createUserWithSession('user4@test.com', 'Test User', 'password123');

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/nonexistent-invoice-id/deposits`,
        headers: { cookie },
        payload: { amount: 300, dueDate: '2026-02-01' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('scenario 45: 400 sum invariant violation; error.code === DEPOSITS_EXCEED_INVOICE_TOTAL', async () => {
      const { cookie } = await createUserWithSession('user5@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 500);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 600, dueDate: '2026-02-01' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('DEPOSITS_EXCEED_INVOICE_TOTAL');
    });

    it('scenario QQ: 201 creates deposit on quotation invoice', async () => {
      const { cookie } = await createUserWithSession('userQQ@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 2000, 'quotation');

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 100, dueDate: '2026-02-01', description: 'First deposit on quotation' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ deposit: { amount: number; status: string } }>();
      expect(body.deposit.amount).toBe(100);
      expect(body.deposit.status).toBe('pending');
    });
  });

  // ─── Story #1876: entryType / refund route coverage ─────────────────────────

  describe('POST /api/invoices/:invoiceId/deposits — entryType (Story #1876)', () => {
    it('Scenario 1: creates a refund entry (entryType: refund, amount: 1500, status: paid) on a €10,000 invoice', async () => {
      const { cookie } = await createUserWithSession(
        'refundUser1@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 10000);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 1500, dueDate: '2026-02-01', status: 'paid', entryType: 'refund' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ deposit: { amount: number; entryType: string } }>();
      expect(body.deposit.entryType).toBe('refund');
      expect(body.deposit.amount).toBe(1500);
    });

    it('Scenario 2: entryType defaults to "deposit" when omitted from the request body', async () => {
      const { cookie } = await createUserWithSession(
        'refundUser2@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 300, dueDate: '2026-02-01' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ deposit: { entryType: string } }>();
      expect(body.deposit.entryType).toBe('deposit');
    });

    it('Scenario 3: refund sum invariant — refunds €9,000 + new €2,000 on €10,000 invoice → 400 REFUND_EXCEEDS_INVOICE with availableHeadroom: 1000, no row created', async () => {
      const { userId, cookie } = await createUserWithSession(
        'refundUser3@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 10000);
      createTestDeposit(invoiceId, userId, 9000, 'pending', 'refund');

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 2000, dueDate: '2026-02-01', entryType: 'refund' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('REFUND_EXCEEDS_INVOICE');
      expect((body.error.details as { availableHeadroom?: number })?.availableHeadroom).toBe(1000);

      // No row created — GET still shows only the original refund.
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
      });
      const listBody = listResponse.json<{ deposits: unknown[] }>();
      expect(listBody.deposits).toHaveLength(1);
    });

    it('Scenario 4: deposit and refund sum invariants are independent — €9,000 deposits AND €9,000 refunds both succeed on a €10,000 invoice', async () => {
      const { userId, cookie } = await createUserWithSession(
        'refundUser4@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 10000);
      createTestDeposit(invoiceId, userId, 9000, 'pending', 'deposit');
      createTestDeposit(invoiceId, userId, 9000, 'pending', 'refund');

      // Each type still has its own €1,000 headroom — verify both independently.
      const depositResponse = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 1000, dueDate: '2026-02-01', entryType: 'deposit' },
      });
      expect(depositResponse.statusCode).toBe(201);

      const refundResponse = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 1000, dueDate: '2026-02-01', entryType: 'refund' },
      });
      expect(refundResponse.statusCode).toBe(201);

      // Exceeding either type's cap now fails with its own error code.
      const overDeposit = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 1, dueDate: '2026-02-01', entryType: 'deposit' },
      });
      expect(overDeposit.statusCode).toBe(400);
      expect(overDeposit.json<ApiErrorResponse>().error.code).toBe('DEPOSITS_EXCEED_INVOICE_TOTAL');

      const overRefund = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 1, dueDate: '2026-02-01', entryType: 'refund' },
      });
      expect(overRefund.statusCode).toBe(400);
      expect(overRefund.json<ApiErrorResponse>().error.code).toBe('REFUND_EXCEEDS_INVOICE');
    });
  });

  describe('finalPaymentAmount refund-awareness (Story #1876)', () => {
    it('Scenario 6: a received (paid) refund reduces finalPaymentAmount on both detail and list endpoints', async () => {
      const { userId, cookie } = await createUserWithSession(
        'refundUser6@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 10000);
      createTestDeposit(invoiceId, userId, 1500, 'paid', 'refund');

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });
      expect(
        detailResponse.json<{ invoice: { finalPaymentAmount: number } }>().invoice
          .finalPaymentAmount,
      ).toBe(8500);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/invoices`,
        headers: { cookie },
      });
      const listBody = listResponse.json<{
        invoices: Array<{ id: string; finalPaymentAmount: number }>;
      }>();
      const listed = listBody.invoices.find((inv) => inv.id === invoiceId);
      expect(listed?.finalPaymentAmount).toBe(8500);
    });

    it('Scenario 7: a pending refund does not yet reduce finalPaymentAmount', async () => {
      const { userId, cookie } = await createUserWithSession(
        'refundUser7@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 10000);
      createTestDeposit(invoiceId, userId, 1500, 'pending', 'refund');

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });
      expect(
        response.json<{ invoice: { finalPaymentAmount: number } }>().invoice.finalPaymentAmount,
      ).toBe(10000);
    });

    it('Scenario 8: combined deposit + claimed refund — €10,000 invoice, paid deposit €2,000, claimed refund €1,000 → finalPaymentAmount = 7000', async () => {
      const { userId, cookie } = await createUserWithSession(
        'refundUser8@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 10000);
      createTestDeposit(invoiceId, userId, 2000, 'paid', 'deposit');
      createTestDeposit(invoiceId, userId, 1000, 'claimed', 'refund');

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });
      expect(
        response.json<{ invoice: { finalPaymentAmount: number } }>().invoice.finalPaymentAmount,
      ).toBe(7000);
    });
  });

  // ─── PATCH /api/invoices/:invoiceId/deposits/:depositId ─────────────────────

  describe('PATCH /api/invoices/:invoiceId/deposits/:depositId', () => {
    it('scenario 46: 200 update status succeeds', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user6@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 300, 'pending');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
        payload: { status: 'paid' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ deposit: { status: string } }>();
      expect(body.deposit.status).toBe('paid');
    });

    it('scenario 47: 400 invalid transition; error.code === INVALID_DEPOSIT_STATUS_TRANSITION', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user7@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 300, 'pending');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
        payload: { status: 'claimed' }, // pending → claimed is disallowed
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('INVALID_DEPOSIT_STATUS_TRANSITION');
    });

    it('scenario 48: 404 deposit not found', async () => {
      const { cookie } = await createUserWithSession('user8@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/nonexistent-deposit-id`,
        headers: { cookie },
        payload: { status: 'paid' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('scenario 49: 401 unauthenticated', async () => {
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/some-deposit-id`,
        payload: { status: 'paid' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── DELETE /api/invoices/:invoiceId/deposits/:depositId ─────────────────────

  describe('DELETE /api/invoices/:invoiceId/deposits/:depositId', () => {
    it('scenario 50: 204 success (body is empty)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user9@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 300, 'pending');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('scenario 51: 404 deposit not found', async () => {
      const { cookie } = await createUserWithSession('user10@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/deposits/nonexistent-deposit-id`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('scenario 52: 401 unauthenticated', async () => {
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/deposits/some-deposit-id`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /api/invoices/:invoiceId (invoice detail embeds deposits) ────────────

  describe('GET /api/invoices/:invoiceId includes deposits', () => {
    it('scenario 53: GET /api/invoices/:id includes deposits array and finalPaymentAmount (all statuses subtracted)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user11@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      createTestDeposit(invoiceId, userId, 300, 'pending'); // pending — reduces final payment
      createTestDeposit(invoiceId, userId, 200, 'claimed'); // claimed — reduces final payment

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        invoice: { deposits: unknown[]; finalPaymentAmount: number };
      }>();
      expect(Array.isArray(body.invoice.deposits)).toBe(true);
      expect(body.invoice.deposits).toHaveLength(2);
      // finalPaymentAmount = 1000 - 300 (pending) - 200 (claimed) = 500
      // All deposits regardless of status are subtracted from the invoice amount
      expect(body.invoice.finalPaymentAmount).toBe(500);
    });
  });

  // ─── Vendor-scoped URL parity ────────────────────────────────────────────────

  describe('Vendor-scoped URL parity', () => {
    it('scenario 54: POST /api/vendors/:vendorId/invoices/:invoiceId/deposits — 201', async () => {
      const { cookie } = await createUserWithSession('user12@test.com', 'Test User', 'password123');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}/deposits`,
        headers: { cookie },
        payload: { amount: 250, dueDate: '2026-03-01' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ deposit: { amount: number } }>();
      expect(body.deposit.amount).toBe(250);
    });

    it('scenario 55: PATCH /api/vendors/:vendorId/invoices/:invoiceId/deposits/:depositId — 200', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user13@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 200, 'pending');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
        payload: { status: 'paid' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ deposit: { status: string } }>();
      expect(body.deposit.status).toBe('paid');
    });

    it('scenario 56: DELETE /api/vendors/:vendorId/invoices/:invoiceId/deposits/:depositId — 204', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user14@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 150, 'pending');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });
  });

  // ─── Additional route coverage ────────────────────────────────────────────────

  describe('GET /api/invoices/:invoiceId/deposits', () => {
    it('returns deposits list for the invoice', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user15@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      createTestDeposit(invoiceId, userId, 300, 'pending');

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ deposits: unknown[] }>();
      expect(Array.isArray(body.deposits)).toBe(true);
      expect(body.deposits).toHaveLength(1);
    });

    it('returns 401 when unauthenticated', async () => {
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/deposits`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 for nonexistent invoice', async () => {
      const { cookie } = await createUserWithSession('user16@test.com', 'Test User', 'password123');

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/nonexistent-invoice-id/deposits`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH body validation', () => {
    it('returns 400 when body has no fields (minProperties: 1)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user17@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 200, 'pending');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    // ─── Story #1876: entryType immutability ───────────────────────────────────
    //
    // NOTE: `updateDepositSchema` has no `entryType` property and
    // `additionalProperties: false`. This codebase's Fastify/AJV compiler runs
    // with the default `removeAdditional: true` (see invoices.test.ts's "strips
    // unknown properties" tests for the established pattern), which SILENTLY
    // STRIPS unknown properties before validation rather than rejecting the
    // request with 400. Verified empirically against this route: PATCH with
    // `entryType` in the body returns 200 (or, if `entryType` is the only field,
    // is stripped to `{}` which the Ajv `minProperties` check does not
    // re-evaluate post-strip, per the documented Ajv8+removeAdditional
    // interaction) — the field is always ignored, never rejected with 400.
    // The immutability guarantee (entryType never changes via PATCH) still
    // holds; only the transport-level status code differs from a naive
    // "unknown field -> 400" expectation.

    it('Scenario 5: PATCH with entryType + status silently ignores entryType (200), entryType stored value unchanged', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user18@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 200, 'pending', 'deposit');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
        payload: { status: 'paid', entryType: 'refund' },
      });

      // AJV strips the unknown `entryType` property before validation; the
      // remaining body ({ status: 'paid' }) is valid, so the request succeeds.
      expect(response.statusCode).toBe(200);
      const body = response.json<{ deposit: { status: string; entryType: string } }>();
      expect(body.deposit.status).toBe('paid');
      expect(body.deposit.entryType).toBe('deposit'); // unchanged — immutable

      // Verify via GET that the stored value is genuinely unchanged, not just
      // the PATCH response echoing stale data.
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/deposits`,
        headers: { cookie },
      });
      const getBody = getResponse.json<{ deposits: Array<{ id: string; entryType: string }> }>();
      const stored = getBody.deposits.find((d) => d.id === depositId);
      expect(stored?.entryType).toBe('deposit');
    });

    it('Scenario 5b: PATCH with only entryType (no other field) is stripped to a no-op (200), does not trigger minProperties 400', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user19@test.com',
        'Test User',
        'password123',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      const depositId = createTestDeposit(invoiceId, userId, 200, 'pending', 'deposit');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/deposits/${depositId}`,
        headers: { cookie },
        payload: { entryType: 'refund' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ deposit: { status: string; entryType: string } }>();
      expect(body.deposit.status).toBe('pending'); // unchanged
      expect(body.deposit.entryType).toBe('deposit'); // unchanged — immutable
    });
  });
});
