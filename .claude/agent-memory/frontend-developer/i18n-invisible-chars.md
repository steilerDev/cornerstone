---
name: i18n-invisible-chars
description: How to add and verify invisible characters (NBSP) in locale files — repo writes literal non-ASCII, and the resulting test/diff failures look like identical strings
metadata:
  type: project
---

Multi-word inline labels rendered into the PDF wrap at their internal space. A single-word label
can't wrap; a two-word one breaks across lines and splits its own brackets (`(less` / `deposit)`).
The fix is U+00A0 (NBSP) instead of the space — same glyph advance, so no geometry constant moves,
and pdfmake's UAX-14 line breaker treats it as non-breaking.

**Why the details matter:** the change is invisible in every textual channel, so it produces
failures and diffs that look like no-ops and burn reviewer time.

**How to apply:**

- **Convention:** `client/src/i18n/**` uses **literal** non-ASCII characters (`…`, `—`, `·`, `↑`) —
  there are zero `\uXXXX` escapes. Write a literal NBSP, not an escape. Insert it with a script
  (`python3` + `u' '`), never by typing it, and verify with
  `python3 -c "...print([hex(ord(c)) for c in value])"` — a hand-typed one silently lands as a plain
  space.
- **grep will not find it:** `grep -P '\xc2\xa0'` returns nothing in a UTF-8 locale (PCRE reads the
  escapes as characters, not bytes). Use `LC_ALL=C grep -n $'\xc2\xa0' <file>`, or `git diff | cat -A`
  (NBSP shows as `M-BM-`).
- **`pdftotext` normalizes it back to a space**, so extraction can't confirm the character. Verify
  the **break position** instead: render the real PDF, extract with `pdftotext -layout`, and check
  the label lands on one line. Render a plain-space control alongside it — otherwise you can't tell
  a fix from data that happened not to wrap.
- **Warn about the test fallout explicitly.** Any test asserting the label literally now fails with
  `Expected " (less deposit)" / Received " (less deposit)"` — visually identical. Always report the
  codepoints and the exact replacement, or someone will read it as a flake.

Related: [[qa-tripwire-tests]].
