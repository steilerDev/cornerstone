---
name: EPIC-17 i18n Planning
description: Planning details for EPIC-17 i18n Support (English + German) — story numbers, dependencies, and key decisions
type: project
---

## EPIC-17: i18n Support (English + German)

**Epic Issue**: #915
**Priority**: Should Have
**Created**: 2026-03-16

### Stories

| Story | Issue | Title | Priority | Blocked By |
|-------|-------|-------|----------|------------|
| 17.1 | #916 | i18n Infrastructure & Shared Components | Must Have | — |
| 17.2 | #917 | Auth & Settings Pages (incl. Language Setting) | Must Have | #916 |
| 17.3 | #918 | Dashboard & Work Items Pages | Must Have | #916 |
| 17.4 | #919 | Household Items & Milestones Pages | Must Have | #916 |
| 17.5 | #920 | Budget Pages | Must Have | #916 |
| 17.6 | #921 | Schedule & Diary Pages | Must Have | #916 |
| 17.7 | #922 | Documents & Remaining Components | Must Have | #916 |
| 17.8 | #923 | Docs Site German Translation | Should Have | — (independent) |
| 17.9 | #924 | E2E Test Updates & Final Validation | Must Have | #916-#922 |

### Dependency Graph

- Story 17.1 (#916) is the foundation — blocks Stories 17.2-17.7
- Story 17.8 (#923) is independent (Docusaurus has its own i18n system)
- Story 17.9 (#924) is blocked by all app stories (17.1-17.7)

### Key Design Decisions

- **i18next + react-i18next**: Static JSON imports, no async loading
- **LocaleContext**: Mirrors ThemeContext pattern (localStorage + server sync + system detection)
- **Namespace per domain**: common, errors, auth, settings, dashboard, workItems, householdItems, budget, schedule, diary, documents
- **CURRENCY env var**: Server exposes via GET /api/config, formatCurrency() reads from it, default EUR
- **Formatters**: Read locale from i18n.language, no call signature changes
- **Enum display**: API enum values stay English, only display labels translated
- **Badge variant maps**: Must be refactored to use t() (move inside component or factory pattern)
- **Docs site**: Docusaurus built-in i18n, separate from app i18n

### Board Status

All stories set to **Todo** on the Cornerstone Backlog board.

### Node IDs

- EPIC-17: `I_kwDORK8WYc7zmbsG`
- Story 17.1: `I_kwDORK8WYc7zmcTo`
- Story 17.2: `I_kwDORK8WYc7zmcjW`
- Story 17.3: `I_kwDORK8WYc7zmcw4`
- Story 17.4: `I_kwDORK8WYc7zmc9T`
- Story 17.5: `I_kwDORK8WYc7zmdNJ`
- Story 17.6: `I_kwDORK8WYc7zmdcu`
- Story 17.7: `I_kwDORK8WYc7zmdqc`
- Story 17.8: `I_kwDORK8WYc7zmd4y`
- Story 17.9: `I_kwDORK8WYc7zmeHS`
