# PR Review History — Detailed Findings

Detailed security findings and controls verified per PR. Summary table in MEMORY.md.

---

## PR #1837 — Fix #1806: float-sum epsilon in invoice guards (2026-07-07)

**Status**: APPROVED (no blocking findings)

**Scope**: New `server/src/services/shared/money.ts` (`toCents`/`exceedsAmount` pure functions); 6 call sites in `invoiceAutoItemizeService.ts`, `invoiceBudgetLineService.ts` (x3), `invoiceDepositService.ts` (x2) switched from bare `sum > total` to `exceedsAmount(sum, total)` (cent-rounded comparison). Plus tests only.

**Key finding — bounded, non-cumulative epsilon**: `exceedsAmount` rounds both sides to nearest whole cent (`Math.round(x*100)`) before comparing, tolerating up to <€0.005 of hidden overage per check. Verified this **cannot compound**: every guard site recomputes the full sum fresh from live DB rows/aggregate on each call (not from a previously-rounded running total) — checked `invoiceBudgetLineService.ts` (`.reduce()` over freshly-queried rows in `createInvoiceBudgetLine`/`updateInvoiceBudgetLine`/`editAndMoveBudgetLine`) and `invoiceDepositService.ts` (`currentSum`/`otherSum` from live `tx` SUM aggregate, lines 235/418). Max permanent overage on any invoice stays fixed at <€0.005 regardless of how many lines/deposits are created or edited — not a repeatable-drift vulnerability.

**Bypass check**: `grep` confirmed no bare `> invoice.amount` / `> effectiveInvoiceAmount` comparisons remain anywhere in `server/src/services/*.ts` — all 6 sites converted consistently; "genuinely one cent over" tests still assert rejection.

**NON-BLOCKING / informational (pre-existing, not introduced by this PR)**: None of the `itemizedAmount`/`amount` route schemas (`invoiceBudgetLines.ts`, `invoiceDeposits.ts`, `invoiceAutoItemize.ts`, `invoices.ts`) declare `multipleOf: 0.01` — API accepts arbitrary-precision floats, which is the root source of the float noise this PR works around. Repo-wide gap (grepped, zero `multipleOf` usages anywhere in `server/src/routes/`), not specific to this PR. Suggest as a future defense-in-depth story.

---

## PR #316 — Retrospective Improvements: dep pinning, shared CSS, formatDate, invoiceService (2026-02-27)

**Status**: COMMENTED (1 low finding, does not block merge)

**Scope**: 17 files changed — shell script, lintstagedrc, package.json, CSS modules consolidation, formatDate shared function, invoiceService.ts refactor, wiki submodule update.

**Key Controls Verified**:

- ✅ invoiceService.ts: Drizzle ORM parameterized queries throughout `toInvoice()` function — no SQL injection surface introduced by refactor
- ✅ XSS: CSS Modules composition introduces no injection surface; formatDate renders to text only
- ✅ formatDate(): null/undefined guard + `slice(0, 10)` truncation before split — safe, no code execution path
- ✅ No new npm dependencies; two caret ranges pinned to exact versions (eslint-plugin-react-hooks, typescript)
- ✅ No new API endpoints, auth flows, or authorization logic

**NON-BLOCKING Findings**:

1. (Low) `scripts/check-dep-pinning.sh:22` — Unquoted heredoc (`<<EOF`) interpolates `${PACKAGE_JSON}` directly into JS source literal. Path with single quotes would break JS syntax or (in contrived scenario) inject JS. Fix: use `<<'EOF'` + pass path via `process.argv[1]`. Negligible practical risk — lint-staged controls paths; only developer pre-commit hook environment.

---

## PR #193 — Story #186 Budget Frontend Rework (2026-02-22)

**Status**: APPROVED w/ low findings

**Scope**: 9 files changed, all `client/` — BudgetOverviewPage, VendorDetailPage, workItemsApi (remove vendor linking), WorkItemDetailPage test updates.

**Key Controls Verified**:

- ✅ XSS: Zero dangerouslySetInnerHTML/innerHTML/eval. All user data (work item titles, budget line descriptions, category names) rendered as React text nodes
- ✅ Category color: Applied via React style object `{ backgroundColor: color }`, not string interpolation — CSS injection impossible
- ✅ Dynamic CSS class `styles[\`status\_\${invoice.status}\`]`: Server-validated enum value; CSS Modules scopes at build time — safe
- ✅ Budget line/work item IDs: Populated from server-returned UUID `<option>` values only, no free-text entry
- ✅ budgetLinkTouched guard: Conditional spread prevents sending workItemBudgetId when user hasn't touched the dropdown
- ✅ No new dependencies

**NON-BLOCKING Findings**:

1. (Low) `VendorDetailPage.tsx:1037,1256` — `fetchWorkItemBudgets` rejection silently swallowed (no .catch()); budgetLinesLoading stays true indefinitely on error
2. (Low) `VendorDetailPage.tsx:127` — `listWorkItems({ pageSize: 200 })` exceeds server maximum of 100; Fastify returns 400; void .then() swallows rejection; work item dropdown silently empty (feature non-functional)

**Notes**:

- tel:/mailto: link injection via vendor.phone/email pre-existing (PR #151 finding #7) — no new risk
- `SummaryCard` id derived from hardcoded title string literals, not user data — safe

---

## PR #187 — EPIC-05 Stories 5.9-5.12 Budget Rework (2026-02-21)

**Status**: APPROVED w/ low finding

**Key Controls Verified**:

- ✅ Authentication: All 4 new endpoints enforce `request.user` check
- ✅ IDOR: PATCH/DELETE verify ownership via `and(eq(workItemBudgets.id, budgetId), eq(workItemBudgets.workItemId, workItemId))`
- ✅ SQL Injection: Drizzle ORM throughout; `sql\`\`` tagged templates safe (parameterized)
- ✅ Input Validation: AJV (additionalProperties:false, minimum:0, enum, maxLength:500) + service layer FK checks
- ✅ XSS: React text nodes only; enum key lookup for confidence labels
- ✅ Migration: `PRAGMA foreign_keys = OFF/ON` sandwich; table recreations + data migration correct

**NON-BLOCKING Findings**:

1. (Low) `invoiceService.ts:131-139` — workItemBudgetId cross-vendor boundary not enforced (data integrity only, no auth bypass)

**Schema Patterns**:

- `work_item_budgets` table: `work_item_id` FK `ON DELETE CASCADE`; category/source/vendor FKs `ON DELETE SET NULL`
- `work_item_vendors` table dropped — vendor links now via `work_item_budgets.vendor_id`
- `confidence` enum: `['own_estimate', 'professional_estimate', 'quote', 'invoice']`

---

## PR #157 — Story #148 Budget Overview (2026-02-20)

**Status**: APPROVED

**Key Controls Verified**:

- ✅ Auth: Both member and admin roles permitted; returns 401 if unauthenticated
- ✅ SQL Injection: All 5 queries use Drizzle ORM `sql` tagged template (parameterized). No user input in queries
- ✅ IDOR: Project-level aggregation; all authenticated users receive identical overview
- ✅ Data Exposure: Aggregated metrics only; no PII/vendor contact/secrets

**Response Shape (as of Story 5.11)**:
`overview.{ availableFunds, sourceCount, minPlanned, maxPlanned, projectedMin, projectedMax, actualCost, actualCostPaid, remainingVsMinPlanned, remainingVsMaxPlanned, remainingVsActualCost, remainingVsActualPaid, remainingVsProjectedMin, remainingVsProjectedMax, categorySummaries[], subsidySummary }`

---

## PR #152 — Story #144 Invoice Management (2026-02-20)

**Status**: APPROVED w/ low findings

**Key Controls Verified**:

- ✅ Auth: All 4 endpoints enforce `request.user` check
- ✅ IDOR: PATCH/DELETE verify ownership via `and(eq(invoices.id, invoiceId), eq(invoices.vendorId, vendorId))`
- ✅ Input Validation: AJV (exclusiveMinimum:0, date regex, status enum, maxLength, additionalProperties:false, minProperties:1 on PATCH) + service layer

**NON-BLOCKING Findings**:

1. (Low) Client-side amount guard checks `amount < 0` (allows 0) — server correctly rejects with exclusiveMinimum
2. (Low) Notes textarea has no `maxLength` attribute — server enforces 10,000 chars

**Schema Patterns**:

- `invoices.vendor_id` → `ON DELETE CASCADE`
- `invoices.created_by` → `ON DELETE SET NULL`
- Status enum: `['pending', 'paid', 'claimed']`
- `invoices.work_item_budget_id` → nullable FK `ON DELETE SET NULL`

---

## PR #151 — Story #143 Vendor Management (2026-02-20)

**Status**: APPROVED w/ low findings

**Key Controls Verified**:

- ✅ SQL Injection: LIKE search escapes % and \_ wildcards before parameterized binding; sort column uses whitelist switch
- ✅ Input Validation: Fastify JSON schema (additionalProperties:false, minProperties:1 on PATCH) + service layer

**NON-BLOCKING Findings**:

1. (Low) `email` field has no format validation — `format:'email'` not set in AJV schema
2. (Low) 409 VENDOR_IN_USE details field exposes `{invoiceCount, workItemCount}`

---

## PR #150 — Story #142 Budget Categories (2026-02-20)

**Status**: APPROVED w/ medium finding

**Key Controls Verified**:

- ✅ Color: `^#[0-9A-Fa-f]{6}$` regex enforced at schema + service; CSS injection impossible

**NON-BLOCKING Findings**:

1. (Medium) DB UNIQUE on `budget_categories.name` is case-sensitive while app enforces case-insensitive
2. (Low) 409 CATEGORY_IN_USE details field exposes `subsidyProgramCount` and `workItemCount`

---

## PR #57 — Story #32 Sessions (2026-02-16)

**Status**: APPROVED w/ medium findings

**NON-BLOCKING Findings**:

1. (Medium) No rate limiting on auth endpoints (login/setup/password)
2. (Low) Security headers not configured (@fastify/helmet recommended)

---

## EPIC-01 Auth (PRs #55-#82, 2026-02-16) and EPIC-03 Work Items (PRs #97-#106, 2026-02-17)

All approved. No high/critical findings. Medium findings (rate limiting, security headers) in PR #57 above. Work items PRs (#102, #103) had medium findings for input sanitization in notes/subtasks (addressed in same PRs).

---

## PR #1554 — Story #1553: Full edit + linked-item move for invoice budget lines (2026-05-22)

**Status**: COMMENTED (no blocking findings — APPROVED)

**Summary**: New `editAndMoveBudgetLine()` service function handles 4 scenarios: in-place edit, same-table move, cross-table move (WIB→HIB or HIB→WIB), and combined. All operations wrapped in `db.transaction()`. Target-existence and BUDGET_LINE_ALREADY_LINKED guards run inside the transaction (no TOCTOU). All three PATCH route handlers (invoiceBudgetLines, workItemBudgets, householdItemBudgets) check `request.user` before calling service. All queries use Drizzle ORM parameterized. No cross-scope pivot possible (single-tenant, ownership checked by parent-ID match).

**NON-BLOCKING Findings**:

1. (Low) Move fields `newWorkItemId`/`newHouseholdItemId` accept empty string — no `minLength: 1` on string branch. Service throws `NotFoundError` as backstop. Affects `workItemBudgets.ts:80-81`, `householdItemBudgets.ts:83-84`, `invoiceBudgetLines.ts:57-68`. Fix: add `minLength: 1`.
2. (Informational) WIB and HIB PATCH schemas missing `minProperties: 1` — empty body `{}` passes schema, causes no-op update. Pre-existing gap extended by new move fields. IBL PATCH schema correctly has `minProperties: 1`.
