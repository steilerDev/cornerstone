---
sidebar_position: 4
title: Users & Authentication
---

# Users & Authentication

Cornerstone supports two authentication methods: local accounts (email/password) and OIDC single sign-on.

## Authentication Methods

### Local Authentication

- Email and password login
- Passwords are hashed with bcrypt
- Secure session cookies with configurable duration

### OIDC Single Sign-On

Connect to your existing identity provider (Authentik, Keycloak, or any OpenID Connect provider) for seamless login. Admins create accounts first, then users link them via OIDC SSO on their first login.

See [OIDC Setup](oidc-setup) for detailed configuration instructions.

## User Profiles

Users can view and edit their profile:

- **Display name** -- how their name appears in the application
- **Password** -- local account users can change their password

## Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access including user management, role changes, and account deactivation |
| **Member** | Standard access to work items and project features |

## Next Steps

- [OIDC Setup](oidc-setup) -- Connect your identity provider
- [Admin Panel](admin-panel) -- Manage users and roles
