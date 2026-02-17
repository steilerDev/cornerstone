import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItemNotes, workItems, users } from '../db/schema.js';
import type {
  NoteResponse,
  NoteUserSummary,
  CreateNoteRequest,
  UpdateNoteRequest,
} from '@cornerstone/shared';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database user row to NoteUserSummary shape.
 */
function toNoteUserSummary(user: typeof users.$inferSelect | null): NoteUserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
  };
}

/**
 * Convert database note row to NoteResponse shape.
 */
function toNoteResponse(
  note: typeof workItemNotes.$inferSelect,
  createdByUser: typeof users.$inferSelect | null,
): NoteResponse {
  return {
    id: note.id,
    content: note.content,
    createdBy: toNoteUserSummary(createdByUser),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

/**
 * Verify a work item exists.
 * @throws NotFoundError if work item does not exist
 */
function ensureWorkItemExists(db: DbType, workItemId: string): void {
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }
}

/**
 * Create a new note on a work item.
 * @throws NotFoundError if work item does not exist
 * @throws ValidationError if content is empty
 */
export function createNote(
  db: DbType,
  workItemId: string,
  userId: string,
  data: CreateNoteRequest,
): NoteResponse {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Validate content
  const trimmedContent = data.content.trim();
  if (trimmedContent.length === 0) {
    throw new ValidationError('Note content cannot be empty');
  }

  // Create note
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(workItemNotes)
    .values({
      id,
      workItemId,
      content: trimmedContent,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Fetch created by user
  const createdByUser = db.select().from(users).where(eq(users.id, userId)).get() || null;

  return toNoteResponse(
    {
      id,
      workItemId,
      content: trimmedContent,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    },
    createdByUser,
  );
}

/**
 * List all notes for a work item, sorted by created_at DESC (newest first).
 * @throws NotFoundError if work item does not exist
 */
export function listNotes(db: DbType, workItemId: string): NoteResponse[] {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Fetch notes with their authors
  const noteRows = db
    .select({
      note: workItemNotes,
      user: users,
    })
    .from(workItemNotes)
    .leftJoin(users, eq(users.id, workItemNotes.createdBy))
    .where(eq(workItemNotes.workItemId, workItemId))
    .orderBy(desc(workItemNotes.createdAt))
    .all();

  return noteRows.map((row) => toNoteResponse(row.note, row.user));
}

/**
 * Update a note's content.
 * Only the note author or an admin can update the note.
 * @throws NotFoundError if work item or note does not exist
 * @throws ForbiddenError if user is not the author and not an admin
 * @throws ValidationError if content is empty
 */
export function updateNote(
  db: DbType,
  workItemId: string,
  noteId: string,
  userId: string,
  isAdmin: boolean,
  data: UpdateNoteRequest,
): NoteResponse {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Fetch note
  const note = db
    .select()
    .from(workItemNotes)
    .where(eq(workItemNotes.id, noteId))
    .get();

  if (!note) {
    throw new NotFoundError('Note not found');
  }

  // Verify note belongs to this work item
  if (note.workItemId !== workItemId) {
    throw new NotFoundError('Note not found');
  }

  // Check authorization: only author or admin can update
  if (note.createdBy !== userId && !isAdmin) {
    throw new ForbiddenError('Only the note author or an admin can update this note');
  }

  // Validate content
  const trimmedContent = data.content.trim();
  if (trimmedContent.length === 0) {
    throw new ValidationError('Note content cannot be empty');
  }

  // Update note
  const now = new Date().toISOString();
  db.update(workItemNotes)
    .set({
      content: trimmedContent,
      updatedAt: now,
    })
    .where(eq(workItemNotes.id, noteId))
    .run();

  // Fetch updated note with author
  const updatedNote = db
    .select({
      note: workItemNotes,
      user: users,
    })
    .from(workItemNotes)
    .leftJoin(users, eq(users.id, workItemNotes.createdBy))
    .where(eq(workItemNotes.id, noteId))
    .get();

  return toNoteResponse(updatedNote!.note, updatedNote!.user);
}

/**
 * Delete a note.
 * Only the note author or an admin can delete the note.
 * @throws NotFoundError if work item or note does not exist
 * @throws ForbiddenError if user is not the author and not an admin
 */
export function deleteNote(
  db: DbType,
  workItemId: string,
  noteId: string,
  userId: string,
  isAdmin: boolean,
): void {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Fetch note
  const note = db
    .select()
    .from(workItemNotes)
    .where(eq(workItemNotes.id, noteId))
    .get();

  if (!note) {
    throw new NotFoundError('Note not found');
  }

  // Verify note belongs to this work item
  if (note.workItemId !== workItemId) {
    throw new NotFoundError('Note not found');
  }

  // Check authorization: only author or admin can delete
  if (note.createdBy !== userId && !isAdmin) {
    throw new ForbiddenError('Only the note author or an admin can delete this note');
  }

  // Delete note
  db.delete(workItemNotes).where(eq(workItemNotes.id, noteId)).run();
}
