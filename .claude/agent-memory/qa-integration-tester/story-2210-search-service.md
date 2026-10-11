---
name: story-2210-search-service
description: Story #2210 search service tests - migrated-DB clone trick, SQL fold() registration, perf headroom, equivalent mutants
metadata:
  type: project
---

- Service tests need `registerSqlFunctions(sqlite)` on the raw connection. Fast pattern: migrate once in `beforeAll`, `base.serialize()`, then `new Database(buffer)` per test (+ `foreign_keys = OFF` for loose fixtures; the serialized DB keeps FKs on).
- `searchDatabase` re-sorts merged rows in JS, so SQL `ORDER BY` tie-break mutants only die when ties exceed `limit` (test cuts a 4-way tie at limit 2).
- Perf (in-memory, local): 'er' ~105 ms, umlaut ~95 ms, no-match ~55 ms median vs 200 ms budget; headroom only ~2x on CI. Setup (migrate + seed) stays under 2.5 s.
- `invoice_budget_lines.work_item_budget_id` is UNIQUE, so a budget line cannot join multiple invoice lines (no duplicate rows from the orphan-parent join).
- Equivalent mutants: route `request.user` check (auth hook runs first, line 56 uncoverable), route `paperlessEnabled` guard, route type re-ordering (service reorders), `description IS NOT NULL` (NULL never matches).
- Route test cannot capture pino child-logger output via stdout spy; assert log contents at service level with an injected `log.warn`.
- Money/phone fixtures: use short dashed digits like `12-34-5`; `scan-privacy.mjs` stays clean.
