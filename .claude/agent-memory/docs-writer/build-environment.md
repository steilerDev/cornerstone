# Docs Build Environment Issues (worktrees)

- `npm run docs:build` may fail in worktrees due to node_modules corruption (jiti/babel.js, regenerate.js; more recently a webpack `ProgressPlugin` ValidationError). The failure is environmental, not content-related — the build reaches the webpack bundling stage, so MDX/content/link loading has already succeeded.
- Workarounds:
  - Try building from the base project directory instead of the worktree.
  - A clean `npm install` in the worktree may NOT fix it — the sandbox filesystem corruption persists.
  - If no local build is possible, validate internal links/anchors statically with grep; CI does the real build and will catch broken links (`onBrokenLinks: 'throw'`).
- Config files are `.js` (not `.ts`) specifically to avoid the jiti/babel.js corruption path — do not convert them to TypeScript.
