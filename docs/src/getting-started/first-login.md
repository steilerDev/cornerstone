---
sidebar_position: 2
title: First Login
---

# First Login

When you start Cornerstone for the first time, a setup wizard guides you through creating the initial admin account. No command-line setup is needed.

## Setup Wizard

1. Open `http://localhost:3000` (or your configured host/port) in your browser
2. You will be automatically redirected to the setup page
3. Enter your admin account details:
   - **Display Name** -- how your name appears in the application
   - **Email** -- used for logging in
   - **Password** -- must meet minimum security requirements
4. Click **Create Account**

After creating the admin account, you'll be redirected to the login page.

## Logging In

Enter the email and password you just created to log in. You'll land on the work items page, ready to start managing your project.

## Adding More Users

Once logged in as an admin, you can add more users through the [admin panel](admin-panel). Users can be created with either:

- **Local accounts** -- email and password managed by Cornerstone
- **OIDC accounts** -- users log in through your identity provider and are automatically provisioned on first login (see [OIDC Setup](oidc-setup))

## Roles

Cornerstone has two roles:

| Role | Permissions |
|------|-------------|
| **Admin** | Full access including user management |
| **Member** | Standard access to work items and project features |

The first user created through the setup wizard is always an Admin.
