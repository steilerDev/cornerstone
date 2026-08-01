# Design Token System (EPIC-12, Story 12.1, PR #121)

## Token File Location

`client/src/styles/tokens.css` — created in Story 12.1 (#116)

Imported as the first line of `client/src/styles/index.css`.

## 3-Layer Architecture

### Layer 1 — Palette (raw named scales)

Use `--color-{scale}-{shade}` format, e.g. `--color-blue-500: #3b82f6`

Scales available: gray (50–900), blue (100–800), red (50–700), green (50–900)

### Layer 2 — Semantic tokens (purpose-driven)

Always use semantic tokens in component CSS, not raw palette tokens.

Key groups:

- `--color-bg-{primary|secondary|tertiary|inverse|hover}` — backgrounds
- `--color-text-{primary|secondary|body|muted|subtle|inverse|placeholder|disabled}` — text
- `--color-border`, `--color-border-strong`, `--color-border-focus` — borders
- `--color-primary[-hover|-active|-text|-bg|-bg-hover|-badge-text]` — blue primary actions
- `--color-danger[-hover|-active|-text|-bg|-bg-strong|-border|-text-on-light|-input-border]` — red danger
- `--color-success[-hover|-bg|-border|-text-on-light|-badge-bg|-badge-bg-alt|-badge-text]` — green success
- `--color-sidebar-{bg|text|hover|active|focus-ring|separator}` — sidebar surface
- `--color-focus-ring[-subtle|-danger|-primary-alt]` — focus ring rgba values
- `--color-overlay[-light|-medium|-danger|-delete]` — modal backdrops
- `--color-status-{not-started|in-progress|completed|blocked}-{bg|text}` — work item status badges
- `--color-role-{admin|member}-{bg|text}` — user role badges
- `--color-user-{active|inactive}-{bg|text}` — user status badges
- `--shadow-{sm|md|lg|xl|xl-strong|2xl|inset-deep|kbd}` — box shadows
- `--shadow-focus[-subtle|-primary-alt]` — focus ring box-shadows
- `--spacing-{0–16}` — spacing scale in rem
- `--radius-{sm|md|lg|circle|full}` — border radius
- `--transition-{fast|normal|medium|slow}` — duration + easing
- `--transition-{input|button|button-border}` — multi-property transitions
- `--font-size-{xs|sm|base|lg|xl|2xl|3xl|4xl}` — font sizes
- `--z-{dropdown|overlay|sidebar|modal}` — z-index scale

### Layer 3 — Dark mode stubs

Commented-out `[data-theme="dark"]` block is present. Implement in Story 12.4.

## Usage in Components (Story 12.3 onwards)

Replace hardcoded hex values with semantic tokens:

```css
/* Before */
color: #111827;
background-color: #3b82f6;

/* After */
color: var(--color-text-primary);
background-color: var(--color-primary);
```

## Pre-existing Build Issue

`npm run build` (webpack) fails in the sandbox with an AJV `addKeywords` error in
`schema-utils` — this is a pre-existing environment issue unrelated to CSS changes.
All other quality gates (lint, format:check, typecheck, test) pass correctly.

## EPIC-12 Status (Stories 12.1 + 12.3 + 12.4 done — Layer 3 stub above is superseded)

Story 12.1 (PR #121): tokens.css created with palette + semantic + shadow + spacing + radius + transition tokens.
Story 12.3 (PR #123): ALL 24 CSS module files fully migrated — zero hardcoded hex/rgba remain.
Story 12.4 (PR #124): Dark mode via `[data-theme="dark"]` in tokens.css + ThemeContext + ThemeToggle in sidebar.

**Key semantic tokens:** `--color-bg-{primary|secondary|tertiary|inverse}`, `--color-text-{primary|secondary|muted|subtle|placeholder}`, `--color-border`, `--color-border-strong`, `--color-primary/hover/active`, `--color-danger/hover/active`, `--color-success`, `--color-overlay`, `--shadow-{sm|md|lg|xl|focus|focus-subtle}`

**Component tokens:** `--color-sidebar-{bg|text|hover|active|focus-ring|separator}`, `--color-status-{not-started|in-progress|completed|blocked}-{bg|text}`, `--color-role-{admin|member}-{bg|text}`, `--color-user-{active|inactive}-{bg|text}`

**Verification command:** `grep -rn '#[0-9a-fA-F]' client/src --include="*.module.css"` must return ZERO results.

## Design Token Conventions (after EPIC-12 refinement, PR #126)

- `--color-success-text` token exists (= white in both light+dark) — use on green success buttons
- Edit/cancel button hover: use `--color-bg-tertiary` (NOT `--color-border`)
- Primary buttons: default = `--color-primary` (blue-500), hover = `--color-primary-hover` (blue-600)
- Dark Palette in Layer 1: slate scale (`--color-slate-{50..900}`), `--color-blue-300`, `--color-red-300`, emerald scale (`--color-emerald-{200|300|400}`)
- `[data-theme="dark"]` block has ZERO raw hex values — all use `var(--color-slate-*)` etc.
- Verify: look for hex in dark block with `grep -A200 "\[data-theme='dark'\]" tokens.css | grep '#[0-9a-fA-F]'` — must return ZERO

## ThemeContext (Story 12.4, PR #124)

- `client/src/contexts/ThemeContext.tsx` — ThemeProvider + useTheme hook
- ThemePreference: `'light' | 'dark' | 'system'`; ResolvedTheme: `'light' | 'dark'`
- Stored in `localStorage` under key `'theme'`; resolved against `window.matchMedia('(prefers-color-scheme: dark)')`
- Sets `document.documentElement.dataset.theme` — picked up by `[data-theme="dark"]` in tokens.css
- ThemeToggle component: `client/src/components/ThemeToggle/ThemeToggle.tsx` — cycles Light→Dark→System
- Provider order in App.tsx: `<BrowserRouter><ThemeProvider><AuthProvider>...</AuthProvider></ThemeProvider></BrowserRouter>`

## Dark Mode Form Inputs (UAT fix, fix/dark-mode-inputs)

Global reset in `index.css`: `input,textarea,select,button { background-color: transparent }`. Every CSS module MUST have explicit `background-color: var(--color-bg-primary)` on those elements. `ThemeContext` sets `document.documentElement.style.colorScheme = resolvedTheme` for native widget theming.
