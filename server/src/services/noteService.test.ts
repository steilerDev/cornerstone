import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as noteService from './noteService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/AppError.js';
import type { CreateNoteRequest, UpdateNoteRequest } from '@cornerstone/shared';

describe('Note Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /**
   * Creates a fresh in-memory database with migrations applied.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Create a test user
   */
  function createTestUser(email: string, displayName: string, role: 'admin' | 'member' = 'member') {
    const now = new Date().toISOString();
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.users)
      .values({
        id: userId,
        email,
        displayName,
        role,
        authProvider: 'local',
        passwordHash: '$scrypt$n=16384,r=8,p=1$c29tZXNhbHQ=$c29tZWhhc2g=',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  /**
   * Helper: Create a test work item
   */
  function createTestWorkItem(userId: string, title: string) {
    const now = new Date().toISOString();
    const workItemId = `work-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItems)
      .values({
        id: workItemId,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  /**
   * Helper: Create a test note directly in the database
   * Uses a timestamp offset to ensure unique created_at values for sorting tests
   */
  let noteTimestampOffset = 0;
  function createTestNote(workItemId: string, userId: string, content: string) {
    // Add 1ms offset for each note to ensure unique timestamps
    const timestamp = new Date(Date.now() + noteTimestampOffset).toISOString();
    noteTimestampOffset += 1;

    const noteId = `note-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItemNotes)
      .values({
        id: noteId,
        workItemId,
        content,
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return noteId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    noteTimestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('createNote()', () => {
    it('creates a note with valid content (UAT-3.4-01)', () => {
      // Given: A user and work item exist
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateNoteRequest = { content: 'This is a test note' };

      // When: Creating a note
      const result = noteService.createNote(db, workItemId, userId, data);

      // Then: Note is created successfully
      expect(result.id).toBeDefined();
      expect(result.content).toBe('This is a test note');
      expect(result.createdBy).toEqual({ id: userId, displayName: 'Test User' });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('trims whitespace from note content', () => {
      // Given: A user and work item exist
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateNoteRequest = { content: '  Trimmed content  ' };

      // When: Creating a note
      const result = noteService.createNote(db, workItemId, userId, data);

      // Then: Content is trimmed
      expect(result.content).toBe('Trimmed content');
    });

    it('throws NotFoundError if work item does not exist (UAT-3.4-02)', () => {
      // Given: A user exists but work item does not
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateNoteRequest = { content: 'Note on missing work item' };

      // When: Creating a note on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.createNote(db, 'nonexistent-work-item', userId, data);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.createNote(db, 'nonexistent-work-item', userId, data);
      }).toThrow('Work item not found');
    });

    it('throws ValidationError if content is empty after trimming (UAT-3.4-03)', () => {
      // Given: A user and work item exist
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateNoteRequest = { content: '   ' };

      // When: Creating a note with empty content
      // Then: ValidationError is thrown
      expect(() => {
        noteService.createNote(db, workItemId, userId, data);
      }).toThrow(ValidationError);
      expect(() => {
        noteService.createNote(db, workItemId, userId, data);
      }).toThrow('Note content cannot be empty');
    });

    it('includes author user summary in response', () => {
      // Given: A user and work item exist
      const userId = createTestUser('author@example.com', 'Note Author');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateNoteRequest = { content: 'Authored note' };

      // When: Creating a note
      const result = noteService.createNote(db, workItemId, userId, data);

      // Then: createdBy includes user summary
      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(userId);
      expect(result.createdBy?.displayName).toBe('Note Author');
    });
  });

  describe('listNotes()', () => {
    it('returns notes sorted by created_at DESC (newest first) (UAT-3.4-07)', () => {
      // Given: A work item with multiple notes created at different times
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // Create notes with small delays to ensure different timestamps
      const note1Id = createTestNote(workItemId, userId, 'First note');
      const note2Id = createTestNote(workItemId, userId, 'Second note');
      const note3Id = createTestNote(workItemId, userId, 'Third note');

      // When: Listing notes
      const result = noteService.listNotes(db, workItemId);

      // Then: Notes are sorted newest first
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(note3Id); // Most recent
      expect(result[1].id).toBe(note2Id);
      expect(result[2].id).toBe(note1Id); // Oldest
    });

    it('returns empty array when no notes exist (UAT-3.4-08)', () => {
      // Given: A work item with no notes
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Listing notes
      const result = noteService.listNotes(db, workItemId);

      // Then: Empty array is returned
      expect(result).toEqual([]);
    });

    it('includes createdBy user summary for each note', () => {
      // Given: Multiple users and notes
      const user1Id = createTestUser('user1@example.com', 'User One');
      const user2Id = createTestUser('user2@example.com', 'User Two');
      const workItemId = createTestWorkItem(user1Id, 'Test Work Item');

      createTestNote(workItemId, user1Id, 'Note by User One');
      createTestNote(workItemId, user2Id, 'Note by User Two');

      // When: Listing notes
      const result = noteService.listNotes(db, workItemId);

      // Then: Each note includes correct author summary
      expect(result).toHaveLength(2);
      expect(result[0].createdBy?.displayName).toBe('User Two');
      expect(result[1].createdBy?.displayName).toBe('User One');
    });

    it('throws NotFoundError if work item does not exist', () => {
      // Given: No work item exists
      // When: Listing notes for non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.listNotes(db, 'nonexistent-work-item');
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.listNotes(db, 'nonexistent-work-item');
      }).toThrow('Work item not found');
    });

    it('handles notes with null createdBy (deleted user)', () => {
      // Given: A work item with a note, then the author is deleted
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      createTestNote(workItemId, userId, 'Note content');

      // Simulate user deletion (sets createdBy to NULL via CASCADE)
      db.delete(schema.users).where(eq(schema.users.id, userId)).run();

      // When: Listing notes
      const result = noteService.listNotes(db, workItemId);

      // Then: Note still exists but createdBy is null
      expect(result).toHaveLength(1);
      expect(result[0].createdBy).toBeNull();
    });
  });

  describe('updateNote()', () => {
    it('allows note author to update content (UAT-3.4-09)', () => {
      // Given: A user creates a note
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');
      const data: UpdateNoteRequest = { content: 'Updated content' };

      // When: Author updates the note
      const result = noteService.updateNote(db, workItemId, noteId, userId, false, data);

      // Then: Note is updated
      expect(result.content).toBe('Updated content');
      expect(result.id).toBe(noteId);
    });

    it('allows admin to update any note (UAT-3.4-10)', () => {
      // Given: A regular user creates a note, and an admin exists
      const regularUserId = createTestUser('user@example.com', 'Regular User');
      const adminUserId = createTestUser('admin@example.com', 'Admin User', 'admin');
      const workItemId = createTestWorkItem(regularUserId, 'Test Work Item');
      const noteId = createTestNote(workItemId, regularUserId, 'Original content');
      const data: UpdateNoteRequest = { content: 'Updated by admin' };

      // When: Admin updates the note
      const result = noteService.updateNote(db, workItemId, noteId, adminUserId, true, data);

      // Then: Note is updated
      expect(result.content).toBe('Updated by admin');
    });

    it('throws ForbiddenError if non-author non-admin tries to update (UAT-3.4-11)', () => {
      // Given: Two regular users
      const author = createTestUser('author@example.com', 'Author');
      const otherUser = createTestUser('other@example.com', 'Other User');
      const workItemId = createTestWorkItem(author, 'Test Work Item');
      const noteId = createTestNote(workItemId, author, 'Original content');
      const data: UpdateNoteRequest = { content: 'Unauthorized update' };

      // When: Non-author non-admin tries to update
      // Then: ForbiddenError is thrown
      expect(() => {
        noteService.updateNote(db, workItemId, noteId, otherUser, false, data);
      }).toThrow(ForbiddenError);
      expect(() => {
        noteService.updateNote(db, workItemId, noteId, otherUser, false, data);
      }).toThrow('Only the note author or an admin can update this note');
    });

    it('throws NotFoundError if note does not exist (UAT-3.4-12)', () => {
      // Given: A work item exists but note does not
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: UpdateNoteRequest = { content: 'Update content' };

      // When: Updating non-existent note
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.updateNote(db, workItemId, 'nonexistent-note', userId, false, data);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.updateNote(db, workItemId, 'nonexistent-note', userId, false, data);
      }).toThrow('Note not found');
    });

    it('throws NotFoundError if work item does not exist (UAT-3.4-12)', () => {
      // Given: No work item exists
      const userId = createTestUser('user@example.com', 'Test User');
      const data: UpdateNoteRequest = { content: 'Update content' };

      // When: Updating note on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.updateNote(db, 'nonexistent-work-item', 'some-note', userId, false, data);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.updateNote(db, 'nonexistent-work-item', 'some-note', userId, false, data);
      }).toThrow('Work item not found');
    });

    it('throws ValidationError if content is empty after trimming (UAT-3.4-13)', () => {
      // Given: A user creates a note
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');
      const data: UpdateNoteRequest = { content: '   ' };

      // When: Updating with empty content
      // Then: ValidationError is thrown
      expect(() => {
        noteService.updateNote(db, workItemId, noteId, userId, false, data);
      }).toThrow(ValidationError);
      expect(() => {
        noteService.updateNote(db, workItemId, noteId, userId, false, data);
      }).toThrow('Note content cannot be empty');
    });

    it('trims whitespace from updated content', () => {
      // Given: A user creates a note
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');
      const data: UpdateNoteRequest = { content: '  Trimmed update  ' };

      // When: Updating with whitespace
      const result = noteService.updateNote(db, workItemId, noteId, userId, false, data);

      // Then: Content is trimmed
      expect(result.content).toBe('Trimmed update');
    });

    it('updates updatedAt timestamp', async () => {
      // Given: A note exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');

      // Get original timestamps
      const originalNote = db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.id, noteId))
        .get();

      // Wait 1ms to ensure timestamp will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      // When: Updating note
      const data: UpdateNoteRequest = { content: 'Updated content' };
      const result = noteService.updateNote(db, workItemId, noteId, userId, false, data);

      // Then: updatedAt is changed, createdAt is unchanged
      expect(result.updatedAt).not.toBe(originalNote?.updatedAt);
      expect(result.createdAt).toBe(originalNote?.createdAt);
    });

    it('throws NotFoundError if note belongs to different work item', () => {
      // Given: Two work items, note on first work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem1Id = createTestWorkItem(userId, 'Work Item 1');
      const workItem2Id = createTestWorkItem(userId, 'Work Item 2');
      const noteId = createTestNote(workItem1Id, userId, 'Note on item 1');
      const data: UpdateNoteRequest = { content: 'Update' };

      // When: Trying to update note via wrong work item ID
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.updateNote(db, workItem2Id, noteId, userId, false, data);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.updateNote(db, workItem2Id, noteId, userId, false, data);
      }).toThrow('Note not found');
    });
  });

  describe('deleteNote()', () => {
    it('allows note author to delete note (UAT-3.4-14)', () => {
      // Given: A user creates a note
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Content to delete');

      // When: Author deletes the note
      noteService.deleteNote(db, workItemId, noteId, userId, false);

      // Then: Note is deleted
      const deletedNote = db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.id, noteId))
        .get();
      expect(deletedNote).toBeUndefined();
    });

    it('allows admin to delete any note (UAT-3.4-15)', () => {
      // Given: A regular user creates a note, and an admin exists
      const regularUserId = createTestUser('user@example.com', 'Regular User');
      const adminUserId = createTestUser('admin@example.com', 'Admin User', 'admin');
      const workItemId = createTestWorkItem(regularUserId, 'Test Work Item');
      const noteId = createTestNote(workItemId, regularUserId, 'Content to delete');

      // When: Admin deletes the note
      noteService.deleteNote(db, workItemId, noteId, adminUserId, true);

      // Then: Note is deleted
      const deletedNote = db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.id, noteId))
        .get();
      expect(deletedNote).toBeUndefined();
    });

    it('throws ForbiddenError if non-author non-admin tries to delete (UAT-3.4-16)', () => {
      // Given: Two regular users
      const author = createTestUser('author@example.com', 'Author');
      const otherUser = createTestUser('other@example.com', 'Other User');
      const workItemId = createTestWorkItem(author, 'Test Work Item');
      const noteId = createTestNote(workItemId, author, 'Content');

      // When: Non-author non-admin tries to delete
      // Then: ForbiddenError is thrown
      expect(() => {
        noteService.deleteNote(db, workItemId, noteId, otherUser, false);
      }).toThrow(ForbiddenError);
      expect(() => {
        noteService.deleteNote(db, workItemId, noteId, otherUser, false);
      }).toThrow('Only the note author or an admin can delete this note');
    });

    it('throws NotFoundError if note does not exist (UAT-3.4-17)', () => {
      // Given: A work item exists but note does not
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Deleting non-existent note
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.deleteNote(db, workItemId, 'nonexistent-note', userId, false);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.deleteNote(db, workItemId, 'nonexistent-note', userId, false);
      }).toThrow('Note not found');
    });

    it('throws NotFoundError if work item does not exist (UAT-3.4-17)', () => {
      // Given: No work item exists
      const userId = createTestUser('user@example.com', 'Test User');

      // When: Deleting note on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.deleteNote(db, 'nonexistent-work-item', 'some-note', userId, false);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.deleteNote(db, 'nonexistent-work-item', 'some-note', userId, false);
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError if note belongs to different work item', () => {
      // Given: Two work items, note on first work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem1Id = createTestWorkItem(userId, 'Work Item 1');
      const workItem2Id = createTestWorkItem(userId, 'Work Item 2');
      const noteId = createTestNote(workItem1Id, userId, 'Note on item 1');

      // When: Trying to delete note via wrong work item ID
      // Then: NotFoundError is thrown
      expect(() => {
        noteService.deleteNote(db, workItem2Id, noteId, userId, false);
      }).toThrow(NotFoundError);
      expect(() => {
        noteService.deleteNote(db, workItem2Id, noteId, userId, false);
      }).toThrow('Note not found');
    });
  });
});
