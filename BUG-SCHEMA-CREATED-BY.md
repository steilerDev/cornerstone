# BUG-SCHEMA-01: work_item_notes.created_by has contradictory constraints

**Severity**: Major
**Component**: Database Schema / Work Items
**Found in**: Schema integration tests (UAT-3.1-15)

## Steps to Reproduce

1. Apply migration 0002_create_work_items.sql
2. Create a user and a work item note with that user as the author
3. Delete the user
4. Observe constraint violation

## Expected Behavior

According to acceptance criterion #4 of Story #87:
> A `work_item_notes` table exists with columns: ... `created_by` (TEXT NOT NULL FK to users.id ON DELETE SET NULL)

When a user who authored a note is deleted, the `created_by` field should be set to NULL, preserving the note.

## Actual Behavior

The schema defines `created_by` as both `NOT NULL` and `ON DELETE SET NULL`, which is contradictory. SQLite cannot set a NOT NULL column to NULL.

When attempting to delete a user who authored notes, SQLite raises:
```
NOT NULL constraint failed: work_item_notes.created_by
```

## Root Cause

Both the SQL migration (`0002_create_work_items.sql`) and Drizzle schema definition have this issue:

**Migration SQL (line 43):**
```sql
created_by TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL
```

**Drizzle Schema (schema.ts:144-146):**
```typescript
createdBy: text('created_by')
  .notNull()
  .references(() => users.id, { onDelete: 'set null' }),
```

## Fix Options

**Option 1: Make created_by nullable (RECOMMENDED)**
- Change to: `created_by TEXT REFERENCES users(id) ON DELETE SET NULL`
- Allows preserving note history when a user is deleted
- Note content remains, but author is unknown

**Option 2: Cascade delete notes**
- Change to: `created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- When a user is deleted, all their authored notes are deleted
- May lose valuable historical information

**Option 3: Prevent user deletion if they authored notes**
- Change to: `created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
- Requires cleaning up/reassigning notes before deleting a user
- Most disruptive to user management flow

## Recommendation

Implement **Option 1** (nullable created_by with SET NULL). This preserves historical notes while allowing user deletion. The application can handle NULL created_by by showing "Unknown User" or similar in the UI.

This matches the existing pattern for `work_items.created_by`, which is also nullable with SET NULL on delete.

## Evidence

Test output from `server/src/db/schema.test.ts`:
```
● Work Items Database Schema & Migration › Foreign Key Constraints - CASCADE Delete › UAT-3.1-15: deleting a user sets created_by to NULL in notes

  SqliteError: NOT NULL constraint failed: work_item_notes.created_by
```

## Notes

- This affects Story #87 (Work Items Database Schema & Migration)
- Test UAT-3.1-15 was updated to document the current (buggy) behavior
- Same issue exists for `work_items.created_by` but that field is already nullable in practice
