/**
 * Auto-itemize service for invoices.
 *
 * EPIC-16 Story #1547: Handles the auto-itemize workflow:
 * - Dry-run: fetches document content, extracts lines via LLM, returns with warnings
 * - Commit: persists auto-extracted lines to invoice_budget_lines and work_item_budgets
 * - Mode 'replace': deletes existing auto-extracted lines before inserting new ones
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  invoices,
  invoiceBudgetLines,
  workItemBudgets,
  householdItemBudgets,
  documentLinks,
  vendors,
  budgetSources,
  budgetCategories,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  NotFoundError,
  ValidationError,
  ItemizedSumExceedsInvoiceError,
} from '../errors/AppError.js';
import {
  getProvider,
  validateExtractedLines,
  computeDueDateFallback,
  mapCategoryNameToId,
} from './budgetExtraction/index.js';
import * as paperlessService from './paperlessService.js';
import * as invoiceBudgetLineService from './invoiceBudgetLineService.js';
import * as invoiceService from './invoiceService.js';
import type { AppConfig } from '../plugins/config.js';
import type {
  ExtractedLine,
  ExtractionHints,
  InvoiceBudgetLineListDetailResponse,
  InvoicePatchForAutoItemize,
  AutoItemizeDryRunResponse,
  AutoItemizeWarning,
} from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Maximum OCR text size to send to LLM (32KB).
 * Prevents excessively large documents from overwhelming the LLM provider.
 */
const MAX_OCR_CHARS = 32_000;

export interface AutoItemizeRequestBody {
  paperlessDocumentId: number;
  mode: 'append' | 'replace';
  dryRun: boolean;
  lines?: ExtractedLine[];
  invoicePatch?: InvoicePatchForAutoItemize;
}

/**
 * Build extraction hints from invoice metadata for better LLM context.
 */
function buildHints(invoice: typeof invoices.$inferSelect, vendorName?: string): ExtractionHints {
  return {
    vendorName,
    invoiceTotal: invoice.amount,
    invoiceDate: invoice.date,
    locale: 'de-DE',
  };
}

/**
 * Compute warnings based on extracted vs. invoice totals (>1% tolerance).
 */
function computeWarnings(lines: ExtractedLine[], invoiceTotal: number): AutoItemizeWarning[] {
  // No lines extracted is its own (empty) signal — emitting a mismatch warning would be
  // misleading. The UI surfaces "No line items detected" instead.
  if (lines.length === 0) {
    return [];
  }
  const extractedTotal = lines.reduce((sum, l) => sum + (l.totalAmount ?? 0), 0);
  const tolerance = invoiceTotal * 0.01; // 1% tolerance
  if (Math.abs(extractedTotal - invoiceTotal) > tolerance) {
    return [{ code: 'TOTAL_MISMATCH', extractedTotal, invoiceTotal }];
  }
  return [];
}

/**
 * Auto-itemize an invoice: extract line items from OCR and optionally persist them.
 *
 * - dryRun: true + lines absent → fetch Paperless doc, extract via LLM, return with warnings
 * - dryRun: false + lines present → persist lines in a transaction
 *   - mode 'replace' deletes existing auto-extracted lines (origin='auto') first
 *   - all new lines get: work_item_id=NULL, origin='auto', budget_source_id='discretionary-system',
 *     confidence='invoice', vendor_id=invoice.vendor_id
 */
export async function autoItemize(
  db: DbType,
  config: AppConfig,
  invoiceId: string,
  userId: string,
  body: AutoItemizeRequestBody,
  paperlessAuth: { url: string; apiToken: string },
): Promise<AutoItemizeDryRunResponse | InvoiceBudgetLineListDetailResponse> {
  // 1. Verify invoice exists and load vendor + amount
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Load vendor name for extraction hints
  const vendor = db.select().from(vendors).where(eq(vendors.id, invoice.vendorId)).get();
  const vendorName = vendor?.name;

  // 2. Verify the paperlessDocumentId is linked to this invoice
  const docLink = db
    .select()
    .from(documentLinks)
    .where(
      and(
        eq(documentLinks.entityType, 'invoice'),
        eq(documentLinks.entityId, invoiceId),
        eq(documentLinks.paperlessDocumentId, body.paperlessDocumentId),
      ),
    )
    .get();
  if (!docLink) {
    throw new NotFoundError(
      `Paperless document ${body.paperlessDocumentId} is not linked to this invoice`,
    );
  }

  // 3. Dry-run mode: fetch document, extract via LLM, return with warnings
  if (body.dryRun && !body.lines) {
    const doc = await paperlessService.getDocument(
      paperlessAuth.url,
      paperlessAuth.apiToken,
      body.paperlessDocumentId,
    );

    const provider = getProvider(config);
    const hints = buildHints(invoice, vendorName);
    // Truncate OCR text to MAX_OCR_CHARS to prevent LLM overload
    const ocrText =
      (doc.content ?? '').length > MAX_OCR_CHARS
        ? (doc.content ?? '').slice(0, MAX_OCR_CHARS)
        : (doc.content ?? '');
    const result = await provider.extract(ocrText, hints);
    computeDueDateFallback(result);

    // Map LLM-extracted category names to budget category IDs
    const allCategories = db
      .select({
        id: budgetCategories.id,
        name: budgetCategories.name,
        translationKey: budgetCategories.translationKey,
      })
      .from(budgetCategories)
      .all();

    for (const line of result.lines) {
      if (line.category && !line.budgetCategoryId) {
        line.budgetCategoryId = mapCategoryNameToId(line.category, allCategories);
      }
    }

    const warnings = computeWarnings(result.lines, invoice.amount);

    return {
      lines: result.lines,
      warnings,
      ...(result.invoiceDate !== undefined ? { extractedInvoiceDate: result.invoiceDate } : {}),
      ...(result.dueDate !== undefined ? { extractedDueDate: result.dueDate } : {}),
      ...(result.invoiceNumber !== undefined
        ? { extractedInvoiceNumber: result.invoiceNumber }
        : {}),
      ...(result.notes !== undefined ? { extractedNotes: result.notes } : {}),
    };
  }

  // 4. Commit mode: persist lines in a transaction
  if (!body.dryRun && body.lines) {
    // Validate the provided lines (defense in depth)
    const { lines: validatedLines } = validateExtractedLines({ lines: body.lines });

    return db.transaction(() => {
      // 4-pre. Apply invoice metadata patch if provided (must be first in transaction)
      let effectiveInvoiceAmount = invoice.amount;
      if (body.invoicePatch) {
        invoiceService.updateInvoice(
          db,
          invoice.vendorId,
          invoiceId,
          body.invoicePatch,
          config.diaryAutoEvents,
        );
        // Re-read the (possibly-updated) invoice amount for the Σ validation below
        const updatedInvoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
        if (updatedInvoice) {
          effectiveInvoiceAmount = updatedInvoice.amount;
        }
      }

      // 4a. If mode === 'replace', delete existing auto-extracted lines
      if (body.mode === 'replace') {
        // Find all invoice_budget_lines for this invoice that link to auto-extracted work items
        const existingLines = db
          .select()
          .from(invoiceBudgetLines)
          .where(eq(invoiceBudgetLines.invoiceId, invoiceId))
          .all();

        for (const line of existingLines) {
          if (line.workItemBudgetId) {
            const wib = db
              .select()
              .from(workItemBudgets)
              .where(eq(workItemBudgets.id, line.workItemBudgetId))
              .get();
            if (wib && wib.origin === 'auto') {
              // Delete the work_item_budget row (cascades to invoice_budget_lines)
              db.delete(workItemBudgets).where(eq(workItemBudgets.id, line.workItemBudgetId)).run();
            }
          }
        }
      }

      // 4b. Get the discretionary budget source
      const discretionarySource = db
        .select()
        .from(budgetSources)
        .where(eq(budgetSources.id, 'discretionary-system'))
        .get();
      if (!discretionarySource) {
        throw new Error('Discretionary budget source not found');
      }

      // 4c. Insert new lines
      let totalItemized = 0;

      for (const extractedLine of validatedLines) {
        const invoiceBudgetLineId = randomUUID();
        const now = new Date().toISOString();

        // Determine assignment mode (explicit or inferred from assignedBudgetLineId)
        const isAssignExisting =
          extractedLine.assignmentMode === 'assign-existing' ||
          (extractedLine.assignmentMode === undefined && !!extractedLine.assignedBudgetLineId);
        const isCreateNew =
          extractedLine.assignmentMode === 'create-new' ||
          (extractedLine.assignmentMode === undefined && !extractedLine.assignedBudgetLineId);

        // Case 1: Pre-existing budget line assignment + field-level update
        if (isAssignExisting) {
          if (!extractedLine.assignedBudgetLineId || !extractedLine.assignedBudgetLineType) {
            throw new ValidationError(
              'assignedBudgetLineId and assignedBudgetLineType are required when assignmentMode is assign-existing',
            );
          }

          // Look up the budget line in the appropriate table
          let existingBudgetLine:
            | typeof workItemBudgets.$inferSelect
            | typeof householdItemBudgets.$inferSelect
            | undefined = undefined;

          if (extractedLine.assignedBudgetLineType === 'work_item') {
            existingBudgetLine = db
              .select()
              .from(workItemBudgets)
              .where(eq(workItemBudgets.id, extractedLine.assignedBudgetLineId))
              .get();
          } else if (extractedLine.assignedBudgetLineType === 'household_item') {
            existingBudgetLine = db
              .select()
              .from(householdItemBudgets)
              .where(eq(householdItemBudgets.id, extractedLine.assignedBudgetLineId))
              .get();
          }

          if (existingBudgetLine === undefined) {
            throw new NotFoundError(
              `Budget line ${extractedLine.assignedBudgetLineId} (type: ${extractedLine.assignedBudgetLineType}) not found`,
            );
          }

          // Build a diff and update only changed fields
          const updates: Partial<typeof workItemBudgets.$inferInsert> = {};
          let hasChanges = false;

          if (
            extractedLine.description &&
            extractedLine.description !== existingBudgetLine.description
          ) {
            updates.description = extractedLine.description;
            hasChanges = true;
          }

          if (
            extractedLine.quantity !== undefined &&
            extractedLine.quantity !== existingBudgetLine.quantity
          ) {
            updates.quantity = extractedLine.quantity;
            hasChanges = true;
          }

          if (extractedLine.unit && extractedLine.unit !== existingBudgetLine.unit) {
            updates.unit = extractedLine.unit;
            hasChanges = true;
          }

          if (
            extractedLine.unitPrice !== undefined &&
            extractedLine.unitPrice !== existingBudgetLine.unitPrice
          ) {
            updates.unitPrice = extractedLine.unitPrice;
            hasChanges = true;
          }

          if (extractedLine.totalAmount !== existingBudgetLine.plannedAmount) {
            updates.plannedAmount = extractedLine.totalAmount;
            hasChanges = true;
          }

          if (
            extractedLine.includesVat !== undefined &&
            extractedLine.includesVat !== existingBudgetLine.includesVat
          ) {
            updates.includesVat = extractedLine.includesVat;
            hasChanges = true;
          }

          if (
            extractedLine.budgetCategoryId !== undefined &&
            extractedLine.budgetCategoryId !== existingBudgetLine.budgetCategoryId
          ) {
            updates.budgetCategoryId = extractedLine.budgetCategoryId;
            hasChanges = true;
          }

          if (
            extractedLine.budgetSourceId !== undefined &&
            extractedLine.budgetSourceId !== existingBudgetLine.budgetSourceId
          ) {
            updates.budgetSourceId = extractedLine.budgetSourceId;
            hasChanges = true;
          }

          // Always update updatedAt if any field changed
          if (hasChanges) {
            updates.updatedAt = now;

            if (extractedLine.assignedBudgetLineType === 'work_item') {
              db.update(workItemBudgets)
                .set(updates)
                .where(eq(workItemBudgets.id, extractedLine.assignedBudgetLineId))
                .run();
            } else {
              db.update(householdItemBudgets)
                .set(updates as Partial<typeof householdItemBudgets.$inferInsert>)
                .where(eq(householdItemBudgets.id, extractedLine.assignedBudgetLineId))
                .run();
            }
          }

          // Create the invoice_budget_lines junction row if it doesn't already exist
          const existingJunction = db
            .select()
            .from(invoiceBudgetLines)
            .where(
              and(
                eq(invoiceBudgetLines.invoiceId, invoiceId),
                extractedLine.assignedBudgetLineType === 'work_item'
                  ? eq(invoiceBudgetLines.workItemBudgetId, extractedLine.assignedBudgetLineId)
                  : eq(
                      invoiceBudgetLines.householdItemBudgetId,
                      extractedLine.assignedBudgetLineId,
                    ),
              ),
            )
            .get();

          if (!existingJunction) {
            const workItemBudgetId =
              extractedLine.assignedBudgetLineType === 'work_item'
                ? extractedLine.assignedBudgetLineId
                : null;
            const householdItemBudgetId =
              extractedLine.assignedBudgetLineType === 'household_item'
                ? extractedLine.assignedBudgetLineId
                : null;

            db.insert(invoiceBudgetLines)
              .values({
                id: invoiceBudgetLineId,
                invoiceId,
                workItemBudgetId,
                householdItemBudgetId,
                itemizedAmount: extractedLine.totalAmount,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          }

          totalItemized += extractedLine.totalAmount;
        } else if (isCreateNew) {
          // Case 2: Auto-create a new work_item_budget with per-line category/source
          const workItemBudgetId = randomUUID();

          // Resolve budget source: per-line value or discretionary fallback
          const effectiveBudgetSourceId =
            extractedLine.budgetSourceId !== undefined
              ? extractedLine.budgetSourceId
              : discretionarySource.id;

          // Insert work_item_budget with auto origin
          db.insert(workItemBudgets)
            .values({
              id: workItemBudgetId,
              workItemId: null,
              description: extractedLine.description,
              plannedAmount: extractedLine.totalAmount,
              confidence: 'invoice',
              budgetCategoryId: extractedLine.budgetCategoryId ?? null,
              budgetSourceId: effectiveBudgetSourceId,
              vendorId: invoice.vendorId,
              quantity: extractedLine.quantity ?? null,
              unit: extractedLine.unit ?? null,
              unitPrice: extractedLine.unitPrice ?? null,
              includesVat: extractedLine.includesVat !== false,
              createdBy: userId,
              createdAt: now,
              updatedAt: now,
              origin: 'auto',
            })
            .run();

          // Insert invoice_budget_lines junction row
          db.insert(invoiceBudgetLines)
            .values({
              id: invoiceBudgetLineId,
              invoiceId,
              workItemBudgetId,
              householdItemBudgetId: null,
              itemizedAmount: extractedLine.totalAmount,
              createdAt: now,
              updatedAt: now,
            })
            .run();

          totalItemized += extractedLine.totalAmount;
        }
      }

      // 4d. Validate Σ itemized ≤ effective invoice.amount (post-patch)
      if (totalItemized > effectiveInvoiceAmount) {
        throw new ItemizedSumExceedsInvoiceError(
          `Sum of itemized amounts (${totalItemized}) exceeds invoice total (${effectiveInvoiceAmount})`,
        );
      }

      // 4e. Return the full invoice budget lines list
      return invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);
    });
  }

  // Invalid request: must be (dryRun && no lines) OR (!dryRun && lines)
  throw new ValidationError(
    'Invalid request: dryRun=true requires no lines, dryRun=false requires lines',
  );
}
