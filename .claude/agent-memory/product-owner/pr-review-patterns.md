---
name: pr-review-patterns
description: Detailed PR-review checklist, recurring violations, and per-PR findings for the product-owner validation phase. Consult before reviewing any story PR.
metadata:
  type: feedback
---

# PR Review Patterns (product-owner validation phase)

## Three-Phase Validation (per CLAUDE.md)

1. **Planning**: product-owner drafts UAT scenarios → qa-integration-tester reviews for testability → user approves
2. **Development**: developers implement → qa-integration-tester writes all tests (95%+ coverage target)
3. **Validation**: product-owner reviews PR → checks all ACs + UAT alignment + test coverage

## PO Review Checklist

- Verify ALL acceptance criteria from the story are met (line-by-line check)
- Verify UAT scenarios are addressed (cross-reference product-owner UAT comment on issue)
- Verify qa-integration-tester wrote the tests (check commit author, not developer)
- Verify 95%+ test coverage on new/modified code
- Verify all agent responsibilities fulfilled (QA wrote tests, architect reviewed, UAT scenarios exist)
- Check quality gates: lint, typecheck, test, build, npm audit all pass
- Look for accessibility gaps: missing :focus styles, missing aria-labels, semantic HTML

## RECURRING VIOLATIONS (check these FIRST — appeared in 3+ PRs)

- **Dependency pinning**: check all package.json changes for `^` or `~` ranges — must use exact versions. Found in PRs #49, #57. Now enforced via pre-commit hook `scripts/check-dep-pinning.sh`. Transitive caret ranges in the lockfile are OK (lockfile pins exact installs).
- **Missing keyboard focus indicators**: check :focus / :focus-visible on all interactive elements (WCAG 2.1 AA). Recurring.
- **Test authorship**: developer agents MUST NOT write tests. Check `Co-Authored-By` trailer in test commits. Caused BLOCKING in PR #152 (all 211 tests by frontend-developer).
- **E2E gate**: any UAT scenario marked "Automated (E2E)" MUST have Playwright coverage in `e2e/tests/` before PO approval. Caused BLOCKING in PRs #152 and #157 (CI showed "E2E Tests: SKIPPED").
- **Raw value display (formatDate / percent / placeholder)**: the single most recurring functional bug. See "Display formatting" cluster below.

## Display-formatting cluster (verdict = `--comment` "MUST FIX", non-blocking)

- **Raw date strings** — pass API date fields through `formatDate()` before rendering. PR #402 (Story 4.7) rendered `workItem.startDate/endDate` raw while the same PR used `formatDate()` elsewhere. 3rd+ occurrence.
- **CONFIDENCE_MARGINS fraction vs percentage** — values are decimals (0.2 = 20%). Use `Math.round(CONFIDENCE_MARGINS[...] * 100)`. PR #401 displayed raw "0.2%".
- **Conditional row rendering vs "—" placeholder** — optional field rows must render unconditionally with a ternary `{item.field ? value : '—'}`, not `{item.field && (...)}` which hides the row. PRs #151 (Notes), #400 (vendor/URL).
- **Missing display field** — verify list/table rendering, not just forms. PR #414 (Story 4.9) omitted invoice date (AC #6) and had no "Linked To" column / VendorDetailPage change (AC #9).
- **Color-coded status badge gaps** — when ACs specify colors, verify tokens.css was updated. PR #152 borrowed work-item status tokens for a pending-invoice badge instead of dedicated amber tokens (BLOCKING UX deviation). PR #153 "Exhausted" badge used gray instead of amber.
- **CSS token deviation from UX spec** — e.g. `--color-danger-active` vs `--color-danger-text-on-light`. Non-blocking. PRs #151, #152.

## Error-handling / API patterns

- **Specific error codes in ACs** — when an AC names a custom code (e.g. `MUTUALLY_EXCLUSIVE_BUDGET_LINK`), verify `AppError` uses it, not a subclass returning generic `VALIDATION_ERROR`. PR #414.
- **409 error message specificity** — use backend `details` (e.g. `{invoiceCount, workItemCount}`) to build precise messages. PR #151 mentioned only invoices.
- **Server-side error parsing** — generic banners ("Failed to create…") don't surface field-level validation errors. Recurring in form pages.
- **AC vs UAT discrepancy** — ACs are source of truth. PR #56: AC #6 `ACCOUNT_DEACTIVATED` vs UAT "generic message". Flag non-blocking.
- **UAT scenarios exceeding ACs** — UAT sometimes adds constraints not in ACs (char limits, reorder-all-IDs). ACs win; flag UAT gaps as non-blocking refinement.
- **Frontend/backend validation boundary** — PR #153: frontend allowed `totalAmount=0` (min=0) but backend `exclusiveMinimum: 0` rejects. Keep client validation consistent with server.
- **specialty/field maxLength mismatch** — PR #151 frontend `maxLength={100}` vs backend 200. Verify frontend maxLength matches backend schema.
- **Multi-select vs single-select filters** — Story 3.5 AC #4 said "multi-select" but impl used single `<select>`. Be explicit in ACs.

## Fastify / backend behavior notes

- `additionalProperties: false` — AJV strips extra props silently (no 400). Tests asserting 201/200 are correct.
- `request.url` includes query strings — use `routeUrl` (route pattern) when matching against a Set. PR #61 PUBLIC_ROUTES.
- **Schema migrations** — including `sessions` in the same migration as `users` is correct when both are the same auth infrastructure. PR #55.
- **Placeholder / cross-story dependency pattern** — `computeUsedAmount` returning 0 until a later story adds an FK is ACCEPTED; document with a TODO(Story N) comment; AC = CONDITIONAL PASS. Story 5.4 / PR #153.

## React / frontend gotchas

- **AuthGuard/AuthContext disconnect** — AuthGuard has independent state (calls getAuthMe, `useEffect([],[])`); does NOT subscribe to AuthContext. Clearing `AuthContext.user` won't redirect. Pre-existing; causes AC failures for reactive-auth features. PR #69.
- **Shared React ref across mapped elements** — one `useRef` in `.map()` only binds the last element; breaks click-outside for action menus. Flag for E2E.
- **Missing modifier-key guards on shortcuts** — `useKeyboardShortcuts` doesn't check ctrl/alt/meta; Ctrl+N triggers the `n` shortcut. Shift+N works only by case accident.
- **Keyboard selection initial state** — `selectedIndex` starts at 0 instead of -1.
- **`alert()`/`confirm()` in components** — PR #105 mixed browser dialogs with modal deletes. Flag inconsistency.
- **TODO comments in production code** — PR #105 had a `{/* TODO */}` dependency dropdown = incomplete feature. Always grep for TODO/FIXME.
- **Duplicate fetch logic** — `useEffect` fetch body duplicated for re-fetch after delete; extract shared fetch.
- **Dead placeholder pages after route refactor** — PR #150 left old BudgetPage after swapping to BudgetCategoriesPage. Delete orphans.
- **COOKIE_NAME duplication** — triplicated across `plugins/auth.ts`, `routes/auth.ts`, `routes/oidc.ts`. Extract to shared constant.

## Chore/Maintenance PR patterns

- Chore PRs with no user stories don't require UAT scenarios.
- Always verify PR description claims match the actual diff. PR #316 claimed MEMORY.md/SKILL.md changes not in the diff.
- Function removal (e.g. formatDeadline) can leave double blank lines that Prettier flags.
- Shared CSS utilities: `client/src/styles/shared.module.css` (`composes:`). Shared formatting: `client/src/lib/formatters.ts`.

## When to Request Changes vs Approve

- **`--request-changes`**: functional AC not met (broken CRUD/calc/nav), critical accessibility missing, or tests not written by QA / missing E2E for "Automated (E2E)" scenarios.
- **`--comment` "MUST FIX before merge"**: non-functional gaps only (display/formatting/placeholder/date/number). Must be fixed but non-blocking to the review loop.
- **`--approve`**: all ACs met, all agent reviews present, minor improvements as comments only. Conditional approve when only security-engineer/product-architect reviews are pending.
