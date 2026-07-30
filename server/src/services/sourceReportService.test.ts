/**
 * Unit tests for sourceReportService.ts
 *
 * Story #1878 — Source report backend: report data, mark-claimed & Paperless upload proxy
 *
 * Covers:
 * - getSourceReport: status-slice selection per report type, split-invoice detection,
 *   drop-on-zero / refund-adjustment classification, document stage tagging, Paperless
 *   ASN/title resolution (reachable / throws / unconfigured), unallocated invoices,
 *   totalAmount rounding.
 * - markInvoicesClaimed: transactional batch claim of invoices + deposits, claimability
 *   rules, 409 rollback-on-any-offending, diary event side effects.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getSourceReport, markInvoicesClaimed } from './sourceReportService.js';
import { NotFoundError, ValidationError, InvoicesNotClaimableError } from '../errors/AppError.js';

// ─── Paperless mocking (mirrors documentLinkService.test.ts / paperlessService.test.ts) ──

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
  } as unknown as Response;
}

const RAW_TAGS_RESPONSE = { count: 0, results: [] };

const PAPERLESS_DISABLED = { paperlessEnabled: false } as const;

const PAPERLESS_CONFIG_ENABLED = {
  paperlessEnabled: true,
  paperlessUrl: 'http://paperless:8000',
  paperlessApiToken: 'test-token',
} as const;

describe('sourceReportService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let counter = 0;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
    // Persistent fallback (not *Once*) so any test that doesn't care about the Paperless
    // response shape still gets something well-formed back.
    mockFetch.mockResolvedValue(mockJsonResponse(RAW_TAGS_RESPONSE));

    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    counter = 0;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    sqlite.close();
  });

  function ts(): string {
    return new Date(Date.now() + counter++).toISOString();
  }

  // ─── Fixture helpers ────────────────────────────────────────────────────

  function insertSource(overrides: Partial<typeof schema.budgetSources.$inferInsert> = {}): string {
    const id = overrides.id ?? `src-${++counter}`;
    const now = ts();
    db.insert(schema.budgetSources)
      .values({
        name: 'Test Source',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        isDiscretionary: false,
        status: 'active',
        reference: null,
        contactAddress: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertVendor(name = 'Test Vendor'): string {
    const id = `vendor-${++counter}`;
    const now = ts();
    db.insert(schema.vendors).values({ id, name, createdAt: now, updatedAt: now }).run();
    return id;
  }

  function insertWorkItemBudget(sourceId: string | null): string {
    const wiId = `wi-${++counter}`;
    const budgetId = `wib-${counter}`;
    const now = ts();
    db.insert(schema.workItems)
      .values({
        id: wiId,
        title: `WI ${counter}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return budgetId;
  }

  function insertInvoice(
    vendorId: string,
    overrides: Partial<typeof schema.invoices.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `inv-${++counter}`;
    const now = ts();
    db.insert(schema.invoices)
      .values({
        vendorId,
        amount: 1000,
        date: '2026-01-15',
        status: 'pending',
        invoiceNumber: `INV-${counter}`,
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertInvoiceBudgetLine(
    invoiceId: string,
    budgetId: string,
    itemizedAmount: number,
  ): string {
    const id = randomUUID();
    const now = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: budgetId,
        itemizedAmount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertDeposit(
    invoiceId: string,
    overrides: Partial<typeof schema.invoiceDeposits.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `dep-${++counter}`;
    const now = ts();
    db.insert(schema.invoiceDeposits)
      .values({
        invoiceId,
        amount: 100,
        dueDate: '2026-01-01',
        status: 'pending',
        entryType: 'deposit',
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertDocumentLink(
    entityId: string,
    paperlessDocumentId: number,
    attachmentType: 'quotation' | 'deposit' | 'invoice' | null = null,
  ): void {
    db.insert(schema.documentLinks)
      .values({
        id: randomUUID(),
        entityType: 'invoice',
        entityId,
        paperlessDocumentId,
        attachmentType,
        createdAt: ts(),
      })
      .run();
  }

  function diaryEntryCount(): number {
    return db.select().from(schema.diaryEntries).all().length;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // getSourceReport
  // ═══════════════════════════════════════════════════════════════════════

  describe('getSourceReport', () => {
    it('scenario 20: unknown sourceId throws NotFoundError', async () => {
      await expect(
        getSourceReport(db, 'budget-overview', 'does-not-exist', PAPERLESS_DISABLED),
      ).rejects.toThrow(NotFoundError);
    });

    it('scenario 8: budget-overview includes all 4 statuses incl. quotation', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();

      for (const status of ['quotation', 'pending', 'paid', 'claimed'] as const) {
        const invId = insertInvoice(vendorId, { status });
        // Each invoice needs its own budget line — invoice_budget_lines has a UNIQUE
        // index on work_item_budget_id (one invoice per budgeted line item).
        const budgetId = insertWorkItemBudget(sourceId);
        insertInvoiceBudgetLine(invId, budgetId, 200);
      }

      const result = await getSourceReport(db, 'budget-overview', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(4);
      expect(result.invoices.map((i) => i.status).sort()).toEqual(
        ['claimed', 'paid', 'pending', 'quotation'].sort(),
      );
    });

    it('scenario 9: claim report excludes quotation and claimed statuses', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();

      for (const status of ['quotation', 'pending', 'paid', 'claimed'] as const) {
        const invId = insertInvoice(vendorId, { status });
        // Each invoice needs its own budget line — invoice_budget_lines has a UNIQUE
        // index on work_item_budget_id (one invoice per budgeted line item).
        const budgetId = insertWorkItemBudget(sourceId);
        insertInvoiceBudgetLine(invId, budgetId, 200);
      }

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(2);
      expect(result.invoices.map((i) => i.status).sort()).toEqual(['paid', 'pending']);
    });

    it('scenario 10: proof-of-funds report includes only claimed status', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();

      for (const status of ['quotation', 'pending', 'paid', 'claimed'] as const) {
        const invId = insertInvoice(vendorId, { status });
        // Each invoice needs its own budget line — invoice_budget_lines has a UNIQUE
        // index on work_item_budget_id (one invoice per budgeted line item).
        const budgetId = insertWorkItemBudget(sourceId);
        insertInvoiceBudgetLine(invId, budgetId, 200);
      }

      const result = await getSourceReport(db, 'proof-of-funds', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0]!.status).toBe('claimed');
    });

    it('scenario 11: invoice split across two sources → isSplit true, partial allocatedAmount', async () => {
      const sourceA = insertSource({ name: 'Source A' });
      const sourceB = insertSource({ name: 'Source B' });
      const vendorId = insertVendor();
      const budgetA = insertWorkItemBudget(sourceA);
      const budgetB = insertWorkItemBudget(sourceB);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 1000 });
      insertInvoiceBudgetLine(invId, budgetA, 600);
      insertInvoiceBudgetLine(invId, budgetB, 400);

      const result = await getSourceReport(db, 'claim', sourceA, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0]!.isSplit).toBe(true);
      expect(result.invoices[0]!.allocatedAmount).toBeCloseTo(600);
    });

    it('scenario 12a: single-source invoice → isSplit false', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices[0]!.isSplit).toBe(false);
    });

    it('scenario 12b: real source + null-source line (COUNT DISTINCT NULL exclusion) → isSplit false', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetReal = insertWorkItemBudget(sourceId);
      const budgetNull = insertWorkItemBudget(null); // unassigned budget line
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 700 });
      insertInvoiceBudgetLine(invId, budgetReal, 500);
      insertInvoiceBudgetLine(invId, budgetNull, 200);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0]!.isSplit).toBe(false);
      expect(result.invoices[0]!.allocatedAmount).toBeCloseTo(500);
    });

    it('scenario 13: exactly-zero net contribution is dropped entirely (not in invoices, not in unallocated)', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      // invoice residual status pending (not in {claimed} target); deposit 400 claimed
      // offset by refund 400 claimed → net 0 in the claimed slice.
      const invId = insertInvoice(vendorId, { status: 'pending', amount: 1000 });
      insertInvoiceBudgetLine(invId, budgetId, 1000);
      insertDeposit(invId, { amount: 400, status: 'claimed', entryType: 'deposit' });
      insertDeposit(invId, { amount: 400, status: 'claimed', entryType: 'refund' });

      const result = await getSourceReport(db, 'proof-of-funds', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(0);
      expect(result.unallocatedInvoices).toHaveLength(0);
      expect(result.totalAmount).toBe(0);
    });

    it('scenario 14: negative net contribution → refund-adjustment line with negative allocatedAmount', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      // invoice residual status pending (not in {claimed} target); refund 300 claimed only.
      const invId = insertInvoice(vendorId, { status: 'pending', amount: 1000 });
      insertInvoiceBudgetLine(invId, budgetId, 1000);
      insertDeposit(invId, { amount: 300, status: 'claimed', entryType: 'refund' });

      const result = await getSourceReport(db, 'proof-of-funds', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0]!.lineKind).toBe('refund-adjustment');
      expect(result.invoices[0]!.allocatedAmount).toBeCloseTo(-300);
    });

    it('scenario 15: matching-status invoice with zero budget lines → unallocatedInvoices only', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      insertInvoice(vendorId, { status: 'pending' }); // no invoice_budget_lines at all

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(0);
      expect(result.unallocatedInvoices).toHaveLength(1);
      expect(result.unallocatedInvoices[0]!.status).toBe('pending');
    });

    it('scenario 15b: unallocated invoice with a status outside the target slice is excluded entirely', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      insertInvoice(vendorId, { status: 'claimed' }); // no budget lines

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED); // claim excludes claimed
      expect(result.unallocatedInvoices).toHaveLength(0);
    });

    it('scenario 16a: quotation-status invoice tags only the quotation document stage', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'quotation', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);
      insertDocumentLink(invId, 1, 'quotation');
      insertDocumentLink(invId, 2, 'invoice');
      insertDocumentLink(invId, 3, 'deposit');
      insertDocumentLink(invId, 4, null); // untagged always kept

      const result = await getSourceReport(db, 'budget-overview', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(1);
      const ids = result.invoices[0]!.documents.map((d) => d.attachmentType);
      expect(ids.sort()).toEqual([null, 'quotation'].sort());
    });

    it('scenario 16b: paid-status invoice (no deposits) tags the invoice document stage', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);
      insertDocumentLink(invId, 1, 'quotation');
      insertDocumentLink(invId, 2, 'invoice');
      insertDocumentLink(invId, 3, 'deposit');
      insertDocumentLink(invId, 4, null);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      const tags = result.invoices[0]!.documents.map((d) => d.attachmentType);
      expect(tags.sort()).toEqual([null, 'invoice'].sort());
    });

    it('scenario 16c: deposit whose status is in the slice tags the deposit document stage', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'pending', amount: 1000 });
      insertInvoiceBudgetLine(invId, budgetId, 1000);
      insertDeposit(invId, { amount: 300, status: 'paid', entryType: 'deposit' });
      insertDocumentLink(invId, 1, 'quotation');
      insertDocumentLink(invId, 2, 'invoice');
      insertDocumentLink(invId, 3, 'deposit');
      insertDocumentLink(invId, 4, null);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED); // claim = {pending,paid}
      const tags = result.invoices[0]!.documents.map((d) => d.attachmentType);
      // residual (pending, 700/1000) tags 'invoice'; deposit (paid, 300/1000) tags 'deposit'; untagged always kept
      expect(tags.sort()).toEqual([null, 'deposit', 'invoice'].sort());
    });

    it('scenario 16e: deposit whose status is outside the slice does not tag the deposit stage', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'pending', amount: 1000 });
      insertInvoiceBudgetLine(invId, budgetId, 1000);
      // 'claimed' is not part of the 'claim' report's target statuses ({pending, paid}).
      insertDeposit(invId, { amount: 100, status: 'claimed', entryType: 'deposit' });
      insertDocumentLink(invId, 1, 'deposit');
      insertDocumentLink(invId, 2, null);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      const tags = result.invoices[0]!.documents.map((d) => d.attachmentType);
      // Deposit stage is never activated (its only status is out-of-slice), so the
      // 'deposit'-tagged link is filtered out — only the untagged link survives.
      expect(tags).toEqual([null]);
    });

    it('scenario 16d: surviving document objects carry the real Paperless document id', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);
      insertDocumentLink(invId, 4242, null);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices[0]!.documents).toHaveLength(1);
      expect(result.invoices[0]!.documents[0]!.documentId).toBe(4242);
    });

    // Scenarios 17 ("Paperless reachable → ASN/title populated") and 18 ("getDocuments
    // throws → degrade to null") were previously omitted because two production bugs
    // (missing `await` on paperlessService.getDocuments, and a `sql.join(...)` crash) made
    // this code path unreachable. Both are fixed, and scenario 18 is restored below and
    // passes. Restoring scenario 17 uncovered a THIRD, previously-masked production bug —
    // see GitHub issue #1884: getSourceReport does `for (const doc of docs)` over the
    // `Map<number, PaperlessDocument>` returned by paperlessService.getDocuments(), which
    // iterates [key, value] tuples, not the document objects — so `doc.documentId` /
    // `doc.archiveSerialNumber` / `doc.title` are all undefined and the ASN/title
    // enrichment silently never populates, even when Paperless is reachable and returns
    // valid data. Per the test-failure protocol, this correct test must not be weakened to
    // match the buggy output — it is skipped (not deleted, not inverted) until #1884 is
    // fixed, at which point it should pass as-is with no changes.
    it('scenario 17: Paperless reachable → ASN/title populated on the matching document', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);
      insertDocumentLink(invId, 42, null);

      // Mock: tags first, then the bulk documents list (getDocuments' Promise.all order).
      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE)).mockResolvedValueOnce(
        mockJsonResponse({
          count: 1,
          results: [
            {
              id: 42,
              title: 'Invoice from Builder Co',
              content: 'Full text content here.',
              tags: [],
              created: '2026-01-15T00:00:00Z',
              added: '2026-01-16T08:30:00Z',
              modified: '2026-01-16T08:30:00Z',
              correspondent: null,
              document_type: null,
              archive_serial_number: 1042,
              original_file_name: 'invoice-2026-001.pdf',
              page_count: 2,
            },
          ],
        }),
      );

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_CONFIG_ENABLED);

      const doc = result.invoices[0]!.documents[0]!;
      expect(doc.documentId).toBe(42);
      expect(doc.archiveSerialNumber).toBe(1042);
      expect(doc.title).toBe('Invoice from Builder Co');
    });

    it('scenario 18: getDocuments throws → degrades to null ASN/title without failing the report', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);
      insertDocumentLink(invId, 42, null);

      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_CONFIG_ENABLED);

      expect(result.invoices).toHaveLength(1);
      const doc = result.invoices[0]!.documents[0]!;
      expect(doc.documentId).toBe(42);
      expect(doc.archiveSerialNumber).toBeNull();
      expect(doc.title).toBeNull();
    });

    it('scenario 19: Paperless unconfigured → degrades without calling fetch at all', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);
      insertDocumentLink(invId, 42, null);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);

      expect(mockFetch).not.toHaveBeenCalled();
      const doc = result.invoices[0]!.documents[0]!;
      expect(doc.archiveSerialNumber).toBeNull();
      expect(doc.title).toBeNull();
    });

    // M2 (carried over from #1878 architect review): a report with multiple invoices, each
    // referencing a Paperless document, must call paperlessService.getDocuments exactly ONCE
    // with all document ids batched together — never once per invoice/document.
    //
    // getDocuments itself is a named export on an ESM module namespace object, which Jest
    // cannot spy on directly under NodeNext ESM (`jest.spyOn` throws "Cannot assign to read
    // only property" — this is a real ESM immutability constraint, not something to work
    // around with jest.unstable_mockModule for a single test in an otherwise-real-DB test
    // file). Instead, this test distinguishes getDocuments' own outbound call from every other
    // Paperless call (e.g. fetchTagsMap) by its distinctive `/api/documents/?id__in=` URL —
    // getDocuments makes exactly one call to that specific endpoint per invocation, so counting
    // matches against that URL pattern is an equally precise way to pin "called exactly once,
    // batched" as spying on the function reference would have been.
    it('M2: the batched /api/documents/?id__in= call happens exactly once for a multi-invoice report', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();

      const docIds = [101, 102, 103];
      for (const docId of docIds) {
        const budgetId = insertWorkItemBudget(sourceId);
        const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
        insertInvoiceBudgetLine(invId, budgetId, 500);
        insertDocumentLink(invId, docId, null);
      }

      mockFetch.mockResolvedValue(mockJsonResponse(RAW_TAGS_RESPONSE));

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_CONFIG_ENABLED);

      expect(result.invoices).toHaveLength(3);

      const documentListCalls = mockFetch.mock.calls.filter((call) =>
        String(call[0]).includes('/api/documents/?id__in='),
      );
      expect(documentListCalls).toHaveLength(1);

      const calledUrl = String(documentListCalls[0]![0]);
      const idParam = new URL(calledUrl, 'http://paperless:8000').searchParams.get('id__in');
      expect(new Set(idParam!.split(',').map(Number))).toEqual(new Set(docIds));
    });

    it('scenario 21: totalAmount is the exact sum of decimal-noisy rounded lines', async () => {
      const sourceId = insertSource();
      const vendorId = insertVendor();

      const inv1 = insertInvoice(vendorId, { status: 'paid', amount: 332.85 });
      insertInvoiceBudgetLine(inv1, insertWorkItemBudget(sourceId), 332.85);
      const inv2 = insertInvoice(vendorId, { status: 'paid', amount: 333.04 });
      insertInvoiceBudgetLine(inv2, insertWorkItemBudget(sourceId), 333.04);
      const inv3 = insertInvoice(vendorId, { status: 'paid', amount: 334.11 });
      insertInvoiceBudgetLine(inv3, insertWorkItemBudget(sourceId), 334.11);

      const result = await getSourceReport(db, 'claim', sourceId, PAPERLESS_DISABLED);
      expect(result.invoices).toHaveLength(3);
      const sumOfLines = result.invoices.reduce((s, i) => s + i.allocatedAmount, 0);
      expect(result.totalAmount).toBeCloseTo(sumOfLines, 10);
      expect(result.totalAmount).toBeCloseTo(1000.0, 2);
    });

    it('source summary maps reference/contactAddress/sourceType from the budget source row', async () => {
      const sourceId = insertSource({
        name: 'Bauspar Bank',
        sourceType: 'credit_line',
        reference: 'REF-123',
        contactAddress: '123 Bank St',
      });

      const result = await getSourceReport(db, 'budget-overview', sourceId, PAPERLESS_DISABLED);
      expect(result.source).toEqual({
        id: sourceId,
        name: 'Bauspar Bank',
        sourceType: 'credit_line',
        reference: 'REF-123',
        contactAddress: '123 Bank St',
      });
      expect(result.type).toBe('budget-overview');
      expect(typeof result.generatedAt).toBe('string');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // markInvoicesClaimed
  // ═══════════════════════════════════════════════════════════════════════

  describe('markInvoicesClaimed', () => {
    it('scenario 22: empty invoiceIds throws ValidationError', () => {
      expect(() => markInvoicesClaimed(db, [], true)).toThrow(ValidationError);
    });

    it('scenario 23: all-pending invoices with no deposits flip to claimed and fire diary events', () => {
      const vendorId = insertVendor();
      const inv1 = insertInvoice(vendorId, { status: 'pending', invoiceNumber: 'INV-1' });
      const inv2 = insertInvoice(vendorId, { status: 'pending', invoiceNumber: 'INV-2' });
      const before = diaryEntryCount();

      const result = markInvoicesClaimed(db, [inv1, inv2], true);

      expect(result.claimedInvoiceIds.sort()).toEqual([inv1, inv2].sort());
      expect(result.claimedDepositIds).toEqual([]);
      const claimedRows = db
        .select()
        .from(schema.invoices)
        .all()
        .filter((i) => i.id === inv1 || i.id === inv2);
      expect(claimedRows.every((i) => i.status === 'claimed')).toBe(true);
      expect(diaryEntryCount()).toBe(before + 2);
    });

    it('scenario 24: pending invoice + 2 pending deposits → all flip; claimedDate=today, paidDate stays null', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'pending' });
      const dep1 = insertDeposit(invId, { status: 'pending', amount: 100 });
      const dep2 = insertDeposit(invId, { status: 'pending', amount: 200 });
      const today = new Date().toLocaleDateString('en-CA');

      const result = markInvoicesClaimed(db, [invId], true);

      expect(result.claimedInvoiceIds).toEqual([invId]);
      expect(result.claimedDepositIds.sort()).toEqual([dep1, dep2].sort());

      const updatedDep1 = db
        .select()
        .from(schema.invoiceDeposits)
        .all()
        .find((d) => d.id === dep1)!;
      expect(updatedDep1.status).toBe('claimed');
      expect(updatedDep1.claimedDate).toBe(today);
      expect(updatedDep1.paidDate).toBeNull();
    });

    it('scenario 25: paid invoice + paid deposit → both flip; paidDate preserved', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'paid' });
      const depId = insertDeposit(invId, { status: 'paid', amount: 100, paidDate: '2026-01-10' });

      const result = markInvoicesClaimed(db, [invId], true);

      expect(result.claimedInvoiceIds).toEqual([invId]);
      expect(result.claimedDepositIds).toEqual([depId]);

      const updatedInv = db
        .select()
        .from(schema.invoices)
        .all()
        .find((i) => i.id === invId)!;
      expect(updatedInv.status).toBe('claimed');

      const updatedDep = db
        .select()
        .from(schema.invoiceDeposits)
        .all()
        .find((d) => d.id === depId)!;
      expect(updatedDep.status).toBe('claimed');
      expect(updatedDep.paidDate).toBe('2026-01-10');
    });

    it('scenario 26: already-claimed invoice with a pending refund → invoice untouched (no event, updatedAt unchanged), refund flips', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, {
        status: 'claimed',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      const refundId = insertDeposit(invId, { status: 'pending', entryType: 'refund', amount: 50 });
      const before = diaryEntryCount();

      const result = markInvoicesClaimed(db, [invId], true);

      expect(result.claimedInvoiceIds).toEqual([]); // invoice already claimed — not re-flipped
      expect(result.claimedDepositIds).toEqual([refundId]);

      const updatedInv = db
        .select()
        .from(schema.invoices)
        .all()
        .find((i) => i.id === invId)!;
      expect(updatedInv.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      // No diary event for the invoice itself, but the refund's own transition still fires one.
      expect(diaryEntryCount()).toBe(before + 1);
    });

    it('scenario 27: batch with one quotation-status invoice among valid ones → 409, ZERO rows changed (rollback verified by re-query)', () => {
      const vendorId = insertVendor();
      const validInv = insertInvoice(vendorId, { status: 'pending' });
      const badInv = insertInvoice(vendorId, { status: 'quotation' });

      expect(() => markInvoicesClaimed(db, [validInv, badInv], true)).toThrow(
        InvoicesNotClaimableError,
      );

      try {
        markInvoicesClaimed(db, [validInv, badInv], true);
      } catch (e) {
        const err = e as InvoicesNotClaimableError;
        expect(err.details).toMatchObject({ invoiceIds: [badInv] });
      }

      const reQueriedValid = db
        .select()
        .from(schema.invoices)
        .all()
        .find((i) => i.id === validInv)!;
      expect(reQueriedValid.status).toBe('pending'); // untouched — rollback verified
    });

    it('scenario 28: batch with a non-existent invoice id → same 409 rollback behavior', () => {
      const vendorId = insertVendor();
      const validInv = insertInvoice(vendorId, { status: 'pending' });

      expect(() => markInvoicesClaimed(db, [validInv, 'does-not-exist'], true)).toThrow(
        InvoicesNotClaimableError,
      );

      const reQueriedValid = db
        .select()
        .from(schema.invoices)
        .all()
        .find((i) => i.id === validInv)!;
      expect(reQueriedValid.status).toBe('pending');
    });

    it('scenario 29: already-claimed invoice with nothing sweepable → 409 offending', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'claimed' }); // no deposits at all

      expect(() => markInvoicesClaimed(db, [invId], true)).toThrow(InvoicesNotClaimableError);
    });

    it('scenario 29b: already-claimed invoice with an already-claimed deposit (nothing sweepable) → 409', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'claimed' });
      insertDeposit(invId, { status: 'claimed', amount: 100 }); // ALLOWED_TRANSITIONS.claimed = ['paid'], no 'claimed' target

      expect(() => markInvoicesClaimed(db, [invId], true)).toThrow(InvoicesNotClaimableError);
    });

    it('scenario 30: diaryAutoEvents=false suppresses diary entries but writes still happen', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'pending' });
      const before = diaryEntryCount();

      const result = markInvoicesClaimed(db, [invId], false);

      expect(result.claimedInvoiceIds).toEqual([invId]);
      expect(diaryEntryCount()).toBe(before);

      const updatedInv = db
        .select()
        .from(schema.invoices)
        .all()
        .find((i) => i.id === invId)!;
      expect(updatedInv.status).toBe('claimed');
    });

    it('scenario 31: invoice with a null invoiceNumber falls back to N/A in diary events', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'pending', invoiceNumber: null });
      const depId = insertDeposit(invId, { status: 'pending', amount: 100 });

      const result = markInvoicesClaimed(db, [invId], true);

      expect(result.claimedInvoiceIds).toEqual([invId]);
      expect(result.claimedDepositIds).toEqual([depId]);
      // No assertion on diary event content here — onInvoiceStatusChanged/onDepositStatusChanged
      // are exercised elsewhere; this scenario's purpose is exercising the `|| 'N/A'` fallback
      // for a null invoiceNumber without throwing.
    });

    it('scenario 32: directly-claimable invoice with an already-claimed (non-transitionable) deposit → deposit left untouched', () => {
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'pending' });
      const depId = insertDeposit(invId, { status: 'claimed', amount: 100 }); // ALLOWED_TRANSITIONS.claimed = ['paid'] only

      const result = markInvoicesClaimed(db, [invId], true);

      expect(result.claimedInvoiceIds).toEqual([invId]);
      expect(result.claimedDepositIds).toEqual([]); // already-claimed deposit is not re-claimed

      const updatedDep = db
        .select()
        .from(schema.invoiceDeposits)
        .all()
        .find((d) => d.id === depId)!;
      expect(updatedDep.status).toBe('claimed');
    });
  });
});
