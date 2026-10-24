import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { createBudgetLinesBatch } from './budgetLineBatchService.js';
import { AppError } from '../errors/AppError.js';
import type { BatchBudgetLineInput } from '@cornerstone/shared';

const VAT = 0.19;

function at<T>(items: T[], index = 0): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at index ${index}`);
  return item;
}

describe('budgetLineBatchService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let counter = 0;
  let userId: string;
  let sourceId: string;
  let vendorId: string;
  let taskId: string;
  let purchaseId: string;

  function ts(): string {
    return new Date(Date.UTC(2026, 0, 1) + counter++).toISOString();
  }

  function insertUser(): string {
    const id = `user-${++counter}`;
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Synthetic User',
        passwordHash: 'x',
        role: 'member',
        authProvider: 'local',
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertSource(): string {
    const id = `bs-${++counter}`;
    db.insert(schema.budgetSources)
      .values({
        id,
        name: 'Synthetic savings',
        sourceType: 'savings',
        totalAmount: 100000,
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = `vendor-${++counter}`;
    db.insert(schema.vendors)
      .values({ id, name: 'Example Joinery Ltd', createdAt: ts(), updatedAt: ts() })
      .run();
    return id;
  }

  function insertTask(): string {
    const id = `wi-${++counter}`;
    db.insert(schema.workItems)
      .values({
        id,
        title: 'Synthetic kitchen task',
        status: 'not_started',
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertPurchase(): string {
    const id = `hi-${++counter}`;
    db.insert(schema.householdItems)
      .values({
        id,
        name: 'Synthetic sofa',
        categoryId: 'hic-furniture',
        status: 'planned',
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertInvoice(amount = 1000): string {
    const id = `inv-${++counter}`;
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: null,
        amount,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertTaskLine(plannedAmount = 100): string {
    const id = `wib-${++counter}`;
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: taskId,
        description: 'Existing line',
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: sourceId,
        vendorId: null,
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertPurchaseLine(plannedAmount = 100): string {
    const id = `hib-${++counter}`;
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId: purchaseId,
        description: 'Existing purchase line',
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: 'bc-household-items',
        budgetSourceId: sourceId,
        vendorId: null,
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function counts() {
    return {
      wib: db.select().from(schema.workItemBudgets).all().length,
      hib: db.select().from(schema.householdItemBudgets).all().length,
      ibl: db.select().from(schema.invoiceBudgetLines).all().length,
    };
  }

  function taskCreate(over: Record<string, unknown> = {}): BatchBudgetLineInput {
    return {
      kind: 'create',
      targetType: 'work_item',
      targetId: taskId,
      plannedAmount: 100,
      budgetSourceId: sourceId,
      ...over,
    } as BatchBudgetLineInput;
  }

  function purchaseCreate(over: Record<string, unknown> = {}): BatchBudgetLineInput {
    return {
      kind: 'create',
      targetType: 'household_item',
      targetId: purchaseId,
      plannedAmount: 100,
      budgetSourceId: sourceId,
      ...over,
    } as BatchBudgetLineInput;
  }

  function run(lines: BatchBudgetLineInput[], invoiceId?: string) {
    return createBudgetLinesBatch(db, userId, { invoiceId, lines }, VAT);
  }

  function catchError(fn: () => unknown): AppError {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      return e as AppError;
    }
    throw new Error('expected an AppError');
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    counter = 0;
    userId = insertUser();
    sourceId = insertSource();
    vendorId = insertVendor();
    taskId = insertTask();
    purchaseId = insertPurchase();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('create entries without an invoice', () => {
    it('creates lines on a task and a purchase in order with null links and null remaining', () => {
      const result = run([taskCreate({ description: 'Cabinet part 01' }), purchaseCreate()]);

      expect(result.remainingAmount).toBeNull();
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toMatchObject({
        index: 0,
        budgetLineType: 'work_item',
        invoiceBudgetLineId: null,
      });
      expect(result.lines[1]).toMatchObject({
        index: 1,
        budgetLineType: 'household_item',
        invoiceBudgetLineId: null,
      });
      const wib = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, at(result.lines).budgetLineId))
        .get()!;
      expect(wib.workItemId).toBe(taskId);
      expect(wib.description).toBe('Cabinet part 01');
      expect(counts()).toEqual({ wib: 1, hib: 1, ibl: 0 });
    });

    it('forces purchase lines to the household category even when another is sent', () => {
      const result = run([purchaseCreate({ budgetCategoryId: 'bc-materials' })]);
      const hib = db
        .select()
        .from(schema.householdItemBudgets)
        .where(eq(schema.householdItemBudgets.id, at(result.lines).budgetLineId))
        .get()!;
      expect(hib.budgetCategoryId).toBe('bc-household-items');
    });

    it('keeps an explicit category on a task line', () => {
      const result = run([taskCreate({ budgetCategoryId: 'bc-materials' })]);
      const wib = db
        .select()
        .from(schema.workItemBudgets)
        .where(eq(schema.workItemBudgets.id, at(result.lines).budgetLineId))
        .get()!;
      expect(wib.budgetCategoryId).toBe('bc-materials');
    });

    it('handles 50 lines in one batch', () => {
      const lines = Array.from({ length: 50 }, (_, i) =>
        taskCreate({ description: `Cabinet part ${i + 1}`, plannedAmount: 1 }),
      );
      const result = run(lines);
      expect(result.lines.map((l) => l.index)).toEqual(lines.map((_, i) => i));
      expect(counts().wib).toBe(50);
    });
  });

  describe('create entries with an invoice', () => {
    it('itemizes a net line at its gross amount (net 100 at VAT 0.19 gives 119)', () => {
      const invoiceId = insertInvoice(1000);
      const result = run([taskCreate({ plannedAmount: 100, includesVat: false })], invoiceId);

      const link = db.select().from(schema.invoiceBudgetLines).all();
      expect(link).toHaveLength(1);
      expect(at(link).itemizedAmount).toBe(119);
      expect(at(result.lines).invoiceBudgetLineId).toBe(at(link).id);
      expect(result.remainingAmount).toBe(881);
    });

    it('itemizes a gross line at face value', () => {
      const invoiceId = insertInvoice(1000);
      run([purchaseCreate({ plannedAmount: 250.5, includesVat: true })], invoiceId);
      expect(at(db.select().from(schema.invoiceBudgetLines).all()).itemizedAmount).toBe(250.5);
    });

    it('rounds the gross amount to cents', () => {
      const invoiceId = insertInvoice(1000);
      run([taskCreate({ plannedAmount: 33.33, includesVat: false })], invoiceId);
      expect(at(db.select().from(schema.invoiceBudgetLines).all()).itemizedAmount).toBe(39.66);
    });

    it('reports the remaining amount after the last entry', () => {
      const invoiceId = insertInvoice(500);
      const result = run(
        [taskCreate({ plannedAmount: 100 }), purchaseCreate({ plannedAmount: 150 })],
        invoiceId,
      );
      expect(result.remainingAmount).toBe(250);
      expect(result.lines.every((l) => l.invoiceBudgetLineId !== null)).toBe(true);
    });

    it('rejects a zero planned amount with 400 and the entry index', () => {
      const invoiceId = insertInvoice(500);
      const err = catchError(() =>
        run([taskCreate({ plannedAmount: 10 }), taskCreate({ plannedAmount: 0 })], invoiceId),
      );
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('rejects a running sum above the invoice amount at the overflowing entry', () => {
      const invoiceId = insertInvoice(200);
      const err = catchError(() =>
        run(
          [
            taskCreate({ plannedAmount: 100 }),
            taskCreate({ plannedAmount: 100 }),
            taskCreate({ plannedAmount: 50 }),
          ],
          invoiceId,
        ),
      );
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
      expect(err.details).toMatchObject({ index: 2 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('counts itemized amounts already on the invoice in the running sum', () => {
      const invoiceId = insertInvoice(150);
      run([taskCreate({ plannedAmount: 100 })], invoiceId);
      const err = catchError(() => run([taskCreate({ plannedAmount: 60 })], invoiceId));
      expect(err.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('returns 404 without an index when the invoice does not exist', () => {
      const err = catchError(() => run([taskCreate()], 'missing-invoice'));
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.details?.index).toBeUndefined();
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });
  });

  describe('link entries', () => {
    it('links an existing task line and a purchase line with the given gross amount', () => {
      const invoiceId = insertInvoice(1000);
      const wib = insertTaskLine();
      const hib = insertPurchaseLine();
      const result = run(
        [
          { kind: 'link', budgetLineType: 'work_item', budgetLineId: wib, itemizedAmount: 300 },
          {
            kind: 'link',
            budgetLineType: 'household_item',
            budgetLineId: hib,
            itemizedAmount: 200.25,
          },
        ],
        invoiceId,
      );

      expect(result.lines[0]).toMatchObject({
        index: 0,
        budgetLineId: wib,
        budgetLineType: 'work_item',
      });
      expect(result.lines[1]).toMatchObject({
        index: 1,
        budgetLineId: hib,
        budgetLineType: 'household_item',
      });
      expect(at(result.lines).invoiceBudgetLineId).toEqual(expect.any(String));
      expect(result.remainingAmount).toBe(499.75);
      expect(counts()).toEqual({ wib: 1, hib: 1, ibl: 2 });
    });

    it('rejects a link entry without an invoice id with 400 and index', () => {
      const wib = insertTaskLine();
      const err = catchError(() =>
        run([{ kind: 'link', budgetLineType: 'work_item', budgetLineId: wib, itemizedAmount: 10 }]),
      );
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('rejects a zero itemized amount with 400 and index', () => {
      const invoiceId = insertInvoice();
      const wib = insertTaskLine();
      const err = catchError(() =>
        run(
          [{ kind: 'link', budgetLineType: 'work_item', budgetLineId: wib, itemizedAmount: 0 }],
          invoiceId,
        ),
      );
      expect(err.statusCode).toBe(400);
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('returns 404 with index for a missing line', () => {
      const invoiceId = insertInvoice();
      const err = catchError(() =>
        run(
          [
            taskCreate(),
            {
              kind: 'link',
              budgetLineType: 'household_item',
              budgetLineId: 'nope',
              itemizedAmount: 10,
            },
          ],
          invoiceId,
        ),
      );
      expect(err.statusCode).toBe(404);
      expect(err.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('rejects a duplicate line inside one batch with 400 and the second index', () => {
      const invoiceId = insertInvoice();
      const wib = insertTaskLine();
      const link: BatchBudgetLineInput = {
        kind: 'link',
        budgetLineType: 'work_item',
        budgetLineId: wib,
        itemizedAmount: 10,
      };
      const err = catchError(() => run([link, link], invoiceId));
      expect(err.statusCode).toBe(400);
      expect(err.details).toMatchObject({ index: 1 });
      expect(counts().ibl).toBe(0);
    });

    it('rejects a line already linked to the same invoice with 400', () => {
      const invoiceId = insertInvoice();
      const hib = insertPurchaseLine();
      const link: BatchBudgetLineInput = {
        kind: 'link',
        budgetLineType: 'household_item',
        budgetLineId: hib,
        itemizedAmount: 10,
      };
      run([link], invoiceId);
      const err = catchError(() => run([link], invoiceId));
      expect(err.statusCode).toBe(400);
      expect(err.details).toMatchObject({ index: 0 });
      expect(counts().ibl).toBe(1);
    });

    it('rejects a line linked to a different invoice with 409', () => {
      const first = insertInvoice();
      const second = insertInvoice();
      const wib = insertTaskLine();
      const link: BatchBudgetLineInput = {
        kind: 'link',
        budgetLineType: 'work_item',
        budgetLineId: wib,
        itemizedAmount: 10,
      };
      run([link], first);
      const err = catchError(() => run([link], second));
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('BUDGET_LINE_ALREADY_LINKED');
      expect(err.details).toMatchObject({ index: 0 });
    });
  });

  describe('mixed batches', () => {
    it('creates and links in one call, running sum covers both', () => {
      const invoiceId = insertInvoice(500);
      const wib = insertTaskLine();
      const result = run(
        [
          taskCreate({ plannedAmount: 100, includesVat: false }),
          { kind: 'link', budgetLineType: 'work_item', budgetLineId: wib, itemizedAmount: 81 },
          purchaseCreate({ plannedAmount: 50 }),
        ],
        invoiceId,
      );
      expect(result.lines.map((l) => l.index)).toEqual([0, 1, 2]);
      expect(result.remainingAmount).toBe(250);
      expect(counts()).toEqual({ wib: 2, hib: 1, ibl: 3 });
    });

    it('creates mixed task and purchase lines without an invoice', () => {
      const result = run([purchaseCreate(), taskCreate(), purchaseCreate()]);
      expect(result.lines.map((l) => l.budgetLineType)).toEqual([
        'household_item',
        'work_item',
        'household_item',
      ]);
    });
  });

  describe('per-entry errors and rollback', () => {
    it('returns 404 with index for a missing target and rolls back earlier creates', () => {
      const err = catchError(() =>
        run([taskCreate(), purchaseCreate(), taskCreate({ targetId: 'missing-task' })]),
      );
      expect(err.statusCode).toBe(404);
      expect(err.details).toMatchObject({ index: 2 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('returns 404 with index for a missing purchase target', () => {
      const err = catchError(() => run([purchaseCreate({ targetId: 'missing-purchase' })]));
      expect(err.statusCode).toBe(404);
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('rejects an unknown budget source with an indexed error, rolling back everything', () => {
      const invoiceId = insertInvoice();
      const err = catchError(() =>
        run([taskCreate(), purchaseCreate({ budgetSourceId: 'no-such-source' })], invoiceId),
      );
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('rejects an unknown category with an indexed error', () => {
      const err = catchError(() => run([taskCreate({ budgetCategoryId: 'no-such-category' })]));
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('rejects an unknown vendor with an indexed error', () => {
      const err = catchError(() => run([taskCreate({ vendorId: 'no-such-vendor' })]));
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 0 });
    });

    it.each([
      ['budgetSourceId', 'no-such-source'],
      ['vendorId', 'no-such-vendor'],
    ])('rejects an unknown %s on a purchase line with 400 and index', (field, value) => {
      const err = catchError(() => run([purchaseCreate({ [field]: value })]));
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('ignores an unknown category on a purchase line because the household category is forced', () => {
      const result = run([purchaseCreate({ budgetCategoryId: 'no-such-category' })]);
      expect(result.lines).toHaveLength(1);
    });

    it('accepts a known vendor', () => {
      const result = run([taskCreate({ vendorId })]);
      expect(result.lines).toHaveLength(1);
    });

    it('leaves pre-existing rows untouched after a failed batch', () => {
      const invoiceId = insertInvoice(100);
      const wib = insertTaskLine();
      run(
        [{ kind: 'link', budgetLineType: 'work_item', budgetLineId: wib, itemizedAmount: 40 }],
        invoiceId,
      );
      catchError(() =>
        run([taskCreate({ plannedAmount: 50 }), taskCreate({ plannedAmount: 50 })], invoiceId),
      );
      expect(counts()).toEqual({ wib: 1, hib: 0, ibl: 1 });
    });

    it('rethrows a non-AppError failure unchanged and rolls back', () => {
      expect(() => run([taskCreate(), null as unknown as BatchBudgetLineInput])).toThrow(TypeError);
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });
  });
});
