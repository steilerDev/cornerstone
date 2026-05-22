/**
 * Auto-itemize service for invoices.
 *
 * EPIC-16 Story #1547: Handles the auto-itemize workflow:
 * - Dry-run: fetches document content, extracts lines via LLM, returns with warnings
 * - Commit: persists auto-extracted lines to invoice_budget_lines and work_item_budgets
 * - Mode 'replace': deletes existing auto-extracted lines before inserting new ones
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schemaTypes from '../db/schema.js';
import {
  invoices,
  invoiceBudgetLines,
  workItemBudgets,
  documentLinks,
  vendors,
  budgetSources,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  NotFoundError,
  ValidationError,
  ItemizedSumExceedsInvoiceError,
} from '../errors/AppError.js';
import { getProvider, validateExtractedLines } from './budgetExtraction/index.js';
import * as paperlessService from './paperlessService.js';
import * as invoiceBudgetLineService from './invoiceBudgetLineService.js';
import type { AppConfig } from '../plugins/config.js';
import type { ExtractedLine, ExtractionHints } from './budgetExtraction/types.js';
import type {
  InvoiceBudgetLineListDetailResponse,
} from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface AutoItemizeRequestBody {
  paperlessDocumentId: number;
  mode: 'append' | 'replace';
  dryRun: boolean;
  lines?: ExtractedLine[];
}

export interface AutoItemizeWarning {
  code: 'TOTAL_MISMATCH';
  extractedTotal: number;
  invoiceTotal: number;
}

export interface AutoItemizeDryRunResponse {
  lines: ExtractedLine[];
  warnings: AutoItemizeWarning[];
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
  const invoice = db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Load vendor name for extraction hints
  const vendor = db
    .select()
    .from(vendors)
    .where(eq(vendors.id, invoice.vendorId))
    .get();
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
    const extractedLines = await provider.extract(doc.content ?? '', hints);
    const warnings = computeWarnings(extractedLines, invoice.amount);

    return {
      lines: extractedLines,
      warnings,
    };
  }

  // 4. Commit mode: persist lines in a transaction
  if (!body.dryRun && body.lines) {
    // Validate the provided lines (defense in depth)
    const validatedLines = validateExtractedLines({ lines: body.lines });

    return db.transaction(() => {
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
              db.delete(workItemBudgets)
                .where(eq(workItemBudgets.id, line.workItemBudgetId))
                .run();
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
        const workItemBudgetId = randomUUID();
        const invoiceBudgetLineId = randomUUID();
        const now = new Date().toISOString();

        // Insert work_item_budget with auto origin
        db.insert(workItemBudgets)
          .values({
            id: workItemBudgetId,
            workItemId: null,
            description: extractedLine.description,
            plannedAmount: extractedLine.totalAmount,
            confidence: 'invoice',
            budgetCategoryId: null,
            budgetSourceId: discretionarySource.id,
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

      // 4d. Validate Σ itemized ≤ invoice.amount
      if (totalItemized > invoice.amount) {
        throw new ItemizedSumExceedsInvoiceError(
          `Sum of itemized amounts (${totalItemized}) exceeds invoice total (${invoice.amount})`,
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
