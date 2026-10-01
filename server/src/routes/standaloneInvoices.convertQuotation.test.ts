/**
 * HTTP integration tests for POST /api/invoices/:invoiceId/convert-quotation.
 *
 * Story #2107 — Convert a quotation into the final invoice.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, Invoice } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('POST /api/invoices/:invoiceId/convert-quotation', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let counter = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-convert-quotation-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    counter = 0;
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
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password123', role);
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  function ts(): string {
    return new Date(Date.now() + counter++).toISOString();
  }

  function createQuotation(status: 'quotation' | 'pending' = 'quotation', amount = 10000): string {
    const vendorId = `vendor-${++counter}`;
    const now = ts();
    app.db
      .insert(schema.vendors)
      .values({ id: vendorId, name: 'Vendor', createdAt: now, updatedAt: now })
      .run();
    const id = `inv-${++counter}`;
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: 'Q-1',
        amount,
        date: '2026-01-15',
        status,
        notes: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createLine(invoiceId: string, amount: number): string {
    const wiId = `wi-${++counter}`;
    const budgetId = `wib-${counter}`;
    const now = ts();
    app.db
      .insert(schema.workItems)
      .values({ id: wiId, title: 'WI', status: 'not_started', createdAt: now, updatedAt: now })
      .run();
    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: wiId,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const id = randomUUID();
    app.db
      .insert(schema.invoiceBudgetLines)
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

  function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      amount: 10500,
      date: '2026-03-01',
      status: 'pending',
      conversionNote: 'Converted from quotation.',
      ...overrides,
    };
  }

  async function post(invoiceId: string, payload: unknown, cookie?: string) {
    return app.inject({
      method: 'POST',
      url: `/api/invoices/${invoiceId}/convert-quotation`,
      headers: cookie ? { cookie } : undefined,
      payload: payload as Record<string, unknown>,
    });
  }

  function getInvoiceRow(id: string) {
    return app.db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).get()!;
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  it('scenario 17: returns 401 without a session', async () => {
    const invoiceId = createQuotation();

    const response = await post(invoiceId, validBody());

    expect(response.statusCode).toBe(401);
    expect(getInvoiceRow(invoiceId).status).toBe('quotation');
  });

  it('scenario 18: a member user can convert (200)', async () => {
    const { cookie } = await createUserWithSession('member@test.com', 'member');
    const invoiceId = createQuotation();

    const response = await post(invoiceId, validBody(), cookie);

    expect(response.statusCode).toBe(200);
  });

  it('an admin user can convert (200)', async () => {
    const { cookie } = await createUserWithSession('admin@test.com', 'admin');
    const invoiceId = createQuotation();

    const response = await post(invoiceId, validBody({ status: 'paid' }), cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json<{ invoice: Invoice }>().invoice.status).toBe('paid');
  });

  // ─── Response shape ─────────────────────────────────────────────────────────

  it('scenario 20: 200 returns { invoice } with converted values, lines and links', async () => {
    const { cookie } = await createUserWithSession('user@test.com');
    const invoiceId = createQuotation();
    const lineId = createLine(invoiceId, 6000);

    const response = await post(
      invoiceId,
      validBody({
        invoiceNumber: 'INV-9',
        dueDate: '2026-04-01',
        budgetLines: [{ id: lineId, itemizedAmount: 6300 }],
        paperlessDocumentId: 5,
      }),
      cookie,
    );

    expect(response.statusCode).toBe(200);
    const body = response.json<{ invoice: Invoice }>();
    expect(Object.keys(body)).toEqual(['invoice']);
    expect(body.invoice.id).toBe(invoiceId);
    expect(body.invoice.status).toBe('pending');
    expect(body.invoice.amount).toBe(10500);
    expect(body.invoice.invoiceNumber).toBe('INV-9');
    expect(body.invoice.notes).toBe('Converted from quotation.');
    expect(body.invoice.budgetLines).toHaveLength(1);
    expect(body.invoice.budgetLines[0]!.itemizedAmount).toBe(6300);
    expect(body.invoice.remainingAmount).toBe(4200);
    const links = app.db
      .select()
      .from(schema.documentLinks)
      .where(eq(schema.documentLinks.entityId, invoiceId))
      .all();
    expect(links).toHaveLength(1);
    expect(links[0]!.attachmentType).toBe('invoice');
  });

  // ─── Schema rejections ──────────────────────────────────────────────────────

  describe('scenario 19: schema rejections (400)', () => {
    const cases: Array<[string, () => Record<string, unknown>]> = [
      ["status 'claimed'", () => validBody({ status: 'claimed' })],
      ["status 'quotation'", () => validBody({ status: 'quotation' })],
      [
        'missing conversionNote',
        () => {
          const b = validBody();
          delete b.conversionNote;
          return b;
        },
      ],
      ['empty conversionNote', () => validBody({ conversionNote: '' })],
      ['amount 0', () => validBody({ amount: 0 })],
      ['itemizedAmount 0', () => validBody({ budgetLines: [{ id: 'x', itemizedAmount: 0 }] })],
      ['paperlessDocumentId 0', () => validBody({ paperlessDocumentId: 0 })],
      ['malformed date', () => validBody({ date: '01/03/2026' })],
    ];

    it.each(cases)('rejects %s', async (_name, makeBody) => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation();

      const response = await post(invoiceId, makeBody(), cookie);

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(getInvoiceRow(invoiceId).status).toBe('quotation');
    });
  });

  it('scenario 19 (deviation): an unknown extra property is silently stripped by the global AJV removeAdditional setting, not rejected', async () => {
    const { cookie } = await createUserWithSession('user@test.com');
    const invoiceId = createQuotation();

    const response = await post(invoiceId, validBody({ bogus: true }), cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json<{ invoice: Record<string, unknown> }>().invoice.bogus).toBeUndefined();
  });

  // ─── Service errors mapped to HTTP ──────────────────────────────────────────

  describe('error mapping', () => {
    it('404 NOT_FOUND for an unknown invoice', async () => {
      const { cookie } = await createUserWithSession('user@test.com');

      const response = await post('missing', validBody(), cookie);

      expect(response.statusCode).toBe(404);
      expect(response.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
    });

    it('409 INVOICE_NOT_QUOTATION for a non-quotation invoice', async () => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation('pending');

      const response = await post(invoiceId, validBody(), cookie);

      expect(response.statusCode).toBe(409);
      const err = response.json<ApiErrorResponse>().error;
      expect(err.code).toBe('INVOICE_NOT_QUOTATION');
      expect(err.details).toEqual({ status: 'pending' });
    });

    it('400 ITEMIZED_SUM_EXCEEDS_INVOICE when lines exceed the final amount', async () => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation();
      createLine(invoiceId, 9000);

      const response = await post(invoiceId, validBody({ amount: 8000 }), cookie);

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
    });

    it('400 DEPOSITS_EXCEED_INVOICE_TOTAL with shortfall detail', async () => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation();
      const now = ts();
      app.db
        .insert(schema.invoiceDeposits)
        .values({
          id: 'dep-1',
          invoiceId,
          amount: 6000,
          dueDate: '2026-01-01',
          status: 'paid',
          paidDate: '2026-01-02',
          entryType: 'deposit',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const response = await post(invoiceId, validBody({ amount: 5000 }), cookie);

      expect(response.statusCode).toBe(400);
      const err = response.json<ApiErrorResponse>().error;
      expect(err.code).toBe('DEPOSITS_EXCEED_INVOICE_TOTAL');
      expect((err.details as { shortfall: number }).shortfall).toBe(1000);
    });

    it('409 DUPLICATE_DOCUMENT_LINK and no partial writes', async () => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation();
      app.db
        .insert(schema.documentLinks)
        .values({
          id: randomUUID(),
          entityType: 'invoice',
          entityId: invoiceId,
          paperlessDocumentId: 5,
          attachmentType: 'quotation',
          createdAt: ts(),
        })
        .run();

      const response = await post(invoiceId, validBody({ paperlessDocumentId: 5 }), cookie);

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorResponse>().error.code).toBe('DUPLICATE_DOCUMENT_LINK');
      const row = getInvoiceRow(invoiceId);
      expect(row.status).toBe('quotation');
      expect(row.amount).toBe(10000);
    });

    it('400 VALIDATION_ERROR for an impossible calendar date (2026-02-31)', async () => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation();

      const response = await post(invoiceId, validBody({ date: '2026-02-31' }), cookie);

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(getInvoiceRow(invoiceId).status).toBe('quotation');
    });

    it('400 VALIDATION_ERROR when dueDate is before date', async () => {
      const { cookie } = await createUserWithSession('user@test.com');
      const invoiceId = createQuotation();

      const response = await post(
        invoiceId,
        validBody({ date: '2026-03-01', dueDate: '2026-02-01' }),
        cookie,
      );

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
