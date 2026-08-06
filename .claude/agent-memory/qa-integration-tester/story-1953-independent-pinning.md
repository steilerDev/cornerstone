---
name: story-1953-independent-pinning
description: Issue #1953 (LETTER_SUBJECT_FONT_SIZE/SUBHEADER_FONT_SIZE split) — mutation-count pitfall and test-title overclaim caught in PR #2035 review
metadata:
  type: feedback
---

Writing regression coverage for `client/src/lib/reportPdf/pageGeometry.test.ts` (two module-private
constants, `LETTER_SUBJECT_FONT_SIZE`/`SUBHEADER_FONT_SIZE`, deliberately split apart with equal
literals). Wrote 3 new tests: pin `PDF_STYLES.letterSubject.fontSize`, pin
`PDF_STYLES.subheader.fontSize`, and a third asserting `PAGE_TOP_MARGIN`/`headerFootprint()`. Ran the
standard backup/restore mutation technique ([[story-1929-round2-real-render-technique]]) both
directions and reported "confirmed discriminating" because the SUBHEADER_FONT_SIZE 12->11 mutation
failed 4 tests, not 1.

`product-architect` caught what the mutation count masked, in PR #2035 review: the third test was
**assertion-for-assertion identical** to a pre-existing test 60 lines below (same two `toBe` checks,
order swapped) — zero added discrimination. The 4-failure count was itself the tell in hindsight: it
included *both* copies of the duplicated pair failing for the identical reason, not four independent
reasons. A mutation count only proves "this mutation moves some needle" — it does not prove each
individual failing assertion is pulling separate weight. Check for duplicate assertions against the
*existing* suite before citing a multi-test-failure count as evidence of thoroughness.

Second, sharper problem: the test's title claimed *"PAGE_TOP_MARGIN does not depend on
letterSubject.fontSize"* while **neither assertion in the body referenced `letterSubject`** — the
title asserted a causal-independence guarantee (issue's own Verification section: "change the
subject size and no page reflows") that the body never tested, because neither constant is exported
so a live-mutation-based standing assertion isn't expressible in the permanent suite. **A test name
that licenses a stronger claim than its body establishes is worse than no test** — a future reader
trusts the name, concludes the guarantee is covered, and stops looking.

Resolution: deleted the duplicate test outright (architect's stated preference over retitling, since
the pre-existing test already covers the formula and duplication is its own maintenance cost) and
left an explanatory comment at the deletion site documenting: why it was removed, that the "no page
reflows" guarantee was only proven by the one-off manual mutation test (not a standing assertion),
and what would make it expressible in code if that changes later (an exported computation helper).

**Why**: mirrors [[bug-1955-echo-race-harness]]'s mutation-probe discipline but adds a check that
discipline didn't include — dedupe candidate assertions against the pre-existing suite, not just
against the new tests in the same PR, before trusting a failure count.

**How to apply**: whenever citing "N assertions failed under this mutation" as proof of
discrimination, first check none of those N are a near-identical restatement of a pre-existing test
elsewhere in the file (same expected values, same formula, reordered). And before naming a test,
re-read the name against only the assertion body — if the name asserts an independence/causality
claim ("X does not depend on Y") but no assertion in the body actually varies or references Y, either
write an assertion that does or narrow the name to what's actually checked.
