import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { Invoice, ApiErrorResponse } from '@cornerstone/shared';
import { vendors, invoices } from '../db/schema.js';

describe('Invoice Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-invoice-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie.
   */
  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  /** Timestamp offset for unique ordering */
  let vendorTimestampOffset = 0;

  /**
   * Helper: Insert a vendor directly into the database.
   */
  function createTestVendor(name: string): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + vendorTimestampOffset).toISOString();
    vendorTimestampOffset += 1;

    app.db
      .insert(vendors)
      .values({
        id,
        name,
        specialty: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return id;
  }

  /**
   * Helper: Insert an invoice directly into the database.
   */
  function createTestInvoice(
    vendorId: string,
    options: {
      invoiceNumber?: string | null;
      amount?: number;
      date?: string;
      dueDate?: string | null;
      status?: 'pending' | 'paid' | 'overdue';
      notes?: string | null;
    } = {},
  ): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: options.invoiceNumber ?? null,
        amount: options.amount ?? 1000,
        date: options.date ?? '2026-01-01',
        dueDate: options.dueDate ?? null,
        status: options.status ?? 'pending',
        notes: options.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  // ─── GET /api/vendors/:vendorId/invoices ────────────────────────────────────

  describe('GET /api/vendors/:vendorId/invoices', () => {
    it('returns 200 with empty invoices array when vendor has no invoices', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Empty Vendor');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(0);
    });

    it('returns 200 with list of invoices', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Multi Invoice Vendor');
      createTestInvoice(vendorId, { amount: 100 });
      createTestInvoice(vendorId, { amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(2);
    });

    it('returns all invoice fields in the list', async () => {
      const { cookie, userId } = await createUserWithSession(
        'user@test.com',
        'Test User',
        'password',
      );
      const vendorId = createTestVendor('Full Fields Vendor');
      createTestInvoice(vendorId, {
        invoiceNumber: 'INV-123',
        amount: 9999.99,
        date: '2026-02-20',
        dueDate: '2026-03-20',
        status: 'paid',
        notes: 'Fully paid invoice',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      const invoice = body.invoices[0];
      expect(invoice.id).toBeDefined();
      expect(invoice.vendorId).toBe(vendorId);
      expect(invoice.invoiceNumber).toBe('INV-123');
      expect(invoice.amount).toBe(9999.99);
      expect(invoice.date).toBe('2026-02-20');
      expect(invoice.dueDate).toBe('2026-03-20');
      expect(invoice.status).toBe('paid');
      expect(invoice.notes).toBe('Fully paid invoice');
      expect(invoice.createdAt).toBeDefined();
      expect(invoice.updatedAt).toBeDefined();
      // createdBy is null (not set in createTestInvoice)
      expect(invoice.createdBy).toBeNull();
      // userId is provided via createUserWithSession but not linked to invoice in this test
      expect(userId).toBeDefined();
    });

    it('returns invoices sorted by date descending', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Sorted Vendor');
      createTestInvoice(vendorId, { date: '2026-01-01', amount: 100 });
      createTestInvoice(vendorId, { date: '2026-03-01', amount: 300 });
      createTestInvoice(vendorId, { date: '2026-02-01', amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices[0].date).toBe('2026-03-01');
      expect(body.invoices[1].date).toBe('2026-02-01');
      expect(body.invoices[2].date).toBe('2026-01-01');
    });

    it('only returns invoices for the specified vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Vendor One');
      const vendor2Id = createTestVendor('Vendor Two');
      createTestInvoice(vendor1Id, { amount: 100 });
      createTestInvoice(vendor2Id, { amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor1Id}/invoices`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(1);
      expect(body.invoices[0].amount).toBe(100);
    });

    it('returns 404 NOT_FOUND when vendor does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors/non-existent-vendor-id/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const vendorId = createTestVendor('Auth Test Vendor');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to list invoices', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Member View Vendor');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/vendors/:vendorId/invoices ───────────────────────────────────

  describe('POST /api/vendors/:vendorId/invoices', () => {
    it('creates an invoice with required fields only (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Create Test Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 1500, date: '2026-02-01' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.id).toBeDefined();
      expect(body.invoice.vendorId).toBe(vendorId);
      expect(body.invoice.amount).toBe(1500);
      expect(body.invoice.date).toBe('2026-02-01');
      expect(body.invoice.status).toBe('pending');
      expect(body.invoice.invoiceNumber).toBeNull();
      expect(body.invoice.dueDate).toBeNull();
    });

    it('creates an invoice with all optional fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Full Invoice Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: {
          invoiceNumber: 'INV-100',
          amount: 5000.5,
          date: '2026-01-15',
          dueDate: '2026-02-15',
          status: 'paid',
          notes: 'Final installment',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.invoiceNumber).toBe('INV-100');
      expect(body.invoice.amount).toBe(5000.5);
      expect(body.invoice.date).toBe('2026-01-15');
      expect(body.invoice.dueDate).toBe('2026-02-15');
      expect(body.invoice.status).toBe('paid');
      expect(body.invoice.notes).toBe('Final installment');
    });

    it('sets createdBy to the authenticated user', async () => {
      const { cookie, userId } = await createUserWithSession(
        'user@test.com',
        'Test User',
        'password',
      );
      const vendorId = createTestVendor('CreatedBy Test Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 100, date: '2026-01-01' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.createdBy).not.toBeNull();
      expect(body.invoice.createdBy?.id).toBe(userId);
    });

    it('returns 400 VALIDATION_ERROR when amount is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Missing Amount Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { date: '2026-01-01' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when date is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Missing Date Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 500 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when amount is 0 (exclusiveMinimum on schema)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Zero Amount Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 0, date: '2026-01-01' },
      });

      // JSON schema enforces exclusiveMinimum: 0 → Fastify returns 400
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 VALIDATION_ERROR when date format is invalid', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Bad Date Format Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 100, date: '01/15/2026' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 VALIDATION_ERROR when dueDate is before date (service validation)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('DueDate Before Date Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 100, date: '2026-05-01', dueDate: '2026-01-01' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toMatch(/due date must be on or after/i);
    });

    it('returns 400 VALIDATION_ERROR for invalid status enum value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Bad Status Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 100, date: '2026-01-01', status: 'unpaid' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 NOT_FOUND when vendor does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors/non-existent-vendor/invoices',
        headers: { cookie },
        payload: { amount: 100, date: '2026-01-01' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const vendorId = createTestVendor('No Auth Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        payload: { amount: 100, date: '2026-01-01' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to create an invoice', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Member Create Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 200, date: '2026-01-01' },
      });

      expect(response.statusCode).toBe(201);
    });

    it('strips unknown properties from request body (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Strip Props Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: {
          amount: 100,
          date: '2026-01-01',
          unknownField: 'should be stripped',
        },
      });

      // Fastify strips extra props — still 201
      expect(response.statusCode).toBe(201);
    });

    it('applies overdue status when creating an invoice', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Overdue Status Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
        payload: { amount: 750, date: '2025-06-01', status: 'overdue' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.status).toBe('overdue');
    });
  });

  // ─── PATCH /api/vendors/:vendorId/invoices/:invoiceId ───────────────────────

  describe('PATCH /api/vendors/:vendorId/invoices/:invoiceId', () => {
    it('updates amount successfully (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH Amount Vendor');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { amount: 2500 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.id).toBe(invoiceId);
      expect(body.invoice.amount).toBe(2500);
    });

    it('updates status from pending to paid (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH Status Vendor');
      const invoiceId = createTestInvoice(vendorId, { status: 'pending' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { status: 'paid' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.status).toBe('paid');
    });

    it('updates multiple fields at once (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH Multiple Vendor');
      const invoiceId = createTestInvoice(vendorId, { amount: 100, status: 'pending' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: {
          amount: 500,
          status: 'paid',
          invoiceNumber: 'INV-999',
          notes: 'Updated notes',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.amount).toBe(500);
      expect(body.invoice.status).toBe('paid');
      expect(body.invoice.invoiceNumber).toBe('INV-999');
      expect(body.invoice.notes).toBe('Updated notes');
    });

    it('clears dueDate by setting to null (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH Clear DueDate Vendor');
      const invoiceId = createTestInvoice(vendorId, {
        date: '2026-01-01',
        dueDate: '2026-02-01',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { dueDate: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.dueDate).toBeNull();
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH Empty Vendor');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when dueDate is before date', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH DueDate Before Vendor');
      const invoiceId = createTestInvoice(vendorId, { date: '2026-06-01' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { dueDate: '2026-01-01' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid status enum on update', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('PATCH Bad Status Vendor');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { status: 'cancelled' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 NOT_FOUND when vendor does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/vendors/non-existent-vendor/invoices/any-invoice',
        headers: { cookie },
        payload: { amount: 500 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('No Invoice Vendor');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/non-existent-invoice`,
        headers: { cookie },
        payload: { amount: 500 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when invoice belongs to a different vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Invoice Owner');
      const vendor2Id = createTestVendor('Wrong Vendor');
      const invoiceId = createTestInvoice(vendor1Id, { amount: 100 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor2Id}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { amount: 999 },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const vendorId = createTestVendor('No Auth PATCH Vendor');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        payload: { amount: 500 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to update an invoice', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Member PATCH Vendor');
      const invoiceId = createTestInvoice(vendorId, { amount: 300 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
        payload: { amount: 450 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.amount).toBe(450);
    });
  });

  // ─── DELETE /api/vendors/:vendorId/invoices/:invoiceId ──────────────────────

  describe('DELETE /api/vendors/:vendorId/invoices/:invoiceId', () => {
    it('deletes an invoice successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Delete Invoice Vendor');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('invoice no longer appears in list after deletion', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Deleted Invoice Vendor');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });

      await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/invoices`,
        headers: { cookie },
      });

      expect(listResponse.statusCode).toBe(200);
      const body = listResponse.json<{ invoices: Invoice[] }>();
      expect(body.invoices.find((inv) => inv.id === invoiceId)).toBeUndefined();
    });

    it('returns 404 NOT_FOUND when vendor does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/vendors/non-existent-vendor/invoices/any-invoice',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('No Invoice Delete Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/invoices/non-existent-invoice`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when invoice belongs to a different vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Invoice Owner Delete');
      const vendor2Id = createTestVendor('Wrong Delete Vendor');
      const invoiceId = createTestInvoice(vendor1Id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor2Id}/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const vendorId = createTestVendor('No Auth Delete Vendor');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to delete an invoice', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Member Delete Vendor');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('does not delete invoices from other vendors', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Protected Invoice Vendor');
      const vendor2Id = createTestVendor('Deleting From Vendor');
      const inv1Id = createTestInvoice(vendor1Id, { amount: 111 });
      const inv2Id = createTestInvoice(vendor2Id, { amount: 222 });

      await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor2Id}/invoices/${inv2Id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor1Id}/invoices`,
        headers: { cookie },
      });

      expect(listResponse.statusCode).toBe(200);
      const body = listResponse.json<{ invoices: Invoice[] }>();
      expect(body.invoices.find((inv) => inv.id === inv1Id)).toBeDefined();
    });
  });
});
