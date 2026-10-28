import { get, post, patch, del } from './apiClient.js';
import type { UndoableDeleteResponse } from '@cornerstone/shared';
import type {
  WorkItemDependenciesResponse,
  CreateDependencyRequest,
  UpdateDependencyRequest,
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
export function deleteDependency(
  workItemId: string,
  predecessorId: string,
): Promise<UndoableDeleteResponse> {
  return del<UndoableDeleteResponse>(`/work-items/${workItemId}/dependencies/${predecessorId}`);
}

/**
 * Changes a dependency's type and/or lag (the successor is the task that waits).
 */
export function updateDependency(
  successorId: string,
  predecessorId: string,
  data: UpdateDependencyRequest,
): Promise<DependencyCreatedResponse> {
  return patch<DependencyCreatedResponse>(
    `/work-items/${successorId}/dependencies/${predecessorId}`,
    data,
  );
}
