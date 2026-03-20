---
name: mini-epic
description: 'Analyze a spec, decompose into work items, challenge assumptions with questions and alternatives, then feed work items into /batch-develop for sequential implementation. For work larger than a single bug fix or story but smaller than a full epic.'
---

# Mini-Epic — Spec Analysis, Decomposition & Development

You are the orchestrator running a lightweight planning-and-execution workflow for a cohesive batch of related changes described by a single spec. This fills the gap between `/develop` (single story/bug) and `/epic-start` (full epic with PO + architect). Use this when the work is too large for a single PR but doesn't warrant full epic planning with schema design, ADRs, and sprint decomposition.

**When to use:** A user provides a spec describing a cohesive set of changes — a small feature area, a refactoring effort, a group of related improvements — that should be split into a few independent work items and developed sequentially. Think: 2–6 stories/bugs that share a common theme but each deserve their own PR.
**When NOT to use:** Large epics requiring architecture planning, schema changes, or ADRs (use `/epic-start` + `/epic-run`). A single bug or story (use `/develop`). Items that should share a single PR (use `/develop` with multi-item input).

## Input

`$ARGUMENTS` contains one of the following:

- **Inline spec**: A text description of the desired changes
- **File path** prefixed with `@` (e.g., `@/tmp/spec.md`) — the file contains the full spec
- **GitHub Issue number** (e.g., `#100` or `100`) — the issue body contains the spec

If empty, ask the user to provide a spec before proceeding.

## Steps

### 1. Ingest Spec

Parse `$ARGUMENTS`:

- **Issue number**: Fetch the issue body with `gh issue view <number>` and use it as the spec.
- **File path** (`@`-prefixed): Read the file contents as the spec.
- **Inline text**: Use the text directly as the spec.

Print the spec back to the user in a quoted block so they can confirm you've captured it correctly.

### 2. Enter Planning Mode

Enter planning mode (`EnterPlanMode`). All analysis, decomposition, and discussion with the user happens in planning mode. This ensures the orchestrator focuses on thinking and challenging rather than jumping to implementation.

### 3. Analyze & Decompose

Read the current codebase to understand the areas the spec touches. Then produce:

1. **Work items**: Split the spec into 2–6 discrete, independently implementable work items. Each item should be:
   - Self-contained (can be developed and merged on its own without breaking the application)
   - Ordered by dependency (items that others depend on come first)
   - Described as a concise task statement (imperative mood, e.g., "Add migration for X table", "Implement GET /api/foo endpoint")
   - Scoped to roughly one PR's worth of work

2. **Dependency graph**: Note which items depend on which (if any). Items without dependencies can be developed in any order, but `/batch-develop` processes them sequentially, so order by dependency chain then by risk (riskiest first).

Present the decomposition as a numbered list:

```
Work Items:
  1. <description> [depends on: none]
  2. <description> [depends on: 1]
  3. <description> [depends on: 1]
  4. <description> [depends on: 2, 3]
```

### 4. Challenge & Clarify

Before proceeding, present the user with:

#### Questions

Identify 2–5 open questions about the spec — ambiguities, missing details, edge cases, or unclear scope boundaries. Format as a numbered list. Focus on questions whose answers would change the work items or their scope.

#### Alternative Approaches

If there are meaningful alternative ways to implement the spec (different data models, UI patterns, API designs, phasing strategies), present 1–3 alternatives with brief trade-off analysis. Only raise alternatives that would materially change the work items — skip this section if the approach is straightforward.

#### Implications

Flag any consequences the user might not have considered:

- **Breaking changes**: Will this change existing API contracts, database schemas, or UI behavior?
- **Migration concerns**: Does this require data migration or backfill?
- **Performance**: Could this introduce performance issues at scale?
- **Cross-cutting concerns**: Does this affect i18n, accessibility, security, or other shared concerns?
- **Test impact**: Will existing tests need updates?

Skip any implication category that doesn't apply.

### 5. User Confirmation

Wait for the user to:

- Answer the questions
- Confirm or adjust the work items
- Choose an approach (if alternatives were presented)
- Acknowledge implications

**Do NOT proceed until the user explicitly confirms.** The user may:

- Adjust the work item list (add, remove, reorder, merge, or split items)
- Refine descriptions
- Answer questions that change the decomposition
- Request a re-analysis

Iterate steps 3–5 until the user is satisfied.

### 6. Exit Planning Mode & Create Issues

Once the user confirms, exit planning mode (`ExitPlanMode`).

**Create GitHub Issues** for each work item using the **product-owner** agent. For each item:

- Create an issue with the `user-story` or `bug` label (as appropriate)
- Include acceptance criteria in Given/When/Then format derived from the spec and the user's answers
- Add to the Projects board in "Todo"
- If a parent epic issue exists (user provided one or one is referenced in the spec), link as sub-issue

### 7. Hand Off to Batch Develop

Print the finalized queue:

```
Mini-Epic Queue:
  1. #<number> — <title>
  2. #<number> — <title>
  3. #<number> — <title>
Total: N items
```

Invoke `/batch-develop` with the issue numbers as arguments (e.g., `/batch-develop #101 #102 #103`). This hands off to the batch-develop skill which processes each item sequentially through the full `/develop` cycle.
