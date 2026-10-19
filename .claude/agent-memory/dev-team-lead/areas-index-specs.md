---
name: areas-index-specs
description: Hazards found speccing EPIC-21 #2218 (Areas index, TreeTable, delete Undo, sibling reorder) — sharedComponents counts only X/X.tsx, controls exported from dialog files leak primaries, routemap.json has no stage, status-undo cannot undo a delete, contract 19 excludes blockers, planned-route example ids in tests
metadata:
  type: feedback
---

Found while speccing #2218 (P1.11). Each was a premise in the UX or orchestrator text that the code contradicted.

1. **`sharedComponents` counts only `components/X/X.tsx` (or `components/<lowercase domain>/X.tsx`).** Helper files such as `components/ObjectForm/ColorField.tsx` or `components/TreeTable/TreeTableGroup.tsx` do not raise the baseline. UX specs keep claiming that any new file name under `components/` is a rise.
2. **"Export the control from its existing home" can leak primaries.** The colour control lived in `ReferenceListDialog.tsx` (primaryButtons 1). If `ObjectFormField` imported it from there, every ObjectForm screen would gain +1. Move shared controls into their own module (see [[integrations-page-specs]] 9).
3. **`plan/restructure/routemap.json` has no `stage` field.** The stage lives only in `shared/src/routes/routeMap.ts`. A stage flip changes routeMap.ts and the generated `router-routes.json` (`plan:build`), not routemap.json.
4. **The undo service (contract 11) snapshots status columns only.** "Undo a delete" needs a new snapshot kind (restore closure), `UNDO_SUBJECT_TYPES` grows (the `SUBJECTS: Record<UndoSubjectType,…>` map then breaks), and DELETE changes from 204 to 200 `{ undo }`. That is an architect contract change, not a backend detail.
5. **Contract 19 (delete-impact) never reports blockers.** Its rule is that what makes the DELETE 409 is not an effect. "Delete-impact reports tasks and purchases" contradicts it. Take blocked counts from data the page already holds (contract 10 counts), and treat a stale 409 as "refetch, then show blocked".
6. **Tests use the planned route as their example.** `routeUrl.test.ts` used `'areas'` for "not served" (including a `@ts-expect-error`, which becomes a tsc failure once the route is served). Every route flip needs a sweep for tests that pin the old stage, such as `navConfig.test` "hides planned", `searchDestinations.interim.test` and the Sidebar tests.

**How to apply:** any story that serves a planned route, adds a delete Undo, builds a tree/list component, or reuses a control across a dialog and ObjectForm.

Related: [[project-setup-specs]], [[restructure-baseline-hazards]], [[route-map-staging-specs]], [[integrations-page-specs]]
