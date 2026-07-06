# Release Summary

## What's New

This release sharpens two of the areas you spend the most time in: the budget overview and invoice auto-itemization. You can now see your budget through a "how much have we spent versus how much is left" lens, and consolidate messy multi-row invoices into clean budget lines before saving. No new configuration or migration steps are required.

### Highlights

- **Cost Basis filter on the Budget Overview** -- The Cost Breakdown table gains a **Cost Basis** dropdown with three views: **All** (the full blended projection, as before), **Paid** (only money that has actually left your account), and **Outstanding** (everything still to pay -- unpaid invoice balances plus not-yet-invoiced projections). It is deposit-aware, so invoices paid in instalments split correctly between Paid and Outstanding, and your choice is saved in the URL for bookmarking and sharing.
- **Merge line items when auto-itemizing** -- On both the auto-itemize review page and the "create invoice from a Paperless document" flow, you can now select two or more extracted rows and merge them into one consolidated line. Amounts are summed on your own server for exact arithmetic; only the descriptions are sent to the language model to propose a combined name and category. A failed merge can be retried or fully undone -- nothing is destructive until you save.
- **Diary opens on your own entries** -- The construction diary now defaults to the **Manual** filter, so you land on the entries you actually wrote instead of a feed dominated by auto-generated system events. Switch to **All** or **Automatic** anytime; the choice is reflected in the URL.

### Behind the Scenes

- Auto-itemization now shares a single, harmonized code path between the existing-invoice and new-invoice flows -- no change in behavior, but a more consistent and reliable review experience.
- Dependency and toolchain updates for security and maintenance, with no user-facing changes.

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot.
