---
name: company-page-specs
description: Hazards found speccing/reviewing #2244 (company page): planned-contract alias removal, subject-history without own events, per-list delete focus, analyzer array-literal `to` rule
metadata:
  type: feedback
---

Found while speccing and reviewing #2244 (P4.12).

1. **The analyzer counts an object literal with a `to` key inside an array literal as a destination.** Spec `facts.push(...)` / `.map(...)` for SummaryStrip link facts and RelatedList rows on pages whose baseline has 0 destinations.
2. **A planned contract's "alias until the client stops reading it" triggers in the story that rebuilds the client.** Remove the alias (`outstandingBalance`) there, and grep e2e + server fixture tests that read it.
3. **Delete focus must be decided per list, not per tab.** RelatedList renders its `-add` button only while non-empty; deleting the last row of one list (others still filled) unmounted the focus target after the refresh. Use "last in its own list → h1".
4. **Retry in a data hook must clear the stored failure** or the panel shows the same error with no feedback (ObjectHistorySection pattern).
5. **A subject with no own events (company) needs a History filter over its records' events** plus a metadata clause for events of deleted records; keep batch collapse off when a batch spans subjects.
6. **Money-label pre-check catches UX wording** ("Paid so far" was a rise; "Paid" is in base).
7. **`defects.json` pins test titles (D-06, D-07)** in files a page rebuild rewrites; name them in the QA/E2E spec.

**How to apply:** any object-page rebuild on the detail template with relation lists and figure surfaces.

Related: [[first-detail-page-adopter-specs]], [[financing-pages-specs]], [[restructure-baseline-hazards]], [[related-list-picker-specs]]
