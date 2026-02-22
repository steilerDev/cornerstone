# cornerstone

> [!NOTE]
> I'm using this project to test out 'vibe coding' - I use this as a playground to better understand how to use an agentic development workflow. My plan is to write as little code as possible, but rely on a set of agents to build this application. I currently have a time-limited need for this (relatievely) simple application - which is why I'm not necessarily concerned about long-term maintainability.

[![GitHub Release](https://img.shields.io/github/v/release/steilerDev/cornerstone?label=release)](https://github.com/steilerDev/cornerstone/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/steilerDev/cornerstone/ci.yml?branch=main&label=CI)](https://github.com/steilerDev/cornerstone/actions/workflows/ci.yml)
[![Docker Image](https://img.shields.io/docker/v/steilerdev/cornerstone?label=Docker&sort=semver)](https://hub.docker.com/r/steilerdev/cornerstone)

A self-hosted home building project management tool for homeowners. Track work items, manage dependencies, organize with tags, and collaborate with your household -- all from a single Docker container backed by SQLite. No external database or cloud service required.

## Features

### Work Items

Create, view, edit, and delete work items to track every task in your build project. Each work item supports:

- **Status tracking** -- Not Started, In Progress, Completed, or Blocked
- **Scheduling** -- Start and end dates, durations, and "start after" / "start before" constraints for vendor or weather dependencies
- **User assignment** -- Assign items to any registered user on your instance
- **Tags** -- Color-coded tags (e.g., "Electrical", "Plumbing", "Exterior") for organizing and filtering work items. Manage tags from a dedicated page in the sidebar.
- **Notes** -- Add timestamped notes to any work item to track progress or record decisions. Authors and admins can edit or delete notes.
- **Subtasks** -- Break work items into checklist items. Toggle completion with a single click and reorder with up/down buttons.
- **Dependencies** -- Define predecessor/successor relationships between work items using a sentence-builder interface. Supports Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish types. Circular dependencies are automatically detected and prevented.

### List View

- **Filtering** -- Filter by status, assigned user, or tag. Full-text search with debounced input.
- **Sorting and pagination** -- Sort by title, status, start date, end date, created date, or updated date. Paginated results for large projects.
- **Responsive layout** -- Table layout on desktop, card layout on mobile and tablet. URL state sync keeps your filters bookmarkable.

### Keyboard Shortcuts

- **List page** -- `n` to create a new work item, `/` to focus search, arrow keys to navigate, `?` for help
- **Detail page** -- `e` to edit, `Delete` to delete, `Escape` to cancel

### Authentication and User Management

- **First-run setup** -- On first launch, a setup wizard walks you through creating the initial admin account. No command-line setup needed.
- **Local authentication** -- Email and password login with bcrypt password hashing and secure session cookies.
- **OIDC single sign-on** -- Connect to your existing identity provider (Authentik, Keycloak, and other OpenID Connect providers) for seamless login. New users are automatically provisioned on their first OIDC login.
- **User profiles** -- Users can view and edit their display name and change their password (local accounts).
- **Admin user management** -- Admins can list, search, edit roles, and deactivate user accounts.
- **Role-based access control** -- Admin and Member roles control access to management features.

### Appearance

- **Dark mode** -- Choose Light, Dark, or System (follows your OS preference). Your selection is remembered and applied immediately with no flash on page load.
- **Responsive design** -- Full sidebar navigation on desktop, collapsible menu on mobile and tablet.
- **Design token system** -- Consistent visual language built on CSS custom properties with semantic color tokens, ensuring a polished look across light and dark themes.

### Infrastructure

- **Health checks** -- Built-in `/api/health/ready` and `/api/health/live` endpoints for Docker and orchestrator health monitoring.
- **Automated releases** -- CI/CD pipeline with semantic versioning and multi-architecture Docker images (amd64/arm64).

### Coming Soon

Cornerstone is under active development. Planned features include Gantt chart visualization, budget tracking, household item management, Paperless-ngx integration, and a project dashboard. See the [Roadmap](#roadmap) for details.

## Quick Start

### 1. Start the container

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  steilerdev/cornerstone:latest
```

### 2. Create your admin account

Open `http://localhost:3000` in your browser. On first launch, you will be redirected to the setup wizard where you create the initial admin account.

### 3. Log in and start managing your project

After setup, log in with your new admin credentials. You can invite additional users through the admin user management panel.

### Docker Compose (recommended)

For a more maintainable setup, use Docker Compose. Copy the example environment file and adjust as needed:

```bash
# Download the files
curl -O https://raw.githubusercontent.com/steilerDev/cornerstone/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/steilerDev/cornerstone/main/.env.example

# Configure your environment
cp .env.example .env
# Edit .env with your preferred settings

# Start the application
docker compose up -d
```

The default configuration works out of the box -- the only thing you must do is complete the first-run setup wizard in the browser.

## Configuration

All configuration is done through environment variables. The defaults are suitable for most setups.

### Server

| Variable       | Default                    | Description                                                        |
| -------------- | -------------------------- | ------------------------------------------------------------------ |
| `PORT`         | `3000`                     | Port the server listens on                                         |
| `HOST`         | `0.0.0.0`                  | Bind address                                                       |
| `DATABASE_URL` | `/app/data/cornerstone.db` | Path to the SQLite database file                                   |
| `LOG_LEVEL`    | `info`                     | Log verbosity (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `NODE_ENV`     | `production`               | Environment mode                                                   |

### Sessions

| Variable           | Default  | Description                                      |
| ------------------ | -------- | ------------------------------------------------ |
| `SESSION_DURATION` | `604800` | Session lifetime in seconds (default: 7 days)    |
| `SECURE_COOKIES`   | `true`   | Send cookies with `Secure` flag (requires HTTPS) |

> **Note:** `SECURE_COOKIES` defaults to `true`, which means cookies are only sent over HTTPS. If you are testing locally without HTTPS, set this to `false`. Behind a reverse proxy with TLS termination, keep the default `true`.

### Reverse Proxy

| Variable      | Default | Description                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------------- |
| `TRUST_PROXY` | `false` | Set to `true` when running behind a reverse proxy (nginx, Caddy, Traefik, etc.) |

When deploying behind a reverse proxy, set `TRUST_PROXY=true` so the server correctly reads forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`, etc.). This is required for secure cookies and OIDC redirects to work properly.

### OIDC (Single Sign-On)

OIDC is automatically enabled when `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all set. No separate "enable" flag is needed.

| Variable             | Default | Description                                                                                                                                                                            |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER`        | --      | Your OIDC provider's issuer URL (e.g., `https://auth.example.com/realms/main`)                                                                                                         |
| `OIDC_CLIENT_ID`     | --      | Client ID registered with your OIDC provider                                                                                                                                           |
| `OIDC_CLIENT_SECRET` | --      | Client secret for the OIDC client                                                                                                                                                      |
| `OIDC_REDIRECT_URI`  | --      | Callback URL (optional -- auto-derived from the request if not set). Set this if your app is behind a reverse proxy. Example: `https://cornerstone.example.com/api/auth/oidc/callback` |

**Setting up OIDC with your identity provider:**

1. Register a new client/application in your OIDC provider (Authentik, Keycloak, etc.)
2. Set the redirect URI to `https://<your-domain>/api/auth/oidc/callback`
3. Copy the issuer URL, client ID, and client secret into your environment variables
4. Users who log in via OIDC for the first time are automatically created with the Member role

**Example `.env` for OIDC:**

```env
TRUST_PROXY=true
SECURE_COOKIES=true
OIDC_ISSUER=https://auth.example.com/realms/main
OIDC_CLIENT_ID=cornerstone
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://cornerstone.example.com/api/auth/oidc/callback
```

## Roadmap

Cornerstone is under active development. Here is the current state of planned features:

- [x] **EPIC-02: Application Shell and Infrastructure** ([#2](https://github.com/steilerDev/cornerstone/issues/2)) -- Responsive layout, routing, API client, health checks, error handling
- [x] **EPIC-11: CI/CD Infrastructure** ([#12](https://github.com/steilerDev/cornerstone/issues/12)) -- Automated builds, semantic versioning, Docker image publishing
- [x] **EPIC-01: Authentication and User Management** ([#1](https://github.com/steilerDev/cornerstone/issues/1)) -- Local login, OIDC SSO, user profiles, admin panel, role-based access
- [x] **EPIC-03: Work Items** ([#3](https://github.com/steilerDev/cornerstone/issues/3)) -- Work item CRUD, tags, notes, subtasks, dependencies, keyboard shortcuts, list and detail pages
- [x] **EPIC-12: Design System Bootstrap** ([#115](https://github.com/steilerDev/cornerstone/issues/115)) -- Design token system, dark mode, brand identity, CSS module migration, style guide
- [ ] **EPIC-04: Household Items** ([#4](https://github.com/steilerDev/cornerstone/issues/4)) -- Furniture and appliance purchase tracking
- [ ] **EPIC-05: Budget Management** ([#5](https://github.com/steilerDev/cornerstone/issues/5)) -- Category-based budgeting, financing sources, cost tracking
- [ ] **EPIC-06: Timeline and Gantt Chart** ([#6](https://github.com/steilerDev/cornerstone/issues/6)) -- Visual timeline with dependencies and scheduling
- [ ] **EPIC-07: Reporting and Export** ([#7](https://github.com/steilerDev/cornerstone/issues/7)) -- Document export and reporting features
- [ ] **EPIC-08: Paperless-ngx Integration** ([#8](https://github.com/steilerDev/cornerstone/issues/8)) -- Reference documents from a Paperless-ngx instance
- [ ] **EPIC-09: Dashboard and Overview** ([#9](https://github.com/steilerDev/cornerstone/issues/9)) -- Project dashboard with budget summary and activity
- [ ] **EPIC-10: UX Polish and Accessibility** ([#10](https://github.com/steilerDev/cornerstone/issues/10)) -- Accessibility improvements and UI refinements

Track live progress on the [GitHub Projects board](https://github.com/users/steilerDev/projects/4).

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

Architecture decisions, API contract, database schema, and security audit documentation live on the [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki). The [Style Guide](https://github.com/steilerDev/cornerstone/wiki/Style-Guide) documents the design token system, color palette, typography, and component patterns for contributors.

## Contributing

Cornerstone is a personal project built primarily through an agentic development workflow. If you have questions or suggestions, feel free to [open an issue](https://github.com/steilerDev/cornerstone/issues).

## License

This project is not currently published under an open-source license.
