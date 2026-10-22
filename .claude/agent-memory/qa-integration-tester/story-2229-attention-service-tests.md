---
name: story-2229-attention-service-tests
description: Story #2229 attention service QA - fixture location, local jest workaround, engine quirks that shape fixtures, open defects
metadata:
  type: project
---

- Shared fixture `server/src/test/attentionFixture.ts` (T=2026-03-10, exact expected key lists); service, route-independent. `GET /api/attention` route tests use a small own seed because `ensureDailyReschedule` rewrites planned dates and `is_late`.
- Local run needs `NODE_OPTIONS="--max-old-space-size=6144 --experimental-vm-modules"` (shared package exports only `import`) plus a temp config that sets server ts-jest `target/lib ES2024` (AppError TS2554); delete it afterwards.
- Engine quirks: a late NOT-started successor needs negative lead/lag (else it is held up, never late); `autoReschedule` can never set `household_items.is_late = true` (maxES starts at today), so N10 red is unreachable through the route; session TTL must outlive `jest.setSystemTime` jumps; drizzle `db.transaction(cb)` runs immediately.
- Open defect pinned by a failing test: N2 group row `actions` is `['start','reschedule']`, spec says `[]`.
- Unreachable branches: `!request.user` guards in routes/attention.ts; attentionRules ruleRank fallback, `holdsUp ?? {}` and `holdsIds ?? []`; snooze sort comparator equal-key case.
