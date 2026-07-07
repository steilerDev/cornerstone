---
name: token-reference
description: Design token layering, common token-substitution mistakes, and token scale gaps to reference when writing specs or reviewing PRs
metadata:
  type: project
---

## Design System basics

- Token source: `client/src/styles/tokens.css` (3-layer: palette -> semantic -> dark mode)
- Shared classes: `client/src/styles/shared.module.css` (buttons, etc.)
- Style Guide wiki: `wiki/Style-Guide.md`
- Always reference Layer 2 semantic tokens (e.g. `var(--color-bg-primary)`) in CSS Modules
- Never use hardcoded hex values or Layer 1 palette tokens in `.module.css` files (dark-mode overrides included)

## Token scale gaps (no exact token exists — use nearest)

- `0.625rem` (10px) — no font-size token; nearest `var(--font-size-xs)` = 12px
- `2.5rem` (40px) — no font-size token; nearest `var(--font-size-4xl)` = 32px
- `1.75rem` (28px) — no token; between `--font-size-2xl` (24px) and `--font-size-3xl` (30px)

## Verified token values

- `--color-success-text-on-light` dark mode = `#6ee7b7` (emerald-300) — contrast ~5.2:1 on dark success bg — passes WCAG AA
- `--color-success-badge-bg`/`-text`: light = green-100/green-900 (#d1fae5/#065f46); dark = rgba(16,185,129,0.15)/emerald-200 (#a7f3d0) — both high contrast, same pairing as "Completed"/"Arrived" status badges
- `--color-warning-bg` EXISTS (`#fff7ed`, dark: `rgba(251,146,60,0.1)`) — use for warning banners
- `--spacing-xs` / `--spacing-sm` are NOT valid tokens — use `--spacing-1` through `--spacing-16`
- `--color-danger-text` = white (text ON danger bg) — NEVER use as border or text on `--color-danger-bg`; use `--color-danger-border` for border, `--color-danger-text-on-light` for red text on light bg
- Budget bar, Gantt, and milestone tokens already exist in tokens.css — check before specifying new domain-specific colors

## Stylelint-enforced literal bans (as of PR #1847 / Issue #1815)

- `.stylelintrc.json` `declaration-property-value-disallowed-list` bans raw integer `z-index` and `font-weight` values via regex — any `z-index: 8` or `font-weight: 600` in a `.module.css` fails CI (`Stylelint` step in `static-analysis` job, wired into `npm run lint`/`lint:fix`).
- Escape hatch for arbitrary component-internal values that don't belong in the shared z-scale: declare a local `--z-local: <value>;` custom property immediately before `z-index: var(--z-local);` in the same selector (see `PhotoMetadataSidepanel.module.css`). Use this instead of inventing a one-off global token nothing else will reuse.
- `--z-raised: 1` now exists to fill the gap below `--z-dropdown: 10` — use it (or `calc(var(--z-raised) + 1)` etc.) for "lift element above local unstacked siblings" instead of a raw `z-index: 1`/`2`.
- `tokens.css` itself is exempted from `color-no-hex`/`function-disallowed-list`/`declaration-property-value-disallowed-list` (and `color-function-alias-notation`) via a stylelintrc override — palette/raw values are expected there, only `.module.css` consumers must reference `var(--token)`.
- `print.css` (global, not a CSS Module) legitimately uses Layer-1 palette tokens (`--color-black`, `--color-gray-700`, etc.) directly rather than Layer-2 semantic tokens — print output is intentionally theme-invariant, so this is not a violation of the "Layer 2 only in `.module.css`" rule.

## New token families (PR #1847)

- `--color-photo-*` (9 tokens) — theme-invariant photo-viewer/annotator chrome, no dark override by design. See [photo-annotator-patterns.md](photo-annotator-patterns.md).
- `--color-tooltip-*` (7 tokens) — generic naming despite living in the Gantt-prefixed tokens.css section (only consumer today is `GanttTooltip`, but shared `Tooltip` component uses the same `--color-bg-inverse` surface and could adopt these later). Section comment says "GANTT TOOLTIP TOKENS" which is a minor mismatch vs. the generic names — flagged as a low-severity wiki/comment cleanup follow-up, not fixed yet.
- `--color-warning-badge-bg` — follows the existing `--color-{semantic}-badge-bg`/`-badge-text`/`-badge-bg-alt` scheme (`success`, `primary` already had entries).
- `--shadow-text-overlay` — text-shadow for legibility over image thumbnails (image-overlay exception pattern).

## Common token-substitution mistakes (recurring across PRs)

- `0.875rem` → `var(--font-size-sm)`; `0.75rem` → `var(--font-size-xs)`; `0.375rem` → `var(--radius-md)`
- Layer 1 palette token in dark mode override → use semantic `var(--color-primary)` instead
- `transition: opacity 0.15s ease` → `var(--transition-normal)`
- `--color-bg-tertiary` where spec calls `--color-bg-secondary` (tertiary = code blocks/inset)
- `var(--color-text-secondary)` where spec calls `--color-text-muted` (secondary is darker)
- `outline: 2px solid var(--color-primary)` on focus-visible → ALWAYS use `box-shadow: var(--shadow-focus)` (RECURRING BUG, flagged PRs #402, #414 and others)
- `secondaryButton:hover` with `var(--color-border)` background → should be `var(--color-bg-hover)`
- `z-index: 1000` → `var(--z-modal)`; `z-index: 10` → `var(--z-dropdown)`; `z-index: 1` on absolute overlays inside a card → `var(--z-dropdown)` (prevents stacking collisions between card overlays)
- Tablet breakpoint upper bound: `1023px` not `1024px` to avoid overlap with desktop
- Inline `style={{ backgroundColor: 'var(--token)' }}` bypasses stylelint — use a `data-level` attribute + CSS attribute selectors instead
- All buttons duplicated from shared.module.css → use `composes:` instead
