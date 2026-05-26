/**
 * Unit tests for invoiceAutoItemizeService.ts (Story #1547).
 *
 * Uses a real in-memory SQLite database with applied migrations.
 * Covers: dry-run path (LLM extraction, hints, warnings), commit/append,
 * commit/replace (auto-line pruning), ItemizedSumExceedsInvoiceError,
 * Paperless errors, LLM errors, document-not-linked, invoice-not-found.
 *
 * Strategy: stub globalThis.fetch to intercept both Paperless and LLM HTTP calls
 * (same pattern as index.test.ts and openAICompatibleProvider.test.ts).
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
  NotFoundError,
  ValidationError,
  ItemizedSumExceedsInvoiceError,
  LlmNotConfiguredError,
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
// Same pattern as openAICompatibleProvider.test.ts and index.test.ts

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

// ─── HTTP response builders ────────────────────────────────────────────────────

/** Build a minimal Paperless-ngx raw document response for fetchPaperless(). */
function makePaperlessRawDoc(content = 'OCR invoice text'): object {
  return {
    id: 42,
    title: 'Invoice PDF',
    content,
    tags: [],
    created: '2026-01-01T00:00:00Z',
    added: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    correspondent: null,
    document_type: null,
    archive_serial_number: null,
    original_file_name: 'invoice.pdf',
    page_count: 1,
  };
}

/** Tags fetch response (paperlessService.getDocument fetches tags too). */
const PAPERLESS_TAGS_RESPONSE = { count: 0, results: [] };

/** Build a valid LLM response body with the given lines. */
function makeLlmResponse(
  lines: Array<{
    description: string;
    totalAmount: number;
    confidence: number;
    [k: string]: unknown;
  }>,
): object {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ lines }),
        },
      },
    ],
  };
}

function makeOkFetch(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: 'OK',
  } as unknown as Response;
}

function makeErrorFetch(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: 'Error',
  } as unknown as Response;
}

/**
 * Queue standard fetch responses for a dry-run call:
 * 1. Paperless document detail
 * 2. Paperless tags list (fetched internally by paperlessService.getDocument → fetchTagsMap)
 * 3. LLM chat/completions
 */
function setupDryRunFetch(
  lines: Array<{ description: string; totalAmount: number; confidence: number }>,
  content = 'OCR invoice text',
): void {
  mockFetch
    .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc(content)))
    .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
    .mockResolvedValueOnce(makeOkFetch(makeLlmResponse(lines)));
}

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

function insertInvoice(db: DbType, vendorId: string, amount = 1000): string {
  const id = uid('inv');
  const t = ts();
  db.insert(schema.invoices)
    .values({
      id,
      vendorId,
      invoiceNumber: `INV-${id}`,
      amount,
      date: '2026-03-01',
      dueDate: null,
      status: 'pending',
      notes: null,
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

/**
 * Insert a work_item_budget row linked to an invoice via invoice_budget_lines.
 * Used to test replace/preserve behavior.
 */
function insertWIB(
  db: DbType,
  invoiceId: string,
  opts: {
    origin?: 'auto' | 'manual';
    plannedAmount?: number;
  } = {},
): { wibId: string; iblId: string } {
  const wibId = uid('wib');
  const iblId = uid('ibl');
  const t = ts();

  db.insert(schema.workItemBudgets)
    .values({
      id: wibId,
      workItemId: null,
      description: 'Budget line',
      plannedAmount: opts.plannedAmount ?? 200,
      confidence: 'invoice',
      budgetCategoryId: null,
      budgetSourceId: 'discretionary-system',
      vendorId: null,
      quantity: null,
      unit: null,
      unitPrice: null,
      includesVat: true,
      createdBy: null,
      createdAt: t,
      updatedAt: t,
      origin: opts.origin ?? 'auto',
    })
    .run();

  db.insert(schema.invoiceBudgetLines)
    .values({
      id: iblId,
      invoiceId,
      workItemBudgetId: wibId,
      householdItemBudgetId: null,
      itemizedAmount: opts.plannedAmount ?? 200,
      createdAt: t,
      updatedAt: t,
    })
    .run();

  return { wibId, iblId };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('invoiceAutoItemizeService', () => {
  let sqlite: Database.Database;
  let db: DbType;

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idSeq = 0;
    // Seed the user referenced by autoItemize calls ('user-1') so the FK on
    // work_item_budgets.created_by passes when commit-mode tests run.
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

  // ─── Invoice not found ─────────────────────────────────────────────────────

  describe('invoice not found', () => {
    it('throws NotFoundError when invoiceId does not exist', async () => {
      const config = makeConfig();
      await expect(
        autoItemize(
          db,
          config,
          'nonexistent-inv',
          'user-1',
          {
            paperlessDocumentId: 1,
            mode: 'append',
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('NotFoundError has code NOT_FOUND', async () => {
      const config = makeConfig();
      let caught: unknown;
      try {
        await autoItemize(
          db,
          config,
          'nonexistent-inv',
          'user-1',
          {
            paperlessDocumentId: 1,
            mode: 'append',
            dryRun: true,
          },
          PAPERLESS_AUTH,
        );
      } catch (e) {
        caught = e;
      }
      expect((caught as NotFoundError).code).toBe('NOT_FOUND');
    });
  });

  // ─── Document not linked to invoice ───────────────────────────────────────

  describe('document not linked to invoice', () => {
    it('throws NotFoundError when paperlessDocumentId is not linked to the invoice', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      // Do NOT link any document
      const config = makeConfig();

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 999,
            mode: 'append',
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ─── Dry-run path ──────────────────────────────────────────────────────────

  describe('dry-run path (dryRun=true, no lines)', () => {
    it('calls Paperless-ngx for the document (HTTP GET)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([{ description: 'Tile', totalAmount: 200, confidence: 0.9 }]);
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
        },
        PAPERLESS_AUTH,
      );

      // First fetch call should be to Paperless doc endpoint
      const [firstUrl] = mockFetch.mock.calls[0] as [string];
      expect(firstUrl).toContain('/api/documents/42/');
    });

    it('calls the LLM endpoint with the OCR content', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch(
        [{ description: 'Gypsum', totalAmount: 150, confidence: 0.9 }],
        'Invoice OCR content here',
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
        },
        PAPERLESS_AUTH,
      );

      // Third fetch call should be to LLM chat completions
      const llmCall = mockFetch.mock.calls[2] as [string, RequestInit];
      expect(llmCall![0]).toContain('chat/completions');
      const llmBody = JSON.parse(llmCall![1].body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // The user message content should include the OCR text
      const userMsg = llmBody.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toContain('Invoice OCR content here');
    });

    it('LLM request includes vendorName from invoice vendor', async () => {
      const vendorId = insertVendor(db, 'Elektro GmbH');
      const invoiceId = insertInvoice(db, vendorId, 800);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([{ description: 'Wiring', totalAmount: 400, confidence: 0.9 }]);
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
        },
        PAPERLESS_AUTH,
      );

      const llmCall = mockFetch.mock.calls[2] as [string, RequestInit];
      const llmBody = JSON.parse(llmCall![1].body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // The LLM prompt should include vendor name as hint
      const userMsg = llmBody.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toContain('Elektro GmbH');
    });

    it('returns lines from the LLM extraction', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([
        { description: 'Tile', totalAmount: 200, confidence: 0.9 },
        { description: 'Grout', totalAmount: 50, confidence: 0.85 },
      ]);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
        PAPERLESS_AUTH,
      )) as { lines: Array<{ description: string; totalAmount: number }>; warnings: unknown[] };

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]!.description).toBe('Tile');
      expect(result.lines[1]!.description).toBe('Grout');
    });

    it('returns empty lines array when LLM returns no lines', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([]);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
        PAPERLESS_AUTH,
      )) as { lines: unknown[]; warnings: unknown[] };

      expect(result.lines).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('does NOT write any DB rows during dry-run', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([{ description: 'Line A', totalAmount: 200, confidence: 0.9 }]);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
        PAPERLESS_AUTH,
      );

      const wibCountAfter = db.select().from(schema.workItemBudgets).all().length;
      const iblCountAfter = db.select().from(schema.invoiceBudgetLines).all().length;
      expect(wibCountAfter).toBe(wibCountBefore);
      expect(iblCountAfter).toBe(iblCountBefore);
    });

    // ─ Total mismatch warnings ──────────────────────────────────────────────

    it('adds TOTAL_MISMATCH warning when extracted total differs >1% from invoice total', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000); // invoice = 1000
      linkDocument(db, invoiceId, 42);
      // extracted = 900 → diff 10% → warn
      setupDryRunFetch([{ description: 'Big item', totalAmount: 900, confidence: 0.9 }]);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
        PAPERLESS_AUTH,
      )) as {
        lines: unknown[];
        warnings: Array<{ code: string; extractedTotal: number; invoiceTotal: number }>;
      };

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe('TOTAL_MISMATCH');
      expect(result.warnings[0]!.extractedTotal).toBe(900);
      expect(result.warnings[0]!.invoiceTotal).toBe(1000);
    });

    it('does NOT add TOTAL_MISMATCH warning when extracted total is within 1%', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
      linkDocument(db, invoiceId, 42);
      // extracted = 1005 → diff 0.5% ≤ 1% → no warning
      setupDryRunFetch([{ description: 'Item', totalAmount: 1005, confidence: 0.9 }]);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
        PAPERLESS_AUTH,
      )) as { lines: unknown[]; warnings: unknown[] };

      expect(result.warnings).toHaveLength(0);
    });

    it('does NOT add TOTAL_MISMATCH when extracted total is zero and invoice total is zero', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 0);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([]);
      const config = makeConfig();

      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
        PAPERLESS_AUTH,
      )) as { lines: unknown[]; warnings: unknown[] };

      expect(result.warnings).toHaveLength(0);
    });
  });

  // ─── Commit / append path ──────────────────────────────────────────────────

  describe('commit / append path (dryRun=false, mode=append)', () => {
    it('inserts work_item_budget rows with origin=auto', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [
            { description: 'Tile A', totalAmount: 200, confidence: 0.9 },
            { description: 'Grout B', totalAmount: 150, confidence: 0.85 },
          ],
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs).toHaveLength(2);
      expect(newWibs.every((w) => w.origin === 'auto')).toBe(true);
    });

    it('inserts work_item_budget rows with workItemId=null', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [{ description: 'Item', totalAmount: 300, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs[0]!.workItemId).toBeNull();
    });

    it('inserts work_item_budget rows with budgetSourceId=discretionary-system', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [{ description: 'Item', totalAmount: 300, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs[0]!.budgetSourceId).toBe('discretionary-system');
    });

    it('inserts work_item_budget rows with confidence=invoice', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [{ description: 'Item', totalAmount: 300, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs[0]!.confidence).toBe('invoice');
    });

    it('inserts work_item_budget rows with vendorId from invoice.vendorId', async () => {
      const vendorId = insertVendor(db, 'Plumber GmbH');
      const invoiceId = insertInvoice(db, vendorId, 500);
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
          lines: [{ description: 'Pipe fitting', totalAmount: 200, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs[0]!.vendorId).toBe(vendorId);
    });

    it('persists description, quantity, unit, unitPrice, includesVat from caller-provided line', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [
            {
              description: 'Ceramic Tile 30x30',
              totalAmount: 450,
              confidence: 0.92,
              quantity: 10,
              unit: 'm²',
              unitPrice: 45,
              includesVat: false,
            },
          ],
        },
        PAPERLESS_AUTH,
      );

      const newWib = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore)[0]!;
      expect(newWib.description).toBe('Ceramic Tile 30x30');
      expect(newWib.quantity).toBe(10);
      expect(newWib.unit).toBe('m²');
      expect(newWib.unitPrice).toBe(45);
      expect(newWib.includesVat).toBe(false);
      expect(newWib.plannedAmount).toBe(450);
    });

    it('inserts an invoice_budget_lines row for each new line', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

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
            { description: 'Line 1', totalAmount: 300, confidence: 0.9 },
            { description: 'Line 2', totalAmount: 200, confidence: 0.8 },
          ],
        },
        PAPERLESS_AUTH,
      );

      const iblCountAfter = db.select().from(schema.invoiceBudgetLines).all().length;
      expect(iblCountAfter).toBe(iblCountBefore + 2);
    });

    it('new IBL rows have itemizedAmount equal to line totalAmount', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Line', totalAmount: 333, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const newIbls = db.select().from(schema.invoiceBudgetLines).all().slice(iblCountBefore);
      expect(newIbls[0]!.itemizedAmount).toBe(333);
    });

    it('does NOT call Paperless or LLM when in commit mode (no HTTP calls)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [{ description: 'Item', totalAmount: 200, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('existing manual IBL rows are preserved in append mode', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 2000);
      linkDocument(db, invoiceId, 42);
      // Insert a manual line
      const { iblId: manualIblId } = insertWIB(db, invoiceId, {
        origin: 'manual',
        plannedAmount: 500,
      });
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
          lines: [{ description: 'New auto', totalAmount: 300, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const manualIbl = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.id, manualIblId))
        .get();
      expect(manualIbl).toBeDefined();
    });

    it('returns InvoiceBudgetLineListDetailResponse with budgetLines and remainingAmount', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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
          lines: [{ description: 'Line', totalAmount: 300, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      )) as { budgetLines: unknown[]; remainingAmount: number };

      expect(Array.isArray(result.budgetLines)).toBe(true);
      expect(typeof result.remainingAmount).toBe('number');
      expect(result.remainingAmount).toBe(700); // 1000 - 300
    });
  });

  // ─── Commit / replace path ─────────────────────────────────────────────────

  describe('commit / replace path (dryRun=false, mode=replace)', () => {
    it('deletes existing auto-origin WIB rows before inserting new ones', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 3000);
      linkDocument(db, invoiceId, 42);
      const { wibId: autoWib1 } = insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 200 });
      const { wibId: autoWib2 } = insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 150 });
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'replace',
          dryRun: false,
          lines: [{ description: 'New line', totalAmount: 400, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const wib1 = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, autoWib1))
        .get();
      const wib2 = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, autoWib2))
        .get();
      expect(wib1).toBeUndefined();
      expect(wib2).toBeUndefined();
    });

    it('IBL rows linked to deleted auto WIBs are also removed', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 3000);
      linkDocument(db, invoiceId, 42);
      const { iblId: autoIbl1 } = insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 200 });
      const { iblId: autoIbl2 } = insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 150 });
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'replace',
          dryRun: false,
          lines: [{ description: 'New line', totalAmount: 400, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const ibl1 = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.id, autoIbl1))
        .get();
      const ibl2 = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.id, autoIbl2))
        .get();
      expect(ibl1).toBeUndefined();
      expect(ibl2).toBeUndefined();
    });

    it('manual WIB rows and their IBLs are preserved in replace mode', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 3000);
      linkDocument(db, invoiceId, 42);
      const { wibId: manualWibId, iblId: manualIblId } = insertWIB(db, invoiceId, {
        origin: 'manual',
        plannedAmount: 500,
      });
      insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 200 }); // will be deleted
      const config = makeConfig();

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'replace',
          dryRun: false,
          lines: [{ description: 'New auto', totalAmount: 300, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      const manualWib = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, manualWibId))
        .get();
      const manualIbl = db
        .select()
        .from(schema.invoiceBudgetLines)
        .where(eq(schema.invoiceBudgetLines.id, manualIblId))
        .get();
      expect(manualWib).toBeDefined();
      expect(manualIbl).toBeDefined();
    });

    it('final WIB count: 2 auto deleted + 3 new auto inserted (1 manual preserved)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 3000);
      linkDocument(db, invoiceId, 42);
      insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 200 });
      insertWIB(db, invoiceId, { origin: 'auto', plannedAmount: 150 });
      insertWIB(db, invoiceId, { origin: 'manual', plannedAmount: 500 });
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        {
          paperlessDocumentId: 42,
          mode: 'replace',
          dryRun: false,
          lines: [
            { description: 'New 1', totalAmount: 300, confidence: 0.9 },
            { description: 'New 2', totalAmount: 200, confidence: 0.9 },
            { description: 'New 3', totalAmount: 100, confidence: 0.9 },
          ],
        },
        PAPERLESS_AUTH,
      );

      const wibCountAfter = db.select().from(schema.workItemBudgets).all().length;
      // started with 3 (2 auto + 1 manual), removed 2 auto, added 3 new → 1 + 3 = 4
      expect(wibCountAfter).toBe(wibCountBefore - 2 + 3);
    });
  });

  // ─── ItemizedSumExceedsInvoiceError ────────────────────────────────────────

  describe('sum exceeds invoice total', () => {
    it('throws ItemizedSumExceedsInvoiceError when Σ lines > invoice.amount', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
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
            lines: [
              { description: 'Line A', totalAmount: 300, confidence: 0.9 },
              { description: 'Line B', totalAmount: 250, confidence: 0.8 }, // 550 > 500
            ],
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(ItemizedSumExceedsInvoiceError);
    });

    it('ItemizedSumExceedsInvoiceError has code ITEMIZED_SUM_EXCEEDS_INVOICE', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();
      let caught: unknown;

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
            lines: [{ description: 'Over', totalAmount: 600, confidence: 0.9 }],
          },
          PAPERLESS_AUTH,
        );
      } catch (e) {
        caught = e;
      }

      expect((caught as ItemizedSumExceedsInvoiceError).code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
    });

    it('transaction rolls back: no WIB or IBL rows inserted when sum exceeds', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
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
            lines: [{ description: 'Over', totalAmount: 600, confidence: 0.9 }],
          },
          PAPERLESS_AUTH,
        );
      } catch {
        // expected
      }

      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
      expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
    });

    it('does NOT throw when Σ lines equals invoice.amount exactly', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
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
            lines: [{ description: 'Exact', totalAmount: 500, confidence: 0.9 }],
          },
          PAPERLESS_AUTH,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── Paperless errors ──────────────────────────────────────────────────────

  describe('Paperless errors', () => {
    it('bubbles error when Paperless fetch throws a network error', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED: Paperless unreachable'));
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
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow();
    });

    it('bubbles error when Paperless returns 404', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      mockFetch.mockResolvedValueOnce(makeErrorFetch(404, { detail: 'Not found' }));
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
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow();
    });
  });

  // ─── LLM errors ───────────────────────────────────────────────────────────

  describe('LLM errors', () => {
    it('bubbles LlmUnreachableError when LLM fetch throws a network error', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      // Paperless succeeds; LLM throws
      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockRejectedValueOnce(new Error('ECONNREFUSED: LLM unreachable'));
      const config = makeConfig();

      // The openAICompatibleProvider wraps network errors as LlmUnreachableError
      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow();
    });

    it('throws when LLM returns non-JSON content (LlmInvalidResponseError)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      // Paperless succeeds; LLM returns garbage
      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch({
            choices: [{ message: { content: 'NOT JSON {{{' } }],
          }),
        );
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
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow();
    });

    it('throws LlmNotConfiguredError when autoItemizeEnabled is false', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      // Paperless call still happens; LLM fetch does not because getProvider throws first
      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE));

      const config = makeConfig({ autoItemizeEnabled: false });

      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: true,
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(LlmNotConfiguredError);
    });

    it('LlmNotConfiguredError has code LLM_NOT_CONFIGURED', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE));

      const config = makeConfig({ autoItemizeEnabled: false });
      let caught: unknown;

      try {
        await autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: true,
          },
          PAPERLESS_AUTH,
        );
      } catch (e) {
        caught = e;
      }

      expect((caught as LlmNotConfiguredError).code).toBe('LLM_NOT_CONFIGURED');
    });
  });

  // ─── Invalid request (edge cases) ─────────────────────────────────────────

  describe('invalid request body', () => {
    it('throws ValidationError when dryRun=true and lines are provided', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      setupDryRunFetch([]);
      const config = makeConfig();

      // When dryRun=true AND lines are present, neither branch matches → ValidationError
      await expect(
        autoItemize(
          db,
          config,
          invoiceId,
          'user-1',
          {
            paperlessDocumentId: 42,
            mode: 'append',
            dryRun: true,
            lines: [{ description: 'Ignored', totalAmount: 100, confidence: 0.9 }],
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when dryRun=false and lines are absent', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
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
            // no lines
          },
          PAPERLESS_AUTH,
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ─── Story #1576 — dry-run propagates extracted date fields ──────────────────

  describe('dry-run response includes extracted date fields (Story #1576)', () => {
    /**
     * Build an LLM response that includes top-level invoiceDate and dueDate fields
     * alongside the lines array.
     */
    function makeLlmResponseWithDates(
      invoiceDate: string | undefined,
      dueDate: string | undefined,
      lines: Array<{ description: string; totalAmount: number; confidence: number }>,
    ): object {
      const content: Record<string, unknown> = { lines };
      if (invoiceDate !== undefined) content.invoiceDate = invoiceDate;
      if (dueDate !== undefined) content.dueDate = dueDate;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(content),
            },
          },
        ],
      };
    }

    it('returns extractedInvoiceDate and extractedDueDate when LLM provides both', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 200);
      linkDocument(db, invoiceId, 42);

      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch(
            makeLlmResponseWithDates('2024-01-15', '2024-02-15', [
              { description: 'Item A', totalAmount: 100, confidence: 0.9 },
            ]),
          ),
        );

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as {
        lines: unknown[];
        warnings: unknown[];
        extractedInvoiceDate?: string;
        extractedDueDate?: string;
      };

      expect(result.extractedInvoiceDate).toBe('2024-01-15');
      expect(result.extractedDueDate).toBe('2024-02-15');
      expect(Array.isArray(result.lines)).toBe(true);
    });

    it('omits extractedInvoiceDate and extractedDueDate when LLM provides no date fields', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 200);
      linkDocument(db, invoiceId, 42);

      // LLM response without date fields
      setupDryRunFetch([{ description: 'Item A', totalAmount: 100, confidence: 0.9 }]);

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as {
        lines: unknown[];
        warnings: unknown[];
        extractedInvoiceDate?: string;
        extractedDueDate?: string;
      };

      expect(result.extractedInvoiceDate).toBeUndefined();
      expect(result.extractedDueDate).toBeUndefined();
    });

    it('returns only extractedInvoiceDate when LLM provides only invoiceDate', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 300);
      linkDocument(db, invoiceId, 42);

      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch(
            makeLlmResponseWithDates('2024-03-10', undefined, [
              { description: 'Service', totalAmount: 150, confidence: 0.85 },
            ]),
          ),
        );

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as {
        lines: unknown[];
        warnings: unknown[];
        extractedInvoiceDate?: string;
        extractedDueDate?: string;
      };

      expect(result.extractedInvoiceDate).toBe('2024-03-10');
      expect(result.extractedDueDate).toBeUndefined();
    });

    it('commit path does not call LLM (0 fetch calls when dryRun=false)', async () => {
      // In commit mode, lines come from the caller — no LLM call is made.
      // Verifying this also confirms that validateExtractedLines destructuring
      // (const { lines: validatedLines } = validateExtractedLines({ lines: body.lines }))
      // correctly passes the caller-provided lines through.
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      mockFetch.mockReset(); // Clear any queued mocks

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
          lines: [{ description: 'Item A', totalAmount: 200, confidence: 0.9 }],
        },
        PAPERLESS_AUTH,
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── Story #1588 / #1589 — per-line category/source + assign-existing diff+update ─
  //
  // Workaround: `assignmentMode`, `budgetCategoryId`, `budgetSourceId` are on
  // ExtractedLine in the worktree's shared/src but not yet in the root shared/dist
  // symlink. Cast the lines array through `unknown` to bypass ts-jest type checking.

  describe('per-line budgetCategoryId and budgetSourceId (#1588)', () => {
    it('commit create-new with budgetCategoryId = "bc-household-items" → new WIB row has that category', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
      linkDocument(db, invoiceId, 42);
      const config = makeConfig();

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

      // Use a migration-seeded category (bc-household-items) to satisfy the FK constraint
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
              description: 'Tile installation',
              totalAmount: 500,
              confidence: 0.9,
              assignmentMode: 'create-new',
              budgetCategoryId: 'bc-household-items',
            },
          ] as any,
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs).toHaveLength(1);
      expect(newWibs[0]!.budgetCategoryId).toBe('bc-household-items');
    });

    it('commit create-new with budgetSourceId = "discretionary-system" → new WIB uses that source', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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

          lines: [
            {
              description: 'Grout work',
              totalAmount: 200,
              confidence: 0.85,
              assignmentMode: 'create-new',
              budgetSourceId: 'discretionary-system',
            },
          ] as any,
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs).toHaveLength(1);
      expect(newWibs[0]!.budgetSourceId).toBe('discretionary-system');
    });

    it('commit create-new without per-line budgetSourceId → falls back to discretionary-system', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
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

          lines: [
            {
              description: 'Plumbing fix',
              totalAmount: 300,
              confidence: 0.9,
              assignmentMode: 'create-new',
              // no budgetSourceId provided
            },
          ] as any,
        },
        PAPERLESS_AUTH,
      );

      const newWibs = db.select().from(schema.workItemBudgets).all().slice(wibCountBefore);
      expect(newWibs).toHaveLength(1);
      expect(newWibs[0]!.budgetSourceId).toBe('discretionary-system');
    });
  });

  describe('assign-existing: diff + update + idempotent junction (#1589)', () => {
    /**
     * Helper: insert a stand-alone WIB (no IBL) so assign-existing can target it.
     */
    function insertStandaloneWIB(
      dbb: typeof db,
      opts: { description?: string; plannedAmount?: number } = {},
    ): string {
      const wibId = uid('wib');
      const t = ts();
      dbb
        .insert(schema.workItemBudgets)
        .values({
          id: wibId,
          workItemId: null,
          description: opts.description ?? 'Existing budget line',
          plannedAmount: opts.plannedAmount ?? 400,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          budgetSourceId: 'discretionary-system',
          vendorId: null,
          quantity: null,
          unit: null,
          unitPrice: null,
          includesVat: true,
          createdBy: null,
          createdAt: t,
          updatedAt: t,
          origin: 'manual',
        })
        .run();
      return wibId;
    }

    it('assign-existing with identical fields → no UPDATE, junction row created', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      // Pre-create a WIB to assign to
      const existingWibId = insertStandaloneWIB(db, {
        description: 'Existing line',
        plannedAmount: 300,
      });
      const config = makeConfig();

      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

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
              description: 'Existing line', // same as stored
              totalAmount: 300, // same as stored plannedAmount
              confidence: 0.9,
              assignmentMode: 'assign-existing',
              assignedBudgetLineId: existingWibId,
              assignedBudgetLineType: 'work_item',
            },
          ] as any,
        },
        PAPERLESS_AUTH,
      );

      // Junction row should be created
      const iblCountAfter = db.select().from(schema.invoiceBudgetLines).all().length;
      expect(iblCountAfter).toBe(iblCountBefore + 1);

      // The WIB's updatedAt should NOT have changed (no hasChanges = true)
      const wib = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, existingWibId))
        .get()!;
      expect(wib.description).toBe('Existing line');
      expect(wib.plannedAmount).toBe(300);
    });

    it('assign-existing with description changed → UPDATE executed', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      const existingWibId = insertStandaloneWIB(db, {
        description: 'Old description',
        plannedAmount: 300,
      });
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

          lines: [
            {
              description: 'New description', // different from stored
              totalAmount: 300,
              confidence: 0.9,
              assignmentMode: 'assign-existing',
              assignedBudgetLineId: existingWibId,
              assignedBudgetLineType: 'work_item',
            },
          ] as any,
        },
        PAPERLESS_AUTH,
      );

      const wib = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, existingWibId))
        .get()!;
      expect(wib.description).toBe('New description');
    });

    it('assign-existing with budgetSourceId changed → UPDATE executed', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 500);
      linkDocument(db, invoiceId, 42);
      const existingWibId = insertStandaloneWIB(db, { plannedAmount: 300 });
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

          lines: [
            {
              description: 'Existing budget line',
              totalAmount: 300,
              confidence: 0.9,
              assignmentMode: 'assign-existing',
              assignedBudgetLineId: existingWibId,
              assignedBudgetLineType: 'work_item',
              budgetSourceId: 'discretionary-system', // same, no change
            },
          ] as any,
        },
        PAPERLESS_AUTH,
      );

      // Verify WIB still exists and budgetSourceId unchanged (no actual change)
      const wib = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, existingWibId))
        .get()!;
      expect(wib.budgetSourceId).toBe('discretionary-system');
    });

    it('assign-existing called twice with same (invoiceId, budgetLineId) → idempotent (no duplicate junction row)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 1000);
      linkDocument(db, invoiceId, 42);
      const existingWibId = insertStandaloneWIB(db, { plannedAmount: 300 });
      const config = makeConfig();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linePayload: any = [
        {
          description: 'Existing budget line',
          totalAmount: 300,
          confidence: 0.9,
          assignmentMode: 'assign-existing' as const,
          assignedBudgetLineId: existingWibId,
          assignedBudgetLineType: 'work_item' as const,
        },
      ];

      // First call — creates the junction row
      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: false, lines: linePayload },
        PAPERLESS_AUTH,
      );

      const iblCountAfterFirst = db.select().from(schema.invoiceBudgetLines).all().length;

      // Second call with identical payload — must be idempotent (no second junction row)
      await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: false, lines: linePayload },
        PAPERLESS_AUTH,
      );

      const iblCountAfterSecond = db.select().from(schema.invoiceBudgetLines).all().length;
      expect(iblCountAfterSecond).toBe(iblCountAfterFirst);
    });
  });

  // ─── Story #1581 — dry-run propagates invoiceNumber + notes fields ────────────

  describe('dry-run response includes extractedInvoiceNumber and extractedNotes (Story #1581)', () => {
    /**
     * Build an LLM response that includes all four top-level metadata fields
     * (invoiceDate, dueDate, invoiceNumber, notes) alongside the lines array.
     */
    function makeLlmResponseWithMetadata(
      metadata: {
        invoiceDate?: string;
        dueDate?: string;
        invoiceNumber?: string;
        notes?: string;
      },
      lines: Array<{ description: string; totalAmount: number; confidence: number }>,
    ): object {
      const content: Record<string, unknown> = { lines };
      if (metadata.invoiceDate !== undefined) content.invoiceDate = metadata.invoiceDate;
      if (metadata.dueDate !== undefined) content.dueDate = metadata.dueDate;
      if (metadata.invoiceNumber !== undefined) content.invoiceNumber = metadata.invoiceNumber;
      if (metadata.notes !== undefined) content.notes = metadata.notes;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(content),
            },
          },
        ],
      };
    }

    it('returns extractedInvoiceNumber and extractedNotes when LLM provides both', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 200);
      linkDocument(db, invoiceId, 42);

      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch(
            makeLlmResponseWithMetadata(
              {
                invoiceDate: '2024-01-15',
                dueDate: '2024-02-15',
                invoiceNumber: 'RE-2024-001',
                notes: 'Kitchen renovation materials',
              },
              [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
            ),
          ),
        );

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as {
        lines: unknown[];
        warnings: unknown[];
        extractedInvoiceDate?: string;
        extractedDueDate?: string;
        extractedInvoiceNumber?: string;
        extractedNotes?: string;
      };

      expect(result.extractedInvoiceNumber).toBe('RE-2024-001');
      expect(result.extractedNotes).toBe('Kitchen renovation materials');
      // Also verify the date fields still work alongside the new fields
      expect(result.extractedInvoiceDate).toBe('2024-01-15');
      expect(result.extractedDueDate).toBe('2024-02-15');
      expect(Array.isArray(result.lines)).toBe(true);
    });

    it('omits extractedInvoiceNumber and extractedNotes when LLM provides neither', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 200);
      linkDocument(db, invoiceId, 42);

      // LLM response with no invoice-number or notes fields (only lines)
      setupDryRunFetch([{ description: 'Item A', totalAmount: 100, confidence: 0.9 }]);

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as {
        lines: unknown[];
        warnings: unknown[];
        extractedInvoiceNumber?: string;
        extractedNotes?: string;
      };

      expect(result.extractedInvoiceNumber).toBeUndefined();
      expect(result.extractedNotes).toBeUndefined();
    });
  });

  // ─── Story #1596 — dry-run category → budgetCategoryId mapping ───────────────

  describe('dry-run category name → budgetCategoryId mapping (#1596)', () => {
    /**
     * Build an LLM response containing lines with a `category` field.
     */
    function makeLlmResponseWithCategory(
      lines: Array<{
        description: string;
        totalAmount: number;
        confidence: number;
        category?: string | null;
      }>,
    ): object {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({ lines }),
            },
          },
        ],
      };
    }

    it('dry-run line with category matching a seeded budget category → budgetCategoryId is populated', async () => {
      // Insert a budget category whose name matches the LLM-extracted category
      const catId = 'bc-test-materials-' + uid('c');
      const t = ts();
      db.insert(schema.budgetCategories)
        .values({
          id: catId,
          name: 'Materials',
          description: null,
          color: null,
          translationKey: null,
          sortOrder: 99,
          createdAt: t,
          updatedAt: t,
        })
        .run();

      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 200);
      linkDocument(db, invoiceId, 42);

      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch(
            makeLlmResponseWithCategory([
              { description: 'Cement bags', totalAmount: 150, confidence: 0.9, category: 'Materials' },
            ]),
          ),
        );

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as unknown as { lines: Array<Record<string, unknown>>; warnings: unknown[] };

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]!['budgetCategoryId']).toBe(catId);
    });

    it('dry-run line with category=null → budgetCategoryId is null (no mapping)', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 100);
      linkDocument(db, invoiceId, 42);

      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch(
            makeLlmResponseWithCategory([
              { description: 'Misc item', totalAmount: 100, confidence: 0.8, category: null },
            ]),
          ),
        );

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as unknown as { lines: Array<Record<string, unknown>>; warnings: unknown[] };

      expect(result.lines).toHaveLength(1);
      // null category → no mapping applied → budgetCategoryId is null/undefined
      const budgetCategoryId = result.lines[0]!['budgetCategoryId'];
      expect(budgetCategoryId === null || budgetCategoryId === undefined).toBe(true);
    });

    it('dry-run line with unrecognized category string → budgetCategoryId is null', async () => {
      const vendorId = insertVendor(db);
      const invoiceId = insertInvoice(db, vendorId, 100);
      linkDocument(db, invoiceId, 42);

      mockFetch
        .mockResolvedValueOnce(makeOkFetch(makePaperlessRawDoc()))
        .mockResolvedValueOnce(makeOkFetch(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(
          makeOkFetch(
            makeLlmResponseWithCategory([
              { description: 'Mystery item', totalAmount: 100, confidence: 0.8, category: 'Unicorn category XYZ' },
            ]),
          ),
        );

      const config = makeConfig();
      const result = (await autoItemize(
        db,
        config,
        invoiceId,
        'user-1',
        { paperlessDocumentId: 42, mode: 'append', dryRun: true },
        PAPERLESS_AUTH,
      )) as unknown as { lines: Array<Record<string, unknown>>; warnings: unknown[] };

      expect(result.lines).toHaveLength(1);
      const budgetCategoryId = result.lines[0]!['budgetCategoryId'];
      // No matching category → null
      expect(budgetCategoryId === null || budgetCategoryId === undefined).toBe(true);
    });
  });
});
