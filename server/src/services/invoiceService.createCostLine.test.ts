import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceService from './invoiceService.js';
import { NotFoundError } from '../errors/AppError.js';

describe('invoiceService.createInvoice with a cost line and a document (#2241)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  const NOW = '2026-03-01T00:00:00.000Z';
  const USER = 'user-1';
  const VENDOR = 'vendor-1';

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    db.insert(schema.users)
      .values({
        id: USER,
        email: 'u@example.test',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'x',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    db.insert(schema.vendors)
      .values({ id: VENDOR, name: 'Example Roofing', createdAt: NOW, updatedAt: NOW })
      .run();
    db.insert(schema.workItems)
      .values({ id: 'wi-1', title: 'Roof', status: 'not_started', createdAt: NOW, updatedAt: NOW })
      .run();
    db.insert(schema.householdItems)
      .values({
        id: 'hi-1',
        name: 'Sofa',
        categoryId: 'hic-furniture',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  const count = (table: string) =>
    (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

  it('creates a work-item cost line and its link for the full amount', () => {
    const invoice = invoiceService.createInvoice(
      db,
      VENDOR,
      { amount: 1200, date: '2026-03-02', costLine: { targetType: 'work_item', targetId: 'wi-1' } },
      USER,
    );

    const lines = db.select().from(schema.workItemBudgets).all();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      workItemId: 'wi-1',
      plannedAmount: 1200,
      includesVat: true,
      confidence: 'invoice',
      vendorId: VENDOR,
      budgetSourceId: 'discretionary-system',
    });
    const links = db.select().from(schema.invoiceBudgetLines).all();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      invoiceId: invoice.id,
      workItemBudgetId: lines[0]!.id,
      householdItemBudgetId: null,
      itemizedAmount: 1200,
    });
    expect(invoiceService.getInvoiceDetail(db, invoice.id).remainingAmount).toBe(0);
  });

  it('creates a household-item cost line and its link for the full amount', () => {
    const invoice = invoiceService.createInvoice(
      db,
      VENDOR,
      {
        amount: 80,
        date: '2026-03-02',
        costLine: { targetType: 'household_item', targetId: 'hi-1' },
      },
      USER,
    );

    const lines = db.select().from(schema.householdItemBudgets).all();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      householdItemId: 'hi-1',
      plannedAmount: 80,
      confidence: 'invoice',
      vendorId: VENDOR,
      budgetSourceId: 'discretionary-system',
    });
    const links = db.select().from(schema.invoiceBudgetLines).all();
    expect(links[0]).toMatchObject({
      invoiceId: invoice.id,
      workItemBudgetId: null,
      householdItemBudgetId: lines[0]!.id,
      itemizedAmount: 80,
    });
    expect(invoiceService.getInvoiceDetail(db, invoice.id).remainingAmount).toBe(0);
  });

  it('marks the line as a quote when the invoice is an offer', () => {
    invoiceService.createInvoice(
      db,
      VENDOR,
      {
        amount: 500,
        date: '2026-03-02',
        status: 'quotation',
        costLine: { targetType: 'work_item', targetId: 'wi-1' },
      },
      USER,
    );
    expect(db.select().from(schema.workItemBudgets).get()!.confidence).toBe('quote');
  });

  it('fails and creates nothing when the guaranteed discretionary source was removed behind its back', () => {
    sqlite.pragma('foreign_keys = OFF');
    db.delete(schema.budgetSources).where(eq(schema.budgetSources.isDiscretionary, true)).run();
    sqlite.pragma('foreign_keys = ON');

    expect(() =>
      invoiceService.createInvoice(
        db,
        VENDOR,
        {
          amount: 500,
          date: '2026-03-02',
          costLine: { targetType: 'work_item', targetId: 'wi-1' },
        },
        USER,
      ),
    ).toThrow();

    expect(count('invoices')).toBe(0);
    expect(count('work_item_budgets')).toBe(0);
    expect(count('invoice_budget_lines')).toBe(0);
  });

  it('writes nothing at all when the cost-line target does not exist (work item)', () => {
    expect(() =>
      invoiceService.createInvoice(
        db,
        VENDOR,
        {
          amount: 500,
          date: '2026-03-02',
          paperlessDocumentId: 9,
          costLine: { targetType: 'work_item', targetId: 'missing' },
        },
        USER,
      ),
    ).toThrow(NotFoundError);

    expect(count('invoices')).toBe(0);
    expect(count('work_item_budgets')).toBe(0);
    expect(count('household_item_budgets')).toBe(0);
    expect(count('invoice_budget_lines')).toBe(0);
    expect(count('document_links')).toBe(0);
  });

  it('writes nothing at all when the cost-line target does not exist (household item)', () => {
    expect(() =>
      invoiceService.createInvoice(
        db,
        VENDOR,
        {
          amount: 500,
          date: '2026-03-02',
          costLine: { targetType: 'household_item', targetId: 'missing' },
        },
        USER,
      ),
    ).toThrow(NotFoundError);

    expect(count('invoices')).toBe(0);
    expect(count('household_item_budgets')).toBe(0);
    expect(count('invoice_budget_lines')).toBe(0);
  });

  it('links the document as an invoice attachment', () => {
    const invoice = invoiceService.createInvoice(
      db,
      VENDOR,
      { amount: 500, date: '2026-03-02', paperlessDocumentId: 42 },
      USER,
    );
    const links = db.select().from(schema.documentLinks).all();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      entityType: 'invoice',
      entityId: invoice.id,
      paperlessDocumentId: 42,
      attachmentType: 'invoice',
    });
    expect(count('work_item_budgets')).toBe(0);
  });

  it('links the document as a quotation attachment for an offer', () => {
    invoiceService.createInvoice(
      db,
      VENDOR,
      { amount: 500, date: '2026-03-02', status: 'quotation', paperlessDocumentId: 42 },
      USER,
    );
    expect(db.select().from(schema.documentLinks).get()!.attachmentType).toBe('quotation');
  });

  it('creates only the invoice when neither optional field is given', () => {
    invoiceService.createInvoice(db, VENDOR, { amount: 500, date: '2026-03-02' }, USER);
    expect(count('invoices')).toBe(1);
    expect(count('document_links')).toBe(0);
    expect(count('invoice_budget_lines')).toBe(0);
  });

  it('rolls back the invoice and the cost line when the document link is rejected', () => {
    db.insert(schema.documentLinks)
      .values({
        id: 'dl-x',
        entityType: 'work_item',
        entityId: 'wi-1',
        paperlessDocumentId: 1,
        createdAt: NOW,
      })
      .run();
    // Make the link insert fail inside the transaction with a duplicate of the new invoice link.
    sqlite.exec(
      `CREATE TRIGGER fail_link BEFORE INSERT ON document_links
       WHEN NEW.entity_type = 'invoice' BEGIN SELECT RAISE(ABORT, 'boom'); END;`,
    );
    expect(() =>
      invoiceService.createInvoice(
        db,
        VENDOR,
        {
          amount: 500,
          date: '2026-03-02',
          paperlessDocumentId: 7,
          costLine: { targetType: 'work_item', targetId: 'wi-1' },
        },
        USER,
      ),
    ).toThrow();
    expect(count('invoices')).toBe(0);
    expect(count('work_item_budgets')).toBe(0);
    expect(count('invoice_budget_lines')).toBe(0);
  });
});
