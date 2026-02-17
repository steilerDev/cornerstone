import { get, post, del } from './apiClient.js';
import type {
  WorkItemDependenciesResponse,
  CreateDependencyRequest,
  DependencyCreatedResponse,
} from '@cornerstone/shared';

/**
 * Fetches all dependencies for a work item (both predecessors and successors).
 */
export function getDependencies(workItemId: string): Promise<WorkItemDependenciesResponse> {
  return get<WorkItemDependenciesResponse>(`/work-items/${workItemId}/dependencies`);
}

/**
 * Creates a new dependency (makes this work item depend on another).
 */
export function createDependency(
  workItemId: string,
  data: CreateDependencyRequest,
): Promise<DependencyCreatedResponse> {
  return post<DependencyCreatedResponse>(`/work-items/${workItemId}/dependencies`, data);
}

/**
 * Deletes a dependency.
 */
export function deleteDependency(workItemId: string, predecessorId: string): Promise<void> {
  return del<void>(`/work-items/${workItemId}/dependencies/${predecessorId}`);
}
