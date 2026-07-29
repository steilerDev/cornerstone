---
name: story-1878-source-report-backend
description: Story #1878 source report backend testing — 6 confirmed production bugs (sql.join misuse, db.transaction double-invocation, missing await, wrong field name, missing date side-effect branch, Map-iteration/wrong-field ASN-title bug) plus reusable technique discoveries (modulePathIgnorePatterns worktree fix, invoice_budget_lines UNIQUE constraint, async-fix-follow-up async/await test conversion)
metadata:
  type: project
---

## Follow-up: async-fix test restoration (2026-07-29, after bugs #1/#3/#4 fixed upstream)

Backend fixed bugs #1 (`sql.join`) and #3 (missing `await`, `getSourceReport` now genuinely
`async`/`Promise<SourceReportResponse>`). Task: convert `sourceReportService.test.ts` to
`await`/`async` throughout (all `getSourceReport(...)` calls + enclosing `it()`s), replace the
sync `expect(() => ...).toThrow(NotFoundError)` for the unknown-sourceId case with
`await expect(...).rejects.toThrow(...)`, and remove the now-stale
`process.on('unhandledRejection', ...)` workaround (`swallowedRejections` array,
`beforeAll`/`afterAll`) — it was pure dead weight once the missing-`await` bug was fixed
upstream, since there's no more orphaned promise to crash the worker.

**Restoring the previously-omitted "Paperless reachable" scenario (17) uncovered a THIRD,
previously-masked bug — filed as GitHub issue #1884 (not fixed, per protocol):**
`getSourceReport` does `for (const doc of docs)` over the `Map<number, PaperlessDocument>`
returned by `paperlessService.getDocuments()`. Iterating a `Map` with a bare `for...of` yields
`[key, value]` **tuples**, not the value objects — so `doc.documentId` (also wrong: the field is
`.id` on `PaperlessDocument`, not `.documentId`) and `doc.archiveSerialNumber`/`doc.title` are all
`undefined`. Result: `paperlessDocMap` ends up keyed by `undefined`, so the real document id never
matches, and ASN/title **silently degrade to `null` even when Paperless is reachable and returns
valid data** — no exception, no test crash, just permanently-broken enrichment. This is distinct
from and layered underneath bug #4 above (`link.documentId` vs `link.paperlessDocumentId` — that
one was already fixed by the time this session ran; #1884 is the map-iteration issue, found only
once the first two blocking bugs were cleared and the success path became reachable for the first
time). Fix for backend-developer: `for (const doc of docs.values())` (or destructure the tuple),
and use `doc.id` not `doc.documentId`.

**Handling a real bug discovered via a "must be fully green" test-fix task**: per the
test-failure-debugging protocol (don't weaken a correct test to fit buggy code, don't silently
drop it either), the new scenario-17 test asserts the *correct*/spec-conformant behavior, is left
in the file `it.skip`'d (not deleted, not inverted to assert `null`) with a comment pointing at
#1884, and the story's memory + a filed GitHub issue carry the paper trail. Scenario 18
("getDocuments throws → degrades to null") is unaffected by this bug (the catch block leaves the
map empty via a different path) and was restored as a normal passing test.

**Branch-coverage ceiling after all legitimately-reachable gaps are closed**: final state is
98.29% stmts / 90.72% branch / 100% funcs / 98.24% lines on `sourceReportService.ts` (32 pass, 1
skip, 0 fail). Branch coverage cannot reach 95% here without either fixing #1884 or writing
contrived tests against type-system-guaranteed-unreachable defensive code — after adding 4 small
legitimate branch tests (deposit status outside the target slice; null `invoiceNumber` → `'N/A'`
diary fallback; already-claimed/non-transitionable deposit alongside a directly-claimable invoice),
the remaining 9 uncovered branches split into: 4 blocked by #1884 (the `paperlessEntry?.x ?? null`
truthy branches), and 5 that are dead code by construction — `ALLOWED_TRANSITIONS: Record<Status,
Status[]>` guarantees every valid status key is present, so its `?.`/`?? false` fallbacks can never
trigger with valid enum data (same reasoning applies to `isSplitMap.get(id) ?? false`, and to
`fetchPaperless`'s `err instanceof Error` check always being true because `fetchPaperless` itself
catches raw fetch rejections and always rethrows an `AppError`, an `Error` subclass — confirmed by
writing a `mockRejectedValue('boom')` (non-Error) test and observing it still hit the
`instanceof Error === true` branch, then deleting that test since it added no coverage). **Lesson:**
when chasing the last few % of branch coverage, check whether the "uncovered" branch is reachable
at all given the codebase's own type guarantees (`Record<AllKeys, ...>` types, wrapper functions
that always normalize to a single error shape) before writing a test for it — some optional-chain
fallbacks are unreachable-by-design, not coverage gaps.

## Story #1878 outcome (2026-07-29)

Wrote/extended 6 test files per QA spec (43 scenarios): `depositAggregateUtils.test.ts`
(+7 scenarios, 100%/96.8% cov), `sourceReportService.test.ts` (new, 93.91%/81.44% cov, 8
pass/20 fail), `routes/sourceReports.test.ts` (new, 71.42%/50% cov, 9 pass/5 fail),
`paperlessService.test.ts` (+6 scenarios, 97.31%/91.22% cov, all pass), `routes/paperless.test.ts`
(+8 scenarios, 89.01%/74.46% cov of whole file — new code fully covered, all pass),
`invoiceDepositService.test.ts` (fixed 2 obsolete tests + 5 new, 97.22%/89.83% cov, 80 pass/1 fail).

**5 real production bugs found, all reported (not fixed) per protocol** — see PR/issue for full
bug reports:

1. **`sourceReportService.ts` line ~146/284: `sql.join(arr)` missing separator + unwrapped raw
   strings.** Correct usage (see `budgetServiceFactory.ts`): `sql.join(idItems.map(id => sql\`${id}\`), sql\`, \`)`.
The buggy version `sql.join(Array.from(targetStatuses))`throws`SqliteError: near "?": syntax
   error`for any array with 2+ elements; **accidentally "works" for exactly 0 or 1 elements**
(no separator needed) — this false-negative masked the bug in naive single-invoice tests.
Net effect:`getSourceReport`throws on virtually every real invocation (any report type with
2+ target statuses — i.e.`claim`/`budget-overview`— crashes unconditionally;`proof-of-funds`crashes once more than 1 invoice matches a source). This is the dominant, blocking finding —
it explains ~20/28 test failures in`sourceReportService.test.ts` by itself.
2. **`sourceReportService.ts` `markInvoicesClaimed`: `db.transaction((tx) => {...})()` — extra
   trailing `()`.** Drizzle's `db.transaction(cb)` executes `cb` immediately and returns its
   result directly (see correct pattern in `milestoneService.ts`/`budgetLineAssignService.ts`:
   `const result = db.transaction(() => {...});`, no trailing call). Since the callback has no
   `return` statement, `db.transaction(cb)` evaluates to `undefined`, and the extra `()` then
   throws `TypeError: db.transaction(...) is not a function` — but ONLY on the success path,
   since exceptions thrown _inside_ the callback (409 InvoicesNotClaimableError, ValidationError)
   propagate before ever reaching the trailing `()`. Confirmed with a 5-line repro against a real
   better-sqlite3 db before writing the full suite — recommended technique for any `db.transaction`
   review.
3. **`sourceReportService.ts` `getSourceReport`: calls the async `paperlessService.getDocuments()`
   without `await`**, then does `for (const doc of docs)` over the still-pending Promise —
   `TypeError: docs is not iterable`, caught by the surrounding try/catch (masks the real bug: ASN/
   title enrichment can never succeed). The orphaned, never-awaited `getDocuments()` promise
   continues in the background; if it later **rejects**, it becomes a Node unhandled promise
   rejection that reliably **crashed the entire Jest worker process** in a full-file run ("Jest
   worker encountered 4 child process exceptions, exceeding retry limit") — not just failed one
   test. Do NOT commit a test that exercises a rejecting mock through this path; see mitigation
   notes below. Also: even if `await` were added, iterating a `Map` with `for...of` yields
   `[key, value]` tuples, and `PaperlessDocument`'s id field is `.id`, not `.documentId` — bug #4
   below is a second, independent defect layered on the same block.
4. **`sourceReportService.ts`: `link.documentId` should be `link.paperlessDocumentId`.** The
   `documentLinks` schema column is `paperlessDocumentId` (see `documentLinkService.ts` for the
   correct field name). `link.documentId` is `undefined` on the actual Drizzle row type — confirmed
   via both `tsc --noEmit` (TS2339) and a runtime assertion (`documents[0].documentId` is `4242`
   in a real fixture but the code as written would never produce that). Every document object in
   every report response has `documentId: undefined` regardless of Paperless configuration.
5. **`invoiceDepositService.ts` `updateDeposit`: the "Apply date side-effects" if/else chain has
   no branch for the newly-widened `pending → claimed` transition.** It handles
   `pending→paid`/`paid→claimed`/`paid→pending`/`claimed→paid` explicitly but falls through
   silently for `pending→claimed`, leaving `claimedDate` as `null` instead of auto-setting it to
   `today()` (inconsistent with both the `paid→claimed` branch and `createDeposit`'s
   target-status-claimed handling, which DOES set both dates). Confirmed via a direct
   `updateDeposit(db, invoiceId, id, { status: 'claimed' })` call from a pending deposit — this is
   the ONLY genuinely-new-behavior test failure in `invoiceDepositService.test.ts` (80/81 pass).

**Verified per orchestrator's specific ask**: `MarkClaimedResponse` in
`shared/src/types/sourceReport.ts` matches the spec exactly (`claimedInvoiceIds`/
`claimedDepositIds` arrays) — **no deviation** from the QA spec here, despite the widespread bugs
elsewhere in the same story.

Also flagged (non-blocking, lower severity): TS compile errors from `tsc -p server/tsconfig.json
--noEmit` not caught by any of the above runtime tests — `routes/sourceReports.ts:40` (`sourceId:
string | undefined` passed where `string` required), `paperlessService.ts:588` (`new
Blob([Buffer])` — `Buffer<ArrayBufferLike>` not assignable to `BlobPart`, no pre-existing pattern
for this in the codebase to confirm it's a false positive), `sourceReportService.ts:128-131` (base
row query's extra joined columns — `vendor_id`/`vendor_name`/`invoice_number`/`invoice_date` —
aren't declared on the narrower `DepositAwareRow` type used for `db.all<DepositAwareRow>`; works at
runtime since JS doesn't enforce the type, but fails `tsc` and thus CI's typecheck gate). **Always
run `tsc -p server/tsconfig.json --noEmit` (after `cd shared && npx tsc` to refresh dist) on new
service files before writing tests** — it surfaced bugs #3/#4 and the row-typing issue well before
any test run did.

## Reusable techniques discovered this story

- **`sql.join` review checklist**: correct usage is always `sql.join(arrayOfSqlChunks, separator)`
  — e.g. `sql.join(ids.map(id => sql\`${id}\`), sql\`, \`)`. A bare `sql.join(plainStringArray)`(no separator, unwrapped values) throws`SqliteError: near "?": syntax error`for 2+ elements but
silently "succeeds" for 0-1 elements — write at least one test case with 2+ array elements for
ANY new`sql.join` usage, or a single-element happy-path test will falsely validate broken code.
- **`db.transaction` review checklist**: correct pattern is `db.transaction((tx) => { ...; return
x; })` — no trailing `()`. If you see `db.transaction(cb)()`, that's a bug; a 5-line
  better-sqlite3+drizzle repro script (see above) confirms in seconds without needing the full test
  suite.
- **Missing-`await` on an async call inside a sync function, feeding a `for...of`**: throws
  synchronously (caught locally if there's a try/catch) but leaves the real async call orphaned.
  Never mock a _rejecting_ response through such a path in a committed test — the rejection can
  surface as a Node unhandled-rejection _after_ the current test's teardown (registering
  `process.on('unhandledRejection', ...)` in `beforeAll`/`afterAll` reduced but did NOT reliably
  prevent a full worker crash in a multi-test file; Jest circus's OWN unhandled-rejection handling
  only cleanly attributes the failure to "the current test" when the rejection lands within that
  test's own synchronous+microtask window — a multi-hop async chain (tags fetch + doc fetch +
  correspondent/type resolution, each a separate `await`) can outlive that window). Safest fix:
  don't exercise the crash-inducing path with a rejection at all; use a resolving mock, or omit the
  scenario with a clear comment citing the bug + a plan to add it back once the missing-`await` is
  fixed upstream.
- **`invoice_budget_lines.work_item_budget_id` has a UNIQUE index** (nullable-partial:
  `.where(isNotNull(...))`) — one invoice per budgeted line item. A fixture loop that creates N
  invoices all pointing at the SAME `workItemBudgetId` violates this and throws `SqliteError:
UNIQUE constraint failed` — looked like a production bug at first glance but was my own fixture
  mistake. Always create a fresh budget line per invoice in loop-based multi-invoice fixtures (see
  `budgetSourceService.test.ts`'s `insertRawWorkItemWithSource` called once per invoice, never
  reused).
- **`server/src/routes/*.test.ts` files that import `buildApp` from `app.ts` can fail with a hard
  `jest-haste-map: Haste module naming collision` / `ModuleMap._assertNoDuplicates` error** (not
  the usual soft "duplicate manual mock" warning for konva/react-konva) when many `.claude/
worktrees/*` directories exist, each with their own `package.json` declaring the same package
  name (`@cornerstone/shared`, `@cornerstone/server`, etc.). Confirmed this is NOT introduced by
  any test changes — reproduces identically on a completely untouched pre-existing file
  (`photos.test.ts`). **Fix: pass `--modulePathIgnorePatterns='<rootDir>/\.claude/worktrees'` on
  the jest CLI invocation** (no need to touch the committed `jest.config.ts`) — this resolved it
  every time in this session. Smaller test files that don't import `app.ts` (service-level unit
  tests) did not hit this, so try without the flag first and only add it if you see this specific
  hard error (not the soft konva/react-konva warnings, which are always safe to ignore).
- **Coverage measures line execution, not assertion success.** A test file with mostly-FAILING
  assertions can still show high statement/line coverage (93.91% in `sourceReportService.test.ts`
  with 20/28 tests failing) because Istanbul instruments code that _ran and then threw_, not code
  that _passed its assertions_. Don't infer test health from the coverage percentage alone — always
  cross-check the pass/fail count.
