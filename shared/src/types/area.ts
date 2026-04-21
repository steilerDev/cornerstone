/**
 * Area types and interfaces.
 * Areas are hierarchical location/space divisions within the construction project.
 * Areas can have parent-child relationships (e.g., Kitchen > Kitchen Cabinets).
 */

import type { PaginatedResponse } from './pagination.js';

/**
 * A single ancestor entry in the area parent chain.
 * Contains only the fields needed for breadcrumb rendering.
 */
export interface AreaAncestor {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Area summary shape used in work item and household item responses.
 */
export interface AreaSummary {
  id: string;
  name: string;
  color: string | null;
  /**
   * Ancestor chain in root-first order. Does NOT include the area itself.
   * Empty array for root-level areas (no parent).
   */
  ancestors: AreaAncestor[];
}

/**
 * Area entity as stored in the database and returned by the API.
 */
export interface AreaResponse {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response for GET /api/areas (list of areas).
 */
export interface AreaListResponse {
  areas: AreaResponse[];
}

/**
 * Response for single area endpoints (POST, GET by ID, PATCH).
 */
export interface AreaSingleResponse {
  area: AreaResponse;
}

/**
 * Request body for creating a new area.
 */
export interface CreateAreaRequest {
  name: string;
  parentId?: string | null;
  color?: string | null;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Request body for updating an area.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateAreaRequest {
  name?: string;
  parentId?: string | null;
  color?: string | null;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Query parameters for GET /api/areas (list with filtering, sorting, pagination).
 */
export interface AreaListQuery {
  search?: string;
}
