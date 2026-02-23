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

## Step 2: Configure Environment Variables

Set the following environment variables in your `.env` file or Docker configuration:

```env
TRUST_PROXY=true
SECURE_COOKIES=true
OIDC_ISSUER=https://auth.example.com/realms/main
OIDC_CLIENT_ID=cornerstone
OIDC_CLIENT_SECRET=your-client-secret
```

OIDC is automatically enabled when `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all set.

### Optional: Explicit Redirect URI

If your application is behind a reverse proxy, you may need to set the redirect URI explicitly:

```env
OIDC_REDIRECT_URI=https://cornerstone.example.com/api/auth/oidc/callback
```

If not set, the redirect URI is auto-derived from the incoming request.

## Step 3: Restart and Test

Restart your Cornerstone container. The login page will now show an OIDC login button alongside the local login form.

## How It Works

1. User clicks the OIDC login button
2. Browser redirects to your identity provider
3. User authenticates with their credentials
4. Identity provider redirects back to Cornerstone with an authorization code
5. Cornerstone exchanges the code for tokens and creates a session

### Auto-Provisioning

Users who log in via OIDC for the first time are automatically created in Cornerstone with the **Member** role. Admins can change their role later through the [admin panel](admin-panel).

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OIDC_ISSUER` | Yes | Your OIDC provider's issuer URL |
| `OIDC_CLIENT_ID` | Yes | Client ID from your provider |
| `OIDC_CLIENT_SECRET` | Yes | Client secret from your provider |
| `OIDC_REDIRECT_URI` | No | Explicit callback URL (auto-derived if not set) |
| `TRUST_PROXY` | Recommended | Set to `true` behind a reverse proxy |
| `SECURE_COOKIES` | Recommended | Set to `true` for HTTPS (default) |

## Provider-Specific Notes

### Authentik

- Issuer URL format: `https://auth.example.com/application/o/<application-slug>/`
- Create a new OAuth2/OpenID Provider, then create an Application linked to it

### Keycloak

- Issuer URL format: `https://auth.example.com/realms/<realm-name>`
- Create a new Client in your realm with "Client authentication" enabled
