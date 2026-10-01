# Release Summary: v2.16.0

This release hardens OIDC account linking, adds quotation-to-invoice conversion, enforces invoice/deposit integrity, and includes a series of diary, reporting, and CI improvements.

## Major Changes

### OIDC Account Linking (Breaking Change)

**OIDC now links to existing accounts by verified email only.** Auto-provisioning is disabled by default. This change improves security by preventing unintended account creation and email ambiguity.

- **Verified email required** -- Your identity provider must send `email_verified: true` with the user's email claim. If your provider doesn't verify emails, existing linked accounts can still sign in, but new users will be rejected.
- **New opt-in provisioning** -- Set `OIDC_JIT_PROVISIONING=true` to enable just-in-time account creation on first SSO login. New accounts are created with the `member` role only (never `admin`), and only after the first admin account exists. This feature requires a restricted identity provider -- only enable it if you trust who can sign in.
- **Migration required** -- Existing OIDC links are automatically unified via migration `0046_users_oidc_subject_unique.sql` to ensure one link per account. The OIDC setup page has updated guidance on email verification and configuration.

### Quotation to Final Invoice Conversion

Convert a quotation directly to a final invoice in one transaction (PR #2107). All linked budget lines, itemized amounts, and vendor information transfer automatically -- no re-linking needed.

- Open a quotation detail page and click **Convert to Final Invoice** to promote it to **Pending** status.
- The invoice retains all allocations and associated deposits.

### Invoice Amount & Deposit Safeguards

Invoices now enforce invariants that prevent budget math from breaking (PR #2108, #2109, #2113):

- **Itemized amount floor** -- You cannot lower an invoice total below the sum of itemized amounts across all linked budget lines.
- **Confirmed deposit floor** -- You cannot lower an invoice total below deposits already marked as received.
- **Date validation** -- Impossible dates (e.g., year 5000) are rejected.

### Diary Signature Improvements

Diary signatures now enforce completion before entry save (PR #2088):

- **Completion required** -- Unfinished signatures (drawn but not saved) block entry save. Use the **Remove** button to discard incomplete signatures.
- **Error messages translated** -- Signature-related errors now appear in your configured language.

### Report Preview & PDF Parity

Report preview and PDF export now render identically, including:

- Annotation order matches between preview and PDF (PR #2011)
- Tier-3 summary text width constraints prevent cutoff (PR #2020, #2021)
- Locale-specific formatting in German and English

### Other Improvements

- German UI now uses „…" (German quotation marks) instead of straight quotes (PR #2013)
- CI gates now enforce ESLint and Prettier formatting across all code (PR #2024, #2043, #2111)
- E2E Gates are no longer vacuously passing -- full shard coverage required on main promotions
- Dependency updates for security and compatibility

## Migration Notes

**Before upgrading:** Backup your database. Migration `0046_users_oidc_subject_unique.sql` ensures one OIDC subject link per account; existing data is preserved, but the operation requires schema changes.

**After upgrading:** If you use OIDC:

1. Test OIDC login with an existing user who already has a linked account -- both OIDC and local password login should work.
2. Test OIDC login with a user whose account does not exist yet -- they should be rejected with a clear error message (unless `OIDC_JIT_PROVISIONING=true` is set).
3. Verify your identity provider sends `email_verified: true` for all users (consult your provider's documentation).

If you want to enable SSO-based account creation, set `OIDC_JIT_PROVISIONING=true` and restart the container.

## Configuration

No new required configuration. Optional:

- `OIDC_JIT_PROVISIONING=true` -- Enable just-in-time account provisioning on first SSO login (off by default; member role only; requires verified emails and restricted IdP)

See the [OIDC Setup](/guides/users/oidc-setup) guide for full details.

## Testing Checklist

- [ ] OIDC login with existing linked account (both OIDC and password should work)
- [ ] OIDC login with unknown email (rejected with error message unless JIT provisioning enabled)
- [ ] Convert a quotation with linked budget lines to a final invoice
- [ ] Lower an invoice amount to exactly the itemized total (allowed)
- [ ] Attempt to lower an invoice below itemized total (rejected with error)
- [ ] Attempt to lower an invoice below confirmed deposits (rejected with error)
- [ ] Diary: Start but do not finish a signature, then Remove it
- [ ] Report PDF matches preview layout and annotations in both English and German

## Docker Images

- **Stable release** (main): `steilerdev/cornerstone:latest`, `steilerdev/cornerstone:v2.16.0`
- **Beta preview** (beta): `steilerdev/cornerstone:beta`
