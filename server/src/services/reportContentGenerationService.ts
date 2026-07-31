/**
 * Service for generating AI-assisted report content.
 * Story #1901: Generate cover letter and invoice descriptions using LLM.
 */

import { inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoices, workItems, householdItems } from '../db/schema.js';
import type { GenerateReportContentRequest } from '@cornerstone/shared';
import type {
  GenerateReportContentLlmInput,
  GenerateReportContentLlmInvoice,
  GenerateReportContentLlmInvoiceLine,
  GenerateReportContentLlmResult,
} from './budgetExtraction/types.js';
import { getProvider } from './budgetExtraction/index.js';
import { getSourceReport } from './sourceReportService.js';
import { EmptySelectionError } from '../errors/AppError.js';
import type { AppConfig } from '../plugins/config.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Truncates a string to a maximum length.
 */
function truncate(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Generate AI-assisted report content (cover letter + invoice descriptions).
 *
 * @param db - Database instance
 * @param config - Application config (for LLM and currency)
 * @param body - Request body with type, sourceId, language, includedInvoiceIds, excludedLineIds
 * @returns Object with letterSubject, letterBody, and descriptions
 * @throws EmptySelectionError if no invoices match the selection
 * @throws NotFoundError if sourceId not found
 * @throws LLM errors if generation fails
 */
export async function generateReportContent(
  db: DbType,
  config: AppConfig,
  body: GenerateReportContentRequest,
): Promise<GenerateReportContentLlmResult> {
  // Re-fetch the report server-side to avoid trusting client-provided invoice data
  const report = await getSourceReport(db, body.type, body.sourceId, {
    paperlessEnabled: false, // Skip Paperless enrichment for this call
  });

  // Filter includedInvoiceIds to report's actual invoice IDs
  const reportInvoiceIds = new Set(report.invoices.map((inv) => inv.invoiceId));
  const includedInvoiceIds = body.includedInvoiceIds.filter((id) => reportInvoiceIds.has(id));

  // Throw EMPTY_SELECTION if none matched
  if (includedInvoiceIds.length === 0) {
    throw new EmptySelectionError('Select at least one invoice.');
  }

  // Build excludedLineIds Set for fast lookup
  const excludedLineIds = new Set(body.excludedLineIds ?? []);

  // Compute includedTotal using excluded lines logic
  // (mirrors client's applyLineExclusions: sum allocatedAmount of non-excluded lines)
  let includedTotal = 0;
  for (const inv of report.invoices) {
    if (!includedInvoiceIds.includes(inv.invoiceId)) {
      continue; // Not in included set
    }
    // Start with invoice's allocated amount
    let invContribution = inv.allocatedAmount;
    // Subtract excluded budget lines' allocatedPortion
    for (const line of inv.budgetLines) {
      if (excludedLineIds.has(line.id)) {
        invContribution -= line.allocatedPortion;
      }
    }
    includedTotal += invContribution;
  }
  // Round to nearest cent
  includedTotal = Math.round(includedTotal);

  // Fetch invoice notes and linked-item descriptions in bulk
  const invoiceIds = report.invoices
    .filter((inv) => includedInvoiceIds.includes(inv.invoiceId))
    .map((inv) => inv.invoiceId);

  // Fetch invoices for notes
  const invoicesData =
    invoiceIds.length > 0
      ? db
          .select({ id: invoices.id, notes: invoices.notes })
          .from(invoices)
          .where(inArray(invoices.id, invoiceIds))
          .all()
      : [];
  const invoicesNotesMap = new Map(invoicesData.map((inv) => [inv.id, inv.notes]));

  // Collect linked item IDs from non-excluded budget lines
  const linkedItemIds = new Set<string>();
  const linkedItemTypes = new Map<string, 'work_item' | 'household_item'>();
  for (const inv of report.invoices) {
    if (!includedInvoiceIds.includes(inv.invoiceId)) {
      continue;
    }
    for (const line of inv.budgetLines) {
      if (!excludedLineIds.has(line.id) && line.linkedItem) {
        linkedItemIds.add(line.linkedItem.id);
        linkedItemTypes.set(line.linkedItem.id, line.linkedItem.type);
      }
    }
  }

  // Fetch work item descriptions
  const workItemIds = Array.from(linkedItemIds).filter(
    (id) => linkedItemTypes.get(id) === 'work_item',
  );
  const workItemsData =
    workItemIds.length > 0
      ? db
          .select({ id: workItems.id, description: workItems.description })
          .from(workItems)
          .where(inArray(workItems.id, workItemIds))
          .all()
      : [];
  const workItemsDescMap = new Map(workItemsData.map((wi) => [wi.id, wi.description]));

  // Fetch household item descriptions
  const householdItemIds = Array.from(linkedItemIds).filter(
    (id) => linkedItemTypes.get(id) === 'household_item',
  );
  const householdItemsData =
    householdItemIds.length > 0
      ? db
          .select({ id: householdItems.id, description: householdItems.description })
          .from(householdItems)
          .where(inArray(householdItems.id, householdItemIds))
          .all()
      : [];
  const householdItemsDescMap = new Map(householdItemsData.map((hi) => [hi.id, hi.description]));

  // Build GenerateReportContentLlmInput
  const llmInvoices: GenerateReportContentLlmInvoice[] = [];
  for (const inv of report.invoices) {
    if (!includedInvoiceIds.includes(inv.invoiceId)) {
      continue;
    }

    const budgetLines: GenerateReportContentLlmInvoiceLine[] = [];
    for (const line of inv.budgetLines) {
      if (excludedLineIds.has(line.id)) {
        continue; // Skip excluded lines
      }

      const linkedItemName = line.linkedItem?.name ?? 'Unknown item';
      let linkedItemDescription: string | null = null;

      if (line.linkedItem) {
        const id = line.linkedItem.id;
        const type = line.linkedItem.type;
        if (type === 'work_item') {
          linkedItemDescription = truncate(workItemsDescMap.get(id) ?? null, 300);
        } else if (type === 'household_item') {
          linkedItemDescription = truncate(householdItemsDescMap.get(id) ?? null, 300);
        }
      }

      budgetLines.push({
        description: line.description || 'Work item',
        linkedItemName,
        linkedItemDescription,
      });
    }

    const invoiceNotes = truncate(invoicesNotesMap.get(inv.invoiceId) ?? null, 500);
    llmInvoices.push({
      invoiceId: inv.invoiceId,
      vendorName: inv.vendorName,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      amount: inv.allocatedAmount, // Send allocated amount for this invoice
      notes: invoiceNotes,
      budgetLines,
    });
  }

  const input: GenerateReportContentLlmInput = {
    language: body.language,
    reportType: body.type,
    sourceName: report.source.name,
    sourceType: report.source.sourceType,
    totalAmount: includedTotal,
    currency: config.currency,
    invoices: llmInvoices,
  };

  // Call LLM to generate content
  const provider = getProvider(config);
  const result = await provider.generateReportContent(input);

  // Defense-in-depth: filter descriptions to only included invoice IDs
  const filteredDescriptions: Record<string, string> = {};
  for (const invoiceId of includedInvoiceIds) {
    if (result.descriptions[invoiceId]) {
      filteredDescriptions[invoiceId] = result.descriptions[invoiceId]!;
    }
  }

  return {
    letterSubject: result.letterSubject,
    letterBody: result.letterBody,
    descriptions: filteredDescriptions,
  };
}
