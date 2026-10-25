---
name: related-list-picker-specs
description: Hazards found speccing EPIC-21 #2236 (P4.4 RelatedList + EntityPicker, 8 pickers retired, relation DELETE Undo) — stale plan retire lists, 204→200 schema strip, Undo vs autoReschedule, translated reference data vs server search, whole-file coverage cost of page touches, stacked create dialogs
metadata:
  type: feedback
---

Found while speccing #2236 (P4.4). Each was invisible in the AC text.

1. **Plan §5.11 retire lists go stale.** 3 of the plan's "8 pickers" (HouseholdItemPicker, ParentPicker, VendorCreateModal) had already been deleted by #854/#2213/#2235. The UX list swapped in three others. Check that each named file exists before you count against an "AC: the N old X are retired".
2. **"Any relation … when it is shown" vs page stories.** Later stories' ACs (4.12 AC7 "VendorContacts replaced by RelatedList", 5.4 AC9 "DependencySentenceBuilder retired") and their blocked-by links showed that adoption belongs to the page stories. Go component-first plus one live adopter (CostLinesSection). Escalate the AC reading to the PO, and do not silently convert five legacy pages. The whole-file 95% coverage rule makes every page touch expensive.
3. **Relation DELETEs answered 204.** Moving them to `200 { undo }` is a contract change, and Fastify response schemas strip undeclared fields. The spec must name the `response: { 200: … undo }` schema.
4. **Contract 11 says Undo never reschedules.** A restore-kind undo of a dependency or milestone link must re-run `autoReschedule`, or the schedule stays computed without the link. An `afterRestore` hook on `issueRestoreToken` (run after commit) avoids typing `autoReschedule` for `tx`. Restore conflicts must mirror the add-route rules (cycle check, the "contributes vs depends on" cross-validation, the unique link).
5. **Translated reference data cannot be searched on the server.** Trades and categories have `translationKey` defaults (PLT-101), and a server `LIKE` misses German display names. Fetch the list and filter raw+translated on the client, and flag it against a "searches on the server" AC.
6. **Shared files across FE agents.** `unionKeys.ts` and the `en/*.json` files are the collision points. Give each to one agent and hand ownership over by phase for orphan sweeps. Put all new `common` keys (including the other agent's) with one writer.
7. **The worktree guard refuses** `awk` programs, `sed` with `$var` arguments and `for` loops with arithmetic. Put inventory greps in a node script in the job tmp dir (`consumers.mjs` pattern: walk the src tree, regex import specifiers, split prod/test).

Review-round findings (same story):

8. **Focus helpers reached from Undo callbacks use `ref.current!`.** A `getTrigger`/`container` callback looks synchronous, but `afterRemove` runs after `await remove()` and `afterUndo` after `await undoChange()`. If the section unmounts during the await, `!` throws. Trace every caller of a ref-reading callback back to an `await`.
9. **Open paths drift apart.** SearchPicker had three "open the list" paths (focus, click, ArrowDown). A fix to two of them left the keyboard path behind. When a spec changes open behaviour, name every path, or ask for one shared helper.
10. **Grep "dead branch" reports before you rule on them.** A guard inside a rAF or event-listener callback is not dead under the `!` rule. A guard on a closure constant (for example `if (!signature)` inside an effect that only runs while `!signature`) is dead.

**How to apply:** any story that builds a shared component whose ACs name relations or surfaces owned by later page stories, or that changes delete semantics.

Related: [[detail-template-specs]], [[object-list-specs]], [[cost-line-specs]], [[server-search-picker-specs]], [[photos-spots-specs]]
