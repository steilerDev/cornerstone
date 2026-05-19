---
name: pr-1428-diary-draft-autosave
description: PR #1428 review findings for diary draft auto-save flow — CSS module gaps, Badge variant pattern, filter chip a11y
metadata:
  type: feedback
---

## PR #1428 Review Findings — Diary Draft Auto-Save

### Critical pattern: CSS module class definitions must accompany all new TSX markup

When a PR replaces UI markup (e.g. progress bars → photo queue cards), the CSS module must be updated in the same commit. CSS Modules silently returns `undefined` for missing class names — no compile error, no runtime error, just unstyled elements. Always cross-check every `styles.className` reference in new/modified TSX against the actual `.module.css` definitions.

Missing in this PR:

- `PhotoUpload.module.css` — 12+ new queue item classes missing; old progress classes still present (dead code)
- `DiaryPage.module.css` — `statusFilterChips`, `filterChip`, `filterChipActive` missing
- `DiaryEntryEditPage.module.css` — `autoSaveStatus` missing
- `DiaryEntryCreatePage.module.css` — `helper` missing

### Badge.module.css: global className strings do not resolve in CSS Modules

The `Badge` variant `className` prop is appended to `combinedClass` as a raw string. Because Badge.module.css uses CSS Modules local scoping, a class name like `'draft'` CANNOT match `.draft` in `Badge.module.css` — the module exports a hashed local identifier, not the bare string. Two resolution paths:

1. Pass `styles.draft` (from within Badge's own module) as the className — requires importing at Badge level
2. Use a globally-scoped CSS class (in index.css or a `:global(.draft)` block) — avoid this pattern

**Why:** This is a CSS Modules architecture concern that trips up teams new to the pattern. Every existing Badge variant (`.not_started`, `.completed`, etc.) is defined in Badge.module.css and the string keys happen to match because CSS Modules hashes the same class name consistently within the module.

**How to apply:** When a new Badge variant is added via `variants={{ x: { className: 'x' } }}`, verify `.x` exists in `Badge.module.css`. If a new domain variant is needed, add the rule to Badge.module.css with semantic tokens.

### Status filter chips: always require aria-pressed

Toggle-style `<button>` elements that control a filter state must have `aria-pressed`. `role="group"` + `aria-label` on the container is necessary but not sufficient. Pattern:

```tsx
<button aria-pressed={statusFilter === 'draft'} ...>Drafts</button>
```

**Why:** Screen readers announce "Drafts, pressed, button" vs "Drafts, button" — the only way for non-visual users to know the filter is active.

### Suggested draft badge tokens (for Badge.module.css)

```css
.draft {
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border-strong);
}
```

Neutral/muted treatment — distinguishes draft from status-colored badges without implying a status.

### Discard modal patterns (correct in this PR — document as reference)

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + Escape key trap + `useRef` focus trap
- Cancel button: `shared.btnSecondary`
- Confirm destructive action: `shared.btnConfirmDelete` (solid red)
- Trigger button (in form): `shared.btnDanger` (outline red — reversible-seeming action)
