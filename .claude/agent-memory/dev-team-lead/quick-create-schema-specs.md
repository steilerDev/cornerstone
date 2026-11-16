---
name: quick-create-schema-specs
description: Hazards found speccing EPIC-21 #2254 (one ObjectForm schema for create dialog and detail-page edit cards) — schema hooks fetch on mount, field name = DOM id, card vs schema keys/names, server includesVat default, Add another drops follow-up errors, UX card maps vs real cards
metadata:
  type: feedback
---

Found while speccing #2254 (P5.10a). Applies to any story that reuses an `objectForms/*` schema outside `ObjectForm`.

1. **Schema hooks fetch on mount** (`listUsers`, `useCompanyFormSchema` → `useTrades`, `useAreas`, vendors, categories). Calling one at card level adds requests to every page load. Call it inside `renderFields` (mounted only in edit mode) and validate the always-mounted card through a pure exported `validate*Values(values, messages)` + a translation-only `use*ValueMessages()` hook.
2. **`ObjectFormField` used the field name as DOM id.** Outside the dialog (cards, or a card plus the App-root dialog) ids collide; add an `id` override and a per-card `useId()` prefix. ObjectForm keeps bare names (focus logic and E2E `#name` locators).
3. **Card drafts and schemas used different keys and names** (`taskPage.*` vs `create.fields.*`, `who`/`assignment`, `categoryId`/`category`). "Same labels and messages" changes visible card copy and orphans keys; list both, grep E2E for the old copy.
4. **Server create defaults can contradict the PO default**: work-item budget `includesVat ?? true`. Read `buildInsertValues` before omitting a field.
5. **`ObjectForm` "Add another" ignores `result.href`**, so any "keep the record + banner on the new page" rule needs a result flag that bypasses Add another.
6. **UX card maps can name cards that do not exist** (a "Timing card" with Status; status is the header StatusMenu). Read the card files before accepting a mapping.
7. **Edit-scope hooks still load data for fields the card does not render** (review finding): a Title-only card mounting the task schema fired `GET /api/users` (+ trades, areas). Spec host-owned data (users) as never self-loaded in edit scope, and list which reference loads a card accepts.
8. **Copy that names a tab must quote the tab label** ("Add it under Costs." vs tab "Cost"); check `common:objectTabs.tab.*` when approving UX copy.
9. Pre-measure baseline by importing `analyzeFile`/`resolveImport` from `build-baseline.mjs` in a job-tmp script (Write the file, then a plain `node` call; the worktree guard refuses heredoc+pipe).
10. **CSS Modules composes must stay acyclic** — page modules compose only from shared leaves like `objectPage.module.css`; unit tests mock CSS so only the webpack build catches cycles (CI: `Cannot access '__WEBPACK_DEFAULT_EXPORT__' before initialization`).

11. **"No funding source" (PO) ≠ omit `budgetSourceId`** (CI finding): budget-line create returns 400 `budgetSourceId is required` (contract + service) though shared `CreateBudgetLineRequest` types it optional. "No source" = the discretionary source (`fetchBudgetSources()` → `isDiscretionary`, like `useCostLineOptions`). Mocked unit tests pinned the wrong payload with `toEqual`; check every invented POST body against the contract's Required column.
12. **E2E post-create URL regexes must allow a query** — failure paths land on `?tab=…` after the param-strip replace; a `$`-anchored id regex times out. Dirty SectionCard Cancel opens Discard: tests confirm via `discardConfirm`.

Related: [[object-home-move-specs]], [[cost-line-specs]], [[task-page-specs]], [[purchase-page-specs]], [[milestone-page-specs]]
