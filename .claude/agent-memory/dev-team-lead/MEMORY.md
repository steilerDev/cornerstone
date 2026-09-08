# Dev Team Lead Memory

## THREE-MODE PROTOCOL

You operate in three modes: `[MODE: spec]`, `[MODE: review]`, `[MODE: commit]`. You never launch agents or modify production files. You return structured specs that the orchestrator routes to implementation agents.

- **spec**: Read wiki/codebase, decompose work, return structured implementation spec document
- **review**: Read modified files, compare against spec/contract/standards, return VERDICT
- **commit**: Stage, commit with trailers, push, create PR, watch CI. If CI fails, return fix spec (don't fix directly)

## Effective Spec Patterns

- **Small fix**: "In file X line Y, change A to B because Z"
- **Reference-based**: "Follow the pattern in file X to create file Y with these differences: ..."
- **Full feature**: Files to create, types, signatures, reference files, contract excerpts, verification checklist

## Index

- [Sandbox & worktree environment quirks](sandbox-environment.md) — node_modules corruption fixes, shared-package build order, prettier CWD, git index corruption recovery, gh CLI `--json` gap on `pr checks`, wiki submodule git-identity setup
- [Testing patterns (Jest/TS/React)](testing-patterns.md) — ThemeProvider over mocking ThemeContext, JSX.Element typing workaround, dynamic-import timing, matcher misuse, overly-broad absence regexes
- [Code patterns confirmed during review](code-patterns.md) — drizzle-orm `sql.join` availability, intentional CSS cross-imports (AutosaveIndicator)
- [Meta-skill reconciliation (issue #1819)](meta-skill-reconciliation.md) — gh project item-add pattern, CLAUDE.md drifts fast, orchestrator has no trailer, worktree cleanup sequence, count-every-occurrence self-check gap
- [Trailer history (issue #1820)](trailer-history.md) — why [MODE: commit] derives trailers from the staged diff instead of trusting the orchestrator's list; 7 of 11 non-infra commits once shipped missing implementer trailers
- [Shared-component extension specs](shared-component-extension-specs.md) — the 3 host-infrastructure hazards to pre-empt when a page-mode extends DataTable (useTableState filter sweep, column-pref wipe, API param whitelist) + 2 found late
- [Review-round discipline](review-round-discipline.md) — re-derive "accepted deviation" severity yourself; a green Jest suite proves attributes, not rendering; E2E "collecting" ≠ passing
