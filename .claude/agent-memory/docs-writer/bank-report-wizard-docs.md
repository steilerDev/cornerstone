---
name: bank-report-wizard-docs
description: Bank Report Wizard had zero docs-site coverage until PR #2041 (2026-08-06); new guide at guides/budget/bank-reports.md, plus the subsidies.md drift that was fixed in the same pass
metadata:
  type: project
---

# Bank Report Wizard docs gap (closed 2026-08-06, PR #2041)

**Why this mattered:** EPIC-07 (Reporting and Export) had been checked off in the roadmap for a long
time, and the feature (`client/src/pages/ReportWizardPage`, route `/budget/reports`) had grown into a
large, actively-developed area (see `product-owner`'s `bank-report-wizard.md` memory for the full
mini-epic history), but `docs/src/` and `docs/sidebars.js` had **no page for it at all** -- not even a
stub. A release task that assumed "extend the existing reports docs" surfaced the gap.

**How to apply:** The gap is now closed -- `docs/src/guides/budget/bank-reports.md` (sidebar position 9,
registered in `docs/sidebars.js` under the Budget category, cross-linked from `guides/budget/index.md`).
It documents the wizard as a single comprehensive page (index-style, no sub-pages, matching the
`guides/backup/index.md` pattern) covering: the 3 report types (Budget Overview / Claim / Proof of
Funds) and their invoice-status eligibility, the 5 wizard steps (Report Type, Budget Source, Select
Invoices, Settings, Preview & Export), column visibility toggles, AI-assisted generation
("Enhance with AI", gated on `llmEnabled`), marking invoices claimed, and long-content/multi-page PDF
handling. **Before extending this page**, re-derive current UI/copy from
`client/src/i18n/en/budget.json` (`sourceReports` key) and `ReportWizardPage.tsx` rather than trusting
this page alone to stay current -- the feature has a long history of fast iteration (see
`[[release-notes-drift]]` if that file exists, or the product-owner memory directly).

## Related fix in the same pass: subsidies.md was stale, not just missing "No Category"

`docs/src/guides/budget/subsidies.md` described a **single** "Budget Category" field and a **4-status**
lifecycle (Pending/Approved/Rejected/Disbursed) that no longer matched the shipped `SubsidyProgram`
type (`shared/src/types/subsidyProgram.ts`): categories are actually **multi-select**
(`applicableCategories: BudgetCategory[]`, empty = universal) with an independent `includesNoCategoryItems`
("No Category") checkbox, and the real status enum is
`eligible | applied | approved | received | rejected` (only `approved`/`received` count toward budget
math). This predated the "No Category" release task -- rewrote the whole Creating/Statuses/How-it-affects
sections rather than just appending the new checkbox, since the old text would have stayed actively
wrong. **Lesson: when a task says "add feature X to this doc", verify the doc's existing claims against
the current type/schema before touching it — drift compounds silently on release cycles that only ever
append.**
