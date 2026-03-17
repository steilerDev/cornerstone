---
name: Issue #933 DAV Access Card & Vendor Contacts spec decisions
description: Key decisions for DavAccessCard (ProfilePage) and VendorContacts section (VendorDetailPage)
type: project
---

## Issue #933 — DAV Access Card + Vendor Contacts

Spec posted: https://github.com/steilerDev/cornerstone/issues/933#issuecomment-4073933582

**Why:** CalDAV/CardDAV server with per-user DAV token auth and vendor contacts sub-entity.

### DAV Access Card (DavAccessCard component)

- Card fits ProfilePage vertical stack: same `.card` class pattern (bg-primary, radius-lg, shadow-sm, spacing-6)
- Card title: `--font-size-xl` (20px), matching VendorDetailPage (NOT `--font-size-lg` which is WorkItemDetailPage)
- Status indicator dot: `var(--color-success)` (active) / `var(--color-status-not-started-bg)` (inactive)
- Token reveal panel: `role="status" aria-atomic="true"` — announces on mount
- Token value display: monospace font stack + `var(--color-bg-secondary)` background + `border: 1px solid var(--color-border)`
- Server URL row: separated by `border-top: 1px solid var(--color-border)` from action buttons
- Copy buttons: `aria-label` must update to "Token copied" for 2 seconds after copy
- No token reveal on page reload — panel is only shown in the immediate post-generation window
- Modal variants: Revoke (btnConfirmDelete) vs Regenerate (btnPrimary in modal) — Regenerate is non-final-destructive
- Action buttons mobile: stack vertically, `width: 100%; min-height: 44px`

### Vendor Contacts Section

- Placement: BETWEEN "Vendor Information" card and "Invoices" card
- ContactCard is a NEW shared component at `client/src/components/ContactCard/` (not page-specific)
- ContactCard: `var(--color-bg-secondary)` background (not primary — same as invoiceCard in VendorDetailPage)
- Contact name: `--font-size-base` (16px), `--font-weight-semibold`
- Contact role: `--font-size-sm`, `--color-text-muted` (below name)
- Phone/email: `<a href="tel:">` / `<a href="mailto:">` with `var(--color-primary)` color
- Row action buttons: use `rowActionButton` / `rowActionButtonDanger` pattern from VendorDetailPage.module.css
- Edit/Delete `aria-label` MUST include contact name: "Edit contact {name}", "Delete contact {name}"
- Add/Edit form: modal (34rem width — wider than default 28rem for 5-field form)
- Empty state: simple centered text (no EmptyState component — sub-section, no icon needed)
- Mobile ContactCard: actions stack below info (flex column)
- `aria-live="polite"` srAnnouncement region for "Contact added/updated/deleted"

### How to apply

When speccing profile-page settings cards or entity sub-sections with person contacts, reference these patterns.
