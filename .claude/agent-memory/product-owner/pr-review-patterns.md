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
- **Tests that ENCODE the defect**: a test named "does NOT do X" that asserts X, or a test comment containing unresolved reasoning ("— wait, actually…"). Green CI then certifies the bug. Grep new/changed test files for hedging words in comments; a title contradicting its own assertion is the tell. Caught the AC 4.6 blocker on PR #1894 (asserted €1400 on a €1000 invoice).
- **Conservation assertions for money math**: for any split/apportionment logic, demand a test that the parts sum to the whole across ALL consumers — not just a per-consumer number. Per-source numbers can each look plausible while the total is inflated (PR #1894).

## Dual desktop/mobile rendering (responsive card-list pattern)

When a PR adds a mobile card list beside a desktop table, re-check rather than assume:

- Both copies must call the **same handler** — two exclusion/toggle paths can diverge silently.
- Confirm the hidden copy uses `display: none` (removed from the a11y tree), not just visual hiding — otherwise duplicate accessible names.
- jsdom renders BOTH, so `getByRole` becomes ambiguous. `getAllByRole(...)[0]` is the accepted convention here — legitimate disambiguation, not a weakened test. But `getByText` → `getAllByText(...).length > 0` does drop the "exactly one" guarantee; `within(desktopTable)` keeps both properties.
- Check any scoped CSS-class fix (e.g. a `justify-self` chip fix) is not overridden or bypassed by the new media query, and that a shared wrapper class (`.tableWrapper`) hidden on mobile isn't also used by an unrelated always-visible region.

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
- **`useState(contextValue)` seeding from LocaleContext/ThemeContext is stale-prone** — `useState(resolvedLocale)` only runs its initializer on first render, but `LocaleContext.syncWithServer` (fired from `App.tsx`'s `LocaleServerSync` after auth) applies the server-stored locale _asynchronously_ AND clears `localStorage`, so every later hard load starts at the browser-detected locale before flipping. Any page seeding state from `resolvedLocale`/`currency`/`vatRate` at mount can capture the pre-sync value and never correct. Fix pattern: `const [override, setOverride] = useState<T | null>(null); const value = override ?? contextValue;` — default tracks context, explicit choice sticks. Found in PR #1903 (AC "defaults to my current UI locale"). Same class of bug applies to `ThemeContext.syncWithServer`.

## Chore/Maintenance PR patterns

- Chore PRs with no user stories don't require UAT scenarios.
- Always verify PR description claims match the actual diff. PR #316 claimed MEMORY.md/SKILL.md changes not in the diff.
- Function removal (e.g. formatDeadline) can leave double blank lines that Prettier flags.
- Shared CSS utilities: `client/src/styles/shared.module.css` (`composes:`). Shared formatting: `client/src/lib/formatters.ts`.

## CSS Modules / styling defects (recurring)

- **`:global(.someClass)` targeting another CSS module's class is ALWAYS dead CSS.** `client/webpack.config.cjs` sets `localIdentName: '[local]_[hash:base64:5]'` (prod) / `'[name]__[local]--[hash]'` (dev), so `sharedStyles.input` renders as `input_aB3xY`. `:global(.input)` compiles to a literal `.input` selector that matches nothing — and there is no global (non-module) `.input`/`.textarea` rule anywhere in `client/src`. Correct pattern is a local class with `composes: input from '../../styles/shared.module.css';`. Stylelint also rejects it (`selector-pseudo-class-no-unknown`). Found in PR #1909 `EditableField.module.css` — the whole approved field treatment (at-rest tint, hover, focus-ring split, `width:100%`, dense padding) silently never applied. **Grep new `.module.css` for `:global(` — no other file in the repo uses it.**
- **Reimplemented visually-hidden utility** — `shared.module.css:455` already has `.srOnly` with modern `clip-path: inset(50%)`. Hand-rolled copies use the deprecated `clip: rect(...)` and trip Stylelint `property-no-deprecated`. PR #1909.
- **Stylelint is a REQUIRED gate inside `Static Analysis`** (step 8, before Build). A red `Static Analysis` on a CSS-touching PR is almost always token adherence (`declaration-property-value-disallowed-list`, e.g. bare `font-weight: 500`) — this is a direct AC violation whenever the story has a "design tokens only" criterion. Check `gh api repos/.../actions/jobs/<id> --jq '.steps[]'` to see which step failed; `--log-failed` returns nothing while the run is still in progress.

## i18n defects (recurring)

- **Raw English identifiers interpolated into translated strings.** `t('...resetFieldAriaLabel', { field: 'attachmentsNote' })` renders in German as "attachmentsNote auf generierten Text zurücksetzen". Key parity checks pass; the defect is in the _interpolation value_, not the key. Always inspect what is passed into `{{...}}` placeholders, especially for aria-labels (user-facing to screen readers → counts against "every new string resolves in en and de"). PR #1909.
- **Key-echoing `t` mocks hide this entirely** — a mock like `(key, opts) => opts ? key+JSON.stringify(opts) : key` accepts raw literals happily. Compensating control worth asking for: a real-bundle render test with a leaked-key regex — but check the regex covers ALL namespaces used, not just the feature's own prefix (PR #1909's `/^sourceReports\./` missed `sources.lines.invoiceStatus.*`).

## When to Request Changes vs Approve

- **`--request-changes`**: functional AC not met (broken CRUD/calc/nav), critical accessibility missing, or tests not written by QA / missing E2E for "Automated (E2E)" scenarios.
- **`--comment` "MUST FIX before merge"**: non-functional gaps only (display/formatting/placeholder/date/number). Must be fixed but non-blocking to the review loop.
- **`--approve`**: all ACs met, all agent reviews present, minor improvements as comments only. Conditional approve when only security-engineer/product-architect reviews are pending.

## LLM/prompt-assembly defects (new class, PR #1916)

- **Currency-unit mismatch between the prompt builder and the domain types.** Cornerstone stores money as **major units** (`real` columns; `SourceReportInvoice.allocatedAmount` is "rounded to 2dp" and goes straight into `Intl` currency style — `buildReportContent.test.ts` asserts `250` → `€250.00`). Any prompt builder doing `(amount / 100).toFixed(2)` (the minor-units/cents idiom) understates every figure by 100×. Found in `buildReportContentUserPrompt`. The system prompt told the model "Do NOT invent or alter amounts", so it faithfully copies the wrong number into a bank-facing cover letter while the PDF table beside it shows the correct one. **Always check the unit convention when reviewing a prompt builder that formats money.**
- **`Math.round(x)` on major units rounds to whole currency units, not cents.** Look for a `// Round to nearest cent` comment sitting above a bare `Math.round(x)` — the correct form is `Math.round(x * 100) / 100`.
- **Derived totals and their per-item components can diverge.** When exclusions (line-level, row-level) adjust an aggregate, verify the *per-item* values sent alongside it were adjusted by the same rule. PR #1916 subtracted excluded portions from `totalAmount` but sent each invoice's raw `allocatedAmount`, so the model saw invoices summing to more than the stated total.
- **Prompt *content* is usually untested.** Existing prompt tests asserted only `toContain('Language: German')` / `toContain('Invoice ID: inv-1')` — never a rendered amount. Ask for a regression guard on formatted numeric values in the prompt whenever money reaches an LLM.
- **A test whose title states the contract but whose expectation matches the code is a defect, not coverage.** `reportContentGenerationService.test.ts` scenario 5 was titled "rounded to the nearest cent" and asserted `733` for a true `733.335`. Read test *titles against* their assertions.
- **Shared error-code copy leaks the originating feature's vocabulary.** `LLM_UNREACHABLE`/`LLM_INVALID_RESPONSE`/`LLM_UPSTREAM_ERROR` all say "The extraction service …" and `LLM_NOT_CONFIGURED` says "Auto-itemization is not configured" — written for auto-itemize, now surfaced in the report wizard. When a second feature reuses an error code, check the copy is feature-neutral. MUST FIX (display), not blocking.
- **Wiki submodule edits are easy to miss.** `git -C wiki status --short` showing `M API-Contract.md` while `git -C wiki log -1` equals `origin/master` means the documentation AC is **not** satisfied — the page is written but unpublished. Check this on every story with a "documented on the API Contract wiki page" criterion.
