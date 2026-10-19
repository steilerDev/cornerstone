---
name: history-page-specs
description: Hazards found speccing EPIC-21 #2224 (History page) — query maps on page bases cannot go live, planned contract item shapes vs the existing renderer, derived filter values vs UX, snapshot fields for links, pre-measuring a new screen's baseline closure
metadata:
  type: feedback
---

Found while speccing #2224 (P2.5). Each was invisible in the AC and UX text.

1. **A query map on a page base path cannot be `done`.** `build-routes.mjs` rule 4 rejects it, and `LIVE_REDIRECT_ROUTES` only serves redirect bases. An orchestrator brief said "redirect via LIVE_REDIRECT_ROUTES" for `/diary?filterMode=…`. **How to apply:** use the page-served pattern (`stage: 'interim'`, `interim: 'page'`) and a render-time `<Navigate replace>` wrapper before the page's data hooks mount. `carries` entries like `types->type` are documentation only; the page or helper must do the rename.
2. **A planned contract can specify a response shape that duplicates an existing one.** Contract 17 planned `kind/subject/params/actor` items while the shipped renderer and cards take `DiaryEntrySummary`. A second shape means a second wording path, which ADR-040 forbids. Decide the reuse in the spec and give the architect the contract rewrite.
3. **UX-defined derived filter values can disagree with code that already derives the same concept** (UX: Payment = `depositId`; renderer: `to === 'paid'`). Pick one rule, align the renderer's `kind`, and flag the UX deviation.
4. **A link the UX wants may need data no event stores** (funding source of a bank submission). Add an optional snapshot field (key order matters for R2) and say what older rows show.
5. **Pre-measure a new screen's baseline before the page exists**: run `analyzeFile` + `resolveImport` from `build-baseline.mjs` over the shared components it will import (a script in the job tmp dir). A new screen fails at primaryButtons > 1 or searchFields > 1; a count badge with `background: var(--color-primary)` counts as a primary.
6. **Removing a filter mode ripples into command search** (`searchDestinations.ts` interim extras keyed by `INTERIM_UNTIL`), OIDC `next` E2E targets, and nav tests that freeze "planned" sections.

**Why:** each would have surfaced as a plan:check failure, a reviewer finding, or a second renderer.

**How to apply:** any story that serves a planned route with legacy query URLs, or implements a planned contract next to shipped types.

Related: [[route-map-staging-specs]], [[system-event-specs]], [[restructure-baseline-hazards]], [[url-state-specs]]
