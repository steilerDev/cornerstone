# Release Summary

## What's Changed

This is a maintenance release that fixes two correctness and resilience issues. No new configuration or migration steps are required.

### Bug Fixes

- **Auto-itemize VAT sync** -- The "Price includes VAT" flag now stays in sync between the line card's checkbox and the inline budget-line draft, in both directions. Unchecking VAT after queuing a new work item budget line now saves with the correct `includesVat` flag, and the effective gross amount is shown and stored correctly. Previously the change could be silently dropped on save. (#1775)
- **Recovery after updates** -- The app now detects stale JavaScript bundles after a new deployment and reloads gracefully on the next navigation, preventing the blank page that an open browser tab could otherwise show after a container update. (#1773)

### Maintenance

- Development dependency security hardening -- no user-facing changes. (#1774)

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot.
