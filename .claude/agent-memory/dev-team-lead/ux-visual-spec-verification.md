---
name: ux-visual-spec-verification
description: Verify every token, string and component a UX visual spec names before copying it into an implementation spec — non-existent tokens and baseline-raising labels slip through
metadata:
  type: feedback
---

Before you copy a ux-designer visual spec into a dev spec, verify three things. In #2194, the visual spec named `--color-surface`, which does not exist in `tokens.css` (the card surface is `--color-bg-primary`). It also proposed the label "Fully allocated", a 2-word money label that `npm run plan:check` counts as a baseline rise.

**Why:** implementers copy spec values verbatim. A token that does not exist makes the CSS rule fall back to its initial value, with no stylelint error. A new short money label fails `plan:check` late, in CI.

**How to apply:**

- Grep `client/src/styles/tokens.css` for every `--token` the visual spec names. Substitute the existing token and record the deviation in the spec's Decisions.
- Check each new `en` value against the baseline rule: ≤ 4 words, a `MONEY_WORDS` match, and not a glossary English form. Reword it, or make it longer than 4 words.
- When the designer says "couldn't find X", confirm from code (CSS heights/max-height, layout direction) instead of trusting either side. In #2194 the "100 px cards" really were `InvoiceLinkModal` (a flex-column of 4 spans inside a `max-height:200px` list).

Related: [[restructure-i18n-specs]], [[review-round-discipline]]
