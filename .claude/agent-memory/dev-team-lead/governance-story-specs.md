---
name: governance-story-specs
description: How to decompose governance/tooling stories (plan/, .claude/, .github/, CLAUDE.md, scripts) that the file-ownership table does not cover; privacy-scanner and CI-check design hazards
metadata:
  type: feedback
---

Governance stories touch files no implementing agent owns by default. Assignment that worked for #2191 (EPIC-21 P0.0):

- `product-architect` — CLAUDE.md, `.claude/agents|skills|workflows|checklists|templates`, wiki, curated data/maps.
- `backend-developer` — `scripts/`, builder scripts, `.github/workflows/`, root configs (`.gitignore`, `eslint.config.js`, `package.json`).
- `qa-integration-tester` — `*.test.mjs` + synthetic fixtures (node:test; Jest projects only match server/client/shared).

**Why:** none of these paths trigger trailer rules 2–6, so nothing forces the right author; without an explicit split two agents edit CLAUDE.md or the CI file at once.

**How to apply:**

- Grep governance text for the policy you change in _all_ of CLAUDE.md, `.claude/agents`, `.claude/skills`, `.claude/workflows/*.js` — the worktree CLAUDE.md was already fixed while `pr-review.js` still carried the old deferral wording. The system-prompt copy of CLAUDE.md can be stale vs the worktree.
- `.mjs` outside `scripts/` is linted without Node globals — extend the eslint node-scripts `files` glob.
- Generated JSON must be written through the Prettier API or `format:check` fails on the builder's own output.
- A privacy scanner cannot ship a denylist of real names (that leaks them): generic patterns in CI, real-name/amount denylist built at runtime from a local backup (`node:sqlite`, read-only), matches printed masked.
- Scan PR title/body in CI via `env:` vars (never `${{ }}` inside `run:`); skip dependabot; allowlist noreply domains.
- AC "first commit of the epic" + squash merge: checkpoint-commit the file first on the branch; the squash still folds it.

See [[ci-gate-design]] for path-filter hazards.
