---
sidebar_position: 1
title: Docker Setup
---

# Docker Setup

## Docker Run

Der einfachste Weg, um Cornerstone auszuführen:

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  steilerdev/cornerstone:latest
```

Dies startet Cornerstone auf Port 3000 mit einem persistenten Volume für die SQLite-Datenbank.

## Docker Compose (Empfohlen)

Für ein wartbareres Setup verwenden Sie Docker Compose:

```bash
# Dateien herunterladen
curl -O https://raw.githubusercontent.com/steilerDev/cornerstone/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/steilerDev/cornerstone/main/.env.example

# Konfigurieren Sie Ihre Umgebung
cp .env.example .env
# Bearbeiten Sie .env mit Ihren bevorzugten Einstellungen

# Starten Sie die Anwendung
docker compose up -d
```

Die Standardkonfiguration funktioniert standardmäßig -- Sie müssen nur den [Assistent für die erste Konfiguration](first-login) im Browser ausführen.

## Hinter einem Reverse Proxy

Beim Bereitstellen hinter einem Reverse Proxy (nginx, Caddy, Traefik, etc.) legen Sie diese Umgebungsvariablen fest:

```env
TRUST_PROXY=true
SECURE_COOKIES=true
```

`TRUST_PROXY` teilt Cornerstone mit, dass es weitergeleitet Header lesen soll (`X-Forwarded-For`, `X-Forwarded-Proto`, etc.). Dies ist erforderlich, damit sichere Cookies und OIDC-Umleitung hinter einem Proxy ordnungsgemäß funktionieren.

:::tip Große Datei-Uploads

Cornerstone unterstützt Foto-Uploads, die große Request Payloads erzeugen können. Die meisten Reverse Proxys begrenzen die Request-Body-Größe standardmäßig (z.B. nginx standardmäßig auf 1 MB). Stellen Sie sicher, dass Ihr Proxy so konfiguriert ist, dass er ausreichend große Uploads zulässt -- zum Beispiel in **nginx**:

```nginx
client_max_body_size 50M;
```

Weitere Informationen finden Sie in der Dokumentation Ihres Reverse Proxy.

:::

## Datenpersistenz

Cornerstone speichert alle Daten in einer einzelnen SQLite-Datenbankdatei unter `/app/data/cornerstone.db` im Container. Hängen Sie ein Docker-Volumen oder eine Bind-Mount an `/app/data`, um Ihre Daten über Container-Neustarts hinweg persistent zu halten:

```bash
# Named volume (empfohlen)
-v cornerstone-data:/app/data

# Bind mount
-v /path/on/host:/app/data
```

## Health Checks

Das Docker-Image enthält eine integrierte Health Check, die überprüft, ob der Server ausgeführt wird und die Datenbank zugänglich ist:

- **Readiness**: `GET /api/health/ready` -- überprüft Datenbankzugriff und Passwort-Hashing
- **Liveness**: `GET /api/health/live` -- grundlegender Server-Ansprechbarkeits-Check

Der Health Check läuft alle 30 Sekunden mit einer 15-Sekunden-Startup Grace Period.

## Image Tags

| Tag | Beschreibung |
|-----|-------------|
| `latest` | Neueste stabile Version |
| `beta` | Neueste Beta-Vorabversion |
| `x.y.z` | Spezifische stabile Version (z.B. `1.7.0`) |
| `x.y` | Neueste Patch einer Minor-Version (z.B. `1.7`) |
| `x.y.z-beta.n` | Spezifische Beta-Version (z.B. `1.7.0-beta.1`) |
