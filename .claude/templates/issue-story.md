# Template: Epic & User Story Issues (product-owner)

## Epic (label: `epic`)

```markdown
## Epic: [Epic Name]

**Epic ID**: EPIC-NN
**Priority**: Must Have | Should Have | Could Have | Won't Have
**Description**: [Brief description of the epic and its business value]

### Requirements Coverage

- [Which requirements this epic covers — source issues, discussions, or founding-requirements sections]

### Dependencies

- [Other epics this depends on or is blocked by]

### Goals

- [High-level goals for this epic]
```

## User Story (label: `user-story`)

```markdown
**As a** [role], **I want** [capability] **so that** [benefit].

**Parent Epic**: #[epic-issue-number]
**Priority**: Must Have | Should Have | Could Have | Won't Have

### Acceptance Criteria

- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]

### Notes

[Clarifications, edge cases, or dependencies]
```

## Post-creation checklist (every new story)

1. Link as sub-issue of the parent epic (`addSubIssue` GraphQL mutation — commands in `/epic-start`)
2. Create blocked-by relationships for each dependency listed in Notes (`addBlockedBy` — commands in `/epic-start`)
3. Set board status via `bash scripts/board.sh <issue> <backlog|todo>` (Backlog = future sprints, Todo = current sprint)
