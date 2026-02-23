---
sidebar_position: 2
title: Getting Started
---

# Getting Started

Cornerstone runs as a single Docker container with an embedded SQLite database. No external database server, no complex infrastructure -- just pull the image and start it.

## Quickest Start

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  steilerdev/cornerstone:latest
```

Open `http://localhost:3000` in your browser. The [first-run setup wizard](first-login) will guide you through creating your admin account.

## What's Next

- [Docker Setup](docker-setup) -- Detailed Docker and Docker Compose configuration
- [First Login](first-login) -- Walk through the setup wizard
- [Configuration](configuration) -- All available environment variables
