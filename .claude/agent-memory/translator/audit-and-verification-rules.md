---
name: audit-and-verification-rules
description: Verification and process rules for translator work: lint/format scope in shared worktrees, persistence checks, duplicate-key gotcha in en files, full-namespace diff audits, orphan cleanup
metadata:
  type: feedback
---

**Lint and format scope.** Repo-wide `npm run lint:fix && npm run format` reformats unrelated drifted files (Markdown tables, `.claude/workflows/*.js`, `eslint.config.js`, other agents' work). Run `git status --porcelain` before and after, diff every newly-dirty file, and `git checkout --` pure reformatting of pre-existing content. Leave files with real content additions alone: other agents may be committing in the same worktree. Prefer `npx prettier --write <my files>` on your own files.

**Why:** a 2026-08-01 fix loop touched CLAUDE.md, a workflow file and an unrelated memory file while only two budget.json files were edited.

**Persistence check.** After every Edit, run `git diff --stat <file>` and parse the JSON. An edit that reports success has once failed to persist (story #1900), so re-verify before reporting done.

**Duplicate top-level keys in en files.** `en/diary.json` has repeatedly gained a second top-level block with the same name (`page`, `filterBar`, `detailPage`). JSON parsing keeps only the last one, which silently drops the first block at runtime. Check with an object_pairs_hook that flags repeats whenever a large block of "missing in en" keys already has plausible German. This is frontend-developer's file. Flag it in every report and do not work around it on the de side. On the de side, merge into existing sections and never duplicate.

**Full-namespace audits.** Write a Node script that parses both en and de files, flattens to dotted paths, and diffs both directions. Require 0/0 after each edit. During the audit, also re-scan for old glossary terms (`Zuschuss`, `Budget Quellen`, `Haushalts Artikel`, `Arbeitselement`, `Haushaltsgegenstand`, `Budgetzeile`, `Anbieter`).

**Orphan cleanup.** A de key with no en counterpart and zero code references (`grep -rn "<key>" client/src`) is a stale artifact and can be deleted. Never delete a de key that still exists in en. Never delete a key just because it looks unused. Dynamic keys (`labelKey` props, template literals) are common, so grep first.

**Concurrent worktrees.** Re-check that an en key exists right before finishing. In a shared worktree the answer can change within one task (see `budget.json` `closingLabel`, #1932).
