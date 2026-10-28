---
name: schedule-page-specs
description: Hazards found speccing EPIC-21 #2247 (Schedule: side panel, Reschedule preview, phone agenda) — Sheet already has a side variant, no breakpoint tokens, holds-up marker on a movement count, glossary bans "Gantt" as a label, parent useCreateContext clobbers the child's, StickyActionBar is viewport-pinned, server undo is status-only
metadata:
  type: feedback
---

Found while speccing #2247 (P5.3). None of these were visible in the AC text or the UX spec.

1. **A "new shared SidePanel" can be a helper beside `Modal/Sheet.tsx`.** `Sheet` already has `variant="side"` (full-height right panel) and `"bottom"`. A wrapper in `components/Modal/` (PascalCase dir, not `X/X.tsx`) is not a counted shared component, and reusing Sheet avoids a hand-rolled `role="dialog"` (`handRolledDialogs` baseline is 2). Only the docked, non-modal mode is new (`<aside>`).
2. **No breakpoint tokens.** CSS custom properties do not work in `@media`, and the Style Guide records that `tokens.css` has none. A UX "`--breakpoint-2xl` token" becomes a named JS media-query constant plus literal px.
3. **UX may put `data-figure="holds-up"` on a different count.** "Moves 4 tasks" (dates that change) is not "Holds up n" (`computeHoldsUp`, every unfinished successor). Marking it would fail the consistency test. Keep the marker on the computeHoldsUp sentence only.
4. **Glossary `doNotUse` covers labels the UX invents.** "Gantt" is banned as an en label (search alias only), so the phone toggle reads "Agenda | Chart". Grep glossary `doNotUse` for every new en value.
5. **`useCreateContext` registers on effect; a parent's effect runs after the child's.** A page-level call with undefined values clobbers `CalendarView`'s date. Render the registration in a small child component mounted only in the view that owns it.
6. **`StickyActionBar` is pinned to the viewport**, not to its container. Inside a panel or sheet, use the Sheet `footer` slot or a `position: sticky` row.
7. **Server undo tokens exist only for status columns** (`runUndoable` in `undoService.ts`). A date or duration change cannot get a server token. Undo is a client re-PATCH of the previous values, through `showUndoToast`.
8. **`Spinner` defaults to the English label "Loading".** Always pass `label={t(...)}`.
9. **Adding an export to an API module that `App.test.tsx` partially mocks** breaks the import. Put new calls in a new `lib/*Api.ts` file (`scheduleApi.ts`).

**How to apply:** any page story that adds a panel or sheet, a preview figure, a phone variant or new toolbar labels.

Related: [[detail-template-specs]], [[shell-popover-specs]], [[consistency-test-specs]], [[restructure-baseline-hazards]], [[tasks-list-specs]]
