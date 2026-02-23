---
sidebar_position: 1
title: Development
---

# Development

Cornerstone is built almost entirely by an AI agent team -- a set of specialized Claude Code agents that handle everything from architecture design to code implementation to testing and security review.

This section documents the agentic development process, the agent team, and how to set up a development environment.

## An Agentic Experiment

This project is a deliberate experiment in agentic software development. The goal is to write as little code as possible by hand, instead relying on a coordinated team of AI agents to build a real, production-quality application.

A human orchestrator (the repository owner) directs the agents: defining requirements, approving plans, and validating features. The agents handle the implementation, testing, code review, and documentation.

## Documentation Structure

Cornerstone's documentation lives in three places:

| Location | Content | Audience |
|----------|---------|----------|
| **This docs site** | User guides, deployment, development process | End users and curious developers |
| **[GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki)** | Architecture, API contract, database schema, ADRs, security audit | Agent team and contributors |
| **[CLAUDE.md](https://github.com/steilerDev/cornerstone/blob/main/CLAUDE.md)** | Agent instructions, conventions, workflow rules | AI agents |

The Wiki is the technical reference that agents read and write. This docs site is the human-friendly layer on top.

## Next Steps

- [Agentic Development](agentic/overview) -- How the agent team works
- [Agent Team](agentic/agent-team) -- Meet the 10 specialized agents
- [Development Workflow](agentic/workflow) -- Agile cycle, branching, and releases
- [Dev Setup](agentic/setup) -- Set up a local development environment
- [Tech Stack](tech-stack) -- Technologies used in the project
