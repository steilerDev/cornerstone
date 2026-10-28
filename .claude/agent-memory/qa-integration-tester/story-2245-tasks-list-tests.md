---
name: story-2245-tasks-list-tests
description: Story #2245 Tasks list tests - local jest recipe (NODE_OPTIONS must be exported in the SAME bash call), shared-source TS1503 workaround, fixture design, two prod defects pinned
metadata:
  type: project
---

Story #2245 (Tasks list on ObjectList). Server: listWorkItemRows/taskTimeWindow/waitsForOf; client: WorkItemsPage + template additions (groupLayout, movedRowTargets, headingCount, announcement, setCounts, legacyKeys, rangeParams).

- Local jest: `export NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=6000"` must be in the SAME bash call as `npx jest`; each Bash call is a fresh shell, and without it every `jest.unstable_mockModule` suite fails ("useLocale must be used within a LocaleProvider" etc.) which looks like a code regression but is not.
- Client suites importing `@cornerstone/shared` source fail locally with TS1503 (named capture groups, inline ts-jest tsconfig has no target). Workaround: untracked `jest.qa-local.config.mjs` at the repo root that maps `projects[].transform` tsconfig `target: 'ES2022'`; run `npx jest -c jest.qa-local.config.mjs ...`; never commit it.
- Mocking `../../lib/workItemsApi.js` with a factory needs stubs for `listWorkItems`, `getWorkItem`, `createWorkItem` too (other modules in the graph import them), else "does not provide an export named".
- ObjectList page tests: two `role=status` regions exist (ToastList + the list's aria-atomic one) - pick the one with `aria-atomic`. ConfirmDialog is `alertdialog`. In jsdom EntityPickerDialog is a Sheet unless `installMatchMedia().set('(min-width: 768px)', true)`; with host `areas` just click the textbox, no search mock needed.
- Drizzle correlated count `${workItems.id}` in a single-table select compiles to `"id"`, which binds to the inner table: `filterMeta.budgetLines.max` is always 0 (pre-existing, pinned with it.failing in workItemService.listRows.test.ts).
- `workItems.list.row.nameSuffix` is ", {{title}}" and StatusMenu already joins with ", ": accessible name "Start, , Tile..." (pinned with it.failing in TaskRowCommand.test.tsx).
- Fixtures: `client/src/test/taskListFixtures.ts` (makeTaskRow/makeTaskResponse/KITCHEN). Server rows test inserts work items directly (no autoReschedule) with `includesVat: true` budget lines so expectedCost equals planned.
- Fastify AJV strips unknown query params (no 400 for `?foo=1`).
