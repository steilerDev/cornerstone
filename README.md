# cornerstone

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cornerstone.steiler.dev/img/logo-full-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="https://cornerstone.steiler.dev/img/logo-full.svg" />
    <img src="https://cornerstone.steiler.dev/img/logo-full.svg" alt="Cornerstone" width="400" />
  </picture>
</p>

[![GitHub Release](https://img.shields.io/github/v/release/steilerDev/cornerstone?label=release)](https://github.com/steilerDev/cornerstone/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/steilerDev/cornerstone/ci.yml?branch=main&label=CI)](https://github.com/steilerDev/cornerstone/actions/workflows/ci.yml)
[![Docker Image](https://img.shields.io/docker/v/steilerdev/cornerstone?label=Docker&sort=semver)](https://hub.docker.com/r/steilerdev/cornerstone)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

**Your whole build, in one place.**

Building a home means juggling contractors, loans, subsidies, invoices, delivery dates, and a hundred decisions -- usually scattered across spreadsheets, chat threads, and paper folders. Cornerstone brings it all together: the schedule, the money, the site diary, and the paperwork, connected to each other and to the rooms of your house. It runs self-hosted in a single Docker container, so your data stays at home.

**[Explore the documentation →](https://cornerstone.steiler.dev/)**

## Highlights

**🗓️ Plan the build** -- Break the project into work items organized by area and trade, link their dependencies, and let the Gantt chart compute the critical path and schedule everything for you. When one trade slips, you see exactly what moves with it.

**💶 Know where every euro goes** -- Spread costs across loans, subsidies, and your own funds. Track quotes, invoices, and staged payments against every budget line, and see at a glance what is spent, what is committed, and what is left. When the bank asks for proof, generate a ready-to-send PDF report in a few clicks.

**🤖 Let AI handle the paperwork** -- Connect [Paperless-ngx](https://docs.paperless-ngx.com/) and link scanned documents to work items, purchases, and invoices. Optionally plug in any LLM provider (OpenAI, Anthropic, Gemini, Ollama) to read line items straight off an invoice PDF and book them to the right budget lines.

**📸 Document the site** -- Keep a construction diary with daily logs, site visits, and deliveries. Snap photos on your phone, tag them by room and direction, mark up defects right in the browser, and capture signatures on the spot. The photo browser groups every shot by spot, so you can step back through how a wall or a corner changed over time.

**🛋️ Furnish the home** -- Track furniture, appliances, and fixtures alongside the build, with delivery dates tied to the schedule and costs tied to the budget.

**📊 See it all at a glance** -- A customizable dashboard shows budget health, upcoming milestones, open invoices, and subsidy status the moment you log in.

Also built in: single sign-on via OIDC, shared access for your household, calendar and contact feeds for your phone, scheduled backups, English and German, and dark mode.

## Quick Start

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  -v cornerstone-backups:/backups \
  steilerdev/cornerstone:latest
```

Open `http://localhost:3000` -- the setup wizard will guide you through creating your admin account. See the [deployment guide](https://cornerstone.steiler.dev/getting-started/docker-setup) for Docker Compose, reverse proxy, OIDC, and [scheduled backups](https://cornerstone.steiler.dev/guides/backup/).

## Documentation

| Resource                                                         | Description                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| [User guide](https://cornerstone.steiler.dev/)                   | Getting started, deployment, and feature guides        |
| [Behind the Scenes](https://cornerstone.steiler.dev/development) | How Cornerstone is built by a team of AI coding agents |
| [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki)    | Architecture, API contract, database schema, and ADRs  |

## Contributing

Questions, ideas, or bug reports? [Open an issue](https://github.com/steilerDev/cornerstone/issues).

## License

Cornerstone is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
