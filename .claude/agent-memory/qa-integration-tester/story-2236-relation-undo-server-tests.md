---
name: story-2236-relation-undo-server-tests
description: Story #2236 server QA for the 12 relation-unlink Undo routes - table-driven real-flow file, per-file coverage merge recipe, dead branches, sandbox traps
metadata:
  type: project
---

`server/src/routes/relationUnlink.undo.test.ts` covers all 12 `DELETE ... -> 200 { undo }` routes with one `ROUTES` case table (`rows()`, `url`, `subject`, `conflict()`, optional `schedule.read/stale`) driven by `describe.each`. Service-level restore branches live in each service's own test file.

- **Reschedule proof (rows 1-6)**: set up a dated chain so `autoReschedule` pushes the driven item, delete, `stale()` the date, undo, assert the date is back; the same case on 409 and expired-token must leave the stale date (afterRestore must not run). Milestone link rows use contributor A (end 03-20) -> milestone -> dependent B.
- **Per-file coverage merge**: whole-suite coverage runs get SIGKILLed or time out here (other agents run jest in the same sandbox) and `--workerIdleMemoryLimit` makes route suites "fail to run". Run each test file as its own jest invocation with `--coverageReporters=json`, then merge with `istanbul-lib-coverage` (from the jest node_modules). Never `pkill -f jest`: it kills other agents' runs; kill only your own PIDs.
- **Route `request.user` guards stay** (architect rule); cover them in `routes/relationRoutes.guard.test.ts`: bare Fastify + config, db, errorHandler, `decorateRequest('user', null)`, the route plugin. Use object rows in `it.each` — an array row shorter than the callback's arity makes jest pass `done` and the test times out.
- **Reschedule lives in the routes** (`autoRescheduleLogged` after `issueRestoreToken`); to force a failure in the real app, `app.db.$client.exec('DROP TABLE household_item_deps')` (or `work_item_dependencies` for the household-dep route), and capture `request.log.error` by spying `app.log.child` and wrapping the child's `error`.
- `schedulingEngine.ts` whole-file branches sit near 95% (95.2% after `schedulingEngine.edgeCases.test.ts`); remaining gaps are defensive (`household_item_deps.predecessor_type` has a CHECK constraint, cascade edge filter, `current` lookups).
- **Quirks pinned**: `updateMilestone({ isCompleted: undefined })` sets isCompleted=false but leaves completedAt (`?? false`); the household-item status floor in autoReschedule never shows because the ES walk starts at today.
- A first-run `beforeEach` hook timeout (buildApp + scrypt) shows up only under heavy sandbox load; not a defect.
