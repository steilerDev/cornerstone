import { get, post, patch, del } from './apiClient.js';
import type {
  WorkItemListResponse,
  WorkItemListQuery,
  WorkItemDetail,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  Vendor,
  SubsidyProgram,
} from '@cornerstone/shared';

/**
 * Fetches a paginated list of work items with optional filters, search, and sorting.
 */
export function listWorkItems(params?: WorkItemListQuery): Promise<WorkItemListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.page !== undefined) {
    queryParams.set('page', params.page.toString());
  }
  if (params?.pageSize !== undefined) {
    queryParams.set('pageSize', params.pageSize.toString());
  }
  if (params?.status) {
    queryParams.set('status', params.status);
  }
  if (params?.assignedUserId) {
    queryParams.set('assignedUserId', params.assignedUserId);
  }
  if (params?.tagId) {
    queryParams.set('tagId', params.tagId);
  }
  if (params?.q) {
    queryParams.set('q', params.q);
  }
  if (params?.sortBy) {
    queryParams.set('sortBy', params.sortBy);
  }
  if (params?.sortOrder) {
    queryParams.set('sortOrder', params.sortOrder);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/work-items?${queryString}` : '/work-items';

  return get<WorkItemListResponse>(path);
}

/**
 * Fetches a single work item by ID with full details.
 */
export function getWorkItem(id: string): Promise<WorkItemDetail> {
  return get<WorkItemDetail>(`/work-items/${id}`);
}

/**
 * Creates a new work item.
 */
export function createWorkItem(data: CreateWorkItemRequest): Promise<WorkItemDetail> {
  return post<WorkItemDetail>('/work-items', data);
}

/**
 * Updates an existing work item.
 */
export function updateWorkItem(id: string, data: UpdateWorkItemRequest): Promise<WorkItemDetail> {
  return patch<WorkItemDetail>(`/work-items/${id}`, data);
}

/**
 * Deletes a work item.
 */
export function deleteWorkItem(id: string): Promise<void> {
  return del<void>(`/work-items/${id}`);
}

// ─── Vendor linking ───────────────────────────────────────────────────────────

/**
 * Fetches all vendors linked to a work item.
 */
export function fetchWorkItemVendors(workItemId: string): Promise<Vendor[]> {
  return get<{ vendors: Vendor[] }>(`/work-items/${workItemId}/vendors`).then((r) => r.vendors);
}

/**
 * Links a vendor to a work item.
 */
export function linkWorkItemVendor(workItemId: string, vendorId: string): Promise<void> {
  return post<void>(`/work-items/${workItemId}/vendors`, { vendorId });
}

/**
 * Unlinks a vendor from a work item.
 */
export function unlinkWorkItemVendor(workItemId: string, vendorId: string): Promise<void> {
  return del<void>(`/work-items/${workItemId}/vendors/${vendorId}`);
}

// ─── Subsidy linking ──────────────────────────────────────────────────────────

/**
 * Fetches all subsidy programs linked to a work item.
 */
export function fetchWorkItemSubsidies(workItemId: string): Promise<SubsidyProgram[]> {
  return get<{ subsidyPrograms: SubsidyProgram[] }>(`/work-items/${workItemId}/subsidies`).then(
    (r) => r.subsidyPrograms,
  );
}

/**
 * Links a subsidy program to a work item.
 */
export function linkWorkItemSubsidy(workItemId: string, subsidyProgramId: string): Promise<void> {
  return post<void>(`/work-items/${workItemId}/subsidies`, { subsidyProgramId });
}

/**
 * Unlinks a subsidy program from a work item.
 */
export function unlinkWorkItemSubsidy(workItemId: string, subsidyProgramId: string): Promise<void> {
  return del<void>(`/work-items/${workItemId}/subsidies/${subsidyProgramId}`);
}
