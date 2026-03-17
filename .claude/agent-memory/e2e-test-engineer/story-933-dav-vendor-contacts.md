---
name: Story #933 — DAV Token and Vendor Contacts E2E patterns
description: Selectors, POM patterns, and API paths for DAV token management and vendor contacts tests
type: project
---

## Story #933: CalDAV/CardDAV — Vendor Contacts and DAV Token E2E

### Test Files

- `e2e/tests/vendors/vendor-contacts.spec.ts` — vendor contacts CRUD (5 scenarios, 1 smoke)
- `e2e/tests/profile/dav-access.spec.ts` — DAV token lifecycle (7 scenarios, 1 smoke)

### POMs Extended

- `e2e/pages/VendorDetailPage.ts` — contactsSection, createContactModal/editContactModal,
  contactsList, contactsEmptyState, plus 7 helper methods
- `e2e/pages/ProfilePage.ts` — davSection, generate/regenerate/revokeTokenButton,
  tokenDisplay, downloadProfileLink, plus 4 helper methods + clearDavTokenViaApi()

### VendorContacts Key Selectors

- Contacts section: `<section>` containing heading "Contacts" (exact)
- Add Contact button: `getByRole('button', { name: 'Add Contact', exact: true })` inside section
- Empty state: `getByText('No contacts added yet.')` — EmptyState component, conditionally rendered
- Contact cards: `[class*="contactCard"]` inside `[class*="contactsList"]`
- Contact name: `[class*="contactName"]` inside card
- Contact role: `[class*="contactRole"]` inside card (conditionally rendered)
- Create modal: `getByRole('dialog', { name: 'Add Contact' })`
- Create form IDs: `#create-name`, `#create-role`, `#create-phone`, `#create-email`, `#create-notes`
- Create submit: `getByRole('button', { name: /Create Contact|Creating\.\.\./i })`
- Edit modal: `getByRole('dialog', { name: 'Edit Contact' })`
- Edit form IDs: `#edit-name`, `#edit-role`, `#edit-phone`, `#edit-email`, `#edit-notes`
- Edit submit: `getByRole('button', { name: /Save Changes|Saving\.\.\./i })` (shared with vendor edit)
- Delete uses `window.confirm` — register `page.once('dialog', d => d.accept())` BEFORE click
- Error banners: `[role="alert"]` inside the modal

### API paths for vendor contacts

- `GET /api/vendors/:vendorId/contacts` — returns `{ contacts: [...] }`
- `POST /api/vendors/:vendorId/contacts` — returns `{ contact: {...} }` (201)
- `PATCH /api/vendors/:vendorId/contacts/:contactId` — returns `{ contact: {...} }` (200)
- `DELETE /api/vendors/:vendorId/contacts/:contactId` — returns 204

### DAV Token Key Selectors

- DAV section: parent of `getByRole('heading', { level: 2, name: 'DAV Access (Calendar & Contacts)' })`
- Generate button: `getByRole('button', { name: 'Generate Token', exact: true })`
- Regenerate button: `getByRole('button', { name: 'Regenerate Token', exact: true })`
- Revoke button: `getByRole('button', { name: 'Revoke Token', exact: true })`
- Token display (one-time): `[class*="tokenValue"]` — `<code>` inside tokenDisplayBox
- Download profile link: `getByRole('link', { name: 'Download iOS/macOS Profile', exact: true })`
- "Token active since" status: text node inside davSection; use `toContainText(/Token active since/)`
- Revoke uses `window.confirm` — register `page.once('dialog', d => d.accept())` BEFORE click

### API paths for DAV tokens

- `GET /api/users/me/dav/token` — `{ hasToken: bool, createdAt: string|null }`
- `POST /api/users/me/dav/token` — `{ token: string }` (200) — generates/regenerates
- `DELETE /api/users/me/dav/token` — 204 — revoke (204 if active, 404 if none)
- `GET /api/users/me/dav/profile` — downloads .mobileconfig (requires active token)

### Legacy feeds route

- `/feeds/cal.ics` — NOT registered; returns 404 (verified via `page.request.get()`)
- The server comment says "replaces legacy /feeds" but no redirect is set up

### Test isolation for DAV tests

- `test.beforeEach`: DELETE `/api/users/me/dav/token` to clear any active token
- `test.afterEach`: DELETE `/api/users/me/dav/token` to clean up
- 404 on DELETE is acceptable (no token was active)

### Why edit-name ID conflict doesn't cause strict mode errors

VendorDetailPage already uses `#edit-name` etc. for the vendor edit form (inline, not modal).
The vendor edit form IDs and contact edit modal IDs share the same names but are never
simultaneously in the DOM (vendor edit is inline in the info card; contact edit is in a Modal
which is conditionally rendered). No strict mode violation in practice.
