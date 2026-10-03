---
sidebar_position: 1
title: Overview
---

# Agentic Development

Cornerstone uses an **agentic development workflow** where a team of specialized AI agents (powered by Claude) collaboratively build software under human direction.

## The Orchestrator and Agent Team

A **human orchestrator** (the repository owner) directs the work: defining requirements, launching agents, validating output, and approving releases. The **11-member agent team** specializes by function -- product ownership, architecture, implementation, testing, security, UX, and documentation.

Each agent has:

- A specific system prompt and role
- Persistent memory across sessions
- Authority within its domain (architects approve schema, security engineer reviews auth code, etc.)
- A communication protocol (commits with trailers, GitHub comments with agent tags, specification documents)

## How It Works

The typical workflow for a user story:

1. **Human sets direction** -- "We need a photo annotation editor." Needs move to GitHub Issues.
2. **Orchestrator launches planning agents** -- `product-owner` writes stories; `product-architect` designs schema and API.
3. **Human approves the plan** -- Reviews acceptance criteria and technical design.
4. **Orchestrator launches implementation** -- Agents implement, test, review, and commit in sequence.
5. **Human validates the feature** -- Runs manual tests, provides feedback.
6. **Orchestrator promotes to release** -- Merges `beta` to `main`, updates docs.

The key rule: **the orchestrator delegates, never implements.** All code, tests, architecture, and docs go through agents.

## Flat Delegation Model

The orchestrator launches all agents directly. The `dev-team-lead` plays a coordinating role (writes implementation specs, reviews output, commits code) but does not sub-delegate -- it routes specs to implementing agents, not other agents. This flat model keeps handoffs clear:

- **Spec**: `dev-team-lead` writes a spec from the acceptance criteria and architecture
- **Implement**: The relevant agent(s) (`backend-developer`, `frontend-developer`, etc.) execute the spec
- **Test**: `qa-integration-tester` and `e2e-test-engineer` write tests in parallel
- **Review**: Agent reviewers (`product-architect`, `security-engineer`, etc.) approve per domain
- **Fix**: If review finds issues, the implementing agent fixes in-session
- **Commit**: `dev-team-lead` stages, commits with all agent trailers, pushes, and creates the PR

## One Story Per Cycle

Each development cycle completes exactly one user story end-to-end before starting the next. This keeps context focused and boundaries clear. The orchestrator breaks epics into stories; stories flow through implementation to merge; completed stories move to Done; the cycle repeats.

The only exception is bundled small fixes (`/develop` with multiple small issues), which execute in one cycle but each get their own commit.

## Learn More

- [Agent Team](agent-team) -- Detailed roles and models for all 11 agents
- [Skills](skills) -- Skill structure and lifecycle (`/epic-start`, `/develop`, etc.)
- [Workflow](workflow) -- PR review gates and release cycle
- [CI & Guardrails](quality-gates) -- Automated quality enforcement
