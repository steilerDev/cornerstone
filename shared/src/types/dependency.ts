/**
 * Dependency-related types and interfaces.
 * Dependencies define predecessor/successor relationships between work items for scheduling.
 */

/**
 * Dependency type enum - defines the relationship between predecessor and successor.
 */
export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish'
  | 'start_to_finish';

/**
 * Dependency entity as stored in the database.
 */
export interface Dependency {
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  leadLagDays: number;
}

/**
 * Request body for creating a new dependency.
 */
export interface CreateDependencyRequest {
  predecessorId: string;
  dependencyType?: DependencyType;
  /** Lead (negative) or lag (positive) offset in days. Default: 0. EPIC-06 addition. */
  leadLagDays?: number;
}

/**
 * Request body for updating a dependency (PATCH). EPIC-06 addition.
 */
export interface UpdateDependencyRequest {
  dependencyType?: DependencyType;
  leadLagDays?: number;
}

/**
 * Response for creating or updating a dependency.
 */
export interface DependencyCreatedResponse {
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  leadLagDays: number;
}
