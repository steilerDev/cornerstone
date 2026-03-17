---
sidebar_position: 3
title: Konfiguration
---

# Konfiguration

Die gesamte Konfiguration erfolgt durch Umgebungsvariablen. Die Standardeinstellungen sind für die meisten Setups geeignet.

## Server

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `PORT` | `3000` | Port, auf dem der Server lauscht |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATABASE_URL` | `/app/data/cornerstone.db` | Pfad zur SQLite-Datenbankdatei |
| `LOG_LEVEL` | `info` | Log-Ausführlichkeit (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `NODE_ENV` | `production` | Umgebungsmodus |

## Sessions

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `SESSION_DURATION` | `604800` | Session-Lebensdauer in Sekunden (Standard: 7 Tage) |
| `SECURE_COOKIES` | `true` | Sende Cookies mit `Secure` Flag (benötigt HTTPS) |

:::note
`SECURE_COOKIES` wird standardmäßig auf `true` gesetzt, was bedeutet, dass Cookies nur über HTTPS gesendet werden. Wenn Sie lokal ohne HTTPS testen, setzen Sie dies auf `false`. Hinter einem Reverse Proxy mit TLS-Terminierung, behalten Sie den Standard `true`.
:::

## Reverse Proxy

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `TRUST_PROXY` | `false` | Legen Sie auf `true` fest, wenn der Server hinter einem Reverse Proxy (nginx, Caddy, Traefik, etc.) läuft |

Bei der Bereitstellung hinter einem Reverse Proxy setzen Sie `TRUST_PROXY=true`, damit der Server weitergeleitet Header (`X-Forwarded-For`, `X-Forwarded-Proto`, etc.) korrekt liest. Dies ist erforderlich, damit sichere Cookies und OIDC-Umleitung hinter einem Proxy ordnungsgemäß funktionieren.

## OIDC (Single Sign-On)

OIDC wird automatisch aktiviert, wenn `OIDC_ISSUER`, `OIDC_CLIENT_ID` und `OIDC_CLIENT_SECRET` alle gesetzt sind. Ein separates "enable" Flag ist nicht erforderlich.

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `OIDC_ISSUER` | -- | Issuer-URL Ihres OIDC-Providers (z.B. `https://auth.example.com/realms/main`) |
| `OIDC_CLIENT_ID` | -- | Client ID bei Ihrem OIDC-Provider registriert |
| `OIDC_CLIENT_SECRET` | -- | Client Secret für den OIDC-Client |
| `OIDC_REDIRECT_URI` | -- | Callback-URL (optional -- wird automatisch aus der Anfrage abgeleitet, wenn nicht gesetzt) |

Für detaillierte OIDC-Setup-Anweisungen siehe [OIDC Setup](../guides/users/oidc-setup).

## Paperless-ngx (Dokumentintegration)

Die Dokumentintegration wird automatisch aktiviert, wenn sowohl `PAPERLESS_URL` als auch `PAPERLESS_API_TOKEN` gesetzt sind.

| Variable | Standard | Beschreibung |
|----------|---------|-------------|
| `PAPERLESS_URL` | -- | Basis-URL Ihrer Paperless-ngx-Instanz, die vom Server für API-Aufrufe verwendet wird (z.B. `http://paperless:8000` in Docker) |
| `PAPERLESS_API_TOKEN` | -- | API-Authentifizierungstoken von Paperless-ngx |
| `PAPERLESS_EXTERNAL_URL` | -- | Browser-seitige URL für Paperless-ngx-Links (z.B. `https://paperless.example.com`). Falls nicht gesetzt, wird auf `PAPERLESS_URL` zurückgegriffen. |

Für detaillierte Setup-Anweisungen siehe [Dokumente Setup](/guides/documents/setup).
