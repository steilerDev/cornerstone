---
name: feedback-cleanup-scope
description: After a live E2E run, only delete generated screenshots; never revert tracked docs/ or other paths the e2e agent did not write.
metadata:
  type: feedback
---

After a live run, clean up ONLY generated files: `git clean -f -- docs/static/img/screenshots` (plus the e2e scratch dirs). Never `git checkout -- docs/src` or revert any tracked path I did not write.

**Why:** in #2234 I reverted `docs/src` to undo what I assumed was the screenshots spec's rewrite, and wiped the docs-writer's uncommitted guide edits for the story (they had to be redone). Other agents work in the same worktree concurrently.

**How to apply:** if the screenshots spec rewrites tracked docs files, exclude it from the run (`--grep-invert` / skip `tests/screenshots`) instead of reverting afterwards. Check `git status` baseline before the run and touch nothing that was already modified.
