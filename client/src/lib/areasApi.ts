import { get, post, patch, del } from './apiClient.js';
import type {
  AreaResponse,
  AreaListResponse,
  AreaSingleResponse,
  CreateAreaRequest,
  UpdateAreaRequest,
  AreaListQuery,
  AreaListWithCountsResponse,
  AreaWithCounts,
  DeleteAreaResponse,
  ReorderAreasRequest,
} from '@cornerstone/shared';

/**
 * Fetches a list of areas with optional search.
 */
export function fetchAreas(params?: AreaListQuery): Promise<AreaListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.search) {
    queryParams.set('search', params.search);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/areas?${queryString}` : '/areas';

  return get<AreaListResponse>(path);
}

/**
 * Fetches every area with its direct counts (tasks, purchases, photos).
 */
export function fetchAreasWithCounts(): Promise<AreaWithCounts[]> {
  return get<AreaListWithCountsResponse>('/areas?include=counts').then((r) => r.areas);
}

/**
 * Atomically reorders the children of `parentId` (`null` = top level): `ids` is every one of
 * them exactly once, in the new order.
 * @throws {ApiClientError} with code REORDER_SET_MISMATCH (409) when the set of ids is stale.
 */
export async function reorderAreas(body: ReorderAreasRequest): Promise<AreaResponse[]> {
  const response = await patch<AreaListResponse>('/areas/reorder', body);
  return response.areas;
}

/**
 * Fetches a single area by ID.
 */
export function fetchArea(id: string): Promise<AreaResponse> {
  return get<AreaSingleResponse>(`/areas/${id}`).then((r) => r.area);
}

/**
 * Creates a new area.
 */
export function createArea(data: CreateAreaRequest): Promise<AreaResponse> {
  return post<AreaSingleResponse>('/areas', data).then((r) => r.area);
}

/**
 * Updates an existing area.
 */
export function updateArea(id: string, data: UpdateAreaRequest): Promise<AreaResponse> {
  return patch<AreaSingleResponse>(`/areas/${id}`, data).then((r) => r.area);
}

/**
 * Deletes an area with its sub-areas. The response carries the Undo token.
 * @throws {ApiClientError} with statusCode 409 if the area is in use.
 */
export function deleteArea(id: string): Promise<DeleteAreaResponse> {
  return del<DeleteAreaResponse>(`/areas/${id}`);
}
