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

## PR #2015 review round: two red shards, both self-inflicted, neither a production defect

`product-architect` and `product-owner` independently traced both E2E failures to stale
assertions I wrote, not to product behavior:

- **Badge-vs-note DOM order isn't a fact worth asserting.** Scenario 17's rewrite added
  `toContainText('€150.00 (partial)')`, but the `depositBadge` renders BETWEEN the amount and the
  note (`ReportContentEditor.tsx`: value → badge → split note → deposit-reduced note, in that
  literal JSX order), so the DOM text is `€150.00Deposit (partial)` and the substring can never
  match. Fix was to **delete the assertion**, not rewrite it to encode the ordering — two sibling
  assertions already pin the same fact against the `inlineNote` locator directly (count 1, text
  `(partial)`), and hardcoding badge-before-note relative order is exactly the kind of brittleness
  this area (already reshuffled twice: #1959, #1911) keeps punishing.
- **Get the money math from the actual formula, not intuition.** Scenario 18's invoice3 retag (see
  above) changed the deposit from untagged to tagged-to-`otherSourceId`, but I left the OLD
  expected amount (`€75.00`) on the row assertion below it. The correct value is **€56.25** —
  `depositAggregateUtils.ts`'s `splitByDepositsExcludingTagged`: `residualFraction` ALWAYS
  subtracts every deposit (tagged or not) from the invoice total in the denominator
  ((200−50)/200=0.75), but `depositFractions` (which gets ADDED back per line) only includes
  UNTAGGED deposits — a tagged one is filtered out entirely (it's handled by Rail B, on a
  different source's row). So `75 × 0.75 = 56.25`, full stop, no returned fraction. Contrast the
  sibling negative-control test's untagged deposit (60/90 split, 25 untagged deposit, invoice
  150): residual `(150−25)/150=0.8333` PLUS the returned `depositFraction` `25/150=0.1667` sum to
  exactly 1.0 (true whenever there's exactly one deposit, tagged-or-not doesn't matter to the
  sum-to-1 property when it's the ONLY deposit and it's untagged) → `60 × 1.0 = 60`, i.e. the
  original `€60.00` assertion was already correct and needed no change, only a comment.
- **The arithmetic proves the fix in both directions** — worth stating explicitly in test comments
  next to both numbers, not just implied: foreign-tagged deposit → allocation genuinely drops
  (75→56.25), so "claimed separately" is true; untagged deposit → residual + returned fraction net
  to the FULL original amount (no drop at all), so the pre-#1911 "claimed separately" label on
  that shape was literally false to a bank recipient. This is why the AC 3.2 negative-control test
  exists, and it's a stronger justification than "the bug fired on the wrong condition" — worth
  reaching for in future PR descriptions/comments on this area, not just re-deriving silently.
- **Lesson**: when a fixture retag changes the underlying formula's inputs, don't assume "keep
  every other assertion the same, just add the new one" — re-derive EVERY downstream numeric
  assertion from the actual utility function (not from a coordinator's or reviewer's restated
  number without checking it against the source), and put the derivation in a comment so a future
  reader (or reviewer) can tell "the fixture changed and the arithmetic followed" apart from
  "the assertion was made convenient." I re-verified the €56.25 figure independently against
  `depositAggregateUtils.ts` rather than taking two reviewers' restated arithmetic on faith — it
  checked out, but the habit is the point: derive, don't just relay.

See [[story-1879-report-wizard]], [[issue-1959-inline-meta-and-labels]].
