---
name: money-overview-2237
description: Money > Overview (#2237) translation decisions - Money = Finanzen on the page, Estimate level term added, Available funds alias, du for helper copy. Read before touching budget.json overview.* keys.
metadata:
  type: project
---

Decisions from the #2237 de delta (budget.json `overview.*`).

- **Page title "Money" is "Finanzen"** (glossary `Money` de, approved). The PO's "keep the page title Money" was read as the glossary canon, so `overview.loading` is "Finanzen werden geladen...". Do not use "Budget" (formerly alias only).
- **Estimate level** is a new `general` glossary term (en Low, Expected, High; de Schätzstufe, Niedrig, Erwartet, Hoch). Its `formerly` holds Min, Avg, Max, Minimum, Average, Maximum, Best case, Worst case. The three values live in the term `note`, because the schema has no per-value form key.
- **Funding total** gained `formerly: ["Available funds"]`. **Left to spend** already held "Remaining budget" and "Headroom"; **Not yet paid** already held "Outstanding".
- Bank overview label reuses the wizard wording: "Budgetübersicht für die Bank" (Budgetübersicht = the budget-overview report type).
- `overview.breakdown.keepOne` is written as a statement ("... bleibt ausgewählt"), not an imperative, because it is a status line.

**Why:** the PO confirmed these in #2237 comments 6395638079 and 6395865337; the glossary canon overrides "more natural" wording.

**How to apply:** when #2237 successors add Money labels, use the glossary de forms verbatim (Noch verfügbar, Finanzierung gesamt, Erwartete Förderung, Nach Förderung, Noch nicht bezahlt). Hand-written test lists that enumerate glossary `formerly` pairs (`glossary.test.ts` PERMANENT_ALIASES) and union-key set counts (`unionKeys.test.ts`) are QA-owned and must grow with these changes.

See [[en-diff-key-sync-2209]] for the order-preserving sync method used here.
