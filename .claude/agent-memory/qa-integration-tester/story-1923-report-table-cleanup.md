---
name: story-1923-report-table-cleanup
description: QA test coverage for issue #1923 (shared footnotes, inline deposit labels, claim metadata, total-only summary, area in Usage) — unnumbered marker semantics, isDeposit/isClaim/areaText fixture ripple across 8 report test files, and a worktree symlink false-positive gotcha.
metadata:
  type: project
---

Story/issue #1923 (branch `feat/1923-report-table-cleanup`, worktree `develop-claim-semantics`).
Production code (buildReportContent.ts, ReportContentEditor.tsx, overviewPdf.ts,
sourceReportService.ts, shared/src/types/sourceReport.ts) was already implemented when QA started —
only test files needed writing/updating. All 8 touched files pass (302 tests total), 100%
statement/line coverage on buildReportContent.ts and sourceReportService.ts, 100% on
ReportContentEditor.tsx, ~100%/98% branch on overviewPdf.ts.

**New/changed behavior to remember for future report-content work:**
- Split (`†`) and reduced-deposit (`‡`) markers are now UNNUMBERED and SHARED — at most one
  footnote entry each (`id: 'split'`/`'deposit-reduced'`, no vendor/invoice prefix). A constituted
  (tagged-to-this-source) deposit produces `isDeposit: true` on the row instead of a `‡` marker or
  footnote — no footnote entry at all for that case.
- `summaryRows` is always exactly 1 entry (`key: 'total'`) — no more per-status subtotal rows.
- `ReportContent` gained `isClaim: boolean` (gates the source-info block/stack in both the editor
  and the PDF). `ReportContentRow` gained `isDeposit: boolean` and `areaText: string | null`.
- **overviewPdf.ts's allocated-amount cell `.text` is now ALWAYS an array of runs** (`allocatedRuns`),
  even with zero deposit/refund — not conditionally a plain string. Any test using a `rowTexts()`-
  style helper that does `cell.text` directly must handle both string and array-of-`{text}` shapes
  (join array runs) or every existing "plain amount" assertion silently breaks (`toBe('€400.00')`
  vs received `[{text:'€400.00'}]`). Fixed by making the shared `rowTexts()` helper flatten arrays.
- `SourceReportLinkedItem` gained `areaId`/`areaName` (nullable), resolved server-side via
  `LEFT JOIN areas` on `work_items.area_id`/`household_items.area_id` — leaf-only area name, no
  parent-path expansion (verified with an explicit child-area-with-parent test).
- `linkedItem` stays `null` when the join partially resolves but the item's own title/name is falsy
  (empty string) — a real, defensible edge case reachable via `row.work_item_id && row.work_item_title`
  guard in the service; used this to cover "linkedItem null unaffected" rather than trying to force
  an FK-violating null-linkedItem state (not practically reachable given the schema's constraints).

**Worktree gotcha reconfirmed and clarified**: raw `npx tsc --noEmit -p client/tsconfig.json` (or
server/tsconfig.json) in this worktree resolves `@cornerstone/shared` via `node_modules/@cornerstone/shared`,
which is a symlink to the **base repo checkout** (`/Users/.../cornerstone/shared`), not the worktree's
own `shared/`. If the base repo happens to be checked out on a *different, unrelated branch* (observed:
base was on `fix/1895-1918-claim-deposit-scope` while this worktree was on `feat/1923-...`), that stale
symlinked `dist/index.d.ts` produces convincing but FALSE-POSITIVE type errors (e.g. "Property 'areaId'
does not exist on type 'SourceReportLinkedItem'") for types the current branch's `shared/src` genuinely
already has. **Jest itself did not reproduce these errors and all tests passed with correct runtime
values** for the files I'd already fixed — client project's jest config has `moduleNameMapper:
'^@cornerstone/shared$' -> '<rootDir>/shared/src/index.ts'` (worktree source, always fresh); the
**server** project has no such mapper, yet still passed cleanly too (mechanism unclear).

**Definitive fix applied this round** (repoint the worktree's own node_modules symlink instead of
relying on jest's leniency, so raw `tsc -p` becomes trustworthy again for this session):
```bash
rm node_modules/@cornerstone/shared
ln -s /absolute/path/to/THIS/worktree/shared node_modules/@cornerstone/shared
cd shared && npx tsc && cd ..   # rebuild worktree-local shared/dist
```
After this, `npx tsc --noEmit -p client/tsconfig.json` and `-p server/tsconfig.json` both went from
~15-30 false-positive errors to 0, and stayed 0 after all real fixes. **Use this fix proactively at the
start of any session that needs a real `tsc -p` sanity sweep** (e.g. when a coordinator reports a CI
typecheck failure) rather than trusting jest's silence alone — jest's leniency masks real errors too
easily to be the sole signal when hunting for "any other fixture drift somewhere in the tree" (this is
exactly how the ReportInvoiceList.test.tsx / realRender.test.ts CI failures escaped my first local pass).
Do NOT touch the base checkout itself — this only repoints the worktree's own node_modules entry.

**Real bug this fix uncovered** (CI Quality Gates failure on PR #1924, reported by coordinator):
`ReportInvoiceList.test.tsx` (~L727/733) and `realRender.test.ts` (~L447/453) built `SourceReportLinkedItem`
literals missing `areaId`/`areaName` — straightforward fixture-drift fixes (add the two null fields).
But `realRender.test.ts` also had a **second, deeper bug**: a real-i18n end-to-end test
(`renders both real deposit-footnote wordings ("constituted" vs "reduced")...`) still asserted the
OLD numbered/vendor-prefixed constituted-deposit footnote text (`'‡1: Constituted Vendor (U-5) — This
is a deposit.'`), which the AC2.1/AC2.2 change removed entirely (constituted deposits now render as an
inline `isDeposit` badge/run, not a footnote). Rewrote the test to assert real translated text for both:
the inline deposit-label run (array-of-runs allocated cell, second run text ` (Deposit)`/`
(Abschlagszahlung)`) AND the still-existing shared/unnumbered reduced-deposit footnote — plus explicit
negative assertions that the old "This is a deposit."/"Dies ist eine Abschlagszahlung." footnote text
no longer appears anywhere. Lesson: a `grep`-based sweep for the type-shape drift (missing fields) is
necessary but not sufficient — real-render/integration tests asserting exact translated STRINGS for a
feature whose wording changed need their own pass, since `tsc` won't catch stale string assertions.

**Round 3** (coordinator follow-up on PR #1924): the Deposit badge label moved further — out of
per-consumer `t()` calls entirely and into the shared content model as `ReportContentLabels.deposit`
(built once in `buildReportContent.ts` via `reportT`; `ReportContentEditor.tsx` and `overviewPdf.ts`
both just read `content.labels.deposit` / `reportContent.labels.deposit` now — `overviewPdf.ts` also
switched to named color/fontSize constants `DEPOSIT_NOTE_TEXT_COLOR`/`DEPOSIT_NOTE_FONT_SIZE` from
`reportPdf/shared.ts` instead of inline magic values). By the time this request landed, an external
process (not me) had already patched most existing fixtures' `labels`/`makeLabels()` objects to include
`deposit: 'REPORT_DEPOSIT_LABEL'`-style values — but NOT the 4 files I'd fixed in round 2
(`applyAiContent.test.ts`, `applyOverrides.test.ts`, `coverLetterPdf.test.ts`, `merge.test.ts`), which
still lacked the `deposit` key on their `ReportContentLabels` fixtures and failed `tsc` (`TS2741:
Property 'deposit' is missing`) once I re-swept. **Lesson: when a shared type gains a new required
field mid-story, re-run the `tsc -p client/tsconfig.json` sweep after EVERY round, even on files you
"already fixed" in a prior round for a different reason** — the type can grow again between rounds
without any signal other than a fresh typecheck.

For the mixed-language regression itself: added to `realRender.test.ts`'s existing
`describe('production i18n singleton — getFixedT resolves a language independent of the ambient one')`
block (established pattern for "UI locale stays X while report language resolves Y" — uses the REAL
app i18n singleton via `(await import('../../i18n/index.js')).default` + `i18n.getFixedT(lang, 'budget')`,
not the file's separate isolated `i18next.createInstance()` used everywhere else in that file). Gotcha:
helper functions declared with `function` inside a nested `describe(...)` callback (e.g.
`makeUsageFeatureReport()` inside the `'Usage column...'` block) are scoped to that closure only —
NOT visible from a sibling top-level `describe` block later in the same file. Had to inline a minimal
one-invoice fixture using the file's top-level `makeInvoice()` helper instead of reaching into the
nested one. Final test: builds `content` via `reportT = i18n.getFixedT('de', 'budget')` while asserting
`i18n.language` stays `'en'` throughout (both before and after — proves `getFixedT` never calls
`changeLanguage()`), asserts `content.labels.deposit === 'Abschlagszahlung'` (exact real string, not
`.toContain`), contrasts with `getFixedT('en', ...)` → `'Deposit'`, and pins the same value through to
the rendered PDF's inline deposit run.
