---
sidebar_position: 3
title: Workflow
---

# Development Workflow

Cornerstone follows an incremental agile workflow where each user story goes through a complete cycle from planning to deployment.

## Story Lifecycle

Each user story follows these steps:

1. **Plan** -- Product owner verifies the story and acceptance criteria. Architect designs schema/API changes.
2. **UAT Plan** -- UAT validator drafts test scenarios. QA and E2E engineers review for testability. User approves the plan.
3. **Visual Spec** (UI stories only) -- UX designer posts styling specifications on the issue.
4. **Branch** -- Create a feature branch from `beta`.
5. **Implement** -- Backend and/or frontend developers write the production code.
6. **Test** -- QA writes unit/integration tests (95%+ coverage). E2E engineer writes Playwright browser tests.
7. **Quality Gates** -- Lint, typecheck, test, format, build, and security audit must all pass.
8. **PR & CI** -- Push the branch and create a PR targeting `beta`. Wait for CI to pass.
9. **Review** -- Product owner, architect, security engineer, and UX designer (for frontend) review in parallel.
10. **Fix Loop** -- If any reviewer requests changes, the implementing agent addresses feedback and re-requests review.
11. **Merge** -- Once all reviewers approve and CI passes, squash-merge to `beta`.

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable releases |
| `beta` | Integration branch -- feature PRs land here |
| `feat/<issue>-<desc>` | Feature branches |
| `fix/<issue>-<desc>` | Bug fix branches |

Feature branches are created from `beta` and merged back to `beta` via squash merge. When an epic is complete, `beta` is promoted to `main` via merge commit.

## Release Model

| Branch | Release Type | Docker Tags |
|--------|-------------|-------------|
| `beta` | Beta pre-release (e.g., `1.7.0-beta.1`) | `1.7.0-beta.1`, `beta` |
| `main` | Stable release (e.g., `1.7.0`) | `1.7.0`, `1.7`, `latest` |

Releases are automated via semantic-release, which analyzes conventional commit messages to determine version bumps.

## Epic Promotion

After all stories in an epic are merged to `beta`:

1. **Refinement** -- Non-blocking review feedback from the epic is addressed in a dedicated refinement PR
2. **Documentation** -- The docs-writer updates this site with new feature documentation
3. **Promotion PR** -- A PR from `beta` to `main` is created with UAT validation criteria
4. **User Validation** -- The user reviews the PR, validates features against acceptance criteria, and approves
5. **Merge** -- After user approval, the PR is merged (merge commit, not squash)
6. **Merge-back** -- `main` is merged back into `beta` so the release tag is reachable from beta's history

## Quality Gates

Every PR must pass:

- ESLint linting
- Prettier formatting check
- TypeScript type checking
- Jest unit and integration tests
- Full application build (shared -> client -> server)
- npm security audit
- E2E smoke tests (CI)
- Agent code reviews (architect, security, product owner, UX designer)

## Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(work-items): add tag filtering to list page

Implements tag-based filtering with multi-select dropdown.

Fixes #42

Co-Authored-By: Claude frontend-developer (Sonnet 4.5) <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`
