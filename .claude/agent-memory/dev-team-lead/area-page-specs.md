---
name: area-page-specs
description: Hazards found speccing EPIC-21 #2251 (area page) — SectionCard Save in a read-only closure, money-label scanner, nonexistent "money gate", PO premise that byArea is direct, getAreaSummary name collision, interim consumer list in the routemap note, capmap rows naming Area page Edit/Delete, ObjectHeader always renders the ⋯ menu
metadata:
  type: feedback
---

Found while speccing #2251 (P5.7). Check the same on any later page story.

1. **"The money gate" does not exist in code.** routeMap gates are `none | paperless | paperless+ai`; every member sees money and the Task strip always shows Expected cost. A UX/PO AC about money "when the gate is closed" is a premise defect: flag it, do not invent a gate. SummaryStrip also needs 4 to 7 facts, so "3 facts without money" was impossible anyway.
2. **`MoneySummary.byArea` and the breakdown `byArea` are already subtree roll-ups** (engine `computeByArea`), although the PO ruling called them "per direct areaId". Own (direct) figures = subtree minus direct children's subtree, in cents (`toCents`). Read the engine before accepting a "needs a roll-up" premise.
3. **`getAreaSummary` / `AreaSummary` already mean "area plus ancestors"** on every task/purchase payload. A contract named "area summary" needs other type/function names (`AreaPage*`).
4. **The routemap.json `note` of a planned route lists its interim consumers** (search results, diary chips, AreaLink). Grep `routeUrl('<index>')` plus "Interim until route" comments too; the strips had more than the note listed.
5. **Capmap rows of sibling capabilities can promise surfaces the PO ruled out** (PLT-095/096/097 named "Area page > section Edit / ⋯ > Delete"). Rewrite their `to`/`acceptance` with a story note; never leave a capability pointing at a surface that will not exist.
6. **`ObjectHeader` always renders ⋯ (Copy link, Print).** "No page ⋯" from UX/PO means no extra items (no Delete), unless the story extends the header.
7. Breadcrumb ancestors that are not route-map parents (area tree) need a `PageBreadcrumbs` extension; the route chain stops at the index.

Related: [[purchase-page-specs]], [[milestone-page-specs]], [[money-service-specs]], [[route-map-staging-specs]]

Review round 1 (same story):

8. **A read-only page that imports `SectionCard` counts its Save as a second primary** (the baseline walks the static import closure). The cap for a new screen is 1. Fix it by extracting a frame helper (`SectionCard/SectionCardFrame.tsx`, which SectionCard itself renders) and having the page import that file directly, never through the `index.ts` barrel. Do not grant an allowance.
9. **Money labels: any en value of 4 words or fewer (after `{{…}}` is stripped) that contains a MONEY_WORDS term must equal a baseline label or a glossary en form.** Spec copy like "‹x› paid", "No costs yet" or "Open the budget overview" fails. Use the glossary word as its own label ("Paid" plus a figure span), the SummaryStrip default emptyText, and the destination's nav label ("Money"). Pre-check spec copy against `MONEY_WORDS` in `build-baseline.mjs`.
