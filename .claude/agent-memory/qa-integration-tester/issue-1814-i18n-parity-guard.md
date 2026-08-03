---
name: issue-1814-i18n-parity-guard
description: New generalized i18n.parity.test.ts (14-namespace en/de key parity + 28-file duplicate-key guard) and usePhotos.test.ts translateApiError rework — patterns and gotchas
metadata:
  type: project
---

## What shipped (2026-07-07, issue #1814)

- New file `client/src/i18n/i18n.parity.test.ts`: generalizes the single-namespace pattern from
  `errorTranslation.test.ts` (`'German error JSON has the same keys as English'`) to all 14
  registered namespaces via a hand-maintained `NAMESPACES` array, cross-checked against
  `fs.readdirSync('client/src/i18n/en').filter(f => f.endsWith('.json')).length` so an
  added/removed namespace file fails the test until `NAMESPACES` is updated. Also added a
  raw-text recursive-descent duplicate-JSON-key scanner (`findDuplicateKeys`) run over all 28
  locale files (`en/*.json` + `de/*.json`) via `fs.readFileSync` — deliberately NOT `JSON.parse`
  since parsing silently resolves duplicates via last-key-wins (see also
  [issue-1812-i18n-sweep-json-dup-keys.md](issue-1812-i18n-sweep-json-dup-keys.md), same failure
  class). The parser tracks a real scope stack (not a shallow brace counter) specifically to avoid
  false positives on `{{interpolation}}` placeholders adjacent to nested-object boundaries — ship
  the 3 inline self-tests (genuine dupe / different-scope same-name / interpolation-adjacent) to
  prove the parser itself before trusting it against real files.
- `import.meta.url` + `fileURLToPath` works fine in this project's client Jest ESM setup for
  locating `en`/`de` dirs relative to the test file (no prior precedent in the codebase for this
  pattern in a test file, but it worked cleanly with
  `NODE_OPTIONS=--experimental-vm-modules npx jest ...`).
- `usePhotos.test.ts`: reworked the 4 hardcoded-string error assertions to import
  `enErrors`/`enPhotoViewer` and assert against the real translated values (matches the
  `translateApiError()`/`t()` pattern `usePhotos.ts` already implements), added a 5th test for the
  unknown-code humanized fallback (`SOME_UNKNOWN_CODE` → `'Some Unknown Code'`). 100% statement
  coverage on `usePhotos.ts` maintained (38/38 tests pass); no changes needed to hoisted mock setup.

## Coordination note — parallel frontend/translator edits landed mid-session

Per the spec, `usePhotos.ts` + `en/*.json` (frontend-developer) and `de/*.json`
(translator) were being edited in parallel while I wrote tests. By the time I ran the new
`i18n.parity.test.ts`, **both had already landed** — all 46 tests passed on the first real run
(no known-pending-translator failures to report). Do not assume a first-try all-green result on a
brand new parity/dupe-guard test means the test is too weak — verify by checking
`git status --short client/src/i18n/de/` for what actually changed before concluding the guard is
ineffective. In this case `git diff --stat` confirmed real deletions (duplicate `title`/`delete`/
`edit`+`view` keys) and additions (`networkError`/`unexpectedError` translations) had landed.

## Reusable pattern

The `NAMESPACES` array + `flatten()` parity check + `findDuplicateKeys()` raw-text scanner in
`client/src/i18n/i18n.parity.test.ts` is now the canonical generalized i18n guard for this repo —
future new namespaces just need one line added to `NAMESPACES` (test fails loudly otherwise via
the file-count cross-check) and don't need a new bespoke parity test.
