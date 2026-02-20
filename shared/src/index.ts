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

// Invoices
export type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  InvoiceListResponse,
  InvoiceResponse,
} from './types/invoice.js';
