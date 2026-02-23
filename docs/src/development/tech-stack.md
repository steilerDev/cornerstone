---
sidebar_position: 5
title: Tech Stack
---

# Tech Stack

## Core Technologies

| Layer | Technology | Version |
|-------|-----------|---------|
| Server | [Fastify](https://fastify.dev/) | 5.x |
| Client | [React](https://react.dev/) | 19.x |
| Client Routing | [React Router](https://reactrouter.com/) | 7.x |
| Database | [SQLite](https://www.sqlite.org/) (via better-sqlite3) | -- |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) | 0.45.x |
| Bundler | [Webpack](https://webpack.js.org/) | 5.x |
| Styling | CSS Modules | -- |
| Testing | [Jest](https://jestjs.io/) (unit/integration), [Playwright](https://playwright.dev/) (E2E) | 30.x / 1.58.x |
| Language | [TypeScript](https://www.typescriptlang.org/) | ~5.9 |
| Runtime | [Node.js](https://nodejs.org/) | 24 LTS |
| Container | Docker (Alpine) | -- |
| Monorepo | npm workspaces | -- |

## Key Design Decisions

Each major technology choice is documented in an Architectural Decision Record (ADR) on the [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki/ADR-Index):

- **[ADR-001](https://github.com/steilerDev/cornerstone/wiki/ADR-001-Server-Framework)**: Server Framework (Fastify)
- **[ADR-002](https://github.com/steilerDev/cornerstone/wiki/ADR-002-Frontend-Framework)**: Frontend Framework (React)
- **[ADR-003](https://github.com/steilerDev/cornerstone/wiki/ADR-003-Database-and-ORM)**: Database and ORM (SQLite + Drizzle)
- **[ADR-004](https://github.com/steilerDev/cornerstone/wiki/ADR-004-Bundler-and-Build-Tooling)**: Bundler (Webpack)
- **[ADR-005](https://github.com/steilerDev/cornerstone/wiki/ADR-005-Testing-Framework)**: Testing Framework (Jest + Playwright)
- **[ADR-006](https://github.com/steilerDev/cornerstone/wiki/ADR-006-Styling-Approach)**: Styling (CSS Modules)
- **[ADR-007](https://github.com/steilerDev/cornerstone/wiki/ADR-007-Project-Structure)**: Project Structure (npm workspaces)

## Dependency Policy

Cornerstone follows strict dependency policies:

- **No native binary frontend tooling** -- tools like esbuild, SWC, and Tailwind v4 ship platform-specific binaries that fail in certain environments. Cornerstone uses pure JavaScript alternatives (Webpack, Babel, PostCSS).
- **Pinned versions** -- exact versions rather than caret ranges (`^`) to prevent unexpected upgrades.
- **Zero known vulnerabilities** -- `npm audit` must pass before merging.

## Further Reading

For detailed technical documentation, visit the [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki):

- [Architecture](https://github.com/steilerDev/cornerstone/wiki/Architecture) -- system design and conventions
- [API Contract](https://github.com/steilerDev/cornerstone/wiki/API-Contract) -- REST API endpoint specifications
- [Schema](https://github.com/steilerDev/cornerstone/wiki/Schema) -- database schema documentation
- [Security Audit](https://github.com/steilerDev/cornerstone/wiki/Security-Audit) -- security findings and status
