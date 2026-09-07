---
name: issue-2056-jest-fn-any-never-bump
description: jest 30.5.0 bump broke jest.fn<any>() typing (TS2345 'never'); fix patterns and when a real-type generic surfaces a second, independent bug
metadata:
  type: project
---

Dependabot dev-dependencies bump to jest 30.5.0 / jest-environment-jsdom 30.5.0 (PR #2056, branch
`dependabot/npm_and_yarn/beta/dev-dependencies-a227976fa6`) changed how TS resolves `jest.fn<any>()`'s
generic: passing a bare `any` as the sole type argument now makes `.mockResolvedValue()`/
`.mockReturnValue()`'s parameter type resolve to `never` (`TS2345: Argument ... not assignable to
parameter of type 'never'`). Found 32 occurrences across 13 client test files, all pre-existing (one
per site) `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments immediately above.

**Fix hierarchy** (bare `jest.fn()` alone does NOT fix it — same `never` inference applies to an
untyped mock too, confirmed empirically):
1. Prefer `jest.fn<typeof RealModule.realFn>()` with `import type * as RealModule from '...'` —
   this repo already has this convention established in many files (grep `jest.fn<typeof.*Types\.`
   for examples). Removes the adjacent eslint-disable comment too (no longer suppressing anything).
2. If the real function's return type has more required fields than the test fixture provides
   (e.g. `fetchConfig(): Promise<AppConfigResponse>` needs `currency`/`vatRate`/`llmEnabled` but the
   test only ever resolves `{ autoItemizeEnabled: true }`), the real-type generic just trades one
   TS2345 for another (`missing properties from type X`). Don't force the fixture to grow to match
   the full real type — that's scope creep. Use a narrower inline generic instead:
   `jest.fn<() => Promise<{ autoItemizeEnabled: boolean }>>()`, with a one-line comment explaining
   it's intentionally narrower than the real return type. This exactly preserves pre-bump behavior
   (untyped `any` never checked field completeness either).
3. For an unexported production type (e.g. `CreateFn` in `autoItemizeDraftUtils.ts`), don't export it
   just to satisfy a test — mirror it locally in the test file from already-exported pieces
   (`CreateBudgetLineRequest`, `WorkItemBudgetLine`, etc.) with a comment noting it mirrors the
   unexported type.
4. For a component callback prop mock, prefer indexing the real prop type
   (`UseBudgetLinePickerReturn['handleSelectItem']`) over inventing an inline `(...args: any[]) => ...`
   signature — avoids adding a *new* explicit-any lint warning while fixing the typecheck.
5. If a mock is never given `.mockResolvedValue`/`.mockReturnValue` (only `.mockReset()` /
   `toHaveBeenCalledTimes()` etc.), bare `jest.fn()` genuinely doesn't error — leave it as the bulk
   drop-`<any>` fix produces, no per-site follow-up needed (confirmed: `mockCreateHouseholdItemDep`/
   `mockDeleteHouseholdItemDep` in MilestoneDetailPage.test.tsx, `mockCreateHouseholdItemBudget` in
   PaperlessInvoiceReviewPage.test.tsx).

**Second-order bug this surfaced**: once `mockFetchVendors` was typed to the *real*
`fetchVendors(): Promise<VendorListResponse>`, three test files' local `makeVendorsResponse()`
fixture helpers failed structurally — they still built vendor objects with `tradeId`/`websiteUrl`/
`contactEmail`/`contactPhone` (an OLD `Vendor` shape) instead of the current `phone`/`email`/
`address` fields. This was invisible under `jest.fn<any>()`/bare `jest.fn()` and is a genuine latent
test-fixture bug independent of the jest-version bump — fixed by updating the fixtures to the
current `Vendor` shape (InvoicesPage.test.tsx, PaperlessInvoiceReviewPage.test.tsx,
PaperlessInvoiceReviewPage.queueSave.test.tsx). One inline `JSON.stringify({...oldShape})` raw-fetch
mock in PaperlessInvoiceReviewPage.test.tsx was deliberately left alone — `JSON.stringify` takes
`any`, so it was never type-checked and isn't broken by this change; don't "fix" what isn't wrong.

**Lesson**: when a dependency bump forces a mock from `any`-typed to real-type-typed, always diff
the before/after error set rather than stopping at "zero TS2345 left" — a fixture that quietly
drifted from the real type for months can pass a naive first fix (narrow-typing everything) and
still be structurally wrong. Prefer the real type first; only fall back to a narrower inline type
once you've confirmed the mismatch is a legitimately-intentional narrowing (fixture only exercises
one field) rather than a stale/wrong fixture.

**Round 2 (same day, after the first fix was already pushed as ae6b9912)**: a CI re-run surfaced two
more failures the first pass missed, both worth remembering:

1. **A 14th file with the identical bug, missed by the original grep** — `InvoicesPage.openItems.test.tsx`
   didn't exist in the worktree at grep time because it (plus ~400 lines of production feature code in
   `InvoicesPage.tsx`/`openItemsUtils.ts`) landed on `beta` *after* the dependabot branch was cut, and
   GitHub's `pull_request` CI check tests the PR merged against the current base branch, not the
   worktree's stale checkout. **Lesson**: when CI reports an error in a file that doesn't exist locally,
   check `git log <branch-point>..origin/beta -- <path>` before assuming the grep was wrong — the fix
   is to catch the branch up (a `git rebase origin/beta` was clean here, no conflicts even though two
   other files — `InvoicesPage.test.tsx`, touched on both sides — auto-merged fine) and rebuild
   `shared/dist` afterward (rebasing pulled in new `shared/src/` fields the stale dist didn't have,
   producing a second, unrelated wave of `TS2339`/`TS2353` errors — not a real bug, just a stale
   build). Fixed with the exact same pattern as file #13 (real `typeof` generic for `fetchVendors`/
   `getPaperlessStatus`, narrower inline generic for `fetchConfig`'s `{ autoItemizeEnabled }`).
2. **An unrelated `@types/fontkit` 2.0.4→2.0.9 bump** (same dev-dependencies group) changed
   `fontkit.create()`'s declared return type from `Font` to `Font | FontCollection` — see
   environment-setup.md for the node_modules saga this triggered. Fix: don't cast — use an
   `in`-operator type guard (`if (!('glyphForCodePoint' in fontOrCollection)) throw ...`) to narrow to
   `Font`, since `FontCollection` (`.fonts: Font[]`, `.getFont()`) is structurally distinct and has no
   `glyphForCodePoint`. `fontkit` (the runtime package, not its types) stayed at 2.0.4 — this is a
   types-only fix, verified against the published `@types/fontkit@2.0.9` d.ts via `curl unpkg.com`
   rather than waiting on a broken local install. No production code imports `fontkit` at all
   (`grep -rln fontkit client/src` outside tests is empty) — nothing to flag there.
