## What's New

This release sharpens the **Budget Overview** so every cost in your project is traceable to the source funding it. Every line in the Cost Breakdown now carries a colored source attribution badge, the **Available Funds** row expands into a per-source Cost / Payback / Net view, and clicking a source detail row toggles it on or off -- with the entire breakdown (totals, projections, and subsidy math) recalculated server-side and the selection persisted in the URL so you can bookmark, share, or refresh a filtered view.

### What's new

**Source attribution everywhere**

- Every leaf-level budget line in the Cost Breakdown shows a deterministic, color-coded badge for its financing source -- the same source always gets the same color across the table, between sessions, and in light and dark mode.
- On desktop the badge shows the full source name; on mobile it collapses to a colored dot to keep rows compact.
- A 10-slot palette guarantees consistent contrast in both themes; budget lines without a source assignment use a reserved "Unassigned" color.

**Available Funds row redesign**

- Click the **Available Funds** row to expand it and see one row per financing source.
- Each source row shows three numbers in dedicated columns: **Cost** (allocated against budget lines, perspective-aware), **Payback** (subsidy payback against lines funded from that source), and **Net** (remaining headroom after cost and payback).
- It's the fastest way to spot which source is most depleted, which one is being subsidized, and which one still has slack.

**Per-source filter**

- Click any source detail row to toggle that source on or off. The entire breakdown -- summary tiles, projected cost range, remaining budget, every nested area row -- recalculates against the visible set.
- The selection is persisted in the URL as `?deselectedSources=<id>,<id>` so a filtered view can be bookmarked, shared, or reloaded without losing state.
- Press **Escape** while a source row is focused to clear all deselections in one go.
- A small "X of N selected" caption appears next to **Available Funds** while a filter is active.

**Server-side filter pipeline**

- The new filter is wired through to a single endpoint: `GET /api/budget/breakdown?deselectedSources=...`.
- Subsidy payback math is computed against the filtered set on the server, so subsidies that no longer have qualifying budget lines drop out cleanly instead of double-counting.
- Filter changes round-trip in a single request -- no client-side recomputation drift.

### Fixes

- Source detail rows stay visible even when every source is deselected, so the filter is never a dead-end.
- Dark mode contrast and focus ring are corrected on the Cost Breakdown error banner.

### Tooling

- The `Quality Gates` workflow now supports `workflow_dispatch`, making it easy to re-run gates manually during a promotion.

### Breaking changes

None. Existing bookmarks, links, URLs, and data model are preserved. The `?deselectedSources=` query parameter is purely additive -- omit it (or leave it empty) to get the unchanged behavior.

### Migration notes

No database migration is required. The new filter parameter is server-validated and silently ignores unknown source IDs, so older clients that don't send the parameter continue to work without changes.
