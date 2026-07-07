# Security Engineer Memory

> This index stays lean. Detailed findings, full PR history, and architecture notes live in topic files linked below.

## Repo & Process

- **Repo**: `steilerDev/cornerstone`, beta → main model
- **Auth comment**: All comments must start with `**[security-engineer]**`
- **Commit trailer**: `Co-Authored-By: Claude security-engineer (Sonnet 4.6) <noreply@anthropic.com>`
- **PR review**: Post as `--comment` (NOT `--approve` — same token can't approve own PRs)
- **npm audit**: Run `npm audit --omit=dev` for production vuln check (dev audit includes npm's own bundled tools which have 39 vulns unrelated to app)

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

Most recent: **#1844** i18n sweep (69 strings/27 components) + dead MilestonePanel removal — APPROVED. Confirmed pattern: i18next `escapeValue:false` (client/src/i18n/index.ts:111) is safe because every `t()` interpolation in this codebase renders through plain JSX text children or JSX attributes (never `<Trans>`, never dangerouslySetInnerHTML) — React's own escaping covers it regardless of the i18next setting. Baseline check for future i18n PRs: grep new `t()` call sites for `<Trans>`/dangerouslySetInnerHTML, not the escapeValue config itself (already verified stable).

## Known Open Recommendations

- [Full numbered list (33 items)](open-recommendations.md) — low/informational findings not yet fixed, tracked mostly via GitHub Issue #315
- Highest priority still open: (1) rate limiting on login/setup/password (Medium), (2) security headers via @fastify/helmet (Low), (3) account lockout after N failed attempts (Low)

## Key Architecture Patterns (Security-Relevant)

- [Full pattern log by PR](architecture-patterns.md) — confirmed-safe idioms and known gaps, one entry per PR
- Recurring safe patterns worth remembering without opening the file: CSS class/color from server-validated enum is always safe (never string-interpolated); React Router `<Link to={.../${id}}>` with API-sourced UUID/int IDs is safe (no open-redirect/JS-URI vector); JSX/SVG text nodes auto-escape user data; `sql.raw()` is safe only when the raw value is a ternary/enum literal, never user input directly
- Wiki submodule quirks: detached HEAD after `git submodule update --init` (must `checkout master`); direct `git -C wiki add` fails on virtiofs — clone the submodule's `.git` dir to `/tmp` and push from there instead (see architecture-patterns.md for exact paths)
