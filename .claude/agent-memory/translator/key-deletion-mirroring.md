---
name: key-deletion-mirroring
description: How to mirror en key deletions into de (derive from git diff of en, parse-and-rewrite is lossless for de files)
metadata:
  type: project
---

When frontend deletes keys from `en/`, the translator deletes the same leaf keys from `de/`.

- **Derive the set from the en diff, not from the spec text.** Flatten `git show HEAD:<en file>` and the working-tree en file, and take the keys that disappeared. Cross-check the total against the spec.
- **Rewrite with `JSON.stringify(obj, null, 2) + '\n'` is safe for de files.** Checked on #2259 (2026-11-25): every `de/*.json` round-trips byte-identical, so no escape or formatting noise appears.
- **Prune only emptied objects.** Walk up from each deleted leaf and remove ancestors that became `{}`. Report the list of pruned objects.
- **Verify afterwards:** every remaining de leaf keeps its value (flatten HEAD vs working tree, skipping deleted keys), then run `i18n.parity.test.ts`.
- **Spec counts can drift.** On #2259 the spec said "9 merged keys" for budget, but the key list had 10. Trust the explicit key list and the total.

**Why:** the spec lists keys by hand and can miscount, so deriving from the en diff avoids silent mismatches.
**How to apply:** use this for any en-to-de deletion mirror. Keep canonical German values unchanged.
