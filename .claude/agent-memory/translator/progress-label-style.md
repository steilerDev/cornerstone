---
name: progress-label-style
description: Two co-existing German phrasing patterns for "X-ing… (Ns)" progress labels — pick whichever sibling key is the closer analogue, not a blanket rule
metadata:
  type: project
---

`client/src/i18n/de/budget.json` has two different styles for progress/status strings with a
seconds counter or ellipsis:

1. **Active, elliptical, first-person-implied** — `autoItemize.analyzing`: `"Analysiere…
({{seconds}}s)"` (verb stem only, no subject, mirrors the English "Analyzing…" gerund tightly).
2. **Passive, subject-first** — `loadingPreview`: `"Vorschau wird erstellt…"`,
   `previewRegenerating`: `"Vorschau wird aktualisiert…"`, `extractingFromDocument`: `"Dokument
wird analysiert…"`.

Neither is "more correct" — the codebase uses both. When translating a new `"X-ing… ({{seconds}}s)"`
key, prefer whichever existing key is the closest sibling in shape (same component/flow, same
placeholder structure) over picking a pattern from a distant namespace.

**Why:** for `sourceReports.editable.generating` ("Generating… ({{seconds}}s)"), chose
`"Generiere… ({{seconds}}s)"` over a passive `"Wird generiert… ({{seconds}}s)"` because
`autoItemize.analyzing` is the closer analogue: same file, same `"X… ({{seconds}}s)"` placeholder
shape, same "in-progress with a live timer" UX pattern.

**How to apply:** before translating a new progress/loading label, grep the target de/*.json
for existing `"…({{seconds}}s)"` or bare `"…"` progress strings and match the nearest one by
shape and UX context, rather than defaulting to one style project-wide.
