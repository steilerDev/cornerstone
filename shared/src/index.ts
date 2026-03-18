/**
 * @cornerstone/shared
 *
 * Shared TypeScript types and interfaces used by both the server and client.
 * This package contains API request/response shapes, entity types, and
 * common constants.
 */

export type { ApiError, ApiErrorResponse } from './types/api.js';
export type { ErrorCode } from './types/errors.js';
export type { User, UserResponse, UserRole, AuthProvider } from './types/user.js';

// Pagination
export type { PaginationMeta, PaginatedResponse } from './types/pagination.js';

// Tags
export type {
  Tag,
  TagResponse,
  CreateTagRequest,
  UpdateTagRequest,
  TagListResponse,
} from './types/tag.js';

// Work Items
export type {
  WorkItem,
  WorkItemStatus,
  WorkItemSummary,
  WorkItemDetail,
  UserSummary,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemListQuery,
  WorkItemListResponse,
  WorkItemDependenciesResponse,
  DependencyResponse,
  MilestoneSummaryForWorkItem,
  WorkItemMilestones,
} from './types/workItem.js';

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
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  VendorCreateResponse,
  VendorDetailResponse,
} from './types/vendor.js';

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
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  InvoiceListResponse,
  InvoiceResponse,
  InvoiceStatusSummary,
  InvoiceStatusBreakdown,
  InvoiceListPaginatedResponse,
  InvoiceDetailResponse,
} from './types/invoice.js';

// Invoice Budget Lines
export type {
  InvoiceBudgetLine,
  InvoiceBudgetLineSummary,
  CreateInvoiceBudgetLineRequest,
  UpdateInvoiceBudgetLineRequest,
  InvoiceBudgetLineResponse,
  InvoiceBudgetLineListResponse,
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineCreateResponse,
  InvoiceBudgetLineListDetailResponse,
} from './types/invoiceBudgetLine.js';

// Budget Sources
export type {
  BudgetSource,
  BudgetSourceType,
  BudgetSourceStatus,
  CreateBudgetSourceRequest,
  UpdateBudgetSourceRequest,
  BudgetSourceListResponse,
  BudgetSourceResponse,
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
  CategoryBudgetSummary,
  BudgetOverview,
  BudgetOverviewResponse,
} from './types/budgetOverview.js';

// Budget Breakdown
export type {
  CostDisplay,
  BreakdownBudgetLine,
  BreakdownWorkItem,
  BreakdownWorkItemCategory,
  BreakdownHouseholdItem,
  BreakdownHouseholdItemCategory,
  BreakdownTotals,
  BudgetBreakdown,
  BudgetBreakdownResponse,
} from './types/budgetBreakdown.js';

// Work Item Budgets
export type {
  ConfidenceLevel,
  BudgetSourceSummary,
  VendorSummary,
  InvoiceSummary,
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
  WorkItemBudgetListResponse,
  WorkItemBudgetResponse,
} from './types/workItemBudget.js';
export { CONFIDENCE_MARGINS } from './types/workItemBudget.js';

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
} from './types/milestone.js';

// Scheduling
export type {
  ScheduleRequest,
  ScheduleResponse,
  ScheduledItem,
  ScheduleWarningType,
  ScheduleWarning,
} from './types/schedule.js';

// Timeline
export type {
  TimelineWorkItem,
  TimelineDependency,
  TimelineMilestone,
  TimelineHouseholdItem,
  TimelineDateRange,
  TimelineResponse,
} from './types/timeline.js';

// Documents (Paperless-ngx Integration)
export type {
  DocumentLinkEntityType,
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
  DocumentLinkResponse,
  DocumentLinkListResponse,
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
} from './types/preference.js';

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
  UpdatePhotoRequest,
  ReorderPhotosRequest,
} from './types/photo.js';

// Diary (Construction Diary / Bautagebuch)
export type {
  ManualDiaryEntryType,
  AutomaticDiaryEntryType,
  DiaryEntryType,
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
  AutoEventMetadata,
  DiaryEntryMetadata,
  DiarySourceEntityType,
  DiaryUserSummary,
  DiaryEntrySummary,
  DiaryEntryDetail,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  DiaryEntryListQuery,
  DiaryEntryListResponse,
} from './types/diary.js';

// Application Config
export type { AppConfigResponse } from './types/config.js';
