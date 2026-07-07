---
name: issue-1811-fastify-error-code-mapping
description: Test pattern for FST_* internal Fastify error codes mapped to ErrorCode enum in errorHandler.ts; realistic vs synthetic error injection choice
metadata:
  type: project
---

Issue #1811 fixed two non-enum error-code leaks: davTokens.ts hand-rolled `DAV_TOKEN_NOT_FOUND`
(now `NotFoundError` → `NOT_FOUND`), and `errorHandler.ts`'s Fastify-internal-error branch which
passed `error.code` (raw `FST_*` strings) straight through instead of mapping to `ErrorCode` enum
members.

**Test pattern for FST_* mapping** (`server/src/plugins/errorHandler.test.ts`, new describe
`'Fastify internal error code mapping'`): mix realistic and synthetic error injection based on how
cheaply the real Fastify code path can be triggered via `app.inject()`:
- **Realistic** (register a real route, trigger the actual Fastify internal parser error):
  `FST_ERR_CTP_BODY_TOO_LARGE` via POST with `'x'.repeat(2*1024*1024)` payload against the default
  1MB `bodyLimit` (no override in `app.ts`) → 413; `FST_ERR_CTP_INVALID_JSON_BODY` via malformed
  `'{not valid json'` body → 400; `FST_ERR_CTP_EMPTY_JSON_BODY` via empty string body with
  `content-type: application/json` → 400. All three fire from the exact same throwaway route
  (`app.post('/test/echo-body', ...)`) — content-type parsing runs before the handler, so a single
  generic echo route covers all three body-parsing error codes.
- **Synthetic** (throw a hand-built `Error & { code, statusCode }` from a test route): used for
  codes that are impractical to trigger for real in a unit test — `FST_REQ_FILE_TOO_LARGE` (would
  require a full multipart harness; already covered for photos elsewhere), and all the
  fallback-path scenarios (unmapped code + <500 → `VALIDATION_ERROR`, unmapped code + >=500 →
  `INTERNAL_ERROR`, no `code` at all + `statusCode` present → `VALIDATION_ERROR` fallback, not
  `undefined`/`REQUEST_ERROR`).

**TOCTOU branch not independently testable — don't force it.** `davTokens.ts`'s `/profile` route
does two sequential synchronous `better-sqlite3` `.get()` calls with no `await` between them
(`getTokenStatus()` then a raw `db.select().from(users)...get()`), both reading the same
`davToken` column. The second `if (!user || !user.davToken)` branch is only reachable if the row
changes between the two calls — impossible via normal request flow since better-sqlite3 is
synchronous and there's no yield point. Per the spec's own guidance, this branch is not worth an
artificial DB-mocking test; a coverage-report check is sufficient (confirmed via
`--coverage` — the branch shows as uncovered but it's spec-acknowledged as unreachable through
normal flow, not a real gap).

**Coverage result**: `errorHandler.ts` after the fix — 100% statements/functions/lines, 96.15%
branch. The one uncovered branch (line 39, `error.statusCode >= 500 ? 'error' : 'warn'` inside the
pre-existing `AppError` handling block) is *not* part of this issue's new code (the
`mapFastifyErrorCode` function and its call site are 100% covered) — it's a pre-existing gap
(no test throws an `AppError` with `statusCode >= 500`, e.g. a hypothetical 500-level AppError).
Left as-is since it's out of scope for #1811; flag if a future story touches that branch.

See [test-patterns-reference.md](test-patterns-reference.md) for general Jest/Fastify infra notes.
