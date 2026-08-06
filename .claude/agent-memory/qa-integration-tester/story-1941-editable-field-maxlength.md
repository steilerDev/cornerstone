---
name: story-1941-editable-field-maxlength
description: EditableField maxLength/counter/sr-only-hint tests (#1941) — jsdom clamping finding, metaRow gating spacing regression (test-was-right-not-stale), ariaDescribedBy id-count technique
metadata:
  type: project
---

Issue #1941 rev 2 — "Report wizard: editable override fields have no length limit." Added tests to
`client/src/components/EditableField/EditableField.test.tsx` (47 tests, 100% stmt/branch/func/line
on EditableField.tsx) and `client/src/components/reports/ReportContentEditor.test.tsx` (+10 tests,
111 total, 100% on ReportContentEditor.tsx).

**Empirical finding (verified via a throwaway probe test, not assumed):** jsdom does NOT clamp a
controlled `<input>`/`<textarea>`'s rendered `.value` against its `maxlength` attribute on mount
(a 250-char value with `maxLength={200}` renders in full), and `fireEvent.change` does not simulate
keystroke-level maxlength enforcement either (`onChange` receives the full over-limit string) — this
is real-browser behavior too, not a jsdom gap: only `userEvent.type` (real keystroke simulation)
would respect it; `fireEvent.change` sets `target.value` directly and always bypasses it. So AC1's
test asserts native attribute *presence* (`toHaveAttribute('maxlength', '10')`) and documents the
fireEvent.change bypass explicitly, rather than asserting truncation that would never happen at this
call site.

**CORRECTED (round 2) — the #1932 test breaking was a real production bug, not a stale test.** My
first pass updated the #1932-era structural assertion (`resetButton.parentElement === outerContainer`)
to match production wrapping the reset button in `.metaRow` unconditionally whenever `isEdited` was
true (even with no `maxLength` set). That was the wrong call. The reviewer traced it further:
`.metaRow` carried `margin-top: var(--spacing-1)` (4px) *stacked on top of* `.container`'s flex
`gap: var(--spacing-2)` (8px) — flex gap and a child's own margin are additive, not merged — so the
ordinary case (a field edited but nowhere near its `maxLength`) silently gained 12px where #1932 had
shipped and design-approved 8px. A 50% spacing regression to chrome nobody meant to touch. Production
was fixed to gate `.metaRow` on `showCounter` alone (only true within 10% of `maxLength`), restoring
the #1932 test's ORIGINAL assertion as correct (I reverted my edit) and requiring a **new companion
test** for the shape that previously had zero DOM-shape coverage: reset button + counter both nested
inside `.metaRow` when `showCounter` is true (see `'#1941 .metaRow gating: showCounter alone
controls...'` describe block). **Lesson (the one that actually matters): when a new wrapper element
breaks an unrelated structural assertion elsewhere in the file, treat that failure as a signal to ask
whether the wrapper belongs there in that case — not just to update the assertion to match whatever
production currently does.** A failing pre-existing test can be carrying real information about a
design decision (here: #1932's approved 8px gap) that the new change silently violated. Don't
"fix the test" reflexively; verify the production behavior is actually intended first — grep/read the
CSS being newly applied (spacing, layout) for the specific case the broken test exercises, not just
the new feature's own happy path.

**ariaDescribedBy id-count technique:** `EditableField`'s `ariaDescribedBy` is
`[editedHintId?, limitHintId?, limitLiveId?].filter(Boolean).join(' ')`. Exactly 4 reachable
combinations exist (editedHintId is gated on `isEdited && label`; limitHintId+limitLiveId are gated
together on `hasMaxLength`, never independently): 0 ids (dense mode, no maxLength — or labelled,
not edited, no maxLength), 1 id (labelled+edited, no maxLength → editedHintId alone), 2 ids
(maxLength set, not edited → limitHintId+limitLiveId), 3 ids (labelled+edited+maxLength → all
three, in that fixed order). Asserted the 2- and 3-id cases with an exact string match on the full
`aria-describedby` value (not just `.toContain`) to pin ordering too.

**PO ruling regression covered:** dense mode (`label` absent) must never render `editedHintId`, even
when `maxLength` is also set on the same field — `isEdited && label` is a single combined gate, and
a future "fix" adding an independent `hasMaxLength`-driven edited-hint would double up. Test paired
with a positive control (identical `isEdited={true}` condition, labelled mode) proving the negative
isn't vacuous.

See also [[test-infra-reference]] for identity-obj-proxy CSS module conventions used throughout
(`styles.counter` etc. resolve to literal class name strings via `moduleNameMapper` in
`jest.config.ts`).
