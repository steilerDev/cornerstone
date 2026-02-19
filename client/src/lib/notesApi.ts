import { get, post, patch, del } from './apiClient.js';
import type {
  NoteResponse,
  NoteListResponse,
  CreateNoteRequest,
  UpdateNoteRequest,
} from '@cornerstone/shared';

/**
 * Fetches all notes for a work item, ordered chronologically (newest first).
 */
export function listNotes(workItemId: string): Promise<NoteListResponse> {
  return get<NoteListResponse>(`/work-items/${workItemId}/notes`);
}

/**
 * Creates a new note on a work item.
 */
export function createNote(workItemId: string, data: CreateNoteRequest): Promise<NoteResponse> {
  return post<NoteResponse>(`/work-items/${workItemId}/notes`, data);
}

/**
 * Updates an existing note.
 */
export function updateNote(
  workItemId: string,
  noteId: string,
  data: UpdateNoteRequest,
): Promise<NoteResponse> {
  return patch<NoteResponse>(`/work-items/${workItemId}/notes/${noteId}`, data);
}

/**
 * Deletes a note.
 */
export function deleteNote(workItemId: string, noteId: string): Promise<void> {
  return del<void>(`/work-items/${workItemId}/notes/${noteId}`);
}
