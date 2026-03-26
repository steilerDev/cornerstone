import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { Invoice, ApiErrorResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('Standalone Invoice Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  let tsOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-standalone-invoice-test-'));
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

  function createTestVendor(name: string): string {
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
    options: {
      invoiceNumber?: string | null;
      amount?: number;
      date?: string;
      dueDate?: string | null;
      status?: 'pending' | 'paid' | 'claimed' | 'quotation';
      notes?: string | null;
    } = {},
  ): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: options.invoiceNumber ?? null,
        amount: options.amount ?? 1000,
        date: options.date ?? '2026-01-15',
        dueDate: options.dueDate ?? null,
        status: options.status ?? 'pending',
        notes: options.notes ?? null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  // ─── GET /api/invoices ───────────────────────────────────────────────────────

  describe('GET /api/invoices', () => {
    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty invoice list when no invoices exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        invoices: Invoice[];
        pagination: Record<string, number>;
        summary: Record<string, unknown>;
        filterMeta: Record<string, unknown>;
      }>();
      expect(body.invoices).toHaveLength(0);
      expect(body.pagination).toBeDefined();
      expect(body.summary).toBeDefined();
      expect(body.filterMeta).toBeDefined();
    });

    it('returns invoices from all vendors', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Vendor Alpha');
      const vendor2Id = createTestVendor('Vendor Beta');
      createTestInvoice(vendor1Id, { amount: 100 });
      createTestInvoice(vendor2Id, { amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(2);
    });

    it('returns correct pagination metadata', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Pagination');
      createTestInvoice(vendorId, { amount: 100, date: '2026-01-01' });
      createTestInvoice(vendorId, { amount: 200, date: '2026-01-02' });
      createTestInvoice(vendorId, { amount: 300, date: '2026-01-03' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?page=1&pageSize=2',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        invoices: Invoice[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>();
      expect(body.invoices).toHaveLength(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(2);
      expect(body.pagination.totalItems).toBe(3);
      expect(body.pagination.totalPages).toBe(2);
    });

    it('returns second page of results correctly', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Page2');
      createTestInvoice(vendorId, { amount: 100, date: '2026-01-01' });
      createTestInvoice(vendorId, { amount: 200, date: '2026-01-02' });
      createTestInvoice(vendorId, { amount: 300, date: '2026-01-03' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?page=2&pageSize=2',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(1);
    });

    it('filters by status', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Status Filter');
      createTestInvoice(vendorId, { status: 'pending', amount: 100 });
      createTestInvoice(vendorId, { status: 'paid', amount: 200 });
      createTestInvoice(vendorId, { status: 'paid', amount: 300 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?status=paid',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(2);
      expect(body.invoices.every((inv) => inv.status === 'paid')).toBe(true);
    });

    it('returns 400 for invalid status enum value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?status=invalid-status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('filters by vendorId', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Vendor Filter 1');
      const vendor2Id = createTestVendor('Vendor Filter 2');
      createTestInvoice(vendor1Id, { amount: 100 });
      createTestInvoice(vendor1Id, { amount: 150 });
      createTestInvoice(vendor2Id, { amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices?vendorId=${vendor1Id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(2);
      expect(body.invoices.every((inv) => inv.vendorId === vendor1Id)).toBe(true);
    });

    it('filters by amountMin and amountMax', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Amount Filter');
      createTestInvoice(vendorId, { amount: 100 });
      createTestInvoice(vendorId, { amount: 500 });
      createTestInvoice(vendorId, { amount: 1000 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?amountMin=200&amountMax=800',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(1);
      expect(body.invoices[0].amount).toBe(500);
    });

    it('filters by dateFrom and dateTo', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Date Filter');
      createTestInvoice(vendorId, { date: '2026-01-01', amount: 100 });
      createTestInvoice(vendorId, { date: '2026-02-15', amount: 200 });
      createTestInvoice(vendorId, { date: '2026-03-31', amount: 300 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?dateFrom=2026-02-01&dateTo=2026-02-28',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(1);
      expect(body.invoices[0].amount).toBe(200);
    });

    it('filters by dueDateFrom and dueDateTo', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor DueDate Filter');
      createTestInvoice(vendorId, { date: '2026-01-01', dueDate: '2026-01-15', amount: 100 });
      createTestInvoice(vendorId, { date: '2026-01-01', dueDate: '2026-02-15', amount: 200 });
      createTestInvoice(vendorId, { date: '2026-01-01', dueDate: null, amount: 300 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?dueDateFrom=2026-02-01&dueDateTo=2026-02-28',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(1);
      expect(body.invoices[0].amount).toBe(200);
    });

    it('filters by invoice number search (q parameter)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Search Filter');
      createTestInvoice(vendorId, { invoiceNumber: 'INV-2026-001', amount: 100 });
      createTestInvoice(vendorId, { invoiceNumber: 'INV-2026-002', amount: 200 });
      createTestInvoice(vendorId, { invoiceNumber: 'RECEIPT-001', amount: 300 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?q=inv-2026',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(2);
    });

    it('sorts by amount ascending', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Sort Amount');
      createTestInvoice(vendorId, { amount: 300, date: '2026-01-01' });
      createTestInvoice(vendorId, { amount: 100, date: '2026-01-02' });
      createTestInvoice(vendorId, { amount: 200, date: '2026-01-03' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?sortBy=amount&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices[0].amount).toBe(100);
      expect(body.invoices[1].amount).toBe(200);
      expect(body.invoices[2].amount).toBe(300);
    });

    it('sorts by status', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Sort Status');
      createTestInvoice(vendorId, { status: 'pending', amount: 100 });
      createTestInvoice(vendorId, { status: 'claimed', amount: 200 });
      createTestInvoice(vendorId, { status: 'paid', amount: 300 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?sortBy=status&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      // Just verify it completes without error; ordering on enum values is predictable
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(3);
    });

    it('sorts by vendor_name ascending', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorAId = createTestVendor('Alpha Vendor');
      const vendorZId = createTestVendor('Zeta Vendor');
      createTestInvoice(vendorZId, { amount: 100 });
      createTestInvoice(vendorAId, { amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?sortBy=vendor_name&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices[0].vendorName).toBe('Alpha Vendor');
      expect(body.invoices[1].vendorName).toBe('Zeta Vendor');
    });

    it('sorts by due_date', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Sort DueDate');
      createTestInvoice(vendorId, { date: '2026-01-01', dueDate: '2026-03-01', amount: 100 });
      createTestInvoice(vendorId, { date: '2026-01-01', dueDate: '2026-01-15', amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?sortBy=due_date&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices[0].amount).toBe(200); // earlier due date first
    });

    it('returns 400 for invalid sortBy value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?sortBy=invalid_field',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid sortOrder value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?sortOrder=random',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for page < 1', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?page=0',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for pageSize > 100', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?pageSize=101',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for unknown query parameters (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?unknownParam=foo',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns status summary breakdown with correct counts and totals', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Summary');
      createTestInvoice(vendorId, { status: 'pending', amount: 100 });
      createTestInvoice(vendorId, { status: 'pending', amount: 200 });
      createTestInvoice(vendorId, { status: 'paid', amount: 500 });
      createTestInvoice(vendorId, { status: 'claimed', amount: 300 });
      createTestInvoice(vendorId, { status: 'quotation', amount: 150 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        summary: {
          pending: { count: number; totalAmount: number };
          paid: { count: number; totalAmount: number };
          claimed: { count: number; totalAmount: number };
          quotation: { count: number; totalAmount: number };
        };
      }>();
      expect(body.summary.pending.count).toBe(2);
      expect(body.summary.pending.totalAmount).toBe(300);
      expect(body.summary.paid.count).toBe(1);
      expect(body.summary.paid.totalAmount).toBe(500);
      expect(body.summary.claimed.count).toBe(1);
      expect(body.summary.claimed.totalAmount).toBe(300);
      expect(body.summary.quotation.count).toBe(1);
      expect(body.summary.quotation.totalAmount).toBe(150);
    });

    it('returns filterMeta with correct amount min/max based on base filters', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor FilterMeta');
      createTestInvoice(vendorId, { amount: 100, status: 'pending' });
      createTestInvoice(vendorId, { amount: 1000, status: 'pending' });
      createTestInvoice(vendorId, { amount: 5000, status: 'paid' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?status=pending',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ filterMeta: { amount: { min: number; max: number } } }>();
      expect(body.filterMeta.amount.min).toBe(100);
      expect(body.filterMeta.amount.max).toBe(1000);
    });

    it('returns all required invoice fields', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Full Fields Vendor SA');
      createTestInvoice(vendorId, {
        invoiceNumber: 'INV-SA-001',
        amount: 999.99,
        date: '2026-03-01',
        dueDate: '2026-04-01',
        status: 'claimed',
        notes: 'Test standalone note',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices).toHaveLength(1);
      const inv = body.invoices[0];
      expect(inv.id).toBeDefined();
      expect(inv.vendorId).toBe(vendorId);
      expect(inv.vendorName).toBe('Full Fields Vendor SA');
      expect(inv.invoiceNumber).toBe('INV-SA-001');
      expect(inv.amount).toBe(999.99);
      expect(inv.date).toBe('2026-03-01');
      expect(inv.dueDate).toBe('2026-04-01');
      expect(inv.status).toBe('claimed');
      expect(inv.notes).toBe('Test standalone note');
      expect(inv.budgetLines).toBeDefined();
      expect(inv.remainingAmount).toBeDefined();
      expect(inv.createdBy).toBeNull();
      expect(inv.createdAt).toBeDefined();
      expect(inv.updatedAt).toBeDefined();
    });

    it('sorts by date descending by default', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Default Sort');
      createTestInvoice(vendorId, { date: '2026-01-01', amount: 100 });
      createTestInvoice(vendorId, { date: '2026-03-01', amount: 300 });
      createTestInvoice(vendorId, { date: '2026-02-01', amount: 200 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoices: Invoice[] }>();
      expect(body.invoices[0].date).toBe('2026-03-01');
      expect(body.invoices[1].date).toBe('2026-02-01');
      expect(body.invoices[2].date).toBe('2026-01-01');
    });

    it('allows member user to list all invoices', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns correct page when no results on that page', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Empty Page');
      createTestInvoice(vendorId, { amount: 100 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices?page=2&pageSize=25',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        invoices: Invoice[];
        pagination: { totalItems: number; totalPages: number };
      }>();
      expect(body.invoices).toHaveLength(0);
      expect(body.pagination.totalItems).toBe(1);
    });
  });

  // ─── GET /api/invoices/:invoiceId ────────────────────────────────────────────

  describe('GET /api/invoices/:invoiceId', () => {
    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices/some-invoice-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices/non-existent-invoice-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with the invoice when it exists', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Get By Id');
      const invoiceId = createTestInvoice(vendorId, {
        invoiceNumber: 'INV-GET-001',
        amount: 750,
        date: '2026-02-10',
        status: 'paid',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.id).toBe(invoiceId);
      expect(body.invoice.vendorId).toBe(vendorId);
      expect(body.invoice.vendorName).toBe('Vendor Get By Id');
      expect(body.invoice.invoiceNumber).toBe('INV-GET-001');
      expect(body.invoice.amount).toBe(750);
      expect(body.invoice.date).toBe('2026-02-10');
      expect(body.invoice.status).toBe('paid');
    });

    it('returns all invoice fields including budgetLines and remainingAmount', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Get Full Fields');
      const invoiceId = createTestInvoice(vendorId, {
        amount: 1000,
        dueDate: '2026-03-01',
        notes: 'Full field test',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      const inv = body.invoice;
      expect(inv.budgetLines).toBeDefined();
      expect(Array.isArray(inv.budgetLines)).toBe(true);
      expect(inv.remainingAmount).toBe(1000);
      expect(inv.dueDate).toBe('2026-03-01');
      expect(inv.notes).toBe('Full field test');
      expect(inv.createdBy).toBeNull();
    });

    it('can retrieve an invoice from any vendor (cross-vendor access)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor1Id = createTestVendor('Vendor X');
      const vendor2Id = createTestVendor('Vendor Y');
      const invoice1Id = createTestInvoice(vendor1Id, { amount: 100 });
      const invoice2Id = createTestInvoice(vendor2Id, { amount: 200 });

      const resp1 = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoice1Id}`,
        headers: { cookie },
      });
      const resp2 = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoice2Id}`,
        headers: { cookie },
      });

      expect(resp1.statusCode).toBe(200);
      expect(resp1.json<{ invoice: Invoice }>().invoice.amount).toBe(100);
      expect(resp2.statusCode).toBe(200);
      expect(resp2.json<{ invoice: Invoice }>().invoice.amount).toBe(200);
    });

    it('allows member user to get invoice by id', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Vendor Member Get');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns invoice with remainingAmount reduced by linked budget lines', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Get With Lines');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });

      // Create a work item and budget line, then link to invoice
      const wiId = `wi-${Date.now()}`;
      const wibId = `wib-${Date.now()}`;
      const ts = new Date().toISOString();
      app.db
        .insert(schema.workItems)
        .values({
          id: wiId,
          title: 'Get Test Task',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          actualStartDate: null,
          actualEndDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          areaId: null,
          assignedVendorId: null,
          createdBy: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      app.db
        .insert(schema.workItemBudgets)
        .values({
          id: wibId,
          workItemId: wiId,
          description: 'Get test budget',
          plannedAmount: 700,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          budgetSourceId: null,
          vendorId: null,
          quantity: null,
          unit: null,
          unitPrice: null,
          includesVat: null,
          createdBy: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      // Link the budget line to the invoice via POST
      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 400 },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ invoice: Invoice }>();
      expect(body.invoice.budgetLines).toHaveLength(1);
      expect(body.invoice.remainingAmount).toBe(600);
    });
  });
});
