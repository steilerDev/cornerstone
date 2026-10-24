/**
 * Exhaustive i18n key sets for string-literal unions (#2029).
 *
 * Every key set derives `${prefix}.${member}` for EVERY member of a runtime union tuple from
 * @cornerstone/shared, or a client-local `as const` tuple for client-only unions (e.g.
 * REPORT_SKIP_REASONS) (the union type is itself derived from that tuple, so the two cannot
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
  ATTENTION_ACTIONS,
  ATTENTION_TIERS,
  AUTOMATIC_DIARY_ENTRY_TYPES,
  BUDGET_SOURCE_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_VERDICTS,
  CONFIDENCE_LEVELS,
  CRITICAL_LINE_LEVELS,
  DOCUMENT_LINK_ENTITY_TYPES,
  DEFECT_STATUS_ACTIONS,
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_SEVERITIES,
  DIARY_WEATHERS,
  DELETE_IMPACT_KINDS,
  DIARY_ISSUE_RESOLUTIONS,
  DIARY_SOURCE_ENTITY_TYPES,
  FUNDING_SOURCE_STATUS_ACTIONS,
  GRANT_STATUS_ACTIONS,
  HISTORY_EVENT_TYPES,
  HISTORY_OBJECT_TYPES,
  HOME_AGENDA_KINDS,
  HOME_SECTION_IDS,
  HOME_SETUP_STEPS,
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_ENTRY_TYPES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUS_ACTIONS,
  INVOICE_STATUSES,
  MANUAL_DIARY_ENTRY_TYPES,
  MILESTONE_DISPLAY_STATUSES,
  MILESTONE_STATUS_ACTIONS,
  OIDC_LOGIN_ERROR_CODES,
  PROGRESS_PAYMENT_STATUS_ACTIONS,
  PURCHASE_STATUS_ACTIONS,
  SCHEDULE_SIGNALS,
  SEARCH_MATCHED_FIELDS,
  SEARCH_RESULT_TYPES,
  SOURCE_REPORT_TYPES,
  SUBSIDY_APPLICATION_STATUSES,
  TASK_STATUS_ACTIONS,
  WORK_ITEM_STATUSES,
} from '@cornerstone/shared';
import { COST_LINE_DOCUMENT_KINDS } from '../components/CostLineTable/costLineDocumentKind.js';
import { COST_LINE_STATES } from '../components/CostLineTable/costLineState.js';
import { OBJECT_TAB_IDS } from '../components/ObjectTabs/objectTabIds.js';
import { ATTENTION_KIND_WORDS } from '../lib/attention/kinds.js';
import { BACKUP_RUN_OUTCOMES, INTEGRATION_STATUSES } from '../lib/integrationStatus.js';
import { USER_ACCOUNT_STATUSES } from '../lib/userAccountStatus.js';
import { REPORT_SKIP_REASONS } from '../lib/reportContent/types.js';
import { CREATE_MENU_ENTRY_IDS } from '../navigation/createEntries.js';
import { QUICK_LOG_MODES } from '../navigation/createQuery.js';

/** i18n namespaces hosting a union key set. Extend when a set targets a new namespace. */
export type UnionKeyNamespace =
  | 'budget'
  | 'costLines'
  | 'documents'
  | 'householdItems'
  | 'diary'
  | 'auth'
  | 'common'
  | 'history'
  | 'home';

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
  /** budget — PDF attachment-type note (replaces #1912's ATTACHMENT_TYPE_KEYS). */
  reportAttachmentType: unionKeySet(
    'budget',
    'sourceReports.table.attachmentType',
    ATTACHMENT_TYPES,
  ),
  /** documents — attachment-type label for the document card / live-region announcement. */
  documentAttachmentType: unionKeySet('documents', 'documentCard.attachmentType', ATTACHMENT_TYPES),
  /** budget — source-report use-case title (wizard step 1, report list). */
  reportUseCase: unionKeySet('budget', 'sourceReports.useCase', SOURCE_REPORT_TYPES),
  /** budget — source-report use-case helper text (wizard step 1). */
  reportUseCaseHelper: unionKeySet('budget', 'sourceReports.useCaseHelper', SOURCE_REPORT_TYPES),
  /** budget — invoice deposit entry-type label. */
  depositEntryType: unionKeySet(
    'budget',
    'invoiceDetail.deposits.entryTypeLabels',
    INVOICE_DEPOSIT_ENTRY_TYPES,
  ),
  /** budget — budget-line confidence level label. */
  confidenceLevel: unionKeySet('budget', 'sources.lines.confidence', CONFIDENCE_LEVELS),
  /** budget — reason a report document was skipped (client-local tuple). */
  reportSkipReason: unionKeySet('budget', 'sourceReports.table', REPORT_SKIP_REASONS),
  /** diary — source-entity type label on the diary detail page / card. */
  diarySourceType: unionKeySet('diary', 'detailPage.sourceType', DIARY_SOURCE_ENTITY_TYPES),
  /** diary — weather chip label on the capture screen and entry pages. */
  diaryWeather: unionKeySet('diary', 'form.weatherOptions', DIARY_WEATHERS),
  /** diary — site-visit outcome chip label. */
  diaryOutcome: unionKeySet('diary', 'form.outcomeOptions', DIARY_INSPECTION_OUTCOMES),
  /** diary — defect severity chip label. */
  diarySeverity: unionKeySet('diary', 'form.severityOptions', DIARY_ISSUE_SEVERITIES),
  /** history — History type filter chips (#2224). */
  historyEventType: unionKeySet('history', 'filters.type', HISTORY_EVENT_TYPES),
  /** history — kind word of an object in the History object filter (#2224). */
  historyObjectType: unionKeySet('history', 'filters.objectKind', HISTORY_OBJECT_TYPES),
  /** auth — OIDC login error banner message. */
  oidcLoginError: unionKeySet('auth', 'login.oidcErrors', OIDC_LOGIN_ERROR_CODES),
  // ── Canonical status vocabulary (glossary v1, #2192) ─────────────────────────────────────
  // Exactly ONE canonical set per status vocabulary: namespace 'common', prefix
  // 'statusVocabulary.<vocabulary>', labels = glossary.json English canon / approved German.
  // Every status surface reads these; the legacy per-surface duplicates were removed by #2195.
  /** common — invoice status chip (pending / paid / claimed / quotation). */
  statusVocabularyInvoice: unionKeySet('common', 'statusVocabulary.invoice', INVOICE_STATUSES),
  /** common — cost line state chip (Estimate, Offered, Invoiced, Paid, Submitted), derived (#2235). */
  statusVocabularyCostLine: unionKeySet('common', 'statusVocabulary.costLine', COST_LINE_STATES),
  /** costLines — Basis value of a cost line (Own estimate … Invoice) (#2235). */
  costLineBasis: unionKeySet('costLines', 'basis', CONFIDENCE_LEVELS),
  /** costLines — empty-state sentence per document kind (German articles differ) (#2235). */
  costLineEmptyBodyDocument: unionKeySet(
    'costLines',
    'section.emptyBodyDocument',
    COST_LINE_DOCUMENT_KINDS,
  ),
  /** costLines — row action that takes a line off its offer or invoice. */
  costLineRemoveFromDocument: unionKeySet(
    'costLines',
    'action.removeFromDocument',
    COST_LINE_DOCUMENT_KINDS,
  ),
  /** costLines — aria-label of the Split button per document kind. */
  costLineSplitLabel: unionKeySet('costLines', 'table.splitLabel', COST_LINE_DOCUMENT_KINDS),
  /** costLines — Remove-from-document lead for a line without a task or purchase. */
  costLineRemoveLeadNoTarget: unionKeySet(
    'costLines',
    'confirm.removeLeadNoTarget',
    COST_LINE_DOCUMENT_KINDS,
  ),
  /** common — progress-payment (deposit) status chip. */
  statusVocabularyProgressPayment: unionKeySet(
    'common',
    'statusVocabulary.progressPayment',
    INVOICE_DEPOSIT_STATUSES,
  ),
  /** common — task status chip. */
  statusVocabularyTask: unionKeySet('common', 'statusVocabulary.task', WORK_ITEM_STATUSES),
  /** common — task / purchase schedule signal chip (takes {{days}} for late). */
  statusVocabularyScheduleSignal: unionKeySet(
    'common',
    'statusVocabulary.scheduleSignal',
    SCHEDULE_SIGNALS,
  ),
  /** common — purchase status chip. */
  statusVocabularyPurchase: unionKeySet(
    'common',
    'statusVocabulary.purchase',
    HOUSEHOLD_ITEM_STATUSES,
  ),
  /** common — milestone display status chip (takes {{days}} for late / early). */
  statusVocabularyMilestone: unionKeySet(
    'common',
    'statusVocabulary.milestone',
    MILESTONE_DISPLAY_STATUSES,
  ),
  /** common — grant (subsidy application) status chip. */
  statusVocabularyGrant: unionKeySet(
    'common',
    'statusVocabulary.grant',
    SUBSIDY_APPLICATION_STATUSES,
  ),
  /** common — funding source status chip. */
  statusVocabularyFundingSource: unionKeySet(
    'common',
    'statusVocabulary.fundingSource',
    BUDGET_SOURCE_STATUSES,
  ),
  /** common — defect (diary issue) resolution chip. */
  statusVocabularyDefect: unionKeySet('common', 'statusVocabulary.defect', DIARY_ISSUE_RESOLUTIONS),
  /** common — "Left to spend" budget verdict. */
  statusVocabularyBudgetVerdict: unionKeySet(
    'common',
    'statusVocabulary.budgetVerdict',
    BUDGET_VERDICTS,
  ),
  /** common — site-diary entry type (manual types only). */
  statusVocabularyDiaryType: unionKeySet(
    'common',
    'statusVocabulary.diaryType',
    MANUAL_DIARY_ENTRY_TYPES,
  ),
  // ── Grammar foundations (#2209): StatusMenu row labels and delete-impact counts ──────────
  /** common — StatusMenu forward-row label per task transition. */
  statusActionTask: unionKeySet('common', 'statusAction.task', TASK_STATUS_ACTIONS),
  /** common — StatusMenu forward-row label per purchase transition. */
  statusActionPurchase: unionKeySet('common', 'statusAction.purchase', PURCHASE_STATUS_ACTIONS),
  /** common — StatusMenu forward-row label per milestone transition. */
  statusActionMilestone: unionKeySet('common', 'statusAction.milestone', MILESTONE_STATUS_ACTIONS),
  /** common — StatusMenu forward-row label per invoice transition. */
  statusActionInvoice: unionKeySet('common', 'statusAction.invoice', INVOICE_STATUS_ACTIONS),
  /** common — StatusMenu forward-row label per progress-payment transition. */
  statusActionProgressPayment: unionKeySet(
    'common',
    'statusAction.progressPayment',
    PROGRESS_PAYMENT_STATUS_ACTIONS,
  ),
  /** common — StatusMenu forward-row label per grant transition. */
  statusActionGrant: unionKeySet('common', 'statusAction.grant', GRANT_STATUS_ACTIONS),
  /** common — StatusMenu forward-row label per funding-source transition. */
  statusActionFundingSource: unionKeySet(
    'common',
    'statusAction.fundingSource',
    FUNDING_SOURCE_STATUS_ACTIONS,
  ),
  /** common — StatusMenu forward-row label per defect transition. */
  statusActionDefect: unionKeySet('common', 'statusAction.defect', DEFECT_STATUS_ACTIONS),
  /** common — ConfirmDialog consequence label per delete-impact kind. */
  deleteImpactKind: unionKeySet('common', 'confirmDialog.impact', DELETE_IMPACT_KINDS),
  /** diary — automatic (system) entry type label. Manual types use statusVocabularyDiaryType. */
  diaryAutomaticEntryType: unionKeySet('diary', 'entryTypes', AUTOMATIC_DIARY_ENTRY_TYPES),
  /** common — command search group header per result type (#2211). */
  searchResultGroup: unionKeySet('common', 'commandSearch.groups', SEARCH_RESULT_TYPES),
  /** common — "Found in ‹field›" word per matched field (#2211). */
  searchMatchedField: unionKeySet('common', 'commandSearch.fields', SEARCH_MATCHED_FIELDS),
  /** common — integration chip (Connected, Can't connect, On, Off, Not set up) (#2217). */
  integrationStatus: unionKeySet('common', 'integrationStatus', INTEGRATION_STATUSES),
  /** common — last automatic backup outcome chip (#2217). */
  backupRun: unionKeySet('common', 'backupRun', BACKUP_RUN_OUTCOMES),
  /** common — account chip on Settings > Users (Active, Locked, Deactivated) (#2219). */
  userAccountStatus: unionKeySet('common', 'userAccountStatus', USER_ACCOUNT_STATUSES),
  /** common — New menu / New sheet entry label. */
  createMenuEntry: unionKeySet('common', 'createMenu.entry', CREATE_MENU_ENTRY_IDS),
  /** common — Log now tile label in the New sheet. */
  quickLogMode: unionKeySet('common', 'createSheet.quickLog', QUICK_LOG_MODES),
  /** common — object page tab label (Overview … History) (#2233). */
  objectTab: unionKeySet('common', 'objectTabs.tab', OBJECT_TAB_IDS),
  /** documents — "this task" etc. in the picker subtitle and the duplicate-link error (#2233). */
  documentLinkEntity: unionKeySet('documents', 'panel.entity', DOCUMENT_LINK_ENTITY_TYPES),
  /** documents — Documents panel empty-state body per linked record type (#2233). */
  documentLinkEmptyBody: unionKeySet('documents', 'panel.emptyBody', DOCUMENT_LINK_ENTITY_TYPES),
  /** common — attention tier chip (Late, Overdue, Due, Ready, Follow up, Tidy up) (#2230). */
  attentionTier: unionKeySet('common', 'attention.tier', ATTENTION_TIERS),
  /** common — critical-line level chip (On track, Warning, Critical, Overdue) (#2230). */
  criticalLineLevel: unionKeySet('common', 'attention.criticalLevel', CRITICAL_LINE_LEVELS),
  /** common — attention row action label (#2230). */
  attentionAction: unionKeySet('common', 'attention.action', ATTENTION_ACTIONS),
  /** common — kind word before an attention row title (client-local tuple) (#2230). */
  attentionKind: unionKeySet('common', 'attention.kind', ATTENTION_KIND_WORDS),
  /** home — section heading and Customize row per Home section (#2230). */
  homeSection: unionKeySet('home', 'sections', HOME_SECTION_IDS),
  /** home — set-up checklist step title (#2230). */
  homeSetupStep: unionKeySet('home', 'setup.step', HOME_SETUP_STEPS),
  /** home — set-up checklist step hint (#2230). */
  homeSetupHint: unionKeySet('home', 'setup.hint', HOME_SETUP_STEPS),
  /** home — kind word of a This week item (#2230). */
  homeAgendaKind: unionKeySet('home', 'week.kind', HOME_AGENDA_KINDS),
} as const;
