import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoices, invoiceBudgetLines, invoiceDeposits, documentLinks } from '../db/schema.js';
import type { ConvertQuotationRequest, Invoice } from '@cornerstone/shared';
import {
  AppError,
  DepositsExceedInvoiceTotalError,
  InvoiceNotQuotationError,
  ItemizedSumExceedsInvoiceError,
  NotFoundError,
  ValidationError,
} from '../errors/AppError.js';
import { createLink, updateAttachmentType } from './documentLinkService.js';
import { getInvoiceById } from './invoiceService.js';
import { onInvoiceStatusChanged } from './diaryAutoEventService.js';
import { exceedsAmount } from './shared/money.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTES_LENGTH = 10000;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Convert a quotation into the final invoice in a single transaction (Story #2107).
 * All validation and writes happen inside the transaction; if any step throws,
 * nothing is changed. The diary event fires after commit.
 *
 * @throws NotFoundError if the invoice or a referenced budget line is not found
 * @throws InvoiceNotQuotationError if the invoice status is not 'quotation'
 * @throws ValidationError on invalid input
 * @throws ItemizedSumExceedsInvoiceError if itemized lines would exceed the final amount
 * @throws DepositsExceedInvoiceTotalError if net deposits exceed the final amount
 * @throws AppError (DUPLICATE_DOCUMENT_LINK) if the document is linked as quotation/deposit
 */
export function convertQuotation(
  db: DbType,
  invoiceId: string,
  data: ConvertQuotationRequest,
  userId: string,
  diaryAutoEvents: boolean = true,
): Invoice {
  const result = db.transaction(() => {
    // a. Load invoice
    const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    if (!row) {
      throw new NotFoundError('Invoice not found');
    }

    // b. Status guard
    if (row.status !== 'quotation') {
      throw new InvoiceNotQuotationError(undefined, { status: row.status });
    }

    // c. Field validation
    if (!(data.amount > 0)) {
      throw new ValidationError('Amount must be greater than 0');
    }
    if (!isValidIsoDate(data.date)) {
      throw new ValidationError('Date must be a valid ISO date (YYYY-MM-DD)');
    }
    if (data.dueDate !== undefined && data.dueDate !== null && !isValidIsoDate(data.dueDate)) {
      throw new ValidationError('Due date must be a valid ISO date (YYYY-MM-DD)');
    }
    const effectiveDueDate = data.dueDate === undefined ? row.dueDate : data.dueDate;
    if (effectiveDueDate && effectiveDueDate.slice(0, 10) < data.date) {
      throw new ValidationError('Due date must be on or after the invoice date');
    }

    // d. Notes
    const note = data.conversionNote.trim();
    if (!note) {
      throw new ValidationError('conversionNote is required');
    }
    const base = ((data.notes === undefined ? row.notes : data.notes) ?? '').trim();
    const finalNotes = base ? `${base}\n\n${note}` : note;
    if (finalNotes.length > MAX_NOTES_LENGTH) {
      throw new ValidationError(
        `Notes including the conversion note must be ${MAX_NOTES_LENGTH} characters or less`,
      );
    }

    // e. Line updates
    const updates = data.budgetLines ?? [];
    const updateIds = new Set<string>();
    for (const u of updates) {
      if (updateIds.has(u.id)) {
        throw new ValidationError('Duplicate budget line id');
      }
      updateIds.add(u.id);
    }
    const lineRows = db
      .select()
      .from(invoiceBudgetLines)
      .where(eq(invoiceBudgetLines.invoiceId, invoiceId))
      .all();
    const lineIds = new Set(lineRows.map((l) => l.id));
    for (const u of updates) {
      if (!lineIds.has(u.id)) {
        throw new NotFoundError('Invoice budget line not found in this invoice');
      }
      if (!(u.itemizedAmount > 0)) {
        throw new ValidationError('Itemized amount must be greater than 0');
      }
    }

    // f. Itemized sum
    const newAmounts = new Map(updates.map((u) => [u.id, u.itemizedAmount]));
    const itemizedSum = lineRows.reduce(
      (acc, l) => acc + (newAmounts.get(l.id) ?? l.itemizedAmount),
      0,
    );
    if (exceedsAmount(itemizedSum, data.amount)) {
      throw new ItemizedSumExceedsInvoiceError(
        `Sum of itemized amounts (${itemizedSum}) would exceed invoice total (${data.amount})`,
        { invoiceTotal: data.amount, itemizedTotal: itemizedSum },
      );
    }

    // g. Deposits (never modified)
    const depositRows = db
      .select()
      .from(invoiceDeposits)
      .where(eq(invoiceDeposits.invoiceId, invoiceId))
      .all();
    const depositTotal = depositRows
      .filter((d) => d.entryType === 'deposit')
      .reduce((acc, d) => acc + d.amount, 0);
    const refundTotal = depositRows
      .filter((d) => d.entryType === 'refund')
      .reduce((acc, d) => acc + d.amount, 0);
    const net = depositTotal - refundTotal;
    if (exceedsAmount(net, data.amount)) {
      throw new DepositsExceedInvoiceTotalError(
        'Net deposits exceed the final invoice amount; add a refund entry or increase the amount',
        {
          invoiceTotal: data.amount,
          depositTotal,
          refundTotal,
          netDeposits: net,
          shortfall: Math.round((net - data.amount) * 100) / 100,
        },
      );
    }

    // g2. Decide document link outcome (validation before any write)
    let linkAction: 'none' | 'create' | 'upgrade' = 'none';
    let existingLinkId: string | null = null;
    if (data.paperlessDocumentId !== undefined) {
      const link = db
        .select()
        .from(documentLinks)
        .where(
          and(
            eq(documentLinks.entityType, 'invoice'),
            eq(documentLinks.entityId, invoiceId),
            eq(documentLinks.paperlessDocumentId, data.paperlessDocumentId),
          ),
        )
        .get();
      if (!link) {
        linkAction = 'create';
      } else if (link.attachmentType === null) {
        linkAction = 'upgrade';
        existingLinkId = link.id;
      } else if (link.attachmentType !== 'invoice') {
        throw new AppError(
          'DUPLICATE_DOCUMENT_LINK',
          409,
          'This document is already linked to this invoice as a quotation or deposit attachment',
        );
      }
    }

    // h. Update invoice
    const now = new Date().toISOString();
    const newInvoiceNumber =
      data.invoiceNumber !== undefined ? data.invoiceNumber?.trim() || null : row.invoiceNumber;
    db.update(invoices)
      .set({
        amount: data.amount,
        date: data.date,
        status: data.status,
        notes: finalNotes,
        updatedAt: now,
        ...(data.invoiceNumber !== undefined && { invoiceNumber: newInvoiceNumber }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      })
      .where(eq(invoices.id, invoiceId))
      .run();

    // i. Line amounts
    for (const u of updates) {
      db.update(invoiceBudgetLines)
        .set({ itemizedAmount: u.itemizedAmount, updatedAt: now })
        .where(eq(invoiceBudgetLines.id, u.id))
        .run();
    }

    // j. Apply document link outcome
    if (linkAction === 'create' && data.paperlessDocumentId !== undefined) {
      createLink(db, 'invoice', invoiceId, data.paperlessDocumentId, userId, 'invoice');
    } else if (linkAction === 'upgrade' && existingLinkId) {
      updateAttachmentType(db, existingLinkId, 'invoice');
    }

    return { invoiceNumber: newInvoiceNumber };
  });

  // Diary event after commit
  onInvoiceStatusChanged(
    db,
    diaryAutoEvents,
    invoiceId,
    result.invoiceNumber || 'N/A',
    'quotation',
    data.status,
  );

  return getInvoiceById(db, invoiceId);
}
