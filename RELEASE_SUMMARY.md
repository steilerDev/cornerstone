# Release Summary: v2.18.0

This release brings Photos browser, report splitting, Paperless auto-creation enhancements, SSO account creation, backup/restore reliability, and critical security and integrity fixes.

## Major Features

### Photos Browser (#2162)

A new top-level **Photos** page organizes every diary photo by area and compass orientation. Browse all spots (area × orientation combinations) in a table (desktop) or card grid (mobile), showing the latest thumbnail, photo count, and diary date for each spot. Click any spot to open the **Spot Viewer** and step through photos chronologically with keyboard navigation, or jump to a specific diary entry via a "Same spot over time" history list.

**Guides:** [Photo Browser](/guides/photos), [Photo Capture](/guides/diary/photo-capture), [Photo Annotation](/guides/diary/photo-annotation)

### Budget Report Splitting (#2161)

The Report Wizard now supports splitting large reports into multiple PDF files by file size. In step 4, set an optional **max file size** (MB); if the report exceeds it, Cornerstone automatically splits it into parts. The first cover letter notes the report spans multiple attachments; continuation files have their own cover letter (date, reference, closing, signature) but no repeated totals or table headers. Downloads and Paperless uploads handle all files at once.

**Guide:** [Bank Reports](/guides/budget/bank-reports)

### Paperless Auto-Creation Enhancements (#2154, #2158, #2148)

When creating an invoice from a Paperless document with Auto-itemize, the review flow now offers:

- **Invoice status selector** -- Choose Quotation, Pending, Paid, or Claimed upfront (defaults to Pending)
- **Invoice-wide budget source** -- Optionally set a default financing source for all extracted lines; individual lines can override it
- **Inline vendor creation** -- If the vendor doesn't exist, create one on-the-fly without closing the flow

**Guide:** [Invoices & Vendors](/guides/budget/vendors-and-invoices)

### Admin-Created SSO-Only Accounts (#2122)

Admins can now create SSO-only accounts in the admin panel for users who will sign in exclusively via OIDC. These accounts:

- Have no password and cannot log in locally
- Show as "OIDC (awaiting first sign-in)" until the user's first SSO login with a verified matching email
- Link automatically on first SSO login if email verification is enabled in your identity provider

The admin panel now displays an **Auth Provider** column distinguishing Local, Local + OIDC, OIDC, and OIDC (awaiting first sign-in) accounts.

**Guide:** [Admin Panel](/guides/users/admin-panel)

### Backup/Restore Reliability (#2122)

Backup and restore now work correctly in the shipped Docker image. Archive format is v2 (SQLite snapshot + manifest); v1 archives (live database files) remain restorable. Restore is crash-safe: if interrupted during the data-directory swap, the next startup detects it and either rolls back the incomplete swap or cleans up leftover files.

**Related:** System memory requirement is now >= 512 MiB (required for scrypt password hashing)

## Bug Fixes & Integrity

- **Budget:** VAT_RATE is now honored in all gross-up math. Linking existing budget lines no longer modifies them; double-linking returns 409 Conflict (#2149)
- **Invoices:** Net-deposit rule now blocks refund decrease/delete when it would violate the constraint (#2127)
- **Diary:** Automatic diary event type chips are now translated; signature-locking only occurs after save (#2124, #2125)
- **Diary Filter:** Default filter is now "Manual" (showing only hand-written entries, not auto-generated system events)
- **Errors:** The UI never renders raw server error messages (#2129, #2131, #2132)

## Infrastructure & Build

- **Node.js >= 24.11.0** required (Docker image updated; development workflow now requires this version)
- **Babel 8** migration complete
- **Scrypt hardening** with N=131072 and bounded queue (responds with 429 when full)
- Container memory requirement: >= 512 MiB

## Behind the Scenes

- Refined Paperless document metadata usage in auto-itemize extraction
- Improved deposit-aware cost aggregation for budget overview rollups
- Enhanced restore process with crash-safety and atomic v2 archive format

## Deployment Notes

1. **Memory:** Ensure container has >= 512 MiB RAM available (required for scrypt password hashing)
2. **Backups:** Existing backups in v1 format are still restorable; new backups use v2 format
3. **Node version:** The Docker image now requires Node.js >= 24.11.0 (already included in the official image)

## Testing Checklist

- [ ] Access Photos page and browse spots table/grid
- [ ] Open a spot and navigate through photos with keyboard and buttons
- [ ] Create report and set max file size to split into multiple PDFs
- [ ] Create invoice from Paperless document with new status selector, budget source, and inline vendor creation
- [ ] Admin panel: Create SSO-only account and verify auth provider column
- [ ] Manual backup creation and scheduled backup execution
- [ ] Diary: Create signed entry, verify signature locks after save, not before
- [ ] Diary: Verify default filter is "Manual" on page load
- [ ] Link budget line to invoice and verify it is not modified
- [ ] Attempt double-link to same invoice (should return 409 Conflict)

## Docker Images

- **Stable release** (main): `steilerdev/cornerstone:latest`, `steilerdev/cornerstone:2.18.0`
- **Beta preview** (beta): `steilerdev/cornerstone:beta`

---

📚 [Full Documentation](https://cornerstone.steiler.dev/) | 💬 [GitHub Issues](https://github.com/steilerDev/cornerstone/issues)
