---
name: feature-spec-history
description: Detailed notes from past visual specs posted to GitHub issues, in case a related story/PR references the same components again
metadata:
  type: project
---

## Issue #1876 — Deposit Refunds with Negative Claim Adjustments

`InvoiceDepositsSection` gains an entry-type choice (Deposit/Refund); refunds render as negative rows reusing the exact same status Badge/labels (Pending/Paid/Claimed) — no relabeling, per explicit user decision.

- **Entry-type radio group**: no segmented-control component exists in the codebase — reused the plain `<input type="radio">` + `role="group"` pattern from `AutoItemizePage.module.css` `.modeSelector` (mode: append/replace) verbatim instead of inventing a new control. This is the only other radio group in the app; treat it as the canonical pattern for any future "choose one of N" form field that isn't a `<select>`.
- **Negative amount color**: `var(--color-danger-text-on-light)` (light=red-700, dark=red-300) — same alias already used by `--color-status-blocked-text`/`--color-user-inactive-text`/`--color-diary-issue-text`, so reusing it for a plain negative-amount `<span>` (not inside a badge) carries no new contrast risk.
- **Refund type tag**: new `Badge` variant `refund` added to `Badge.module.css`, reusing `--color-status-blocked-bg`/`-text` (the existing red badge pair) rather than inventing new `--color-danger-badge-*` tokens (those don't exist — only success/warning have a `-badge-bg` alias family).
- **Sign not by color alone**: satisfied via two channels — the Badge's literal "Refund" text label, plus `formatCurrency(-amount)` producing a literal minus-sign string (Intl.NumberFormat handles negative currency natively, no manual sign formatting needed).
- **"Effective amount" displays** (invoice list `remainingAmount` column, detail `finalPaymentAmount` row): these are pre-existing slots whose value becomes refund-aware server-side — deliberately did NOT recolor them red/danger, since they're a computed remainder, not a refund row itself; recoloring would falsely imply an error state. Left their existing token treatment untouched.
- **Scope boundary**: raw `invoice.amount` in the Invoice Details card is the gross contracted total and stays out of scope — only displays literally labeled "remaining amount" become net-of-refunds per the AC wording.
- Flagged a real pre-existing a11y gap while reading `InvoiceDepositsSection.tsx`: `OverflowMenu triggerAriaLabel` falls back to the hardcoded string `'deposit'` (`deposit.description ?? 'deposit'`) — needs to become entry-type-aware once refunds exist, or a refund row's menu announces "deposit" to screen readers.

## Story #1736 — Invoice Vendor Change

- Vendor picker in invoice edit modal: `SearchPicker<Vendor>` with `showItemsOnFocus`, `initialTitle={editForm.vendorName}`, `id="edit-vendor"` for label association
- `searchFn`: `fetchVendors({ q: query, pageSize: 50 })` returning `res.vendors`
- `InvoiceFormState` extension: `vendorId: string` + `vendorName: string`; `openEditModal` pre-fills both
- Field position: NEW full-width `.field` between "Invoice Number/Amount" row and "Invoice Date/Due Date" row; required, `FormError variant="field"` below picker
- API 404 on vendor change: surface via existing `editError` banner path, key `invoiceDetail.messages.vendorNotFound`
- Reference implementation: `DiaryEntryForm` daily_log branch (lines 354–373)

## Story #1551 — Discretionary Funding + Auto-origin badge

- AutoItemizePage already has a per-line "Funding Source" `<select>` that pre-fills to discretionary — recommended informational note above `.lineList`, not a column
- Note style: `--color-primary-bg` bg, `--color-border` border, `3px solid --color-primary` left border, `--radius-md`
- New `.autoOrigin` Badge variant (blue-tinted `--color-primary-bg`/`--color-primary-badge-text`) distinct from `.info` (gray) — separates "data origin" semantic from "assignment label" semantic
- `BreakdownBudgetLine` shared type needs `origin: 'manual' | 'auto'`; `getSourceBadgeStyleKey(null)` → `'sourceUnassigned'`, `getSourceColorIndex(null)` → `0`

## DiaryEntryForm Patterns (Story #1672)

- `daily_log` metadata section: `.metadataSection` with `--color-bg-secondary` bg, `--color-border` border, `--radius-md`, `--spacing-4` padding
- `.formRow` auto-fit grid is wrong for time pickers — use explicit `.formRowTwoCol` (`1fr 1fr`) so columns never wrap on tablet
- Vendor selector: `SearchPicker` + `showItemsOnFocus`; time inputs: native `<input type="time" step="60">`; cross-field validation error goes below the row, single `validationErrors.dailyLogWorkTime` key
- Duration display: `role="status" aria-atomic="true"` (no separate `aria-live`), computed client-side
- `DailyLogMetadata` type needs `vendorId?`, `vendorName?`, `workStart?`, `workEnd?`
- Watch for i18n key collision: `form.vendor` already used by delivery entry type — use `form.dailyLogVendor` if label differs

## Story #1679 — Paperless-first Invoice Creation

- Picker modal: `max-width: min(900px, calc(100vw - 2rem))`, mobile full-screen with `border-radius: 0`
- Correspondent filter: `SearchPicker` in the wrapper component, NOT inside `DocumentBrowser`
- `DocumentBrowser` new props: `defaultHideLinked?`, `onOpenInPaperless?`, `paperlessUrl?`
- "Open in Paperless" per-card link: `opacity: 0` → `1` on hover/focus-within, always opaque on mobile, wrapped in `prefers-reduced-motion: no-preference`
- LLM vendor suggestion reuses existing `SuggestionBadge` (not a new Badge variant)
- New wrapper component `InvoicePaperlessPickerModal` at `client/src/components/invoices/` — justified (invoice-creation-specific chrome + reusable)
- URL pattern: `{paperlessUrl}/documents/{document.id}/details`

## Story #1723 — AreaPicker Hierarchy Display

- Dropped em-dash indentation in favor of ancestor-path secondary line (see [component-patterns.md](component-patterns.md))
- `AreaResponse` has NO `ancestors` field — computed client-side via `parentId` traversal (`getAncestorPath` helper in `areaTreeUtils.ts`)
- WCAG AA contrast verified: `--color-text-muted` on `--color-bg-primary`: 4.6:1 light, 5.0:1 dark, 4.5:1 hover (boundary) — all pass
- Core bug driving the story: `PhotoMetadataSidepanel` used a raw `SearchPicker<AreaResponse>` instead of `AreaPicker`

## Story #1553 — Full Edit for Budget Lines (PR #1554)

- `BudgetLineForm` parent-picker extends to the edit path: collapsed "Linked item" row + "Change" button when `currentParentId` is set
- Modal width: `min(540px, calc(100vw - 2rem))`
- New i18n keys (namespace `budget`): `linkedItemLegend`, `changeParentButton`, `cancelChangeParentButton`, `moveButton`, `movingButton`, `moveCrossTableHint`, `moveCrossTableHintReverse`
- `parentPickerTab`/`modeBtn` missing `:focus-visible` (pre-existing gap, WCAG 2.4.7 Medium)

## Story 4.9 — Invoice Linking for HI Budget Lines (Issue #413)

See `story-4-9-invoice-linking-hi.md`. Entity type toggle (`role="group"` + `role="radio"`), "Linked To" column hidden at tablet.

## Story #1545 — Unassigned IBL + One-Shot Parent Assignment (PR #1548)

- IBL table `tdLinkedItem` cell: `display:flex; align-items:center; gap:var(--spacing-2)` wrapper
- Parent picker section in BudgetLineForm: inset panel with `--color-bg-tertiary` bg
- Modal width for edit with picker visible: `min(640px, calc(100vw - 2rem))`
- Focus auto-advance: use `requestAnimationFrame` (not `setTimeout`) for React 19 concurrent rendering

## Story #1804 — Backup Scheduler Status (node-cron 4.5 adoption)

- Spec posted on issue #1804; implemented in PR #1834 (approved — see [pr-review-findings.md](pr-review-findings.md))
- Section card above `.toolbar`, `<dl>`/`<dt>`/`<dd>` status rows, new Badge `.success` variant, `Skeleton` + `sharedStyles.bannerError` for loading/error states
- Mobile: `.schedulerStatusRow` → `flex-direction: column` at `<768px`
