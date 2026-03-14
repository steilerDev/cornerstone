# PR #732 Review Findings — Dashboard UAT Fixes (Issues #729, #730, #731)

## InvoicePipelineCard — `.itemLink` (Issue #731)

- PASS: `color: inherit; text-decoration: none; box-shadow: var(--shadow-focus)` on focus-visible — correct link-as-row pattern
- LOW: `.itemLink:hover` gives no affordance beyond cursor change — recommend adding `background-color: var(--color-bg-hover)` on the parent `.item:hover`
- Overdue badge correctly placed OUTSIDE `<Link>` to avoid polluting the link accessible name

## TimelineStatusCards — 3-card split (Issue #730)

- MEDIUM: `--color-warning-bg` does NOT exist in tokens.css. The `.badgeYellow` class in `TimelineStatusCards.module.css` uses it, rendering the Warning health badge with no background color. Fix: use `var(--color-hi-status-scheduled-bg)` / `var(--color-hi-status-scheduled-text)` (amber-100/amber-800, dark-mode-aware)
- INFO: Inline `style` props in CriticalPathCard and UpcomingMilestonesCard use CSS vars correctly (not hardcoded), but CSS Modules is the project convention — acceptable for a UAT fix PR
- PASS: `.link` class (primary color, hover underline, focus shadow) used consistently for milestone title links and critical path deadline links

## MiniGanttCard — Current week redesign (Issue #729)

- MEDIUM: `fill="white"` hardcoded on SVG bar title text (line ~288). SVG cannot use `var()` natively, but the existing `readCssVar` / `resolveColors()` pattern is established. Fix: add `barTextColor: readCssVar('--color-text-inverse')` to `resolveColors()` and use `fill={colors.barTextColor}`
- LOW: `fontSize="11"` on SVG header day labels and bar text — below `--font-size-xs` (12px). Acceptable at dashboard preview scale; informational only
- PASS: Today marker range guard (`if (x < 0 || x > CHART_WIDTH) return null`) — correct
- PASS: Dark mode — all bar/grid colors routed through `readCssVar()`, theme updates correctly
- PASS: `aria-label` updated to include "this week" phrasing
- INFO: `visibleDependencies` variable computed but never used (arrows removed) — dead code, lint will catch

## Recurring Pattern Notes

- `--color-warning-bg` does NOT exist — only `--color-warning` (orange-400/300). For warning bg, use `--color-hi-status-scheduled-bg` (amber-100 light / rgba amber dark)
- SVG text color: always use `readCssVar()` + `resolveColors()` pattern; never `fill="white"` directly
- Row-level links (`color: inherit`): must add hover affordance on parent container, not just cursor
