---
name: story-1891-wizard-followup
description: Bank Report Wizard follow-up (Story #1891) — expandable invoice rows, CSP blob: frame-src hardened preview check (superseded TWICE — page.frames() then in-page blob fetch — now header+console-only per two TEST_ENVIRONMENT fixes, see general-e2e-patterns.md), deposit budget-source tagging; 2 filed production bugs.
metadata:
  type: project
---

## SUPERSEDED AGAIN 2026-07-30: the in-page `fetch(blobSrc)` leg was removed

The "header+blob based" design described in the section below (added 2026-07-29) was itself
short-lived. CI run 30531695763 (shard 2) showed every wizard scenario failing in ~2s with
`page.evaluate: TypeError: Failed to fetch` — the new `fetchPreviewBlobInfo()` in-page
`fetch(blobSrc)` is blocked by the app's own CSP `connect-src 'self'` (no `blob:` token, and
correctly so: the app itself never fetches its own preview blob — the browser resolves
`<iframe src="blob:...">` internally, not via `fetch`/`XHR`). Loosening `connect-src` to
accommodate this test technique would weaken production CSP for no product reason, so the fix
was to remove `fetchPreviewBlobInfo()` and the blob-fetch leg from `assertPreviewHardened`
entirely, not to touch the CSP config.

**Current (and hopefully final) design**: `assertPreviewHardened()` now checks exactly two
signals — (1) the CSP header's `frame-src` directive contains both `'self'` and `blob:`
(`fetchCspFrameSrcDirective()`, the deterministic server-side contract check) and (2) zero
CSP-violation console messages were captured. The plain "overlay hidden + iframe visible + src
is a `blob:` URL" check that callers already did before invoking `assertPreviewHardened` was
kept as-is (it never depended on the blob-fetch). See `general-e2e-patterns.md`'s "blob: fetch
is connect-src-governed, not frame-src" entry for the reusable lesson — **do not re-add an
in-page fetch of a blob: URL as a verification technique; it will always be CSP-blocked by
design.**

## SUPERSEDED (2026-07-29): the `page.frames()` frame-navigation proof

Everything under "CSP hardened-check design" and its "Follow-up fix" subsection below describes
the ORIGINAL implementation, which is now **historical** — CI proved the whole
`page.frames().find(...)` technique (one-shot AND polled) is structurally unverifiable in this
project's headless Chromium shell for PDF `blob:` iframes (no PDF viewer plugin → silent
about:blank stall, zero CSP console violations, either way). `ReportWizardPage.ts` was reworked
to prove the same AC via `fetchCspFrameSrcDirective()` (direct CSP response-header assertion —
the deterministic primary signal) plus the same zero-CSP-violation-message check. (An
intermediate version also added an in-page `fetchPreviewBlobInfo()` blob-content check — see the
"SUPERSEDED AGAIN" section above for why that was removed too.) See `general-e2e-patterns.md`'s
"Headless Chromium shell has no PDF viewer plugin" section for the full pattern write-up (this is
a reusable lesson, not specific to this story) — keeping the narrative below for historical
context on why the polling fix was tried first and why it still wasn't enough.

## Files

- `e2e/tests/budget/reportWizardExpansion.spec.ts` — new, 7 scenarios (CSP headline, chip
  width, line-exclusion → row/total/PDF, full-exclusion, deposit tagged to zero-line source,
  claim warning count, regression sweep of `reportWizard.spec.ts` selectors against the new
  grid).
- `e2e/pages/ReportWizardPage.ts` — extended: `invoiceExpandToggle`, `expansionPanel`,
  `itemsSubTable`/`depositsSubTable` (structural `.nth(0)`/`.nth(1)`, NOT text-based — both
  sub-tables always render in this DOM order whether populated or `EmptyState`),
  `itemRow`/`itemExclusionCheckbox`/`depositRow`, `invoiceRowAmount` (class filter trick below),
  `markClaimedWarningBlock`. Hardened `waitForPreviewReady`/`waitForPreviewRegenerated` per the
  story AC — see "CSP hardened-check design" below.
- `e2e/pages/InvoiceDetailPage.ts` — added `depositBudgetSourceSelect` (`#deposit-budgetSource`)
  and `depositBudgetSourceHint`.

## `invoiceRowAmount` locator trick

`ReportInvoiceList.tsx`'s amount cell has THREE classes containing the substring "amount":
`.amountColumn` (outer wrapper), `.amount` (the value itself), `.amountNegative` (refund
modifier, combined with `.amount` on the same element). To land on just the value element:

```ts
invoiceRow(...).locator('[class*="amount"]:not([class*="Column"])').first()
```

`:not([class*="Column"])` excludes only the wrapper (its class contains "Column", capital C);
both `.amount` and `.amount.amountNegative` still match `[class*="amount"]` and pass the
`:not()`. This general pattern (grep for which OTHER classes in the same component share a
target substring before trusting a bare `[class*="X"]` locator) is worth checking any time a
new locator is added against `ReportInvoiceList.module.css` or similarly-named sibling classes
elsewhere.

## Expansion panel is a DOM SIBLING, not a descendant

`ReportInvoiceList.tsx` renders `<div key={invoiceId}><div class="invoiceRow">...</div>
{isExpanded && <div class="expansionPanel" id="invoice-expand-{id}">...</div>}</div>` — the
panel is a sibling of the row, both children of the same per-invoice wrapper. Reach it with a
relative xpath from the row locator:

```ts
invoiceRow(...).locator('xpath=following-sibling::*[contains(@class,"expansionPanel")]')
```

## CSP hardened-check design (the story's headline AC)

The bug this hardens against: React sets `<iframe src="blob:...">` in the DOM regardless of
whether the browser actually allowed the navigation — if `helmetPlugin.ts`'s CSP `frameSrc`
directive doesn't include `blob:`, Chromium silently blocks the frame-src navigation and the
iframe's browsing context stays at `about:blank` forever, while the DOM `src` attribute still
reads as the (never-navigated) blob URL. A locator-only check (`getAttribute('src')` starts
with `blob:`) therefore CANNOT tell working from broken.

The fix: `page.frames().find(f => f.url() === src)` — `frame.url()` reflects the REAL navigated
URL of a browsing context, not a DOM attribute. If CSP blocked the navigation, no frame in
`page.frames()` will ever have `url() === src` (the iframe's frame stays at `about:blank`).
Combined defense-in-depth: a `page.on('console', ...)` listener registered in the POM
**constructor** (before any `goto()`, so an early violation is never missed — same convention as
`invoice-auto-itemize-page.spec.ts` Scenario 18's "Refused to frame" capture) collecting any
`'error'`-type message matching `/content security policy/i`; the hardened check also asserts
zero such messages were captured.

Both `waitForPreviewReady()` and `waitForPreviewRegenerated()` run this check internally now;
Scenario 1 additionally re-asserts it explicitly at the test level (not just trusting the POM
helper) per the story AC's literal wording.

### Follow-up fix: one-shot `page.frames().find()` is a race, not a proof (CI PR #1894, shard 2)

The FIRST shipped version of `assertFrameActuallyNavigated(src: string)` did a single, immediate
`page.frames().find(f => f.url() === src)` right after the loading overlay hid / the src
attribute was read. This is a **reusable anti-pattern**: `frame.url()` only reflects a navigation
that has *already completed* — there is a real gap between "the loading overlay hides" / "the src
attribute changed" and "the nested browsing context has actually finished navigating to it".
Reading `page.frames()` exactly once right after either signal races that navigation. CI caught
this: 3 scenarios across `reportWizard.spec.ts`/`reportWizardExpansion.spec.ts` failed
consistently at ~2.6-3.2s with "no browsing-context frame has actually navigated" — but ZERO
CSP-violation console messages were ever captured in those failures, which is the tell: if CSP
were actually blocking the frame-src navigation, the console listener (registered in the
constructor) would have fired synchronously with the block. Zero console messages + a
`page.frames()` miss = the navigation just hadn't finished yet, not "blocked".

**Fix**: turned `assertFrameActuallyNavigated` into a poller — it now takes a `getExpectedSrc: ()
=> Promise<string>` callback (not a static `src` string) and wraps the frame lookup in `await
expect(async () => {...}).toPass({ timeout: 10_000 })`, re-invoking the callback on every retry.
Re-reading src on every retry (not capturing it once before the poll) also matters for
`waitForPreviewRegenerated` specifically — a fast-arriving further regeneration mid-poll would
otherwise get asserted against a now-stale captured src. Both `waitForPreviewReady` and
`waitForPreviewRegenerated` now share this single polling helper; the CSP-violation-count check
still runs once, after the poll resolves, preserving the "either signal alone would catch a
regression" defense-in-depth property.

**General lesson**: any `page.frames().find(...)` (or similarly, a raw one-shot check against
live browsing-context state that isn't itself an auto-retrying Playwright locator/`expect`) taken
immediately after a UI-visible "done" signal (overlay hidden, attribute set) is a latent race —
wrap it in `expect(async () => {...}).toPass()` rather than trusting the single read, even when
the surrounding steps already used proper waits.

## MANDATORY red-test verification — what was actually done

The AC required manually reverting `helmetPlugin.ts`'s `frameSrc` to `["'self'"]` (no `blob:`)
and confirming the hardened check goes red before restoring the file. What happened:

1. Found `helmetPlugin.ts`'s `frameSrc: ["'self'", 'blob:']` was itself an **uncommitted**
   working-tree change (part of this story's in-progress backend work, not yet committed) —
   `git diff` (no ref = working tree vs index) showed the `blob:` addition as unstaged.
   Reverting it to `["'self'"]` therefore made `git diff HEAD` show NO diff (working tree now
   matched HEAD, which never had the fix) — a useful sanity check that the revert really
   targeted the intended line, but a trap if you assume "no diff vs HEAD" means "back to where
   I started": the correct restore target was the ORIGINAL WORKING TREE state (with `blob:`),
   not HEAD.
2. Attempted a REAL browser run against the reverted config. Unexpectedly, this sandbox
   session had `dhi.io` registry access (see `sandbox-live-verification.md` — first time this
   worked in any recorded session) — `docker build -t cornerstone:e2e .` succeeded and the full
   container stack (OIDC + app + proxy) booted and passed health checks with the BROKEN CSP
   config live and serving traffic. The only remaining blocker was Playwright's browser binary
   download being network-policy-blocked, and Ubuntu's `chromium-browser` apt package being a
   non-functional snap stub with no snapd running — full detail in
   `sandbox-live-verification.md`. No actual Playwright-driven browser assertion could be
   executed.
3. Given (2), fell back to the explicitly pre-authorized alternative: **code-reasoning +
   documented CI expectation**, reasoned through in detail:
   - Chromium's CSP enforcement for `frame-src` blocks the nested browsing context's
     navigation and logs a console error of the form `Refused to frame 'blob:...' because it
     violates the following Content Security Policy directive: "frame-src 'self'".` — this is
     standard, spec-defined CSP behavior (Content-Security-Policy Level 3 §6.4, "navigate-to"
     analog for frame-src), not app-specific behavior that could vary.
   - With `frameSrc: ["'self'"]` (no `blob:`), the preview iframe's blocked navigation leaves
     its frame at `about:blank`, so `page.frames().find(f => f.url() === src)` returns
     `undefined` — the hardened check's first assertion throws.
   - The console listener registered in the constructor (before `goto()`) would also have
     captured the "Refused to frame... Content Security Policy..." message — the second
     assertion (`cspViolationMessages.length > 0`) would independently also throw.
   - Both failure paths are asserted in the SAME hardened check (`assertFrameActuallyNavigated`)
     — either one alone is sufficient proof the pre-fix config genuinely breaks the test; having
     both is deliberate defense-in-depth (documented in the method's own docstring) so a future
     Chromium wording change to the console message doesn't silently disable the guard.
4. Restored `helmetPlugin.ts` to its exact prior working-tree state (`frameSrc: ["'self'",
   'blob:']`) and confirmed via `git diff` matching the diff observed at the start of the
   session, byte-for-byte.
5. Cleaned up all verification-run side effects: removed the throwaway `cornerstone:e2e` Docker
   image (built against the deliberately-broken config — must not be silently reused by a later
   `docker build` layer cache or another session), the scratch
   `e2e/playwright.local-verify.config.ts`, and stray runtime artifacts
   (`e2e/e2e/test-results/`, `e2e/playwright-output/`, `e2e/playwright-report/`,
   `e2e/test-results/`) left behind by the interrupted runs. Confirmed `docker ps -a` /
   `docker network ls` had no leftover containers/networks.

**CI expectation**: on the actual PR, CI's `E2E Tests` job builds `cornerstone:e2e` with the
FIXED `helmetPlugin.ts` (via the normal DHI-authenticated `docker/build-push-action` step) and
runs the full matrix with a real Chromium — Scenario 1 (and every other scenario that reaches
Step 4) will exercise the hardened check for real there. If a future regression reintroduces
`frameSrc: ["'self'"]` (drops `blob:`), Scenario 1 is expected to fail with exactly the
`assertFrameActuallyNavigated` error thrown from the missing-frame branch (see method docstring
in `ReportWizardPage.ts`).

## Two production bugs found and filed (not fixed — out of E2E scope)

- **#1892 (Major)** — `applyLineExclusions()` correctly clamps a fully-line-excluded invoice's
  `allocatedAmount` to exactly `0` (never negative), but `ReportInvoiceList.tsx`'s
  `allocatedInvoices` filter (`inv.allocatedAmount > 0 || inv.lineKind === 'refund-adjustment'`)
  then drops that invoice from the visible Step-3 list entirely instead of rendering it at
  €0.00 — a net-zero non-refund invoice satisfies neither condition. Removes the only UI path
  back to un-excluding those lines (the row's own expand toggle disappears with the row). PDF
  export and claim submission are unaffected (both use `excludedInvoiceIds` against the
  original unfiltered `report`, not the filtered display list) — display-only regression.
  Scenario 4 in the new spec asserts the spec-conformant behavior (row visible, €0.00, TriState
  unchecked) and is EXPECTED TO FAIL in CI until fixed, per the project's test-failure-debugging
  protocol.
- **#1893 (Major)** — the deposit budget-source auto-default heuristic (Frontend Spec item 9:
  0 sources → null/HintNone, 1 source → that source/HintSingle, >1 sources → largest-sum
  source/HintLargest) is entirely unimplemented. `InvoiceDepositsSectionProps` never receives
  the invoice's budget lines at all (structurally impossible to compute the default),
  `openAddModal()` always resets to `budgetSourceId: null`, and the hint JSX only ever branches
  None-vs-Single (the `budgetSourceHintLargest` i18n key exists but is dead code, confirmed via
  grep — never referenced from any `.tsx`/`.ts`). The MANUAL path (user picks a source
  themselves via the select) works correctly and round-trips through the API — Scenario 5 in
  the new spec only exercises the manual path (tag via API + assert it surfaces correctly in
  the report), so it does NOT depend on this bug and is expected to pass. Filed separately since
  it's a real AC gap orthogonal to the E2E spec's own scope.

## Seeding pattern additions

- `seedInvoiceWithTwoLines()` (local helper, mirrors `seedAllocatedInvoice`'s established
  pattern) — creates an invoice with TWO separate `work_item_budgets` rows (two different work
  items) each linked via its own `invoiceBudgetLine`, so `budgetLines[]` in the report has two
  distinguishable rows. `description` must be set on the `work_item_budget` (via
  `createWorkItemBudgetViaApi`'s `description` param) — the report's `line_description` comes
  from `COALESCE(wib.description, hib.description)`, NOT from the invoice-budget-line's own
  `description` column (that field exists in the schema but isn't what the report reads).
- Deposit→source tagging: `POST /api/invoices/:id/deposits` accepts `budgetSourceId: string |
  null` directly in the body (added this story) — no separate endpoint. A deposit tagged to a
  source with ZERO budget lines for that invoice still surfaces the invoice in that source's
  report via Rail B (`sumTaggedDepositContributionsByInvoice`), with `budgetLines: []` for that
  invoice specifically (scoped to the report's own source, not the invoice's other sources).

## Regression-sweep gotcha: `SelectionActionBar`'s "Reset selection" semantics

`clearSelectionButton` (POM, text "Reset selection") calls `onToggleAll(false)`, which CLEARS
`excludedInvoiceIds` (selects everything) — it is NOT a "deselect all" button despite what
"Clear selection" might suggest from the name alone. `onToggleAll(true)` (exclude all) is only
reachable via the select-all checkbox when everything is currently selected. Don't assume the
button excludes; verify against the actual `onClear` wiring before asserting a post-click count.
