---
name: lint-rule-specs
description: Speccing an ESLint rule story (EPIC-21 P6.1c hard-coded strings) — probe the selectors against the tree first, flat-config rule replacement, message-filtered probe tests, sanctioned escapes
metadata:
  type: feedback
---

Before speccing a new lint rule, run the candidate selectors against the tree with a throwaway config in the worktree root (`eslint.probe.config.js` importing `./eslint.config.js`, run `npx eslint -c … -f json`, then delete it). On #2260 a broad aria-*/prop selector set gave 600+ hits (aria-hidden, role, testids); the narrowed text-attribute list gave exactly 23 hits in 6 files. That exact list became the frontend fix list and the backend's verification target.

**Why:** a planned "hard-coded string lint" sounds L-sized; measured, it was M. Guessing the selector set ships either a noisy rule or an unbounded fix task.

**How to apply:**

- Flat config: a later block setting `no-restricted-syntax` for the same files **replaces** the earlier array. Append new selectors to the existing client block (the #2129 one).
- Probe tests share the rule id with other selectors: filter by a tag in the message (`#2260`), not by `ruleId`. Harness: `client/src/lib/apiErrorMessageLint.test.ts`.
- Letter class `[A-Za-zÀ-ÖØ-öø-ÿ]` skips × and ÷ (both sit inside À-ÿ).
- Non-language text (brand, endonyms, glyphs) is fixed by an existing key or a named module constant; three duplicate endonym maps existed, consolidated to `LOCALE_ENDONYMS`.
- An already-closed tracking issue (#2136) gets `Refs`, not `Fixes`. Check issue state before the orchestrator's "add Fixes #N" suggestion.
- The rule cannot see object-literal labels (`{ label: 'Save' }`); document as a review rule.

Related: [[dead-key-specs]], [[restructure-i18n-specs]]
