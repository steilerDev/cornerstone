# cornerstone

> [!NOTE]
> I'm using this project to test out 'vibe coding' - I use this as a playground to better understand how to use an agentic development workflow. My plan is to write as little code as possible, but rely on a set of agents to build this application. I currently have a time-limited need for this (relatievely) simple application - which is why I'm not necessarily concerned about long-term maintainability.
> After having spend a couple of weeks on this project, I'm both blown away by its capabilities, while still feeling that things don't move as fast as I would like it to be. Key learnings:
> - In order to coding agents to produce good work, verification is very important.
> - Good work will cost a lot of tokens!
> - Clearly defining the process through skills and agents simplifies the UX for the developer and ensures coding happens along a happy path.
> - Parallel work is important - using git worktrees for this should be natively supported by coding agents.
> - Running coding agents on your host is dangerous! They can (and will) go wild and perform tasks that you would have never thought of and they are clever in bypassing restrictions. An [isolated environment](https://docs.docker.com/ai/sandboxes/) is crucial to provide agents with clear restrictions and reduce the blast radius in case something goes wrong - Coding Agent Governance will be a critical capability moving forward!
> - In order to follow a policy, it needs correct enforcement - nicely asking an agent to follow it will not always work: Make sure your CI, Repository and Deployment process have enforced quality gates with no way for the agent to bypass them .

[![GitHub Release](https://img.shields.io/github/v/release/steilerDev/cornerstone?label=release)](https://github.com/steilerDev/cornerstone/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/steilerDev/cornerstone/ci.yml?branch=main&label=CI)](https://github.com/steilerDev/cornerstone/actions/workflows/ci.yml)
[![Docker Image](https://img.shields.io/docker/v/steilerdev/cornerstone?label=Docker&sort=semver)](https://hub.docker.com/r/steilerdev/cornerstone)

A self-hosted home building project management tool for homeowners. Track work items, manage dependencies, organize with tags, and collaborate with your household -- all from a single Docker container backed by SQLite. No external database or cloud service required.

**[Full documentation →](https://steilerDev.github.io/cornerstone/)**

## Features

- **Work Items** -- CRUD, statuses, dates, assignments, tags, notes, subtasks, dependencies, keyboard shortcuts
- **Budget Management** -- Budget categories, financing sources, vendor invoices, subsidies, overview dashboard with projections
- **Authentication** -- Local accounts with setup wizard, OIDC single sign-on
- **User Management** -- Admin and Member roles, admin panel
- **Dark Mode** -- Light, Dark, or System theme
- **Design System** -- CSS custom property token system, consistent visual language

## Quick Start

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  steilerdev/cornerstone:latest
```

Open `http://localhost:3000` -- the setup wizard will guide you through creating your admin account. See the [full deployment guide](https://steilerDev.github.io/cornerstone/getting-started/docker-setup) for Docker Compose, reverse proxy, and OIDC configuration.

## Roadmap

- [x] **EPIC-02**: Application Shell and Infrastructure
- [x] **EPIC-11**: CI/CD Infrastructure
- [x] **EPIC-01**: Authentication and User Management
- [x] **EPIC-03**: Work Items
- [x] **EPIC-12**: Design System Bootstrap
- [x] **EPIC-05**: Budget Management
- [ ] **EPIC-04**: Household Items
- [ ] **EPIC-06**: Timeline and Gantt Chart
- [ ] **EPIC-07**: Reporting and Export
- [ ] **EPIC-08**: Paperless-ngx Integration
- [ ] **EPIC-09**: Dashboard and Overview
- [ ] **EPIC-10**: UX Polish and Accessibility

Track live progress on the [GitHub Projects board](https://github.com/users/steilerDev/projects/4).

## Documentation

| Resource                                                      | Description                                |
| ------------------------------------------------------------- | ------------------------------------------ |
| [Docs site](https://steilerDev.github.io/cornerstone/)        | User guides, deployment, getting started   |
| [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki) | Architecture, API contract, schema, ADRs   |
| [CLAUDE.md](CLAUDE.md)                                        | Agent instructions and project conventions |

## Contributing

Cornerstone is a personal project built primarily through an agentic development workflow. If you have questions or suggestions, feel free to [open an issue](https://github.com/steilerDev/cornerstone/issues).

## License

This project is not currently published under an open-source license.
