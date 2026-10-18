---
name: integrations-page-specs
description: Hazards found speccing/reviewing EPIC-21 #2217 (Settings > Integrations, admin status endpoint, env text moves) — statusVocabulary leaves must be glossary terms, new components/ dirs fail the baseline, NavAnchor is not a destination, admin-only fields needed by member screens, EmptyState p/h1 only, userinfo in "exact" URLs, constants imported from component files inflate closure counts
metadata:
  type: feedback
---

Found while speccing #2217 (P1.10). Each was a premise in the UX or architect text that the code contradicted.

1. **Every `common:statusVocabulary.*` leaf must equal a glossary term** (`glossary.test.ts` AC3 mapping covers every leaf). Non-record system states (Connected / On / Off / Not set up, backup Succeeded / Failed) go in their own `I18N_UNION_KEYS` sets outside `statusVocabulary`. The colours still come from `statusBadgeVariants.tsx`. Otherwise the story silently needs PO-approved glossary terms.
2. **A new `components/<X>/<X>.tsx` is a baseline rise** unless `X` is in `baseline.json` `allowedAdditions` (`compareBaseline`). Small navigation helpers can live in `client/src/navigation/` (precedent: `NavAnchor`, `PageBreadcrumbs`); page-only parts live in the page folder.
3. **`NavAnchor` is not counted as a destination.** Only react-router `Link`/`NavLink` JSX and array literals with `to` are counted. UX specs keep predicting `destinations` from NavAnchors.
4. **Check the audience of every field a correction reuses.** "Use the server davUrl on Account" pointed at an admin-only endpoint, while Account serves every user. That needs an additive field on a member endpoint, so escalate to the architect.
5. **`EmptyState.messageAs` is `'p' | 'h1'` only, with no ref.** A page-section error heading that takes focus needs an extension (`h2` + `messageRef`).
6. **A contract that says "the exact value sent" can carry credentials.** `EXTERNAL_URL` or `PAPERLESS_URL` with `user:pass@` would reach the browser. Strip user info in the displayed value and flag it to security.
7. **Moving env text off work screens touches many E2E specs** that assert the disabled "+ Add Document" button and the "not configured" banner (about 6 spec files). Grep `e2e/` for the old strings and `toBeDisabled` and list every file in the E2E spec.
8. **Flipping a NavConfig view's route to `done`** breaks `navConfig.test.ts` ("hides planned views") and needs entries in the E2E sweeps that guard served pages (`page-identity-sweep` servedPageIds, shell-reach, no-tab-rows, sidebar link lists).

9. **Importing a constant from a component file pulls the whole component into the page's closure.** In #2217, `IntegrationsPage` imported `CALENDAR_SYNC_ANCHOR` from `DavAccessCard.tsx`. That gave the read-only page a phantom `primaryButtons: 1` and bundled the card's dialog code into its chunk. The implementers blamed EmptyState. In review, trace any unexpected count with `analyzeFile` per closure file. Spec shared anchors and ids in their own constant modules.

**How to apply:** any status-board, settings or read-only admin page, any story that adds Badge vocabularies, and any correction that reuses a field across roles.

Related: [[project-setup-specs]], [[restructure-baseline-hazards]], [[status-vocabulary-switch-specs]], [[settings-page-relayout-specs]]
