---
name: abschlag-glossary-shortform
description: "Abschlag" is a PO-approved short-form of the glossary term "Deposit" (Abschlagszahlung), permitted only under a measured space constraint — recorded in glossary.json itself
metadata:
  type: project
---

Issue #1917/#1959: `product-owner` ruled that `"Abschlag"` (short form) may be used instead of the
glossary term `"Abschlagszahlung"` for the **deposit-reduced inline label**
(`depositReducedInlineLabel`: "abzgl. Abschlag") in the report PDF's Allocated-amount table column.

**Why there's no third option** (the PO's decisive point): the column budget is 75pt.
`"Abschlagszahlung"` alone already consumes 72.85pt — so literally no qualifier of any length fits
alongside it, not `abzgl.`, not `ohne`, not `./.`. Keeping the full term therefore forces dropping
the qualifier entirely, which would silently collapse this label into the visually-similar but
semantically-different **constituted**-deposit label (`(Abschlagszahlung)`, #1923 AC2.1). Those are
different facts on a Verwendungsnachweis: "this row **is** a deposit" vs. "this amount is **reduced
because** deposits were claimed separately" (context restored by #1965's revived footnote,
`depositReducedFootnote` — do not delete that key).

**Recorded directly in `client/src/i18n/glossary.json`** under the `Deposit` term's `de.shortForm` /
`de.shortFormNote` fields (not just in this memory file) — the point is that a future glossary
compliance sweep reading `glossary.json` alone must see the 75pt-column-budget reasoning and refuse
to "fix" `abzgl. Abschlag` back to `abzgl. Abschlagszahlung` in good faith. See
[[nbsp-inline-labels]] for the companion fix (NBSP inside the short-form label itself, to stop it
wrapping mid-bracket) that this same PR round also required.

**`split`'s three German forms — deliberately NOT glossary-pinned**: `anteilig` (adjective, e.g.
"anteilig belassen") / `Anteil` (noun, "...zugeordneten Anteil") / `Teilbetrag` (noun,
`splitInlineLabel`). The PO ruled the glossary exists to prevent _semantic_ divergence across
translators/time, not surface-form variation — pinning one form here would force ungrammatical copy
across an adjective and two nouns that all mean the same thing in context. Recorded on #1917 as
"reject if proposed later" — do not re-propose a `Split`/`anteilig` glossary entry.
