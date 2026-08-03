import type { AttachmentType, SourceReportType } from '@cornerstone/shared';

/**
 * Attachment tier model (Story #1930).
 *
 * Documents linked to an invoice form an ordered evidentiary tier, and each source
 * report type declares a tier floor. A document is embedded in a report iff its tier
 * is at or above that report type's floor. This is the ONLY place either the tier
 * ordering or the per-report-type floor is defined — do not hard-code a report
 * type's floor at a second site (AC9). The rule depends only on the report type and
 * the document's own `attachmentType`; it must never consult invoice status, the
 * deposit split, or `targetStatuses`.
 */
export const ATTACHMENT_TIER: Record<AttachmentType, number> = {
  quotation: 1,
  deposit: 2,
  invoice: 3,
};

/** Tier floor per report type: a document must be at or above this tier to be embedded. */
export const REPORT_TYPE_TIER_FLOOR: Record<SourceReportType, number> = {
  'budget-overview': ATTACHMENT_TIER.quotation,
  claim: ATTACHMENT_TIER.deposit,
  'proof-of-funds': ATTACHMENT_TIER.invoice,
};

/**
 * True iff a document with the given `attachmentType` should be embedded in a report
 * of the given `reportType`.
 *
 * `attachmentType: null` (untagged/legacy) is treated as tier `invoice` — the
 * strongest tier — so a null-typed document is included in every report type. This
 * is a deliberate ruling, not an oversight: null links are legacy/ambiguous data
 * (pre-#1877 links, or the invoice detail page's "Add Document" picker when the user
 * skipped the type choice), not known-weak evidence. Treating null as the weakest
 * tier would silently drop attachments from claim/proof-of-funds reports for
 * existing data — worse than being over-inclusive, since the user can deselect an
 * over-included document but cannot recover a silently-dropped one.
 */
export function isDocumentIncludedForReportType(
  reportType: SourceReportType,
  attachmentType: AttachmentType | null,
): boolean {
  const tier = attachmentType === null ? ATTACHMENT_TIER.invoice : ATTACHMENT_TIER[attachmentType];
  return tier >= REPORT_TYPE_TIER_FLOOR[reportType];
}
