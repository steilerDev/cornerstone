import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type {
  BatchBudgetLineInput,
  BatchCreatedBudgetLine,
  BatchCreateBudgetLinesRequest,
  BatchCreateBudgetLinesResponse,
} from '@cornerstone/shared';
import { effectivePlannedAmount } from '@cornerstone/shared';
import { AppError, ValidationError } from '../errors/AppError.js';
import { createWorkItemBudget } from './workItemBudgetService.js';
import { createHouseholdItemBudget } from './householdItemBudgetService.js';
import { createInvoiceBudgetLine, listInvoiceBudgetLines } from './invoiceBudgetLineService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Re-create an AppError of the same code/status with `details.index` added. */
function withIndex(error: unknown, index: number): unknown {
  if (!(error instanceof AppError)) return error;
  return new AppError(
    error.code,
    error.statusCode,
    error.message,
    { ...error.details, index },
    error.suppressDetails,
    error.cause,
  );
}

function linkLine(
  db: DbType,
  invoiceId: string,
  lineType: 'work_item' | 'household_item',
  lineId: string,
  itemizedAmount: number,
) {
  return createInvoiceBudgetLine(db, invoiceId, {
    workItemBudgetId: lineType === 'work_item' ? lineId : null,
    householdItemBudgetId: lineType === 'household_item' ? lineId : null,
    itemizedAmount,
  });
}

function processEntry(
  db: DbType,
  userId: string,
  invoiceId: string | undefined,
  vatRate: number,
  entry: BatchBudgetLineInput,
  index: number,
): { created: BatchCreatedBudgetLine; remainingAmount: number | null } {
  if (entry.kind === 'link') {
    if (!invoiceId) {
      throw new ValidationError('invoiceId is required to link a budget line');
    }
    const linked = linkLine(
      db,
      invoiceId,
      entry.budgetLineType,
      entry.budgetLineId,
      entry.itemizedAmount,
    );
    return {
      created: {
        index,
        budgetLineId: entry.budgetLineId,
        budgetLineType: entry.budgetLineType,
        invoiceBudgetLineId: linked.budgetLine.id,
      },
      remainingAmount: linked.remainingAmount,
    };
  }

  const { kind: _kind, targetType, targetId, ...data } = entry;
  const line =
    targetType === 'work_item'
      ? createWorkItemBudget(db, targetId, userId, data)
      : createHouseholdItemBudget(db, targetId, userId, data);

  if (!invoiceId) {
    return {
      created: {
        index,
        budgetLineId: line.id,
        budgetLineType: targetType,
        invoiceBudgetLineId: null,
      },
      remainingAmount: null,
    };
  }

  const linked = linkLine(
    db,
    invoiceId,
    targetType,
    line.id,
    round2(effectivePlannedAmount(line, vatRate)),
  );
  return {
    created: {
      index,
      budgetLineId: line.id,
      budgetLineType: targetType,
      invoiceBudgetLineId: linked.budgetLine.id,
    },
    remainingAmount: linked.remainingAmount,
  };
}

/**
 * Create and/or link up to 200 cost lines atomically (one transaction).
 * Any failure rolls back every write; per-entry errors carry `details.index`.
 */
export function createBudgetLinesBatch(
  db: DbType,
  userId: string,
  request: BatchCreateBudgetLinesRequest,
  vatRate: number,
): BatchCreateBudgetLinesResponse {
  return db.transaction(() => {
    const { invoiceId } = request;
    if (invoiceId) {
      // Throws NOT_FOUND (without index) when the invoice is missing.
      listInvoiceBudgetLines(db, invoiceId);
    }

    const lines: BatchCreatedBudgetLine[] = [];
    let remainingAmount: number | null = null;
    for (const [index, entry] of request.lines.entries()) {
      try {
        const result = processEntry(db, userId, invoiceId, vatRate, entry, index);
        lines.push(result.created);
        remainingAmount = result.remainingAmount;
      } catch (error) {
        throw withIndex(error, index);
      }
    }

    return { lines, remainingAmount };
  });
}
