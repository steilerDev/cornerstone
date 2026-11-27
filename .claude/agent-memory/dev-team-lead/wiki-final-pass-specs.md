---
name: wiki-final-pass-specs
description: Hazards when speccing an epic-closing wiki/ADR finalization pass (EPIC-21 #2262) — stale counts, planned contracts never built, scanner false positives, anchor renames, detached wiki HEAD
metadata:
  type: feedback
---

An epic-end "wiki final" story looks S but is a multi-page audit; spec it with a concrete drift table.

**Why:** at #2262 the wiki still said 77/10/3 route stages (code 79/10/1: a later story served a page without updating Route Map), two API contracts stayed "Planned" though their stories merged (endpoints never built), ADR-039 and CLAUDE.md still described `PENDING_SURFACES` work after it was emptied.

**How to apply:**

- Recount route stages with `grep -c "stage: '<s>'" shared/src/routes/routeMap.ts`; compare against the last Deviation Log recount.
- For every "Planned" contract heading, grep `server/src/routes` for the endpoint; missing + story merged → "superseded by …" or escalate if an AC lacks it.
- Renaming a heading (e.g. "Planned contracts") breaks `#anchor` links in ADRs — grep wiki/CLAUDE.md/.claude/plan first.
- `scan-privacy.mjs --profile contact wiki/*.md` hits synthetic examples (`+1-555-…`, non-example.com emails, migration-number ranges, KiB sizes written as one big number); `--profile full` flags illustrative money in API examples that can't be distinguished — require contact-clean + no new figures + denylist run if a backup exists. Piping into `tail` hides the exit code.
- The synced wiki submodule sits on a detached HEAD equal to origin/master — commit on the detached HEAD and push with `git -C wiki push origin HEAD:master` (or first `git -C wiki checkout -B master origin/master`). A plain `checkout master` can land on a stale local master.
- Closing a story that leaves a route entry `planned` invites an owner decision to build it (#2262: auto-itemize redirect, D1) — present "build vs record" explicitly in the spec instead of documenting the gap as final.
- Style Guide is ux-designer-owned; when routed to the architect, restrict it to describing shipped code.
