import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { InvoiceListPaginatedResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('GET /api/invoices chipCounts (EPIC-21 P4.2)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let seq = 0;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-invoice-chips-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    seq = 0;
    const user = await userService.createLocalUser(
      app.db,
      'u@test.com',
      'User',
      'password',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  function stamp(): string {
    return new Date(Date.UTC(2026, 0, 1, 0, 0, seq++)).toISOString();
  }

  function vendor(name: string): string {
    const id = `vendor-${seq}`;
    app.db
      .insert(schema.vendors)
      .values({ id, name, createdAt: stamp(), updatedAt: stamp() })
      .run();
    return id;
  }

  function invoice(
    vendorId: string,
    status: 'pending' | 'paid' | 'claimed' | 'quotation',
    number: string,
  ): string {
    const id = `invoice-${seq}`;
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: number,
        amount: 1000,
        date: '2026-01-15',
        status,
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      .run();
    return id;
  }

  function deposit(invoiceId: string, entryType: 'deposit' | 'refund' = 'deposit'): void {
    app.db
      .insert(schema.invoiceDeposits)
      .values({
        id: `dep-${seq}`,
        invoiceId,
        amount: 100,
        dueDate: '2026-02-01',
        status: 'pending',
        entryType,
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      .run();
  }

  async function get(qs = ''): Promise<InvoiceListPaginatedResponse> {
    const res = await app.inject({ method: 'GET', url: `/api/invoices${qs}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return res.json<InvoiceListPaginatedResponse>();
  }

  it('is always present, all zero on an empty database', async () => {
    const body = await get();
    expect(body.chipCounts).toEqual({
      matching: { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 },
      outsideToPay: { offers: 0, paid: 0, submitted: 0, all: 0 },
      totals: { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 },
    });
  });

  describe('with a mixed set', () => {
    beforeEach(() => {
      const a = vendor('Alpha Works');
      const b = vendor('Beta Build');
      invoice(a, 'pending', 'A-1');
      deposit(invoice(a, 'quotation', 'A-2')); // offer with a progress payment
      invoice(a, 'quotation', 'A-3');
      deposit(invoice(b, 'paid', 'B-1'), 'refund'); // pending refund
      invoice(b, 'paid', 'B-2');
      invoice(b, 'claimed', 'B-3');
    });

    it('returns overlapping chip counts', async () => {
      const { chipCounts } = await get();
      expect(chipCounts.totals).toEqual({ toPay: 3, offers: 2, paid: 2, submitted: 1, all: 6 });
      expect(chipCounts.matching).toEqual(chipCounts.totals);
      expect(chipCounts.outsideToPay).toEqual({ offers: 1, paid: 1, submitted: 1, all: 3 });
    });

    it('q narrows matching but not totals', async () => {
      const { chipCounts } = await get('?q=beta');
      expect(chipCounts.matching).toEqual({ toPay: 1, offers: 0, paid: 2, submitted: 1, all: 3 });
      expect(chipCounts.totals.all).toBe(6);
    });

    it('status and openOnly change rows, not chipCounts', async () => {
      const base = (await get('?q=alpha')).chipCounts;
      const paid = await get('?q=alpha&status=paid');
      const open = await get('?q=alpha&openOnly=true');
      expect(paid.invoices).toHaveLength(0);
      expect(open.invoices).toHaveLength(2);
      expect(paid.chipCounts).toEqual(base);
      expect(open.chipCounts).toEqual(base);
    });

    it('totals are identical for any query string', async () => {
      const plain = (await get()).chipCounts.totals;
      expect((await get('?q=zzz&amountMin=1')).chipCounts.totals).toEqual(plain);
    });

    it('rejects an unauthenticated request', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/invoices' });
      expect(res.statusCode).toBe(401);
    });
  });
});
