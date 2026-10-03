---
sidebar_position: 2
title: Agent Team
---

# Agent Team

Cornerstone is built by **11 specialized Claude Code agents**, each with a distinct role. The team uses opus (largest models) for high-judgment decisions, sonnet (mid-tier) for implementation, and haiku (efficient) for mechanical tasks. **Spend follows judgment density** -- expensive models only on decisions that matter.

| Agent | Model | Tier | Role |
|-------|-------|------|------|
| **product-owner** | sonnet | mid-tier | Defines epics, user stories, and acceptance criteria; manages the backlog |
| **product-architect** | opus | large | Tech stack, schema, API contract, project structure, ADRs, Dockerfile |
| **dev-team-lead** | opus | large | Spec-writer, reviewer, and committer: decomposes work into implementation specs, reviews agent output, commits and creates PRs |
| **backend-developer** | sonnet | mid-tier | API endpoints, business logic, auth, database operations |
| **frontend-developer** | sonnet | mid-tier | UI components, pages, interactions, API client |
| **translator** | haiku | efficient | Non-English translations, glossary enforcement |
| **qa-integration-tester** | sonnet | mid-tier | Unit tests (95%+ coverage), integration tests, performance testing |
| **e2e-test-engineer** | sonnet | mid-tier | Playwright E2E tests, page objects, multi-viewport testing |
| **security-engineer** | sonnet | mid-tier | Security audits, vulnerability reviews, auth/authz validation |
| **ux-designer** | sonnet | mid-tier | Visual specifications, design tokens, dark mode, accessibility |
| **docs-writer** | haiku | efficient | Documentation site, README.md, user-facing guides |

## The Agents

### Product Owner (Sonnet)

**Owns**: Backlog management and user stories.

- Breaks requirements into actionable user stories with clear, testable acceptance criteria
- Maintains the GitHub Projects board (Backlog, Todo, In Progress, Done)
- Validates completed work against acceptance criteria
- Reviews PRs to ensure requirements are met

### Product Architect (Opus)

**Owns**: System design, schema, API contract, ADRs.

- Designs database schema changes and Drizzle migrations
- Defines REST API endpoints and contracts
- Maintains the GitHub Wiki (Architecture, Schema, API Contract, ADR Index)
- Reviews PRs for architectural compliance and code quality
- Makes trade-off decisions on tech stack and major structures

### Dev Team Lead (Opus)

**Owns**: Specifications, review, and commits.

- Writes implementation specs from acceptance criteria and architecture
- Reviews all agent-produced work (code, tests, security findings)
- Stages files, commits with appropriate agent trailers, pushes, and creates PRs
- Returns work for fixes if review finds issues; fix loops continue the same implementing agent
- Final gate before a PR is created

### Backend Developer (Sonnet)

**Owns**: Server-side implementation.

- Implements Fastify API endpoints and business logic per spec
- Writes database queries using Drizzle ORM
- Handles authentication, authorization, and session management
- Does NOT write tests (owned by QA)

### Frontend Developer (Sonnet)

**Owns**: Client-side implementation.

- Builds React components, pages, and interactions per spec
- Implements the typed API client layer
- Uses CSS Modules and design tokens per UX specs
- Does NOT write tests (owned by QA)

### Translator (Haiku)

**Owns**: Non-English translations and glossary compliance.

- Translates new English i18n keys into German and other supported locales
- Proposes new glossary terms for domain concepts
- Audits existing translations for parity and term compliance
- Launched only after frontend-developer adds English keys

### QA Integration Tester (Sonnet)

**Owns**: Unit and integration tests.

- Writes Jest unit tests targeting 95%+ coverage on all new code
- Writes API integration tests using Fastify's `app.inject()` method
- Validates performance budgets and accessibility
- Reports bugs with structured reproduction steps

### E2E Test Engineer (Sonnet)

**Owns**: End-to-end browser tests.

- Writes Playwright E2E tests covering user flows and acceptance criteria
- Manages testcontainers (app, OIDC provider, proxy) for test environments
- Tests across desktop, tablet, and mobile viewports
- Confirms all E2E tests pass before UAT proceeds

### Security Engineer (Sonnet)

**Owns**: Security audits and vulnerability reviews.

- Reviews PRs touching auth, API routes with data access, Dockerfile, dependency manifests
- Audits for OWASP Top 10 vulnerabilities (injection, XSS, broken auth, sensitive data exposure, etc.)
- Scans dependencies for CVEs
- Maintains the GitHub Wiki Security Audit page

### UX Designer (Sonnet)

**Owns**: Visual specifications and design system.

- Creates visual specs for UI stories (token mapping, states, responsive behavior)
- Maintains the GitHub Wiki Style Guide (tokens, color palette, typography, components)
- Reviews frontend PRs for token adherence, visual consistency, dark mode, and accessibility

### Docs Writer (Haiku)

**Owns**: User-facing documentation.

- Maintains the documentation site (`docs/` workspace, Docusaurus)
- Updates README.md as a project overview
- Writes feature guides after each epic ships
- Does NOT write architecture or wiki documentation (product-architect owns that)

## Communication Patterns

**Commits**: Every commit includes a `Co-Authored-By` trailer for each agent that contributed:

```
feat(work-items): add tag filtering to list page

Implements tag-based filtering with multi-select dropdown.

Co-Authored-By: Claude frontend-developer <noreply@anthropic.com>
Co-Authored-By: Claude qa-integration-tester <noreply@anthropic.com>
```

Note: trailers include **agent name only**, no model version. Models are selected via aliases (`haiku`/`sonnet`/`opus`) in agent definitions and resolve to the latest model of that tier.

**GitHub comments**: Agents prefix their comments with agent name in bold brackets:

```
**[backend-developer]** This endpoint should return a 404 for non-existent items per the contract.
```

**Specifications**: The dev-team-lead writes implementation specs that carry the full context: acceptance criteria, reference files to read, and expected output format. Implementing agents execute the spec without re-reading the issue or wiki.

**Fix loops**: When review finds issues, the fix loop continues the same implementing agent (via SendMessage) instead of launching a fresh agent. This preserves context and speeds iteration.

## Attribution Enforcement

The system enforces agent attribution automatically:

- A **bash hook** (`scripts/hooks/bash-guard.mjs`) pre-checks commit messages at commit time. If production files changed, the required agent trailers must be present.
- **CI** runs `scripts/check-trailers.sh` on every PR touching production code to verify trailers are present.
- **The orchestrator** verifies trailers before committing (dev-team-lead `[MODE: commit]` step) and rejects commits with missing trailers.

This ensures accountability and traceability across the codebase.
