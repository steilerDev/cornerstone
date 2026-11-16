---
name: keyboard-registry-specs
description: Hazards found speccing EPIC-21 #2253 (keyboard registry, help overlay, g sequences, WCAG 2.1.4 off switch) — overlay rendered in 5 places, sample reserved keys in tests, `to` in go-to tables, doc-only registry rows, generic aria-label on kbd
metadata:
  type: feedback
---

Found speccing #2253 (P5.9). The issue said S. The PO's off switch plus consolidating the overlay into one made it M.

1. **"Rendered once by the shell" touches more than the pages named.** `KeyboardShortcutsHelp` lived in UserMenu, MoreSheet and 3 detail pages, and `useUserMenuModel.shortcutsSnapshot` fed two of them. Grep every render site of an overlay before scoping "pages stop rendering it".
2. **Reserving keys breaks the existing tests' sample data.** Registry and overlay tests used `?` and `/` as arbitrary page keys. Once the registry throws on them, QA has to change the sample keys. List these suites in the QA spec.
3. **Go-to/destination tables must avoid a `to` property** (baseline counts array-literal objects with `to` as destinations). Name it `route`.
4. **Shortcuts handled outside the registry (⌘K capture listener, ⌘Z in ToastContext above AppShell) get documentation-only rows.** The shell host registers them with no-op handlers so the overlay renders only the snapshot, with a fixed display order (registration order is effect order, child-first).
5. **Derive "single-key" (WCAG 2.1.4) from the key string**, i.e. every space-separated part is one character, instead of a hand list. That keeps Delete/Escape/chords on automatically.
6. **`aria-label` on `<kbd>` (role-less) is not reliably announced.** Spec `aria-hidden` symbol + srOnly name instead and flag it to UX.
7. **Keep the existing explicit focus-return in menu openers** (focus trigger in onClose) when moving an overlay into a provider. E2E already proves that path; Modal's restore alone is unproven for menu openers whose item unmounts.
8. **Runtime guards in shared registries: drop + `console.error`, never throw.** The architect overruled my "throw on reserved key" spec: a throw in a render/effect path sends the whole page to the error boundary for one bad key. Spec the drop-and-log form up front for any registry/allow-list guard.
9. **User docs re-derive grouping by intuition.** docs-writer listed `/` under "On this page" for list pages although pages may no longer register `/` (it is a shell global). Check docs tables of "where X appears" against the group each key is actually registered under.
10. **Capmap notes can already claim the story's behaviour** (WRK-069 "? works everywhere" before any global `?` existed). Treat capmap notes as claims to verify, not as state.
11. **prettier --write your own memory files after every edit, before commit** — CI's format:check covers .claude/.

Related: [[nav-shell-specs]], [[shell-popover-specs]], [[restructure-baseline-hazards]], [[ux-visual-spec-verification]]
