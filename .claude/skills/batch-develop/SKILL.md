---
name: batch-develop
description: 'Reads /tmp/notes.md and runs /develop in AUTO_MODE for each line sequentially. Each line gets its own branch, PR, and full development cycle.'
---

# Batch Develop — Sequential AUTO_MODE Development from Notes File

You are the orchestrator running a sequential development pipeline. This skill reads `/tmp/notes.md` and invokes the `/develop` workflow in **AUTO_MODE** for each line, one at a time. Each line gets its own branch, PR, and full development cycle.

**When to use:** Processing a backlog of issues or bug descriptions listed in `/tmp/notes.md`, where each item should be developed independently with automatic approvals.
**When NOT to use:** When items should be batched into a single PR (use `/develop @/tmp/notes.md` instead). When running a full epic lifecycle (use `/epic-run`).

## AUTO_MODE Declaration

This skill activates **AUTO_MODE** for the session. When AUTO_MODE is active:

- Bug spec approval is auto-approved (PO spec created immediately)
- PR merge is automatic after CI green + all reviewers approved
- The only human gate is if retry budget (3) is exhausted for a single item

## Input

`$ARGUMENTS` is ignored — the input file is always `/tmp/notes.md`.

If `/tmp/notes.md` does not exist or is empty, ask the user to create it before proceeding.

## File Format

`/tmp/notes.md` contains one item per line:

- **Issue number**: `#42` or `42`
- **Bug/feature description**: Free-text description
- **Empty lines**: Skipped
- **Comment lines** (starting with `#`): Skipped — but note that `#42` (digits after `#`) is treated as an issue number, not a comment

## Steps

### 1. Read and Parse

Read `/tmp/notes.md`. Parse each non-empty, non-comment line into an ordered **items queue**. Print the queue:

```
Batch Develop Queue:
  1. #42 — (issue reference)
  2. The login page crashes on mobile — (description)
  3. #55 — (issue reference)
  ...
Total: N items
```

If the queue is empty, inform the user and stop.

### 2. Session Setup

Fetch latest state:

```
git fetch origin beta
```

Sync wiki:

```
git submodule update --init wiki && git -C wiki pull origin master
```

### 3. Sequential Processing Loop

For each item in the queue:

#### 3a. Reset to Beta

Start each item from a clean `beta` baseline:

```
git checkout -B batch-dev-temp origin/beta
```

#### 3b. Invoke /develop

Invoke the `/develop` skill with the current item as `$ARGUMENTS` and **AUTO_MODE active**. This means:

- Bug descriptions: PO spec is auto-approved, issue created immediately
- PR merge: Automatic after CI green + all reviewers approved
- No user approval gates

The `/develop` skill handles the full cycle: resolve issue → branch → implement → test → review → merge → close.

#### 3c. Track Result

After `/develop` completes for the item:

- **Success** (PR merged, issue closed): Remove the line from `/tmp/notes.md`, add to completed list
- **Failure** (retry budget exhausted or error): Keep the line in `/tmp/notes.md`, add to failed list, continue to next item

#### 3d. Progress Update

After each item, print progress:

```
Progress: N/M complete | Completed: #42, #55 | Failed: none | Remaining: N
```

### 4. Summary

After all items are processed, print a final summary:

```
Batch Develop Complete
======================
Total items:  N
Completed:    N — #42, #55, #61
Failed:       N — #88 (reason)
Remaining in /tmp/notes.md: N lines
```

If all items succeeded, `/tmp/notes.md` will be empty (or contain only comments). If any failed, the file retains those lines for a future run.
