---
sidebar_position: 4
title: Dev Setup
---

# Development Setup

## Prerequisites

- Node.js >= 24 (see `.nvmrc`)
- npm >= 11
- Docker (for container builds and E2E tests)

## Getting Started

```bash
git clone https://github.com/steilerDev/cornerstone.git
cd cornerstone
git submodule update --init   # Initialize wiki submodule
npm install                   # Install all workspace dependencies
npm run dev                   # Start server (port 3000) + client dev server (port 5173)
```

In development, the Webpack dev server at `http://localhost:5173` proxies `/api/*` requests to the Fastify server at `http://localhost:3000`.

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client in watch mode |
| `npm run dev:server` | Start only the Fastify server |
| `npm run dev:client` | Start only the Webpack dev server |
| `npm run build` | Build all packages (shared -> client -> server) |
| `npm test` | Run all unit and integration tests |
| `npm run lint` | Lint all code |
| `npm run format` | Format all code |
| `npm run typecheck` | Type-check all packages |
| `npm run db:migrate` | Run pending database migrations |
| `npm run docs:dev` | Start the docs site dev server |
| `npm run docs:build` | Build the docs site |

## Project Structure

Cornerstone is an npm workspaces monorepo:

```
cornerstone/
  shared/    # @cornerstone/shared - TypeScript types
  server/    # @cornerstone/server - Fastify REST API
  client/    # @cornerstone/client - React SPA
  e2e/       # @cornerstone/e2e - Playwright E2E tests
  docs/      # @cornerstone/docs - This documentation site
```

Build order: `shared` -> `client` -> `server`. The `docs` and `e2e` workspaces are standalone.

## Parallel Sessions (Worktrees)

Multiple development sessions can run in parallel using git worktrees. Each worktree gets its own directory with isolated `node_modules/`, database, and dev server ports.

See the `CLAUDE.md` file for detailed worktree setup instructions.

## Docker Build

```bash
docker build -t cornerstone .
docker run -p 3000:3000 -v cornerstone-data:/app/data cornerstone
```

For more details, see the [Docker Setup](../../getting-started/docker-setup) guide.
