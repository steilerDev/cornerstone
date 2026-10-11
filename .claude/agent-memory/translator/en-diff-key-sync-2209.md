---
name: en-diff-key-sync-2209
description: How to mirror a large en diff (removed/added/reworded keys) into de without reformatting; de order pitfalls; Budget line canon. From #2209 (EPIC-21 grammar foundations).
metadata:
  type: feedback
---

Mirror large `en` changes into `de` with a scripted, order-preserving merge, not hand edits.

- **Why scripted:** all `de/*.json` files (not `glossary.json`) round-trip byte-identically through `JSON.stringify(obj, null, 2) + "\n"`, so a Node script that deletes removed paths, prunes emptied objects, sets added/changed values and re-inserts new keys is exact and cheap. Enumerate the diff with `flatten(en working tree)` vs `flatten(git show origin/beta:…en…)` and `flatten(de)`.
- **Why not reorder the whole object to en order:** existing `de` key order differs from `en` in several places (e.g. `budget.json` `summary`, `invoices`). A full reorder produced ~440 changed lines. Instead, snapshot `de` after deletions (`base`), then insert each new key right after its en predecessor in the working sequence, keeping existing `de` order. The diff then matches the en diff in size.
- **Gotcha:** if you `setPath` new keys before reordering, they appear in `Object.keys(de)` already and never move. Build the order from the pre-set snapshot.
- **Verify:** `git diff --stat` size should resemble the en diff; `git diff -U0` hunks should only touch the intended keys; `node scripts/i18n-audit.mjs` must report no hard findings. Pre-existing glossary "Start" warnings in `common.json`/`schedule.json`/`workItems.json` are not ours.
- **Budget line canon:** en "budget line" is glossary **Cost line** (`Kostenposition`), not the formerly-listed `Budgetposition`. Use `Kostenposition` for `budgetLine.item` and modal copy that says "cost line" or "budget line" in the new #2209 strings.

**How to apply:** for any future en-to-de mirror, script it as above, then check parity, the audit script and the git diff size before reporting.
