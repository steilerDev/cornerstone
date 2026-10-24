---
name: relation-unlink-undo
description: #2236 relation-unlink Undo pattern (12 DELETE routes answer 200 { undo }); where snapshot/restore fns live
metadata:
  type: project
---

Each relation delete has `xWithSnapshot` (read+delete in one tx, returns `{ row }`) and `restoreDeletedX(tx: UndoTransaction, snapshot)` in the same service; routes call `issueRestoreToken` with `afterRestore: () => autoReschedule(db)` for schedule relations. Shared 200 schema: `server/src/routes/undoResponseSchema.ts`. Restore refusals are always `ConflictError` with `details.changed: [subject]`.

- Milestone link/dep restores and row-delete primitives live in `workItemMilestoneService.ts` (milestoneService imports them).
- Subsidy links go through `services/shared/subsidyServiceFactory.ts` (`unlinkWithSnapshot`, `restore`; config needs `subjectType`).
- Deposit restore: budget source/creator -> NULL if gone; refund restore re-checks the refund cap; budget-line restore re-checks the itemized sum.
- `@cornerstone/shared` resolves through `shared/dist`: run `npx tsc -p shared` after changing shared types or server tsc shows stale errors.
- Schedule-relation `*WithSnapshot` deletes do NOT reschedule; the route calls `autoRescheduleLogged(db, request.log)` (schedulingEngine.ts) after `issueRestoreToken`, so a reschedule failure is logged and the response is still `200 { undo }`.
- `invoiceDeposits.ts` has a `preHandler` that 404s when `:vendorId` (vendor-scoped twin prefix) does not own `:invoiceId`.
