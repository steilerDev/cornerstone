---
name: server-search-picker-specs
description: Hazards when converting capped option lists (fetchX pageSize 100) to server-searching SearchPicker choosers and DataTable entity filters
metadata:
  type: project
---

Lessons from the companies-beyond-100 fix (EPIC-21, 2026-10-15). Verify each against current code before relying on it.

- **SearchPicker gaps found then**: it debounced but did not abort and had no stale-response guard. A normal selection unmounted the focused input/option, so focus went to `<body>`. Only the create path focused "Clear selection", and the special-option branch's clear button had no ref. Check whether these are fixed before you spec another picker.
- **DataTable entity filter**: `filterType: 'entity'` (EntityFilter) existed with no consumer. The DataTableHeader outside-mousedown handler closes the popover on a click into SearchPicker's portaled `[data-search-picker-dropdown]`, so the selection is lost. Escape with focus inside the popover drops focus to body. Its `initialTitle` must come from the page (resolve the id from the URL).
- **Enum filters vs server `eq`**: EnumFilter is multi-select (`a,b`), but several list endpoints filter one id with `eq`. Grep the service before keeping enum for an id filter.
- **Preselected ids**: resolve the name by id (`fetchVendor`), cache picks via `onSelectItem`, and never disable a picker while resolving an id the picker itself just set: a disabled focused control drops focus.
- **Create row inside hand-rolled dialogs**: a document-level Escape listener on a hand-rolled dialog closes it under the stacked company form. Give such hosts no create row.
- **Baseline check without editing**: copy `client/src` to a scratch dir and prepend the planned imports with sed. Then run `auditClient()` from `plan/restructure/scripts/build-baseline.mjs` on both trees and diff. Pickers (`*Picker*.tsx`, `components/SearchPicker/`) are excluded from `searchFields`, and closures follow `import type` too.

**Why:** these cost a round of review or E2E when missed; the brief often lists only some of the sites (the companies brief missed AssignmentPicker, the auto-itemize name match, InvoicesPage's filter and a dead DiaryEntryDetailPage fetch).
**How to apply:** for any "list capped at N" fix, grep every `pageSize: N` caller, plus name-matching code that reads the capped list. See [[infinite-scroll-consumer-hazards]] and [[form-prefill-hazards]].
