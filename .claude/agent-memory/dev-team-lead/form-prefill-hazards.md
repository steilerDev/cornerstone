---
name: form-prefill-hazards
description: Two spec hazards for modal forms seeded from an existing entity - AI/auto-fill "untouched" is not "empty", and touched-gated errors plus a disabled submit give a silent block
metadata:
  type: feedback
---

Two hazards surfaced in the #2107 review (converting a quotation into the final invoice). Pre-empt both in any spec where a form is seeded from an existing record and then auto-filled (AI, extraction, defaults).

1. **An untouched field is not the same as an empty one.** The spec said "AI sets a field if it is not touched, otherwise it becomes a SuggestionBadge". But the fields were seeded at open with the quotation's own notes and number. So the AI silently overwrote data the user had written. The E2E fixture even asserted the overwrite.
   **Rule:** fields seeded from persisted user data and non-empty at open are _protected_: AI values go to a suggestion. Only values the flow itself generated (defaults such as today's date, or the quoted amount as a starting point) may be overwritten.

2. **Touched-gated errors plus a disabled submit give a silent block.** Field errors were shown only after touch or submit, but Confirm was disabled whenever any error existed. So a record that is invalid at open (a stale due date earlier than the prefilled date of today) showed a disabled button with no reason, and submitting to reveal the error was impossible.
   **Rule:** any error that can exist in the initial state, or that another field causes (cross-field rules such as dueDate ≥ date), must show immediately. Alternatively, keep the submit button enabled and show the errors on the attempt.

**Why:** QA and the orchestrator found both only at review. Each cost a fix round across the frontend, QA and E2E.
**How to apply:** in `[MODE: spec]`, for any hook that seeds a form from an entity, list which fields are "protected" and state the visibility rule for each validation. In `[MODE: review]`, check the open() seed values against the validations.
