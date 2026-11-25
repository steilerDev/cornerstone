---
name: dead-key-specs
description: Hazards when speccing an i18n dead-key / duplicate-key cleanup (EPIC-21 P6.1b) — dynamic-key sources a naive grep misses, how to compute the exact list, merge scope, baseline drop
metadata:
  type: feedback
---

A naive literal scan of `client/src/i18n/en` reports far more dead keys than exist. In #2259 it said 504 (matching the plan's "about 500"); the real set was 71. The rest were used through:

- `I18N_UNION_KEYS` (389 keys). Evaluate the registry exactly: `node --import <hook>` with a resolve hook that maps missing `./x.js` to `./x.ts` runs `client/src/i18n/unionKeys.ts` under Node 24 type stripping (shared resolves to the prebuilt dist).
- DB `translation_key` values (`server/src/db/migrations/0030_translation_keys.sql`, read by `client/src/lib/categoryUtils.ts`): trades, budgetCategories, householdItemCategories in `settings`. Scan migrations SQL too.
- i18next `context:` suffixes (GanttBar `_range/_from`) and plural `_one/_other`: strip up to two `_[a-z]+` suffixes.
- `t(` template heads (`color${…}`, `attachmentsNote_${…}`). Only `t(` heads; a generic template head (`table.${`) hides real dead keys.

**Why:** an AC count from planning is a naive scan; trusting it would delete live reference-data labels and union labels.

**How to apply:**

- Check the open sibling branches (`git grep` on `origin/<branch>`) before deleting a key; check the branch's own diff from its merge-base, not `HEAD..branch`.
- Deleting en values can drop a `moneyLabels` entry in `baseline.json` ("baseline is behind"). Simulate with `normalizeLabel` + the `MONEY_WORDS` array read from `build-baseline.mjs` (not exported), and route a `plan:build` to the architect after the frontend step.
- AC2 merges: limit to visible action-button labels/"Loading..." with identical en and de values; keep keys pinned by E2E `i18nValue(...)` out of scope to avoid an E2E task; `t('common:button.x')` works from any namespace `t`.
- Locale diffs must be deletion-only. Rewriting with `JSON.stringify(obj, null, 2) + '\n'` is safe: on #2259 every `en/*.json` and `de/*.json` round-tripped byte-identical (no `\u` escapes exist). Agrees with translator memory `key-deletion-mirroring.md`.

Related: [[vocabulary-pass-specs]], [[restructure-i18n-specs]], [[restructure-baseline-hazards]]
