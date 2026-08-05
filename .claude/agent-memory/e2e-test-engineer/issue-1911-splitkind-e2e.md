---
name: issue-1911-splitkind-e2e
description: Issue #1911 (SourceReportInvoice.splitKind) E2E fallout in reportWizardEditableContent.spec.ts — dev-team-lead's "no E2E changes needed" spec conclusion was wrong; two scenarios (17 AND 18) were affected, found by cross-referencing server/client unit-test ACs, not by running the browser suite.
metadata:
  type: project
---

## What #1911 actually changed (semantics, not just a field addition)

`server/src/services/sourceReportService.ts` step f: `isSplit`/`isDepositReduced` used to be
derived client-side from `invoice.isSplit(raw) && budgetLines.length>0` /
`invoice.isSplit(raw) && deposits.length>0 && !ownTagged`. Both gates were unsound (claim reports
drop zero-contribution budget lines; a foreign-tagged deposit never appears in `deposits[]` at
all). #1911 replaced them with a purely server-derived `splitKind: 'lines'|'deposits'|'both'|null`
(SQL computes `has_foreign_line_source`/`has_foreign_deposit_source` — "this arm contains a source
≠ the reported one", untagged deposits excluded from the deposit arm entirely since the query
filters `budget_source_id IS NOT NULL`). `buildReportContent.ts`: `row.isSplit ⟺ splitKind ∈
{'lines','both'}`, `row.isDepositReduced ⟺ splitKind ∈ {'deposits','both'}`. `row.isDeposit`
(constituted-deposit badge) trigger is UNCHANGED and now independent of the other two — all three
can co-occur on one row (old code's implicit either/or is gone).

## Two E2E scenarios were affected, not one — the incoming spec only caught the second

`e2e/tests/budget/reportWizardEditableContent.spec.ts`:

- **Scenario 18** ("split + deposit-reduced labels"): `invoice3`'s deposit was seeded
  `budgetSourceId: null` (untagged) with a comment claiming that produces `isDepositReduced: true`
  — true under the OLD buggy code, false under the fix (this was the literal bug #1911 exists to
  fix). Retagged to `otherSourceId` (a source ≠ the reported one) to get the genuine
  `splitKind: 'both'` shape.
- **Scenario 17** ("constituted-deposit row … carries NO marker/label"): NOT flagged by the
  incoming spec at all, found by grepping every `createDepositViaApi(...budgetSourceId...)` call
  site per the task's own hint ("tagged to the reported source" is one of the two shapes to
  check). Its invoice has budget lines ENTIRELY on a different source (A) and a deposit tagged to
  the reported source (B) itself. Under the OLD code: `isSplit(row)` was gated by
  `budgetLines.length>0` for B, which is 0 → false → no `(partial)`. Under NEW code:
  `has_foreign_line_source` is true (A's line is foreign to B) regardless of whether B itself has
  ANY line contribution → `splitKind: 'lines'` → `isSplit(row)` **true**. This is the "AC 3.1
  zero-contribution-line regression case" explicitly called out in
  `client/src/lib/reportContent/buildReportContent.test.ts` (search that phrase) — a unit test
  already asserted this new behavior; the E2E suite just hadn't been told. Net: the row now shows
  BOTH the "Deposit" badge AND `(partial)`, plus one footnote entry (previously zero).

**How I found it without a live browser**: cross-referenced `server/src/services/
sourceReportService.test.ts` (search `Story #1891 regression: invoice with lines only for source B
+ a deposit tagged to source A → isSplit true in both A and B reports`, line ~346) against the
E2E fixture shape — that unit test's `resultB.invoices[0].isSplit` assertion is `true`, which is
the DB-level raw `isSplit` (unchanged by #1911) that Scenario 17's OLD stale comment claimed was
`false`. Then confirmed via `buildReportContent.test.ts`'s "AC 3.1 (regression, #1898/claim
zero-contribution-line drop)" test that the row-level flag inherits this. Static/unit-test
cross-referencing caught a bug the incoming E2E spec missed — worth doing whenever a spec claims
"no E2E changes needed" for a semantic (not just additive) server change.

## Regression-guard test added

A new sibling `test()` inside Scenario 18's `describe` block (not folded into the existing test,
so `footnoteItems` can assert count 1 cleanly — the existing test's count is 2 for unrelated
reasons): a split invoice (lines on two sources) + an UNTAGGED deposit must show `(partial)` but
never `(less deposit)`, with exactly one footnote entry. This is literally the fixture shape
Scenario 18's `invoice3` used to have (before being retagged) — without a standalone guard, the
AC 3.2 over-inclusive bug could regress silently since every other test in the file now uses
either no deposit, an own-tagged deposit, or a genuinely-foreign-tagged one.

## POM docblock corrections

`e2e/pages/ReportWizardPage.ts` had TWO now-false invariants baked into JSDoc comments (found by
reading the file, not just the test): `depositBadge()`'s doc claimed a constituted-deposit row
"carries no inline note of its own" and `inlineNote()`'s doc claimed such a row "gets NEITHER —
it gets the inline depositBadge instead". Both corrected with an "Issue #1911" note; also added a
dedicated "Issue #1911" paragraph to the class docstring (same location/style as the existing
"Issue #1965" paragraph) so a future reader hits the corrected model before writing a new fixture
against stale assumptions.

## Reusable lesson

When a dev-team-lead spec says a server change is "purely additive, no E2E changes needed" for a
field that DRIVES existing conditional rendering, don't take it on faith — grep every fixture that
feeds the changed derivation (here: every `createDepositViaApi` call with `budgetSourceId` null or
equal to the reported/requested source) and check its assertions against the NEW derivation logic,
not just the ONE scenario the spec happened to mention. The unit test suite (already written and
green) is a fast, authoritative way to derive "what SHOULD this fixture shape now assert" without
needing a live browser.

See [[story-1879-report-wizard]], [[issue-1959-inline-meta-and-labels]].
