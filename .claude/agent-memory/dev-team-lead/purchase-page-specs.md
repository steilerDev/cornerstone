---
name: purchase-page-specs
description: Hazards found speccing EPIC-21 #2249 (purchase page on the object template) — AC/UX predecessor kinds vs schema, no history object type, undo tracked columns, required header primary, missing date steps, Link counts as destination, unchecked user URLs, route map vs UX redirect mechanism
metadata:
  type: feedback
---

Found while speccing #2249 (P5.5). Expect the same on P5.6 (milestone page) and P5.7 (area page).

1. **AC/UX relation kinds can contradict the schema.** AC7 said "task or purchase" for Waits for; `household_item_deps.predecessor_type` is `work_item | milestone` (purchases are terminal nodes) and the glossary defines Waits for as "tasks or milestones". Check the enum/CHECK and the glossary definition before accepting picker kinds; capmap "same" rows (HHI-061 milestone) also pin what must stay.
2. **`ObjectHistorySection` needs the object in `HISTORY_OBJECT_TYPES`** and events that name it. Purchases have neither, so a UX "History = ObjectHistorySection" is impossible without a backend story. Grep `HISTORY_OBJECT_TYPES` before promising a history feed.
3. **Status Undo restores only `SUBJECTS[type].tracked` columns** (`undoService.ts`). A new date written by a status move (orderDate on Mark ordered) is not restored unless added to `tracked` (not `statusColumns`, or plain field edits start issuing tokens).
4. **`ObjectHeader.primary` is required** (exactly one primary). A UX "omit the primary in state X" needs a fallback (Log primary), not an optional prop.
5. **A UX "both primaries run the date step" can be false for the vocabulary**: `purchaseTransitions` gave only markDelivered a date step and `householdItemStatusBody` dropped the date for other targets. Changing the shared vocabulary changes every StatusMenu host (Schedule panel, Attention rows) — list their tests/E2E.
6. **Router `<Link>`/`<NavLink>` JSX counts as a baseline destination; `NavAnchor` does not.** Old pages' `<Link>`s were the whole destination count; rebuilt pages use NavAnchor.
7. **User-entered URLs rendered as `href`** (product link) must be scheme-checked (http/https only); the old page rendered `javascript:` as a link.
8. **The route map can already fix a mechanism the UX re-invents** (`?edit=overview` in `to` + `carries: ['edit']` vs a UX state flag). The route map wins: state does not survive the generic `RouteRedirect`.

Review round 1 (same story):

9. **Replacing a read endpoint's service function leaves the old one production-dead but test-alive** (`getHouseholdItemById` after GET switched to the page-detail helper). Grep non-test callers of the replaced function.
10. **A sibling page's de strings drift for the same en label** ("Where" = "Wo" on the task strip, "Bereich" on the purchase strip). Have the translator diff the new block against the precedent page's block, key by key.
11. **Empty checks must use the same test as the row-hiding checks** (`=== null` for "Nothing added yet" vs truthiness for hiding the rows). Otherwise `''` values show neither.

Review round 2 (same story, resumed session):

12. **Docs rewrites keep pre-existing claims the data model forbids** ("a task waits for the purchase" while purchases are terminal dependency nodes; "Edit changes the first four" rows when the read-only row is fourth). When a guide is reworded, re-check each relation/row claim against the service invariant and the rendered order, not only the new wording.

CI round (same story):

13. **Rewording a shared i18n key changes every consumer, not just the new page.** The removed-key sweep missed that `create.form.*` values also feed the quick-create `purchaseForm` (17 unit failures pinning old copy). For every key whose _value_ changes, grep consumers (`grep -rl "<key>" client/src`) and run their suites; likewise grep tests that assert an endpoint's _absence_ of a field you add (`itemLists.grants.test` asserted "purchase detail has no grants").
14. **StatusMenu "As planned" shows only when the planned date is before today, and the engine floors an undelivered purchase's target to today**, so Mark delivered's As planned is effectively unreachable. Check the engine's floor rules before promising (or testing, or documenting) a "planned" chip.
15. **`noneLabel` on a company EntityPicker adds a "No company" option row** that no other company picker has; the shared E2E `pickByKeyboard` (only match + create row) then fails. Company pickers clear via the chip's Clear button; use `placeholder`.
16. **SummaryStrip defaults to 4 columns**; 3 wide facts + 4 plain = 10 units = 3 rows on desktop. Count spans (`factSpans`) against the 2-row AC and pass `columns={5}` when needed.
17. **A reported edit can be missing from disk** (an agent's write was silently refused by the shell guard; #2249 QA's `data-columns` assertion, and my own python+git compound command). In review, check every file the round claims against `git status`/`git diff --stat` before trusting the report; keep git out of compound commands.
18. **Diagnose E2E failures from the artifact's `error-context.md` accessibility snapshot, not from component source.** I guessed the Cost tab h2 was "Cost lines"; its accessible name is "Cost lines (0)" (RelatedList/SectionCard append the count), so an exact match failed twice. Also: "No area" rows are the app-wide area-picker convention (unlike company pickers), so area picks need `pickByKeyboard(..., /^No area/)` as `DiaryCapturePage` does. Run `prettier --write` on every memory file you edit — CI `format:check` covers `.claude/`.

Related: [[task-page-specs]], [[detail-template-specs]], [[first-detail-page-adopter-specs]], [[restructure-baseline-hazards]]
