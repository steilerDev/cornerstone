/**
 * @cornerstone/shared
 *
 * Shared TypeScript types and interfaces used by both the server and client.
 * This package contains API request/response shapes, entity types, and
 * common constants.
 */

export type { ApiError, ApiErrorResponse } from './types/api.js';
export type { ErrorCode } from './types/errors.js';
export { ERROR_CODES } from './types/errors.js';
export type {
  User,
  UserResponse,
  UserListItem,
  UserListResponse,
  UserRole,
  AuthProvider,
  OidcLoginErrorCode,
} from './types/user.js';
export { OIDC_LOGIN_ERROR_CODES } from './types/user.js';

// Pagination
export type { PaginationMeta, PaginatedResponse } from './types/pagination.js';

// Filter Metadata
export type { FilterColumnMeta, FilterMeta } from './types/filterMeta.js';

// Areas
export type {
  AreaAncestor,
  AreaSummary,
  AreaResponse,
  AreaListResponse,
  AreaSingleResponse,
  CreateAreaRequest,
  UpdateAreaRequest,
  AreaListQuery,
  AreaCounts,
  AreaWithCounts,
  AreaListWithCountsResponse,
  ReorderAreasRequest,
  DeleteAreaResponse,
} from './types/area.js';

// Trades
export type {
  TradeSummary,
  TradeResponse,
  TradeListResponse,
  TradeListItem,
  TradeMergeRequest,
  TradeMergeResponse,
  TradeSingleResponse,
  CreateTradeRequest,
  UpdateTradeRequest,
  TradeListQuery,
} from './types/trade.js';
export { TRADE_IDS_MAX, TRADE_ID_MAX_LENGTH } from './types/trade.js';

// Orientations
export type {
  OrientationSummary,
  OrientationResponse,
  OrientationListResponse,
  OrientationSingleResponse,
  CreateOrientationRequest,
  UpdateOrientationRequest,
  OrientationListQuery,
} from './types/orientation.js';

// Work Items
export type {
  WorkItem,
  WorkItemStatus,
  WorkItemSummary,
  WorkItemScheduleFields,
  WorkItemDetail,
  UserSummary,
  VendorSummary,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemListQuery,
  WorkItemListResponse,
  WorkItemDependenciesResponse,
  DependencyResponse,
  MilestoneSummaryForWorkItem,
  WorkItemMilestones,
} from './types/workItem.js';
export { WORK_ITEM_STATUSES } from './types/workItem.js';

// Subtasks
export type {
  Subtask,
  SubtaskResponse,
  CreateSubtaskRequest,
  UpdateSubtaskRequest,
  SubtaskListResponse,
  ReorderSubtasksRequest,
} from './types/subtask.js';

// Notes
export type {
  Note,
  NoteResponse,
  NoteUserSummary,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
} from './types/note.js';

// Dependencies
export type {
  Dependency,
  DependencyType,
  CreateDependencyRequest,
  UpdateDependencyRequest,
  DependencyCreatedResponse,
} from './types/dependency.js';

// Budget Categories
export type {
  BudgetCategory,
  CreateBudgetCategoryRequest,
  UpdateBudgetCategoryRequest,
  BudgetCategoryListResponse,
  BudgetCategoryResponse,
} from './types/budgetCategory.js';

// Vendors
export type {
  Vendor,
  VendorListItem,
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  VendorSortField,
  VendorCreateResponse,
  VendorDetailResponse,
} from './types/vendor.js';
export { VENDOR_SORT_FIELDS } from './types/vendor.js';

// Vendor Contacts
export type {
  VendorContact,
  CreateVendorContactRequest,
  UpdateVendorContactRequest,
  VendorContactListResponse,
  VendorContactResponse,
} from './types/vendorContact.js';

// DAV Token
export type { DavTokenStatus, DavTokenResponse } from './types/dav.js';

// Invoices
export type {
  Invoice,
  InvoiceStatus,
  InvoiceDeposit,
  InvoiceDepositStatus,
  InvoiceDepositEntryType,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  CreateDepositRequest,
  UpdateDepositRequest,
  InvoiceListResponse,
  InvoiceResponse,
  ConvertQuotationTargetStatus,
  ConvertQuotationLineUpdate,
  ConvertQuotationRequest,
  InvoiceStatusSummary,
  InvoiceStatusBreakdown,
  InvoiceListPaginatedResponse,
  InvoiceListChip,
  InvoiceChipTally,
  InvoiceChipsOutsideToPay,
  InvoiceChipCounts,
  InvoiceDetailResponse,
} from './types/invoice.js';
export { INVOICE_LIST_CHIPS } from './types/invoice.js';

// Invoice Budget Lines
export type {
  InvoiceBudgetLine,
  InvoiceBudgetLineSummary,
  CreateInvoiceBudgetLineRequest,
  UpdateInvoiceBudgetLineRequest,
  EditAndMoveBudgetLineRequest,
  InvoiceBudgetLineResponse,
  InvoiceBudgetLineListResponse,
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineCreateResponse,
  InvoiceBudgetLineListDetailResponse,
  BudgetLineAssignRequest,
  BudgetLineAssignResponse,
} from './types/invoiceBudgetLine.js';

// Budget Extraction (LLM-powered line item extraction)
export type { ExtractedLine, ExtractionHints, ExtractionResult } from './types/budgetExtraction.js';

// Invoice Auto-Itemize (EPIC-16 Story #1547 & EPIC-18 Story #1679)
export type {
  InvoicePatchForAutoItemize,
  AutoItemizeRequest,
  AutoItemizeWarning,
  AutoItemizeDryRunResponse,
  AutoItemizePreviewRequest,
  AutoItemizePreviewResponse,
  AutoItemizeCommitRequest,
  AutoItemizeCommitResponse,
  MergeLinesRequest,
  MergeLinesResponse,
} from './types/invoiceAutoItemize.js';

// Budget Sources
export type {
  BudgetSource,
  BudgetSourceType,
  BudgetSourceStatus,
  CreateBudgetSourceRequest,
  UpdateBudgetSourceRequest,
  BudgetSourceListResponse,
  BudgetSourceResponse,
  BudgetSourceBudgetLine,
  BudgetSourceBudgetLinesResponse,
  MoveBudgetLinesRequest,
  MoveBudgetLinesResponse,
} from './types/budgetSource.js';

// Shared Budget Base Types
export type {
  BaseBudgetLine,
  CreateBudgetLineRequest,
  UpdateBudgetLineRequest,
  SubsidyPaybackEntry,
  BudgetAggregate,
  BudgetSummary,
  BudgetLineInvoiceLink,
} from './types/budget.js';
export { effectivePlannedAmount, effectiveLineAmount } from './types/budget.js';

// Subsidy Programs
export type {
  SubsidyProgram,
  SubsidyReductionType,
  SubsidyApplicationStatus,
  CreateSubsidyProgramRequest,
  UpdateSubsidyProgramRequest,
  SubsidyProgramListResponse,
  SubsidyProgramResponse,
  WorkItemSubsidyPaybackEntry,
  WorkItemSubsidyPaybackResponse,
} from './types/subsidyProgram.js';

// Budget Overview
export type {
  BudgetOverview,
  BudgetOverviewResponse,
  OversubscribedSubsidy,
  BudgetVerdict,
} from './types/budgetOverview.js';

// Money service (ADR-039)
export type {
  MoneyItemType,
  MoneyRange,
  LeftToSpend,
  NotYetSplit,
  ReadyToSubmit,
  MoneyRecordTotals,
  MoneyOfferTotals,
  MoneyCostFigures,
  MoneyAreaFigures,
  MoneySourceFigures,
  MoneyGrantFigures,
  MoneySummary,
  BreakdownMoney,
} from './types/money.js';
export { MONEY_ITEM_TYPES } from './types/money.js';

// Budget Breakdown
export type {
  CostDisplay,
  BreakdownBudgetLine,
  BreakdownWorkItem,
  BreakdownArea,
  BreakdownHouseholdItem,
  BreakdownTotals,
  BudgetBreakdown,
  BudgetBreakdownResponse,
  SubsidyAdjustment,
  BudgetSourceSummaryBreakdown,
} from './types/budgetBreakdown.js';

// Work Item Budgets
export type {
  ConfidenceLevel,
  BudgetSourceSummary,
  InvoiceSummary,
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
  WorkItemBudgetListResponse,
  WorkItemBudgetResponse,
} from './types/workItemBudget.js';
export { CONFIDENCE_MARGINS } from './types/workItemBudget.js';

// Runtime union tuples (#2029)
export { SOURCE_REPORT_TYPES } from './types/sourceReport.js';
export { BUDGET_SOURCE_TYPES, BUDGET_SOURCE_STATUSES } from './types/budgetSource.js';
export {
  INVOICE_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_DEPOSIT_ENTRY_TYPES,
} from './types/invoice.js';
export { SUBSIDY_APPLICATION_STATUSES } from './types/subsidyProgram.js';
export { HOUSEHOLD_ITEM_STATUSES } from './types/householdItem.js';
export { DIARY_SOURCE_ENTITY_TYPES, DIARY_ISSUE_RESOLUTIONS } from './types/diary.js';
export { SCHEDULE_SIGNALS } from './types/schedule.js';
export { MILESTONE_DISPLAY_STATUSES } from './types/milestone.js';
export { BUDGET_VERDICTS } from './types/budgetOverview.js';
export { CONFIDENCE_LEVELS } from './types/budget.js';
export { ATTACHMENT_TYPES, DOCUMENT_LINK_ENTITY_TYPES } from './types/document.js';
export {
  DIARY_ENTRY_TYPES,
  MANUAL_DIARY_ENTRY_TYPES,
  AUTOMATIC_DIARY_ENTRY_TYPES,
} from './types/diary.js';
export { PHOTO_SPOT_NONE, PHOTO_SPOT_ANY } from './types/photo.js';

// Milestones
export type {
  MilestoneSummary,
  MilestoneDetail,
  WorkItemDependentSummary,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  MilestoneListResponse,
  LinkWorkItemRequest,
  MilestoneWorkItemLinkResponse,
  MilestoneDisplayStatus,
} from './types/milestone.js';

// Scheduling
export type {
  ScheduleRequest,
  ScheduleResponse,
  ScheduledItem,
  ScheduleWarningType,
  ScheduleWarning,
  ScheduleSignal,
} from './types/schedule.js';

// Timeline
export type {
  TimelineWorkItem,
  TimelineDependency,
  TimelineMilestone,
  TimelineHouseholdItem,
  TimelineDateRange,
  TimelineResponse,
  TimelineHoldsUp,
} from './types/timeline.js';

// Paperless-ngx API Types
export type {
  PaperlessCorrespondent,
  PaperlessCorrespondentListResponse,
  PaperlessUploadResponse,
} from './types/paperless.js';

// Documents (Paperless-ngx Integration)
export type {
  AttachmentType,
  DocumentLinkEntityType,
  DeleteDocumentLinkResponse,
  PaperlessTag,
  PaperlessDocument,
  PaperlessSearchHit,
  PaperlessDocumentSearchResult,
  PaperlessDocumentListQuery,
  PaperlessDocumentListResponse,
  PaperlessDocumentDetailResponse,
  PaperlessTagListResponse,
  PaperlessStatusResponse,
  DocumentLink,
  DocumentLinkWithMetadata,
  CreateDocumentLinkRequest,
  UpdateDocumentLinkRequest,
  DocumentLinkResponse,
  DocumentLinkListResponse,
  AllLinkedDocumentIdsResponse,
} from './types/document.js';

// Household Items
export type {
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemVendorSummary,
  HouseholdItemDepPredecessorType,
  HouseholdItemDepRef,
  HouseholdItemDepPredecessorSummary,
  HouseholdItemDepDetail,
  HouseholdItemDepsResponse,
  CreateHouseholdItemDepRequest,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemSubsidySummary,
  HouseholdItem,
  HouseholdItemSummary,
  HouseholdItemDetail,
  HouseholdItemBudgetAggregate,
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
  HouseholdItemListQuery,
  HouseholdItemListResponse,
  HouseholdItemResponse,
  HouseholdItemCategoryEntity,
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
} from './types/householdItem.js';

// User Preferences
export type {
  UserPreference,
  PreferenceKey,
  DashboardCardId,
  UpsertPreferenceRequest,
  PreferencesResponse,
  AttentionSnoozedPreference,
} from './types/preference.js';

// Attention service (#2229)
export {
  ATTENTION_NEEDS_RULES,
  ATTENTION_TIDY_RULES,
  ATTENTION_RULES,
  ATTENTION_STANDING_RULES,
  ATTENTION_TIERS,
  ATTENTION_SEVERITIES,
  ATTENTION_ACTIONS,
  ATTENTION_SUBJECT_TYPES,
  CRITICAL_LINE_LEVELS,
  ATTENTION_NOT_NOW_DAYS,
  ATTENTION_SNOOZE_MAX_KEYS,
  ATTENTION_SNOOZE_MAX_BYTES,
  ATTENTION_SNOOZED_PREFERENCE_KEY,
  ATTENTION_ROW_KEY_PATTERN,
  ATTENTION_LINK_ROUTES,
  attentionRowKey,
  isAttentionRowKey,
} from './types/attention.js';
export type {
  AttentionNeedsRule,
  AttentionTidyRule,
  AttentionRule,
  AttentionStandingRule,
  AttentionTier,
  AttentionSeverity,
  AttentionAction,
  AttentionSubjectType,
  CriticalLineLevel,
  AttentionLinkRoute,
  AttentionLink,
  AttentionSubject,
  AttentionHoldsUp,
  AttentionGroupItem,
  AttentionParams,
  AttentionRow,
  AttentionStandingRow,
  AttentionCriticalLine,
  AttentionResponse,
  AttentionQuery,
  AttentionNotNowRequest,
  AttentionNotNowResponse,
} from './types/attention.js';

// Household Item Budgets
export type {
  HouseholdItemBudgetLine,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
  HouseholdItemBudgetListResponse,
  HouseholdItemBudgetResponse,
  HouseholdItemSubsidyPaybackEntry,
  HouseholdItemSubsidyPaybackResponse,
} from './types/householdItemBudget.js';

// Photos
export type {
  PhotoEntityType,
  Photo,
  DeletePhotoResponse,
  UpdatePhotoRequest,
  UpdatePhotoResponse,
  UpdatePhotoTagsRequest,
  UpdatePhotoTagsResponse,
  ReorderPhotosRequest,
  PhotoSpotSummary,
  PhotoSpotsResponse,
  PhotoSpotDiaryEntry,
  PhotoSpotPhoto,
  PhotoSpotPhotosResponse,
  PhotoSpotPhotosQuery,
} from './types/photo.js';

// Diary (Construction Diary / Bautagebuch)
export {
  DIARY_WEATHERS,
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_SEVERITIES,
  DIARY_LIST_THUMBNAIL_LIMIT,
} from './types/diary.js';
export { DIARY_TYPE_METADATA_KEYS, droppedMetadataKeys } from './lib/diaryMetadataKeys.js';
export type {
  ManualDiaryEntryType,
  AutomaticDiaryEntryType,
  DiaryEntryType,
  DiaryEntryStatus,
  DiaryWeather,
  DiaryInspectionOutcome,
  DiaryIssueSeverity,
  DiaryIssueResolution,
  DiarySignatureEntry,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
  GeneralNoteMetadata,
  DiaryEntryMetadata,
  DiarySourceEntityType,
  DiaryUserSummary,
  DiaryEntrySummary,
  DiaryEntryDetail,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  PromoteDiaryEntryRequest,
  DiaryEntryListQuery,
  DiaryEntryListResponse,
  DiaryEntryLookupQuery,
  DiaryEntryLookupMatch,
  DiaryEntryLookupResponse,
  DiaryPhotoThumbnail,
  DiaryFilterCompany,
  DiaryFilterOptions,
} from './types/diary.js';

// Application Config
export type { AppConfigResponse } from './types/config.js';

// Backup & Restore
export type {
  BackupMeta,
  BackupResponse,
  BackupListResponse,
  RestoreInitiatedResponse,
  BackupSchedulerLastRun,
  BackupSchedulerStatus,
  BackupSchedulerStatusResponse,
} from './types/backup.js';

// Settings > Integrations
export { LLM_PROVIDERS } from './types/integrations.js';
export type {
  LlmProvider,
  IntegrationEnv,
  IntegrationKey,
  IntegrationsStatusResponse,
} from './types/integrations.js';

// App Settings
export { ENTRIES_LANGUAGES, FALLBACK_ENTRIES_LANGUAGE } from './types/settings.js';
export type { ReorderReferenceListRequest } from './types/referenceList.js';
export type {
  EntriesLanguage,
  HouseholdSettings,
  UpdateHouseholdSettingsRequest,
  HouseholdSettingsResponse,
} from './types/settings.js';

// Source Report Math
export { computeIncludedTotal } from './lib/reportMath.js';

// Diary signature lock
export { hasDiarySignatures, isDiaryEntrySignatureLocked } from './lib/diaryLock.js';
export {
  MAX_SIGNATURES_PER_ENTRY,
  MAX_SIGNER_NAME_LENGTH,
  MAX_SIGNATURE_DATA_URL_LENGTH,
  SIGNATURE_DATA_URL_PATTERN,
  SIGNED_AT_PATTERN,
} from './lib/diarySignatures.js';

// Source Reports
export type {
  SourceReportType,
  SourceReportDocument,
  SourceReportLinkedItem,
  SourceReportBudgetLine,
  SourceReportDeposit,
  SourceReportInvoice,
  SourceReportUnallocatedInvoice,
  SourceReportSourceSummary,
  SourceReportResponse,
  MarkClaimedRequest,
  MarkClaimedResponse,
  GenerateReportContentRequest,
  GenerateReportContentResponse,
} from './types/sourceReport.js';

// Routes (EPIC-21 route map, ADR-038)
export {
  ROUTE_MAP,
  LIVE_REDIRECT_ROUTES,
  MAX_APP_PATH_LENGTH,
  applyQueryMap,
  baseFrom,
  conditionHolds,
  effectiveTarget,
  getRouteEntry,
  isRouteServed,
  liveConditionalRules,
  liveQueryMaps,
  matchLocation,
  matchPattern,
  queryMatches,
  resolveLocation,
  resolveRedirect,
  resolveRedirectRule,
  routePattern,
  routeUrl,
  safeAppPath,
} from './routes/index.js';
export type {
  LiveRedirectRoute,
  RouteChange,
  RouteCondition,
  RouteContext,
  RouteGate,
  RouteGateContext,
  RouteGuard,
  RouteId,
  RouteKind,
  RouteMapEntry,
  RouteMatch,
  RouteParams,
  RoutePatternOf,
  RouteQuery,
  RouteQueryValue,
  RouteResolution,
  RouteSection,
  RouteStage,
  ServedRouteId,
} from './routes/index.js';

// Undo snapshots (story 1.3)
export { UNDO_WINDOW_MS, UNDO_SUBJECT_TYPES } from './types/undo.js';
export type { UndoSubjectType, UndoToken, UndoRow, UndoResponse, WithUndo } from './types/undo.js';

// Delete impact (story 1.3)
export { DELETE_IMPACT_ENTITY_TYPES, DELETE_IMPACT_KINDS } from './types/deleteImpact.js';
export type {
  DeleteImpactEntityType,
  DeleteImpactKind,
  DeleteImpactEffect,
  DeleteImpactResponse,
} from './types/deleteImpact.js';

// Status transition maps (story 1.3)
export {
  TASK_STATUS_ACTIONS,
  PURCHASE_STATUS_ACTIONS,
  MILESTONE_COMPLETION_STATES,
  MILESTONE_STATUS_ACTIONS,
  INVOICE_STATUS_ACTIONS,
  PROGRESS_PAYMENT_STATUS_ACTIONS,
  GRANT_STATUS_ACTIONS,
  FUNDING_SOURCE_STATUS_ACTIONS,
  DEFECT_STATUS_ACTIONS,
  GRANT_TRANSITIONS,
  FUNDING_SOURCE_TRANSITIONS,
  DEFECT_TRANSITIONS,
  TASK_TRANSITIONS,
  PURCHASE_TRANSITIONS,
  MILESTONE_TRANSITIONS,
  INVOICE_TRANSITIONS,
  PROGRESS_PAYMENT_TRANSITIONS,
  transitionsFrom,
  allowedTargets,
} from './lib/statusTransitions.js';
export type {
  TaskStatusAction,
  PurchaseStatusAction,
  MilestoneCompletionState,
  MilestoneStatusAction,
  InvoiceStatusAction,
  ProgressPaymentStatusAction,
  GrantStatusAction,
  FundingSourceStatusAction,
  DefectStatusAction,
  StatusTransition,
  StatusTransitionMap,
} from './lib/statusTransitions.js';

// Global search (story #2210)
export { foldSearchText, searchDigits } from './lib/searchFold.js';

// System events (ADR-040)
export type {
  StatusChangedMetadataV1,
  MilestoneDelayedMetadataV1,
  InvoiceCreatedMetadataV1,
  LegacyEventMetadataV1,
  SystemEventMetadataV1,
  SystemEventMetadata,
  SystemEventRepeat,
  SystemEventBatchSummary,
} from './types/systemEvent.js';
export { HISTORY_EVENT_TYPES, HISTORY_OBJECT_TYPES } from './types/history.js';
export type {
  HistoryEventType,
  HistoryObjectType,
  HistoryQuery,
  HistoryObjectRef,
  HistoryListResponse,
} from './types/history.js';
export { SYSTEM_EVENT_NAMES, isSystemEventMetadataV1 } from './lib/systemEvent.js';
export type { SystemEventName } from './lib/systemEvent.js';
export {
  SEARCH_RESULT_TYPES,
  SEARCH_MATCHED_FIELDS,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_RAW_MAX_LENGTH,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
} from './types/search.js';
export type {
  SearchResultType,
  SearchMatchedField,
  SearchAreaRef,
  SearchParentRef,
  SearchResultItem,
  SearchGroupStatus,
  SearchGroup,
  SearchResponse,
  SearchQuery,
} from './types/search.js';

// Home (#2230)
export {
  HOME_AGENDA_DAYS,
  HOME_WEEK_DAYS,
  HOME_AGENDA_KINDS,
  HOME_SETUP_STEPS,
  HOME_SETUP_CORE_STEPS,
  HOME_SETUP_ADMIN_STEPS,
} from './types/home.js';
export type {
  HomeAgendaKind,
  HomeAgendaSchedule,
  HomeAgendaItem,
  HomeWeekResponse,
  HomeProgress,
  HomePulseResponse,
  HomeSetupStep,
  HomeSetupStepState,
  HomeSetupResponse,
} from './types/home.js';
export {
  HOME_SECTION_IDS,
  HOME_HIDEABLE_SECTION_IDS,
  HOME_COLLAPSIBLE_SECTION_IDS,
  HOME_HIDDEN_SECTIONS_KEY,
  HOME_COLLAPSED_SECTIONS_KEY,
  HOME_MOVED_NOTICE_SEEN_KEY,
  HOME_SETUP_DISMISSED_KEY,
  HOME_PREFERENCE_KEYS,
  HOME_PREFERENCE_MAX_LENGTH,
  isHomePreferenceKey,
  validateHomePreferenceValue,
  parseHomeSectionIds,
} from './lib/homePreferences.js';
export type {
  HomeSectionId,
  HomeHideableSectionId,
  HomeCollapsibleSectionId,
  HomePreferenceKey,
  HomePreferenceInvalidReason,
} from './lib/homePreferences.js';
