---
name: cost-line-specs
description: Hazards found speccing EPIC-21 #2235 (P4.3 cost lines table/form/grid, retiring 10 components across two FE agents) — "Layers C" stories that need an atomic server batch, ObjectForm cross-field limits, money-label pre-check script, capmap vs UX placement, retirement ordering, labels whose canon word names a different figure
metadata:
  type: feedback
---

Found while speccing #2235 (P4.3). Each was invisible in the AC text.

1. **"Layers: C" can still need a server change.** Splitting a 50-line offer on the existing API is 100 non-atomic writes (create line on the task, then link it). A failure between them leaves a stray estimate that inflates Expected cost, and the over-itemized check is order-dependent. Spec an additive transactional batch endpoint and route it to the architect as an escalation, with the client-loop fallback named.
2. **`ObjectForm` custom fields see only their own value.** Forms whose fields depend on each other (pricing mode, existing line, net/gross result line) need additive extensions: `visibleWhen(values)`, `ctx.values`, `group` (fieldset/legend). Hidden fields must also be skipped by initial focus, first-error and More-details logic.
3. **Pre-check every new `en` value with a script, not by eye.** Import `normalizeLabel` + `glossaryLabels` from `build-baseline.mjs`, rebuild `MONEY_RE` from its `MONEY_WORDS`, and diff against `baseline.json`. In #2235 this caught "Single amount", "No cost category", "Expected payback: {{min}} to {{max}}" (placeholders strip to ≤ 4 words) and "Professional estimate" (needs a glossary term). Scripts must live in the job tmp dir; the worktree guard refuses `/tmp` and heredoc+pipe commands.
4. **capmap `to` is the plan of record when it contradicts the UX spec.** MNY-097 said "grid dialog", UX proposed in-card edit mode. The hosts were not on the detail template yet and `SectionCard` has no sticky footer or custom edit label, so the dialog won; record it as a UX ack item.
5. **Retiring shared components used by both FE agents: the last consumer's owner deletes.** `BudgetLineForm` was used by FE-A's hosts and FE-B's AI pages, so deletion and the `budget.json` orphan sweep go in a final FE-A step after FE-B finishes (ownership of `budget.json` hands over). Give each FE agent its own `en` namespace file (new `costLines` namespace) to avoid two writers.
6. **Re-hosted components carry review debt.** Retiring a container (`BudgetSection`) makes the pages import its children directly, so their hard-coded strings and ADR deviations become "touched code". `BudgetCostOverview` labelled expected-cost-minus-grants as "Expected Cost" (the glossary calls that After grants) and kept the retired ±5% offer spread. Pre-empt in the spec.
7. **One link per line collapses a "priority" state rule.** Unique indexes on `invoice_budget_lines` made the UX's Submitted > Paid > … priority a direct status mapping; derived state needs no API change.

8. **Retiring components orphans what only they imported (review round 1).** Deleting `BudgetLineForm` left `ParentPicker` and, through it, `HouseholdItemPicker` with zero production consumers, and both still counted as shared components. After any retirement, grep every component the deleted files imported for remaining non-test consumers, and add the orphans to the deletion list.
9. **Coverage pushes turn `?.` into `!`.** The ObjectForm diff swapped optional chaining for `!` to remove untested branches. Check each one for "can this be null here", and especially for `!` inside `setTimeout` callbacks, which run after a possible unmount.

**How to apply:** any story that replaces several editors with one form/grid, adds short money-ish UI strings, or retires components shared across agents.

Related: [[restructure-i18n-specs]], [[detail-template-specs]], [[object-list-specs]], [[money-service-specs]], [[restructure-baseline-hazards]]
