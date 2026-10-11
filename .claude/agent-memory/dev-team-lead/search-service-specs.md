---
name: search-service-specs
description: Hazards when speccing/reviewing a cross-entity search endpoint (EPIC-21 1.4) — fold fn per connection, fold-before-escape, Paperless latency + fail-closed filter tag, no UI words from server, planned-route mappers, label-first ranking, verify exemption reasons, phone literals vs privacy scan
metadata:
  type: feedback
---

Found while speccing #2210 (P1.4, `GET /api/search`).

1. **A custom SQLite function (`fold`) exists only on connections that register it.** The db plugin is the only app connection, but every service test that builds `new Database(':memory:')` must call the same `registerSqlFunctions`. Spec one exported registrar and list it in the QA spec. Restore exits the process, so there is no reconnect path.
2. **Fold first, then LIKE-escape.** Folding never produces `% _ \`, but escaping first lets digraph rules rewrite escape sequences. A query made only of combining marks folds to `''`, so guard it.
3. **Digraph folding (`ae→a`) misses queries that start inside a digraph** ("ebel" vs "Goebel"). Document it as a known limit; don't try to fix it with FTS.
4. **`paperlessService.listDocuments` has no timeout and resolves names N+1.** Latency-bound callers need their own one-call helper with an `AbortSignal` threaded through `fetchPaperless`. Use an injectable `timeoutMs` so tests can use 50 ms.
5. **The server must not emit UI words.** The contract's "sublabel names the kind" became raw `status`/`kind` fields. Check every planned contract field for this.
6. **`routeUrl` refuses `planned` ids at the type level.** A result→URL mapper needs interim targets (e.g. Manage `?tab=areas`, the external Paperless details link) plus a QA test that pins `stage === 'planned'`, so the flipping story is forced to update it.
7. **Contract says aliases are client-side, but the AC sits on the service story.** Ship a non-UI client library slice (resolver plus mapper) in the service story. Use `route`/`term` keys, never `to`/`href`/`label` (baseline and noTabRows guards).
8. **`scan-privacy --profile full` flags phone-shaped synthetic literals** (`+49 …`, `0171-…`). Use short obviously fake digit strings in specs and tests.

Found while reviewing #2210:

9. **A "min over all fields" rank silently replaces a label-first contract.** The tests encoded the deviation (description-exact sorted first). Read ranking tests against the contract text, not the code.
10. **A filter tag that is documented as privacy fails open in `resolveFilterTagId`.** It returns null on any error, and the callers dropped the filter. The owner chose fail-closed on every path: list, search, upload and by-id reads (404 same as missing), with bulk enrichment degrading to an empty result. Grep every document read when a "visibility" config is involved.
11. **Verify the reasons in exemption lists.** "Diary has no type filter route" was false: `?types=` existed. Each reason is a claim to check against the page and the route map's `carries`.

**How to apply:** check all eleven for any aggregator, search or "global" read endpoint.

Related: [[route-map-staging-specs]], [[nav-shell-specs]], [[restructure-baseline-hazards]]
