---
name: glossary-decisions
description: Log of product-owner approve/reject decisions on client/src/i18n/glossary.json term proposals from the translator, with the reasoning used
metadata:
  type: project
---

# Glossary Approval Decisions

The PO owns approval of `client/src/i18n/glossary.json` additions. The translator proposes; I approve or reject as part of the PR review that carries the proposal.

## Criteria I apply

A term earns a glossary entry when **all** of these hold:

1. **Domain term, not generic UI copy.** It names a modeled concept (entity, entity type, status, lifecycle stage) — not a verb or chrome word ("Save", "Filter").
2. **Appears in multiple surfaces.** Badge/label + form control + error string, etc. One-off strings don't need pinning.
3. **Sits in a family already pinned.** If a sibling term is in the glossary, the new one belongs too, or the pair will drift.
4. **The translation resolves a real ambiguity.** Bonus weight when the chosen German term must be distinguished from a plausible-but-wrong alternative.

## Decisions

| Term     | German                            | Decision     | Date                               | Reasoning                                                                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------- | ------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Refund` | Rückerstattung / Rückerstattungen | **Approved** | 2026-07-29 (PR #1880, story #1876) | First-class `entryType` value on the deposit entity; surfaces as badge label, radio option, form hint, and error string. Pairs with the already-pinned `Deposit` → Abschlagszahlung. _Rückerstattung_ correctly distinct from _Gutschrift_ (credit note = accounting document, different concept) — the ambiguity is real and worth pinning. |

## Report-type nouns (bank-facing copy, PR #1887 / story #1879) — approved 2026-07-30

Not glossary entries (single-feature copy, criterion 2 fails), but locked-in decisions — do not re-litigate:

| English        | German                  | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proof of Funds | **Verwendungsnachweis** | The report's payload is claimed/paid invoices = evidence of _how disbursed funds were used_, which is exactly what a German lender or KfW programme means by Verwendungsnachweis. Rejected the literal "Nachweis vorhandener Mittel" — that means proving funds _exist_ (a balance confirmation), a different document that would misrepresent the payload. **English/German asymmetry is intentional**, not drift; a possible later English rename to match is a separate copy story. |
| Claim          | **Einreichung**         | Extends the `claimed` = "Eingereicht" status vocabulary from #1876/#1877 so the report type matches the badge the user already sees. Derived strings verified: subject "Einreichungsunterlagen", body "…zur Erstattung ein", table title "Einreichungsbericht" all read correctly to a German bank.                                                                                                                                                                                    |

Optional, deliberately **not** requested: for `bank_loan` sources German lenders usually say _Mittelabruf_. A source-type-aware subject would read better, but "Einreichung" must also cover subsidy programmes, and consistency with the status label wins.

**Precedent:** semantic accuracy beats literal fidelity on outbound financial copy. When the translator flags a literal-vs-domain-term choice, check what the artifact actually _contains_ and name that.

## Recurring notes

- Always verify the proposed term is **actually used consistently** in the accompanying `de/*.json` strings before approving — check the error-code string too (`errors.json`), which is easy to miss since it lives in a different namespace.
- German casing slips through repeatedly: verbs/adjectives are **not** title-cased ("Bericht erstellen", not "Bericht Erstellen"). Found in PR #1887.
- Related: [[pr-review-patterns]], [[bank-report-wizard]].

## Pending — next glossary refinement pass

- **"AI" → de "KI"** (proposed by translator during story #1901, 2026-07-31). PO agrees it warrants a glossary entry; deferred to the next refinement pass rather than added mid-story. German copy in the report wizard already uses KI consistently ("KI-Unterstützung aktivieren", "Mit KI generieren", "KI-Generierung fehlgeschlagen") — the entry should codify that existing convention, not change it.
  - Second call site as of 2026-08-01 (PR #1916 round 2): the four shared `LLM_*` error strings were reworded feature-neutrally to "KI-Unterstützung" / "Der KI-Dienst …" in `client/src/i18n/de/errors.json`. The glossary entry now has both the report-wizard UI copy and the shared error taxonomy behind it.
  - **DECIDED 2026-08-01: APPROVED.** `AI` → `KI`, compound `AI assistance` → `KI-Unterstützung`. Recorded as a bullet on follow-up issue **#1917**; `translator` implements the `glossary.json` edit next cycle. PO did not edit the glossary directly. Rationale: KI is the standard German rendering, the de copy across the report wizard UI and the four shared `LLM_*` error strings already uses it consistently, and both translator and PO flagged it independently — the entry codifies existing practice. **No string changes should result**; a German string still saying "AI" after this lands is a bug, not evidence against the entry.
