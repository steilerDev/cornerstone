---
name: attention-service
description: Attention service (#2229) entry points: GET /api/attention, Not-now snoozes, holds-up single definition, open-payment decomposition
metadata:
  type: project
---

- Entry: `server/src/services/attentionService.ts` `getAttention(db, {userId, vatRate, includeSnoozed, now?})` -> bulk reads -> pure `shared/attentionRules.ts` `computeAttention`. Routes `server/src/routes/attention.ts` (GET, POST/DELETE `/not-now`).
- Holds up has ONE definition: `server/src/services/shared/holdsUp.ts` (`computeHoldsUp`, `summarizeHoldsUp`, `isFoldedLateStart`, UTC `addDaysUtc`/`diffDaysUtc`). Task page (5.2) and Reschedule preview (5.3) must call it.
- Open payments (N4-N6) decomposition lives in `depositAggregateUtils.computeOpenPaymentItems`, read via `moneyService.listOpenPayments`; unsplit remainders via `MoneyResult.notYetSplitByInvoice` (H2).
- Snoozes: preference key `attention.snoozed` (`attentionSnoozeService`), until-exclusive, 500 keys / 16 KB; PATCH preferences validates strictly for that key.
- Interim links for planned routes (`grant`, `fundingSource`) only in `shared/attentionLinks.ts`.
- Server sends no UI words; params carry record facts only (no user fields).
