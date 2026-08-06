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

`TRUST_PROXY` also determines which IP address the login rate limit (below) buckets requests by -- see [Authentication Rate Limiting](#authentication-rate-limiting) for the deployment implications.

## Authentication Rate Limiting

The login endpoint (`POST /api/auth/login`) is rate-limited per client to slow down credential-stuffing and brute-force attempts.

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_RATE_LIMIT_MAX` | `20` | Maximum login requests allowed per client within the window (positive integer) |
| `AUTH_RATE_LIMIT_WINDOW` | `15 minutes` | Length of the rate-limit window: a number (decimals allowed, e.g. `1.5`) followed by an optional space and a unit -- `ms`, `s`/`sec`/`secs`/`second`/`seconds`, `m`/`min`/`mins`/`minute`/`minutes`, `h`/`hr`/`hrs`/`hour`/`hours`, `d`/`day`/`days`, or `w`/`week`/`weeks` (e.g. `15 minutes`, `1h`, `30s`, `1.5h`). A bare number with no unit (e.g. `900000`) is rejected, and forms some duration parsers accept -- like `1y` or `1 msec` -- are not. |

:::caution
A value that fails to parse at all -- a non-numeric `AUTH_RATE_LIMIT_MAX`, or an `AUTH_RATE_LIMIT_WINDOW` that doesn't match the format above -- causes the server to **fail at startup** with a configuration error rather than silently falling back to the default. This doesn't catch every mistake: `AUTH_RATE_LIMIT_MAX` is parsed with JavaScript's `parseInt`, which reads only the leading digits and ignores the rest. `AUTH_RATE_LIMIT_MAX=20abc` and `AUTH_RATE_LIMIT_MAX=2e3` both start successfully -- as `20` and `2`, not the `2000` you likely meant in the second case. Use a plain integer with no extra characters.
:::

### Which direction to tune

Which way to adjust `AUTH_RATE_LIMIT_MAX` depends on your deployment shape:

- **Behind one NAT / shared egress IP** (the common household case). Everyone on your home network shares a single public IP, so the login endpoint sees your whole household's attempts as coming from one client. A few mistyped passwords in quick succession across family members can exhaust the default limit for everyone. Consider **raising** `AUTH_RATE_LIMIT_MAX`.
- **Internet-exposed with no reverse-proxy protection**. If Cornerstone is reachable directly from the internet without a fronting proxy or WAF doing its own throttling, this limit is your primary defense against brute-force login attempts. Consider **lowering** `AUTH_RATE_LIMIT_MAX`.

These two shapes key on different things -- egress (how your household looks to the outside) versus ingress (how exposed the login endpoint is) -- so a home instance reachable directly from the internet via port-forwarding matches both at once. Treat that combination as internet-exposed: raising `AUTH_RATE_LIMIT_MAX` to relieve shared-IP lockouts also raises the ceiling for an outside attacker sharing that same bucket, so keep the limit low and put a reverse proxy in front instead if household lockouts become a real problem.

This is where `TRUST_PROXY` matters: the rate limiter buckets requests by the client IP Fastify resolves for each request, and `TRUST_PROXY` controls whether that is the real visitor's IP or your reverse proxy's IP. With `TRUST_PROXY=false` (the default) behind a reverse proxy, every request arrives from the proxy's IP, so **all visitors share a single rate-limit bucket** -- turning the shared-IP household scenario above into a shared-IP scenario for every visitor, not just your own network. Set `TRUST_PROXY=true` so the limiter keys on each client's real IP instead (only the nearest proxy hop is trusted, so if you run a chain -- a CDN in front of your own reverse proxy, for example -- the rate limiter still buckets by that CDN's edge IP, and getting per-visitor buckets needs the CDN's forwarding configured too). See [Reverse Proxy](#reverse-proxy) above for the full `TRUST_PROXY` setup.

:::note
The account-setup endpoint (`POST /api/auth/setup`) has its own fixed limit of 5 requests per 15 minutes and is not configurable.
:::

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
| `DIARY_DRAFT_RETENTION_DAYS` | `30` | Days a draft diary entry can sit untouched before the daily orphan cleanup deletes it. Set to `0` to disable the cleanup and keep drafts forever. |
| `PHOTO_STORAGE_PATH` | `<data-dir>/photos` | Directory where diary photos are stored (both originals and annotated copies). Defaults to a `photos` folder next to the database file. |
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
| `PAPERLESS_FILTER_TAG` | -- | Optional tag name. When set, only Paperless-ngx documents tagged with this name are visible to Cornerstone. Useful for keeping personal documents private when sharing a Paperless-ngx instance across applications. |

For detailed setup instructions, see [Documents Setup](/guides/documents/setup).

## Auto-itemize Invoices (LLM)

The auto-itemize feature reads line items off invoice PDFs (via Paperless OCR) and proposes budget lines using any OpenAI-compatible LLM provider. It is **disabled by default** -- set all three required variables to enable it.

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | -- | Base URL of the LLM API (e.g., `https://api.openai.com/v1`, `https://generativelanguage.googleapis.com/v1beta/openai`) |
| `LLM_API_KEY` | -- | Bearer token / API key for the LLM provider |
| `LLM_MODEL` | -- | Model identifier (e.g., `gpt-4o-mini`, `gemini-2.5-flash`, `claude-haiku-4-5-20251001`) |
| `LLM_REQUEST_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |
| `LLM_MAX_TOKENS` | `16384` | Max output tokens per call. The default handles 100+ line invoices; increase if you see `LLM_INVALID_RESPONSE` errors with `finishReason="length"`. |
| `LLM_PROVIDER` | -- | One of `openai`, `anthropic`, `gemini`, `ollama`, or `generic`. Auto-detected from `LLM_BASE_URL` when unset; override only if auto-detection misses your provider. |

When all three required variables are set, the **Auto-itemize** button appears on invoice detail pages that have at least one Paperless document linked. See [Auto-itemize Invoices](/guides/budget/auto-itemize) for the full guide, provider examples, and what data leaves your host.
