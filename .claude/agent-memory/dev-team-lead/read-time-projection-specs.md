---
name: read-time-projection-specs
description: Hazards when a spec moves a daily-changing derived value from persisted storage to a read-time projection (cache ETags, module mocks, stale-stored fallback, E2E mocks, client second sources)
metadata:
  type: feedback
---

#2199 moved the scheduler's "today floor" from persisted `work_items` dates to a read-time projection. Five hazards were not obvious from the contract:

1. **Caches keyed on `updated_at` go stale.** The CalDAV ETag hashed only `MAX(updated_at)`. Once the daily change stopped writing rows, the feed would be cached forever. Add the date (or a projection hash) to every such key. Grep `ETag|etag|updated_at` hashing.
2. **Adding exports to a module that a test mocks partially breaks the suite.** `timelineService.test.ts` mocks `schedulingEngine.js` with only `schedule`. Projection code placed in that module (chosen to avoid an import cycle with `autoReschedule`) makes the mock return undefined. Say so in the QA spec and plan the test rewrite.
3. **Define the "nothing moved" fallback against stored data, and the "moved" test against two runs on identical inputs.** Comparing projection to stored dates gives false Held-up flags whenever stored dates are stale. Inside a writer (autoReschedule), compute the projection _after_ persisting, in the same transaction, or unmoved items echo pre-update dates.
4. **New required fields on a shared timeline type need every E2E `/api/timeline` mock updated.** If the client switches its geometry reads to the new field, a stale mock renders no bars.
5. **Hunt for client-side second sources.** WorkItemDetailPage computed "Delayed by n days" from the browser's local date. Delete such computations in the same story.

**Why:** each one is invisible to the AC text, and several are invisible in Jest.
**How to apply:** for any "derived at read time instead of stored" spec, walk this list before writing the file table. Related: [[status-vocabulary-switch-specs]], [[review-round-discipline]]
