---
name: open-recommendations
description: Full numbered backlog of low/informational security recommendations noted across PR reviews, not yet fixed
metadata:
  type: project
---

These have been noted in previous reviews. **GitHub Issue #315** tracks items 1-6 (security hygiene backlog story). Items 7+ remain as informational tracking, surfaced again only if directly touched by a future PR.

1. **Rate limiting** (Medium): Add @fastify/rate-limit to login/setup/password endpoints
2. **Security headers** (Low): Install @fastify/helmet for CSP, HSTS, X-Frame-Options
3. **Account lockout** (Low): After N failed login attempts
4. **Case-insensitive DB unique index** (Low): For budget_categories.name (PR #150)
5. **409 error detail suppression** (Low): Remove counts from CATEGORY_IN_USE/VENDOR_IN_USE/BUDGET_SOURCE_IN_USE/BUDGET_LINE_IN_USE 409 details fields (PRs #150, #151, #152, #187)
6. **Vendor email format validation** (Low): Add `format: 'email'` to vendor schema (PR #151)
7. **Missing server-side maxLength** (Low): budget_sources.terms/notes, any future text fields (PR #151, #152)
8. **workItemBudgetId cross-vendor boundary** (Low): invoiceService.ts doesn't verify budget line's work item is vendor-related (PR #187)
9. **Swallowed promise rejection in budget line fetch** (Low): VendorDetailPage.tsx:1037,1256 — no .catch() on fetchWorkItemBudgets (PR #193) [NEW pages in PR #203 fixed this for InvoicesPage/InvoiceDetailPage]
10. **pageSize 200 exceeds server maximum** (Low): RESOLVED in PR #203 — new InvoicesPage/InvoiceDetailPage use pageSize: 100 correctly
11. **getInvoiceByIdSchema missing additionalProperties: false** (Informational): standaloneInvoices.ts params schema — no exploit path (PR #203)
12. **Milestone color field lacks schema-layer pattern constraint** (Low): milestones.ts createMilestoneSchema/updateMilestoneSchema — service validates correctly but schema doesn't (PR #247)
13. **leadLagDays field has no magnitude bound** (Informational): dependencies.ts schema — extreme values flow into CPM arithmetic (PR #247, also relevant for PR #248 scheduling engine)
14. **CircularDependencyError cycle field exposes internal work item IDs** (Informational): schedule.ts 409 details — acceptable in single-tenant model (PR #248)
15. **anchorWorkItemId schema lacks minLength: 1** (Informational): schedule.ts schema — empty string caught by handler not schema (PR #248)
16. **workItemIds schema lacks maxItems/maxLength** (Informational): milestones.ts createMilestoneSchema — array and items have no size bounds; N+1 DB loop in milestoneService (PR #263)
17. **actualStartDate/actualEndDate cross-field ordering** (Informational): workItems.ts — no validation that actualEndDate >= actualStartDate at schema or service layer; same gap as existing startDate/endDate pair (PR #308)
18. **leadLagDays no magnitude bound on HI dep endpoints** (Informational): householdItems.ts createHouseholdItemDepSchema — mirrors finding #13 for WI deps (PR #416)
19. **GET /api/work-items/:id/dependent-household-items no work item existence check** (Informational): workItems.ts handler — returns 200+empty array for non-existent WI IDs instead of 404; listDependentHouseholdItemsForWorkItem service also lacks assertWorkItemExists guard (PR #416)
20. **Preferences value field no maxLength** (Informational): preferences.ts upsertPreferenceSchema — `value: { type: 'string' }` with no maxLength; ThemeContext correctly validates enum before applying; future consumers of other keys may not (PR #708)
21. **DELETE preferences key param no bounds** (Informational): preferences.ts deletePreferenceSchema params — `key: { type: 'string' }` missing minLength:1/maxLength:100 that PATCH schema has; empty-string always 404 so no exploit path (PR #708)
22. **DAV 401 missing WWW-Authenticate header** (Low): dav.ts davAuth throws UnauthorizedError without setting `WWW-Authenticate: Basic realm="Cornerstone DAV"` — RFC 7235 §4.1 required; CalDAV/CardDAV clients may fail auto-config (PR #936)
23. **assignToWorkItem not wrapped in transaction** (Informational): budgetLineAssignService.ts — orphan check + update + select not atomic; not exploitable due to better-sqlite3 synchronous serialization (PR #1548)
24. **computeUsedAmount includes orphan rows** (Informational): budgetSourceService.ts:117 — missing `AND work_item_id IS NOT NULL`; latent until Story #1547 creates orphans with non-null budgetSourceId (PR #1548)
25. **targetId / id route param no minLength: 1** (Informational): budgetLineAssign.ts — empty string passes schema validation, caught by DB lookup as 404 (PR #1548)
26. **LLM_BASE_URL leaks into startup error message** (Informational): config.ts:275 — echoes raw URL in validation error; consistent with PAPERLESS_URL/EXTERNAL_URL pattern (PR #1549)
27. **LLM_REQUEST_TIMEOUT_MS no upper bound** (Informational): config.ts:282 — only validates positive; no maximum cap; suggested ≤ 300 000 ms (PR #1549)
28. **localhost targets allowed in LLM_BASE_URL** (Informational): config.ts:264-277 — intentional for Ollama self-hosting; operator-trust model; no client-supplied URL path (PR #1549)
29. ~~**OCR payload no size cap before LLM dispatch**~~ — RESOLVED in PR #1681 (`runExtractionCore` truncates to `MAX_OCR_CHARS` before `provider.extract()`)
30. ~~**lines array no maxItems in auto-itemize commit route**~~ — RESOLVED in PR #1681 (`maxItems: 200` on all three `invoiceAutoItemize.ts` route schemas)
31. **Move fields no minLength: 1** (Low): workItemBudgets.ts:80-81, householdItemBudgets.ts:83-84, invoiceBudgetLines.ts:57-68 — `newWorkItemId`/`newHouseholdItemId` accept empty string; service throws NotFoundError as backstop; fix: add `minLength: 1` (PR #1554)
32. **WIB/HIB PATCH schemas missing minProperties: 1** (Informational): workItemBudgets.ts, householdItemBudgets.ts — empty body `{}` passes schema, causes no-op `updatedAt` touch; IBL PATCH has this correctly (PR #1554)
33. **No `multipleOf: 0.01` on monetary amount fields** (Informational): repo-wide gap across `invoiceBudgetLines.ts`, `invoiceDeposits.ts`, `invoiceAutoItemize.ts`, `invoices.ts` — API accepts arbitrary-precision floats, root source of float-summation noise that PR #1837's `money.ts` works around. Not exploitable beyond the bounded <€0.005 epsilon already tolerated by design (PR #1837).
34. **Numeric env vars accept trailing garbage via bare `parseFloat`/`parseInt`** (Informational, repo-wide): config.ts — `VAT_RATE`, `PORT`, `SESSION_DURATION`, `PHOTO_MAX_FILE_SIZE_MB`, `LLM_REQUEST_TIMEOUT_MS`, `LLM_MAX_TOKENS`, `BACKUP_RETENTION`, `DIARY_DRAFT_RETENTION_DAYS` all use bare `parseFloat`/`parseInt` with only a range/NaN check, no strict format regex — `VAT_RATE=0.19abc` silently parses to `0.19` instead of erroring. `CURRENCY` is the only numeric-ish config with strict regex validation (`^[A-Z]{3}$`). Operator-controlled env vars, not attacker-reachable — config integrity issue, not a vuln. Fix: add `/^\d*\.?\d+$/`-style full-string regex before parsing, consistently (PR #1838).
