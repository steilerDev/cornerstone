# docs-writer Agent Memory

## Docs Site Structure

- Content lives in `docs/src/` (Docusaurus `docs.path: 'src'`)
- Config files are `.js` (not `.ts`) to avoid jiti babel.js corruption in sandbox
- Sidebar config: `docs/sidebars.js`
- Site config: `docs/docusaurus.config.js`
- Site URL: `https://cornerstone.steiler.dev/` with baseUrl `/`
- `routeBasePath: '/'` -- docs served at root
- `onBrokenLinks: 'throw'` -- build fails on broken links
- `onBrokenMarkdownImages` defaults to `warn` (not configured)
- React 18.3.1 pinned in docs workspace (Docusaurus 3.9.2 incompatible with React 19.x)
- `blog: false`

## Sandbox Build Issues

- `npm run docs:build` may fail in worktrees due to node_modules corruption (jiti/babel.js, regenerate.js)
- Workaround: try building from the base project directory instead of the worktree
- Clean `npm install` in worktree may not fix it -- sandbox filesystem corruption persists
- Pre-existing broken screenshot image refs in `work-items/index.md` and `work-items/tags.md`
- These will resolve when screenshots are captured during stable release

## Existing Pages (as of EPIC-06 completion)

- `intro.md` -- Landing page (slug: /)
- `roadmap.md` -- Feature roadmap checklist
- `getting-started/` -- index, docker-setup, first-login, configuration
- `guides/work-items/` -- index, creating-work-items, tags, notes-and-subtasks, dependencies, keyboard-shortcuts
- `guides/users/` -- index, oidc-setup, admin-panel
- `guides/budget/` -- index, categories, financing-sources, work-item-budgets, vendors-and-invoices, subsidies, budget-overview
- `guides/timeline/` -- index, gantt-chart, milestones, calendar-view (added EPIC-06)
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

## Roadmap State (post EPIC-06)

Completed: EPIC-02, EPIC-11, EPIC-01, EPIC-03, EPIC-12, EPIC-05, EPIC-06
Planned: EPIC-04, EPIC-07, EPIC-08, EPIC-09, EPIC-10
