---
name: story-2218-areas-index
description: '#2218 Areas index (/areas): AreasIndexPage POM, test ids, seeding/cleanup pattern, traps found while writing the spec'
metadata:
  type: project
---

- POM `e2e/pages/AreasIndexPage.ts`, spec `e2e/tests/areas/areas-index.spec.ts` (19 tests/project). Ids: `areas-tree-row|toggle|handle|menu|cell-<col>|quiet-<areaId>-<id>`, `areas-new|filter|status`, delete dialog prefix `areas-delete-dialog` (blocked state: no confirm button, cancel reads "Close").
- Quiet row cells use id `quiet:<areaId>`; the drag handle only exists >= 768px (phone uses menu Move up/down).
- `testPrefix` is per worker+project, NOT per test: add a per-test tag to area names. Cleanup order: tasks/purchases, diary entries (photos), then areas (delete of an in-use area silently 409s in `deleteAreaViaApi`).
- DELETE /api/areas/:id is `200 {undo}` since #2218; Undo toast is `toast-undo` (`ToastRegion.undoViaButton`).
- Skeleton is `role=status aria-busy=true` (no class hook). Photo count = saved diary entries only.
- `?tab=areas` is still route-map `interim: 'page'` (page replaces to /areas); `/tags` is a live redirect to /areas.
