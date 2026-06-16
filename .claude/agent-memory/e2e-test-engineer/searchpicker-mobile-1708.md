---
name: searchpicker-mobile-1708
description: SearchPicker mobile anchor regression test details for Issue #1708 — rAF position-tracking fix
metadata:
  type: project
---

# SearchPicker Mobile Anchor Regression (Issue #1708)

**Fix:** `SearchPicker.tsx` now runs a `requestAnimationFrame` loop while the dropdown is open to call `updateDropdownRect()` (syncs `position:fixed` dropdown with input's `getBoundingClientRect()`) and `closeIfOutOfView()` (closes if input scrolls off screen). Replaces the prior scroll/resize listeners which missed momentum-scroll frames on mobile WebKit.

**Test surface used:** `WorkItemCreate` page (`/project/work-items/new`) — AreaPicker (`SearchPicker<TreeNode>`) with `showItemsOnFocus={true}`.

**Why WorkItemCreate:** Easiest real-data surface. AreaPicker is on a full page (not a modal), uses `showItemsOnFocus=true` so no search text needed, and `createAreaViaApi` / `deleteAreaViaApi` are in `apiHelpers.ts`.

**Assertion pattern:**
```ts
const inputBottom = inputBox!.y + inputBox!.height;
const anchorDistance = Math.abs(dropdownBox!.y - inputBottom);
expect(anchorDistance).toBeLessThan(20);
```
Tolerance 20px accommodates: the 4px gap the component adds, sub-pixel rounding, and the flip-above path (when space below viewport < 308px, dropdown appears ABOVE input — both positions are adjacent, so `Math.abs` handles both).

**Mobile-only skip:** `viewportWidth > MOBILE_MAX_WIDTH (499)` → `test.skip()`. iPhone 13 width = 390px (passes). iPad (gen 7) = ~810px (skips on tablet project). Desktop = 1920px (skips).

**Why Scenario 2 is skipped:** The anti-clipping portal behavior (dropdown portals to `document.body`, bypassing `overflow:hidden` on the modal) is already unit-tested in `SearchPicker.test.tsx` → "dropdown is portalled to document.body". The candidate modal surfaces (MassMoveModal, InvoicePaperlessPickerModal, PhotoMetadataModal) all require complex setup that would slow the smoke suite without adding meaningful regression value.

**diary-list Scenario 9 failure (run 27579727461 shard 3):** `page.unroute: Target page, context or browser has been closed` — a cleanup-race where `page.unroute()` in a `finally` block fires after the page is already torn down. This is a pre-existing test hygiene issue in `diary-list.spec.ts`, not related to the current work.
