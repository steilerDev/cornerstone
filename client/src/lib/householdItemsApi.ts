import { get, post, patch, del } from './apiClient.js';
import type {
  HouseholdItemDetail,
  HouseholdItemListQuery,
  HouseholdItemListResponse,
  HouseholdItemResponse,
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
} from '@cornerstone/shared';

/**
 * Fetches a paginated list of household items with optional search and filtering.
 */
export function listHouseholdItems(
  params?: HouseholdItemListQuery,
): Promise<HouseholdItemListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.page !== undefined) {
    queryParams.set('page', params.page.toString());
  }
  if (params?.pageSize !== undefined) {
    queryParams.set('pageSize', params.pageSize.toString());
  }
  if (params?.q) {
    queryParams.set('q', params.q);
  }
  if (params?.category) {
    queryParams.set('category', params.category);
  }
  if (params?.status) {
    queryParams.set('status', params.status);
  }
  if (params?.vendorId) {
    queryParams.set('vendorId', params.vendorId);
  }
  if (params?.noBudget) {
    queryParams.set('noBudget', 'true');
  }
  if (params?.sortBy) {
    queryParams.set('sortBy', params.sortBy);
  }
  if (params?.sortOrder) {
    queryParams.set('sortOrder', params.sortOrder);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/household-items?${queryString}` : '/household-items';

  return get<HouseholdItemListResponse>(path);
}

/**
 * Fetches a single household item by ID with full details.
 */
export function getHouseholdItem(id: string): Promise<HouseholdItemDetail> {
  return get<HouseholdItemResponse>(`/household-items/${id}`).then((r) => r.householdItem);
}

/**
 * Creates a new household item.
 */
export function createHouseholdItem(
  data: CreateHouseholdItemRequest,
): Promise<HouseholdItemDetail> {
  return post<HouseholdItemResponse>('/household-items', data).then((r) => r.householdItem);
}

/**
 * Updates an existing household item.
 * All fields are optional; at least one must be provided.
 */
export function updateHouseholdItem(
  id: string,
  data: UpdateHouseholdItemRequest,
): Promise<HouseholdItemDetail> {
  return patch<HouseholdItemResponse>(`/household-items/${id}`, data).then((r) => r.householdItem);
}

/**
 * Deletes a household item.
 */
export function deleteHouseholdItem(id: string): Promise<void> {
  return del<void>(`/household-items/${id}`);
}
