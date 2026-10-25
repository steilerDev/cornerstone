---
name: money-overview-specs
description: Hazards found speccing EPIC-21 #2237 (P4.5 Money › Overview) — reserved baseline component names, route-map params that already exist, glossary-former UX labels, ADR clauses that forbid UX columns, money-label rewording patterns, totals that need Not-yet-split/orphan rows
metadata:
  type: feedback
---

Found while speccing #2237. The UX spec missed every one of these.

1. **Check `baseline.json` `allowedAdditions.sharedComponents` before you name a new component.**
   - The UX proposed `MoneyHeadline`. ADR-039 §5 had reserved `MoneyFigure`, and only the
     reserved name is not a baseline rise.
   - Grep the ADRs for the reserved name as well.
2. **The route map may already carry the planned query param under another name.**
   - The UX proposed `?view=`. `routeMap.ts` and `routemap.json` already carried `by` for that
     route.
   - Read the route's `carries` and note before you accept new params.
3. **UX group labels can be glossary `formerly` words.**
   - The UX labelled a chip group "Cost basis", which is a former name of Expected cost.
   - Run the label list against `formerly` and `doNotUse`, not only `MONEY_WORDS`.
4. **ADR clauses can forbid a UX column.**
   - ADR-039 §5 said "per area … no Paid". The UX table had Paid and Still to pay per row.
   - Spec the amendment (attribute each record's Paid by itemized share, with largest remainder
     and the unsplit remainder as one more weight), and escalate it to the architect as blocking.
5. **Reword money labels to keep the baseline flat:**
   - split "Label: {{n}} of {{N}}" into a baseline label key and a count key;
   - drop "By " prefixes from chip labels;
   - use a visible group label plus a glossary chip label ("Show" + "Grants").
   - Check the result with the job-tmp `checklabels.mjs`.
6. **Verify each UX data premise against the schema.**
   - "A line split across funding sources" cannot happen: `budget_source_id` is a single column.
     So the source view partitions the lines and equals `sources[].allocated`.
7. **A breakdown total equals the project facts only with extra rows.**
   - It needs a "Not yet split" row and the orphan lines (ADR-030); the legacy breakdown
     inner-joined the items and dropped the orphans.
   - Spec those rows, and spec "Σ rows = total = money" assertions per view.
8. **A capability `to` may require a deeper tree than the UX.** MNY-002 needs the cost-line level.
   As in [[cost-line-specs]], the capmap wins.
9. **A drill-down list where every parent row drills in loses its links.** The spec said
   "items always have lines", so on phone no task/purchase link was ever reachable (MNY-002's
   "items (link)"). Spec the drilled heading as the item link (NavAnchor, uncounted).
10. **Translated reference names are not user text.** A category label from
    `getCategoryDisplayName` with a `translationKey` must not get `useUserText()`.

**How to apply:** any story that builds a page over the money service, or adopts a UX spec that
names a new shared component or new URL params. Related: [[money-service-specs]],
[[consistency-test-specs]], [[ux-visual-spec-verification]], [[restructure-i18n-specs]].
