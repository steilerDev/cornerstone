---
name: Standalone diary bugs and stories (no active parent epic)
description: Index of standalone diary issues filed against shipped EPIC-13 functionality. Useful when a future diary epic is opened.
metadata:
  type: project
---

EPIC-13 (#446, Construction Diary / Bautagebuch) closed and released. New diary issues are filed standalone with no parent epic. Cluster signals a future diary v2 epic.

**Why:** the natural parent is closed; we accept ungrouped stories rather than re-opening a closed epic. See [[standalone-bugs-and-stories.md]] for the same pattern in budget/invoice.

**How to apply:** when triaging new diary user-reported improvements, check this list — if it grows (≥4 items), propose a new diary epic at the next planning cycle. If a new diary epic is opened, link these as sub-issues.

## Items

- **#1426** — BUG: Diary photos lost on upload failure; replace local-stage flow with auto-draft + immediate upload (Closed, shipped). Multi-story mini-epic, all stories merged. Introduced auto-draft on first interaction + immediate photo upload + status column on diary_entries. Surfaced three follow-on UX rough edges (see #1435).
- **#1435** — BUG: Diary UX rough edges after #1426 (Todo, 2026-05-17). Three client-only fixes batched in one issue: (a) auto-draft on type-card click instead of intermediate `step === 'form'` state on DiaryEntryCreatePage; (b) photo grid refresh on PhotoUpload.onUpload (current `onUpload={() => {}}` no-op comment hides the bug — usePhotos.refresh() exists and is the simplest fix); (c) replace standalone three-chip status row on DiaryPage with a "Hide drafts" toggle inside DiaryFilterBar. All client-only, no API/schema work. Likely batchable in a single PR.

## Key code references for diary draft work

- Create page (broken flow): `client/src/pages/DiaryEntryCreatePage/DiaryEntryCreatePage.tsx` — `pendingFiles` local state, `handleSubmit` uploads photos only after `createDiaryEntry` returns
- Edit page (correct flow, model for create): `client/src/pages/DiaryEntryEditPage/DiaryEntryEditPage.tsx` — uses `<PhotoUpload entityType="diary_entry" entityId={entry.id} ... />` for immediate upload
- Photo upload API: `client/src/lib/photoApi.ts` (`uploadPhoto` via XHR with progress)
- Diary API client: `client/src/lib/diaryApi.ts`
- Diary CRUD: `server/src/routes/diary.ts`, `server/src/services/diaryService.ts`
- Schema: `server/src/db/migrations/0024_diary_entries.sql` — no `status` column today; would need migration to add `'draft' | 'saved'`
- Shared types: `shared/src/types/diary.ts` (`CreateDiaryEntryRequest` requires `body`, `entryDate`, `entryType`)
