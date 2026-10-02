---
sidebar_position: 1
title: OIDC Setup
---

# OIDC Setup

Cornerstone supports OpenID Connect (OIDC) single sign-on, allowing users to log in with their existing identity provider.

## Prerequisites

- An OIDC-compatible identity provider (Authentik, Keycloak, Authelia, etc.)
- Cornerstone accessible via HTTPS (or `SECURE_COOKIES=false` for local testing)

## Step 1: Register a Client

In your identity provider, create a new client/application:

1. **Application type**: Web application
2. **Redirect URI**: `https://<your-domain>/api/auth/oidc/callback`
3. **Grant type**: Authorization Code
4. Note the **Client ID** and **Client Secret**

:::info Redirect URI
The redirect URI you register with your identity provider must exactly match the callback URL that Cornerstone generates. Cornerstone builds the callback URL as:

```
<EXTERNAL_URL>/api/auth/oidc/callback
```

For example, if `EXTERNAL_URL=https://myhouse.example.com`, the redirect URI is:

```
https://myhouse.example.com/api/auth/oidc/callback
```

If `EXTERNAL_URL` is not set, Cornerstone derives the URL from the incoming request's protocol and host (e.g., `https://localhost:3000/api/auth/oidc/callback`). Behind a reverse proxy, you should always set `EXTERNAL_URL` to ensure the callback URL matches what you registered with your identity provider.
:::

## Step 2: Configure Environment Variables

Set the following environment variables in your `.env` file or Docker configuration:

```env
TRUST_PROXY=true
SECURE_COOKIES=true
EXTERNAL_URL=https://myhouse.example.com
OIDC_ISSUER=https://auth.example.com/realms/main
OIDC_CLIENT_ID=cornerstone
OIDC_CLIENT_SECRET=your-client-secret
```

OIDC is automatically enabled when `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all set.

## Step 3: Restart and Test

Restart your Cornerstone container. The login page will now show an OIDC login button alongside the local login form.

## How It Works

1. User clicks the OIDC login button
2. Browser redirects to your identity provider
3. User authenticates with their credentials
4. Identity provider redirects back to `<EXTERNAL_URL>/api/auth/oidc/callback` with an authorization code
5. Cornerstone exchanges the code for tokens and creates a session

### Account Linking

By default, OIDC does not create accounts. Instead, it links existing accounts on first SSO login:

**Two account types:**

1. **Local accounts with SSO linking** -- use the [admin panel](admin-panel) to add users with their email address and a password. When they sign in via OIDC for the first time, their account is linked. After linking, they can sign in with either their password or OIDC SSO.

2. **SSO-only accounts** -- also created from the [admin panel](admin-panel), with the "Single sign-on only (no password)" option. These have no password and can only sign in via OIDC. They are linked automatically on their first SSO login.

**Linking process:**

1. **First SSO login** -- when a user logs in via their identity provider for the first time, Cornerstone matches the verified email (case-insensitive) to an existing account and links them
2. **Identity provider requirements** -- the identity provider must send `email_verified: true` with the user's email claim; unverified emails are rejected
3. **Unknown emails are rejected** (unless `OIDC_JIT_PROVISIONING=true`) -- if a user's verified email doesn't match any existing account, they are shown a clear error message and cannot proceed

:::info Identity providers without email verification

Some identity providers (e.g., certain Azure AD / Microsoft Entra configurations) don't send the `email_verified: true` claim. If your provider doesn't verify emails, new SSO login attempts will show an "email not verified" error and cannot establish a link. Users whose account is already linked can keep signing in even if the identity provider doesn't send a verified-email claim.
:::

:::caution OIDC disabling

If OIDC is later disabled, nobody can sign in with SSO. Accounts with a password keep signing in with it. SSO-only accounts have no password and cannot sign in until OIDC is re-enabled.
:::

### Just-in-time provisioning (opt-in)

Set `OIDC_JIT_PROVISIONING=true` to create accounts on first SSO login instead of rejecting unknown emails.

- **Off by default** -- without the setting, OIDC only links existing accounts.
- **Members only** -- new accounts get the `member` role, never `admin`.
- **Display name** -- taken from the `name` claim, then `preferred_username`, then the email address.
- **Verified email still required** -- the identity provider must send `email_verified: true`.
- **Never provisioned** -- deactivated accounts and emails that ambiguously match existing accounts are not provisioned.
- **After initial setup only** -- provisioning is refused until the first admin account has been created.
- **SSO only** -- provisioned accounts have no password and sign in through SSO only; password change is unavailable, as for any OIDC account.

:::warning
With an open identity provider (for example Google), anyone with an account there can register. Enable this only with a provider that restricts who can sign in.
:::

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OIDC_ISSUER` | Yes | Your OIDC provider's issuer URL |
| `OIDC_CLIENT_ID` | Yes | Client ID from your provider |
| `OIDC_CLIENT_SECRET` | Yes | Client secret from your provider |
| `OIDC_JIT_PROVISIONING` | No | Set to `true` to create `member` accounts on first SSO login (default `false`) |
| `EXTERNAL_URL` | Recommended | Public-facing base URL -- used to build the OIDC callback URL |
| `TRUST_PROXY` | Recommended | Set to `true` behind a reverse proxy |
| `SECURE_COOKIES` | Recommended | Set to `true` for HTTPS (default) |

## Provider-Specific Notes

### Authentik

- Issuer URL format: `https://auth.example.com/application/o/<application-slug>/`
- Create a new OAuth2/OpenID Provider, then create an Application linked to it

### Keycloak

- Issuer URL format: `https://auth.example.com/realms/<realm-name>`
- Create a new Client in your realm with "Client authentication" enabled
