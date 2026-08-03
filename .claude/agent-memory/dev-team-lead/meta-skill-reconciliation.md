---
name: meta-skill-reconciliation
description: Patterns for auditing/fixing .claude/skills/*.md and CLAUDE.md itself (issue #1819) — gh CLI verification, orchestrator trailer convention, worktree cleanup sequence
metadata:
  type: project
---

## `gh project` board-status command

`gh project item-list <N> --owner <o> --query "..."` **does not exist** — `item-list` only takes
`--format/--jq/--limit/--owner/--template`, no `--query`. The correct idempotent pattern (proven
in ~16 real invocations during the 2026-07-06/07 batch-develop session, now the canonical form in
`develop`/`epic-start`/`release` SKILL.md files):

```bash
ITEM_ID=$(gh project item-add 4 --owner steilerDev --url https://github.com/steilerDev/cornerstone/issues/<n> --format json --jq '.id')
gh project item-edit --id "$ITEM_ID" --project-id PVT_kwHOAGtLQM4BOlve --field-id PVTSSF_lAHOAGtLQM4BOlvezg9P0yo --single-select-option-id <option-id>
```

`item-add` is idempotent — if the issue is already on the board it just returns the existing
item's ID, no duplicate is created. Always verify `gh <subcommand> --help` directly rather than
trusting a skill file's existing command — this bug shipped in 3 skills for a while.

## CLAUDE.md drifts fast — verify current state before trusting an issue body's claims

An issue describing a "defect" can predate a fix that already landed. On 2026-07-07 I found the
worktree-removal policy had **already flipped** (PR #1825, merged same day) and a Canonical Agent
Trailers table had **already been added** (PR #1818) — both assumed-stale by the issue I was
fixing. Always `grep`/`Read` the actual current file before writing the fix, don't just diff
against the issue's quoted snippets.

## Orchestrator-authored commits/PRs have no `Co-Authored-By` trailer

CLAUDE.md's Canonical Agent Trailers table lists the 11 named sub-agents only — no `orchestrator`
row. Per the Agent Attribution section ("use that agent's name in the trailer" — implying no
trailer when no agent contributed), orchestrator-only commits (e.g. a `.claude/checklists/`
lessons-learned update) should carry **no** Co-Authored-By line at all. For orchestrator-authored
**PR bodies** specifically (not git trailers), the established precedent — already used correctly
in `fix-e2e` and `dependabot` before this reconciliation — is a `🤖 Generated with [Claude
Code](https://claude.com/claude-code)` footer, not a fabricated `Co-Authored-By: Claude Opus 4.6`
line. Apply this precedent instead of inventing a new convention when you find a stale/fake
trailer.

## Worktree cleanup sequence (post-#1825 policy)

CLAUDE.md's Session Isolation section: remove the worktree **before** deleting the branch, both
from the _base_ repository, and force-delete (`-D` not `-d`) because this repo squash-merges to
`beta` — squash history fails `-d`'s ancestry check even for genuinely-merged branches. Capture
`CURRENT_BRANCH`/`WORKTREE_PATH` _before_ `cd`-ing to the base repo (`git worktree list
--porcelain | awk '/^worktree/{print $2; exit}'` finds the base repo path from any worktree). This
must be the session's last action — the cwd it started from no longer exists afterward. Any skill
that loops `/develop` as a sub-routine (`batch-develop`, `epic-run`, `release` step 4e) must
explicitly exclude this cleanup mid-loop, or the first loop iteration terminates the whole batch.

## Self-check gap: count _every_ occurrence a fix pattern gets applied

When a spec says "apply fix X to every skill that does Y," explicitly enumerate the file list
before writing the verification grep's expected count — I undercounted (said 3, actual was 4)
because I forgot my own spec item added a 4th occurrence (batch-develop's new Session Cleanup
step) beyond the 3 I was tracking from the original bug report's file list.
