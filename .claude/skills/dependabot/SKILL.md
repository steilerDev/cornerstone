---
name: dependabot
description: 'Process all open Dependabot PRs and security alerts: review changelogs, merge passing PRs, fix failing ones, remediate orphan alerts, and surface adoption opportunities.'
---

# Dependabot — Full Alert & PR Resolution Workflow

You are the orchestrator running an end-to-end pass over every open Dependabot PR and every open Dependabot security alert. Follow these steps in order. **Do NOT skip steps.** The orchestrator delegates all implementation work — never write production code, tests, or workflow files directly. The orchestrator never merges without verification and never dismisses an alert.

**When to use:** Weekly Dependabot batch processing, after a CVE notification, or on demand when the security alert queue needs to be cleared.
**When NOT to use:** A single non-Dependabot PR review (use `/review-pr`); broken E2E unrelated to a dependency bump (use `/fix-e2e`); a new feature (use `/develop`).

## Input

`$ARGUMENTS` is empty — the skill always processes every open Dependabot PR and every open alert. No filtering by severity. No flags.

## Preflight

Before any other work:

1. Confirm the worktree is clean. If `git status --porcelain` returns anything, stop and surface the dirty state to the user.
2. Confirm the worktree base is up to date with `beta` (rebase if not):
   ```bash
   git fetch origin beta
   git rebase origin/beta
   ```
3. Record the current branch name. After processing each Dependabot PR you will return to this branch.

## Task Tracking

Create tasks upfront with `TaskCreate` so progress survives context compression:

1. **Inventory** — fetch open Dependabot PRs and open alerts
2. **Classify** — correlate alerts with PRs and bucket PRs by CI state
3. **Process READY PRs** — per-PR sub-tasks added dynamically
4. **Process FAILING PRs** — per-PR sub-tasks added dynamically
5. **Process ORPHAN alerts** — per-alert sub-tasks added dynamically
6. **File adoption follow-ups** — one batched issue per package
7. **Final report**

**Progress rule:** Mark each task `in_progress` before starting and `completed` immediately after. If you lose track after a compression, run `TaskList` and resume from the first pending task.

## Steps

### 1. Inventory

Fetch every open Dependabot PR targeting `beta`:

```bash
gh pr list --repo steilerDev/cornerstone \
  --author "app/dependabot" \
  --state open \
  --base beta \
  --json number,title,headRefName,url,mergeable,labels,updatedAt
```

Fetch every open Dependabot security alert:

```bash
gh api repos/steilerDev/cornerstone/dependabot/alerts --paginate \
  -q '.[] | select(.state == "open") | {number, severity: .security_advisory.severity, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem, manifest: .dependency.manifest_path, summary: .security_advisory.summary, ghsa_id: .security_advisory.ghsa_id, cve_id: .security_advisory.cve_id, first_patched_version: .security_vulnerability.first_patched_version.identifier}'
```

Store both lists — they are your working set for the rest of the run.

If both lists are empty, skip to step 7 and report "Nothing to do."

### 2. Classify

#### 2a. Bucket PRs by CI state

For each PR, fetch check state:

```bash
gh pr checks <PR> --repo steilerDev/cornerstone --json name,bucket
```

Also fetch mergeability:

```bash
gh pr view <PR> --repo steilerDev/cornerstone --json mergeable -q '.mergeable'
```

Bucket each PR into:

- `READY` — `Quality Gates` bucket is `pass` and `mergeable=MERGEABLE`
- `FAILING` — any required check bucket is `fail`
- `PENDING` — checks still running or `mergeable=UNKNOWN`

For `PENDING` PRs, wait once using the **beta CI gate polling pattern from CLAUDE.md** (5-minute timeout). Re-classify after polling. If still `PENDING` after timeout, treat as `FAILING` and proceed to step 5.

#### 2b. Correlate alerts with PRs

For each alert, match on `package` name + `manifest` path against the PR's title (Dependabot PR titles follow `Bump <package> from X to Y` or `chore(deps): bump <package> ...`). If a match is found, the alert's outcome is tied to the PR's outcome — track it but don't process it separately.

Alerts with no matching open PR are `ORPHAN` and handled in step 6.

### 3. Changelog Analysis (mandatory before any merge or fix)

For every PR (both `READY` and `FAILING`), run the changelog analysis once. **Launch both agents in parallel** using a single message with two `Agent` tool calls:

- **security-engineer**:
  - Inputs: PR number, package name, version range, linked GHSA/CVE IDs (from the alert correlation in step 2b)
  - Tasks: (1) confirm the bump addresses the linked advisory by checking the package's release notes against the `first_patched_version`; (2) review the PR's `package-lock.json` diff for any newly introduced transitive dependencies and flag CVEs against those.
  - Returns: severity-rated verdict — `CLEAR`, `INFORMATIONAL`, or `BLOCKING` with rationale.

- **product-architect**:
  - Inputs: PR number, package name, version range
  - Tasks: fetch release notes for every version in the range. Use `gh release view <tag> --repo <upstream>` for GitHub-hosted projects, or `WebFetch` on the package's CHANGELOG / homepage / npm page for others.
  - Categorize each notable line into one of:
    - `BREAKING` — code in this repo will break or behave differently. Cite the exact call site (file + line) when possible.
    - `BUGFIX_RELEVANT` — fixes a bug we have hit or could plausibly hit
    - `ADOPTION_OPPORTUNITY` — new API or capability that would benefit Cornerstone. Name the code path that should adopt it.
    - `NEUTRAL` — no impact

  - Returns: structured report with the four categories.

Collect both reports. Decide:

- `BLOCKING` security verdict OR any `BREAKING` finding → route the PR to step 5 (treat as failing) regardless of CI state, so the team can patch call sites before merging.
- `ADOPTION_OPPORTUNITY` findings → queue for step 7 (one batched follow-up issue per package). Do not add inline adoption commits to the Dependabot branch — keeps the bump PR focused and the adoption work reviewable independently.
- All other cases → proceed to step 4 (merge).

### 4. Process READY PRs

For each `READY` PR with no `BREAKING` or `BLOCKING` findings from step 3:

1. Post a consolidated approve review summarising both analyses:

   ```bash
   gh pr review <PR> --repo steilerDev/cornerstone --approve --body "$(cat <<'EOF'
   ## Security review
   <security-engineer verdict + rationale>

   ## Changelog review
   - Breaking: <none | list>
   - Bugfix-relevant: <none | list>
   - Adoption opportunities: <none | "filed as #<follow-up-issue>">
   - Neutral: <summary>

   Approved by the `/dependabot` skill.
   EOF
   )"
   ```

2. Re-verify mergeability:

   ```bash
   state=$(gh pr view <PR> --repo steilerDev/cornerstone --json mergeable -q '.mergeable')
   if [ "$state" != "MERGEABLE" ]; then echo "PR is not mergeable (state: $state) — surfacing to user"; continue; fi
   ```

3. Squash-merge:

   ```bash
   gh pr merge <PR> --repo steilerDev/cornerstone --squash
   ```

4. Mark the PR's task `completed` and record it for the final report. Continue to the next PR.

### 5. Process FAILING PRs

For each `FAILING` PR (or any PR escalated from step 3 due to `BREAKING` / `BLOCKING` findings), run a fix loop modelled on `/fix-e2e`. Iteration cap: **3 iterations per PR**, then surface to user.

#### 5a. Check out the PR branch

```bash
gh pr checkout <PR> --repo steilerDev/cornerstone
```

`gh pr checkout` fetches the Dependabot branch into the current worktree and switches to it. The orchestrator's original branch (recorded in Preflight) will be restored at the end of each PR.

#### 5b. Fetch failed check logs

```bash
RUN_ID=$(gh pr checks <PR> --repo steilerDev/cornerstone --json name,link -q '.[] | select(.bucket == "fail") | .link' | head -1 | grep -oE '[0-9]+$')
gh run view "$RUN_ID" --repo steilerDev/cornerstone --log-failed
```

#### 5c. Classify the failure and delegate

Map the failure to one of these categories and delegate to the appropriate agent. Multiple categories can apply — launch independent fixes in parallel.

| Failure pattern                                                                                       | Agent                                                                           | Brief                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| App code breaks (TypeScript errors, runtime errors in production code) caused by the bump             | `backend-developer` for `server/`+`shared/`; `frontend-developer` for `client/` | Pass the architect's `BREAKING` findings as context. Patch call sites.                                                           |
| Unit/integration test failures caused by the bump                                                     | `qa-integration-tester`                                                         | Follow the test failure debugging protocol from CLAUDE.md — fix tests only if production behaviour is correct per spec/contract. |
| E2E test failures caused by the bump                                                                  | `e2e-test-engineer`                                                             | Same protocol. Update page objects or assertions only if production behaviour is correct.                                        |
| CI/workflow break (GitHub Action input required, runner mismatch, etc., from a `github-actions` bump) | `product-architect`                                                             | Update `.github/workflows/*.yml`.                                                                                                |
| Lockfile / install break                                                                              | `backend-developer` (lockfile is server-rooted)                                 | Re-run `npm install` (never `--package-lock-only` per CLAUDE.md) and commit the regenerated lockfile.                            |

Each agent receives:

- PR number and URL
- The full failed-check excerpt
- The `BREAKING` findings from step 3 (if any)
- Explicit instruction to only edit files — per CLAUDE.md's flat delegation model, implementation agents never run `git commit` or `git push` themselves. Staging, committing, and pushing are handled exclusively by `dev-team-lead [MODE: commit]` in step 5d.

#### 5d. Commit & push

Launch `dev-team-lead [MODE: commit]` to stage the changes, write the conventional commit message with all contributing agent trailers, and push — this is the sole commit/push action for this PR; do not run a separate `git push`. Per CLAUDE.md trailer-verification rules, every production-file change must carry the correct `Co-Authored-By` trailer.

This PR already exists (it _is_ the Dependabot PR) — explicitly instruct dev-team-lead to **skip PR creation** in its `[MODE: commit]` protocol (there is no new PR to open) and to push without `-u` (the branch already tracks the Dependabot remote ref).

#### 5e. Wait for CI

Re-poll using the **beta CI gate polling pattern from CLAUDE.md**.

- Pass → route the PR to step 4 (merge).
- Fail → loop back to 5b for another iteration (max 3).
- After 3 failed iterations → mark PR `BLOCKED_FOR_USER`; record the remaining failure for the final report; continue to the next PR.

#### 5f. Return to original branch

After each PR (merged, blocked, or skipped):

```bash
git checkout <original-branch-recorded-in-preflight>
```

### 6. Process ORPHAN alerts

For each alert with no matching open PR:

#### 6a. Inspect the dependency

```bash
npm ls <package> --workspaces --include-workspace-root
```

Determine whether the package is direct (listed in a workspace `package.json`), transitive only, or already absent.

#### 6b. Produce a remediation spec

Launch `dev-team-lead [MODE: spec]` with:

- Alert details (package, version range affected, `first_patched_version`, GHSA, severity, summary)
- The `npm ls` output
- Which workspace(s) consume the package

The spec specifies one of:

- **Direct bump** — patch is available; bump the version in the appropriate `package.json` and update any affected call sites.
- **Override** — patch only exists upstream of a pinned transitive; add a root-level `overrides` block to force the patched version.
- **No patch** — document a workaround (input sanitisation, feature flag, sandboxing) OR recommend dismissing the alert with reason. **Never auto-dismiss**: present the dismissal recommendation to the user in the final report and let them decide.

#### 6c. Implement

Route the spec to the agent the spec assigns:

- Workspace owner (`backend-developer` / `frontend-developer`) for direct bumps and call-site updates
- `product-architect` for `overrides` edits to root `package.json`
- `qa-integration-tester` + `e2e-test-engineer` to add or update tests when the bump changes behaviour
- `security-engineer` to verify the remediation closes the GHSA

After implementation, run a full `npm install` (never `--package-lock-only`).

#### 6d. Branch, commit, PR

Create a new branch off the latest `beta`:

```bash
git fetch origin beta
git checkout -b fix/dependabot-<ghsa-id-lowercase>-<short-pkg-name> origin/beta
```

Commit via `dev-team-lead [MODE: commit]` with all contributing agent trailers and `Fixes` references to the GHSA in the body (alerts do not have issue numbers — reference the GHSA ID instead).

Push and open the PR:

```bash
git push -u origin fix/dependabot-<ghsa-id>-<short>
gh pr create --repo steilerDev/cornerstone --base beta --title "fix(deps): remediate <GHSA-ID> in <package>" --body "$(cat <<'EOF'
## Summary
- Remediates Dependabot alert <GHSA-ID> (<severity>) in `<package>`
- <one-line description of remediation: bump / override / workaround>

## Security review
<security-engineer verification that the remediation closes the GHSA>

## Test plan
- [ ] Quality Gates pass
- [ ] <any feature-specific verification>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for the beta CI gate (pattern from CLAUDE.md). On pass → squash-merge. On fail → run one fix iteration via the same pattern as step 5; cap at 3 iterations total before surfacing to user.

After each alert (merged, blocked, or recommended for dismissal): return to the original worktree branch with `git checkout <original-branch>`.

### 7. File adoption-opportunity follow-ups

Aggregate every `ADOPTION_OPPORTUNITY` finding from step 3, grouped by package. For each package with at least one opportunity, file one issue:

```bash
gh issue create --repo steilerDev/cornerstone --label enhancement --title "Adopt new capabilities from <package> <version>" --body "$(cat <<'EOF'
## Context
The `<package>` bump (PR #<PR>) introduced new capabilities Cornerstone should adopt.

## Opportunities
- <bullet from product-architect: capability + suggested code path>
- ...

## References
- Merged bump PR: #<PR>
- Release notes: <link>

🤖 Filed by `/dependabot`
EOF
)"
```

The issue should be picked up later via `/develop` — this skill does not implement adoptions inline.

### 8. Final report

Present to the user a table with these rows (omit rows with zero count):

| Outcome                       | Count | Details                                                                    |
| ----------------------------- | ----- | -------------------------------------------------------------------------- |
| PRs merged as-is              | N     | `#123 (pkg)`, `#124 (pkg)`, ...                                            |
| PRs fixed and merged          | N     | `#125 (pkg) — patched call sites in foo.ts`, ...                           |
| PRs blocked (needs user)      | N     | `#126 (pkg) — <remaining error>`                                           |
| Orphan alerts remediated      | N     | `GHSA-xxx → PR #200 merged`, ...                                           |
| Alerts awaiting user decision | N     | `GHSA-yyy — no upstream patch; recommend dismissal with reason "<reason>"` |
| Adoption follow-ups filed     | N     | `#250 (pkg)`, `#251 (pkg)`, ...                                            |

End with one-line summary: "Processed M open Dependabot PRs and N open alerts. Awaiting your decision on K items."

## Key Principles

1. **Changelog reading is mandatory before any merge.** No dep is merged without architect + security-engineer verdicts on record. This catches silent breaking changes and surfaces useful new capabilities.
2. **The orchestrator never writes code, never merges without verification, never dismisses an alert.** All code changes flow through agents; dismissals require explicit user approval.
3. **Surface adoption opportunities, don't bury them.** Even when the bump itself is a one-line version change, the changelog often hides improvements Cornerstone should adopt. File them as enhancement issues so they enter the normal `/develop` queue.
4. **Iterate, don't escalate too early.** A failing PR gets up to 3 fix iterations (matching the spirit of `/fix-e2e`) before going back to the user.
5. **Trailers reflect the work.** Every commit onto a Dependabot branch (or onto a new `fix/dependabot-*` branch) must carry the correct `Co-Authored-By` trailers per CLAUDE.md's trailer-verification rules. `dev-team-lead [MODE: commit]` enforces this.
6. **Return to the original branch between PRs.** The user invoked this skill from a worktree; the skill must leave that worktree on the same branch it started on.
