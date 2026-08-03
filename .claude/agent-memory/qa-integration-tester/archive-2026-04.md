---
name: archive-2026-04
description: Archived QA test-pattern learnings from April 2026 (CostBreakdownTable source-filter refactors #1354/#1356/#1358/#1360, BudgetBar mock anti-pattern, JSX unicode escapes, CSS module selectors, de/budget.json smart-quote bug, ESM module spy anti-pattern, Fastify AJV removeAdditional)
metadata:
  type: project
---

## Story #1360 — Server-Side Source Filter Tests (2026-04-25)

`CostBreakdownTable.test.tsx`: replaced 12-test `'Source filter — aggregate consistency (#1358)'` block (tested deleted client-side helpers) with a 4-test `'Server-driven render path (#1360)'` block.

**Route test `insertWorkItemWithSource` has `budgetSourceId: string` (NOT nullable)** — use `insertWorkItem({ plannedAmount, confidence })` for null-source WIs.

**`BudgetSourceSummaryBreakdown` now requires `subsidyPaybackMin/Max`.**

**Debounce + AbortController tests**: use real timers + `waitFor({ timeout: 5000 })` for error paths (double-fetch on mount is intentional). With fake timers: `await act(async () => { jest.advanceTimersByTime(100); await Promise.resolve(); })`.

## Story #1358 — CostBreakdownTable Filtered Aggregate Tests (2026-04-25)

Key patterns: `within(row).getByText(...)` to avoid multi-match collisions; get header/area/item rows via `getByRole('button'|'link', {name}).closest('tr')`; `own_estimate` `resolveLineCost` for `plannedAmount=N` = N (avg of 0.8N/1.2N); pro-rata payback share = weight × entityPayback where weight = max-cost / sum-of-max-costs.

## Story #1356 — CostBreakdownTable Per-Source Filter Rework (2026-04-25)

Props: `selectedSourceIds` → `deselectedSourceIds`, `onClearSources` → `onSelectAllSources`. Semantics inverted (hidden when ID is in `deselectedSourceIds`). Source rows changed from chip toolbar to `<tr role="button" aria-pressed>` toggle rows — use `container.querySelector('tr[role="button"]')`. `onSelectAllSources` fires on Escape keydown on the source row.

## Story #1354 — CostBreakdownTable Props Refactor Pattern (2026-04-25)

`budgetSources={[]}` prop replaced with `selectedSourceIds={new Set()} onSourceToggle onClearSources`. Use `replace_all: true` on Edit tool for uniform prop-API renames across many test call sites. **Stale dist warning**: rebuild `node_modules/@cornerstone/shared/dist/` when shared types change — Jest is unaffected (maps to source) but `tsc --noEmit` shows false positives.

## BudgetBar Module-Level Mock Anti-Pattern (2026-04-20)

**Critical**: mocking `BudgetBar` at module level breaks ALL existing tests relying on its rendered segment labels/roles. Test segment keys via observable behavior (aria-label, summaryLabel text), not mock capture.

## JSX Raw Text Unicode Escapes (2026-04-20)

`–` in JSX raw text (NOT inside `{expr}`) renders as the literal 6 characters, not an en-dash — only inside `{}` JS string expressions is it a real Unicode escape.

## CSS Module Class Selectors in Jest/JSDOM (2026-04-20)

`[class*="summaryLabel"]` also matches `summaryLabelDot` (child span) — use `[class*="summaryRow"]` to count rows, then `row.querySelector('[class*="summaryLabel"]')` for label text.

## de/budget.json Smart-Quote Bug (2026-04-16)

A German open-quote (U+201E) paired with an ASCII close-quote (U+0022) terminated a JSON string early — ALL Jest suites failed with `SyntaxError` because i18next loads all locale JSON files even in unrelated tests. Fix: use `“` (U+201C) as the closing quote.

## ESM Module Spy Anti-Pattern (2026-04-16)

**Critical**: `jest.spyOn(module, 'functionName')` ALWAYS THROWS on ESM static imports (`Cannot assign to read only property`) — fails the ENTIRE suite, not just one test. ESM exports are read-only live bindings. Fix: remove the spy, verify via observable behavior instead, or use `jest.unstable_mockModule()` at the top level before imports if spying is truly required.

## Fastify AJV Default: removeAdditional=true (2026-03-26, updated 2026-05-16)

**Critical pattern**: `@fastify/ajv-compiler` defaults to `removeAdditional: true` — `additionalProperties: false` STRIPS unknown properties rather than rejecting with 400. Correct test: assert 200/201 with extra fields silently removed, not 400.

**Ajv 8 + removeAdditional + minProperties interaction**: Ajv 8 does NOT re-evaluate `minProperties` against the stripped object — a body with ONLY unknown fields silently no-ops (200), not 400.

Affected/reference files: `invoiceBudgetLines.test.ts`, `standaloneInvoices.test.ts`, `invoices.test.ts` (canonical correct pattern).
