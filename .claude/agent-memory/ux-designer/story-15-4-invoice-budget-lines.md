---
name: Story 15.4 — Invoice Budget Lines Section spec decisions
description: Key design decisions for the Invoice Detail Page budget lines section (Issue #606)
type: project
---

Spec posted at https://github.com/steilerDev/cornerstone/issues/606#issuecomment-4020101918

**Why:** EPIC-15 invoice rework needed a dedicated budget lines panel on InvoiceDetailPage.

**How to apply:** Reference when implementing or reviewing InvoiceDetailPage changes.

Key decisions:

- Section placement: between Invoice Details card and LinkedDocumentsSection, full-width `.card`
- Edit modal: old WI/HI pickers removed entirely; modal may shrink from `modalContentWide` (48rem) back to default 28rem
- Remaining row: `var(--color-bg-secondary)` bg, `border-top: 2px solid var(--color-border-strong)` (double weight), italic label
- Remaining color: `var(--color-text-primary)` (>0), `var(--color-success-text-on-light)` (=0), `var(--color-danger-text-on-light)` (<0)
- HI vs WI entity type pill: use `var(--color-role-member-bg)` / `var(--color-role-member-text)` for "HI" discriminator chip
- Picker modal: `min(640px, calc(100vw - 2rem))` — between default and wide
- InvoiceDetailPage.module.css uses `box-shadow: var(--shadow-sm)` for cards (NOT `border: 1px solid`) — diverges from WorkItemDetailPage pattern
