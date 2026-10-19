---
name: diary-rules-specs
description: Hazards when speccing diary validation changes (EPIC-21 2.1, contract 5) — client-only "first content" rule, undo snapshot vs type change, falsy-body PATCH, unvalidated entryDate, planned-contract drafting errors
metadata:
  type: project
---

Found while speccing #2220 (P2.1, diary service rules).

1. **"No draft until first content" cannot be enforced server-side.** The photo-first path needs an entity id before upload, so the draft POST is content-free. Spec it as a client rule (capture screen) and keep the server accepting empty drafts. Current UI and E2E helpers rely on eager draft creation.
2. **Status Undo snapshots only tracked columns.** diary_entry tracks `metadata`/`updatedAt`. A PATCH that changes another column, such as `entryType`, while dropping `resolutionStatus` would yield an Undo that restores metadata onto the wrong type. Skip `runUndoable` for such requests.
3. **Truthiness bugs in PATCH merges**: `data.body ? … : entry.body` silently ignores `''`. Check every `x ? x : stored` merge when a rule starts allowing empty values.
4. **Planned contracts can contradict shipped code** (contract 5 said `409 ALREADY_SAVED`; code and endpoint docs say 400). Diff every status code in a planned contract against the AppError class.
5. **Photo dates**: `photos.taken_at` is never written; the spot endpoints date by `entry_date`. "Photo dates follow the entry" holds by derivation, so pin it with a PATCH-date → `listSpotPhotos` test.

**How to apply:** for any diary write-rule story, check all five. For any planned-contract story, run the status-code diff in (4).
