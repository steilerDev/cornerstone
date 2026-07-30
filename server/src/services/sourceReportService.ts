import { eq, inArray, and, sql, asc } from 'drizzle-orm';
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
  SourceReportBudgetLine,
  SourceReportDeposit,
  SourceReportLinkedItem,
  InvoiceDepositStatus,
  InvoiceDepositEntryType,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, InvoicesNotClaimableError } from '../errors/AppError.js';
import { toCents } from './shared/money.js';
import {
  computeLineContributionsExcludingTagged,
  splitByDepositsExcludingTagged,
  sumTaggedDepositContributionsByInvoice,
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
 * Story #1891: Implements Rail A (line-derived via ExcludingTagged) + Rail B (deposit-direct).
 * The report includes all invoices whose budget lines or deposits reference this source,
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
      targetStatuses.add('quotation');
      targetStatuses.add('pending');
      targetStatuses.add('paid');
      targetStatuses.add('claimed');
      break;
    case 'claim':
      targetStatuses.add('pending');
      targetStatuses.add('paid');
      break;
    case 'proof-of-funds':
      targetStatuses.add('claimed');
      break;
  }

  // Step a: Query rows (invoice + deposits) for Rail A (line-derived via ExcludingTagged)
  type RailARow = DepositAwareRow & {
    invoice_number: string | null;
    invoice_date: string;
    vendor_id: string;
    vendor_name: string;
    deposit_budget_source_id: string | null;
    line_description: string | null;
    work_item_id: string | null;
    work_item_title: string | null;
    household_item_id: string | null;
    household_item_name: string | null;
  };

  const railARows = db.all<RailARow>(
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
      d.entry_type        AS deposit_entry_type,
      d.budget_source_id  AS deposit_budget_source_id,
      COALESCE(wib.description, hib.description) AS line_description,
      wib.work_item_id    AS work_item_id,
      wi.title            AS work_item_title,
      hib.household_item_id AS household_item_id,
      hi.name             AS household_item_name
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    INNER JOIN vendors v ON v.id = i.vendor_id
    LEFT JOIN invoice_deposits d ON d.invoice_id = i.id
    LEFT JOIN work_item_budgets wib ON wib.id = ibl.work_item_budget_id
    LEFT JOIN work_items wi ON wi.id = wib.work_item_id
    LEFT JOIN household_item_budgets hib ON hib.id = ibl.household_item_budget_id
    LEFT JOIN household_items hi ON hi.id = hib.household_item_id
    WHERE (
      (ibl.work_item_budget_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM work_item_budgets wib2
        WHERE wib2.id = ibl.work_item_budget_id AND wib2.budget_source_id = ${sourceId}
      ))
      OR
      (ibl.household_item_budget_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_item_budgets hib2
        WHERE hib2.id = ibl.household_item_budget_id AND hib2.budget_source_id = ${sourceId}
      ))
    )`,
  );

  // Step b: Rail A contributions per invoice (excluding tagged deposits)
  const railALineContributions = computeLineContributionsExcludingTagged(railARows, targetStatuses);

  // Build ibl-level details map for budgetLines[] per invoice
  const iblDetails = new Map<
    string,
    {
      id: string;
      description: string | null;
      linkedItem: SourceReportLinkedItem | null;
    }
  >();
  for (const row of railARows) {
    if (!iblDetails.has(row.ibl_id)) {
      let linkedItem: SourceReportLinkedItem | null = null;
      if (row.work_item_id && row.work_item_title) {
        linkedItem = { type: 'work_item', id: row.work_item_id, name: row.work_item_title };
      } else if (row.household_item_id && row.household_item_name) {
        linkedItem = {
          type: 'household_item',
          id: row.household_item_id,
          name: row.household_item_name,
        };
      }
      iblDetails.set(row.ibl_id, {
        id: row.ibl_id,
        description: row.line_description,
        linkedItem,
      });
    }
  }

  // Build invoice metadata from Rail A rows
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
  for (const row of railARows) {
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

  // Step c: Rail B - deposits tagged to this source
  type RailBRow = {
    invoiceId: string;
    amount: number;
    status: string;
    entryType: string;
  };

  const railBRows = db.all<RailBRow>(
    sql`SELECT
      d.invoice_id AS invoiceId,
      d.amount AS amount,
      d.status AS status,
      d.entry_type AS entryType
    FROM invoice_deposits d
    WHERE d.budget_source_id = ${sourceId}`,
  );

  const railBContributions = sumTaggedDepositContributionsByInvoice(railBRows, targetStatuses);

  // Step d: Merge Rail B-only invoices (deposits with no budget lines)
  for (const invoiceId of railBContributions.keys()) {
    if (!invoiceMetadata.has(invoiceId)) {
      // Rail B-only invoice: fetch metadata
      const inv = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (inv) {
        const vendorLookup = db.all<{ vendor_id: string; vendor_name: string }>(
          sql`SELECT id AS vendor_id, name AS vendor_name FROM vendors WHERE id = ${inv.vendorId}`,
        );
        if (vendorLookup.length > 0) {
          invoiceMetadata.set(invoiceId, {
            vendorId: inv.vendorId,
            vendorName: vendorLookup[0]!.vendor_name,
            invoiceNumber: inv.invoiceNumber,
            date: inv.date,
            status: inv.status,
            invoiceAmount: inv.amount,
          });
        }
      }
    }
  }

  // Step e: Combined contributions (Rail A + Rail B)
  const combinedContributions = new Map<string, number>();
  for (const [_iblId, lineContrib] of railALineContributions) {
    const existing = combinedContributions.get(lineContrib.invoiceId) ?? 0;
    combinedContributions.set(lineContrib.invoiceId, existing + lineContrib.contribution);
  }
  for (const [invoiceId, railBAmount] of railBContributions) {
    const existing = combinedContributions.get(invoiceId) ?? 0;
    combinedContributions.set(invoiceId, existing + railBAmount);
  }

  // Step f: Compute isSplit for all report invoices in one query
  // isSplit = true if invoice has budget lines referencing multiple different sources
  const reportInvoiceIds = Array.from(combinedContributions.keys());
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

  // Step g: Compute deposit splits excluding tagged (for stage-determination logic)
  const splitsByInvoiceId = splitByDepositsExcludingTagged(railARows);

  // Step h: Batch fetch document links
  const allInvoiceIds = Array.from(invoiceMetadata.keys());
  const allDocumentLinks = db
    .select()
    .from(documentLinks)
    .where(
      and(eq(documentLinks.entityType, 'invoice'), inArray(documentLinks.entityId, allInvoiceIds)),
    )
    .all();

  const linksByInvoiceId = new Map<string, (typeof documentLinks.$inferSelect)[]>();
  const allPaperlessDocIds = new Set<number>();

  for (const invoiceId of allInvoiceIds) {
    const split = splitsByInvoiceId.get(invoiceId);

    // Determine stages: if deposit-only (no split entry), include 'deposit' if any tagged deposit in slice
    const stages = new Set<AttachmentType>();
    if (split) {
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
    } else {
      // Deposit-only: check if any tagged deposit in target statuses
      if (railBContributions.has(invoiceId)) {
        stages.add('deposit');
      }
    }

    const invoiceLinks = allDocumentLinks
      .filter(
        (link) =>
          link.entityId === invoiceId &&
          (link.attachmentType === null || stages.has(link.attachmentType as AttachmentType)),
      )
      .map((link) => {
        allPaperlessDocIds.add(link.paperlessDocumentId);
        return link;
      });

    linksByInvoiceId.set(invoiceId, invoiceLinks);
  }

  // Fetch Paperless metadata
  const paperlessDocMap = new Map<
    number,
    { archiveSerialNumber: number | null; title: string | null }
  >();
  if (
    paperlessConfig.paperlessEnabled &&
    paperlessConfig.paperlessUrl &&
    paperlessConfig.paperlessApiToken &&
    allPaperlessDocIds.size > 0
  ) {
    try {
      const docs = await paperlessService.getDocuments(
        paperlessConfig.paperlessUrl,
        paperlessConfig.paperlessApiToken,
        Array.from(allPaperlessDocIds),
      );
      for (const doc of docs.values()) {
        paperlessDocMap.set(doc.id, {
          archiveSerialNumber: doc.archiveSerialNumber,
          title: doc.title,
        });
      }
    } catch (err) {
      console.warn('[sourceReport] Paperless.getDocuments failed, degrading to null ASN/title', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Step i: Build budget lines per invoice
  const budgetLinesByInvoiceId = new Map<string, SourceReportBudgetLine[]>();
  for (const [iblId, lineContrib] of railALineContributions) {
    const invoiceId = lineContrib.invoiceId;
    const details = iblDetails.get(iblId)!;
    const lines = budgetLinesByInvoiceId.get(invoiceId) ?? [];
    const portion = toCents(lineContrib.contribution) / 100;
    lines.push({
      id: details.id,
      description: details.description,
      allocatedPortion: portion,
      linkedItem: details.linkedItem,
    });
    budgetLinesByInvoiceId.set(invoiceId, lines);
  }

  // Step j: Fetch deposits for each invoice (unfiltered by status, but filtered by source tag)
  const depositsByInvoiceId = new Map<string, SourceReportDeposit[]>();
  for (const invoiceId of allInvoiceIds) {
    const deposits = db
      .select()
      .from(invoiceDeposits)
      .where(eq(invoiceDeposits.invoiceId, invoiceId))
      .orderBy(asc(invoiceDeposits.dueDate), asc(invoiceDeposits.createdAt))
      .all();

    const filtered: SourceReportDeposit[] = deposits
      .filter((d) => d.budgetSourceId === null || d.budgetSourceId === sourceId)
      .map((d) => ({
        id: d.id,
        amount: d.amount,
        status: d.status as InvoiceDepositStatus,
        entryType: d.entryType as InvoiceDepositEntryType,
        dueDate: d.dueDate,
        paidDate: d.paidDate,
        claimedDate: d.claimedDate,
        budgetSourceId: d.budgetSourceId,
      }));

    depositsByInvoiceId.set(invoiceId, filtered);
  }

  // Build report invoices
  const reportInvoices: SourceReportInvoice[] = [];
  for (const [invoiceId, rawAmount] of combinedContributions) {
    const metadata = invoiceMetadata.get(invoiceId)!;
    const roundedAmount = toCents(rawAmount) / 100;

    if (roundedAmount === 0) continue;

    const lineKind = roundedAmount > 0 ? 'invoice' : 'refund-adjustment';

    const links = linksByInvoiceId.get(invoiceId) ?? [];
    const documents: SourceReportDocument[] = links.map((link) => {
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
      isSplit: isSplitMap.get(invoiceId) ?? false, // Line-derived: true iff invoice has lines from 2+ sources
      documents,
      budgetLines: budgetLinesByInvoiceId.get(invoiceId) ?? [],
      deposits: depositsByInvoiceId.get(invoiceId) ?? [],
    });
  }

  // Step k: Query unallocated invoices (excluding those with tagged deposits)
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
    AND NOT EXISTS (SELECT 1 FROM invoice_budget_lines ibl WHERE ibl.invoice_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM invoice_deposits d WHERE d.invoice_id = i.id AND d.budget_source_id = ${sourceId})`,
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

  // Compute total from rounded lines
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
