---
name: home-service
description: #2230 Home endpoints (/api/home/week|pulse|setup), heldUpCauseOf, stillToPayCount, home.* preference validation, migration 0048
metadata:
  type: project
---

- `server/src/services/homeService.ts` (`getHomeWeek/Pulse/Setup`), `routes/home.ts`; agenda subjects/links reuse `attentionLinkOf` (rules N1/N3/N5/N10 as link proxies) so keys equal attention rows.
- `heldUpCauseOf` in `services/shared/holdsUp.ts` is the single definition; `isFoldedLateStart` delegates to it.
- `MoneySummary.stillToPayCount` = `computeOpenAmounts().openPayable.count` (offers + invoices disjoint). `OpenPaymentItem.vendorId` feeds `companyId` on N4-N6 params.
- Home preference validation lives in `shared/src/lib/homePreferences.ts`; `routes/preferences.ts` calls it for the 4 `home.*` keys.
- Migration 0048 maps `dashboard.hiddenCards` -> `home.hiddenSections` (a section hides only if all its old cards were hidden); test it with a throwaway better-sqlite3 script, not a test file.
- Existing tests that build `OpenPaymentItem`/`OpenPaymentRow` fixtures need `vendorId`/`vendor_id` (QA owns).
