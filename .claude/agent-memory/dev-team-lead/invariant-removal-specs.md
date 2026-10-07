---
name: invariant-removal-specs
description: Checklist for specs that remove a business invariant/error code — inverse-direction guards, lock-step i18n tests, client pre-checks that mirror the server, stale user docs
metadata:
  type: project
---

When a story removes a server invariant (e.g. #2188 dropped `DEPOSITS_EXCEED_INVOICE_TOTAL`), grep the **error class and code**, not just the paths the issue names. The issue listed create/update, invoice-amount decrease and convert-quotation, but the same code also guarded the _inverse_ direction (refund decrease/delete, #2127) — that guard exists only to protect the removed invariant, so it must go too or the code survives.

**Why:** issues describe the invariant by its user-visible entry points; follow-up hardening stories add more guard sites under the same code.

**How to apply:**

- Enumerate every `throw new <Error>` site and every client `code === '<CODE>'` branch; classify each as "protects the removed invariant" vs "independent".
- `client/src/i18n/errorCodes.coverage.test.ts` (ERROR_CODES ⇔ en/de errors.json) and `i18n.parity.test.ts` (en ⇔ de) force shared tuple, en and de removals to land in the same PR — sequence translator after frontend, never split across PRs.
- Client mirrors of the rule (pre-checks disabling submit, `role="alert"` banners, danger styling) become advisory: drop from `canConfirm`, demote to `role="status"` + warning tokens, recopy.
- Grep `docs/src/` for the rule's prose — user guides state the old rule and need a docs-writer pass.
- Related: [[review-round-discipline]]
