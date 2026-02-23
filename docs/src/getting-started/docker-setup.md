---
sidebar_position: 1
title: Docker Setup
---

# Docker Setup

## Docker Run

The simplest way to run Cornerstone:

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  steilerdev/cornerstone:latest
```

This starts Cornerstone on port 3000 with a persistent volume for the SQLite database.

## Docker Compose (Recommended)

For a more maintainable setup, use Docker Compose:

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

The default configuration works out of the box -- the only thing you must do is complete the [first-run setup wizard](first-login) in the browser.

## Behind a Reverse Proxy

When deploying behind a reverse proxy (nginx, Caddy, Traefik, etc.), set these environment variables:

```env
TRUST_PROXY=true
SECURE_COOKIES=true
```

`TRUST_PROXY` tells Cornerstone to read forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`, etc.). This is required for secure cookies and OIDC redirects to work properly behind a proxy.

## Data Persistence

Cornerstone stores all data in a single SQLite database file at `/app/data/cornerstone.db` inside the container. Mount a Docker volume or bind-mount to `/app/data` to persist your data across container restarts:

```bash
# Named volume (recommended)
-v cornerstone-data:/app/data

# Bind mount
-v /path/on/host:/app/data
```

## Health Checks

The Docker image includes a built-in health check that verifies the server is running and the database is accessible:

- **Readiness**: `GET /api/health/ready` -- verifies database access and password hashing
- **Liveness**: `GET /api/health/live` -- basic server responsiveness check

The health check runs every 30 seconds with a 15-second startup grace period.

## Image Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release |
| `beta` | Latest beta pre-release |
| `x.y.z` | Specific stable version (e.g., `1.7.0`) |
| `x.y` | Latest patch of a minor version (e.g., `1.7`) |
| `x.y.z-beta.n` | Specific beta version (e.g., `1.7.0-beta.1`) |
