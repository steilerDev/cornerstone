# Release Summary: v2.18.1

This patch release addresses a high-severity dependency vulnerability affecting file uploads, updates dependencies for security and compatibility, and refines the CI trailer-check behavior.

## Security Fix

### File Upload Vulnerability (GHSA-xjh9-v7x6-24jw)

**Severity:** High

Upgraded `@fastify/busboy` from 3.2.0 to 3.2.2 to remediate a vulnerability in multipart form parsing. This affects the photo upload endpoint and any other file-upload features. If you use the diary photo feature, upgrade immediately.

## Maintenance Updates

- **ical-generator:** 11.1.1 → 11.1.2 -- patch update
- **Development dependencies:**
  - @eslint-react/eslint-plugin 5.20.8 → 5.23.0
  - typescript-eslint 8.70.1 → 8.71.0
  - @types/node 26.6.2 → 26.6.3
  - testcontainers 12.1.0 → 12.2.0
- **GitHub Actions:** codeql-action/upload-sarif bumped for security analysis reliability

## Deployment

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. No database migrations or configuration changes required.

## Behind the Scenes

- **CI refinement:** The trailer-check job now correctly ignores files changed by commits without Claude agent trailers (human edits and aggregated Dependabot commits in promotion PRs), preventing false failures in `beta` → `main` promotion workflows.
- **Dependency policy:** The zero-vulnerability requirement now applies to the runtime image only (`npm audit --omit=dev`). `nanoid` is now declared as a client dependency for session management.

## Docker Images

- **Stable release** (main): `steilerdev/cornerstone:latest`, `steilerdev/cornerstone:2.18.1`
- **Beta preview** (beta): `steilerdev/cornerstone:beta`

---

📚 [Full Documentation](https://cornerstone.steiler.dev/) | 💬 [GitHub Issues](https://github.com/steilerDev/cornerstone/issues)
