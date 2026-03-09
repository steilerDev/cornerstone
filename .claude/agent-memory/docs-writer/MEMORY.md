# docs-writer Agent Memory

## Docs Site Structure

- Content lives in `docs/src/` (Docusaurus `docs.path: 'src'`)
- Config files are `.js` (not `.ts`) to avoid jiti babel.js corruption in sandbox
- Sidebar config: `docs/sidebars.js`
- Site config: `docs/docusaurus.config.js`
- Site URL: `https://cornerstone.steiler.dev/` with baseUrl `/`
- `routeBasePath: '/'` -- docs served at root
- `onBrokenLinks: 'throw'`, `onBrokenMarkdownLinks: 'throw'`, `onBrokenAnchors: 'throw'`
- `markdown.hooks.onBrokenMarkdownImages: 'warn'` -- screenshots don't exist until stable release
- Note: `onBrokenMarkdownImages` is NOT a top-level config key in Docusaurus 3.9.2; it must go under `markdown.hooks`
- React 18.3.1 pinned in docs workspace (Docusaurus 3.9.2 incompatible with React 19.x)
- `blog: false`

## Sandbox Build Issues

- `npm run docs:build` may fail in worktrees due to node_modules corruption (jiti/babel.js, regenerate.js)
- Workaround: try building from the base project directory instead of the worktree
- Clean `npm install` in worktree may not fix it -- sandbox filesystem corruption persists
- Broken screenshot image refs exist across many guide pages (16+ refs) -- all resolve when screenshots are captured during stable release
- Fixed via `markdown.hooks.onBrokenMarkdownImages: 'warn'` in docusaurus.config.js

## Existing Pages (as of EPIC-14)

- `intro.md` -- Landing page (slug: /)
- `roadmap.md` -- Feature roadmap checklist
- `getting-started/` -- index, docker-setup, first-login, configuration
- `guides/work-items/` -- index, creating-work-items, tags, notes-and-subtasks, dependencies, keyboard-shortcuts
- `guides/users/` -- index, oidc-setup, admin-panel
- `guides/budget/` -- index, categories, financing-sources, work-item-budgets, vendors-and-invoices, subsidies, budget-overview
- `guides/timeline/` -- index, gantt-chart, milestones, calendar-view
- `guides/documents/` -- index, setup, browsing-documents, linking-documents
- `guides/household-items/` -- index, creating-editing-items, budget-and-invoices, work-item-linking, delivery-and-dependencies
- `guides/appearance/` -- dark-mode
- `development/` -- index, tech-stack, agentic/overview, agentic/agent-team, agentic/workflow, agentic/setup

## Conventions

- Frontmatter must include `title:` at minimum, `sidebar_position:` for ordering
- Use `:::info Screenshot needed` admonitions for pages needing screenshots (NOT broken image refs)
- Use `:::caution` for destructive actions
- Internal doc links: relative paths within same directory (e.g., `(gantt-chart)`)
- Cross-section links: absolute paths from root (e.g., `/guides/work-items/dependencies`)
- Anchor links for same-page sections: `gantt-chart#touch-devices`
- Double dashes `--` used instead of em dashes in all existing content
- Footer links in `docusaurus.config.js` should be updated when major features are added

## Roadmap State (post EPIC-15)

Completed: EPIC-02, EPIC-11(#12), EPIC-01, EPIC-03, EPIC-12(#115), EPIC-05, EPIC-06, EPIC-08, EPIC-04, EPIC-07, EPIC-10, EPIC-11(#444 tags), EPIC-12(#445 refinement), EPIC-14(#495), EPIC-15(#602)
Planned: EPIC-09(#9 dashboard), EPIC-13(#446 construction diary)

Note: EPIC-11 and EPIC-12 each have two issues -- original (#12/#115) and new (#444/#445). Both pairs are completed.

## EPIC-15 Invoice-Budget-Line Rework

Key docs changes: vendors-and-invoices.md was substantially rewritten to document the many-to-many model, two-step picker, invoice groups, and bidirectional linking. Subsidy page updated with cost basis section. Budget overview updated to reference itemized amounts. No new pages added -- no sidebar changes needed.
