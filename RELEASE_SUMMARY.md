# Release Summary: v2.17.0

This release hardens OIDC account linking, adds quotation-to-invoice conversion, enforces invoice/deposit integrity, and includes a series of diary, reporting, and CI improvements.

## Major Changes

### OIDC Account Linking (Breaking Change)

**OIDC now links to existing accounts by verified email only.** Auto-provisioning is disabled by default. This improves security by requiring your identity provider to verify user emails before linking.

- **Email-based linking** -- An OIDC login whose subject isn't already linked will match an existing account by email (case-insensitive), but only when the identity provider sends `email_verified: true`. If your provider doesn't verify emails, existing linked accounts can still sign in, but new users will be rejected.
- **Unknown users rejected** -- If a verified email from your identity provider doesn't match any existing account, the user is rejected with a clear error message unless `OIDC_JIT_PROVISIONING=true` is set.
- **New opt-in provisioning** -- Set `OIDC_JIT_PROVISIONING=true` to enable just-in-time account creation on first SSO login. New accounts are created with the `member` role only (never `admin`), and only after the first admin account exists. This feature requires a restricted identity provider -- only enable it if you trust who can sign in.
- **Migration required** -- Migration `0046_users_oidc_subject_unique.sql` adds a unique index on `users.oidc_subject`. The upgrade will fail if two users share the same OIDC subject. Before upgrading, back up your database and check: `SELECT oidc_subject, COUNT(*) FROM users WHERE oidc_subject IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;` -- if this returns any rows, contact support.

### Quotation to Final Invoice Conversion

Convert a quotation directly to a final invoice (#2107). Open the quotation's invoice detail page and click **Convert to final invoice** to open a dialog where you:

- **Enter final invoice details** -- final amount, invoice date, invoice number, due date, and notes. A note with the quoted amount is added automatically.
- **Optionally select a Paperless document** -- the document becomes the invoice attachment. If Paperless and an LLM are configured, **Prefill from document** auto-extracts the details.
- **Review and edit itemized lines** -- proposed amounts are scaled pro rata to the final amount. You can edit them or keep the existing itemization; any remainder goes to Discretionary.
- **See deposits and final payment** -- deposits remain unchanged and are shown separately from the final payment.
- **Choose payment status** -- leave as pending or mark as already paid.

Conversion is blocked if deposits exceed the final amount (add a refund entry or increase the amount) or if the itemized total exceeds it. Nothing is saved until you confirm.

### Invoice Amount & Deposit Safeguards

Invoices now enforce invariants that prevent budget math from breaking (#2128):

- **Itemized amount floor** -- When lowering an invoice total, the itemized amounts across all linked budget lines must stay ≤ the new amount. Edits that don't lower the amount are never blocked.
- **Deposit floor (net of refunds)** -- The sum of deposits minus refunds must not exceed the invoice amount. This is checked when a deposit is added, increased, or when the invoice amount is lowered. Raising the amount is never blocked.
- **Date validation** -- Calendar-impossible dates (e.g., 2026-02-31) are rejected.

### Diary Signature Improvements

Diary signatures now handle incomplete entries more gracefully (#2126):

- **Unfinished signatures not sent** -- An unfinished signature (no signer selected or no drawing yet) is not sent to the server. Save is blocked client-side with a clear message next to the field, and autosave continues working.
- **Remove button** -- A pending signature can be discarded with **Remove** to clear the canvas and try again.
- **Error messages translated** -- Server errors now appear in your configured language.
- **Email fallback for signer name** -- When a user's display name is blank, the signer name falls back to their email address.

### Report Preview & PDF Parity

Report preview and PDF export now render identically (#2133):

- Annotation order matches between preview and PDF (#2011)
- Tier-3 summary text width constraints prevent cutoff (#2020, #2021)
- Locale-specific formatting in German and English

### Other Improvements

- German UI now uses „…" (German quotation marks) instead of straight quotes (#2013)
- E2E Gates now require full shard coverage on main promotions
- Dependency updates for security and compatibility

## Migration Notes

**Before upgrading:** Back up your database. Migration `0046_users_oidc_subject_unique.sql` adds a unique index on `users.oidc_subject` and will fail if two users share the same subject. Check: `SELECT oidc_subject, COUNT(*) FROM users WHERE oidc_subject IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;` -- if this returns rows, contact support before upgrading.

**After upgrading:** If you use OIDC:

1. Test OIDC login with an existing user who already has a linked account -- both OIDC and local password login should work.
2. Test OIDC login with a user whose verified email doesn't match any account -- they should be rejected with a clear error message (unless `OIDC_JIT_PROVISIONING=true` is set).
3. Verify your identity provider sends `email_verified: true` for all users (consult your provider's documentation).

If you want to enable SSO-based account creation, set `OIDC_JIT_PROVISIONING=true` and restart the container.

## Configuration

No new required configuration. Optional:

- `OIDC_JIT_PROVISIONING=true` -- Enable just-in-time account provisioning on first SSO login (off by default; member role only; requires verified emails and restricted IdP)

See the [OIDC Setup](/guides/users/oidc-setup) guide for full details.

## Testing Checklist

- [ ] OIDC login with existing linked account (both OIDC and password should work)
- [ ] OIDC login with verified email that doesn't match any account (rejected unless JIT provisioning enabled)
- [ ] Convert a quotation to a final invoice, entering final details and reviewing itemized lines
- [ ] Edit invoice amount when itemized total is exactly the amount (allowed)
- [ ] Attempt to lower invoice below itemized total (blocked with error)
- [ ] Attempt to lower invoice when deposits exceed the new amount (blocked with error)
- [ ] Diary: Start a signature without finishing it, then Remove it
- [ ] Report PDF matches preview layout and annotations in both English and German

## Docker Images

- **Stable release** (main): `steilerdev/cornerstone:latest`, `steilerdev/cornerstone:2.17.0`
- **Beta preview** (beta): `steilerdev/cornerstone:beta`
