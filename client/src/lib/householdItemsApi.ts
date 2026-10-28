import { get, post, patch, del } from './apiClient.js';
import type { RequestOptions } from './apiClient.js';
import type {
  HouseholdItemDetail,
  HouseholdItemListQuery,
  HouseholdItemListResponse,
  HouseholdItemListRowsResponse,
  HouseholdItemResponse,
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
} from '@cornerstone/shared';

const STRING_PARAMS = [
  'q',
  'category',
  'status',
  'vendorId',
  'areaId',
  'sortBy',
  'sortOrder',
  'group',
  'targetDeliveryFrom',
  'targetDeliveryTo',
  'actualDeliveryFrom',
  'actualDeliveryTo',
] as const satisfies readonly (keyof HouseholdItemListQuery)[];

const NUMBER_PARAMS = [
  'page',
  'pageSize',
  'plannedCostMin',
  'plannedCostMax',
  'actualCostMin',
  'actualCostMax',
  'budgetLinesMin',
  'budgetLinesMax',
  'expectedCostMin',
  'expectedCostMax',
  'grantsMin',
  'grantsMax',
  'afterGrantsMin',
  'afterGrantsMax',
] as const satisfies readonly (keyof HouseholdItemListQuery)[];

/** The request path of GET /api/household-items for every HouseholdItemListQuery field. */
function listPath(params?: HouseholdItemListQuery): string {
  const queryParams = new URLSearchParams();
  for (const key of STRING_PARAMS) {
    const value = params?.[key];
    if (value) queryParams.set(key, value);
  }
  for (const key of NUMBER_PARAMS) {
    const value = params?.[key];
    if (value !== undefined) queryParams.set(key, value.toString());
  }
  const queryString = queryParams.toString();
  return queryString ? `/household-items?${queryString}` : '/household-items';
}

/**
 * Fetches a paginated list of household items with optional search and filtering.
 */
export function listHouseholdItems(
  params?: HouseholdItemListQuery,
  options?: RequestOptions,
): Promise<HouseholdItemListResponse> {
  return get<HouseholdItemListResponse>(listPath(params), options);
}

/**
 * Fetches the Purchases list rows: the engine's Expected cost and Paid per row, the status group
 * counts (group=status), the scope total and the totals over every row matching the query.
 */
export function listHouseholdItemRows(
  params?: HouseholdItemListQuery,
  options?: RequestOptions,
): Promise<HouseholdItemListRowsResponse> {
  return get<HouseholdItemListRowsResponse>(listPath(params), options);
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
