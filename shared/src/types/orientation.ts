/**
 * Orientation types and interfaces.
 * Orientations are user-configurable directional labels for photos
 * (e.g., "South" with description "Street-facing").
 * Story #1674: Mobile photo upload optimization.
 */

/**
 * Orientation summary shape used in photo responses.
 */
export interface OrientationSummary {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Full orientation entity returned by the API.
 */
export interface OrientationResponse {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response for GET /api/orientations (list).
 */
export interface OrientationListResponse {
  orientations: OrientationResponse[];
}

/**
 * Response for single orientation endpoints (POST, GET by ID, PATCH).
 */
export interface OrientationSingleResponse {
  orientation: OrientationResponse;
}

/**
 * Request body for creating a new orientation.
 */
export interface CreateOrientationRequest {
  name: string;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Request body for updating an orientation.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateOrientationRequest {
  name?: string;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Query parameters for GET /api/orientations.
 */
export interface OrientationListQuery {
  search?: string;
}
