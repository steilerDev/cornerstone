---
sidebar_position: 3
title: Configuration
---

# Configuration

All configuration is done through environment variables. The defaults are suitable for most setups.

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `/app/data/cornerstone.db` | Path to the SQLite database file |
| `LOG_LEVEL` | `info` | Log verbosity (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `NODE_ENV` | `production` | Environment mode |

## Sessions

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_DURATION` | `604800` | Session lifetime in seconds (default: 7 days) |
| `SECURE_COOKIES` | `true` | Send cookies with `Secure` flag (requires HTTPS) |

:::note
`SECURE_COOKIES` defaults to `true`, which means cookies are only sent over HTTPS. If you are testing locally without HTTPS, set this to `false`. Behind a reverse proxy with TLS termination, keep the default `true`.
:::

## Reverse Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUST_PROXY` | `false` | Set to `true` when running behind a reverse proxy (nginx, Caddy, Traefik, etc.) |

When deploying behind a reverse proxy, set `TRUST_PROXY=true` so the server correctly reads forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`, etc.). This is required for secure cookies and OIDC redirects to work properly.

## OIDC (Single Sign-On)

OIDC is automatically enabled when `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all set. No separate "enable" flag is needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ISSUER` | -- | Your OIDC provider's issuer URL (e.g., `https://auth.example.com/realms/main`) |
| `OIDC_CLIENT_ID` | -- | Client ID registered with your OIDC provider |
| `OIDC_CLIENT_SECRET` | -- | Client secret for the OIDC client |
| `OIDC_REDIRECT_URI` | -- | Callback URL (optional -- auto-derived from the request if not set) |

For detailed OIDC setup instructions, see [OIDC Setup](../guides/users/oidc-setup).
