## What's New

This release puts your **project's area hierarchy** at the center of every view. Work items, household items, pickers, budget summaries, and every embedded reference now surface the full area ancestor path (`House / Ground Floor / Kitchen`) as a breadcrumb, so you always know where a task, item, or cost belongs. Budget Sources gains inline expansion with multi-select mass-move, Budget Overview replaces the category breakdown with an expandable area tree and adds clickable summary tiles plus print-friendly output, and Vendors moves into the Settings section to match how the rest of the app is organized.

### What's new

**Area hierarchy, everywhere it matters**

- Work items and household items display the full area ancestor path as a breadcrumb on list pages, detail pages, and create pages.
- Pickers (work item, household item, budget line) show the area as a secondary line under each result.
- Every place a work item is embedded -- diary entries, invoices, household item dependencies -- now includes the area breadcrumb for instant context.
- A shared `AreaBreadcrumb` component keeps the appearance consistent across the app.

**Smarter area filters**

- The Area filter on Work Items and Household Items lists correctly matches every descendant when you pick a parent area, at any depth of nesting.
- A dedicated **No Area** option on both lists surfaces items that have not yet been assigned to any area.

**Budget Overview redesign**

- The cost breakdown is now grouped by **area hierarchy** instead of by category, with nested rows you can expand to drill into children and leaf-level budget lines.
- The old "Unassigned" bucket is renamed **No Area** to match the rest of the app.
- Every summary tile at the top of the page is clickable -- click a tile to instantly select the underlying budget lines that add up to that number.
- Full print styling: clean page margins, nested group boxes, inner item separators, and the app's chrome suppressed in print. `Cmd+P` / `Ctrl+P` produces a clean PDF or paper copy.

**Budget Sources redesign**

- Click any financing source to expand it **inline** and see every budget line attached to it -- no navigation away.
- Budget lines are grouped into a hierarchical **area tree**, with dense columnar rows and horizontal dividers between work item groups.
- **Multi-select across groups** lets you tick budget lines spread across multiple areas and sources; the selection is preserved as you expand and collapse.
- A new **mass-move modal** reassigns the entire selection to a different source in a single operation.
- New API endpoints power this view: `GET /api/budget-sources/:sourceId/budget-lines` and `PATCH /api/budget-sources/:sourceId/budget-lines/move`.

**Navigation**

- **Vendors** has moved out of the Budget subnav into **Settings**. Vendor records are master data -- names, trades, contact info -- so they sit alongside Users, Areas, and Trades. Invoices stay in the Budget section because they are transactional.

**Reliability**

- Reverse-proxy handling is tightened: with `TRUST_PROXY=true`, only the first proxy hop is trusted, and rate limiting uses a resilient client identifier that no longer can be spoofed by a user-supplied `X-Forwarded-For` header. No configuration change is needed to benefit -- upgrading is enough.

**Tooling**

- TypeScript is upgraded to **6.0** with `noUncheckedIndexedAccess` enabled across the codebase, catching a whole class of latent array-access bugs.
- Docker Scout comparisons against the previous stable tag are now part of the release pipeline.

### Breaking changes

None. Existing bookmarks, links, URLs, and data model are preserved.

### Migration notes

- **No database migration is required.** Area ancestor data is resolved on read -- every response that references a work item, household item, or budget line now includes the full ancestor chain automatically. Existing clients and integrations continue to work; they just see a richer payload.
- **Reverse-proxy users**: `TRUST_PROXY=true` still means "I am running behind a reverse proxy, please read the forwarded headers," so no setting needs to change. What changes is that the server now trusts only the first proxy hop and computes rate-limit keys in a way that cannot be spoofed by an external `X-Forwarded-For`. If you were previously relying on chained / multi-hop proxy headers being trusted all the way to the origin client, review your proxy topology -- see the [reverse proxy guide](https://steilerDev.github.io/cornerstone/getting-started/docker-setup#behind-a-reverse-proxy) for the current behavior.
- **Vendors menu move**: Vendors has moved from `Budget > Vendors` to `Settings > Vendors`. Direct URLs to individual vendor detail pages continue to resolve; only the top-level menu entry relocated.
