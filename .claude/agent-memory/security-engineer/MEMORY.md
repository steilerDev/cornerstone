# Security Engineer Memory

> This index stays lean. Detailed findings, full PR history, and architecture notes live in topic files linked below.

## Repo & Process

- **Repo**: `steilerDev/cornerstone`, beta → main model
- **Auth comment**: All comments must start with `**[security-engineer]**`
- **Commit trailer**: `Co-Authored-By: Claude security-engineer (Sonnet 4.6) <noreply@anthropic.com>`
- **PR review**: Post as `--comment` (NOT `--approve` — same token can't approve own PRs)
- **npm audit**: Run `npm audit --omit=dev` for production vuln check (dev audit includes npm's own bundled tools which have 39 vulns unrelated to app)
- **CI does NOT run a vuln scan**: `.github/workflows/ci.yml` Static Analysis job only runs `npm audit signatures` (provenance/signing check) — never `npm audit` for known CVEs. This security review is the only vulnerability-scan gate dependency PRs get; don't assume a green CI implies audit-clean.
- **Fast whole-lockfile audit without `npm install`**: parse `package-lock.json` `.packages` entries into unique `name -> [versions]`, POST as `{name:[versions...]}` to `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` (same data source `npm audit` uses). Works on a lockfile alone — no install needed, handles monorepos with 1700+ resolved packages in one call. Use this whenever reviewing a package-lock.json diff.
- **Verifying a scoped npm `overrides` entry**: nested syntax `"parentPkg": { "subDep": "version" }` resolves correctly if-and-only-if the lockfile shows `node_modules/parentPkg/node_modules/subDep` at the pinned version while root `node_modules/subDep` stays at the original (unscoped) version, and no _other_ package also has its own nested copy of subDep (which would mean the override missed a consumer). Check via `grep -n '"node_modules/.*node_modules/<subDep>"'` in the lockfile — cheaper than running `npm ls`.

## Established Baseline Security Controls

Verified across EPIC-01/02/03/05 — all confirmed STRONG:

- **Argon2id** password hashing (N=65536, t=3, p=4) — OWASP-compliant
- **Session tokens**: 256-bit crypto.randomBytes(32), HttpOnly+Secure+SameSite=strict cookies
- **OIDC**: openid-client@6.x, 256-bit state param, server-side Map, 10-min TTL, one-time use
- **RBAC**: requireRole() preHandler, fresh DB lookup every request (no caching)
- **SQL injection**: Drizzle ORM parameterized queries throughout; `sql\`\`` tagged templates also safe
- **XSS**: Zero dangerouslySetInnerHTML/innerHTML/eval in any client code across all EPICs
- **CSRF**: SameSite=strict session cookies (no token needed)
- **Sensitive data**: toUserResponse() strips passwordHash/oidcSubject/davToken (explicit field mapping); toBudgetCategory() explicit field mapping
- **Dockerfile**: DHI images (near-zero CVEs), non-root user, multi-stage, no shell in prod
- **Dependencies**: 0 production vulnerabilities (npm audit --omit=dev)

## Review Status by Story/PR

- [Full PR review table](pr-review-table.md) — every PR reviewed since project inception, one line each
- [Detailed review findings](review-history.md) — full write-ups for PRs with notable findings

Most recent: **#1998** fix(security): #1995 — CVE-2026-15144 / GHSA-grpc-p53c-r64v (CVSS 7.3) IPv6 /64 rate-limit bypass. Custom `keyGenerator` in `rateLimitPlugin.ts` returned raw `request.ip` string (full IPv6 address) rather than /64-normalized prefix; an attacker with a /64 allocation could exhaust 2^64 distinct buckets and bypass rate limits on all 4 auth endpoints entirely. Fix: delete the 13-line custom `keyGenerator` — `@fastify/rate-limit` 11.2.0's default generator applies /64 normalization. COMMENTED APPROVED. 1 informational: only login route covered by the new /64-sharing test; setup/password/dav-tokens endpoints share the same plugin instance so normalization is guaranteed, but explicit tests are missing.

Previous: **#1916** feat(reports): server-side AI report content generation (POST /api/source-reports/generate-content, story #1901) — APPROVED, no High/Critical findings. Auth check matches sibling routes (`if (!request.user) throw UnauthorizedError`, both roles allowed); schema tight (closed enums, array min/maxItems, additionalProperties stripped not rejected); IDOR-safe by construction — server re-derives the invoice set from `getSourceReport()` and filters client-supplied IDs against it before touching the LLM; prompt-injection mitigated via explicit untrusted-data system-prompt rule + output allowlist validation (length caps, required-invoiceId check) + output always rendered as plain text (React `value=` props / pdfmake `text:` nodes, never HTML) so injection can't become XSS; LLM errors use `suppressDetails: true`, verified by a dedicated integration test that the raw upstream payload never reaches the client; confirmed read-only (no DB writes) both by code inspection and a dedicated "does not write any DB rows" test; LLM_BASE_URL is env-only (no SSRF vector), timeout enforced via AbortController. 2 informational notes only: no per-route rate limit on the new endpoint (matches pre-existing `invoiceAutoItemize` posture, not a regression) and a stale test-file comment in `sourceReports.generateContent.test.ts` claiming a schema-import bug that the PR's own 2nd commit (59dda421) already fixed — verified via `git show` diff of both commits against `db/schema.ts`'s actual exports. See [architecture-patterns.md](architecture-patterns.md) for the reusable LLM-writes-user-facing-text security template this PR established.

Previous: **#1854** fix(deps): scope `js-yaml` override to `gray-matter@3.15.0` — APPROVED, no findings. Verified `3.15.0` is the genuine GHSA-h67p-54hq-rp68/CVE-2026-53550 patched release on the 3.x line (advisory has two independently-patched ranges: `4.0.0-4.1.1`→`4.2.0` and `<3.15.0`→`3.15.0`); confirmed via lockfile that only `node_modules/gray-matter/node_modules/js-yaml` resolves to 3.15.0 while root stays 4.2.0; full-lockfile bulk audit (1781 packages) returned 0 advisories; confirmed gray-matter's `lib/engines.js` calls `yaml.safeLoad`/`safeDump` (js-yaml 3.x's SAFE_SCHEMA — no `!!js/function` deserialization gadget) so no new attack surface. Also noted (informational, not blocking): a full `npm install` regeneration churns unrelated transitive deps incl. one prod dep (`@fastify/static > lru-cache` patch bump) — expected per repo's "always regenerate via full npm install" policy, disclosed in the PR body, audit-clean.

Previous: **#1853** repo-hygiene (dead BudgetPage removal, AutoItemizePdfPreview.test.tsx, wiki doc for merge-lines endpoint, errorHandler.ts doc-comment fix, checklist/CLAUDE.md exemption wording) — APPROVED, no findings. Confirmed `getDocumentPreviewUrl()` iframe src always resolves to the app's own `getBaseUrl()` proxy path (never a raw external URL) so no SSRF/open-redirect; jsdom client project has no `resources: 'usable'` so iframe `src` never triggers a real fetch in unit tests — safe default worth reusing when reviewing any future iframe/img-src test.

## Known Open Recommendations

- [Full numbered list (33 items)](open-recommendations.md) — low/informational findings not yet fixed, tracked mostly via GitHub Issue #315
- Highest priority still open: (1) security headers via @fastify/helmet (Low), (2) account lockout after N failed attempts (Low) — rate limiting on auth endpoints is resolved (PR #784 added it; PR #1998 closed IPv6 bypass CVE-2026-15144)

## Key Architecture Patterns (Security-Relevant)

- [Full pattern log by PR](architecture-patterns.md) — confirmed-safe idioms and known gaps, one entry per PR
- Recurring safe patterns worth remembering without opening the file: CSS class/color from server-validated enum is always safe (never string-interpolated); React Router `<Link to={.../${id}}>` with API-sourced UUID/int IDs is safe (no open-redirect/JS-URI vector); JSX/SVG text nodes auto-escape user data; `sql.raw()` is safe only when the raw value is a ternary/enum literal, never user input directly
- Wiki submodule quirks: detached HEAD after `git submodule update --init` (must `checkout master`); direct `git -C wiki add` fails on virtiofs — clone the submodule's `.git` dir to `/tmp` and push from there instead (see architecture-patterns.md for exact paths)
