import { get, post, patch, del } from './apiClient.js';
import type {
  SubtaskResponse,
  SubtaskListResponse,
  CreateSubtaskRequest,
  UpdateSubtaskRequest,
  ReorderSubtasksRequest,
} from '@cornerstone/shared';

/**
 * Fetches all subtasks for a work item, ordered by sortOrder.
 */
export function listSubtasks(workItemId: string): Promise<SubtaskListResponse> {
  return get<SubtaskListResponse>(`/work-items/${workItemId}/subtasks`);
}

/**
 * Creates a new subtask on a work item.
 */
export function createSubtask(
  workItemId: string,
  data: CreateSubtaskRequest,
): Promise<SubtaskResponse> {
  return post<SubtaskResponse>(`/work-items/${workItemId}/subtasks`, data);
}

/**
 * Updates an existing subtask.
 */
export function updateSubtask(
  workItemId: string,
  subtaskId: string,
  data: UpdateSubtaskRequest,
): Promise<SubtaskResponse> {
  return patch<SubtaskResponse>(`/work-items/${workItemId}/subtasks/${subtaskId}`, data);
}

/**
 * Deletes a subtask.
 */
export function deleteSubtask(workItemId: string, subtaskId: string): Promise<void> {
  return del<void>(`/work-items/${workItemId}/subtasks/${subtaskId}`);
}

/**
 * Reorders subtasks by updating their sortOrder values.
 */
export function reorderSubtasks(
  workItemId: string,
  data: ReorderSubtasksRequest,
): Promise<SubtaskListResponse> {
  return patch<SubtaskListResponse>(`/work-items/${workItemId}/subtasks/reorder`, data);
}
