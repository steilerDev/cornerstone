---
name: route-map-staging-specs
description: Hazards when speccing a single route source (shared route map, routeUrl, generated redirects) while target pages do not exist yet — staging, E2E/plan-tool loading without a build, repo-scanning test placement, unmocked gates
metadata:
  type: feedback
---

Found while speccing #2201 (EPIC-21 P0.10, shared route map + NavConfig).

1. **A "final target" route map cannot drive the router while most targets are unbuilt.** "Generated from the map" (AC2) and "today's URLs unchanged" (AC6) conflict unless each entry carries `stage` (`done`/`interim`/`planned`) plus an `interim` target (`'page'` or a one-hop redirect to today's equivalent). The owning story flips the stage later.
   - **How to apply:** for any map-driven router or nav, check every target page exists before calling an entry live. Freeze "today's landing" in the walk test.
2. **E2E CI installs only `npm ci -w e2e` and never builds `shared/dist`.** Runtime imports of `@cornerstone/shared` from page objects fail there. Only `import type` works today.
   - **How to apply:** import `../../shared/src/<module>/index.js` as source (Playwright maps `.js` to `.ts`). Keep that module self-contained, with sibling-only runtime imports.
3. **Plan tooling (`plan/restructure/scripts/*.mjs`) runs without a build.** To read TS data, transpile the folder with `ts.transpileModule` into a temp dir and import it. Reject external imports.
4. **`shared/tsconfig.json` has `types: ["jest"]`, so it has no `node:fs` types.** Repo-scanning tests (walk tests, literal-path guards) belong in `client/src/...`, where node types exist and `templateLiteralKeys.test.ts` sets the pattern.
5. **Before gating a page on `/api/paperless/status`, grep the E2E suites that open it for status mocks.** The auto-itemize suites (6 files) open the page unmocked, so the E2E server reports "not configured" and a redirect gate would break them all.
6. **A literal-path guard collides with API paths:**
   - `/work-items`, `/photos`, `/invoices` are both app and API prefixes;
   - `fastify.get('/login')` in `oidc.ts`;
   - `resp.url().includes('/invoices/')` in page objects.

   **How to apply:** exempt by AST context (first argument of apiClient calls or `fastify.<method>`), not by regex.

7. **Baseline `destinations` counts any array object literal with a `to` key.** NavConfig must use `route`, never `to`.

**Why:** each of these would have surfaced late, as CI-only failures or a silent contract break.

Related: [[restructure-baseline-hazards]], [[url-state-specs]], [[empty-state-replacement-specs]]

**Addendum (CI on PR #2276):** a one-hop walk test also fails on landing pages that write the URL on mount. `ManagePage` ran `setSearchParams({ tab })` in an effect: a push, and a replacement of the whole query. That broke "replace, never push" and dropped the carried query.

- **How to apply:** when speccing a redirect walk, grep every landing page for mount-time `setSearchParams`/`navigate` calls without `{ replace: true }`. Spec those fixes up front: replace, merge into `prev`, and skip when the URL is already equal.
