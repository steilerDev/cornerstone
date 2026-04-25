---
name: Story #1354 — Source Attribution Badges and Per-Source Filter
description: Visual spec for budget source color palette, source badge in BudgetLineRow, and filter chip strip in Available Funds section
type: project
---

## Key Decisions

**Source color palette**: 10-slot deterministic palette (`colorIndex = sourceId % 10`). Slot 0 = Unassigned (gray). Slots 1–9 match calendar-item hue families plus cyan. No schema change required.

**New token family**: `--color-source-N-bg`, `--color-source-N-text`, `--color-source-N-dot` for N=0–9, with Layer 3 dark-mode overrides. Added to tokens.css Layer 2 / Layer 3.

**Token naming**: `-dot` suffix provides a higher-saturation swatch color for the circle dot indicator (distinct from `-bg` which is low-saturation for badge background).

**Color-blind affordance**: source name label always present alongside dot; name truncated at 20 chars (badge) / 24 chars (chip) with full name in `title` + `aria-label`.

**Badge extension**: Add `source0`–`source9` and `sourceUnassigned` CSS classes to `Badge.module.css`. Add optional `title` prop to `Badge.tsx`. No new component needed for the badge.

**BudgetSourceChip**: New shared component at `client/src/components/BudgetSourceChip/`. Renders as `<button>`. Uses scoped CSS custom properties (`--chip-bg`, `--chip-text`, `--chip-dot`) set as inline `style` on the element to allow static CSS classes to consume per-slot token values cleanly (avoids 10x `.chipSlotN.chipSelected` rules).

**ARIA pattern for chip strip**: `role="toolbar"` (NOT `role="radiogroup"` — multi-select semantics). Each chip: `role="button"` (native), `aria-pressed="true|false"`. Tab moves through all chips. Escape clears filter and focuses "Available Funds" expand button.

**Filter state**: URL query param `?sources=2,5,8` (comma-separated IDs). `BudgetOverviewPage` owns URL state, passes `selectedSourceIds: Set<number>` + `onSourceToggle` + `onClearFilters` props to `CostBreakdownTable`.

**Available Funds columns**: existing name+total columns gain `allocatedCost` and `remaining` columns. Selected source detail rows get left-border accent using `--chip-dot` scoped property on `<tr>`.

**Empty filter state**: use existing `EmptyState` component in a `<td colSpan={4}>` row. No icon variant (filtered, not "add first item").

**Mobile badge**: dot only (label hidden via CSS). Touch-and-hold shows `title` attribute. Dot uses `-dot` token (higher contrast than `-bg`).

**Mobile chip strip**: `flex-wrap: nowrap; overflow-x: auto`. Chips 44px min touch height on mobile.

**Animations**: row fade-in via `@keyframes fadeIn` + `var(--transition-normal)`. `prefers-reduced-motion: reduce` disables all animations. Chip transitions via `var(--transition-normal)`.

**Why**: Spec posted as comment on issue #1354. Architecture decision (deterministic vs. persisted color) flagged to product-architect.
