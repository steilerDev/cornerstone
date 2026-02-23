---
sidebar_position: 1
title: Overview
---

# Agentic Development

Cornerstone is built using an **agentic development workflow** -- a team of specialized AI agents (powered by Claude) that collaboratively build software under human direction.

## What Does "Agentic" Mean?

Instead of a single developer writing all the code, Cornerstone uses a team of 10 Claude Code agents, each with a specific role:

- A **product owner** defines user stories
- An **architect** designs the system
- **Backend and frontend developers** write the code
- **QA and E2E engineers** write and run tests
- A **security engineer** audits every change
- A **UX designer** creates visual specifications
- And more...

Each agent has its own system prompt, memory, and area of responsibility. They communicate through GitHub Issues, PRs, and the codebase itself.

## How It Works

1. A **human orchestrator** (the repository owner) decides what to build next
2. The orchestrator launches agents in sequence -- planning before implementation, testing before review
3. Each agent reads the codebase, wiki, and GitHub issues to understand context
4. Agents produce code, documentation, tests, and reviews
5. The orchestrator validates the output and directs fixes
6. The human gives final approval before features ship

## Why This Approach?

This project exists to explore a question: **Can a team of AI agents build a real, production-quality application with minimal human coding?**

The answer so far: yes, with careful orchestration. The agents produce working code, comprehensive tests (95%+ coverage target), security reviews, and documentation. The human role is primarily direction-setting, quality validation, and final approval.

## Key Principles

- **Agents specialize** -- each agent has a focused role, not a jack-of-all-trades
- **Agents review each other** -- the architect reviews code for compliance, security reviews every PR, the product owner validates requirements
- **Human in the loop** -- the orchestrator approves plans, and the user validates features before release
- **Everything on GitHub** -- issues, PRs, wiki, and project board are the coordination layer
- **Memory persists** -- agents maintain memory across sessions so learnings compound

## Learn More

- [Agent Team](agent-team) -- detailed descriptions of all 10 agents
- [Workflow](workflow) -- the full agile cycle from story to release
- [Dev Setup](setup) -- how to set up the development environment
