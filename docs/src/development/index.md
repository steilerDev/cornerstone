---
sidebar_position: 1
title: Behind the Scenes
---

# Behind the Scenes

Cornerstone is built by a **human orchestrator plus a team of 11 specialized Claude Code agents** -- an experiment in applying real software engineering practices to agentic development.

## The Agentic Experiment

The goal is straightforward: **write as little code by hand as possible** while maintaining production quality.

A human orchestrator (the repository owner) provides direction: defining requirements, validating plans, and approving releases. The agent team handles implementation, testing, code review, and documentation. Work flows through GitHub Issues, PRs, and a skill-based workflow system that breaks down each epic into stories and coordinates execution across agents.

This section explains how the system works, the agents involved, and the lessons learned from building a real application this way.

## Documentation Structure

Cornerstone's documentation lives in three places:

| Location | Content | Audience |
|----------|---------|----------|
| **This docs site** | User guides, deployment, development process | End users, curious developers |
| **[GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki)** | Architecture, API contract, database schema, ADRs, security audit | Agent team and contributors |
| **[CLAUDE.md](https://github.com/steilerDev/cornerstone/blob/main/CLAUDE.md)** | Agent instructions, conventions, workflow rules, tech stack | AI agents |

The Wiki is the authoritative technical reference. This docs site is the human-friendly layer. CLAUDE.md is the operational manual for agents.

## Lessons Learned

The owner's key takeaways from building Cornerstone this way:

- **Verification is everything.** For coding agents to produce good work, their output has to be verified -- by tests, reviews, and automated gates.
- **Good work costs a lot of tokens.** Thorough specs, reviews, and fix loops add up; quality is not cheap.
- **Process makes the experience simple.** Clearly defining the process through [skills](agentic/skills) and [agents](agentic/agent-team) simplifies the developer's experience and keeps coding on a happy path.
- **Parallel work matters.** Running several sessions side by side, each in its own worktree, is essential -- and coding agents should support it natively.
- **Never run coding agents on your host.** They can (and will) go wild, performing tasks you would never have thought of, and they are clever at bypassing restrictions. An [isolated environment](https://docs.docker.com/ai/sandboxes/) gives agents clear boundaries and limits the blast radius when something goes wrong -- coding-agent governance will be a critical capability going forward.
- **A policy needs enforcement.** Nicely asking an agent to follow a rule will not always work. CI, repository, and deployment processes need enforced [quality gates](agentic/quality-gates) the agent has no way to bypass.


## Next Steps

- [Agentic Development Overview](agentic/overview) -- How the agent team works
- [Agent Team](agentic/agent-team) -- The 11 specialized agents
- [Skills](agentic/skills) -- Lifecycle and skill structure
- [Workflow](agentic/workflow) -- PR review, release cycle
- [CI & Guardrails](agentic/quality-gates) -- Quality gates and enforcement
- [Dev Setup](agentic/setup) -- Local development environment
- [Tech Stack](tech-stack) -- Technologies and ADRs
