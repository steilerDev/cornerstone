---
name: recurring-patterns
description: Cross-cutting correctness traps in Cornerstone that have bitten more than once — polymorphic FK cleanup, CONFIDENCE_MARGINS units, SQLite XOR CHECK vs SET NULL, N+1 sites accepted at current scale
metadata:
  type: project
---

# Recurring Patterns & Traps

## Polymorphic FK cleanup

Polymorphic FKs carry no DB-level constraint, so **every** service that deletes the referenced entity
must clean up manually. Applies to `document_links` and `household_item_deps`. Caught as a defect on
PR #416 (orphaned deps on work-item/milestone delete). Check this on any new polymorphic reference.

## CONFIDENCE_MARGINS are fractions, not percentages

Values are `0.2 / 0.1 / 0.05 / 0`. The frontend must multiply by 100 for display. Shipped as a display
bug once (PR #401).

## SQLite: XOR CHECK is incompatible with ON DELETE SET NULL (bug #611)

SQLite enforces CHECK constraints _during_ the FK SET NULL action. Given
`CHECK((a IS NOT NULL AND b IS NULL) OR (b IS NOT NULL AND a IS NULL))` plus `ON DELETE SET NULL` on `a`,
deleting the referenced row fires SET NULL, which then violates the XOR CHECK and aborts.
**Use ON DELETE CASCADE instead.** This is why `invoice_budget_lines` (ADR-018) cascades.

## Forked-function drift

When a function is forked into an `XExcludingY` / `XWithZ` variant rather than parameterised, diff the
core formula against the original line by line — that divergence is where the bug will be. Seen on
`splitByDepositsExcludingTagged` (PR #1894), where the residual expression was the sole difference and
the sole defect. Prefer an options flag over a fork; when a fork ships anyway, file the collapse follow-up.

## Test smells worth escalating in review

- A combined-path test that places the two interacting entities on **different** parents proves nothing
  about the crossing case. Demand the same-parent fixture.
- An assertion of a surprising number wrapped in a long apologetic comment is usually a bug report in
  disguise (pre-fix #1894 test literally said "1400 … is intentionally MORE than the invoice amount").
- Additive-only diffs (`@@ -N,3 +N,269 @@`, zero deletions) bound blast radius to new code paths but say
  nothing about the new path's correctness. Verify with `git diff origin/beta...HEAD -- <file>`.

## N+1 queries accepted at current scale (<5 users)

Not bugs, but do not let them become the copied pattern:

- `getAllMilestones`: per-row `countLinkedWorkItems` + `getCreatedByUser`
- `sourceReportService.getSourceReport` steps d/j: per-invoice deposit fetch + per-Rail-B-invoice vendor lookup (PR #1894 M1)

## CSS Modules: `:global(.x)` never matches another module's class (PR #1909, B1)

`client/webpack.config.cjs` hashes every module class (`localIdentName: '[local]_[hash:base64:5]'` prod /
`'[name]__[local]--[hash:base64:5]'` dev). So `sharedStyles.input` renders as `input_aB3xY`, and a rule like

```css
.container :global(.input) { ... }   /* DEAD -- matches a literal class "input" that never exists */
```

silently applies to nothing. It also trips stylelint's `selector-pseudo-class-no-unknown`, which is how it
surfaces (as a lint failure, masking the real defect). **The fix is always `composes:`** on a plain local
class — `composes: input from '../../styles/shared.module.css';` — then use the local class in the TSX.
That is a _different_ construct from `composes` used _inside_ a `:global` block, which is the separate,
genuinely-illegal form. `ReportContentEditor.module.css` (`composes: badge from '../Badge/Badge.module.css'`)
is the correct in-repo template.

Review heuristic: any `:global(` in a `*.module.css` referencing a class the component gets from a
`*.module.css` import is dead code. Grep for it. Corollary — CSS is untested under jsdom
(identity-obj-proxy), so a `.editedDot { opacity: 0 }` whose show-rule never matches passes a green suite
that only asserts DOM presence. Visibility assertions belong in E2E.

**The E2E guard shape that actually catches this** (`reportWizardEditableContent.spec.ts` Scenario 13, PR
#1909 round 2): resolve the token through a throwaway probe element in the page, then compare it to the
target's computed value — don't hardcode an rgb string (theme-fragile) and don't just assert "not
transparent" (passes on the page background).

```js
const probe = document.createElement('div');
probe.style.backgroundColor = 'var(--color-bg-tertiary)';
document.body.appendChild(probe);
const resolved = getComputedStyle(probe).backgroundColor; // compare against the real element
```

Ask for this whenever a CSS-Modules composition bug is the thing being fixed — it is falsifiable against a
real webpack build (class hashing included) and is the only test class that fails on dead CSS.

## Stylelint gates CI, and inline `style={{}}` escapes it

`npm run lint` = `eslint . && npm run stylelint`, and the CI `Static Analysis` job runs Stylelint as its own
step — a stylelint error is a hard beta-PR blocker. But `stylelint` only globs `client/src/**/*.css`, so
**inline `style={{ color: 'var(--nonexistent-token)' }}` in TSX is completely unchecked**. PR #1909 shipped
`var(--color-refund-text)`, a token defined nowhere; the declaration is invalid-at-computed-value and the
styling silently does nothing. When reviewing client code, grep every `var(--…)` appearing inside a `.tsx`
against `client/src/styles/tokens.css`, and push the value into a CSS Module class instead.

## Monetary units are major currency units (2 dp) everywhere in this repo — never cents

`allocatedAmount`, `allocatedPortion`, `totalAmount`, `invoiceAmount`, and everything `formatCurrency`
consumes are **euros, rounded to 2 dp**. There is a `toCents()` helper in `sourceReportService.ts` but it is
used only _inside_ a `toCents(x)/100` round-trip — it never escapes into a field.

PR #1916 (#1901) broke this across a new module seam: the service passed `inv.allocatedAmount` (euros) into
`GenerateReportContentLlmInvoice.amount`, and `prompts.ts` rendered `(inv.amount / 100).toFixed(2)` — every
figure in an AI-written bank cover letter came out **100× too small**. Root cause: the interface field had no
unit in its JSDoc. Coverage was 95.94% and green, because line coverage cannot catch a unit error — the only
test that catches it asserts the **rendered string** (`Total Amount: 12345.67 EUR`), and no test called
`buildReportContentUserPrompt` at all.

Same PR, second defect at the same spot: `Math.round(includedTotal)` (commented "round to nearest cent")
rounds to the nearest whole euro. Cent-rounding is `Math.round(x * 100) / 100`.

**Review rules that follow:**

- Any monetary value crossing a module boundary must carry its unit in the type's JSDoc.
- When a server path re-derives a total the client already derives, demand it mirror the client formula
  _shape_, not just its intent — `applyLineExclusions` rounds **per invoice** then `buildReportContent` sums
  the already-rounded values with no final round. A single trailing round is a different number.
- Grep new prompt builders for `/ 100`, `* 100`, and `toFixed(` — that is where unit assumptions hide.
- Better still: push shared derivations into `@cornerstone/shared` so there is one implementation
  (recommended as M2 on #1916; not yet done).
- When a total is exclusion-adjusted, the **per-item** figures handed to the same consumer must be adjusted
  too. #1916 shipped an adjusted total alongside raw per-invoice amounts — an LLM handed parts that do not
  sum to the stated whole. Check both halves whenever you see an exclusion filter.

Fixed in `b70d821b` (round 2 of the #1916 review); the permanent guard is the
`amount formatting (major units — regression guard for the ×100 division bug)` describe block in
`server/src/services/budgetExtraction/prompts.test.ts`, which asserts rendered substrings **and** negative
assertions against the divided form. Copy that shape for any new prompt builder.
