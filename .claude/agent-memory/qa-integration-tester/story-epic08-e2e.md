# EPIC-08 E2E Tests (PR #382, 2026-03-02)

## What was done

- Updated `e2e/pages/DocumentsPage.ts` POM from old stub version to full EPIC-08 implementation
- Removed Documents stub test from `e2e/tests/navigation/stub-pages.spec.ts`
- Created `e2e/tests/documents/documents-browser.spec.ts` (8 scenarios)
- Created `e2e/tests/documents/documents-linked-sections.spec.ts` (10 scenarios)

## Key Architecture Facts

### Paperless NOT available in E2E environment

The testcontainer (`e2e/containers/cornerstoneContainer.ts`) does NOT set `PAPERLESS_URL` or
`PAPERLESS_API_TOKEN`. All document tests validate the "not configured" state.

### DocumentBrowser States

The `DocumentBrowser` component has 4 states based on Paperless status:

1. Checking (null status) — `aria-busy="true"` on `.infoState`
2. Not configured — h2 "Paperless-ngx Not Configured", `.infoState` div
3. Unreachable — `.errorState` with role="alert"
4. Full browser — search input + tag strip + document grid (role="list" aria-label="Documents")

### LinkedDocumentsSection

Renders as `<section aria-labelledby="documents-section-title">` — accessible as
`page.getByRole('region', { name: 'Documents' })`.

The `#documents-section-title` h2 id is stable for assertions.

### Invoice Detail Route

The InvoiceDetailPage is at `/budget/invoices/:id` (NOT `/budget/vendors/:vendorId/invoices/:id`).
Create invoices via API: `POST /api/vendors/:vendorId/invoices`.

### "Not Configured" Banner Text

`LinkedDocumentsSection` renders: `"Paperless-ngx is not configured"` (exact text for assertions).

### Add Document Button

`"+ Add Document"` — exact text, disabled when Paperless not configured.

## Test Selectors

- Documents page h1: `getByRole('heading', { level: 1, name: 'Documents', exact: true })`
- Not configured h2: `getByRole('heading', { level: 2, name: 'Paperless-ngx Not Configured' })`
- Info state container: `locator('[class*="infoState"]')`
- Search input (when available): `getByRole('searchbox', { name: 'Search documents' })`
- Document grid: `getByRole('list', { name: 'Documents' })`
- Add doc button: `getByRole('button', { name: '+ Add Document', exact: true })`
- Documents section on entity pages: `getByRole('region', { name: 'Documents', exact: true })`
- Section title id: `locator('#documents-section-title')`
- Not configured banner: `getByText('Paperless-ngx is not configured')`

## API Endpoints Added (EPIC-08)

- `GET /api/paperless/status` — returns `{ configured: boolean, reachable: boolean, paperlessUrl: string | null }`
- `GET /api/paperless/documents` — document list (only when configured+reachable)
- `GET /api/paperless/tags` — tag list (only when configured+reachable)
- `GET /api/document-links/:entityType/:entityId` — list linked documents for entity
- `POST /api/document-links` — create document link
- `DELETE /api/document-links/:linkId` — delete document link
