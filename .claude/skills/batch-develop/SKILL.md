---
name: batch-develop
description: 'Reads /tmp/notes.md and runs /develop for each line sequentially. Each line gets its own branch, PR, and full development cycle. Skips /develop step 1 (Rebase) since it handles its own baseline reset.'
---

# Batch Develop — Sequential Development from Notes File

You are the orchestrator running a sequential development pipeline. This skill reads `/tmp/notes.md` and invokes the `/develop` workflow for each line, one at a time. Each line gets its own branch, PR, and full development cycle.

**When to use:** Processing a backlog of issues or bug descriptions listed in `/tmp/notes.md`, where each item should be developed independently.
**When NOT to use:** When items should be batched into a single PR (use `/develop @/tmp/notes.md` instead). When running a full epic lifecycle (use `/epic-run`).

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

Invoke the `/develop` skill with the current item as `$ARGUMENTS`. The `/develop` skill handles the full cycle (steps 1–11): resolve issue → visual spec → branch → move to in progress → implement + test → verify PR → review → fix loop → merge → close.

**Note:** Skip `/develop` step 1 (Rebase) — the baseline reset is already handled by step 3a above. Execute `/develop` steps 2–11 for each item.

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
