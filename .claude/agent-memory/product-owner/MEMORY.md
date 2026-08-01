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

- Budget/invoice batches: #1369-#1373 (2026-04-28), #1389-#1390 (2026-04-29), #1401 (2026-05-10), #1421-#1425 (2026-05-15), #1439-#1441 (2026-05-17), #1553 (2026-05-22)
- Auto-itemize: #1545/#1546/#1547 mini-epic (2026-05-21), #1600 (2026-05-26), **#1833 duplicate budget lines on commit retry (2026-07-07)**
- Diary: #1426 critical photo data loss (2026-05-15)
- Photo: #1723 lightbox picker UX (2026-06-16)
- **Bank Report Wizard mini-epic** (no parent epic): #1876 refunds (PR #1880) → #1877 contact/household/attachment typing (PR #1883) → #1878 report backend → #1879 wizard+PDF (PR #1887, CHANGES_REQUIRED then **APPROVED** round 2, 2026-07-30). Domain decisions, contract facts (refund sign, `isSplit`, `totalAmount` scope) and deferrals in [bank-report-wizard.md](bank-report-wizard.md). **Refinement Round 2** (2026-07-31, no parent epic, all Todo): #1898 report table refinements (PR #1902, merged) → #1899 settings step + report language (PR #1903, PO review 2026-07-31: **APPROVED w/ 1 MUST FIX** — 5-step wizard, `getFixedT`/`createFormatters` threading and en/de report output all verified; AC 2.2 default-locale seeding is stale on hard load, see [pr-review-patterns.md](pr-review-patterns.md) `useState(contextValue)` entry) → #1900 editable HTML preview (PR #1909, round 1 COMMENT + 4 MUST FIX, **round 2 2026-07-31 APPROVED** — all 4 verified on disk: local `composes` classes, `--font-weight-medium`, `sharedStyles.srOnly`, translated `resetFieldAriaLabel` at all 9 sites w/ en+de parity; stylelint exit 0. Note: `gh pr review --approve` fails when PO authored the PR context — post verdict via `gh pr comment` with explicit Verdict line. Judgment rulings: signature-derived-from-sender ACCEPTED, mark-claimed-generates-no-PDF ACCEPTED as vacuous, per-field reset ACCEPTED, AC 4.6 rendered-preview assertion ACCEPTED as documented deviation — Playwright headless has no PDF viewer plugin, so the E2E asserts the CSP `frame-src` contract instead; **mixed-language mobile cards ACCEPTED** — see [bank-report-wizard.md](bank-report-wizard.md) "artifact content vs. edit affordance") → #1901 AI usage/cover-letter generation (PR #1916, PO review 2026-07-31: **CHANGES_REQUIRED** — 3 blocking numeric-accuracy defects in the LLM prompt inputs: `/100` on major-unit amounts, `Math.round` to whole euros, per-invoice amount ignoring `excludedLineIds`; + 2 MUST FIX: extraction-flavoured shared LLM error copy, uncommitted wiki API-Contract section. All 6 AC sections otherwise met; entity-level linked-item description deviation ACCEPTED. New defect class recorded in [pr-review-patterns.md](pr-review-patterns.md) "LLM/prompt-assembly defects". **Round 2 on `b70d821b`: APPROVED** — all 5 findings fixed and verified on disk; `prompts.test.ts` gained a dedicated ×100 regression-guard block (98/98 pass locally); per-invoice cents-rounding now makes server math identical to client `applyLineExclusions`; wiki pushed at `254db1d`; the 9 removed test lines were a stale #1915 header note, not a weakened assertion). **Follow-ups consolidated into #1917** (tech-debt, Should Have, Backlog): architect M1–M4 + L1/L2/L3/L5, the `Konstruktionsprojekt`→`Bauprojekt` prompt nit, and the approved `KI` glossary entry. M2 (extract `computeIncludedTotal` to `@cornerstone/shared`) is the headline — the client/server duplication already drifted once and caused the #1916 blocking bug. Open: **#1891** user-verification follow-up (Todo, PR #1894 **APPROVED** 32/32 round 2, 2026-07-30 — 2 wiki MUST FIX outstanding); **#1888** stage-matched attachment indicator (Backlog, blocked-by #1879); **#1895** HIGH claim close-out cross-source sweep, **#1896** quotation-deposit 409 (blocked-by #1895), **#1897** deposit-blind drill-down — all Backlog, from the #1891 architect audit; **#1910** `lang` attribute on report-language preview content (Backlog, a11y follow-up from #1909 round 2); E2E shard 5 pre-existing flake must be triaged before promoting to `main`.

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
