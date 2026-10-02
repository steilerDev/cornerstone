---
slug: /
sidebar_position: 1
title: Introduction
---

import ThemedImage from '@theme/ThemedImage';

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <ThemedImage
    alt="Cornerstone"
    sources={{
      light: '/img/logo-full.svg',
      dark: '/img/logo-full-dark.svg',
    }}
    style={{maxWidth: '400px', width: '100%'}}
  />
</div>

# Cornerstone

**Your whole build, in one place.**

Building a home means juggling contractors, loans, subsidies, invoices, delivery dates, and a hundred decisions -- usually scattered across spreadsheets, chat threads, and paper folders. Cornerstone brings it all together: the schedule, the money, the site diary, and the paperwork, connected to each other and to the rooms of your house. It runs self-hosted in a single Docker container, so your data stays at home.

## Who is Cornerstone for?

Cornerstone is designed for **homeowners managing a construction or renovation project**. Whether you're building a new home, renovating a floor, or coordinating multiple contractors, Cornerstone gives you a single place to track everything.

- **1-5 users per instance** -- built for a household, not an enterprise
- **Self-hosted** -- your data stays on your hardware
- **Single Docker container** -- no external database, no complex infrastructure

## Highlights

### Plan the build

Break the project into [work items](guides/work-items) organized by [area and trade](guides/work-items/areas-and-trades), link their dependencies, and let the [Gantt chart](guides/timeline/gantt-chart) compute the critical path and schedule everything for you. When one trade slips, you see exactly what moves with it. [Milestones](guides/timeline/milestones) and a [calendar view](guides/timeline/calendar-view) keep the big dates in sight.

### Know where every euro goes

Spread costs across [loans, subsidies, and your own funds](guides/budget/financing-sources). Track quotes, [invoices](guides/budget/vendors-and-invoices), and [staged payments](guides/budget/invoice-deposits) against every budget line, and see at a glance what is spent, what is committed, and what is left in the [budget overview](guides/budget/budget-overview). When the bank asks for proof, generate a ready-to-send [bank report](guides/budget/bank-reports) in a few clicks.

### Let AI handle the paperwork

Connect [Paperless-ngx](guides/documents) and link scanned documents to work items, purchases, and invoices. Optionally plug in any LLM provider (OpenAI, Anthropic, Gemini, Ollama) to [auto-itemize invoices](guides/budget/auto-itemize) -- reading line items straight off the PDF and booking them to the right budget lines.

### Document the site

Keep a [construction diary](guides/diary) with daily logs, site visits, and deliveries. [Snap photos](guides/diary/photo-capture) on your phone, tag them by room and direction, [mark up defects](guides/diary/photo-annotation) right in the browser, and [capture signatures](guides/diary/signatures) on the spot. The [photo browser](guides/photos) groups every shot by spot, so you can step back through how a wall or a corner changed over time.

### Furnish the home

Track [furniture, appliances, and fixtures](guides/household-items) alongside the build, with delivery dates tied to the schedule and costs tied to the budget.

### See it all at a glance

A customizable [dashboard](guides/dashboard) shows budget health, upcoming milestones, open invoices, and subsidy status the moment you log in.

**Also built in:** [single sign-on via OIDC](guides/users/oidc-setup), shared access for your household with [admin and member roles](guides/users/admin-panel), [calendar and contact feeds](guides/feeds) for your phone, [scheduled backups](guides/backup), English and German, and [dark mode](guides/appearance/dark-mode).

## Quick Links

- [Getting Started](getting-started) -- Deploy Cornerstone with Docker in minutes
- [Work Items Guide](guides/work-items) -- Learn how to manage your project tasks
- [Budget Guide](guides/budget) -- Track costs, invoices, and financing sources
- [Timeline Guide](guides/timeline) -- Gantt chart, calendar view, and milestones
- [Household Items Guide](guides/household-items) -- Manage furniture, appliances, and fixture purchases
- [Diary Guide](guides/diary) -- Construction diary with manual entries and automatic events
- [Dashboard Guide](guides/dashboard) -- Project health overview and card customization
- [Documents Guide](guides/documents) -- Paperless-ngx integration for document linking
- [Backups](guides/backup) -- Manual and scheduled backups, restore
- [OIDC Setup](guides/users/oidc-setup) -- Connect your identity provider
- [Behind the Scenes](development) -- How Cornerstone is built by a team of AI coding agents
- [GitHub Repository](https://github.com/steilerDev/cornerstone) -- Source code and issue tracker
- [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki) -- Technical architecture documentation
