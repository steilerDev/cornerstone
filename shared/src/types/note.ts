/**
 * Note-related types and interfaces.
 * Notes are comments/annotations on work items.
 */

/**
 * User summary shape used in note responses.
 */
export interface NoteUserSummary {
  id: string;
  displayName: string;
}

/**
 * Note entity as stored in the database.
 */
export interface Note {
  id: string;
  workItemId: string;
  content: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Note response shape for API responses.
 */
export interface NoteResponse {
  id: string;
  content: string;
  createdBy: NoteUserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new note.
 */
export interface CreateNoteRequest {
  content: string;
}

/**
 * Request body for updating a note.
 */
export interface UpdateNoteRequest {
  content: string;
}

/**
 * Response for GET /api/work-items/:workItemId/notes - list all notes.
 */
export interface NoteListResponse {
  notes: NoteResponse[];
}
