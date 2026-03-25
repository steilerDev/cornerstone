---
name: Stylelint Configuration
description: Design token enforcement via stylelint - installed and configured
type: reference
---

## Stylelint Setup (Commit: 1d9986a)

Stylelint configured in `.stylelintrc.json` (project root) with design token enforcement.

### Versions

- stylelint: 16.13.0
- stylelint-config-standard: 37.0.0
- Installed as root workspace devDependencies (shared)

### Key Enforcement Rules

**1. color-no-hex** — Prevents hardcoded hex colors

- Catches: `color: #333`
- Enforce: Use `var(--color-*)` instead
- Disabled for: `tokens.css`, `docs/`

**2. function-disallowed-list** — Prevents raw color functions

- Catches: `rgb()`, `rgba()`, `hsl()`, `hsla()`
- Enforce: Use `var(--color-*)` instead
- Disabled for: `tokens.css`, `docs/`

**3. declaration-property-value-disallowed-list** — Prevents numeric font-weight/z-index

- Catches: `font-weight: 600` or `z-index: 50`
- Enforce: Use `var(--font-weight-*)` and `var(--z-index-*)` instead
- Disabled for: `tokens.css`, `docs/`

### npm Scripts

```bash
npm run stylelint                 # Check for violations
npm run stylelint:fix             # Auto-fix (limited rules only)
npx stylelint path/to/file.css    # Test specific file
```

### Expected Behavior

- **Badge.module.css**: Passes (fully tokenized)
- **DependencySentenceDisplay.module.css**: 2 violations (numeric font-weights)
- **print.css**: 5 violations (hardcoded hex colors)
- **tokens.css**: Passes (hex colors allowed in token definitions)
- **docs/**: Passes (has separate CSS conventions)

### Integration Notes

- Not yet integrated into CI (violations don't block builds)
- Ready for manual checks and future CI integration
- When migrating existing code, run `npm run stylelint` to identify violations
- Use `var()` references from `client/src/styles/tokens.css` for all values
