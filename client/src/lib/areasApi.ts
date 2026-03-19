import { get, post, patch, del } from './apiClient.js';
import type {
  AreaResponse,
  AreaListResponse,
  AreaSingleResponse,
  CreateAreaRequest,
  UpdateAreaRequest,
  AreaListQuery,
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
 * Deletes an area.
 * @throws {ApiClientError} with statusCode 409 if the area is in use.
 */
export function deleteArea(id: string): Promise<void> {
  return del<void>(`/areas/${id}`);
}
