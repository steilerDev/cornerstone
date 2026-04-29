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
| `TRUST_PROXY` | `false` | Set to `true` when running behind a reverse proxy (nginx, Caddy, Traefik, etc.). Only the first proxy hop is trusted, and rate limiting uses a resilient client identifier that resists `X-Forwarded-For` spoofing. |
| `EXTERNAL_URL` | -- | Public-facing base URL (e.g., `https://myhouse.example.com`). Used for OIDC callback, CalDAV/CardDAV discovery, and `.mobileconfig` generation. |

When deploying behind a reverse proxy, set `TRUST_PROXY=true` so the server correctly reads forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`, etc.). Set `EXTERNAL_URL` to the public URL users access your instance at -- this ensures OIDC callbacks, CalDAV/CardDAV discovery, and Apple configuration profiles work correctly regardless of internal networking.

## OIDC (Single Sign-On)

OIDC is automatically enabled when `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all set. No separate "enable" flag is needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ISSUER` | -- | Your OIDC provider's issuer URL (e.g., `https://auth.example.com/realms/main`) |
| `OIDC_CLIENT_ID` | -- | Client ID registered with your OIDC provider |
| `OIDC_CLIENT_SECRET` | -- | Client secret for the OIDC client |

The OIDC callback URL is automatically derived as `<EXTERNAL_URL>/api/auth/oidc/callback`. If `EXTERNAL_URL` is not set, it falls back to the request's protocol and host. See [OIDC Setup](../guides/users/oidc-setup) for details on registering this URL with your identity provider.

## Localization

| Variable | Default | Description |
|----------|---------|-------------|
| `CURRENCY` | `EUR` | ISO 4217 currency code (e.g., `EUR`, `USD`, `CHF`) used for formatting monetary values |

## Diary

| Variable | Default | Description |
|----------|---------|-------------|
| `DIARY_AUTO_EVENTS` | `true` | Whether the construction diary automatically logs system events (status changes, invoice updates, etc.). Set to `false` to disable automatic entries. |
| `PHOTO_STORAGE_PATH` | `<data-dir>/photos` | Directory where diary photo attachments are stored. Defaults to a `photos` folder next to the database file. |
| `PHOTO_MAX_FILE_SIZE_MB` | `20` | Maximum file size in megabytes for photo uploads |

:::note
`PHOTO_STORAGE_PATH` defaults to a `photos` directory alongside your database file. If you use a custom `DATABASE_URL`, the photo directory is created relative to it. Make sure the path is within a persistent Docker volume so photos survive container restarts.
:::

## Backups

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | `/backups` | Directory where backup archives are written. Must be outside the app data directory. |
| `BACKUP_CADENCE` | -- | Cron expression for automatic scheduled backups (e.g., `0 2 * * *` for daily at 2 AM). If unset, only manual backups are available. |
| `BACKUP_RETENTION` | -- | Maximum number of backup archives to keep. The oldest archives are deleted when the limit is exceeded. If unset, backups are kept indefinitely. |

The backup feature is enabled whenever `BACKUP_DIR` resolves to a directory outside the app data directory -- which is true by default. See [Backups](/guides/backup) for setup, scheduling, and restore instructions.

## Paperless-ngx (Document Integration)

The document integration is automatically enabled when both `PAPERLESS_URL` and `PAPERLESS_API_TOKEN` are set.

| Variable | Default | Description |
|----------|---------|-------------|
| `PAPERLESS_URL` | -- | Base URL of your Paperless-ngx instance used by the server for API calls (e.g., `http://paperless:8000` in Docker) |
| `PAPERLESS_API_TOKEN` | -- | API authentication token from Paperless-ngx |
| `PAPERLESS_EXTERNAL_URL` | -- | Browser-facing URL for Paperless-ngx links (e.g., `https://paperless.example.com`). If unset, falls back to `PAPERLESS_URL`. |

For detailed setup instructions, see [Documents Setup](/guides/documents/setup).
