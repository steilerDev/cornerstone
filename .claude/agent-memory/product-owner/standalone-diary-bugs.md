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

- **#1426** — BUG: Diary photos lost on upload failure; replace local-stage flow with auto-draft + immediate upload (Todo, 2026-05-15). Critical bug. Spec includes 24 ACs across auto-draft, immediate upload, auto-save, list visibility, promote, delete, resilience. 10 architect-decision questions including status-column vs separate-table, orphan cleanup, and auto-save debounce. Will likely need to be planned as a multi-story mini-epic, not a single PR. The **edit** page already does the right thing (immediate upload to existing entry id) — only the **create** page is affected.

## Key code references for diary draft work

- Create page (broken flow): `client/src/pages/DiaryEntryCreatePage/DiaryEntryCreatePage.tsx` — `pendingFiles` local state, `handleSubmit` uploads photos only after `createDiaryEntry` returns
- Edit page (correct flow, model for create): `client/src/pages/DiaryEntryEditPage/DiaryEntryEditPage.tsx` — uses `<PhotoUpload entityType="diary_entry" entityId={entry.id} ... />` for immediate upload
- Photo upload API: `client/src/lib/photoApi.ts` (`uploadPhoto` via XHR with progress)
- Diary API client: `client/src/lib/diaryApi.ts`
- Diary CRUD: `server/src/routes/diary.ts`, `server/src/services/diaryService.ts`
- Schema: `server/src/db/migrations/0024_diary_entries.sql` — no `status` column today; would need migration to add `'draft' | 'saved'`
- Shared types: `shared/src/types/diary.ts` (`CreateDiaryEntryRequest` requires `body`, `entryDate`, `entryType`)
