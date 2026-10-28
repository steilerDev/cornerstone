---
name: tasks-list-adopter
description: Tasks list (#2245) ObjectList adopter specifics - hook split, bulk limits, focus after bulk, row refresh with server time groups
metadata:
  type: project
---

Tasks page = `pages/WorkItemsPage/` (tasksListUrl.ts, useTasksList.tsx, useTaskRows.tsx, useTaskActions.ts, TaskListFilters.tsx, TaskRowCommand.tsx, TaskBulkActions.tsx). Pattern follows Invoices ([[objectlist-adopter-patterns]]).

- `useTasksList` is `.tsx` (group badge JSX); config carries `listKey: 'workItems'` + `legacyColumnKeys` so old `table.workItems.columns` prefs carry over.
- ObjectList's bulk ctx exposes only `selected` and `clear` - a host cannot set the selection. After a partial bulk failure the selection stays as it was (succeeded rows included); skip rows already at the target on retry.
- Focus after a bulk success: request via a tick state + ref set, consumed in an effect after `clear()` (bar unmounts); target = first visible `a[data-testid^="tasks-title-"]` not in the acted set, else h1.
- Row refresh with `group=time`: if `hasMore` and a row's `timeWindow` changed, reload instead of patching (offset paging would skip a row).
- No `workItemEdit` route and no `?edit` param exist, so the row menu has Open (navigate with origin state), Reopen (done rows), Delete only.
- Dates column shows `barDates` (actual else forecast), matching what the server sorts/filters on.
