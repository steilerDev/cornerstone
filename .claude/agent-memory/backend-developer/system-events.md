---
name: system-events
description: System event writer, display rules R1/R2 and backfill migration 0047 (ADR-040, #2223) - where things live and the pitfalls hit
metadata:
  type: project
---

System events are `diary_entries` rows with `is_automatic = 1`, written only by `server/src/services/diaryAutoEventService.ts` (always on; `DIARY_AUTO_EVENTS` is gone, only `diaryAutoEventsWarning()` in `plugins/config.ts` names it).

- Writer functions take an `EventContext { userId, undoable }` (`SYSTEM_CONTEXT` default). `userId` goes to `created_by`; only `undoable` callers (PATCH status routes) take part in W3 retraction. Metadata is built in canonical key order (R2 compares the JSON text), `title` NULL, `body` ''.
- Deposit events: row subject is the invoice, `metadata.depositId` names the payment; the in-memory ledger key stays `invoice_status|invoice_deposit|<id>`.
- Read path: `systemEventDisplay.ts` (`listDisplayRows`) does R1/R2 in SQL; `listDiaryEntries` loads the page rows by id and re-orders to the display order.
- **Pitfall:** an aggregate window (`COUNT/MIN/MAX OVER`) with `ORDER BY` uses a running frame. For group totals use a separate `OVER (PARTITION BY ...)` without ORDER BY (the spec's single shared window was wrong).
- **Pitfall:** inside the R1 `EXISTS (... FROM milestones ...)` subquery an unqualified `created_at` binds to `milestones.created_at`; reference columns through drizzle column objects.
- Migration `0047_system_event_backfill.sql` is idempotent (scope predicate on missing `v` key) and uses TEMP tables; it was verified with a scratch script over synthetic rows for every template (run the SQL twice, compare snapshots).
- The Bash tool in this worktree refuses heredocs and `$var` paths in compound commands; write scratch scripts with the Write tool and run them with literal paths.
