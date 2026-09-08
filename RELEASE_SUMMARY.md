# Release Summary

## What's New

This release brings focused improvements to invoice management and diary navigation. You can now filter invoices to show only work-in-progress items with pending payments, visualize staged deposits as expandable rows, and load diary entries via infinite scroll for a smoother browsing experience.

### Highlights

- **Invoices — Show only open items view** — A new toggle at the top of the invoice list narrows the view to pending invoices and invoices with pending deposits, sorted by earliest due date. Pending deposits appear as expandable child rows under their invoice for at-a-glance visibility of what is left to pay. The header shows open-payable and refunds-due totals so you always know your cash-flow position.
- **Diary — Infinite scroll navigation** — Diary entries now load automatically as you scroll, with a "Load more" button for keyboard-accessible batch loading. Old bookmarked diary links continue to open the diary normally.
- **Bug fixes** — Invoice status badges now display with correct color. Resolved stale-fetch races in the diary when filters or search are reset.

### Behind the Scenes

- Large dependency and security update sweep across production, development, and GitHub Actions packages
- Addressed 15 orphan security advisories via package overrides and lockfile reconciliation
- CI Jest timeout increase to improve reliability on resource-constrained runners

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot.
