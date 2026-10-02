---
name: issue-2132-restore-in-place-tests
description: Test patterns for restoreSwap/executeRestore (in-place restore) - fs spy injection, WAL fixtures, non-idempotent rollback bug found, "./" archive quirk
metadata:
  type: project
---

- Inject fs failures with `jest.spyOn(fs, 'renameSync')` on the DEFAULT `node:fs` import (restoreSwap.ts uses it); rules fire once, others pass through. `fs.promises` spies work too (backupService uses `promises as fs`, same object).
- Byte-identical rollback assertions need a NON-WAL live DB: closing a WAL DB deletes -wal/-shm and changes the tree.
- Legacy tests that restore a real archive need a `_migrations` table in the live DB (validation requires it).
- A test that calls `beginRestore` and never `executeRestore` leaks the module-level lock and cascades failures into every later test; probe the lock with `createBackup` on a fresh connection instead.
- Found prod bug (fixed same session): rollbackSwap in phase moving-in deleted already-reinstated originals on retry; fix = rewrite marker to moving-aside after deleting restored entries. Test: "data-loss regression" in restoreSwap.test.ts and backupService.test.ts.
- Quirk pinned: archive entries prefixed "./data/" pass the extract filter (it ignores ".") but `strip:1` leaves `data/` in staging, so the result is "Backup archive contains no database", not a layout error.
- node-tar `tar.list({file, onReadEntry})` returns a promise; dir entries have trailing "/".
