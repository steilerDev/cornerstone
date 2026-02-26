---
name: epic-start
description: 'Plan an epic: Product Owner decomposes stories, Product Architect designs schema/API/ADRs. Use at the start of a new epic before any implementation.'
---

# Epic Start — Planning Workflow

You are the orchestrator running the planning phase for a new epic. Follow these 6 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** Starting a new epic — decomposing requirements into stories, designing architecture, and getting user approval before implementation begins.
**When NOT to use:** Implementing a single story or bug fix (use `/develop`). Closing an epic after all stories are done (use `/epic-close`).

## Input

`$ARGUMENTS` contains either:

- An epic description or requirements reference (PO will create the epic issue), OR
- An existing epic issue number (PO will verify and refine it)

If empty, ask the user to describe the epic or provide an issue number before proceeding.

## Steps

### 1. Rebase

Fetch and rebase the worktree branch onto `origin/beta` to ensure planning starts from the latest integration state:

```
git fetch origin beta && git rebase origin/beta
```

If already rebased at session start, skip.

### 2. Wiki Sync

Ensure the wiki submodule is up to date before agents read architecture docs:

```
git submodule update --init wiki && git -C wiki pull origin master
```

### 3. Plan: Product Owner

Launch the **product-owner** agent to:

- Read `plan/REQUIREMENTS.md` and the existing backlog (GitHub Issues + Projects board)
- Create an epic GitHub Issue (labeled `epic`) if one does not already exist
- Decompose the epic into user stories (labeled `user-story`)
- Link stories as sub-issues of the epic:

  ```bash
  # Look up node IDs
  EPIC_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <epic-number>) { id } } }' --jq '.data.repository.issue.id')
  STORY_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <story-number>) { id } } }' --jq '.data.repository.issue.id')

  # Link as sub-issue
  gh api graphql -f query='mutation { addSubIssue(input: { issueId: "'"$EPIC_ID"'", subIssueId: "'"$STORY_ID"'" }) { issue { id } } }'
  ```

- Set `addBlockedBy` relationships between stories where dependencies exist
- Set board statuses: **Backlog** for future-sprint stories, **Todo** for first-sprint stories:

  ```bash
  ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')

  # Move to Todo (dc74a3b0) or Backlog (7404f88c)
  gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "dc74a3b0" } }) { clientMutationId } }'
  ```

- Post acceptance criteria (Given/When/Then format) on each story issue

### 4. Plan: Product Architect

Launch the **product-architect** agent (can run in parallel with PO if the epic issue already exists) to:

- Design schema changes, API contract updates, shared types, and migration files
- Write or update ADRs for any significant architectural decisions
- Update wiki pages (`Architecture.md`, `API-Contract.md`, `Schema.md`, `ADR-Index.md`)
- Commit and push wiki submodule changes:
  ```bash
  git -C wiki add -A && git -C wiki commit -m "docs: <description>" && git -C wiki push origin master
  git add wiki
  ```

### 5. Present to User

Present the complete epic plan to the user:

- **Stories**: List each story with its title, acceptance criteria, and dependencies
- **Architecture**: Summary of schema changes, new API endpoints, ADRs created
- **Sprint plan**: Which stories are in the first sprint (Todo) vs backlog

Wait for user approval. If the user requests changes, re-launch the appropriate agent (PO or architect) to address feedback and present again.

### 6. Handoff

After user approval:

- Tell the user which story to start with (the first unblocked story in Todo)
- Instruct them to invoke `/develop <issue-number>` in a new worktree session
- If any wiki changes were made, remind the user to commit the parent submodule ref
