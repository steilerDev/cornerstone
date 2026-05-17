---
name: diary-drafts-pattern
description: Draft entity lifecycle pattern using a status column on the parent table (chosen for diary entries in ADR-022 / issue #1426) — single-table model preserves single id across draft→saved and avoids parallel API surface
metadata:
  type: project
---

# Draft-entity lifecycle: status column on parent table (ADR-022)

For "in-progress entity that becomes a real entity once validated" flows (issue #1426: diary photos lost on create-form submit failure), the chosen pattern is a `status TEXT NOT NULL DEFAULT 'saved' CHECK(status IN ('draft','saved'))` column on the parent table, **not** a separate `*_drafts` table.

**Why:**

- Preserves single id across draft → saved, so any polymorphic FK that already references the entity (`photos.entity_id`, `document_links.entity_id`, source-entity backlinks) keeps working unchanged.
- Default `'saved'` is backward-compatible — pre-existing rows need no data migration.
- One CRUD surface, not two. Validation branches on `status` inside the existing handlers.
- Cascade-delete on draft discard reuses the existing entity-delete path.

**How to apply:**

- Add the status column with `DEFAULT 'saved'` so the ALTER is non-breaking.
- Add a **partial index** on `(status, updated_at) WHERE status = 'draft'` for the orphan-cleanup query (don't index the much larger saved set).
- Relax validation for draft writes **inline** in the existing endpoint, gated by `status` (don't duplicate the endpoint).
- Add a single `PATCH /:id/promote` endpoint that runs full validation atomically and flips status. A saved entry cannot be reverted to a draft.
- Orphan cleanup uses `node-cron` (already in the tree from `backupService`) — reuse that scheduler lifecycle pattern. Make retention configurable via env var with a sensible default (chose 30 days for diary).
- List endpoint returns drafts by default; callers that surface data outside the timeline (dashboard tiles, exports, reports) MUST pass `status=saved` explicitly. Document the read-path checklist in the ADR so future code doesn't leak drafts.
- For URL transitions: when the create page auto-creates a draft, use `navigate('/<entity>/<id>/edit', { replace: true })` (not push) so the back button goes to the list, not back to the create shell.
- Photo upload back-pressure: client-side queue with `Promise.all` was the bug. Replace with a 3-concurrent queue, per-item state (`queued/uploading/succeeded/failed`), retain failed `File` objects in memory for retry.

**Reusability:** This pattern is a candidate for any future "in-progress entity that becomes a real entity once validated" surface (e.g., invoice drafts, work-item drafts). If applying to a new entity, just follow the ADR-022 template.

See: [[diary-drafts-pattern]] (this file), `wiki/ADR-022-Diary-Drafts.md`, `server/src/db/migrations/0033_diary_entry_status.sql`, `server/src/services/backupService.ts` (cron lifecycle reference).
