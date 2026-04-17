/**
 * Route integration tests for GET /api/budget-sources/:sourceId/budget-lines
 *
 * Uses Fastify's app.inject() — no HTTP server required.
 * Setup/teardown follows the exact pattern of budgetSources.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { BudgetSourceBudgetLinesResponse, ApiErrorResponse } from '@cornerstone/shared';
import {
  budgetSources,
  workItems,
  workItemBudgets,
  householdItems,
  householdItemBudgets,
  invoices,
  invoiceBudgetLines,
  vendors,
  areas,
} from '../db/schema.js';

describe('GET /api/budget-sources/:sourceId/budget-lines', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  let counter = 0;
  const uid = (prefix: string) => `${prefix}-${++counter}`;
  const ts = () => new Date().toISOString();

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-bsbl-route-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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

  function createTestSource(name = 'Test Source', totalAmount = 100_000): string {
    const id = uid('src');
    const now = ts();
    app.db
      .insert(budgetSources)
      .values({
        id,
        name,
        sourceType: 'bank_loan',
        totalAmount,
        interestRate: null,
        terms: null,
        notes: null,
        status: 'active',
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createArea(name: string): string {
    const id = uid('area');
    const now = ts();
    app.db
      .insert(areas)
      .values({
        id,
        name,
        parentId: null,
        color: '#ff0000',
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createVendor(name = 'Test Vendor'): string {
    const id = uid('vnd');
    const now = ts();
    app.db.insert(vendors).values({ id, name, createdAt: now, updatedAt: now }).run();
    return id;
  }

  function createWorkItem(areaId?: string | null, title = 'Test WI'): string {
    const id = uid('wi');
    const now = ts();
    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        areaId: areaId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createWorkItemBudgetLine(
    wiId: string,
    sourceId: string | null,
    plannedAmount = 1000,
  ): string {
    const id = uid('wib');
    const now = ts();
    app.db
      .insert(workItemBudgets)
      .values({
        id,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createHouseholdItem(areaId?: string | null, name = 'Test HI'): string {
    const id = uid('hi');
    const now = ts();
    app.db
      .insert(householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture',
        status: 'planned',
        areaId: areaId ?? null,
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createHouseholdItemBudgetLine(
    hiId: string,
    sourceId: string | null,
    plannedAmount = 1000,
  ): string {
    const id = uid('hib');
    const now = ts();
    app.db
      .insert(householdItemBudgets)
      .values({
        id,
        householdItemId: hiId,
        budgetSourceId: sourceId,
        plannedAmount,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createInvoice(
    vendorId: string,
    status: 'pending' | 'paid' | 'claimed' | 'quotation',
    amount = 500,
  ): string {
    const id = uid('inv');
    const now = ts();
    app.db
      .insert(invoices)
      .values({ id, vendorId, amount, date: '2026-01-15', status, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function linkInvoiceToWorkItemBudget(
    invoiceId: string,
    wibId: string,
    itemizedAmount: number,
  ): void {
    const now = ts();
    app.db
      .insert(invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId,
        workItemBudgetId: wibId,
        householdItemBudgetId: null,
        itemizedAmount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function linkInvoiceToHouseholdItemBudget(
    invoiceId: string,
    hibId: string,
    itemizedAmount: number,
  ): void {
    const now = ts();
    app.db
      .insert(invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId,
        workItemBudgetId: null,
        householdItemBudgetId: hibId,
        itemizedAmount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // ─── Tests ───────────────────────────────────────────────────────────────────

  // 1. 401 without auth
  it('returns 401 without authentication', async () => {
    const sourceId = createTestSource();

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // 2. 404 for nonexistent sourceId
  it('returns 404 for nonexistent sourceId', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget-sources/nonexistent-source-id/budget-lines',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // 3. 200 with empty arrays when source has no lines
  it('returns 200 with empty arrays when source has no budget lines', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource('Empty Source');

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    expect(body.workItemLines).toEqual([]);
    expect(body.householdItemLines).toEqual([]);
  });

  // 4. 200 with a work-item line present — verify shape
  it('returns 200 with work-item line present and correct shape', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource('WI Source');
    const wiId = createWorkItem(null, 'Plumbing');
    createWorkItemBudgetLine(wiId, sourceId, 5000);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    expect(body.workItemLines).toHaveLength(1);
    expect(body.householdItemLines).toHaveLength(0);

    const line = body.workItemLines[0];
    expect(line.parentName).toBe('Plumbing');
    expect(line.plannedAmount).toBe(5000);
    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.actualCost).toBe(0);
    expect(line.invoiceCount).toBe(0);
    expect(line.invoiceLink).toBeNull();
    expect(line.area).toBeNull();
  });

  // 5. 200 with a household-item line present
  it('returns 200 with household-item line present and correct shape', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource('HI Source');
    const hiId = createHouseholdItem(null, 'Bookshelf');
    createHouseholdItemBudgetLine(hiId, sourceId, 800);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    expect(body.workItemLines).toHaveLength(0);
    expect(body.householdItemLines).toHaveLength(1);

    const line = body.householdItemLines[0];
    expect(line.parentName).toBe('Bookshelf');
    expect(line.plannedAmount).toBe(800);
    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.invoiceLink).toBeNull();
  });

  // 6. hasClaimedInvoice: true when claimed invoice linked to work item line
  it('hasClaimedInvoice is true when a claimed invoice is linked to the work-item line', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource();
    const vendorId = createVendor();
    const wiId = createWorkItem();
    const lineId = createWorkItemBudgetLine(wiId, sourceId, 2000);
    const invoiceId = createInvoice(vendorId, 'claimed', 1800);
    linkInvoiceToWorkItemBudget(invoiceId, lineId, 1800);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    const line = body.workItemLines[0];
    expect(line.hasClaimedInvoice).toBe(true);
    expect(line.actualCost).toBe(1800);
    expect(line.actualCostPaid).toBe(1800);
    expect(line.invoiceCount).toBe(1);
    expect(line.invoiceLink).not.toBeNull();
    expect(line.invoiceLink?.invoiceStatus).toBe('claimed');
  });

  // 7. hasClaimedInvoice: false when paid invoice linked
  it('hasClaimedInvoice is false when only a paid invoice is linked', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource();
    const vendorId = createVendor();
    const wiId = createWorkItem();
    const lineId = createWorkItemBudgetLine(wiId, sourceId, 2000);
    const invoiceId = createInvoice(vendorId, 'paid', 700);
    linkInvoiceToWorkItemBudget(invoiceId, lineId, 700);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    const line = body.workItemLines[0];
    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.actualCostPaid).toBe(700);
    expect(line.invoiceLink?.invoiceStatus).toBe('paid');
  });

  // 8. Member user can access
  it('member user can access the budget-lines endpoint', async () => {
    const { cookie } = await createUserWithSession(
      'member@test.com',
      'Member',
      'password',
      'member',
    );
    const sourceId = createTestSource();

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
  });

  // 9. Admin user can access
  it('admin user can access the budget-lines endpoint', async () => {
    const { cookie } = await createUserWithSession('admin@test.com', 'Admin', 'password', 'admin');
    const sourceId = createTestSource();

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
  });

  // 10. Response includes all BaseBudgetLine fields
  it('response includes all BaseBudgetLine fields on work item line', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource('Field Check Source');
    const areaId = createArea('Zone A');
    const wiId = createWorkItem(areaId, 'Full Field WI');
    createWorkItemBudgetLine(wiId, sourceId, 3000);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    const line = body.workItemLines[0];

    // BaseBudgetLine required fields
    expect(line).toHaveProperty('id');
    expect(line).toHaveProperty('description');
    expect(line).toHaveProperty('plannedAmount');
    expect(line).toHaveProperty('confidence');
    expect(line).toHaveProperty('confidenceMargin');
    expect(line).toHaveProperty('budgetCategory');
    expect(line).toHaveProperty('budgetSource');
    expect(line).toHaveProperty('vendor');
    expect(line).toHaveProperty('actualCost');
    expect(line).toHaveProperty('actualCostPaid');
    expect(line).toHaveProperty('invoiceCount');
    expect(line).toHaveProperty('invoiceLink');
    expect(line).toHaveProperty('quantity');
    expect(line).toHaveProperty('unit');
    expect(line).toHaveProperty('unitPrice');
    expect(line).toHaveProperty('includesVat');
    expect(line).toHaveProperty('createdBy');
    expect(line).toHaveProperty('createdAt');
    expect(line).toHaveProperty('updatedAt');

    // BudgetSourceBudgetLine additional fields
    expect(line).toHaveProperty('parentId');
    expect(line).toHaveProperty('parentName');
    expect(line).toHaveProperty('area');
    expect(line).toHaveProperty('hasClaimedInvoice');

    // Verify types
    expect(typeof line.plannedAmount).toBe('number');
    expect(typeof line.actualCost).toBe('number');
    expect(typeof line.invoiceCount).toBe('number');
    expect(typeof line.hasClaimedInvoice).toBe('boolean');
    expect(typeof line.confidenceMargin).toBe('number');

    // Area is populated (we set areaId)
    expect(line.area).not.toBeNull();
    expect(line.area?.name).toBe('Zone A');
    expect(line.parentName).toBe('Full Field WI');
    expect(line.budgetSource?.id).toBe(sourceId);
  });

  // Extra: HI line with claimed invoice via route
  it('household item line hasClaimedInvoice is true when claimed invoice is linked', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource();
    const vendorId = createVendor();
    const hiId = createHouseholdItem(null, 'Smart TV');
    const hibId = createHouseholdItemBudgetLine(hiId, sourceId, 1200);
    const invoiceId = createInvoice(vendorId, 'claimed', 1100);
    linkInvoiceToHouseholdItemBudget(invoiceId, hibId, 1100);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    const line = body.householdItemLines[0];
    expect(line.hasClaimedInvoice).toBe(true);
    expect(line.actualCost).toBe(1100);
  });

  // Extra: route properly groups mixed work item + HI lines
  it('returns both work item and household item lines in their respective arrays', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const sourceId = createTestSource('Mixed Source');
    const wiId = createWorkItem(null, 'Work Task');
    createWorkItemBudgetLine(wiId, sourceId, 2500);
    const hiId = createHouseholdItem(null, 'Chair');
    createHouseholdItemBudgetLine(hiId, sourceId, 400);

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}/budget-lines`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetSourceBudgetLinesResponse>();
    expect(body.workItemLines).toHaveLength(1);
    expect(body.householdItemLines).toHaveLength(1);
    expect(body.workItemLines[0].parentName).toBe('Work Task');
    expect(body.householdItemLines[0].parentName).toBe('Chair');
  });
});
