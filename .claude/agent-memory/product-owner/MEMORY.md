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

- EPIC-04 (#4) Household Items [Must] — IN PROGRESS, 11 stories (#387-#394, #413, #415, #467). Full detail + per-story review notes in [epic-04-planning.md](epic-04-planning.md)
- EPIC-16 (#752) Floor Plans & Utility Tracking (2.5D) [Should, Future] — 22 stories (#753-#775), all Backlog, 6 phases. See [epic-16-planning.md](epic-16-planning.md)
- Backlog-only (not started): EPIC-07 Reporting [#7], EPIC-09 Dashboard [#9], EPIC-10 UX Polish [#10]. Deps: 07←05,08; 09←02,03,05; 10←all.

## Completed Sprint Story References

- EPIC-01: #28,#30,#32,#34-#38,#68 | EPIC-02: #24-#27,#29,#31,#33 | EPIC-11: #13-#18 | EPIC-12: #116-#120

## Standalone bugs & stories (no active parent epic)

Full detail in [standalone-bugs-and-stories.md](standalone-bugs-and-stories.md) (budget/invoice) and [standalone-diary-bugs.md](standalone-diary-bugs.md) / [standalone-photo-stories.md](standalone-photo-stories.md). Growing budget/invoice cluster (20+) → propose new "Budget/Invoice UX Polish" epic next planning cycle. Auto-itemize is standalone (no parent epic): stories #1545-#1547 + bug fixes.

- **#1932** cover letter overhaul — user ruled plain text + line breaks (pdfmake already honours `\n`); PR #1951 APPROVED r1, 3 MUST FIX; follow-ups #1952/#1953. §"#1932 user scope ruling" + §"#1951 architecture-review follow-ups" in [bank-report-wizard.md](bank-report-wizard.md).
- Budget/invoice batches: #1369-#1373 (2026-04-28), #1389-#1390 (2026-04-29), #1401 (2026-05-10), #1421-#1425 (2026-05-15), #1439-#1441 (2026-05-17), #1553 (2026-05-22)
- Auto-itemize: #1545/#1546/#1547 mini-epic (2026-05-21), #1600 (2026-05-26), **#1833 duplicate budget lines on commit retry (2026-07-07)**
- Diary: #1426 critical photo data loss (2026-05-15)
- Photo: #1723 lightbox picker UX (2026-06-16)
- **DataTable: #1955** two-column toggle race silently hides 2nd column, all 6 DataTable pages (Should Have, S, Backlog, 2026-08-02). See [datatable-column-preference-race.md](datatable-column-preference-race.md) — records that **fast clicking is the SAFE case** (I judged this backwards; debounce `clearTimeout` coalesces rapid input, the >500ms reading-pace gap is the reachable one) and that #1920's E2E-only fix (`InvoicesPage.enableColumn()` awaits the PATCH) makes CI green **without** fixing production — don't close #1955 on a green shard.
- **#1957** latent cross-file E2E test-isolation hazard (shared-admin `user_preferences` writes under `fullyParallel`, `LocaleContext.syncWithServer` actively flips a victim test's locale) — Should Have, bug, Backlog, 2026-08-02/03, filed from `/fix-e2e` work on PR #1956. Scoped as an audit + per-spec sweep, not a single-file fix — found a second live instance (`diary-uat-fixes.spec.ts` vs `dashboard.spec.ts`, key `dashboard.hiddenCards`) while researching it. Distinct from #1955 (production race) and #1920 (E2E workaround for #1955). Detail in [e2e-shared-admin-preference-hazard.md](e2e-shared-admin-preference-hazard.md).
- **Bank Report Wizard mini-epic** (no parent epic, 3 refinement rounds): #1876→#1877→#1878→#1879, then #1898-#1901, then #1929-#1933. All merged/approved. Round-by-round rulings, contract facts, and the open-follow-up ledger (#1888, #1891, #1895-#1897, #1910, #1917, #1937-#1941, #1946/#1947, #1950, #1952/#1953) live in [bank-report-wizard.md](bank-report-wizard.md) — read it before touching any report-wizard story.
- **PR #1959** (user's own PR, held promotion #1958) — 3 rulings 2026-08-03: footnote sentences must return as a non-editable report-level legend (→#1965); `Abschlag` glossary short-form APPROVED, `split`'s three German forms get NO entry; closed/released ACs get a dated supersession comment, never a rewrite. Filed #1965-#1972. §"PR #1959 rulings" in [bank-report-wizard.md](bank-report-wizard.md).
- **#1965 legend — PR #1979 CHANGES_REQUIRED r1 → APPROVED r2, 2026-08-03.** Two rulings worth reusing: a coverage gap blocks only once you can **name the live defect it concealed**; and array-length pinning **composed with** a pinned verbatim-append is real coverage, so don't reject for the literal AC surface when the property is closed. Unmet AC 4.1 → **#1980** rather than absorbed into "approved with follow-ups". §"#1965 review" (both rounds) in [bank-report-wizard.md](bank-report-wizard.md); assertion-quality patterns in [pr-review-patterns.md](pr-review-patterns.md).

## Requirements Coverage

- Full coverage tracked via GitHub Issues (epic issues reference requirements sections).
- Section 2.6 Reporting has empty body — EPIC-07 covers bank exports.
- Household Items are explicitly NOT work items (Section 5, Key Decisions).
- Budget sub-domains: categories, vendors, creditors, subsidies — all in EPIC-05.
- EPIC-11 covers cross-cutting non-functional: testing, Docker, security.

## GitHub Projects Board — operational

- Project ID: `PVT_kwHOAGtLQM4BOlve` | Status Field ID: `PVTSSF_lAHOAGtLQM4BOlvezg9P0yo`
- Status Option IDs: Backlog=`7404f88c`, Todo=`dc74a3b0`, In Progress=`296eeabe`, Done=`c558f50d`, Wont-Do=`90c1bc33`
- Native `gh project` commands (not raw GraphQL) for board mgmt: `item-edit --id <ITEM> --project-id <PID> --field-id <FID> --single-select-option-id <STATUS>`; `item-add 4 --owner steilerDev --url <url>`
- **`gh project item-list` has NO `--query` flag** in the installed gh (only `--format`/`--jq`/`--limit`/`--owner`/`--template`) — the `--query "is:issue #<N>"` form documented in the agent definition fails with `unknown flag`. Resolve an item node ID via `gh api graphql '{ repository(owner:"steilerDev",name:"cornerstone"){ issue(number:N){ projectItems(first:5){ nodes{ id project{number} } } } } }'` and verify status by node ID with `node(id:"PVTI_…"){ ... on ProjectV2Item { fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } }`. Confirmed 2026-08-01 (#1917).
- GraphQL still needed for `addSubIssue` and `addBlockedBy` (`addBlockedBy` uses `blockingIssueId`, NOT `blockedByIssueId`)
- If `item-list` is empty right after `item-add` (indexing lag), resolve item node ID via issue `projectItems` GraphQL and set status by that ID. See [board-operations.md](board-operations.md)

## Patterns and Conventions

- Epic issues: "EPIC-NN: Title". Story issues: "NN.X: Title". Labels: `epic`, `user-story`, `priority: …`, `sprint-N`.
- Epic body has task list of story issues; story body references `**Parent Epic**: #NN`.
- IMPORTANT: GitHub issue numbers ≠ epic numbers (EPIC-11 is issue #12). See [epic-patterns.md](epic-patterns.md).

## PR Review

Detailed checklist, recurring violations, and per-PR findings in [pr-review-patterns.md](pr-review-patterns.md). Top recurring items to check FIRST: **CI shard status (`Quality Gates` green ≠ E2E green)**, **test doubles hiding defects (wrong-sign fixtures / key-echoing `t` mocks / mocked libs)**, **every `t()` path actually resolves in `en/<ns>.json`**, dependency pinning (exact versions), keyboard :focus indicators (WCAG AA), test authorship (QA not devs), E2E gate for "Automated (E2E)" scenarios, raw-value display bugs (formatDate/percent/"—" placeholder). Verdict matrix: `--request-changes` for functional AC gaps; `--comment` "MUST FIX" for display/formatting; `--approve` when all met.
