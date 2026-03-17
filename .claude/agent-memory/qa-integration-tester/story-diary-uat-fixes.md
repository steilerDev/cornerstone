---
name: diary-uat-fixes
description: Patterns and notes from writing tests for diary UAT fixes (sourceEntityTitle, export removal, RecentDiaryCard, detail page changes)
type: project
---

## Diary UAT Fixes Test Notes (2026-03-15)

**Branch**: `fix/836-845-diary-uat-fixes`
**Commit**: `e29f37c`

### Key changes tested

1. `sourceEntityTitle: string | null` added to `DiaryEntrySummary` — every fixture using this type MUST include the field (TypeScript strict mode rejects missing required fields). Affected: `DiaryEntryCard.test.tsx`, `DiaryEntryDetailPage.test.tsx`, `DiaryPage.test.tsx`.

2. **`/api/diary-entries/export` removed** — Fastify interprets "export" as the `:id` param for `GET /:id`, so the test asserts 404 (service throws `NotFoundError` for unknown id "export"). No route-level 404 — it hits the existing `GET /:id` handler.

3. **`RecentDiaryCard`** — new component at `client/src/components/RecentDiaryCard/`. Props: `{ entries, isLoading, error }`. Loading uses `shared.loading`, error uses `shared.bannerError`. Empty state returns early with `/diary/new` link. Footer links: `+ New Entry` → `/diary/new`, `View All` → `/diary`. Entry items: `data-testid="recent-diary-{entry.id}"`.

4. **Back button navigate(-1) → navigate('/diary')** — test clicks the back button and asserts the `/diary` route renders. Requires MemoryRouter with both routes registered.

5. **Print button removed** — assert `queryByRole('button', { name: /print/i })` is not in document.

### Milestone insert needs `.returning()` for auto-increment id

Milestones table has `id: integer().primaryKey({ autoIncrement: true })`. To get the auto-generated ID:

```ts
const milestone = db.insert(milestones).values({...}).returning({ id: milestones.id }).get();
const milestoneId = String(milestone!.id);
```

### Invoice insert requires vendor FK

`invoices.vendorId` is `NOT NULL`. Always insert a vendor row first before inserting an invoice in service tests.

**Why:** Learned during sourceEntityTitle resolution tests for invoice type.
**How to apply:** When testing invoice-related sourceEntityTitle lookups, insert vendor → invoice → diary entry in that order.
