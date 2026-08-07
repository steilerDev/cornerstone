/**
 * Unit tests for reportContentGenerationService.ts (Story #1901).
 *
 * getSourceReport() runs for real against a seeded in-memory SQLite database (same pattern as
 * sourceReportService.test.ts) — the interesting behavior of this service is how it assembles
 * GenerateReportContentLlmInput from real DB rows (filtering, truncation, includedTotal math,
 * linked-item enrichment), so the DB layer is NOT mocked. The LLM provider itself IS mocked (via
 * jest.unstable_mockModule on './llmGateway/index.js') so tests can assert directly on the
 * exact `input` object handed to `provider.generateReportContent(input)` and control its return
 * value precisely — this is a cleaner seam than stubbing globalThis.fetch and parsing prompt text,
 * and it keeps this file scoped to reportContentGenerationService.ts's own orchestration logic
 * (wire-level provider behavior is already covered by openAICompatibleProvider.test.ts).
 *
 * IMPORTANT — two distinct, independently-seeded description sources feed two different fields
 * on each GenerateReportContentLlmInvoiceLine:
 *   - `line.description` comes from the BUDGET record's own description column
 *     (COALESCE(work_item_budgets.description, household_item_budgets.description) inside
 *     sourceReportService.ts) — seeded here via insertWorkItemBudget/insertHouseholdItemBudget's
 *     `description` option. Covered by scenarios 4 and 5.
 *   - `line.linkedItemDescription` comes from the linked ENTITY's own description column
 *     (`work_items.description` / `household_items.description`, looked up by
 *     `line.linkedItem.id` in reportContentGenerationService.ts) — a completely separate signal,
 *     seeded here via insertWorkItemBudget/insertHouseholdItemBudget's `entityDescription` option.
 *     Covered by scenarios 6, 6b, 6c, 7b, and 7c. Scenario 6c seeds two DIFFERENT strings for the
 *     same line to prove each field reads from its own source, not the other's.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { EmptySelectionError, NotFoundError, LlmNotConfiguredError } from '../errors/AppError.js';
import type { AppConfig } from '../plugins/config.js';
import type { GenerateReportContentRequest } from '@cornerstone/shared';
import type {
  BudgetExtractionProvider,
  GenerateReportContentLlmInput,
  GenerateReportContentLlmResult,
} from './llmGateway/types.js';
import type * as ReportContentGenerationServiceModule from './reportContentGenerationService.js';

// ─── Mock the LLM provider seam (getProvider) ─────────────────────────────────

const mockProviderGenerateReportContent =
  jest.fn<(input: GenerateReportContentLlmInput) => Promise<GenerateReportContentLlmResult>>();
const mockGetProvider = jest.fn<(config: AppConfig) => BudgetExtractionProvider>();

jest.unstable_mockModule('./llmGateway/index.js', () => ({
  getProvider: mockGetProvider,
}));

let generateReportContent: typeof ReportContentGenerationServiceModule.generateReportContent;

beforeEach(async () => {
  ({ generateReportContent } = await import('./reportContentGenerationService.js'));
});

// ─── DB setup ──────────────────────────────────────────────────────────────────

type DbType = BetterSQLite3Database<typeof schema>;

function createTestDb(): { sqlite: Database.Database; db: DbType } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

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
    paperlessUrl: undefined,
    paperlessExternalUrl: undefined,
    paperlessApiToken: undefined,
    paperlessFilterTag: undefined,
    paperlessEnabled: false,
    externalUrl: undefined,
    photoStoragePath: '/tmp/photos',
    photoMaxFileSizeMb: 20,
    diaryAutoEvents: false,
    diaryDraftRetentionDays: 30,
    currency: 'EUR',
    vatRate: 0.19,
    backupDir: '/backups',
    backupEnabled: false,
    llmBaseUrl: 'http://llm.test.local',
    llmApiKey: 'llm-key',
    llmModel: 'gpt-4o',
    llmRequestTimeoutMs: 5000,
    llmMaxTokens: 16384,
    llmProvider: 'openai',
    autoItemizeEnabled: true,
    llmEnabled: true,
    authRateLimitMax: 20,
    authRateLimitWindow: '15 minutes',
    ...overrides,
  };
}

function makeFakeProvider(
  overrides: Partial<BudgetExtractionProvider> = {},
): BudgetExtractionProvider {
  return {
    extract: jest.fn(),
    summarizeMerge: jest.fn(),
    generateReportContent: mockProviderGenerateReportContent,
    ...overrides,
  } as unknown as BudgetExtractionProvider;
}

function defaultLlmResult(invoiceIds: string[]): GenerateReportContentLlmResult {
  return {
    letterSubject: 'Subject line',
    letterBody: 'Body text',
    descriptions: Object.fromEntries(invoiceIds.map((id) => [id, `Description for ${id}`])),
  };
}

describe('generateReportContent (Story #1901)', () => {
  let sqlite: Database.Database;
  let db: DbType;
  let counter = 0;

  beforeEach(() => {
    mockGetProvider.mockReset();
    mockProviderGenerateReportContent.mockReset();
    mockGetProvider.mockReturnValue(makeFakeProvider());

    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    counter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  function ts(): string {
    return new Date(Date.now() + counter++).toISOString();
  }

  // ─── Fixture helpers (mirrors sourceReportService.test.ts) ───────────────────

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

  function insertWorkItemBudget(
    sourceId: string | null,
    // `description` seeds work_item_budgets.description (→ line.description, via
    // sourceReportService's COALESCE). `entityDescription` seeds the LINKED work_items row's own
    // description column (→ line.linkedItemDescription, via reportContentGenerationService's
    // per-entity lookup). The two are independent — never conflate them in a fixture.
    opts: { description?: string | null; entityDescription?: string | null } = {},
  ): { workItemId: string; budgetId: string } {
    const wiId = `wi-${++counter}`;
    const budgetId = `wib-${counter}`;
    const now = ts();
    db.insert(schema.workItems)
      .values({
        id: wiId,
        title: `WI ${counter}`,
        description: opts.entityDescription ?? null,
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
        description: opts.description ?? null,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { workItemId: wiId, budgetId };
  }

  function insertHouseholdItemBudget(
    sourceId: string | null,
    // Same source split as insertWorkItemBudget: `description` → household_item_budgets.description
    // (→ line.description); `entityDescription` → the linked household_items row's own
    // description column (→ line.linkedItemDescription).
    opts: { description?: string | null; entityDescription?: string | null } = {},
  ): { householdItemId: string; budgetId: string } {
    const hiId = `hi-${++counter}`;
    const budgetId = `hib-${counter}`;
    const now = ts();
    db.insert(schema.householdItems)
      .values({
        id: hiId,
        name: `HI ${counter}`,
        description: opts.entityDescription ?? null,
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdItemBudgets)
      .values({
        id: budgetId,
        householdItemId: hiId,
        budgetSourceId: sourceId,
        description: opts.description ?? null,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { householdItemId: hiId, budgetId };
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
    linkedBudget: { workItemBudgetId?: string; householdItemBudgetId?: string },
    itemizedAmount: number,
  ): string {
    const id = randomUUID();
    const now = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: linkedBudget.workItemBudgetId ?? null,
        householdItemBudgetId: linkedBudget.householdItemBudgetId ?? null,
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

  // ─── Helper: build a single invoice fully wired to a source, with a work-item budget line ──

  function seedSingleInvoiceReport(opts: {
    invoiceAmount?: number;
    lineAmount?: number;
    invoiceNotes?: string | null;
    // Entity-level (work_items.description) — feeds line.linkedItemDescription. NOT the
    // budget-record description (that's the separate `budgetDescription` opt below).
    entityDescription?: string | null;
    // Budget-level (work_item_budgets.description) — feeds line.description. Independent of
    // entityDescription; only set this when a scenario specifically needs to distinguish the two
    // sources (see scenario 6c).
    budgetDescription?: string | null;
  }): { sourceId: string; invoiceId: string; iblId: string } {
    const sourceId = insertSource();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId, {
      amount: opts.invoiceAmount ?? 1000,
      notes: opts.invoiceNotes ?? null,
    });
    const { budgetId } = insertWorkItemBudget(sourceId, {
      entityDescription: opts.entityDescription ?? null,
      description: opts.budgetDescription ?? null,
    });
    const iblId = insertInvoiceBudgetLine(
      invoiceId,
      { workItemBudgetId: budgetId },
      opts.lineAmount ?? opts.invoiceAmount ?? 1000,
    );
    return { sourceId, invoiceId, iblId };
  }

  function baseRequest(
    overrides: Partial<GenerateReportContentRequest> = {},
  ): GenerateReportContentRequest {
    return {
      type: 'claim',
      sourceId: 'placeholder',
      language: 'en',
      includedInvoiceIds: [],
      ...overrides,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1: happy shape
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 1: returns { letterSubject, letterBody, descriptions } on the happy path', async () => {
    const { sourceId, invoiceId } = seedSingleInvoiceReport({});
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    const result = await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    expect(result).toEqual({
      letterSubject: 'Subject line',
      letterBody: 'Body text',
      descriptions: { [invoiceId]: `Description for ${invoiceId}` },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 2: id filtering
  // ═══════════════════════════════════════════════════════════════════════

  it("scenario 2: filters includedInvoiceIds down to the report's actual invoice IDs before calling the provider", async () => {
    const { sourceId, invoiceId } = seedSingleInvoiceReport({});
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({
        sourceId,
        includedInvoiceIds: [invoiceId, 'not-a-real-invoice-id'],
      }),
    );

    expect(mockProviderGenerateReportContent).toHaveBeenCalledTimes(1);
    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    expect(input.invoices).toHaveLength(1);
    expect(input.invoices[0]!.invoiceId).toBe(invoiceId);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3: zero-overlap -> EmptySelectionError
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 3: throws EmptySelectionError when no requested invoice IDs match the report', async () => {
    const { sourceId } = seedSingleInvoiceReport({});

    await expect(
      generateReportContent(
        db,
        makeConfig(),
        baseRequest({ sourceId, includedInvoiceIds: ['ghost-1', 'ghost-2'] }),
      ),
    ).rejects.toThrow(EmptySelectionError);

    expect(mockProviderGenerateReportContent).not.toHaveBeenCalled();
  });

  it('scenario 3b: unknown sourceId throws NotFoundError (propagated from getSourceReport)', async () => {
    await expect(
      generateReportContent(
        db,
        makeConfig(),
        baseRequest({ sourceId: 'does-not-exist', includedInvoiceIds: ['inv-1'] }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4: excludedLineIds filtering
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 4: excludedLineIds removes the corresponding budget line from the prompt input', async () => {
    const sourceId = insertSource();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId, { amount: 1000 });
    const { budgetId: budgetA } = insertWorkItemBudget(sourceId, { description: 'Foundation' });
    const { budgetId: budgetB } = insertWorkItemBudget(sourceId, { description: 'Roofing' });
    const lineA = insertInvoiceBudgetLine(invoiceId, { workItemBudgetId: budgetA }, 600);
    insertInvoiceBudgetLine(invoiceId, { workItemBudgetId: budgetB }, 400);

    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({
        sourceId,
        includedInvoiceIds: [invoiceId],
        excludedLineIds: [lineA],
      }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    const invoiceInput = input.invoices.find((inv) => inv.invoiceId === invoiceId)!;
    expect(invoiceInput.budgetLines).toHaveLength(1);
    expect(invoiceInput.budgetLines[0]!.description).toBe('Roofing');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 5: includedTotal parity with the client's applyLineExclusions math
  // ═══════════════════════════════════════════════════════════════════════

  it("scenario 5: totalAmount mirrors allocatedAmount minus excluded lines' allocatedPortion, rounded to the nearest cent, and per-invoice LLM amounts are exclusion-adjusted and cents-rounded", async () => {
    const sourceId = insertSource();
    const vendorId = insertVendor();
    // Invoice A: 1000, two lines (600 excluded, 400 kept) -> contributes 400. The PO flagged that
    // invoice A used to be sent to the LLM as its raw 1000 while only contributing 400 to the
    // total — the per-invoice `amount` sent to the LLM must reflect the same exclusion-adjusted
    // value as the total, not the invoice's raw allocatedAmount.
    const invoiceA = insertInvoice(vendorId, { amount: 1000 });
    const { budgetId: budgetA1 } = insertWorkItemBudget(sourceId);
    const { budgetId: budgetA2 } = insertWorkItemBudget(sourceId);
    const excludedLine = insertInvoiceBudgetLine(invoiceA, { workItemBudgetId: budgetA1 }, 600);
    insertInvoiceBudgetLine(invoiceA, { workItemBudgetId: budgetA2 }, 400);
    // Invoice B: 333.335, no exclusions — still forces a per-invoice AND total rounding case,
    // since reportContentGenerationService.ts rounds every included invoice's amount to the
    // nearest cent unconditionally (Math.round(x * 100) / 100), not just exclusion-affected ones.
    const invoiceB = insertInvoice(vendorId, { amount: 333.335 });
    const { budgetId: budgetB } = insertWorkItemBudget(sourceId);
    insertInvoiceBudgetLine(invoiceB, { workItemBudgetId: budgetB }, 333.335);

    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceA, invoiceB]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({
        sourceId,
        includedInvoiceIds: [invoiceA, invoiceB],
        excludedLineIds: [excludedLine],
      }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    // 400 (invoice A after exclusion) + 333.34 (invoice B, cents-rounded) = 733.34
    expect(input.totalAmount).toBe(733.34);

    const invoiceAInput = input.invoices.find((inv) => inv.invoiceId === invoiceA)!;
    const invoiceBInput = input.invoices.find((inv) => inv.invoiceId === invoiceB)!;
    // Invoice A: exclusion-adjusted to 400, NOT its raw allocatedAmount of 1000.
    expect(invoiceAInput.amount).toBe(400);
    // Invoice B: no exclusions, but still cents-rounded from 333.335 to 333.34.
    expect(invoiceBInput.amount).toBe(333.34);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 6: linked work/household item descriptions included in prompt input
  // ═══════════════════════════════════════════════════════════════════════

  it("scenario 6: includes the linked work item's name and its own (entity-level) description in the prompt input", async () => {
    const { sourceId, invoiceId } = seedSingleInvoiceReport({
      entityDescription: 'Pour the foundation slab',
    });
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    const line = input.invoices[0]!.budgetLines[0]!;
    expect(line.linkedItemName).toMatch(/^WI /);
    expect(line.linkedItemDescription).toBe('Pour the foundation slab');
  });

  it("scenario 6b: includes the linked household item's name and its own (entity-level) description in the prompt input", async () => {
    const sourceId = insertSource();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId, { amount: 500 });
    const { budgetId } = insertHouseholdItemBudget(sourceId, {
      entityDescription: 'Living room sofa',
    });
    insertInvoiceBudgetLine(invoiceId, { householdItemBudgetId: budgetId }, 500);
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    const line = input.invoices[0]!.budgetLines[0]!;
    expect(line.linkedItemName).toMatch(/^HI /);
    expect(line.linkedItemDescription).toBe('Living room sofa');
  });

  it("scenario 6c: linkedItemDescription reads from the ENTITY's own description, not the budget record's description (regression guard)", async () => {
    // Seed two DIFFERENT strings for the two independent sources on the same line, to prove
    // reportContentGenerationService reads linkedItemDescription from work_items.description
    // (entityDescription here) and NOT from work_item_budgets.description (budgetDescription
    // here, which instead feeds line.description — see scenario 4).
    const { sourceId, invoiceId } = seedSingleInvoiceReport({
      entityDescription: 'Entity-level: foundation slab specification',
      budgetDescription: 'Budget-record-level: foundation line item',
    });
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    const line = input.invoices[0]!.budgetLines[0]!;
    expect(line.linkedItemDescription).toBe('Entity-level: foundation slab specification');
    expect(line.description).toBe('Budget-record-level: foundation line item');
    expect(line.linkedItemDescription).not.toBe(line.description);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 7: truncation caps
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 7a: truncates invoice notes to 500 characters', async () => {
    const longNotes = 'N'.repeat(600);
    const { sourceId, invoiceId } = seedSingleInvoiceReport({ invoiceNotes: longNotes });
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    expect(input.invoices[0]!.notes).toHaveLength(500);
    expect(input.invoices[0]!.notes).toBe('N'.repeat(500));
  });

  it('scenario 7b: truncates linked-item (entity-level) descriptions to 300 characters', async () => {
    const longDescription = 'D'.repeat(400);
    const { sourceId, invoiceId } = seedSingleInvoiceReport({
      entityDescription: longDescription,
    });
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    const line = input.invoices[0]!.budgetLines[0]!;
    expect(line.linkedItemDescription).toHaveLength(300);
    expect(line.linkedItemDescription).toBe('D'.repeat(300));
  });

  it('scenario 7c: passes short notes and entity-level descriptions through unchanged (no over-truncation)', async () => {
    const { sourceId, invoiceId } = seedSingleInvoiceReport({
      invoiceNotes: 'Short note',
      entityDescription: 'Short description',
    });
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    expect(input.invoices[0]!.notes).toBe('Short note');
    expect(input.invoices[0]!.budgetLines[0]!.linkedItemDescription).toBe('Short description');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 8: LlmNotConfigured propagation
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 8: propagates LlmNotConfiguredError thrown by getProvider() without swallowing it', async () => {
    const { sourceId, invoiceId } = seedSingleInvoiceReport({});
    mockGetProvider.mockImplementation(() => {
      throw new LlmNotConfiguredError('LLM gateway is not configured');
    });

    await expect(
      generateReportContent(
        db,
        makeConfig({ autoItemizeEnabled: false, llmEnabled: false }),
        baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
      ),
    ).rejects.toThrow(LlmNotConfiguredError);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 9: paperlessEnabled:false enforced on the internal getSourceReport call
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 9: calls getSourceReport with paperlessEnabled:false even when the app config has Paperless enabled', async () => {
    // Seed an invoice WITH a linked document, and configure Paperless as reachable. If
    // generateReportContent threaded config.paperlessEnabled through to getSourceReport, this
    // would trigger a real Paperless HTTP fetch (which would fail/hang since no server is
    // running and fetch is not mocked in this file at all). Since it does not fail, this proves
    // the hardcoded `paperlessEnabled: false` in reportContentGenerationService.ts is honored.
    const { sourceId, invoiceId } = seedSingleInvoiceReport({});
    db.insert(schema.documentLinks)
      .values({
        id: randomUUID(),
        entityType: 'invoice',
        entityId: invoiceId,
        paperlessDocumentId: 42,
        createdAt: ts(),
      })
      .run();
    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    const config = makeConfig({
      paperlessEnabled: true,
      paperlessUrl: 'http://paperless.test.local',
      paperlessApiToken: 'test-token',
    });

    await expect(
      generateReportContent(db, config, baseRequest({ sourceId, includedInvoiceIds: [invoiceId] })),
    ).resolves.toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 10: hallucinated invoiceId filtered out of the returned descriptions
  // ═══════════════════════════════════════════════════════════════════════

  it('scenario 10: strips a hallucinated invoiceId that was not part of the request from the returned descriptions (defense-in-depth)', async () => {
    const { sourceId, invoiceId } = seedSingleInvoiceReport({});
    mockProviderGenerateReportContent.mockResolvedValue({
      letterSubject: 'Subject',
      letterBody: 'Body',
      descriptions: {
        [invoiceId]: 'Real description',
        'hallucinated-invoice-id': 'This invoice was never requested',
      },
    });

    const result = await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ sourceId, includedInvoiceIds: [invoiceId] }),
    );

    expect(result.descriptions).toEqual({ [invoiceId]: 'Real description' });
    expect(result.descriptions).not.toHaveProperty('hallucinated-invoice-id');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Bug #1918 regression: claim reports drop zero-contribution budget lines
  // upstream in getSourceReport — this must propagate through to the LLM input,
  // sending no budget lines (and doing no linked-item lookup) for such an invoice.
  // ═══════════════════════════════════════════════════════════════════════

  it('#1918 regression: a quotation invoice whose only funding is a deposit tagged to this source sends NO budget lines to the LLM for that invoice, even though its line is linked to a work item', async () => {
    const sourceId = insertSource();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId, { status: 'quotation', amount: 1000 });
    const { budgetId } = insertWorkItemBudget(sourceId, {
      entityDescription: 'Should never reach the LLM input',
    });
    insertInvoiceBudgetLine(invoiceId, { workItemBudgetId: budgetId }, 1000);
    // Deposit tagged to this source — sweeps the line's Rail A contribution to zero for a
    // 'claim' report (quotation isn't in the claim slice, and the tagged deposit is excluded
    // from Rail A by definition), so getSourceReport drops budgetLines[] for this invoice.
    insertDeposit(invoiceId, { amount: 300, status: 'pending', budgetSourceId: sourceId });

    mockProviderGenerateReportContent.mockResolvedValue(defaultLlmResult([invoiceId]));

    await generateReportContent(
      db,
      makeConfig(),
      baseRequest({ type: 'claim', sourceId, includedInvoiceIds: [invoiceId] }),
    );

    const input = mockProviderGenerateReportContent.mock.calls[0]![0];
    const invoiceInput = input.invoices.find((inv) => inv.invoiceId === invoiceId);
    expect(invoiceInput).toBeDefined();
    expect(invoiceInput!.budgetLines).toEqual([]);
    // The invoice's exclusion-adjusted `amount` reflects only the deposit's own Rail B
    // contribution (300), not the invoice's raw itemized line total (1000).
    expect(invoiceInput!.amount).toBeCloseTo(300);
  });
});
