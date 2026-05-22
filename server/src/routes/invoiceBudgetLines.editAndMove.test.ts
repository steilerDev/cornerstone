import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, InvoiceBudgetLineCreateResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('PATCH /api/invoices/:invoiceId/budget-lines/:id — editAndMove', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let tsOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-ibl-move-routes-test-'));
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
    email = 'user@test.com',
    displayName = 'Test User',
    password = 'password',
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${sessionToken}` };
  }

  function ts(): string {
    return new Date(Date.now() + tsOffset++).toISOString();
  }

  function createVendor(name = 'Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.vendors).values({ id, name, tradeId: null, phone: null, email: null, address: null, notes: null, createdBy: null, createdAt: t, updatedAt: t }).run();
    return id;
  }

  function createInvoice(vendorId: string, amount = 1000): string {
    const id = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.invoices).values({ id, vendorId, invoiceNumber: null, amount, date: '2026-01-15', dueDate: null, status: 'pending', notes: null, createdBy: null, createdAt: t, updatedAt: t }).run();
    return id;
  }

  function createWorkItem(title = 'Work Item'): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.workItems).values({ id, title, description: null, status: 'not_started', startDate: null, endDate: null, actualStartDate: null, actualEndDate: null, durationDays: null, startAfter: null, startBefore: null, assignedUserId: null, areaId: null, assignedVendorId: null, createdBy: null, createdAt: t, updatedAt: t }).run();
    return id;
  }

  function createWorkItemBudget(workItemId: string, plannedAmount = 500): string {
    const id = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.workItemBudgets).values({ id, workItemId, description: 'WI Budget', plannedAmount, confidence: 'own_estimate', budgetCategoryId: null, budgetSourceId: null, vendorId: null, quantity: null, unit: null, unitPrice: null, includesVat: true, createdBy: null, createdAt: t, updatedAt: t }).run();
    return id;
  }

  function createHouseholdItem(name = 'HI'): string {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.householdItems).values({ id, name, description: null, categoryId: 'hic-furniture', status: 'planned', vendorId: null, areaId: null, url: null, quantity: 1, orderDate: null, actualDeliveryDate: null, earliestDeliveryDate: null, latestDeliveryDate: null, targetDeliveryDate: null, isLate: false, createdBy: null, createdAt: t, updatedAt: t }).run();
    return id;
  }

  function createIblOnWorkItem(invoiceId: string, workItemId: string, itemizedAmount = 300): { iblId: string; wibId: string } {
    const wibId = createWorkItemBudget(workItemId);
    const iblId = `ibl-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.invoiceBudgetLines).values({ id: iblId, invoiceId, workItemBudgetId: wibId, householdItemBudgetId: null, itemizedAmount, createdAt: t, updatedAt: t }).run();
    return { iblId, wibId };
  }

  // ─── Scenario 1: In-place edit ───────────────────────────────────────────────

  it('PATCH with { description, itemizedAmount } → 200 with updated budgetLine', async () => {
    const { cookie } = await createUserWithSession();
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/${invoiceId}/budget-lines/${iblId}`,
      headers: { cookie },
      payload: { description: 'Updated', itemizedAmount: 450 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<InvoiceBudgetLineCreateResponse>();
    expect(body.budgetLine.id).toBe(iblId);
    expect(body.budgetLine.itemizedAmount).toBe(450);
    expect(body.budgetLine.budgetLineDescription).toBe('Updated');
    expect(body.remainingAmount).toBe(550);
  });

  // ─── Scenario 2: Move with newWorkItemId ─────────────────────────────────────

  it('PATCH with newWorkItemId → 200 with new parentItemTitle', async () => {
    const { cookie } = await createUserWithSession();
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const { iblId } = createIblOnWorkItem(invoiceId, wi1, 300);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/${invoiceId}/budget-lines/${iblId}`,
      headers: { cookie },
      payload: { newWorkItemId: wi2 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<InvoiceBudgetLineCreateResponse>();
    expect(body.budgetLine.parentItemTitle).toBe('Plumbing');
    expect(body.budgetLine.parentItemType).toBe('work_item');
  });

  // ─── Scenario 3: Unauthorized ────────────────────────────────────────────────

  it('PATCH without auth → 401', async () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/${invoiceId}/budget-lines/${iblId}`,
      payload: { itemizedAmount: 200 },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // ─── Scenario 4: Unknown invoiceId → 404 ─────────────────────────────────────

  it('PATCH with unknown invoiceId → 404', async () => {
    const { cookie } = await createUserWithSession();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/non-existent-invoice/budget-lines/non-existent-line`,
      headers: { cookie },
      payload: { itemizedAmount: 200 },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ─── Scenario 5: itemizedAmount: 0 → 400 VALIDATION_ERROR ───────────────────

  it('PATCH with itemizedAmount: 0 → 400 VALIDATION_ERROR (Fastify schema)', async () => {
    const { cookie } = await createUserWithSession();
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/${invoiceId}/budget-lines/${iblId}`,
      headers: { cookie },
      payload: { itemizedAmount: 0 },
    });

    expect(response.statusCode).toBe(400);
  });

  // ─── Scenario 6: WI already linked to same invoice → 409 ────────────────────

  it('PATCH with newWorkItemId already linked → 409 BUDGET_LINE_ALREADY_LINKED', async () => {
    const { cookie } = await createUserWithSession();
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 2000);
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const { iblId } = createIblOnWorkItem(invoiceId, wi1, 300);
    // wi2 already linked to the same invoice
    createIblOnWorkItem(invoiceId, wi2, 300);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/${invoiceId}/budget-lines/${iblId}`,
      headers: { cookie },
      payload: { newWorkItemId: wi2 },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('BUDGET_LINE_ALREADY_LINKED');
  });

  // ─── Scenario 7: Both move fields provided → 400 ────────────────────────────

  it('PATCH with both newWorkItemId and newHouseholdItemId → 400 VALIDATION_ERROR', async () => {
    const { cookie } = await createUserWithSession();
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const hiId = createHouseholdItem('Sofa');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/invoices/${invoiceId}/budget-lines/${iblId}`,
      headers: { cookie },
      payload: { newWorkItemId: wiId, newHouseholdItemId: hiId },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
