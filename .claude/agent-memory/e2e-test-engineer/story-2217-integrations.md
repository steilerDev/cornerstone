---
name: story-2217-integrations
description: #2217 Settings > Integrations E2E - POM/test ids, Paperless-off Documents section rules, shared mock helpers, live-run traps
metadata:
  type: project
---

- `IntegrationsPage` POM + `fixtures/integrationsMocks.ts` (`integrationsBody`, `PAPERLESS_PROBE`). Test ids: `integration-<anchor>` (card), `-status` chip, `-fact-<name>`, `-env`, `-docs`, `integration-paperless-recheck`, `integrations-status` (live region).
- Documents section with Paperless OFF: renders nothing with no links; with kept links a read-only list + `documents-paperless-off` line (+ `documents-integrations-link` for admins only). Kept links lose Itemize/Details/Unlink, so any spec that mocks linked documents and needs those buttons must also mock a configured Paperless (`fixtures/paperlessMocks.ts` `mockPaperlessConfigured`; `paperlessInvoiceMocks.ts` has its own same-named one - do not import both).
- "Absent" assertions need `openAndSettle` (waits for status + document-links responses) or they pass before the section loaded.
- Region name of the Documents section includes the link count: match `/^Documents/`, not exact.
- On phone/tablet the h1 is a title-menu BUTTON: never assert `main` has 0 buttons, look inside the cards.
- Same-document hash navigation keeps focus: `goto('about:blank')` first when asserting an unknown anchor does nothing.
- Member spec reuses the `member-access` isolated user (no extra login). Login limit no longer binds in E2E (container sets AUTH_RATE_LIMIT_MAX=1000).
- Quotation convert dialog hides Source document (Paperless off) and the AI block (llmEnabled off) entirely.
