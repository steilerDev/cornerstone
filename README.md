# cornerstone

> [!NOTE]
> I'm using this project to test out 'vibe coding' - I use this as a playground to better understand how to use an agentic development workflow. My plan is to write as little code as possible, but rely on a set of agents to build this application. I currently have a time-limited need for this (relatievely) simple application - which is why I'm not necessarily concerned about long-term maintainability.

A self-hosted home building project management tool for homeowners. Track work items, budgets, timelines, and household item purchases from a single Docker container backed by SQLite -- no external database required.

**[Full documentation →](https://steilerDev.github.io/cornerstone/)**

## Features

- **Work Items** -- CRUD, statuses, dates, assignments, tags, notes, subtasks, dependencies, keyboard shortcuts
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
- [ ] **EPIC-05**: Budget Management
- [ ] **EPIC-04**: Household Items
- [ ] **EPIC-06**: Timeline and Gantt Chart
- [ ] **EPIC-07**: Reporting and Export
- [ ] **EPIC-08**: Paperless-ngx Integration
- [ ] **EPIC-09**: Dashboard and Overview
- [ ] **EPIC-10**: UX Polish and Accessibility

Track live progress on the [GitHub Projects board](https://github.com/users/steilerDev/projects/4).

## Documentation

| Resource | Description |
|----------|-------------|
| [Docs site](https://steilerDev.github.io/cornerstone/) | User guides, deployment, getting started |
| [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki) | Architecture, API contract, schema, ADRs |
| [CLAUDE.md](CLAUDE.md) | Agent instructions and project conventions |

## Contributing

Cornerstone is a personal project built primarily through an agentic development workflow. If you have questions or suggestions, feel free to [open an issue](https://github.com/steilerDev/cornerstone/issues).

## License

This project is not currently published under an open-source license.
