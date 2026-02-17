/**
 * Subtask-related types and interfaces.
 * Subtasks are checklist items nested within work items.
 */

/**
 * Subtask entity as stored in the database.
 */
export interface Subtask {
  id: string;
  workItemId: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Subtask response shape for API responses.
 */
export interface SubtaskResponse {
  id: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new subtask.
 */
export interface CreateSubtaskRequest {
  title: string;
  sortOrder?: number;
}

/**
 * Request body for updating a subtask.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateSubtaskRequest {
  title?: string;
  isCompleted?: boolean;
  sortOrder?: number;
}

/**
 * Response for GET /api/work-items/:workItemId/subtasks - list all subtasks.
 */
export interface SubtaskListResponse {
  subtasks: SubtaskResponse[];
}

/**
 * Request body for reordering subtasks.
 */
export interface ReorderSubtasksRequest {
  subtaskIds: string[];
}
