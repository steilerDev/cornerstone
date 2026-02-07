# Cornerstone - Project Guide

## Project Overview

Cornerstone is a web-based home building project management application designed to help homeowners manage their construction project. It tracks work items, budgets (with multiple financing sources and subsidies), timelines (Gantt chart), and household item purchases.

- **Target Users**: 1-5 homeowners per instance (self-hosted)
- **Deployment**: Single Docker container with SQLite
- **Requirements**: See `plan/REQUIREMENTS.md` for the full requirements document

## Agent Team

This project uses a team of 6 specialized Claude Code agents defined in `.claude/agents/`:

| Agent | Role |
|-------|------|
| `product-owner` | Defines epics, user stories, and acceptance criteria; manages the backlog |
| `product-architect` | Tech stack, schema, API contract, project structure, ADRs, Dockerfile |
| `backend-developer` | API endpoints, business logic, auth, database operations, backend tests |
| `frontend-developer` | UI components, pages, interactions, API client, frontend tests |
| `qa-integration-tester` | E2E tests, integration tests, bug reports |
| `security-engineer` | Security audits, vulnerability reports, remediation guidance |

## GitHub Tools Strategy

| Concern | Tool |
|---------|------|
| Backlog, epics, stories, bugs | **GitHub Projects** board + **GitHub Issues** |
| Architecture, API contract, schema, ADRs, security audit | **GitHub Wiki** |
| Code review | **GitHub Pull Requests** |
| Source tree | Code, configs, `Dockerfile`, `CLAUDE.md` only |

No `docs/` directory in the source tree. All documentation lives on the GitHub Wiki. The GitHub Projects board is the single source of truth for backlog management.

### GitHub Wiki Pages (managed by product-architect and security-engineer)
- **Architecture** — system design, tech stack, conventions
- **API Contract** — REST API endpoint specifications
- **Schema** — database schema documentation
- **ADR Index** — links to all architectural decision records
- **ADR-NNN-Title** — individual ADR pages
- **Security Audit** — security findings and remediation status

### GitHub Repo
- **Repository**: `steilerDev/cornerstone`
- **Default branch**: `main`

## Agile Workflow

We follow an incremental, agile approach:

1. **Product Owner** defines epics covering all requirements, then breaks each epic into user stories during sprint planning
2. **Product Architect** designs schema additions and API endpoints for each epic incrementally (not all upfront)
3. **Backend Developer** implements API and business logic per-epic
4. **Frontend Developer** implements UI per-epic
5. **Security Engineer** reviews periodically
6. **QA Tester** validates integrated features

Schema and API contract evolve incrementally as each epic is implemented, rather than being designed all at once upfront.

## Git & Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **Types**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`
- **Scope** optional but encouraged: `feat(work-items):`, `fix(budget):`, `docs(adr):`
- **Breaking changes**: Use `!` suffix or `BREAKING CHANGE:` footer
- Every completed task gets its own commit with a meaningful description

## Tech Stack

> **TODO**: To be filled in by the Product Architect during Step 2 (project scaffolding).

## Project Structure

> **TODO**: To be filled in by the Product Architect during Step 2 (project scaffolding).

## Coding Standards

> **TODO**: To be filled in by the Product Architect during Step 2 (project scaffolding).

## Testing Approach

> **TODO**: To be filled in by the Product Architect during Step 2 (project scaffolding).

## Development Workflow

> **TODO**: To be filled in by the Product Architect during Step 2 (project scaffolding).

## Cross-Team Convention

Any agent making a decision that affects other agents (e.g., a new naming convention, a shared pattern, a configuration change) must update this file so the convention is documented in one place.
