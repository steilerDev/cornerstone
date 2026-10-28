---
name: story-2248-task-page
description: '#2248 Task page rebuild: WorkItemDetailPage POM API, specs touched, cost-on-Cost-tab rule, Documents fact, static-only assumptions to check first.'
metadata:
  type: project
---

POM `WorkItemDetailPage`: `goto(id, {tab, query, hash})`, `header`/`summary`/`tabs` controls, cards via new `SectionCardControl` (`detailsCard`, `whoWhereCard`, `datesCard`, `constraintsCard`...), RelatedLists (`waitsFor`, `waiting`, `milestones`, `purchases`, `grants`), `dependencyDialog(title)`, `dependencyDialogTitles`, `chooseAdd`, `editDetails`, `openDeleteModal` (header menu). Specs: `work-items/work-item-detail.spec.ts` (basics) + `work-items/task-page.spec.ts` (T1-T15 acceptance).

Rules learned: cost lines live ONLY on `?tab=cost` (panels mount lazily) so every spec using `costLines` must `goto(id, {tab:'cost'})`; Documents trigger is the `summary-fact-documents` strip fact (bare count text, `DocumentsPanel.button()/open()` default finds either trigger); Who is edited inside the Who and where card (Edit, pick, Save), `EntityPickerControl` built from a Locator has no working `selectedDisplay()` (use `whoWhere form .selectedDisplay`); RelatedList add button is absent while empty (use `addAction('Add')`); milestone row ids are `required:<id>`/`linked:<id>`.
Verified statically only (tsc, eslint, prettier, --list): no docker image in that sandbox.
