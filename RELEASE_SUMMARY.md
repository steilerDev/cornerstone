# Release Summary: v2.18.1

This patch release addresses a high-severity dependency vulnerability affecting file uploads, updates dependencies for security and compatibility, and refines the CI trailer-check behavior.

## Security Fix

### File Upload Vulnerability (GHSA-xjh9-v7x6-24jw)

**Severity:** High

Upgraded `@fastify/busboy` from 3.2.0 to 3.2.2 to remediate a vulnerability in multipart form parsing. This affects the photo upload endpoint and any other file-upload features. If you use the diary photo feature, upgrade immediately.

## Maintenance Updates

- **ical-generator:** 11.1.1 → 11.1.2 -- minor compatibility improvements
- **Development dependencies:** TypeScript, @eslint-react/eslint-plugin, typescript-eslint, and @types/node updated for latest tooling support
- **GitHub Actions:** codeql-action/upload-sarif bumped for security analysis reliability

## Deployment

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. No database migrations or configuration changes required.

## Behind the Scenes

- **CI refinement:** The trailer-check job now correctly ignores files changed by commits without Claude agent trailers (human edits and aggregated Dependabot commits in promotion PRs), preventing false failures in `beta` → `main` promotion workflows.

## Docker Images

- **Stable release** (main): `steilerdev/cornerstone:latest`, `steilerdev/cornerstone:2.18.1`
- **Beta preview** (beta): `steilerdev/cornerstone:beta`
