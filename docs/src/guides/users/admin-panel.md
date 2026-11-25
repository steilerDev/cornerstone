---
sidebar_position: 2
title: Admin Panel
---

# Admin Panel

The admin panel lets administrators manage user accounts. Access it from the sidebar under **Admin > Users**.

## User List

The admin panel shows all registered users with:

- Display name
- Email address
- Role (Admin or Member)
- Auth provider (Local, OIDC, Local + OIDC, or [OIDC awaiting first sign-in](#auth-provider-column))
- Account status (active or deactivated)
- Search and filtering

## Managing Users

### Add Users

You can create new user accounts directly from the admin panel using the **New user** button. The form asks for:

- **Display name** -- their name as shown in the app
- **Email** -- the user's email address (used for login or OIDC linking)
- **Role** -- Admin or Member
- **Sign-in method** -- shown only when OIDC is configured. Choose **Password** (the default) or **Single sign-on**
- **Password** and **Confirm password** -- required for **Password** sign-in (minimum 12 characters). Both fields are hidden when **Single sign-on** is chosen

If the email address is already in use, the form shows an error under the **Email** field.

#### Single sign-on accounts

When OIDC is configured, choose **Sign-in method: Single sign-on** to create an account without a password. These accounts:

- Have no password and cannot log in locally
- Are linked to OIDC on their first SSO login with a verified matching email
- Show as "OIDC (awaiting first sign-in)" until they log in
- Cannot set or change a password

**Once created, SSO-only accounts cannot be given a password later.** If you need to convert an SSO-only account back to a local account or change it, the workaround is:

1. Edit the account's email to a placeholder (e.g., `retired-jane@example.com`)
2. Deactivate the account
3. Create a new local account with the original email

This keeps the original account's history intact under the placeholder email.

### Auth Provider column

The user list shows an **Auth Provider** column with these labels:

- **Local** -- local password login only
- **Local + OIDC** -- can sign in with either password or OIDC (linked)
- **OIDC** -- OIDC sign-in only (already linked)
- **OIDC (awaiting first sign-in)** -- created for OIDC but not yet linked (hasn't signed in via OIDC yet)

### Edit Users

Open a user's row menu and select **Edit** to change the **Display name**, **Email**, or **Role** in the same form. Only the fields you change are saved. Saving without a change does nothing. Role changes take effect immediately.

### Deactivate Accounts

Deactivate a user account to prevent them from logging in without deleting their data. Deactivated users:

- Cannot log in (local or OIDC)
- Remain visible in user lists and assignment dropdowns

:::caution
You cannot deactivate your own account or the last remaining admin account.
:::
