import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, InvoiceListPaginatedResponse } from '@cornerstone/shared';
import { INVOICE_LIST_SORTS } from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as schema from '../db/schema.js';

/**
 * GET /api/invoices request schema and response shape of the P4.6 list (#2238): boolean flags,
 * `ids` limits, the `invoice_number` sort, and the row fields / listTotals over the wire.
 * Synthetic data only.
 */
describe('GET /api/invoices list flags (#2238)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  const NOW = '2026-01-01T00:00:00.000Z';

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-invoice-flags-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'u@test.com',
      'User',
      'password',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
    app.db
      .insert(schema.vendors)
      .values({ id: 'v-1', name: 'Company One', createdAt: NOW, updatedAt: NOW })
      .run();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  function invoice(id: string, opts: { number?: string | null; amount?: number } = {}): void {
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId: 'v-1',
        invoiceNumber: opts.number === undefined ? `NR-${id}` : opts.number,
        amount: opts.amount ?? 1000,
        date: '2026-01-10',
        status: 'pending',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  const raw = (qs: string, headers: Record<string, string> = { cookie }) =>
    app.inject({ method: 'GET', url: `/api/invoices${qs}`, headers });

  async function get(qs = ''): Promise<InvoiceListPaginatedResponse> {
    const res = await raw(qs);
    expect(res.statusCode).toBe(200);
    return res.json<InvoiceListPaginatedResponse>();
  }

  it('rejects an anonymous request', async () => {
    const res = await raw('', {});
    expect(res.statusCode).toBe(401);
  });

  it.each(['notYetSplit', 'withoutDocument', 'refundsDue', 'due'])(
    'coerces %s=true and %s=false to booleans',
    async (flag) => {
      invoice('a');
      expect((await get(`?${flag}=false`)).pagination.totalItems).toBe(1);
      expect((await raw(`?${flag}=true`)).statusCode).toBe(200);
    },
  );

  it('narrows the list over the wire when a flag is true', async () => {
    invoice('a');
    expect((await get('?refundsDue=true')).pagination.totalItems).toBe(0);
    expect((await get('?refundsDue=false')).pagination.totalItems).toBe(1);
  });

  it('rejects a non-boolean flag value with 400 VALIDATION_ERROR', async () => {
    const res = await raw('?due=maybe');
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
  });

  it('strips an unknown query parameter instead of failing (app-wide removeAdditional)', async () => {
    expect((await raw('?bogus=1')).statusCode).toBe(200);
  });

  it.each([...INVOICE_LIST_SORTS])('accepts sortBy=%s', async (sortBy) => {
    expect((await raw(`?sortBy=${sortBy}`)).statusCode).toBe(200);
  });

  it('rejects an unknown sortBy', async () => {
    expect((await raw('?sortBy=nonsense')).statusCode).toBe(400);
  });

  it('sorts by invoice_number with empty numbers last', async () => {
    invoice('x', { number: null });
    invoice('b', { number: 'B-1' });
    invoice('a', { number: 'A-1' });
    const asc = await get('?sortBy=invoice_number&sortOrder=asc');
    expect(asc.invoices.map((i) => i.id)).toEqual(['a', 'b', 'x']);
    const desc = await get('?sortBy=invoice_number&sortOrder=desc');
    expect(desc.invoices.map((i) => i.id)).toEqual(['b', 'a', 'x']);
  });

  describe('ids', () => {
    it('returns the named rows unpaged', async () => {
      invoice('a');
      invoice('b');
      invoice('c');
      const body = await get('?ids=a,c&page=2&pageSize=1');
      expect(body.invoices.map((i) => i.id).sort()).toEqual(['a', 'c']);
      expect(body.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 2, totalPages: 1 });
    });

    it('answers 400 for more than 100 usable ids', async () => {
      const many = Array.from({ length: 101 }, (_, i) => `i${i}`).join(',');
      const res = await raw(`?ids=${many}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts 100 ids and 4000 characters, rejects 4001 characters', async () => {
      const hundred = Array.from({ length: 100 }, (_, i) => `i${i}`).join(',');
      expect((await raw(`?ids=${hundred}`)).statusCode).toBe(200);
      const edge = 'a'.repeat(4000);
      expect((await raw(`?ids=${edge}`)).statusCode).toBe(200);
      const res = await raw(`?ids=${edge}a`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores blank ids', async () => {
      invoice('a');
      invoice('b');
      const body = await get('?ids=%20,,');
      expect(body.invoices).toHaveLength(2);
    });
  });

  it('returns the list-only row fields and listTotals', async () => {
    invoice('a', { amount: 250 });
    const body = await get();
    const row = body.invoices[0]!;
    expect(row).toMatchObject({
      id: 'a',
      deposits: [],
      openAmount: 250,
      paid: 0,
      remainingOnOffer: null,
      notYetSplit: true,
    });
    expect(body.listTotals).toEqual({
      openPayable: { count: 1, totalAmount: 250 },
      offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
    });
  });
});
