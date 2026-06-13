/**
 * Unit tests for invoiceAutoItemizeService.ts — invoicePatch extension (Story #1564).
 *
 * Tests: patch-only commit, patch+lines commit, rollback on sum-check failure,
 * patch validation failure, dry-run ignores patch, all patchable fields, field isolation.
 *
 * Follows the same in-memory SQLite DB pattern as invoiceAutoItemizeService.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { autoItemize } from './invoiceAutoItemizeService.js';
import {
  ItemizedSumExceedsInvoiceError,
  ValidationError,
  NotFoundError,
} from '../errors/AppError.js';
import type { AppConfig } from '../plugins/config.js';

// ─── DB & helpers ──────────────────────────────────────────────────────────────

type DbType = BetterSQLite3Database<typeof schema>;

function createTestDb(): { sqlite: Database.Database; db: DbType } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

let idSeq = 0;
function uid(prefix: string): string {
  return `${prefix}-${++idSeq}`;
}
function ts(): string {
  return new Date(Date.now() + idSeq).toISOString();
}

// ─── fetch mock setup ──────────────────────────────────────────────────────────

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

// ─── Config factory ────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: ':memory:',
    logLevel: 'error',
    nodeEnv: 'test',
    sessionDuration: 3600,
    secureCookies: false,
    trustProxy: false,
    oidcEnabled: false,
    paperlessUrl: 'http://paperless.test.local',
    paperlessExternalUrl: undefined,
    paperlessApiToken: 'test-paperless-token',
    paperlessFilterTag: undefined,
    paperlessEnabled: true,
    externalUrl: undefined,
    photoStoragePath: '/tmp/photos',
    photoMaxFileSizeMb: 20,
    diaryAutoEvents: false,
    diaryDraftRetentionDays: 30,
    currency: 'EUR',
    backupDir: '/backups',
    backupEnabled: false,
    llmBaseUrl: 'http://llm.test.local',
    llmApiKey: 'llm-key',
    llmModel: 'gpt-4o',
    llmRequestTimeoutMs: 5000,
    llmMaxTokens: 16384,
    llmProvider: 'openai',
    autoItemizeEnabled: true,
    ...overrides,
  };
}

const PAPERLESS_AUTH = { url: 'http://paperless.test.local', apiToken: 'test-paperless-token' };

// ─── Seed helpers ──────────────────────────────────────────────────────────────

function insertVendor(db: DbType, name = 'Test Vendor'): string {
  const id = uid('vendor');
  const t = ts();
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
      createdAt: t,
      updatedAt: t,
    })
    .run();
  return id;
}

function insertInvoice(
  db: DbType,
  vendorId: string,
  opts: {
    amount?: number;
    invoiceNumber?: string | null;
    date?: string;
    dueDate?: string | null;
    notes?: string | null;
  } = {},
): string {
  const id = uid('inv');
  const t = ts();
  db.insert(schema.invoices)
    .values({
      id,
      vendorId,
      invoiceNumber: opts.invoiceNumber ?? `INV-${id}`,
      amount: opts.amount ?? 1000,
      date: opts.date ?? '2026-03-01',
      dueDate: opts.dueDate ?? null,
      status: 'pending',
      notes: opts.notes ?? null,
      createdBy: null,
      createdAt: t,
      updatedAt: t,
    })
    .run();
  return id;
}

function linkDocument(db: DbType, invoiceId: string, paperlessDocumentId: number): void {
  const id = uid('dl');
  const t = ts();
  db.insert(schema.documentLinks)
    .values({
      id,
      entityType: 'invoice',
      entityId: invoiceId,
      paperlessDocumentId,
      createdBy: null,
      createdAt: t,
    })
    .run();
}

function insertWorkItem(db: DbType): string {
  const id = uid('wi');
  const t = ts();
  db.insert(schema.workItems)
    .values({
      id,
      title: 'Test Work Item',
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
      createdAt: t,
      updatedAt: t,
    })
    .run();
  return id;
}

function insertWorkItemBudget(db: DbType, opts: { workItemId?: string | null } = {}): string {
  const id = uid('wib');
  const t = ts();
  db.insert(schema.workItemBudgets)
    .values({
      id,
      workItemId: opts.workItemId ?? null,
      description: 'WIB for assignment test',
      plannedAmount: 500,
      confidence: 'own_estimate',
      budgetCategoryId: null,
      budgetSourceId: 'discretionary-system',
      vendorId: null,
      quantity: null,
      unit: null,
      unitPrice: null,
      includesVat: true,
      createdBy: 'user-1',
      createdAt: t,
      updatedAt: t,
      origin: 'manual',
    })
    .run();
  return id;
}

function insertHouseholdItem(db: DbType): string {
  const id = uid('hi');
  const t = ts();
  db.insert(schema.householdItems)
    .values({
      id,
      name: 'Test Household Item',
      description: null,
      categoryId: 'hic-furniture',
      status: 'planned',
      vendorId: null,
      areaId: null,
      url: null,
      quantity: 1,
      orderDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      targetDeliveryDate: null,
      isLate: false,
      createdBy: null,
      createdAt: t,
      updatedAt: t,
    })
    .run();
  return id;
}

function insertHouseholdItemBudget(db: DbType, householdItemId: string): string {
  const id = uid('hib');
  const t = ts();
  db.insert(schema.householdItemBudgets)
    .values({
      id,
      householdItemId,
      description: 'HIB for assignment test',
      plannedAmount: 400,
      confidence: 'own_estimate',
      budgetCategoryId: null,
      budgetSourceId: 'discretionary-system',
      vendorId: null,
      quantity: null,
      unit: null,
      unitPrice: null,
      includesVat: true,
      createdBy: 'user-1',
      createdAt: t,
      updatedAt: t,
      origin: 'manual',
    })
    .run();
  return id;
}

function getInvoice(db: DbType, invoiceId: string) {
  return db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).get();
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('invoiceAutoItemizeService — invoicePatch extension', () => {
  let sqlite: Database.Database;
  let db: DbType;

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idSeq = 0;

    // Seed user referenced by autoItemize calls
    const userT = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: null,
        oidcSubject: null,
        deactivatedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        davToken: null,
        createdAt: userT,
        updatedAt: userT,
      })
      .run();

    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    sqlite.close();
    globalThis.fetch = originalFetch;
  });

  // ─── Patch-only (no lines) ─────────────────────────────────────────────────

  describe('commit with invoicePatch only (no lines)', () => {
    it('updates invoice amount in DB when invoicePatch.amount is provided with empty lines', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { amount: 999.99 },
        },
        PAPERLESS_AUTH,
      );

      const inv = getInvoice(db, invoiceId);
      expect(inv?.amount).toBe(999.99);
    });

    it('returns empty budgetLines array when lines is empty', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { amount: 999.99 },
        },
        PAPERLESS_AUTH,
      )) as { budgetLines: unknown[] };

      expect(result.budgetLines).toHaveLength(0);
    });

    it('commits the transaction (patch visible after call)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 100, notes: null });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { notes: 'patched note' },
        },
        PAPERLESS_AUTH,
      );

      const inv = getInvoice(db, invoiceId);
      expect(inv?.notes).toBe('patched note');
    });
  });

  // ─── Patch + lines ─────────────────────────────────────────────────────────

  describe('commit with invoicePatch + lines', () => {
    it('updates invoice notes AND creates budget line in same transaction', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000, notes: null });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Tile', totalAmount: 300, confidence: 0.9 }],
          invoicePatch: { notes: 'auto-itemized' },
        },
        PAPERLESS_AUTH,
      );

      // Patch applied
      const inv = getInvoice(db, invoiceId);
      expect(inv?.notes).toBe('auto-itemized');

      // Budget line created
      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs).toHaveLength(1);
    });

    it('response contains the new budget line after patch+lines commit', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Grout', totalAmount: 200, confidence: 0.85 }],
          invoicePatch: { notes: 'patched' },
        },
        PAPERLESS_AUTH,
      )) as { budgetLines: Array<{ budgetLineDescription: string }> };

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]!.budgetLineDescription).toBe('Grout');
    });
  });

  // ─── Sum-check uses post-patch amount ─────────────────────────────────────

  describe('sum check against patched amount', () => {
    it('throws ItemizedSumExceedsInvoiceError when lines exceed patched invoice amount', async () => {
      const vendorId = insertVendor(db);
      // Original amount is 1000 (lines would fit), but patch reduces to 100
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [{ description: 'Expensive', totalAmount: 200, confidence: 0.9 }],
            invoicePatch: { amount: 100 }, // patching down to 100, lines = 200 → exceeds
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(ItemizedSumExceedsInvoiceError);
    });

    it('rolls back invoice amount when sum check fails (post-patch)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      try {
        await autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [{ description: 'Over', totalAmount: 200, confidence: 0.9 }],
            invoicePatch: { amount: 100 }, // 200 > 100 → rollback
          },
          PAPERLESS_AUTH,
        );
      } catch {
        // expected
      }

      // Invoice should still have the original amount (transaction rolled back)
      const inv = getInvoice(db, invoiceId);
      expect(inv?.amount).toBe(1000);
    });

    it('does NOT create budget lines when sum exceeds patched amount (transaction rolled back)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

      try {
        await autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [{ description: 'Over', totalAmount: 200, confidence: 0.9 }],
            invoicePatch: { amount: 100 },
          },
          PAPERLESS_AUTH,
        );
      } catch {
        // expected
      }

      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
      expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
    });

    it('allows lines when they exactly equal the patched amount', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [{ description: 'Exact', totalAmount: 300, confidence: 0.9 }],
            invoicePatch: { amount: 300 }, // patch to 300, lines = 300 → OK
          },
          PAPERLESS_AUTH,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── Patch validation failures ─────────────────────────────────────────────

  describe('invoicePatch validation failures', () => {
    it('throws ValidationError when invoicePatch.amount is negative', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [],
            invoicePatch: { amount: -1 },
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('does NOT update invoice when patch amount is invalid (invoice unchanged)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      try {
        await autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [],
            invoicePatch: { amount: -1 },
          },
          PAPERLESS_AUTH,
        );
      } catch {
        // expected
      }

      const inv = getInvoice(db, invoiceId);
      expect(inv?.amount).toBe(500);
    });

    it('does NOT create budget lines when patch is invalid', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

      try {
        await autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [{ description: 'Line', totalAmount: 100, confidence: 0.9 }],
            invoicePatch: { amount: -1 },
          },
          PAPERLESS_AUTH,
        );
      } catch {
        // expected
      }

      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
    });
  });

  // ─── Dry-run ignores invoicePatch ─────────────────────────────────────────

  describe('dry-run ignores invoicePatch', () => {
    it('does NOT update invoice when dryRun=true even if invoicePatch is provided', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 500 });
      linkDocument(db, invoiceId, 42);

      // Mock LLM + Paperless fetch for dry-run
      const PAPERLESS_TAGS_RESPONSE = { count: 0, results: [] };
      const makeOkFetch = (body: unknown): Response =>
        ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(JSON.stringify(body)),
          statusText: 'OK',
        }) as unknown as Response;

      mockFetch
        .mockResolvedValueOnce(
          makeOkFetch({
            id: 42,
            title: 'Invoice',
            content: 'OCR text',
            tags: [],
            created: '2026-01-01T00:00:00Z',
            added: '2026-01-01T00:00:00Z',
            modified: '2026-01-01T00:00:00Z',
            correspondent: null,
            document_type: null,
            archive_serial_number: null,
            original_file_name: 'invoice.pdf',
            page_count: 1,
          }),
        )
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch({
            choices: [{ message: { content: JSON.stringify({ lines: [] }) } }],
          }),
        );

      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
          // no lines — dry-run mode
          invoicePatch: { amount: 1 }, // should be ignored
        },
        PAPERLESS_AUTH,
      );

      const inv = getInvoice(db, invoiceId);
      expect(inv?.amount).toBe(500); // unchanged
    });
  });

  // ─── All patchable fields ──────────────────────────────────────────────────

  describe('invoicePatch with all patchable fields', () => {
    it('updates all patchable fields in one commit', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, {
        amount: 100,
        invoiceNumber: 'OLD-001',
        date: '2026-01-01',
        dueDate: null,
        notes: null,
      });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Item', totalAmount: 500, confidence: 0.9 }],
          invoicePatch: {
            invoiceNumber: 'NEW-001',
            amount: 500,
            date: '2026-01-10',
            dueDate: '2026-02-10',
            notes: 'updated',
          },
        },
        PAPERLESS_AUTH,
      );

      const inv = getInvoice(db, invoiceId);
      expect(inv?.invoiceNumber).toBe('NEW-001');
      expect(inv?.amount).toBe(500);
      expect(inv?.date).toBe('2026-01-10');
      expect(inv?.dueDate).toBe('2026-02-10');
      expect(inv?.notes).toBe('updated');
    });
  });

  // ─── Field isolation ──────────────────────────────────────────────────────

  describe('invoicePatch field isolation', () => {
    it('only updates notes when only notes is in the patch', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, {
        amount: 400,
        invoiceNumber: 'ORIG-001',
        date: '2026-01-01',
        dueDate: '2026-02-01',
        notes: null,
      });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { notes: 'only notes changed' },
        },
        PAPERLESS_AUTH,
      );

      const inv = getInvoice(db, invoiceId);
      expect(inv?.notes).toBe('only notes changed');
      // Other fields should be unchanged
      expect(inv?.amount).toBe(400);
      expect(inv?.invoiceNumber).toBe('ORIG-001');
      expect(inv?.date).toBe('2026-01-01');
      expect(inv?.dueDate).toBe('2026-02-01');
    });

    it('without invoicePatch, invoice fields are not modified', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, {
        amount: 600,
        invoiceNumber: 'NO-PATCH',
        date: '2026-01-01',
        notes: 'original notes',
      });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Line', totalAmount: 100, confidence: 0.9 }],
          // no invoicePatch
        },
        PAPERLESS_AUTH,
      );

      const inv = getInvoice(db, invoiceId);
      expect(inv?.amount).toBe(600);
      expect(inv?.invoiceNumber).toBe('NO-PATCH');
      expect(inv?.notes).toBe('original notes');
    });
  });

  // ─── assignedBudgetLineId branch (Story #1564 Round 1) ────────────────────

  describe('assignedBudgetLineId branch', () => {
    it('valid work_item assignment: creates IBL junction row, no new WIB created', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const workItemId = insertWorkItem(db);
      const wibId = insertWorkItemBudget(db, { workItemId });
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Tiles',
              totalAmount: 100,
              confidence: 0.9,
              assignedBudgetLineId: wibId,
              assignedBudgetLineType: 'work_item',
            },
          ],
        },
        PAPERLESS_AUTH,
      );

      // No new WIB created
      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);

      // A new IBL row was inserted pointing to the existing WIB
      const ibls = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.invoiceId, invoiceId))
        .all();
      expect(ibls).toHaveLength(1);
      expect(ibls[0]!.workItemBudgetId).toBe(wibId);
      expect(ibls[0]!.itemizedAmount).toBe(100);
    });

    it('valid household_item assignment: creates IBL junction row against householdItemBudgetId', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const hiId = insertHouseholdItem(db);
      const hibId = insertHouseholdItemBudget(db, hiId);
      const config = makeConfig();

      const hibCountBefore = db.select().from(schema.householdItemBudgets).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Sofa',
              totalAmount: 200,
              confidence: 0.85,
              assignedBudgetLineId: hibId,
              assignedBudgetLineType: 'household_item',
            },
          ],
        },
        PAPERLESS_AUTH,
      );

      // No new HIB created
      expect(db.select().from(schema.householdItemBudgets).all().length).toBe(hibCountBefore);

      // A new IBL row pointing to the HIB was inserted
      const ibls = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.invoiceId, invoiceId))
        .all();
      expect(ibls).toHaveLength(1);
      expect(ibls[0]!.householdItemBudgetId).toBe(hibId);
      expect(ibls[0]!.itemizedAmount).toBe(200);
    });

    it('throws ValidationError when assignedBudgetLineId is given but assignedBudgetLineType is missing', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [
              {
                description: 'Orphan',
                totalAmount: 100,
                confidence: 0.9,
                assignedBudgetLineId: 'some-id',
                // intentionally omit assignedBudgetLineType
              },
            ],
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(ValidationError);

      // No DB writes
      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
      expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
    });

    it('throws NotFoundError when assignedBudgetLineId does not exist in work_item_budgets', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: false,
            lines: [
              {
                description: 'Ghost',
                totalAmount: 100,
                confidence: 0.9,
                assignedBudgetLineId: 'non-existent-wib-id',
                assignedBudgetLineType: 'work_item',
              },
            ],
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(NotFoundError);

      // No DB writes
      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
      expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
    });

    it('mixed: one assigned line + one auto-created line in a single request', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, { amount: 1000 });
      linkDocument(db, invoiceId, 42);
      const workItemId = insertWorkItem(db);
      const wibId = insertWorkItemBudget(db, { workItemId });
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            // Line 1: assigned to existing WIB
            {
              description: 'Assigned tile',
              totalAmount: 300,
              confidence: 0.9,
              assignedBudgetLineId: wibId,
              assignedBudgetLineType: 'work_item',
            },
            // Line 2: auto-created
            {
              description: 'Auto grout',
              totalAmount: 200,
              confidence: 0.8,
            },
          ],
        },
        PAPERLESS_AUTH,
      );

      // Exactly one new WIB was auto-created (for line 2)
      const newWibCount = db.select().from(schema.workItemBudgets).all().length;
      expect(newWibCount).toBe(wibCountBefore + 1);

      // The auto-created WIB has origin='auto'
      const allWibs = db.select().from(schema.workItemBudgets).all();
      const autoWib = allWibs.find((w) => w.origin === 'auto');
      expect(autoWib).toBeDefined();
      expect(autoWib!.description).toBe('Auto grout');

      // Two IBL rows pointing to this invoice
      const ibls = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.invoiceId, invoiceId))
        .all();
      expect(ibls).toHaveLength(2);

      // One IBL references the pre-existing WIB
      const assignedIbl = ibls.find((r) => r.workItemBudgetId === wibId);
      expect(assignedIbl).toBeDefined();
      expect(assignedIbl!.itemizedAmount).toBe(300);

      // The other IBL references the newly auto-created WIB
      const autoIbl = ibls.find((r) => r.workItemBudgetId !== wibId);
      expect(autoIbl).toBeDefined();
      expect(autoIbl!.itemizedAmount).toBe(200);
    });
  });
});
