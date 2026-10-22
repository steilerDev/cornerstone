---
name: attention-service-specs
description: Hazards found speccing EPIC-21 #2229 (GET /api/attention) — "identical to page X" ACs where X doesn't show it yet, money-layer rule forces additive engine fields, toEqual-pinned result shapes, planned contract gaps (link/standing), ADR text contradicting the plan
metadata:
  type: feedback
---

Found while speccing #2229 (P3.2). Each was invisible in the AC text.

1. **"Identical to the task page and the Reschedule preview" when neither shows the figure yet.** grep first. Meet it by one exported pure function (`shared/holdsUp.ts`) and have the architect write into the later stories' contracts that they must call it; don't bolt an optional field onto a shared detail type (28 client test literals).
2. **Architecture › Money service rule ("a new money figure is added to the money service, never computed in another service")** means an aggregator that needs per-record money (per-invoice unsplit remainder, open payments per due date) must add it to the money layer, with an invariant test against the existing total (Σ items = stillToPay / notYetSplit).
3. **Engine result fields pinned by `toEqual` in many tests** (`notYetSplit` ×8): add a sibling field (`notYetSplitByInvoice`) instead of widening the object.
4. **Planned contracts can omit what the ACs require** (deep link, a "standing" list). Diff every AC noun against the planned response shape; links go out as route id + params (never paths), with interim targets for `planned` routes pinned by a stage test.
5. **An accepted ADR can contradict the plan** (ADR-040: system events "as one attention row" vs plan: never rows). Route a Deviation Log entry to the architect.
6. **"Today" must be one value per request** and match the scheduling engine (UTC `todayUtc`), or Late counts disagree across surfaces.

**How to apply:** any aggregator/"needs attention"/dashboard service over existing engines. Related: [[money-service-specs]], [[search-service-specs]], [[system-event-specs]], [[read-time-projection-specs]]
