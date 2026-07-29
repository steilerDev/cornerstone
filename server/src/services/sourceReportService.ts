import { eq, inArray, and, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { budgetSources, invoices, invoiceDeposits, documentLinks } from '../db/schema.js';
import type {
  SourceReportType,
  SourceReportResponse,
  SourceReportInvoice,
  SourceReportUnallocatedInvoice,
  SourceReportSourceSummary,
  MarkClaimedResponse,
  AttachmentType,
  SourceReportDocument,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, InvoicesNotClaimableError } from '../errors/AppError.js';
import { toCents } from './shared/money.js';
import {
  computeStatusContributionByInvoice,
  splitByDeposits,
  type DepositAwareRow,
} from './shared/depositAggregateUtils.js';
import { onInvoiceStatusChanged, onDepositStatusChanged } from './diaryAutoEventService.js';
import * as paperlessService from './paperlessService.js';
import { ALLOWED_TRANSITIONS } from './invoiceDepositService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get today's date in ISO YYYY-MM-DD format (server's local timezone).
 */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Get a source report for a given budget source and report type.
 * The report includes all invoices whose budget lines reference this source,
 * filtered by the statuses specified for the report type.
 */
export async function getSourceReport(
  db: DbType,
  type: SourceReportType,
  sourceId: string,
  paperlessConfig: {
    paperlessEnabled: boolean;
    paperlessUrl?: string;
    paperlessApiToken?: string;
  },
): Promise<SourceReportResponse> {
  // 1. Fetch budget source
  const source = db.select().from(budgetSources).where(eq(budgetSources.id, sourceId)).get();
  if (!source) {
    throw new NotFoundError('Budget source not found');
  }

  // 2. Determine target statuses based on report type
  const targetStatuses = new Set<string>();
  switch (type) {
    case 'budget-overview':
      // All 4 statuses including quotation
      targetStatuses.add('quotation');
      targetStatuses.add('pending');
      targetStatuses.add('paid');
      targetStatuses.add('claimed');
      break;
    case 'claim':
      // Only pending and paid
      targetStatuses.add('pending');
      targetStatuses.add('paid');
      break;
    case 'proof-of-funds':
      // Only claimed
      targetStatuses.add('claimed');
      break;
  }

  // 3. Query rows (invoice + deposits) for this source
  type SourceReportRow = DepositAwareRow & {
    invoice_number: string | null;
    invoice_date: string;
    vendor_id: string;
    vendor_name: string;
  };

  const rows = db.all<SourceReportRow>(
    sql`SELECT
      ibl.id              AS ibl_id,
      ibl.itemized_amount AS itemized_amount,
      i.id                AS invoice_id,
      i.amount            AS invoice_amount,
      i.status            AS invoice_status,
      i.invoice_number    AS invoice_number,
      i.date              AS invoice_date,
      i.vendor_id         AS vendor_id,
      v.name              AS vendor_name,
      d.id                AS deposit_id,
      d.amount            AS deposit_amount,
      d.status            AS deposit_status,
      d.entry_type        AS deposit_entry_type
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    INNER JOIN vendors v ON v.id = i.vendor_id
    LEFT JOIN invoice_deposits d ON d.invoice_id = i.id
    WHERE (
      (ibl.work_item_budget_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM work_item_budgets wib
        WHERE wib.id = ibl.work_item_budget_id AND wib.budget_source_id = ${sourceId}
      ))
      OR
      (ibl.household_item_budget_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_item_budgets hib
        WHERE hib.id = ibl.household_item_budget_id AND hib.budget_source_id = ${sourceId}
      ))
    )`,
  );

  // 4. Compute contributions per invoice, then round to 2dp
  const rawContributions = computeStatusContributionByInvoice(rows, targetStatuses);

  // Build a map of invoice metadata for quick lookup
  const invoiceMetadata = new Map<
    string,
    {
      vendorId: string;
      vendorName: string;
      invoiceNumber: string | null;
      date: string;
      status: string;
      invoiceAmount: number;
    }
  >();
  for (const row of rows) {
    if (!invoiceMetadata.has(row.invoice_id)) {
      invoiceMetadata.set(row.invoice_id, {
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        invoiceNumber: row.invoice_number,
        date: row.invoice_date,
        status: row.invoice_status,
        invoiceAmount: row.invoice_amount,
      });
    }
  }

  // 5. Compute isSplit for all report invoices in one query
  const reportInvoiceIds = Array.from(invoiceMetadata.keys());
  const splitRows = db.all<{ invoice_id: string; source_count: number }>(
    sql`SELECT ibl.invoice_id AS invoice_id,
           COUNT(DISTINCT COALESCE(wib.budget_source_id, hib.budget_source_id)) AS source_count
    FROM invoice_budget_lines ibl
    LEFT JOIN work_item_budgets wib ON wib.id = ibl.work_item_budget_id
    LEFT JOIN household_item_budgets hib ON hib.id = ibl.household_item_budget_id
    WHERE ibl.invoice_id IN (${sql.join(
      reportInvoiceIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    GROUP BY ibl.invoice_id`,
  );

  const isSplitMap = new Map<string, boolean>();
  for (const row of splitRows) {
    isSplitMap.set(row.invoice_id, row.source_count > 1);
  }

  // 6. Precompute deposit splits for all invoices
  const splitsByInvoiceId = splitByDeposits(rows);

  // 7. Build report invoices
  const reportInvoices: SourceReportInvoice[] = [];
  for (const [invoiceId, rawAmount] of rawContributions) {
    const metadata = invoiceMetadata.get(invoiceId)!;
    const roundedAmount = toCents(rawAmount) / 100;

    // Drop exactly 0, otherwise include
    if (roundedAmount === 0) continue;

    const lineKind = roundedAmount > 0 ? 'invoice' : 'refund-adjustment';

    // Determine which stages to include for document filtering
    const stages = new Set<AttachmentType>();
    const split = splitsByInvoiceId.get(invoiceId)!;

    if (split.invoiceStatus === 'quotation' && targetStatuses.has('quotation')) {
      stages.add('quotation');
    }
    if (
      split.residualFraction > 0 &&
      split.invoiceStatus !== 'quotation' &&
      targetStatuses.has(split.invoiceStatus)
    ) {
      stages.add('invoice');
    }
    for (const df of split.depositFractions) {
      if (targetStatuses.has(df.depositStatus)) {
        stages.add('deposit');
      }
    }

    // Fetch document links for this invoice
    const links = db
      .select()
      .from(documentLinks)
      .where(and(eq(documentLinks.entityType, 'invoice'), eq(documentLinks.entityId, invoiceId)))
      .all();

    // Filter docs to match stages, include untagged always
    const documentIds = links
      .filter(
        (link) => link.attachmentType === null || stages.has(link.attachmentType as AttachmentType),
      )
      .map((link) => link.paperlessDocumentId);

    // Batch resolve ASN/title from Paperless
    const paperlessDocMap = new Map<
      number,
      { archiveSerialNumber: number | null; title: string | null }
    >();
    if (
      paperlessConfig.paperlessEnabled &&
      paperlessConfig.paperlessUrl &&
      paperlessConfig.paperlessApiToken &&
      documentIds.length > 0
    ) {
      try {
        const docs = await paperlessService.getDocuments(
          paperlessConfig.paperlessUrl,
          paperlessConfig.paperlessApiToken,
          documentIds,
        );
        for (const doc of docs.values()) {
          paperlessDocMap.set(doc.id, {
            archiveSerialNumber: doc.archiveSerialNumber,
            title: doc.title,
          });
        }
      } catch (err) {
        // Degrade gracefully — getDocuments throws, we just use nulls
        console.warn('[sourceReport] Paperless.getDocuments failed, degrading to null ASN/title', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const documents: SourceReportDocument[] = links
      .filter(
        (link) => link.attachmentType === null || stages.has(link.attachmentType as AttachmentType),
      )
      .map((link) => {
        const paperlessEntry = paperlessDocMap.get(link.paperlessDocumentId);
        return {
          documentId: link.paperlessDocumentId,
          archiveSerialNumber: paperlessEntry?.archiveSerialNumber ?? null,
          title: paperlessEntry?.title ?? null,
          attachmentType: link.attachmentType as AttachmentType | null,
        };
      });

    reportInvoices.push({
      invoiceId,
      vendorId: metadata.vendorId,
      vendorName: metadata.vendorName,
      invoiceNumber: metadata.invoiceNumber,
      date: metadata.date,
      status: metadata.status as SourceReportInvoice['status'],
      invoiceAmount: metadata.invoiceAmount,
      allocatedAmount: roundedAmount,
      lineKind,
      isSplit: isSplitMap.get(invoiceId) ?? false,
      documents,
    });
  }

  // 8. Query unallocated invoices (no budget lines, but matching status)
  const unallocatedInvoices: SourceReportUnallocatedInvoice[] = [];
  const unallocRows = db.all<{
    invoice_id: string;
    vendor_id: string;
    vendor_name: string;
    invoice_number: string | null;
    invoice_date: string;
    invoice_status: string;
    invoice_amount: number;
  }>(
    sql`SELECT
      i.id            AS invoice_id,
      i.vendor_id     AS vendor_id,
      v.name          AS vendor_name,
      i.invoice_number AS invoice_number,
      i.date          AS invoice_date,
      i.status        AS invoice_status,
      i.amount        AS invoice_amount
    FROM invoices i
    INNER JOIN vendors v ON v.id = i.vendor_id
    WHERE i.status IN (${sql.join(
      Array.from(targetStatuses).map((status) => sql`${status}`),
      sql`, `,
    )})
    AND NOT EXISTS (SELECT 1 FROM invoice_budget_lines ibl WHERE ibl.invoice_id = i.id)`,
  );

  for (const row of unallocRows) {
    unallocatedInvoices.push({
      invoiceId: row.invoice_id,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      invoiceNumber: row.invoice_number,
      date: row.invoice_date,
      status: row.invoice_status as SourceReportUnallocatedInvoice['status'],
      invoiceAmount: row.invoice_amount,
    });
  }

  // 9. Compute total amount from rounded lines
  const totalAmount =
    toCents(reportInvoices.reduce((sum, inv) => sum + inv.allocatedAmount, 0)) / 100;

  return {
    type,
    source: {
      id: source.id,
      name: source.name,
      sourceType: source.sourceType as SourceReportSourceSummary['sourceType'],
      reference: source.reference,
      contactAddress: source.contactAddress,
    },
    invoices: reportInvoices,
    totalAmount,
    unallocatedInvoices,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Mark a batch of invoices as claimed, updating both invoices and their deposits.
 * All work happens in a single transaction — any error rolls everything back.
 * Returns the IDs of invoices and deposits that were actually modified.
 *
 * @throws ValidationError if invoiceIds is empty
 * @throws InvoicesNotClaimableError if any invoice is not claimable (409 with offending IDs)
 */
export function markInvoicesClaimed(
  db: DbType,
  invoiceIds: string[],
  diaryAutoEvents: boolean,
): MarkClaimedResponse {
  // 1. Validate input
  if (invoiceIds.length === 0) {
    throw new ValidationError('At least one invoice ID must be provided');
  }

  const claimedInvoiceIds: string[] = [];
  const claimedDepositIds: string[] = [];

  // 2. Transaction: validate, then write
  db.transaction((tx: typeof db) => {
    // Fetch all requested invoices
    const invoiceRows = tx.select().from(invoices).where(inArray(invoices.id, invoiceIds)).all();

    // Fetch all deposits for those invoices
    const depositRows = tx
      .select()
      .from(invoiceDeposits)
      .where(inArray(invoiceDeposits.invoiceId, invoiceIds))
      .all();

    const invoiceById = new Map(invoiceRows.map((inv) => [inv.id, inv]));
    const depositsByInvoiceId = new Map<string, (typeof invoiceDeposits.$inferSelect)[]>();
    for (const dep of depositRows) {
      const deps = depositsByInvoiceId.get(dep.invoiceId) ?? [];
      deps.push(dep);
      depositsByInvoiceId.set(dep.invoiceId, deps);
    }

    // 3. Check claimability
    const offendingIds: string[] = [];

    for (const invoiceId of invoiceIds) {
      const invoice = invoiceById.get(invoiceId);
      if (!invoice) {
        offendingIds.push(invoiceId);
        continue;
      }

      const invoiceStatus = invoice.status as string;
      const invoiceDeps = depositsByInvoiceId.get(invoiceId) ?? [];

      // Claimable: status ∈ {pending, paid} OR (status === 'claimed' && has ≥1 deposit whose ALLOWED_TRANSITIONS[status].includes('claimed'))
      const claimableDirectly = invoiceStatus === 'pending' || invoiceStatus === 'paid';
      const hasClaimableDeposits =
        invoiceDeps.length > 0 &&
        invoiceDeps.some((dep) => {
          const depStatus = dep.status as string;
          return (
            ALLOWED_TRANSITIONS[depStatus as keyof typeof ALLOWED_TRANSITIONS]?.includes(
              'claimed',
            ) ?? false
          );
        });

      const isClaimable =
        claimableDirectly || (invoiceStatus === 'claimed' && hasClaimableDeposits);
      if (!isClaimable) {
        offendingIds.push(invoiceId);
      }
    }

    if (offendingIds.length > 0) {
      throw new InvoicesNotClaimableError(undefined, { invoiceIds: offendingIds });
    }

    // 4. Write invoices
    for (const invoiceId of invoiceIds) {
      const invoice = invoiceById.get(invoiceId)!;
      const invoiceStatus = invoice.status as string;

      if (invoiceStatus !== 'claimed') {
        // Flip to claimed
        tx.update(invoices)
          .set({
            status: 'claimed',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(invoices.id, invoiceId))
          .run();

        claimedInvoiceIds.push(invoiceId);

        // Fire diary event
        onInvoiceStatusChanged(
          tx,
          diaryAutoEvents,
          invoiceId,
          invoice.invoiceNumber || 'N/A',
          invoiceStatus,
          'claimed',
        );
      }
    }

    // 5. Write deposits
    const allDeposits = depositRows;
    for (const deposit of allDeposits) {
      const depStatus = deposit.status as string;
      const allowedTransitions = ALLOWED_TRANSITIONS[depStatus as keyof typeof ALLOWED_TRANSITIONS];

      if (allowedTransitions?.includes('claimed')) {
        tx.update(invoiceDeposits)
          .set({
            status: 'claimed',
            claimedDate: today(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(invoiceDeposits.id, deposit.id))
          .run();

        claimedDepositIds.push(deposit.id);

        // Fire diary event
        const invoice = invoiceById.get(deposit.invoiceId)!;
        onDepositStatusChanged(
          tx,
          diaryAutoEvents,
          deposit.id,
          invoice.invoiceNumber || 'N/A',
          depStatus,
          'claimed',
        );
      }
    }
  });

  return {
    claimedInvoiceIds,
    claimedDepositIds,
  };
}
