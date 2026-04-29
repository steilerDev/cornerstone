# v2.4.2 Release Summary

A small bug-fix release that tightens up the Budget and Document workflows introduced in v2.4. No new features, no breaking changes, no migration required -- pull and restart.

## Bug Fixes

- **Budget source filter now drives every total on the page.** The "Available Funds" and "Remaining Budget" columns in the Cost Breakdown table -- as well as the Pending, Paid, and Quotation summary cards above the table -- now correctly reflect the active source filter. Previously they always showed unfiltered totals, which made the per-source filter misleading when you only wanted to see the picture for a single source.
- **Document picker shows all documents by default.** The "Hide already-linked documents" checkbox in the document picker now starts unchecked, so every document is immediately visible. You no longer have to clear the filter before you can re-link a document that is already attached elsewhere.
- **Mouse wheel no longer changes numeric fields.** Scrolling the page with your mouse wheel while the cursor sits over an Amount or budget field will not accidentally increment or decrement the value -- a common source of silent edits when scrolling long invoice forms.
- **VAT checkbox round-trips correctly.** The VAT / tax checkbox on invoices now preserves its state when you reopen an invoice for editing. Previously the saved state was not always reflected in the form.
- **Vendor picker no longer clears on blur.** Selecting a vendor in the Add Invoice form and then clicking elsewhere on the page (e.g. into the Amount field) no longer clears the selection.
- **Budget Overview summary cards refresh with the source filter.** The Pending, Paid, and Quotation summary cards on the Budget Overview page now refresh correctly when you toggle the source filter, so the headline numbers always match the rows below them.

## What to Update

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container -- no database migration is required.

---

_Released: 2026-04-28_
