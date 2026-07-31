---
name: empty-selection-error-code
description: EMPTY_SELECTION is a real pre-existing ErrorCode with no locale entry in en or de until issue #1901 — verify server code before treating a "backfill" key as new or as translator-only work
metadata:
  type: project
---

Translator Spec for issue #1901 asked to add `errors.json: EMPTY_SELECTION` as a "backfill of a
pre-existing error code" and to check whether `de/errors.json` already had it. Verified via:

- `server/src/errors/AppError.ts:278` — `super('EMPTY_SELECTION', 400, message)`
- `shared/src/types/errors.ts:50` — `'EMPTY_SELECTION'` listed in the `ErrorCode` union
- Referenced in `server/src/services/budgetSourceService.move.test.ts` and
  `server/src/routes/budgetSources.move.test.ts` (unrelated budget-source-move feature, not #1901)

Neither `en/errors.json` nor `de/errors.json` had the key before this session — it's a genuine
gap that predates #1901, not something introduced by this feature. Added the German translation
("Wählen Sie mindestens eine Rechnung aus.") independently of the frontend-developer's parallel
English addition; confirmed both are needed via a flattened-key diff after the fact.

**Why:** avoids two mistakes — (1) assuming a "backfill" instruction means the key already exists
somewhere and just needs copying, when it may not exist in either locale yet; (2) skipping the
translation because "it's not really part of this feature," when missing error-code translations
are a real user-visible bug regardless of which feature surfaces them.

**How to apply:** when a spec describes a key as a "backfill" or "pre-existing", grep the actual
source (`server/src/errors/`, `shared/src/types/errors.ts`, or equivalent enums) to confirm the
code exists before translating, and always check both locale files rather than trusting the spec's
claim about which one is missing it.
