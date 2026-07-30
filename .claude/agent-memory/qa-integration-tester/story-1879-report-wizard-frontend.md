---
name: story-1879-report-wizard-frontend
description: Story #1879 bank report wizard frontend testing — concurrent-modification handling (production files edited by another process mid-session), jsdom Blob/URL polyfill gaps, i18next dot-vs-colon cross-namespace bug family (4 rounds of fix/reverify), ESM ts-jest jest.spyOn immutability, en/de i18n parity gaps flagged for translator. Round 5: CRITICAL loader.ts bug found (dynamic-import namespace object is non-extensible, pdfMake.vfs assignment throws — whole PDF feature broken against real pdfmake package), WizardStepper dual-tree (CSS-only responsive) test rewrite pattern. Round 6: namespace-object bug fixed (pdfMakeModule.default), but a NEW, still-open blocker found underneath it — pdfMake.fonts never registers 'Helvetica', so getBlob() rejects on every real PDF generation.

metadata:
  type: project
---

## Round 6 (2026-07-30): namespace-object bug fixed, but a deeper font-registration blocker surfaced underneath

Frontend fixed the round-5 blocker: `loader.ts` now does `const pdfMake = pdfMakeModule.default`
(the real, extensible CJS interop export) instead of assigning the frozen ESM namespace object.
`merge.ts` switched `getBlob()` from callback-style to the promise-based `await pdfDoc.getBlob()`
per `@types/pdfmake@0.3.3`. Verified both fixes are real (not just claimed) before touching tests:
`loadPdfLibs()` now resolves successfully against the actual installed `pdfmake@0.3.11` package —
confirmed via a standalone `node --input-type=module` repro script before touching any test file
(**always reproduce independently before trusting a "fixed" claim** — this is the same protocol
that caught round-5's bug in the first place).

**Updated `loader.test.ts`**: the two tests that pinned the old rejection now assert success
(`loadPdfLibs()` resolves, `pdfMake.createPdf`/`PDFDocument.create` are functions, `vfs` key exists
but is `undefined` — see below). Kept the 4 "smoking gun" tests unchanged (still true/relevant).

**Updated `merge.test.ts`**: `mockGetBlob` changed from `jest.fn((cb) => cb(new Blob(...)))` to
`jest.fn(async () => new Blob(...))` to match the promise-based production call. No assertions
elsewhere referenced the callback shape, so this was the only change needed in that file.

**NEW BLOCKER found this round (reported via test + memory, not fixed — production file, out of
QA's edit scope)**: fixing the namespace-object bug was necessary but not sufficient — the whole
report-PDF-generation feature is *still* completely non-functional against the real installed
packages, for an unrelated reason one layer deeper:

- `pdfmake@0.3.11`'s `pdfMake.fonts` defaults to `{ Roboto: {...} }` **only** (confirmed via
  `node -e "console.log(require('pdfmake/build/pdfmake.js').fonts)"`).
- Neither `loader.ts` nor `merge.ts` ever assigns to `pdfMake.fonts` (confirmed via
  `grep -rn "\.fonts" client/src/lib/reportPdf` — zero matches).
- `merge.ts`'s document definition sets `defaultStyle: { font: 'Helvetica' }` (merge.ts:122), and
  several `styles` entries use `bold: true` with that same family.
- Because `'Helvetica'` was never registered in `pdfMake.fonts`, `await pdfDoc.getBlob()` — i.e.
  every real PDF render — rejects: `Error: Font 'Helvetica' in style 'normal' is not defined in
  the font section of the document definition.`
- **Important debugging gotcha**: `pdfMake.createPdf(docDefinition)` itself is lazy and does
  **not** throw synchronously — pdfmake only measures/renders (and looks up the font family) when
  `getBlob()`/`getBuffer()`/etc. is actually called. My first attempt at a repro test wrapped
  `createPdf(...)` in `expect(() => ...).toThrow(...)` — this doesn't just fail the assertion, it
  **crashes the entire Jest worker child process** ("Jest worker encountered 4 child process
  exceptions, exceeding retry limit") because the real failure happens asynchronously inside
  `getBlob()`'s internal stream machinery, outside any synchronous try/catch. The fix: `await
  expect(pdfDoc.getBlob()).rejects.toThrow(...)`, mirroring merge.ts's own call site exactly. If a
  test around real pdfmake usage kills the whole worker instead of just failing, suspect a
  synchronous-vs-lazy-async mismatch in the assertion, not a real crash bug.
- This is independent of the still-open vfs-shape bug (`vfsModule_.default?.pdfMake?.vfs`
  evaluates to `undefined` because the real vfs_fonts.js default-exports the font map directly, no
  `.pdfMake` wrapper) — vfs only matters for embedded TTF fonts (Roboto), never referenced by this
  app; 'Helvetica' is meant to be one of pdfkit's standard-14 fonts, which pdfmake still requires
  an explicit `pdfMake.fonts.Helvetica = { normal: 'Helvetica', bold: 'Helvetica-Bold', italics:
  'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' }`-style registration for, regardless
  of vfs.
- Added a new `loader.test.ts` test (`'NEW BLOCKER (still open): ...'`) that reproduces this
  against the real package and documents the exact fix shape needed
  (`pdfMake.fonts.Helvetica = {...}`) in comments, without weakening any other assertion.

**Net status after round 6**: `loadPdfLibs()` resolving is necessary but not sufficient proof the
feature works — always chase the call chain one level further (`createPdf()` → `getBlob()`) before
declaring a PDF-pipeline fix complete. 17/17 suites, 355/355 tests green; `tsc --noEmit -p
client/tsconfig.json` clean; i18n parity suite 46/46 green; scoped eslint/prettier clean.

## Concurrent modification during testing (2026-07-29) — critical process lesson

This story ran in **direct mode** (not an isolated worktree) — the working directory was live
and shared. While I was testing, a **different concurrent process actively fixed bugs in the
same files I was analyzing**, in near-real time (confirmed via `ls -la --time-style=full-iso`
timestamps advancing minutes apart while I worked). Fixed mid-session: `doc.id` →
`doc.documentId` in merge.ts, `household.name/.address` → `householdName/householdAddress` in
coverLetterPdf.ts, `sources.budgetSources` unwrap bug + `translateApiError` `err`→wrong-arg (only
partially — see below) in ReportWizardPage.tsx, `ariaLabel`→`label` + missing
`clearLabel`/`children` on SelectionActionBar in ReportInvoiceList.tsx, a full rewrite of the
broken `useDebounce(asyncFn, 400, [deps])` call (hook was never imported — ReferenceError on
every render) into a manual `useRef<NodeJS.Timeout>` + `setTimeout` debounce, and
`Step4Options.tsx` gaining `claimedCount`/`selectedInvoiceCount` props + a real "view invoices"
Link + real `t()` interpolation.

**Lesson: when working in direct (non-worktree) mode on a story where dev agents may still be
iterating, re-read every production file immediately before writing/finalizing its test's "BUG:"
framing** — a bug you found 20 minutes ago may already be fixed, and a "BUG:" test comment/label
that's gone stale is actively misleading to reviewers. I caught this via `ls -la --time-style=full-iso`
on the target files (timestamps newer than my last Read) and via tests that unexpectedly
started passing (`toThrow()` → "Received function did not throw"). Do a final full re-run +
re-read pass of every touched production file right before writing the final report, not just
once at the start.

## Confirmed bugs REMAINING at end of session (not fixed, reported not fixed per protocol)

1. **`client/src/lib/reportPdf/shared.ts` `formatDateForPdf(date: string | Date)`** — its own
   signature promises Date support but forwards straight to formatters.ts's real `formatDate`,
   which only accepts `string | null | undefined` (does `dateStr.slice(0,10)` — Date has no
   `.slice`). Throws `TypeError` whenever called with `new Date()` — which is exactly how both
   `coverLetterPdf.ts`'s "today" line and `overviewPdf.ts`'s "generatedAt" line call it. Was the
   root cause blocking essentially the entire coverLetterPdf.ts/overviewPdf.ts test suites until
   isolated via mocking `./shared.js` in those test files. Regression test:
   `shared.test.ts`'s "BUG: throws when passed a Date object".
2. **`client/src/lib/reportPdf/loader.ts`** — `pdfMake.vfs = vfsModule.pdfMake?.vfs ??
vfsModule.default?.pdfMake?.vfs` never matches the ACTUALLY installed
   `pdfmake@0.3.11`'s `vfs_fonts.js` shape, which default-exports the font map directly (no
   `.pdfMake` wrapper at all — confirmed via real, unmocked import in `loader.test.ts`).
   `pdfMake.vfs` ends up `undefined` — embedded Roboto fonts never wired up. Correct fix:
   `pdfMake.vfs = vfsModule.default;`.
3. **`client/src/pages/ReportWizardPage/ReportWizardPage.tsx`** — `t('common.button.next')` /
   `t('common.button.back')` (dot-separated) inside `useTranslation('budget')` is a
   **cross-namespace i18next key lookup bug**: i18next's default `nsSeparator` is `:`, so this
   resolves as a same-namespace (`budget`) key lookup for a literal key named
   `"common.button.next"`, which doesn't exist — falls back to displaying the RAW KEY STRING to
   real users instead of "Next"/"Back". **This exact bug class was already fixed once elsewhere
   in the codebase** — see `InvoiceDepositsSection.tsx`'s `t('common:button.cancel')`
   (colon-separated), itself a fix for issue #1424. ReportWizardPage.tsx reintroduces it.
   Grep for `t('common\.` (dot, not colon) to catch recurrences project-wide.
4. **`translateApiError(err, t)` in ReportWizardPage.tsx`** (2 call sites: `handleMarkClaimed`'s
catch-else branch, `handleUploadPaperless`'s catch) — passes the raw caught error object
instead of `err.error.code`, and the page's `budget`-namespace `t`instead of an`errors`-namespace translator. Correct pattern: `translateApiError(err.error.code, tErrors)`(see`InvoiceDepositsSection.tsx`). `translateApiError`'s real fallback branch does
`code.split('_')`, which throws when `code`is an object. Confirmed via`ReportWizardPage.test.tsx`'s "BUG: a Paperless upload failure should show a translated error
   toast, but translateApiError(err, t) crashes instead" (still failing at session end).
5. **`WizardStepper.tsx`'s focus-management is dead code** — `headingRef` is created via
   `useRef` but never attached (`ref={headingRef}`) to any DOM node in WizardStepper OR in the
   page-level `<h2>`s that were supposed to receive focus. Spec required "move focus to the step
   panel's h2 on step change via requestAnimationFrame" — the effect runs but
   `headingRef.current` is permanently `null`, so `.focus()` never fires on anything. Confirmed
   via `WizardStepper.test.tsx`'s dedicated test (`document.activeElement` unchanged after a
   step-change rerender). NOT observed to be fixed by the concurrent process — likely still open.

## Testing techniques that worked well this story

- **jsdom Blob gap**: this environment's `Blob` polyfill has NO `.arrayBuffer()`/`.text()`
  methods (confirmed via a throwaway test file). Production code (`merge.ts`) legitimately calls
  `textBlob.arrayBuffer()` — needed a local `beforeAll` polyfill via `FileReader.readAsArrayBuffer`
  (jsdom's FileReader DOES work) added to `Blob.prototype` scoped to the one test file that needs
  it (`merge.test.ts`). Don't assume Node's native `Blob.arrayBuffer()` is available under jsdom
  testEnvironment even though a bare `node -e` script shows it working (different Blob impl).
- **jsdom URL gap** (same family): `URL.createObjectURL`/`revokeObjectURL` don't exist on jsdom's
  `URL` — `jest.spyOn` fails ("Property does not exist"). Must assign directly:
  `URL.createObjectURL = jest.fn()...` in `beforeEach`, restore the real reference in `afterEach`
  (established pattern, see `PhotoMetadataModal.test.tsx`/`invoiceDepositsApi.test.ts`). Needed in
  BOTH `sinks.test.ts` (testing the sink itself) and `ReportWizardPage.test.tsx` (component's own
  cleanup `useEffect` calls `URL.revokeObjectURL` on unmount — an uncaught TypeError there crashes
  the whole render tree with a generic-looking "unable to find X" failure downstream; the real
  error only shows up in `console.error` output, not the assertion failure itself — always check
  full raw jest output, not just the final assertion, when a component test's DOM looks emptier
  than expected).
- **ESM `jest.spyOn` on a module namespace object throws** `TypeError: Cannot assign to read only
property 'X' of object '[object Module]'` under NodeNext ESM (server project) — confirmed
  attempting to spy on `paperlessService.getDocuments`. Workaround used: assert against the
  underlying `mockFetch` call list, matching the target function's distinctive outbound URL
  (`/api/documents/?id__in=`) instead of spying on the function reference. Don't reach for
  `jest.unstable_mockModule` restructuring of a large existing test file just to spy on one
  function — filtering the already-present `mockFetch.mock.calls` by URL pattern is far less
  invasive and just as precise when the function's HTTP call shape is distinctive.
- **ReportWizardPage step machine**: selecting a use case / source only advances
  `maxReachedStep`, NOT `currentStep` — the user must click the page's own "Next" button
  (rendered per-step, `t('common.button.next')` — ironically the buggy raw-key text, see bug #3
  above, but still findable/clickable by that literal text) to actually transition
  `currentStep`. Any test helper doing `click(useCaseRadio) → click(sourceRadio)` without an
  intermediate "Next" click will silently stay on step 1/2 and any `getByText(...)` for step-3+
  content fails with a misleading "not found" error.
- **`shouldRegenerate` gate**: `previewBlob && (attachDocuments || includeCoverLetter)` — if you
  toggle `attachDocuments` OFF as your "trigger a regenerate" test action and `includeCoverLetter`
  is also false, the whole gate flips false and NO regeneration happens (correctly, per this
  logic) — toggle `includeCoverLetter` instead (needs `coverLetterDisabled=false`, i.e. give the
  fixture BudgetSource a `contactAddress` or `reference`) to keep the gate satisfied while still
  exercising the debounced-regenerate code path.
- Real (unmocked) `useTranslation()` is active in `ReportWizardPage.test.tsx` and
  `BudgetSourcesPage.test.tsx` (no `react-i18next` mock) — assertions must use the REAL English
  strings from `client/src/i18n/en/*.json` (e.g. "Mark {{count}} invoices as claimed" →
  interpolated "Mark 1 invoices as claimed"), not raw dot-path keys, EXCEPT where the raw key is
  what genuinely renders due to bug #3 above (`common.button.next` etc. — those accidentally
  "work" as literal test strings precisely because the bug is real).

## Coverage achieved (source file : stmt/branch/funcs/lines)

shared.ts 100/100/100/100 · coverLetterPdf.ts 100/94/100/100 · overviewPdf.ts 100/97/100/100 ·
loader.ts 100/78/100/100 · sinks.ts 100/100/100/100 · merge.ts 98.5/86.7/100/100 (after
verification-pass follow-up, was 93/77/80/95) · sourceReportsApi.ts 100/100/100/100 ·
paperlessApi.ts 100/100/100/100 (uploadPaperlessDocument extension) ·
budgetTabs.ts 100/100/100/100 · WizardStepper.tsx 90/83/83/90 ·
ReportInvoiceList.tsx 97/94/93/96 · ReportPdfPreview.tsx 100/100/100/100 ·
Step1UseCase.tsx 100/100/100/100 · Step2Source.tsx 100/100/100/100 ·
Step4Options.tsx 100/95/67/100 · ReportWizardPage.tsx 98.6/86.6/100/100 (after
verification-pass follow-up, was 78/67/71/80) · sourceReportService.ts 100/94/100/100 (M2) ·
routes/paperless.ts extension all-pass (M3, 3 malformed-taskId variants).

## Verification pass (2026-07-29, same day, follow-up session after frontend-developer's fix)

frontend-developer fixed 3 of the 5 originally-reported bugs for real (formatDateForPdf(Date),
loader.ts pdfmake@0.3.11 vfs shape, translateApiError call shape) — confirmed by re-running
shared.test.ts/coverLetterPdf.test.ts/ReportWizardPage.test.tsx and updating the corresponding
"BUG:" tests to assert the now-passing fixed/spec behavior (all pass). WizardStepper focus-mgmt
fix (bug #5) also confirmed via re-run (13/13 pass) — untouched, already correct.

The Next/Back translation fix (bug #3) was only PARTIALLY correct: production now correctly uses
`t('common:button.next')` (colon-separated cross-namespace lookup, the right mechanism) instead
of the old `t('common.button.next')` (dot), but **the `next` key genuinely does not exist**
under common.json's `button` object (`back`/`cancel`/`confirm` do exist and resolve fine) — new,
narrower bug, same defect family. i18next's missing-key fallback for a cross-namespace miss
renders the bare key MINUS the namespace prefix (e.g. `"button.next"`), which is a DIFFERENT
literal than the old same-namespace-miss fallback (`"common.button.next"`, full dotted key) —
these two fallback shapes are easy to conflate; check the actual DOM output, don't assume.

**Cascading collateral failures**: the pre-existing test file's own navigation helpers
(`clickNext`, `goToStep3`'s disabled-check, 5x hardcoded `'common.button.confirm'` string
matchers) were written against the OLD buggy literal text as a _workaround selector_, not as
real assertions. Once the underlying literal changed, ~10 unrelated tests (report fetch, PDF
generation, claim flow, Paperless upload) failed too, all at the exact same
`getByRole('button', {name: 'common.button.next'})` lookup — not because their own business
logic broke. **Fix pattern**: decouple pure-navigation selectors from translated text entirely —
query by the shared-style CSS Modules class instead (`identity-obj-proxy` maps `.btnPrimary` to
the literal string `"btnPrimary"` under Jest, so `screen.getAllByRole('button').filter(b =>
b.className.includes('btnPrimary'))` reliably finds the one primary-action button per step,
since ReportWizardPage renders exactly one step's content at a time). This is NOT "weakening a
test" — the dedicated bug-documentation test for the Next/Back defect itself still asserts real
spec text and correctly fails; only the _incidental plumbing_ in unrelated tests was decoupled.
Lesson: any test helper that selects an element **by literal text that is itself the visible
symptom of an already-tracked bug** will break again on the next partial fix — always ask
whether a text-based query is testing translation (keep it strict) or merely locating a control
to interact with (make it resilient, e.g. role+stable-class or role+position).

**New bugs found while closing "cheap" coverage gaps** (all confirmed via failing regression
tests added to ReportWizardPage.test.tsx, not yet fixed):

1. `sourceReports.claimFailed` — missing from budget.json. Generic (non-`ApiClientError`) claim
   failure renders the raw key literally instead of a message.
2. `sourceReports.uploadFailed` — same, for generic Paperless-upload failures.
3. **Functionally significant**: `ReportPdfPreview`'s "retry" button, when the _initial_ PDF
   generation fails (so `previewBlob` was never set), is a **silent no-op** — its `onRetry`
   calls `regeneratePdf()`, whose first guard is `!shouldRegenerate` where
   `shouldRegenerate = previewBlob && (attachDocuments || includeCoverLetter)`; with
   `previewBlob` null this is permanently falsy. The user has no way to recover from an initial
   generation failure via that button. Only reachable/testable because I added initial-PDF-gen-
   failure coverage in the first place — worth flagging to whoever picks up bug-fix work as a
   priority above the missing-key issues (translation gaps are cosmetic; this one silently
   breaks a real recovery path).

**Additional, NOT dedicated-tested (flagged only, time-boxed out of scope for this pass)**: 4. `common:retry` (step-3 report-fetch-error retry button) — also missing from common.json's
top level. Worked around in tests via `btnSecondary`-class selection, same pattern as above. 5. `ReportPdfPreview.tsx`'s own retry button: `t('common.button.retry')` — dot-separated (same
class as bug #3 from the original report), AND even fixed-to-colon would still miss (no
`retry` under `button`). Pre-existing, NOT introduced by this session's fix.
`ReportPdfPreview.test.tsx`'s own pre-existing tests accept `'common.button.retry'` as literal
expected text (2 call sites) rather than flagging it — same blind spot as WizardStepper's. 6. `WizardStepper.tsx` calls `useTranslation()` with **no namespace** (defaults to `'common'` per
`client/src/i18n/index.ts`'s `defaultNS: 'common'`), then does dot-path lookups
`t('reportWizard.stepperAriaLabel')` / `t('reportWizard.stepOfTotal')` — but those keys live
in `budget.json`'s `reportWizard` namespace, not `common`. Renders the raw key as the nav
`aria-label` / mobile step-summary text. `WizardStepper.test.tsx`'s own passing tests only
check `getByRole('navigation')` presence / a raw-key regex match, never asserting real text —
same blind-spot pattern, pre-existing (not part of the original 5 reported bugs). 7. `ReportWizardPage.tsx`'s `<SubNav ariaLabel={t('common:subnav.budget')} />` — `subnav.budget`
is a nested OBJECT in common.json (a map of tab labels), not a leaf string; i18next returns
`"key 'subnav.budget (en)' returned an object instead of string."` as the aria-label. Every
OTHER page in the app (`BudgetOverviewPage`, `InvoicesPage`, etc.) just hardcodes
`ariaLabel="Budget section navigation"` for `SubNav` — no page actually translates it. The
simplest fix is likely to match that established (untranslated) convention, not add a new key.

None of 4-7 block any test in the requested suite list; they surfaced only via the full,
unmocked-i18n DOM dumps in ReportWizardPage.test.tsx assertion failures. Recorded here so the
next QA/dev pass doesn't have to rediscover them from scratch.

## Round-4 reconciliation (2026-07-29, same day, second follow-up after frontend round-3 fix)

frontend-developer fixed, confirmed for real by re-reading source before touching any test (per
protocol):

- Bug #3 (silent no-op retry): `regeneratePdf()`'s guard is now `if (!report || !useCase) return;`
  — `shouldRegenerate` is no longer checked there (still used correctly for the debounced
  option-change path only). Retry after an INITIAL PDF-gen failure now works.
- Bug #5 (`ReportPdfPreview.tsx` retry key): now `t('common:button.retry')` (colon), and
  `common.json`'s `button.retry` = "Retry" exists. Resolves for real in
  `ReportWizardPage.test.tsx` (real i18next active). NOTE: `ReportPdfPreview.test.tsx` itself uses
  an **identity** `t` mock (`(key) => key)`, so its own assertions must expect the literal string
  `'common:button.retry'` (colon) as the accessible name, NOT `'Retry'` — don't conflate "the key
  resolves in real i18next" with "the identity-mock test should assert the resolved text."
- Bug #6 (WizardStepper namespace): component is now fully namespace-agnostic — no internal
  `useTranslation()` call at all. Takes `ariaLabel` (default `'Report wizard'`) and
  `mobileStepLabel: (current, total) => string` (default `` `Step ${current} of ${total}` ``) as
  props; `ReportWizardPage.tsx` passes `t('sourceReports.stepperAriaLabel')` /
  `t('sourceReports.mobileStepLabel', {current, total})` from the `budget` namespace it already
  owns. Old test asserting `/reportWizard\.stepOfTotal/` (raw-key regex) was rewritten to assert
  the real default output `'Step 2 of 4'`; added 2 new tests for the `mobileStepLabel`/`ariaLabel`
  prop contract itself (custom-fn call-through, custom-string nav aria-label) since this is new
  untested surface area.
- `sourceReports.claimFailed`/`uploadFailed` keys now exist in `budget.json` (bugs #1/#2 fixed).
- `SubNav ariaLabel` now hardcoded to `"Budget section navigation"` matching every other page's
  convention (bug #7 fixed) — no longer passes a translated object.

**Found while re-verifying: the "Next" button bug-doc test itself had an unrelated latent bug.**
`common.json`'s `button.next` key now genuinely exists (`"next": "Next"`), so the ORIGINAL
premise of the "BUG: Next button" test (missing key) is gone — but the test still failed for a
completely different reason: it asserted the Next button's presence WITHOUT first selecting a
use-case radio, and the Next button is conditionally rendered (`{useCase && (<button>...)}`) in
`ReportWizardPage.tsx` — it doesn't exist in the DOM at all pre-selection. This was a test bug,
not a production bug (confirmed by tracing the JSX gate). Fixed by selecting a radio (and adding
the now-required `mockGetSourceReport.mockResolvedValue(...)` — selecting a use case triggers a
parallel step-2 `getSourceReport` fetch per source; an unmocked `jest.fn()` returns `undefined`,
and `.then()` on that throws) before asserting `getByRole('button', {name: 'Next'})`. Rewrote as
a spec-conformant test (no longer "BUG:"-prefixed) plus updated the 2 stale file-level comments
that still described this as an open bug.

**Still confirmed open** (per protocol: reported, not fixed, not weakened):

- Bug #4: `common:retry` (step-3 report-fetch-error retry button in `ReportWizardPage.tsx`,
  distinct from the `ReportPdfPreview.tsx` retry button covered by bug #5) still references a
  nonexistent top-level `retry` key — the real key lives at `common.json`'s `button.retry`, one
  level down. Existing test (`'shows an error banner and can retry the step-3 report fetch...'`)
  already correctly documents this via a comment and works around it with a `btnSecondary`-class
  selector rather than by name — left untouched, still accurate.

**New, orthogonal finding this round**: `client/src/i18n/i18n.parity.test.ts` (not in the
requested run scope, checked separately) is currently RED — `common.json` en/de parity fails on
`button.next`/`button.retry` (present in en, absent from de), and `budget.json` en/de parity
fails on `sourceReports.mobileStepLabel`/`claimFailed`/`uploadFailed` (same). These are new
English-only keys from this story's rounds 2-3 that the translator hasn't picked up yet — a
translator-owned gap, not something for qa-integration-tester to fix (out of boundary: don't
touch `client/src/i18n/de/*.json`). Flagged for the dev-team-lead/orchestrator to route.

**Final verified state**: full requested scope
(`client/src/lib/reportPdf client/src/lib/sourceReportsApi.test.ts client/src/lib/paperlessApi.test.ts
client/src/pages/ReportWizardPage client/src/pages/shared client/src/components/WizardStepper
client/src/components/reports client/src/pages/BudgetSourcesPage/BudgetSourcesPage.test.tsx`) —
**17/17 suites, 351/351 tests, 0 failures.** ESLint and Prettier clean on all touched test files.

## Round 5 (2026-07-29/30, same day, third follow-up after another frontend round — 69 tsc errors from further prod changes)

Frontend applied more fixes (appendix-once-per-invoice + step-4 cached-bytes reuse in merge.ts,
WizardStepper dual-tree via CSS media query, ReportInvoiceList Badge.module.css classes,
Step4Options `source`→`finishedWithoutMarking` prop swap, ReportWizardPage dropped
`shouldRegenerate` entirely + `sourceReports.finishedWithoutMarkingSuccess` key). This broke
tsc (75 errors, 9 files) and 2 test suites. Fixed all test-file tsc errors (mechanical:
`jest.fn<typeof realFn>()` typing per `authApi.test.ts`'s established pattern, `paperlessUrl`/
`filterTag` added to every `PaperlessStatusResponse` fixture, `!` non-null assertions for
`noUncheckedIndexedAccess` array reads, `as SourceReportType`/`as ErrorCode` casts where a test
deliberately needs a value outside a literal-union prop type). **17/17 suites, 354/354 tests, 0
failures** at the end; lint/prettier clean.

**NEW CRITICAL/BLOCKER bug found (production, reported not fixed): `client/src/lib/reportPdf/loader.ts`
line 22 `const pdfMake = pdfMakeModule;`** — assigns the raw dynamic-`import()` ES module
namespace object to `pdfMake`, not the real pdfmake export. `pdfmake/build/pdfmake.js` is a
UMD/CJS bundle, so under Node's ESM/CJS interop the real `createPdf` lives on
`pdfMakeModule.default`, NOT on `pdfMakeModule` itself (confirmed via a real `node
--input-type=module` probe: `typeof m.createPdf` → `undefined`, `typeof m.default.createPdf` →
`function`). ALL ES module namespace objects are non-extensible per spec
(`Object.isExtensible(pdfMakeModule)` → `false`), so the very next line
(`(pdfMake as unknown as {...}).vfs = ...`) throws `TypeError: Cannot add property vfs, object is
not extensible` on every single call — `loadPdfLibs()` rejects unconditionally against the real
installed package. This makes the ENTIRE report-PDF-generation feature non-functional in
practice — previously masked because (a) `merge.test.ts` mocks `./loader.js` entirely (correctly
isolating merge.ts's own logic, not a masking bug — see below) and (b) `loader.test.ts`'s
previous version only asserted `pdfMake.vfs` was `undefined` (a much milder, still-passing-looking
symptom) rather than actually awaiting the promise to see it reject. Rewrote
`loader.test.ts` to `await expect(loadPdfLibs()).rejects.toThrow(/Cannot add property vfs.../)` —
this is the accurate current behavior, not a weakened test. Correct fix (not applied — production
file, out of QA scope): `const pdfMake = pdfMakeModule.default;`. This is separate from, and
strictly more severe than, the previously-documented vfs_fonts shape mismatch (round 4's bug #2),
which would only matter (as silently-missing embedded fonts) once this namespace-object crash is
fixed first.

**merge.test.ts's `mockGetBlob = jest.fn((cb) => cb(new Blob(['TEXT_PDF'])))` callback-style mock
is NOT a masking bug** — it deliberately isolates merge.ts's own call-site behavior as written
(`pdfDoc.getBlob(resolve)`, callback-style) per the file's own stated isolation strategy ("tests
ONLY merge.ts's own orchestration logic"). The mismatch between that call-site and the REAL
promise-based 0-arg `getBlob()` is a separate loader/pdfmake integration-boundary bug, correctly
caught by `loader.test.ts`'s real-package test instead. Don't "fix" merge.test.ts's mock to be
real-API-accurate — that would just make merge.test.ts fail for a bug it explicitly isn't testing
for.

**Two other production tsc errors also confirmed real** (`merge.ts:161` `pdfDoc.getBlob(resolve)`
— expects 0 args per `@types/pdfmake`'s `TCreatedPdf.getBlob(): Promise<Blob>`, and `merge.ts:208`
`new Blob([finalBytes], ...)` where `finalBytes` is pdf-lib's `Uint8Array<ArrayBufferLike>` vs.
DOM's stricter `BlobPart` — a TS-only strictness mismatch, not a runtime bug). Both left
unfixed (production file) — `npx tsc --noEmit -p client/tsconfig.json` will always show these 2
residual errors until frontend-developer fixes `loader.ts`/`merge.ts`; that's expected, not a QA
regression.

**WizardStepper dual-tree rewrite pattern**: component now unconditionally renders BOTH the
mobile dot-summary AND desktop `<nav>/<ol>` trees together — visibility is 100% CSS
(`@media (max-width: 767px)` in `WizardStepper.module.css`), no JS `window.innerWidth` branch at
all anymore. The OLD test file's `setDesktopViewport()`/`setMobileViewport()` helpers
(`Object.defineProperty(window, 'innerWidth', ...)`) are now no-ops — jsdom + identity-obj-proxy
CSS Modules can't evaluate real media queries anyway, so there's no way to unit-test the actual
show/hide (that's an E2E concern). Rewrote the file: merged the two `describe('desktop
layout')`/`describe('mobile layout')` viewport-gated blocks into `describe('desktop nav/ol tree')`
+ `describe('mobile summary tree')`, since both trees coexist always; removed now-false
`.not.toBeInTheDocument()` assertions that assumed JS-conditional exclusivity between the trees.
Also DROPPED the old `describe('BUG: focus management ...')` block entirely — WizardStepper no
longer has ANY internal focus-ref logic (no `headingRef`/`useRef` at all); that responsibility
moved up to `ReportWizardPage.tsx` itself (`stepHeadingsRef` array + `ref={...}` + `tabIndex={-1}`
on each step's own `<h2>` + `requestAnimationFrame(() => heading.focus())`) — testing WizardStepper
for a responsibility it no longer claims would be testing something that doesn't exist, not
documenting a real gap.

**Stale "BUG:"-prefixed tests reconfirmed FIXED and renamed** (2 in `ReportWizardPage.test.tsx`,
both `sourceReports.claimFailed`/`uploadFailed` en keys now genuinely exist in `budget.json`, and
the Paperless-`ApiClientError`-toast one, `PAPERLESS_UNREACHABLE` now resolves via
`translateApiError`) — strengthened from weak "not the raw key" assertions to asserting the real
resolved English text, and dropped the "BUG:" title prefix. `shouldRegenerate` comment references
(now a fully-removed concept, not just an unused gate) cleaned up in 2 places.
