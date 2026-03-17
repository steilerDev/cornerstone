---
sidebar_position: 2
title: Erste Schritte
---

# Erste Schritte

Cornerstone läuft als ein einzelner Docker-Container mit einer eingebetteten SQLite-Datenbank. Keine externe Datenbankserver, keine komplexe Infrastruktur -- Laden Sie einfach das Image herunter und starten Sie es.

## Schnellster Start

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  steilerdev/cornerstone:latest
```

Öffnen Sie `http://localhost:3000` in Ihrem Browser. Der [Assistent für die erste Konfiguration](first-login) führt Sie durch die Erstellung Ihres Admin-Kontos.

## Nächste Schritte

- [Docker Setup](docker-setup) -- Detaillierte Docker und Docker Compose Konfiguration
- [First Login](first-login) -- Gehen Sie durch den Setup-Assistenten
- [Konfiguration](configuration) -- Alle verfügbaren Umgebungsvariablen
