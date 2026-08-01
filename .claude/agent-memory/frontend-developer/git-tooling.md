# Git, Webpack & Tooling Notes (frontend)

## Webpack Config (`client/webpack.config.cjs`)

- CJS file, requires `const X = require('X')` syntax
- `extensionAlias` maps `.js` imports to `.ts/.tsx` files (required for ESM TypeScript)
- `CopyWebpackPlugin` copies `client/public/` → `dist/` (added in Story 12.2)
- `CssMinimizerPlugin` minifies CSS in production (Story 33)
- CSS Modules: `namedExport: false`, local ident `[name]__[local]--[hash:base64:5]` in dev

## npm audit — dev vs prod (2026-02-18)

CI uses `npm audit --omit=dev --audit-level=low` — dev-only vulns (jest, eslint, semantic-release) do NOT fail CI.
Only production dependency vulns matter. `npm audit fix` (no --force) is safe for production-only fixes.
If a vuln appears in `@fastify/static`, `better-sqlite3`, or other production deps, use `npm audit fix` to resolve.
After refinement PR #126: `npm audit --omit=dev` = 0 vulnerabilities. Dev-only vulns: ajv, minimatch in jest/eslint chain (unfixable without breaking changes).

## Git in Worktrees

- Worktrees have NO `origin` remote by default
- Add remote: `git remote add origin https://github.com/steilerDev/cornerstone.git`
- Create PRs: `gh pr create -R steilerDev/cornerstone --base beta --head <branch>`
- Watch CI: `gh pr checks <N> --repo steilerDev/cornerstone`

## Git Object Corruption Recovery

If `git commit` fails with "index file corrupt":

1. `rm .git/index && git reset` — rebuilds the index from HEAD (confirmed working)

If `git push` fails with "unable to read <sha>":

1. `git ls-tree HEAD <file>` — find which file has that blob SHA
2. `git hash-object -w <file>` — re-writes blob; remove tmp_pack files from `.git/objects/pack/`
3. `git fsck --full` should only show "dangling" warnings, not errors

## Git Object Permission Issues in Worktrees

Some `.git/objects/<prefix>/` subdirectories are owned by UID 502 (macOS sandbox), preventing writes.
When `git add` fails with "insufficient permission", use `git update-index --add --cacheinfo`:

```bash
# 1. Write object to temp dir
GIT_OBJECT_DIRECTORY=/tmp/git-objects-extra git hash-object -w <file>
# 2. Tell git about the alternate objects location
echo "/tmp/git-objects-extra" > .git/objects/info/alternates
# 3. Update the index directly
git update-index --add --cacheinfo 100644,<hash>,<path>
```

For agent-owned dirs, Python fallback: write compressed zlib blob directly.

## CI Format Check vs lint-staged Gap

lint-staged (pre-commit) only formats/lints STAGED files. CI runs `format:check` on ALL files.
Files committed in earlier sessions without Prettier running will fail CI.
Multi-line JSX ternaries sometimes formatted differently by Prettier on different runs.
Fix: `npx prettier --write <files>` → stage → commit before pushing.
