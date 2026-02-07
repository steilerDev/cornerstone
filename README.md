# cornerstone

> [!NOTE]
> I'm using this project to test out 'vibe coding' - I use this as a playground to better understand how to use an agentic development workflow. My plan is to write as little code as possible, but rely on a set of agents to build this application. I currently have a time-limited need for this (relatievely) simple application - which is why I'm not necessarily concerned about long-term maintainability.

A web-based home building project management application designed to help homeowners manage their construction project. Track work items, budgets, timelines, and household item purchases — all from a single self-hosted Docker container.

## Features

- **Work Item Management** — Create tasks with start/end dates, dependencies, status tracking, and scheduling constraints. Automatic rescheduling when dates change.
- **Gantt Chart** — Visual timeline with dependency arrows, critical path highlighting, milestones, drag-and-drop rescheduling, and household item delivery dates.
- **Budget Tracking** — Category-based budgeting with planned vs. actual costs, multiple financing sources (bank loans, credit lines, savings), vendor/contractor payment tracking, and subsidy program support.
- **Household Items** — Track furniture and appliance purchases with delivery dates, costs, and links to related work items.
- **Document Integration** — Reference documents stored in [Paperless-ngx](https://docs.paperless-ngx.com/) — invoices, receipts, contracts, warranties — without local document storage.
- **Authentication** — OIDC (OpenID Connect) with automatic user provisioning. Supports Keycloak, Auth0, Okta, Google, Azure AD, and other standard providers.

## Quick Start

```bash
docker run -p 3000:3000 -v cornerstone-data:/app/data cornerstone
```

Open `http://localhost:3000` in your browser.

### Environment Variables

| Variable       | Default                    | Description                |
| -------------- | -------------------------- | -------------------------- |
| `PORT`         | `3000`                     | Server port                |
| `HOST`         | `0.0.0.0`                  | Server bind address        |
| `DATABASE_URL` | `/app/data/cornerstone.db` | SQLite database path       |
| `LOG_LEVEL`    | `info`                     | Log level (trace to fatal) |
| `NODE_ENV`     | `production`               | Environment                |

## Tech Stack

| Layer     | Technology                                       |
| --------- | ------------------------------------------------ |
| Server    | Fastify 5, Drizzle ORM, SQLite                   |
| Client    | React 19, React Router 7, Webpack 5, CSS Modules |
| Language  | TypeScript 5.9, Node.js 24 LTS                   |
| Testing   | Jest, Playwright                                 |
| Container | Docker (Alpine)                                  |

## Development

```bash
npm install                   # Install all workspace dependencies
npm run dev                   # Start server (port 3000) + client dev server (port 5173)
```

See [`CLAUDE.md`](CLAUDE.md) for the full project guide, coding standards, and development workflow.

## Documentation

Architecture decisions, API contract, database schema, and security audit documentation live on the [GitHub Wiki](../../wiki).

## Project Planning

The product backlog, epics, and user stories are managed on the [GitHub Projects board](../../projects). The full requirements document is in [`plan/REQUIREMENTS.md`](plan/REQUIREMENTS.md).

## License

This project is not currently published under an open-source license.
