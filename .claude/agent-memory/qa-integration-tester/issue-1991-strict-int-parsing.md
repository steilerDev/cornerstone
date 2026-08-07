---
name: issue-1991-strict-int-parsing
description: config.ts loadConfig() parseStrictInteger test coverage — what's in scope vs pre-existing gaps
metadata:
  type: project
---

Issue #1991 tightened `parseStrictInteger` (`/^-?\d+$/` regex feeding `parseInt`) across all 8
numeric env vars in `server/src/plugins/config.ts` (`PORT`, `SESSION_DURATION`,
`PHOTO_MAX_FILE_SIZE_MB`, `DIARY_DRAFT_RETENTION_DAYS`, `BACKUP_RETENTION`,
`LLM_REQUEST_TIMEOUT_MS`, `LLM_MAX_TOKENS`, `AUTH_RATE_LIMIT_MAX`). Tests added in
`server/src/plugins/config.test.ts` under `describe('Issue #1991: Strict Integer Parsing')`,
purely additive (189 insertions, 0 deletions to the test file) — no pre-existing test needed
modification, confirming the change was behaviour-neutral as required by AC6.

**Coverage ceiling on this file is not 95% and that's correct, not a gap to chase.** Running just
this test file gives `config.ts` (the plugins one — there's a second, unrelated `routes/config.ts`
that also matches the coverage table's `config.ts` label, don't confuse the two rows) ~93.9%
statements. The diff for #1991 is exactly: the new `parseStrictInteger` helper + 8
`parseInt(...)` → `parseStrictInteger(...)` line swaps — nothing else. Those lines are ~100%
covered. The remaining uncovered lines (SECURE_COOKIES boolean branch, DIARY_AUTO_EVENTS boolean
branch, EXTERNAL_URL scheme/catch branches, BACKUP_DIR subdirectory check) are pre-existing,
untouched by the diff, and explicitly out of scope per the issue's own notes ("scoped to integer
variables... boolean/enum variables are out of scope"). Judge coverage against the diff, not the
whole file, when the file predates the story by a long margin.

**Two of the 8 in-scope variables had zero pre-existing range-check tests** despite being in
production since earlier stories: `SESSION_DURATION <= 0` and `PHOTO_MAX_FILE_SIZE_MB <= 0` (also
`BACKUP_RETENTION <= 0`, three total). Every other variable's ≤0/<0 branch already had a test
(`AUTH_RATE_LIMIT_MAX=0`, `DIARY_DRAFT_RETENTION_DAYS=-1`, `LLM_REQUEST_TIMEOUT_MS=0`,
`LLM_MAX_TOKENS=0`, `PORT=-1`/`65536`). Added the 3 missing ones since they're squarely on the
same call sites already under test and directly support AC3 ("range check preserved exactly") —
this is filling an adjacent pre-existing gap, not scope creep, because the diff review already put
me inside these exact functions.

Key test-writing trick used for the whitespace-input class (`' 20'`): interpolate the raw string
into the expected-message template literal instead of hand-typing the double space after `got:` —
avoids an easy-to-miss whitespace-counting bug in the assertion itself.

Coverage table gotcha (reconfirmed, see also [[test-patterns-reference]]): piping a `--coverage`
run through `| tail -100` truncates the *coverage table*, not just log noise — the `plugins/`
section sorts alphabetically before `routes/`, so it's cut off first. Use `grep -E "config\.ts|Tests:|Test Suites:"` on the raw output instead of `tail`.
