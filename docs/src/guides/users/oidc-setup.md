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

OIDC does not create accounts automatically. Instead, it links existing local accounts on first SSO login:

1. **Admin creates the account first** -- use the [admin panel](admin-panel) to add users with their email address
2. **First SSO login links the account** -- when a user logs in via their identity provider for the first time, Cornerstone matches the verified email (case-insensitive) to an existing local account and links them
3. **Identity provider requirements** -- the identity provider must send `email_verified: true` with the user's email claim; unverified emails are rejected
4. **Both login methods work** -- after linking, users can log in with either their local password or OIDC SSO
5. **Unknown emails are rejected** -- if a user's verified email doesn't match any existing account, they are shown a clear error message and cannot proceed

:::info Identity providers without email verification

Some identity providers (e.g., certain Azure AD / Microsoft Entra configurations) don't send the `email_verified: true` claim. If your provider doesn't verify emails, new SSO login attempts will show an "email not verified" error and cannot establish a link. Accounts that were already linked before this issue will continue to work normally.

When setting up an account for SSO, admins can optionally set a local password during creation. Users can ignore the password and simply use SSO to log in.
:::

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OIDC_ISSUER` | Yes | Your OIDC provider's issuer URL |
| `OIDC_CLIENT_ID` | Yes | Client ID from your provider |
| `OIDC_CLIENT_SECRET` | Yes | Client secret from your provider |
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
