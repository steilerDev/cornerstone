---
name: story-2243-bank-report-server-tests
description: Story #2243 revert-submission server tests - Fastify 414 on long params, route auth-guard dead branches, AppError default-arg coverage trick
metadata:
  type: project
---

- Fastify `maxParamLength` defaults to 100: a path param of 101+ chars gets **414 from the router** before the params schema (`maxLength: 100`) runs, so "batchId > 100 -> 400" is unreachable; test pins 414 and no write.
- `routes/sourceReports.ts` has 4 `if (!request.user) throw UnauthorizedError` guards unreachable behind the auth plugin; file sits ~85% stmts / 50% branches by those alone.
- AppError.ts branch coverage comes from default-arg branches: `it.each(subclasses)` building `new Ctor()` with no args covers every class; also bump the "subclasses discovered" count (47 after #2243).
- Hand-written events with explicit `created_at` (insert into diary_entries) give deterministic order for revertSubmission; real `markInvoicesClaimed` events share a ms.
- History R2 collapses identical-metadata repeats: give fixture repeats a differing field or the batch head row moves.
- Always pipe jest output through grep: pino logs of expected 4xx flood the context.

## Client side (bank report wizard, History revert)

- Group headings make `getByText(vendor)` / `getByRole('checkbox',{name:/Vendor/})` ambiguous (group h3 + row): use `getAllByText(..)[0]` and `/Vendor.*INV-/` for the row checkbox (group checkbox name is "Select group Vendor").
- `ReportInvoiceList` rows arrive after a microtask (useInfiniteScroll): render then `await act(async () => {})`; it also needs `useLocale` (mock LocaleContext) or a LocaleProvider.
- ReportContentEditor now contains a router `useHref` (sender helper): wrap renders in `{ wrapper: MemoryRouter }`; do NOT add the option to `rerender`.
- Use-case radio order is now claim, budget-overview, proof-of-funds (index 0 = claim); stepper labels are sentence case ("Report type", "Select invoices", "Preview and export"); Mark dialog buttons via testids `report-mark-confirm/-cancel` (accessible name "Mark as submitted" collides with the step 5 button).
- HistoryPage.tsx keeps 4 structurally unreachable branches (onPageApplied meta undefined, feedRef null `?? 0`, emptyMessageRef/filtersRoot null): 94.59% branches without them.
- jest from a subdirectory uses babel and fails; always run from the worktree root. Pipe output through grep: "Jest: importing JSON" lines flood the context.
