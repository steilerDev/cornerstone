---
name: translation-decisions-history
description: Past per-issue translation judgment calls (report wizard, cover letter signature block, diary sourceType fixes, cost perspective, budget section names) kept as precedent
metadata:
  type: project
---

**Diary glossary fixes (#1812).** `detailPage.sourceType.budget_source`: "Budget Quellen" → "Budgetquellen". `subsidy_program`: "Zuschuss Programme" → "Förderprogramme". `subsidy_status` and `typeBadge.subsidyStatus`: "Zuschussstatus" → "Förderprogrammstatus" (matches the compound pattern `Rechnungsstatus`).

**Report wizard expand/deposit keys (#1891).** `itemColumnHeader` "Item" → "Position". `datesColumnHeader` "Dates" → "Termine". `linkedColumnHeader` → "Verknüpft mit". `budgetSourceNone` "None (pro-rated)" → "Keine (anteilig)". `confirmClaimExcludedItemsWarning` follows the sibling `confirmClaimBody` pattern and uses "eingereicht".

**Cover letter signature block (#1932).** `signatureLabel` → "Unterschrift". `coverLetter.closing` → "Mit freundlichen Grüßen," (rendered via `reportT()`, letter register). `editable.closingLabel` → "Grußformel" (UI chrome via `t()`, paired with "Anrede"). Rule of thumb: the call site decides chrome versus content (`t()` versus `reportT()`), not the JSON namespace.

**Cost perspective (`overview.costBreakdown.perspective.avg`).** "Avg" → "Ø", because it must fit a 3-way toggle.

**Section navigation (#1887).** See the aria-label pattern in [German conventions](german-conventions.md). `DashboardPage.tsx` and `VendorsPage.tsx` hard-code their labels, so there is no de counterpart for them.

**Budget "allocated" vocabulary (#1887).** zugeordnet / Zuordnung. `splitFootnote` uses "Der angezeigte Betrag umfasst nur den dieser Quelle zugeordneten Anteil."
