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
  InvoiceStatus,
} from '@cornerstone/shared';
import { effectiveLineAmount } from '@cornerstone/shared';

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

      // 4b-4d. Persist lines (includes validation)
      persistLines(db, invoiceId, invoice.vendorId, userId, validatedLines, effectiveInvoiceAmount);

      // 4e. Return the full invoice budget lines list
      return invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);
    });
  }

  // Invalid request: must be (dryRun && no lines) OR (!dryRun && lines)
  throw new ValidationError(
    'Invalid request: dryRun=true requires no lines, dryRun=false requires lines',
  );
}

/**
 * Persist extracted lines into invoice_budget_lines and work_item_budgets.
 * Must be called inside a db.transaction().
 * Extracted from the commit branch of autoItemize() for reuse in EPIC-18 create-on-confirm flow.
 *
 * @param db - Database connection
 * @param invoiceId - Invoice ID to link budget lines to
 * @param vendorId - Vendor ID to use for new work_item_budget rows
 * @param userId - User ID for createdBy field
 * @param lines - Extracted lines to persist
 * @param effectiveInvoiceAmount - Invoice amount for validation (may differ from original if patched)
 * @returns Object with totalItemized amount for remaining calculation
 * @throws ItemizedSumExceedsInvoiceError if sum of itemized amounts exceeds invoice total
 * @throws NotFoundError if budget line IDs are invalid
 * @throws ValidationError if assignment mode is invalid
 */
export function persistLines(
  db: DbType,
  invoiceId: string,
  vendorId: string,
  userId: string,
  lines: ExtractedLine[],
  effectiveInvoiceAmount: number,
): { totalItemized: number } {
  const now = new Date().toISOString();

  // Get the discretionary budget source
  const discretionarySource = db
    .select()
    .from(budgetSources)
    .where(eq(budgetSources.id, 'discretionary-system'))
    .get();
  if (!discretionarySource) {
    throw new Error('Discretionary budget source not found');
  }

  let totalItemized = 0;

  for (const extractedLine of lines) {
    const invoiceBudgetLineId = randomUUID();

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
              : eq(invoiceBudgetLines.householdItemBudgetId, extractedLine.assignedBudgetLineId),
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

      totalItemized += effectiveLineAmount({
        amount: extractedLine.totalAmount ?? 0,
        includesVat: extractedLine.includesVat,
      });
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
          vendorId,
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

      totalItemized += effectiveLineAmount({
        amount: extractedLine.totalAmount ?? 0,
        includesVat: extractedLine.includesVat,
      });
    }
  }

  // Validate Σ itemized ≤ effective invoice.amount
  if (totalItemized > effectiveInvoiceAmount) {
    throw new ItemizedSumExceedsInvoiceError(
      `Sum of itemized amounts (${totalItemized}) exceeds invoice total (${effectiveInvoiceAmount})`,
    );
  }

  return { totalItemized };
}

/**
 * Core extraction logic: fetch document, extract via LLM, map categories, compute due-date fallback.
 * Extracted from autoItemize() for reuse in preview and commit flows.
 *
 * @param db - Database connection
 * @param config - Application config
 * @param paperlessAuth - Paperless authentication (url, apiToken)
 * @param paperlessDocumentId - Document ID to extract from
 * @param hints - Extraction hints (vendor name, invoice total, locale, etc.)
 * @returns Extraction result with lines and document-level metadata
 * @throws NotFoundError if document not found
 * @throws Various extraction errors from LLM provider
 */
interface ExtractionCoreResult {
  lines: ExtractedLine[];
  extractedInvoiceDate?: string;
  extractedDueDate?: string;
  extractedInvoiceNumber?: string;
  extractedNotes?: string;
  chosenVendorName?: string | null;
}

async function runExtractionCore(
  db: DbType,
  config: AppConfig,
  paperlessAuth: { url: string; apiToken: string },
  paperlessDocumentId: number,
  hints: ExtractionHints,
): Promise<ExtractionCoreResult> {
  const doc = await paperlessService.getDocument(
    paperlessAuth.url,
    paperlessAuth.apiToken,
    paperlessDocumentId,
  );

  const provider = getProvider(config);
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

  return {
    lines: result.lines,
    ...(result.invoiceDate !== undefined ? { extractedInvoiceDate: result.invoiceDate } : {}),
    ...(result.dueDate !== undefined ? { extractedDueDate: result.dueDate } : {}),
    ...(result.invoiceNumber !== undefined ? { extractedInvoiceNumber: result.invoiceNumber } : {}),
    ...(result.notes !== undefined ? { extractedNotes: result.notes } : {}),
    ...(result.chosenVendorName !== undefined ? { chosenVendorName: result.chosenVendorName } : {}),
  };
}

/**
 * Preview auto-itemize: stateless LLM extraction with vendor matching.
 * Fetches all vendors, injects into LLM prompt, returns suggested vendor ID.
 *
 * EPIC-18 Story #1679: Paperless-first invoice creation with LLM auto-itemize preview.
 *
 * @param db - Database connection
 * @param config - Application config
 * @param body - Request body with paperlessDocumentId and locale
 * @param paperlessAuth - Paperless authentication
 * @returns Preview response with lines, suggested vendor ID, and optional metadata
 * @throws NotFoundError if document not found
 * @throws Various extraction errors from LLM provider
 */
export async function previewAutoItemize(
  db: DbType,
  config: AppConfig,
  body: { paperlessDocumentId: number; locale?: string },
  paperlessAuth: { url: string; apiToken: string },
) {
  // Load all vendors for injection into LLM prompt
  const allVendors = db.select({ id: vendors.id, name: vendors.name }).from(vendors).all();

  // Build base hints with vendor list
  const hints: ExtractionHints = {
    locale: body.locale ?? 'de-DE',
    invoiceTotal: undefined,
    invoiceDate: undefined,
    vendorName: undefined,
    availableVendors: allVendors,
  };

  // Run extraction core
  const result = await runExtractionCore(
    db,
    config,
    paperlessAuth,
    body.paperlessDocumentId,
    hints,
  );

  // Resolve chosenVendorName to vendor ID (case-insensitive exact match)
  let suggestedVendorId: string | null = null;
  if (result.chosenVendorName) {
    const match = allVendors.find(
      (v) => v.name.toLowerCase() === result.chosenVendorName?.toLowerCase(),
    );
    suggestedVendorId = match?.id ?? null;
  }

  return {
    lines: result.lines,
    suggestedVendorId,
    ...(result.extractedInvoiceNumber !== undefined
      ? { extractedInvoiceNumber: result.extractedInvoiceNumber }
      : {}),
    ...(result.extractedInvoiceDate !== undefined
      ? { extractedInvoiceDate: result.extractedInvoiceDate }
      : {}),
    ...(result.extractedDueDate !== undefined ? { extractedDueDate: result.extractedDueDate } : {}),
    ...(result.extractedNotes !== undefined ? { extractedNotes: result.extractedNotes } : {}),
  };
}

/**
 * Create invoice and itemize in a single atomic transaction.
 * Validates vendor, inserts invoice and document_links, then itemizes extracted lines.
 *
 * EPIC-18 Story #1679: Paperless-first invoice creation with atomic create-on-confirm.
 *
 * @param db - Database connection
 * @param config - Application config
 * @param userId - User ID for createdBy field
 * @param body - Request body with vendor, invoice, lines, and paperlessDocumentId
 * @returns Response with invoice, budget lines, and remaining amount
 * @throws NotFoundError if vendor not found
 * @throws ValidationError if invoice fields are invalid
 * @throws ItemizedSumExceedsInvoiceError if itemized total exceeds invoice amount
 */
export async function commitAutoItemizeCreate(
  db: DbType,
  config: AppConfig,
  userId: string,
  body: {
    paperlessDocumentId: number;
    vendorId: string;
    invoice: {
      invoiceNumber?: string | null;
      amount: number;
      date: string;
      dueDate?: string | null;
      notes?: string | null;
      status?: InvoiceStatus;
    };
    lines: ExtractedLine[];
  },
) {
  return db.transaction(() => {
    // 1. Validate vendor exists
    invoiceService.assertVendorExists(db, body.vendorId);

    // 2. Validate invoice fields (same rules as createInvoice)
    if (body.invoice.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    if (!isValidIsoDate(body.invoice.date)) {
      throw new ValidationError('Date must be a valid ISO date (YYYY-MM-DD)');
    }

    if (body.invoice.dueDate !== undefined && body.invoice.dueDate !== null) {
      if (!isValidIsoDate(body.invoice.dueDate)) {
        throw new ValidationError('Due date must be a valid ISO date (YYYY-MM-DD)');
      }
      if (body.invoice.dueDate < body.invoice.date) {
        throw new ValidationError('Due date must be on or after the invoice date');
      }
    }

    // 3. Validate lines
    const { lines: validatedLines } = validateExtractedLines({ lines: body.lines });

    // 4. Insert invoice
    const invoiceId = randomUUID();
    const now = new Date().toISOString();

    db.insert(invoices)
      .values({
        id: invoiceId,
        vendorId: body.vendorId,
        invoiceNumber: body.invoice.invoiceNumber ?? null,
        amount: body.invoice.amount,
        date: body.invoice.date,
        dueDate: body.invoice.dueDate ?? null,
        status: body.invoice.status ?? 'pending',
        notes: body.invoice.notes ?? null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 5. Insert document_links row
    db.insert(documentLinks)
      .values({
        id: randomUUID(),
        entityType: 'invoice',
        entityId: invoiceId,
        paperlessDocumentId: body.paperlessDocumentId,
        createdBy: userId,
        createdAt: now,
      })
      .run();

    // 6. Persist lines
    const { totalItemized } = persistLines(
      db,
      invoiceId,
      body.vendorId,
      userId,
      validatedLines,
      body.invoice.amount,
    );

    // 7. Fetch and return invoice with budget lines
    const invoiceRow = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    if (!invoiceRow) {
      throw new Error('Failed to fetch created invoice');
    }

    const vendorRow = db.select().from(vendors).where(eq(vendors.id, body.vendorId)).get();
    if (!vendorRow) {
      throw new Error('Vendor not found');
    }

    const invoice = invoiceService.toInvoice(db, invoiceRow, vendorRow.name);
    const budgetLines = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);
    const remainingAmount = body.invoice.amount - totalItemized;

    return {
      invoice,
      budgetLines,
      remainingAmount,
    };
  });
}

/**
 * Helper to validate ISO date format (YYYY-MM-DD).
 */
function isValidIsoDate(value: string): boolean {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(value)) return false;
  // Also validate that it's a real date
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime());
}
