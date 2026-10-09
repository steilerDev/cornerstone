---
name: restructure-i18n-specs
description: EPIC-21 hazards when a spec adds en i18n keys or new glossary/status vocabulary — the pattern-baseline money-label check, legacy key-set duplicates, and transition rules
metadata:
  type: feedback
---

Adding **any** `client/src/i18n/en/*.json` value of at most 4 words that contains a money word ("to pay", "paid", "budget", "cost", "amount" and so on) is a pattern-baseline rise. `npm run plan:check` fails on it, even when no UI renders the key. #2192 (glossary v1) found this through "To pay".

**Why:** `build-baseline.mjs` counts distinct normalised money labels across `en/` and treats every new one as a rise. Only `allowedAdditions.sharedComponents` existed as an escape hatch.

**How to apply:**

- Before speccing new `en` keys, check each value against `MONEY_WORDS` in `plan/restructure/scripts/build-baseline.mjs` and against `baseline.json` `measured.moneyLabels.values`.
- #2192 specced a glossary-derived exemption. If it merged, glossary English forms are approved, and a new approved word must enter `glossary.json` in the same PR. Verify the exemption exists before relying on it.
- Approved status words stay in new canonical key sets (`common:statusVocabulary.*`) until the story that switches consumers, so "no visible change" stories never edit existing label values.
- A translator "glossary compliance" sweep would rename former words in shipped `de` strings early. Specs must state the `transition` rule: renames happen only in the story that renames that label.
- In the plan, §2.0 decisions supersede the older tables. "Tight" is not a verdict (§2.0 #23), even though §7.3 and §2.0 #6 still list it.

Related: [[governance-story-specs]], [[review-round-discipline]]
