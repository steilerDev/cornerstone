import { get, post, patch, del } from './apiClient.js';
import type {
  OrientationResponse,
  OrientationListResponse,
  OrientationSingleResponse,
  CreateOrientationRequest,
  UpdateOrientationRequest,
  OrientationListQuery,
} from '@cornerstone/shared';

/**
 * Fetches a list of orientations with optional search.
 */
export function fetchOrientations(params?: OrientationListQuery): Promise<OrientationListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.search) {
    queryParams.set('search', params.search);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/orientations?${queryString}` : '/orientations';

  return get<OrientationListResponse>(path);
}

/**
 * Fetches a single orientation by ID.
 */
export function fetchOrientation(id: string): Promise<OrientationResponse> {
  return get<OrientationSingleResponse>(`/orientations/${id}`).then((r) => r.orientation);
}

/**
 * Creates a new orientation.
 */
export function createOrientation(data: CreateOrientationRequest): Promise<OrientationResponse> {
  return post<OrientationSingleResponse>('/orientations', data).then((r) => r.orientation);
}

/**
 * Updates an existing orientation.
 */
export function updateOrientation(
  id: string,
  data: UpdateOrientationRequest,
): Promise<OrientationResponse> {
  return patch<OrientationSingleResponse>(`/orientations/${id}`, data).then((r) => r.orientation);
}

/**
 * Deletes an orientation.
 * @throws {ApiClientError} with statusCode 409 if the orientation is in use.
 */
export function deleteOrientation(id: string): Promise<void> {
  return del<void>(`/orientations/${id}`);
}
