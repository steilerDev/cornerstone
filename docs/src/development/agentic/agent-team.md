---
sidebar_position: 2
title: Agent Team
---

# Agent Team

Cornerstone is built by a team of 10 specialized Claude Code agents. Each agent has its own system prompt, persistent memory, and clearly defined responsibilities.

## The Agents

### Product Owner

**Role**: Defines epics, user stories, and acceptance criteria. Manages the product backlog.

- Breaks requirements into actionable user stories with clear acceptance criteria
- Maintains the GitHub Projects board
- Validates that completed work meets requirements
- Gates PR approval -- only approves after verifying all agent responsibilities are fulfilled

### Product Architect

**Role**: System design, database schema, API contract, and architectural decisions.

- Designs schema additions and API endpoints for each epic
- Writes Architectural Decision Records (ADRs) on the GitHub Wiki
- Maintains the API Contract and Schema wiki pages
- Reviews PRs for architecture compliance

### UX Designer

**Role**: Visual design, design tokens, brand identity, and component styling specifications.

- Defines the CSS custom property token system
- Creates visual specs for UI stories (which tokens, states, responsive behavior)
- Maintains the Style Guide wiki page
- Reviews frontend PRs for token adherence and accessibility

### Backend Developer

**Role**: Server-side implementation.

- Implements Fastify API endpoints and business logic
- Writes database queries using Drizzle ORM
- Handles authentication, authorization, and session management
- Does not write tests (owned by QA)

### Frontend Developer

**Role**: Client-side implementation.

- Builds React components, pages, and interactions
- Implements the typed API client layer
- References the UX Designer's visual specs for styling
- Does not write tests (owned by QA)

### QA Integration Tester

**Role**: Unit tests and integration tests.

- Writes Jest unit tests targeting 95%+ coverage on all new code
- Writes integration tests using Fastify's `app.inject()` method
- Validates performance budgets and audits accessibility
- Reports bugs with structured reproduction steps

### E2E Test Engineer

**Role**: End-to-end browser tests.

- Writes Playwright E2E tests covering UAT scenarios
- Manages the testcontainer infrastructure (app, OIDC provider, proxy)
- Tests across desktop, tablet, and mobile viewports
- Must confirm all E2E tests pass before manual UAT proceeds

### Security Engineer

**Role**: Security audits and vulnerability reviews.

- Reviews every PR for OWASP Top 10 vulnerabilities
- Audits authentication/authorization implementations
- Scans dependencies for CVEs
- Maintains the Security Audit wiki page

### UAT Validator

**Role**: User acceptance testing.

- Translates acceptance criteria into concrete UAT scenarios (Given/When/Then)
- Coordinates with QA and E2E agents for test feasibility
- Produces step-by-step manual validation instructions for the user
- Manages the validation loop until the user approves

### Docs Writer

**Role**: User-facing documentation.

- Maintains this documentation site (`docs/` workspace)
- Updates the README.md as a lean project overview
- Documents new features after each epic ships

## Communication Patterns

Agents communicate through:

- **GitHub Issues** -- user stories, acceptance criteria, UAT scenarios
- **GitHub PRs** -- code review comments and approvals
- **GitHub Wiki** -- architecture, API contract, schema, security audit
- **Agent memory** -- persistent notes shared across sessions
- **CLAUDE.md** -- shared conventions and workflow rules

## Attribution

All agents identify themselves in their work:

- **Commits** include a `Co-Authored-By` trailer with the agent name and model
- **GitHub comments** are prefixed with the agent name in bold brackets (e.g., `**[backend-developer]**`)
