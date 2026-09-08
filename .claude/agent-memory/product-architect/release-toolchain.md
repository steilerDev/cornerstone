---
name: release-toolchain
description: semantic-release changelog toolchain constraint (conventional-changelog preset major must match the writer engine), and why a crash-fix must be judged on output not on the error going away
metadata:
  type: project
---

# Release toolchain: preset major must match the writer engine

`conventional-changelog-conventionalcommits` (the `preset: "conventionalcommits"` in
`.releaserc.json`) must stay on the **v9 line** while `semantic-release@25` is in use.

**Why:** there are two incompatible rendering engines.

- `conventional-changelog-writer@8` is **handlebars**-based and expects `mainTemplate` /
  `headerPartial` / `commitPartial` / `footerPartial` as **template strings**.
- `conventional-changelog-writer@9` dropped handlebars entirely for
  `@conventional-changelog/template`, whose partials are **JS functions**.

`@semantic-release/release-notes-generator@14` (what `semantic-release@25.0.9` ships) pins
`conventional-changelog-writer@^8`. The ccc **v10** preset emits function partials for the
writer@9 engine. Feeding function partials to the handlebars writer does not throw — it renders
**header-only, empty release notes**. From ccc `10.3.0` upstream planted a deliberate poison-pill
`mainTemplate` (`@conventional-changelog/template`'s `createLegacyWriterGuard`) whose _doc comment
says_ it exists to "fail loudly instead of silently rendering an empty changelog"; under handlebars
it trips `helperMissing` and produces
`Missing helper: "conventional-changelog-conventionalcommits requires conventional-changelog-writer@9 or newer"`.

Upstream's own remedy text is "Update the tooling **or use an older major version of the preset**."
The real upgrade path is `@semantic-release/release-notes-generator@15` (writer@9, and it _also_
bumps `conventional-commits-parser` 6->7 and `conventional-commits-filter` 5->6 — writer alone is
not the whole migration, which is why a lone `overrides` forcing writer@9 is an untested triple).
As of 2026-09-08 rng 15 is only `15.0.0-beta.2`. A `.github/dependabot.yml` ignore rule holds ccc
at the v9 major; remove it when rng 15 is adopted.

**How to apply:** treat the ccc major and the writer major as one coupled decision. Any bump of
`semantic-release`, `@semantic-release/release-notes-generator`, or
`conventional-changelog-conventionalcommits` must be validated by a `semantic-release --dry-run`
that **prints non-empty release notes** — not merely by the absence of an error.

## The methodological trap this hid behind (issue #2082)

The empty-notes bug ran undetected for **months**: every beta release body was ~115 characters
(the compare-link header and nothing else), and the stable releases only looked healthy because
the workflow's "Enrich release notes with summary" step prepends the hand-written
`RELEASE_SUMMARY.md`. The auto-generated half of `v2.14.0` was also just the header.

Two generalizable rules came out of it:

1. **A fix that removes a crash may only restore the _silent_ version of the same bug.** The
   obvious remedy here (pin ccc back to `10.2.1`, the version that last "released successfully")
   makes `generateNotes` exit 0 — and still emits an empty changelog, because 10.2.1 is also a
   writer@9-era preset. Verifying "the error is gone" would have shipped the bug back. The check
   that discriminates is the _artifact_: `gh api repos/.../releases --jq '.[] | "\(.tag_name) \(.body|length)"'`.
   See [[recurring-patterns]] — this is the release-infra instance of "assertions that pass on nothing".
2. **A CI step that parses stdout and discards the exit code cannot distinguish a crash from a
   no-op.** `OUTPUT=$(npx semantic-release 2>&1) || true` plus `grep -q "Created tag v"` made a
   hard failure look identical to "no releasable commits": job green,
   `new-release-published=false`, and all six downstream jobs skipped. Whenever a step's success
   is inferred from log text, the exit code must still gate it, and the "nothing to do" summary
   must not be reachable from the failure path.

## Verifying release changes without a working `npm install`

`npm install` fails with nondeterministic `ENOTDIR` in the sandbox worktrees (different path each
attempt; the host mount sits at ~98% full). A faithful substitute: install `semantic-release` plus
the preset into a throwaway `/tmp` prefix, then run that binary with **cwd = the repo worktree**.
`@semantic-release/release-notes-generator` resolves the preset via
`importFrom.silent(__dirname, ...)` first, so the harness's copy is used, while git history,
`.releaserc.json` and the remote all come from the real repo. Export `GITHUB_ACTIONS=true`,
`GITHUB_EVENT_NAME=push`, `GITHUB_REF=refs/heads/beta` and a token so `env-ci` resolves the branch
and `verifyConditions` passes — otherwise `--branches <name>` is rejected for a branch that does
not exist on the remote, and the run never reaches `generateNotes`.
