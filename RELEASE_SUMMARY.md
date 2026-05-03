# v2.5.0 Release Summary

A focused release that adds **Backup & Restore**, tightens budget VAT handling, and slims down the Budget Overview page. Migration 0031 backfills `includes_vat` on existing budget lines, runs automatically on first start, and requires no manual intervention.

## What's New

- **Backup & Restore** -- Cornerstone now ships with a built-in backup feature that snapshots your entire app data directory (SQLite database + diary photos) into a single `tar.gz` archive. Trigger backups manually from the admin UI, run them on a cron schedule, set a retention limit, and restore from any archive in two clicks. Mount a separate volume to `/backups` (or wherever you point `BACKUP_DIR`) and you're set. See the [Backups guide](https://steilerDev.github.io/cornerstone/guides/backup) for setup, scheduling, and restore steps. (#1386)

## Improvements

- **Consistent VAT handling across budget lines** (#1385) -- Direct pricing mode now applies the same VAT multiplier as unit pricing (quantity × unit price), so the **Price includes VAT** checkbox behaves identically regardless of which pricing mode you use. Planned amounts are now always stored as gross internally, which means the Budget Overview, Available Funds row, and printed reports compare every line on a like-for-like basis. The `includes_vat` flag is now `NOT NULL` at the database level (defaults to `true`); migration 0031 backfills any pre-existing `NULL` values.

## Bug Fixes

- **Budget Overview is now the breakdown** (#1389) -- The Budget Health hero card has been removed from the top of the page. The overview now goes straight from the title bar into the Cost Breakdown Table. The Min / Avg / Max perspective toggle, source-filter, and Available Funds row all live inside the table and remain unchanged. The page is faster, prints cleaner, and removes a layer of summary metrics that mostly duplicated what the breakdown already shows.
- **Source name now prints on the Budget Overview** (#1390) -- Print viewports (around 600-720 px) used to trigger the mobile breakpoint, which collapsed the source attribution badge to just a colored dot -- great on a phone, useless on a printout. Print mode now forces the full source name visible with a border-based color treatment, so the printed report shows the actual source attached to each budget line.
- **Broken docs links on the Budget Overview page** (#1384) -- The "Related Pages" links to Work Items and Household Items pointed to non-existent `/overview` sub-paths and now point to the correct guide indices.

## What to Update

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Migration 0031 runs automatically on first start.

If you want to enable the new backup feature, mount a backup volume:

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  -v cornerstone-backups:/backups \
  steilerdev/cornerstone:latest
```

Optionally set `BACKUP_CADENCE` (e.g., `0 2 * * *` for daily at 2 AM) and `BACKUP_RETENTION` (e.g., `7` to keep a week's worth of archives).

---

_Released: 2026-05-03_
