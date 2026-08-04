---
name: auth-rate-limits-1970
description: Story #1970 (configurable auth rate limits) and the two-round PR #1989 review — rulings, filed follow-ups, and the AC-assertion gap that keeps it out of Done
metadata:
  type: project
---

# #1970 — configurable login rate limits (`AUTH_RATE_LIMIT_MAX` / `_WINDOW`)

Standalone story, no parent epic. Should Have. Filed 2026-08-03 out of the PR #1959 ruling
sweep. Implemented in PR #1989 (`feat/1970-auth-rate-limits-configurable`).

**Why it exists:** self-hosted households behind one NAT share a rate-limit bucket, so
legitimate family retries can lock out login; internet-exposed instances want the opposite.
20/15min was hardcoded at `auth.ts:139`. The old security-hygiene home (#315) is CLOSED.

## Review round 1 (2026-08-03) — CHANGES_REQUIRED

6 of 7 ACs met. Blocking: `AUTH_RATE_LIMIT_WINDOW=0s` passed validation — `max` rejected
`<= 0`, the window was pattern-matched with no bound on the resulting duration. Defeated AC2
("does not silently disable the limit") and AC7 ("no value that removes the limit entirely").
Medium (M1): nothing proved the *window* reached the route.

Rulings made in round 1:

- **AC5** ("documented in CLAUDE.md **and** on the docs site — file a request if needed") is
  satisfiable by filing the request → **#1990** (docs-writer, Todo, blocked-by #1970). Must
  cross-reference `TRUST_PROXY`: it decides whether the bucket keys on the real client IP or
  the proxy's, and the NAT operator needs both settings together.
- **AC6** (setup route stays hardcoded) ACCEPTED. The store is in-memory, so a restart clears
  the bootstrap limiter, and `/setup` 403s unconditionally once setup is complete — tuning it
  has no operational value. Rationale comment at `auth.ts:76-78`.
- **`parseInt` leniency** ruled house convention, out of scope for this story.

## Review round 2 (`47ee190`, 2026-08-04) — APPROVED with one MUST FIX

**B1 resolved.** `config.ts:371-375` adds `else if (parseFloat(str) <= 0)`, rejecting `0s`,
`0 minutes`, `0.0h`, `00 minutes` with a message naming the variable (3 tests in
`config.test.ts:1093-1109`). The pattern also changed `\s*` → ` *` (`config.ts:365`), which
closes the second instance of the same drift class: `15\tminutes` no longer validates.

**My round-1 mechanism was wrong** — see [pr-review-patterns.md](pr-review-patterns.md)
§"Configurable security controls". I claimed silent disable via `LocalStore.incr`; the verified
behaviour (product-architect, against `node_modules`) is `parse('0s') → undefined` →
`mergeParams()`'s `if/else if` never reaches `defaultTimeWindow` → **every login 500s** on
`params.timeWindow is not a function`. Do not cite my round-1 comment as the mechanism.

**M1 still open (MUST FIX before merge).** The new assertions are on `x-ratelimit-limit`
(`'3'`, `'20'`), which is fed by `max` only. Deleting `timeWindow` from `auth.ts:147` inherits
the global `'1 minute'` and leaves both assertions green — exactly the drift AC1 and AC4 were
written to catch. Fix is one line on the default-config test:
`expect(response.headers['x-ratelimit-reset']).toBe('900')` (`Math.ceil(ttl/1000)`,
`index.js:265`; emitted on non-exceeded responses too).

**Gate ruling: merge is a code gate, Done is an acceptance gate.** The PR may merge on B1;
#1970 does **not** go to Done until the window assertion lands. If it merges without,
**reopen #1970** rather than filing a follow-up (same precedent as #1931).

## Follow-ups filed from this review

| Issue | Kind | Status | Substance |
| --- | --- | --- | --- |
| **#1990** | user-story, Should Have | Todo | Docs-site rate-limit copy (docs-writer), must cross-reference `TRUST_PROXY` |
| **#1991** | tech-debt, Could Have | Backlog | Uniform integer parsing across the 8 `parseInt` sites in `loadConfig()` — the tracked home for the leniency ruling |
| **#1992** | documentation, Should Have | Todo | Wiki documents a nonexistent `OIDC_REDIRECT_URI` and a four-variable OIDC gate; `config.ts:142` gates on three |

**#1991 rationale:** the ruling stays "out of scope for #1970", but `product-architect`
(Medium) and `security-engineer` (Low) both raised it independently, so a review comment alone
guarantees a fourth reviewer raises it again. A local `/^\d+$/` guard on one variable would
leave seven inconsistent siblings. Same shape as the #1950 ruling.

**#1992 rationale:** the architect's wiki commit `5c1c7e71` flagged the deviation in the
API-Contract Deviation Log as an explicit unresolved follow-up but nothing tracked it. Verified
real. `CLAUDE.md` and the docs site are already correct → wiki-only fix (2 pages), owned by
product-architect.

Wiki MEDIUM from round 1 resolved: submodule bumped to `5c1c7e71`, verified on `origin/master`;
both auth tables carry the new rows, `TRUST_PROXY` backfilled, plus a "Rate Limiting (Auth)"
subsection.

`gh pr review --approve` refused again ("Can not approve your own pull request") — verdict
posted via `gh pr comment` with an explicit `## Verdict:` line.
