---
name: docs-structure
description: Docusaurus site layout, page inventory, authoring conventions, and config quirks for docs/src. Read before adding or moving a page.
metadata:
  type: reference
---

## Site config

- Content: `docs/src/` (`docs.path: 'src'`), served at root (`routeBasePath: '/'`), site `https://cornerstone.steiler.dev/`, `baseUrl` `/`, `blog: false`.
- Config files are `.js` (not `.ts`) to avoid the jiti/babel.js corruption path. Sidebar: `docs/sidebars.js`. Site: `docs/docusaurus.config.js`.
- `onBrokenLinks`, `onBrokenMarkdownLinks`, `onBrokenAnchors` are `'throw'`. `onBrokenMarkdownImages` must sit under `markdown.hooks` (Docusaurus 3.9.2), set to `'warn'` because screenshots only exist after a stable release.
- React 18.3.1 pinned in the docs workspace (Docusaurus 3.9.2 is incompatible with React 19).
- Footer links in `docusaurus.config.js` should be updated when a major feature ships.

## Conventions

- Frontmatter: `title:` required, `sidebar_position:` for ordering.
- Missing screenshots: `:::info Screenshot needed`, never a broken image ref.
- `:::caution` for destructive actions. Use `--` instead of em dashes.
- Same-directory links are relative (`(gantt-chart)`). Cross-section links are absolute from root (`/guides/work-items/dependencies`). Same-page anchors: `gantt-chart#touch-devices`.
- Headings that start with a number drop the period in anchors ("6. Assign..." becomes `#6-assign...`).
- `guides/home/what-moved-where.md` is a permanent help page: `HOME_HELP_URL` in `client/src/lib/externalLinks.ts` points at it, so keep the path.

## Page inventory (guides and sections)

- `intro.md` (slug `/`), `getting-started/` (index, docker-setup, first-login, configuration)
- `guides/work-items/` (index, creating-work-items, tags, notes-and-subtasks, dependencies, keyboard-shortcuts)
- `guides/users/` (index, oidc-setup, admin-panel)
- `guides/budget/` (index, categories, financing-sources, work-item-budgets, vendors-and-invoices, auto-itemize, invoice-deposits, subsidies, budget-overview, bank-reports)
- `guides/timeline/` (index, gantt-chart, milestones, calendar-view)
- `guides/documents/` (index, setup, browsing-documents, linking-documents)
- `guides/household-items/` (index, creating-editing-items, budget-and-invoices, work-item-linking, delivery-and-dependencies)
- `guides/diary/` (index, manual-entries, automatic-events, signatures, photo-annotation)
- `guides/home/` (index, what-moved-where)
- `guides/feeds/` (index, subscribing), `guides/backup/` (index), `guides/appearance/` (dark-mode)
- `development/` (index "Behind the Scenes", tech-stack, agentic/ overview, agent-team, skills, workflow, quality-gates, setup)

Sidebar entries live in `sidebars.js`; keep it in sync when adding a page.

## Config and env var docs

- `docs/src/getting-started/configuration.md` is the only general env-var reference. It has `## Authentication Rate Limiting` (AUTH_RATE_LIMIT_MAX default 20, AUTH_RATE_LIMIT_WINDOW default `15 minutes`) and a `## Reverse Proxy` section explaining TRUST_PROXY. The setup endpoint's fixed limit is not configurable.
- `guides/users/oidc-setup.md` has an OIDC-scoped var table only. It is not a second reference.
- Diff `.env.example` against `server/src/plugins/config.ts` directly. Drift can exist even when `CLAUDE.md`'s table is current. Ignore the `EUR` false positive from `grep -oE "[A-Z][A-Z_]+"`.

## Financing flow (#2242)

- `financing-sources.md` is now the **Financing** page (title "Financing"); `subsidies.md` is now **Grants** (title "Grants"). Slugs are kept stable, so inbound links did not change.
- The old Budget Sources and Subsidies pages, their routes, and the "Budget > Reports" sidebar entry are gone. The bank report wizard has no sidebar entry; it opens from Financing, a loan card's ⋯ menu, or a funding source page.
- Old screenshots `budget-sources-light.png` and `budget-subsidies-light.png` were removed with the old pages. The new pages use `:::info Screenshot needed` until the screenshot capture covers them.
- "Discretionary Funding" is now "Own funds" (migration 0049). Docs use "Own funds" everywhere.
