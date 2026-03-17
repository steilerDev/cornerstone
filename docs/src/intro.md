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

A self-hosted home building project management tool for homeowners. Track work items, budgets, timelines, household items, and documents from a single Docker container backed by SQLite -- no external database required.

## Who is Cornerstone for?

Cornerstone is designed for **homeowners managing a construction or renovation project**. Whether you're building a new home, renovating a floor, or coordinating multiple contractors, Cornerstone gives you a single place to track everything.

- **1-5 users per instance** -- built for a household, not an enterprise
- **Self-hosted** -- your data stays on your hardware
- **Single Docker container** -- no external database, no complex infrastructure

## Key Features

- **Work Items** -- Create and manage construction tasks with statuses, dates, assignments, tags, notes, subtasks, and dependencies
- **Budget Management** -- Track costs with budget categories, financing sources, multi-budget-line invoice linking with itemized amounts, subsidies, and a dashboard with multiple projection perspectives
- **Timeline & Gantt Chart** -- Interactive Gantt chart with dependency arrows, critical path highlighting, zoom controls, milestones, and automatic scheduling via the Critical Path Method
- **Calendar View** -- Monthly and weekly calendar grids showing work items and milestones
- **Milestones** -- Track major project checkpoints with target dates, projected completion, and late detection
- **Household Items** -- Track furniture, appliances, and fixtures with categories, delivery scheduling, budget integration, work item linking, and timeline dependencies
- **Authentication** -- Local accounts with first-run setup wizard, plus OIDC single sign-on for existing identity providers
- **User Management** -- Admin and Member roles with a dedicated admin panel
- **Construction Diary** -- Maintain a construction diary (Bautagebuch) with daily logs, site visits, delivery records, issue tracking, automatic system events, photo attachments, and digital signature capture
- **Project Dashboard** -- At-a-glance project health with budget summary, timeline status, invoice and subsidy pipelines, mini Gantt preview, and customizable card layout
- **Document Integration** -- Browse, search, and link documents from a connected [Paperless-ngx](https://docs.paperless-ngx.com/) instance to work items and invoices
- **Dark Mode** -- Light, Dark, or System theme with instant switching
- **Design System** -- Consistent visual language with CSS custom property tokens

See the [Roadmap](roadmap) for upcoming features.

## Quick Links

- [Getting Started](getting-started) -- Deploy Cornerstone with Docker in minutes
- [Work Items Guide](guides/work-items) -- Learn how to manage your project tasks
- [Budget Guide](guides/budget) -- Track costs, invoices, and financing sources
- [Timeline Guide](guides/timeline) -- Gantt chart, calendar view, and milestones
- [Household Items Guide](guides/household-items) -- Manage furniture, appliances, and fixture purchases
- [Diary Guide](guides/diary) -- Construction diary with manual entries and automatic events
- [Dashboard Guide](guides/dashboard) -- Project health overview and card customization
- [Documents Guide](guides/documents) -- Paperless-ngx integration for document linking
- [OIDC Setup](guides/users/oidc-setup) -- Connect your identity provider
- [Development](development) -- How Cornerstone is built by an AI agent team
- [GitHub Repository](https://github.com/steilerDev/cornerstone) -- Source code and issue tracker
- [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki) -- Technical architecture documentation
