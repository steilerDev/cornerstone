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

- **Token remaps regress pairs the visual spec never measured.** In #2200 the UX spec listed the D-26 pairs only. A same-rule scan (each CSS rule with both `color: var(--x)` and `background: var(--y)`, resolved before and after the remap, in both themes) found 8 rules that newly failed AA in dark: lightening `--color-bg-tertiary` dropped muted text from 4.64 to 4.04. Run that scan before speccing any token value change, and list the fixes in the spec. Exclude `:disabled` rules (WCAG-exempt). Turn the scan into a ratchet test with a frozen allowlist of pre-existing failures, so the list can only shrink.
- **Check that a "do X" premise isn't already done.** In #2200, "hide Users/Backups tabs for members" already existed (`visible:` on all 5 Settings tab arrays). Verify it with tests instead of re-implementing it. That also kept out a file another story had in flight.
- **Check a visual spec's "before" state.** "Hover border becomes border-strong" was a no-op, because the resting border already used that token.

Related: [[restructure-i18n-specs]], [[review-round-discipline]]
