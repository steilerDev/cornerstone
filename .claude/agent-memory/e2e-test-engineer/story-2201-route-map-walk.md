---
name: story-2201-route-map-walk
description: #2201 E2E side - POMs/testData build URLs with routeUrl from shared source; legacy-url-walk.spec.ts design and traps
metadata:
  type: project
---

Page objects and `fixtures/testData.ts` import `routeUrl` from `../../shared/src/routes/index.js` (source import; CI installs only `-w e2e`, no shared/dist). Exported constant names/values unchanged (URLs stay per Q13). API-URL matchers in InvoicesPage/InvoiceDetailPage use regexes (`/\/api\/(?:.*\/)?invoices/`) so the "no app-path literals" guard does not flag them.

`tests/navigation/legacy-url-walk.spec.ts` (desktop only): frozen table of 26 live redirects vs `LIVE_REDIRECT_ROUTES` (E0 fails on unmapped/new routes), history.pushState/replaceState wrapper (`__routeLog`, ignores url-less calls) proves single hop, walks every served page entry from `ROUTE_MAP` (strict: unknown `:param` throws so new routes force a seed), planned routes -> NotFound, 10 planned query maps keep their query, permanent URLs, Paperless-off gate, anonymous context (no login = no rate-limit cost).

**Why:** a new spec file reshuffles shard membership (see isolated-user-fixture.md). **How to apply:** when a later story flips a route stage to `done`, E1b adapts automatically; update the frozen 26-table only when the live redirect set changes.
