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
}

/**
 * Request body for creating a new dependency.
 */
export interface CreateDependencyRequest {
  predecessorId: string;
  dependencyType?: DependencyType;
}

/**
 * Response for creating a dependency.
 */
export interface DependencyCreatedResponse {
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
}
