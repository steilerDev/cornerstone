# Product Owner Agent Memory

## Backlog State

- 16+ epics, 107+ user stories. Sprints 1-4 largely complete; standalone bug/story backlog growing (esp. budget/invoice, now 20+ items).
- GitHub Projects board: "Cornerstone Backlog" (project #4, owner steilerDev).
- Security hygiene backlog: Issue #315 (rate limiting, headers, lockout, etc.).

## Completed Epics

- EPIC-01 (#1) Auth & User Mgmt — CLOSED, promoted PR #82
- EPIC-02 (#2) App Shell & Infra — CLOSED 2026-02-08
- EPIC-03 (#3) Work Items CRUD — CLOSED, promoted PR #110. See [epic-03-details.md](epic-03-details.md)
- EPIC-05 (#5) Budget Mgmt — CLOSED v1.9.0, 12 stories
- EPIC-06 (#6) Timeline & Gantt — CLOSED v1.10.0, 9 stories
- EPIC-08 (#8) Paperless-ngx — CLOSED v1.11.0, 6 stories. Story 8.6 (#359) still open, blocked by EPIC-04. See [epic-08-planning.md](epic-08-planning.md)
- EPIC-11 (#12) CI/CD Infrastructure — CLOSED 2026-02-08
- EPIC-12 (#115) Design System Bootstrap — CLOSED, promoted with EPIC-03 via PR #110
- EPIC-14 Code Deduplication — CLOSED v1.13.0, promoted PR #541
- EPIC-15 (#602) Budget-Line Invoice Linking Rework — 7 stories merged, 3 UAT bugs #622/#623/#624

## Active / Planned Epics

- EPIC-04 (#4) Household Items [Must] — IN PROGRESS, 11 stories (#387-#394, #413, #415, #467). See [epic-04-planning.md](epic-04-planning.md)
- EPIC-16 (#752) Floor Plans & Utility Tracking (2.5D) [Should, Future] — 22 stories (#753-#775), all Backlog, 6 phases. See [epic-16-planning.md](epic-16-planning.md)
- Backlog-only (not started): EPIC-07 Reporting [#7], EPIC-09 Dashboard [#9], EPIC-10 UX Polish [#10]. Deps: 07←05,08; 09←02,03,05; 10←all. See [epic-09-planning.md](epic-09-planning.md), [epic-17-planning.md](epic-17-planning.md), [epic-18-planning.md](epic-18-planning.md)

## Completed Sprint Story References

- EPIC-01: #28,#30,#32,#34-#38,#68 | EPIC-02: #24-#27,#29,#31,#33 | EPIC-11: #13-#18 | EPIC-12: #116-#120

## Standalone bugs & stories (no active parent epic)

Detail in [standalone-bugs-and-stories.md](standalone-bugs-and-stories.md) (budget/invoice), [standalone-diary-bugs.md](standalone-diary-bugs.md), [standalone-photo-stories.md](standalone-photo-stories.md). Growing budget/invoice cluster (20+) → propose a "Budget/Invoice UX Polish" epic next planning cycle.

- Budget/invoice batches: #1369-#1373, #1389-#1390, #1401, #1421-#1425, #1439-#1441, #1553
- Auto-itemize (standalone, no parent epic): #1545-#1547 mini-epic, #1600, #1833 duplicate budget lines on commit retry
- Diary: #1426 critical photo data loss | Photo: #1723 lightbox picker UX
- **#1970 auth rate limits** — PR #1989 approved R3, all 7 ACs met, Done on merge; follow-ups #1990/#1991/#1992 open. See [auth-rate-limits-1970.md](auth-rate-limits-1970.md)
- **#1955 DataTable two-column toggle race** (Should Have, Backlog) — fast clicking is the SAFE case; #1920's E2E-only fix makes CI green without fixing production. See [datatable-column-preference-race.md](datatable-column-preference-race.md)
- **#1957 E2E test-isolation hazard** (shared-admin `user_preferences` writes under `fullyParallel`) — Should Have, Backlog; an audit + per-spec sweep, not a single-file fix. See [e2e-shared-admin-preference-hazard.md](e2e-shared-admin-preference-hazard.md)
- **#2005 CLOSED** — dashboard "New Invoice" shard 8/16 failure; all 16 shards green on `df7d2c73`, promotion blocker cleared.
- **#1992 wiki-only OIDC env-var fix** — PR #2022 APPROVED, 7/7 ACs, **close on merge + board Done, no UAT** (all claims machine-checkable against `config.ts`/`oidc.ts`). Deviation-Log ruling in [pr-review-patterns.md](pr-review-patterns.md). Sweep spin-offs: **#2023** (`BACKUP_DIR` default+dead 503 gate; its AC2 hides a product decision — making backups opt-in is a behaviour change for existing deployments and comes to me), **#2024** (`wiki/` missing from `.prettierignore`; recommend splitting its AC3/AC4 out so the 2-line safety fix ships first).

## Bank Report Wizard mini-epic (no parent epic)

All rulings, contract facts, per-PR review outcomes and filed follow-ups live in [bank-report-wizard.md](bank-report-wizard.md) — consult it before any work on this cluster.

- Shipped: #1876-#1879, #1898-#1901, #1929-#1933, #1958, #1959, #1965, #2001, #2003, #1973
- Open: #1888, #1891, #1895-#1897, #1910, #1912, #1917, #1938, #1940, #1941, #1946 (Must Have), #1947, #1950, #1952, #1953, #1966-#1972, #2011-#2014, #2016-#2021 (#1937/#1939 CLOSED — no open home for allocated-column geometry)
- Merged but **not Done** (awaiting live-LLM UAT): #1931 (ACs 3.2/3.3)
- **#1973** column visibility → PDF: PR #2010 approved R1, 28/33 ACs, → **UAT, stays In Progress**. Follow-ups #2011-#2014 all Backlog + blocked-by #1973.
- **#1911** `splitKind`: ACs refined 2026-08-05 onto an orchestrator-filed body → **UAT, not Done-on-merge**. Privacy: no objection. Legend: no new sentence. Addendum ruling (pre-merge): zero-line-contribution row now shows `(Deposit)`+`(partial)` — **intended, do not narrow**, AC 3.6/3.7/4.7 added. **PR #2015 CHANGES REQUESTED round 1** — logic correct, evidence layer not: 2 red E2E scenarios (stale assertions, not defects) + AC 4.5's render measurement unfalsifiable by construction.

## Requirements Coverage

- Full coverage tracked via GitHub Issues (epic issues reference requirements sections).
- Section 2.6 Reporting has empty body — EPIC-07 covers bank exports.
- Household Items are explicitly NOT work items (Section 5, Key Decisions).
- Budget sub-domains: categories, vendors, creditors, subsidies — all in EPIC-05.
- EPIC-11 covers cross-cutting non-functional: testing, Docker, security.
- Glossary/terminology decisions: [glossary-decisions.md](glossary-decisions.md)

## GitHub Projects Board — operational

- Board status changes go through `bash scripts/board.sh <issue> <backlog|todo|in-progress|done|wont-do>` — it owns the project/field/option IDs.
- GraphQL still needed for `addSubIssue` and `addBlockedBy` (`addBlockedBy` uses `blockingIssueId`, NOT `blockedByIssueId`).
- **`gh project item-list` has NO `--query` flag** in the installed gh — the form in the agent definition fails. Resolve item node IDs via the issue's `projectItems` GraphQL field instead.
- **`gh issue view <N>` fails** with a Projects-classic deprecation error — use `gh api repos/steilerDev/cornerstone/issues/<N> --jq '.body'` instead (confirmed 2026-08-05).
- If `item-list` is empty right after `item-add` (indexing lag), resolve the item node ID via the issue's `projectItems` GraphQL field and set status by that ID.

## Patterns and Conventions

- Epic issues: "EPIC-NN: Title". Story issues: "NN.X: Title". Labels: `epic`, `user-story`, `priority: …`, `sprint-N`.
- Epic body has task list of story issues; story body references `**Parent Epic**: #NN`.
- IMPORTANT: GitHub issue numbers ≠ epic numbers (EPIC-11 is issue #12). See [epic-patterns.md](epic-patterns.md).

## Standing rulings (reusable across clusters)

Full derivations and the incidents behind each are in [pr-review-patterns.md](pr-review-patterns.md) and [bank-report-wizard.md](bank-report-wizard.md).

- **Merge is a code gate; Done is an acceptance gate.** An unverifiable AC *with* a substitute assertion = documented deviation; *without* one → UAT, reopen on failure.
- **A finding that defeats the PR's own AC belongs in that PR, not a follow-up.** Conversely: **a green PR is not reopened to absorb non-blocking findings — file, don't expand.**
- **Closed/released ACs get a dated supersession comment, never a rewrite.** When a body *is* rewritten, always report "body rewritten, numbering reassigned" — omitting that let two agents spec from a stale revision.
- **Wiki Deviation Log: the Observation column of a dated entry is immutable; corrections go forward in that entry's Resolution.** Ruled 2026-08-06 on PR #2022 (#1992). Same shape as the AC supersession rule. Rationale + boundaries (spurious entries are withdrawn not deleted; lead a correction with "Correction to the observation above:", never a trailing parenthetical) in [pr-review-patterns.md](pr-review-patterns.md).
- **Operator-facing docs never carry a "known issue" pointer to an open bug** — docs ship with releases, the tracker doesn't, and nothing forces the line's removal when the fix lands. Put the *workaround* in as a plain requirement instead: prescriptive copy ages into harmlessness, diagnostic copy ages into lies. Ruled 2026-08-06 on PR #2027 (#1990) re #2026.
- **Docs-only PRs make `Quality Gates`/`E2E Gates` green by vacuity** — `Detect Changes` skips every real job, and the `onBrokenAnchors: 'throw'` docs build runs only on release. Run `npm run docs:build` yourself when reviewing a docs PR that adds anchors.
- **An item whose every claim is machine-checkable against source has no UAT surface** — the PO review *is* the acceptance gate; close on merge (#1992). UAT is for rendered artefacts and operator-observable behaviour.
- **ACs that misdescribe reality fail correct implementations at UAT** (seen 4×). Amend the text; don't design around it.
- **An input cap on a field whose baseline is *derived* must clear what the system itself legally generates**, or the AC's exception state becomes the routine state and a near-limit affordance turns into permanent furniture. Find the floor before picking the number (#1941: `usageText` 500, not the suggested 150).
- **Before routing a "rendering capacity" question to an architect, check whether the renderer has a container at all.** Flowing content with no table/`dontBreakRows`/fixed height has no capacity ceiling — an over-long value just makes more pages, so the question was a *product* one all along (#1941 `coverLetter.body`). Saves a routing round.
- **Before calling a missing mechanism an accessibility gap, check which mechanism already carries the fact.** A two-mode component can legitimately use the accessible *name* in one mode and the *description* in the other; "fixing" the omission then double-announces (#1941 `EditableField` dense vs labelled mode). Separate the enabling refactor (in scope) from the behaviour change (rejected).
- **Chasing an AC's vacuity often exposes a defect in its neighbour** — #1941's AC5 (no server round-trip) proved AC4's "existing *saved* value" fixture unconstructible. Also: a vacuous AC needs an explicit *prohibition*, not just a note, when the literal reading invites the inverse mistake.
- **An issue filed by another agent is a snapshot of that round's codebase** — re-verify the *mechanism*, not just the defect, and correct the mechanism while keeping the story.
- **When an AC's correct predicate is one plausible misreading away from a no-op, write the misreading into the AC** and demand a test pinning that shape.
- **Check the other direction of any reported boolean defect** — the mirror case is often live too.
- **`Refs #N`, not `Fixes #N`, for any issue in a parent-less cluster carrying a UAT disposition** — `/epic-close` (the only skill with a UAT step) never runs without an epic, so standalone `/release` would auto-close it unvalidated. **Before trusting "the lifecycle protects this", check the item actually enters that lifecycle.** The acceptance gate is the board status, which I set — not open/closed, which GitHub sets.
- **When a review finding invokes a principle, check whether the principle actually condemns the code.** A principle stated only in its prohibiting direction generates false positives; write the permission into the ADR alongside it.
- **When a change looks like new behaviour, check whether the underlying field already carried the right value and only a downstream gate was lying.** If so it is a fix, and the burden flips to whoever wants the old output. If the only available narrowing is the removed gate under a new name, there is no narrowing — say so plainly.
- **A corrected assumption appearing independently in code + docs + tests is one spec gap, not three bugs** — and is the argument for writing the AC down even when the code is already right.
- **"Dominated by an existing measurement, do not re-measure" is as valuable as demanding the measurement.** Rank flagged risks against each other instead of treating every new co-occurrence as equally alarming.
- **When a fix removes a mutual exclusion, ask what combination just became reachable** that never rendered before.
- **A documented measurement (glossary space budget, column width) can close a wording debate before it starts.**
- **"Real render" ≠ "measured."** An unmocked render whose assertions read the *input* content tree, or read a quantity fixed by construction (e.g. a table width that is `printableWidth()` for any input), is still a vacuous assertion. Ask what *varies* when the guarded content changes — not whether a render happened.
- **Check that the issue a routing rule points at is still open before restating the rule.**
- **Answer boundary/privacy questions about the artifact that leaves the system, not only about the API.**
- **A finding's severity is capped by my own enumeration failure** — if I missed it in earlier rounds, it can't be blocking now. End mirror-image review cycles by **stating the enumeration as exhaustive**.
- **Comment keeps the rationale, issue owns the guard.** Bounded-and-quantified earns a tracked owner; unbounded-and-estimated gets documentation only.
- **Price intrinsic tensions differently from oversights** — offer a documented deviation for genuine conflicts.

## PR Review

Detailed checklist, verdict matrix, recurring violations, and per-PR findings in [pr-review-patterns.md](pr-review-patterns.md). Check FIRST: **CI shard status** (`Quality Gates` green ≠ E2E green), **test doubles hiding defects**, **vacuous assertions** (invert an inequality's bound to read the measured value; re-run the exact mutations that stayed green last round), **every `t()` path resolves in `en/<ns>.json`**, dependency pinning, keyboard focus indicators, test authorship (QA not devs), raw-value display bugs.

- Verdict matrix: `--request-changes` for functional AC gaps; `--approve` with "MUST FIX" notes for display/formatting; never `--comment` as a verdict.
- `gh pr review` **cannot** request changes on a human-authored PR — the verdict goes in a comment.
- `npm run lint` has **no Prettier** and CI has no `format:check`, so formatting drift merges silently.
