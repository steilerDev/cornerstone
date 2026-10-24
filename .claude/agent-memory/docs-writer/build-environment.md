# Docs Build Environment Issues (worktrees)

- `npm run docs:build` may fail in worktrees due to node_modules corruption (jiti/babel.js, regenerate.js; more recently a webpack `ProgressPlugin` ValidationError). The failure is environmental, not content-related — the build reaches the webpack bundling stage, so MDX/content/link loading has already succeeded.
- Workarounds:
  - Try building from the base project directory instead of the worktree.
  - A clean `npm install` in the worktree may NOT fix it — the sandbox filesystem corruption persists.
  - If no local build is possible, validate internal links/anchors statically with grep; CI does the real build and will catch broken links (`onBrokenLinks: 'throw'`).
- Config files are `.js` (not `.ts`) specifically to avoid the jiti/babel.js corruption path — do not convert them to TypeScript.
- Update (2026-10, #2235 pass): `npm run build -w docs` succeeded in the `epic-21-run` worktree (only the pre-existing missing-screenshot warnings). Try the build first; fall back to grep validation only if it really fails.
- CI is green by vacuity on docs-only PRs: `Detect Changes` skips the real docs build, so the wrapper gate passes. Run the build locally after any link or heading edit.
