/**
 * Exhaustive i18n key sets for string-literal unions (#2029).
 *
 * Every key set derives `${prefix}.${member}` for EVERY member of a runtime union tuple from
 * @cornerstone/shared (the union type is itself derived from that tuple, so the two cannot
 * drift). The factory is deliberately module-private: every key set must live in
 * I18N_UNION_KEYS below, and unionKeys.test.ts iterates that registry against every locale —
 * so adding a union member without a translation key fails a test instead of printing a raw
 * key (into a bank-facing PDF, for the report sets).
 *
 * Pure data: no i18next / react-i18next import (injection-only locale contract, #2007/ADR-034).
 * Consumers pass `set.key(member)` to their own (injected or hook-provided) t().
 */
import {
  ATTACHMENT_TYPES,
  BUDGET_SOURCE_TYPES,
  DIARY_ENTRY_TYPES,
  INVOICE_STATUSES,
  SOURCE_REPORT_TYPES,
} from '@cornerstone/shared';

/** i18n namespaces hosting a union key set. Extend when a set targets a new namespace. */
export type UnionKeyNamespace = 'budget' | 'documents' | 'diary';

export interface UnionKeySet<U extends string> {
  /** Namespace the consuming t() is bound to. */
  readonly ns: UnionKeyNamespace;
  /** Dot-path under which each member is a leaf key. */
  readonly prefix: string;
  /** Every union member — the shared runtime tuple itself (same reference). */
  readonly members: readonly U[];
  /** Full key (no namespace) for a member. METHOD shorthand on purpose: method parameters are
   *  bivariant, which lets the heterogeneous registry be iterated as UnionKeySet<string>. */
  key(member: U): string;
}

function unionKeySet<U extends string>(
  ns: UnionKeyNamespace,
  prefix: string,
  members: readonly U[],
): UnionKeySet<U> {
  return Object.freeze({ ns, prefix, members, key: (member: U) => `${prefix}.${member}` });
}

export const I18N_UNION_KEYS = {
  /** budget — PDF table title per report use case. */
  reportTitle: unionKeySet('budget', 'sourceReports.table.title', SOURCE_REPORT_TYPES),
  /** budget — PDF cover-letter subject per use case. */
  reportCoverLetterSubject: unionKeySet(
    'budget',
    'sourceReports.coverLetter.subject',
    SOURCE_REPORT_TYPES,
  ),
  /** budget — PDF cover-letter body per use case (takes {{total}}). */
  reportCoverLetterBody: unionKeySet(
    'budget',
    'sourceReports.coverLetter.body',
    SOURCE_REPORT_TYPES,
  ),
  /** budget — PDF source-type label. */
  reportSourceType: unionKeySet('budget', 'sourceReports.sourceType', BUDGET_SOURCE_TYPES),
  /** budget — invoice status label (PDF overview Status column). */
  invoiceStatus: unionKeySet('budget', 'sources.lines.invoiceStatus', INVOICE_STATUSES),
  /** budget — PDF attachment-type note (replaces #1912's ATTACHMENT_TYPE_KEYS). */
  reportAttachmentType: unionKeySet(
    'budget',
    'sourceReports.table.attachmentType',
    ATTACHMENT_TYPES,
  ),
  /** documents — attachment-type label for the document card / live-region announcement. */
  documentAttachmentType: unionKeySet('documents', 'documentCard.attachmentType', ATTACHMENT_TYPES),
  /** diary — entry-type label (type badge, photo viewer history list). */
  diaryEntryType: unionKeySet('diary', 'entryTypes', DIARY_ENTRY_TYPES),
} as const;
