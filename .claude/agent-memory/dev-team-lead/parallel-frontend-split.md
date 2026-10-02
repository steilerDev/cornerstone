---
name: parallel-frontend-split
description: How to split a wide client sweep (dozens of files) across parallel frontend-developer launches without collisions, and the error-message leak classes to inventory first
metadata:
  type: feedback
---

Splitting by directory alone is not enough. The `client/src/i18n/en/<ns>.json` files are shared hotspots, so give each en namespace file to exactly one group and assign each source file to the group that owns the namespaces it needs. Cross-group keys get a named adder plus exact key/text in the spec. Lint rules that the sweep makes passable land in a final sequential step (continue one group's agent); otherwise every parallel agent's `npm run lint` fails on the others' unfinished files.

**Why:** In the #2129/#2131/#2132 bundle (spec 2026-10-01), 48 client files across 3 agents all needed new keys in budget/common/settings JSON.

**How to apply:** For any i18n/error sweep, inventory every leak class before writing the spec, not just the one the issue names:

- `.error.message`
- `err instanceof Error ? err.message` (ApiClientError extends Error with the server text as its message)
- raw `body.error?.message` wrapped in `new Error` (photoApi XHR/fetch)
- message-sniffing (`err.message.includes('CODE')` is dead code)
- `ErrorCode` members with no errors.json key (these render title-cased)

Also grep for plain `CONFLICT` throws whose message carries page-specific meaning. See [[review-round-discipline]].
