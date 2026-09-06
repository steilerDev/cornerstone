---
name: sandbox-live-verification
description: What live/containerized E2E verification is actually possible from inside a sandbox session — re-check every session, this has changed at least once.
metadata:
  type: project
---

## Status as of Story #1891 (2026-07-30 session)

Prior memory (and several earlier story files) documented that sandboxes cannot build
`cornerstone:e2e` because `dhi.io` (Docker Hardened Images) registry credentials aren't
available — every earlier attempt failed with `401 Unauthorized` on `docker pull
dhi.io/node:...`. **That was true in those sessions but is not a fixed property of "the
sandbox" in general** — in this session:

```bash
docker pull dhi.io/node:24-alpine3.23-dev   # succeeded, no auth prompt
docker build -t cornerstone:e2e --build-arg APP_VERSION=pr-1891-verify .   # succeeded, ~2 min
```

The full app image built cleanly, and running `npx playwright test <spec> --project=desktop`
against it actually spun up the whole stack via `e2e/containers/setup.ts`:

```
🐳 Starting E2E test containers...
✅ Created Docker network: ...
🔐 Starting OIDC server...
✅ OIDC server ready at http://localhost:.../default
🏗️  Starting Cornerstone application and reverse proxy...
✅ Cornerstone app ready at http://localhost:...
✅ Reverse proxy ready at http://localhost:...
✅ All containers ready for E2E testing
```

i.e. `mock-oauth2-server`, the built `cornerstone:e2e` app container, and the `nginx:alpine`
reverse proxy all pulled/started/health-checked correctly. **This is a first** — no prior
story session got this far.

**Action for future sessions**: always attempt `docker pull dhi.io/node:24-alpine3.23-dev`
(or just `docker build -t cornerstone:e2e .`) early, in the background, rather than assuming
it will fail from stale memory. If it succeeds, a genuine live CI-equivalent run becomes
possible for the AC verification steps that ask for one (e.g. a MANDATORY red/green proof).

## The remaining blocker: no usable browser binary

Even with the container stack fully working, `npx playwright test` still fails at the
`auth-setup` project because no Chromium binary is available:

1. **Playwright's own download is network-policy-blocked.** `npx playwright install chromium`
   (with or without `--with-deps`) tries `playwright.download.prss.microsoft.com`,
   `cdn.playwright.dev`, and one more mirror, in that order — all three returned HTTP 403
   `Blocked by network policy: ... no matching allow rule — blocked by default deny policy`.
   This is a `sbx policy allow network <domain>` decision for the user/host, not something to
   work around unilaterally.
2. **Ubuntu's `chromium-browser` apt package is a non-functional snap stub.** `apt-get install
chromium-browser` succeeds and installs `/usr/bin/chromium-browser`, but running it (even
   pointed to via a local `playwright.config.ts` override's `use.launchOptions.executablePath`)
   fails immediately:
   ```
   Command '/usr/bin/chromium-browser' requires the chromium snap to be installed.
   Please install it with: snap install chromium
   ```
   `snap install chromium` in turn fails because `snapd` isn't running in this sandbox
   (`dial unix /run/snapd.socket: connect: no such file or directory`), and there is no `apt`
   package named plain `chromium` (only the snap-transitional `chromium-browser` stub) on this
   Ubuntu release. No other route to a real browser binary was found in this session
   (no cached `~/.cache/ms-playwright` binaries, no `google-chrome`/`firefox` either).

**Net effect**: a fully live Playwright _browser_ run is still not achievable in this sandbox
class, even though the _container/app_ side now works. If a future story's AC needs an actual
red/green browser proof, either (a) ask the user to `sbx policy allow network
playwright.download.prss.microsoft.com,cdn.playwright.dev` for that session, or (b) fall back
to the established pattern: build+boot the containers to prove the app-level behavior (e.g. the
CSP header itself, via a raw `curl`/`page.request` HTTP check that doesn't need a browser),
plus code-reasoning for the browser-rendering part, and document the CI expectation explicitly
— this is what Story #1891's CSP-hardening verification did.

## Re-confirmed 2026-08-06 (Issue #2030 session, no container build attempted)

`npx playwright install chromium` still 403s identically on all three mirrors
(`cdn.playwright.dev`, its `dbazure` path, `playwright.download.prss.microsoft.com`) —
`no matching allow rule — blocked by default deny policy`. `chromium-browser --version` still
fails with the same `requires the chromium snap to be installed` message, and there is still no
`snapd` socket/service (`systemctl status snapd` → "System has not been booted with systemd as
init system"). This means a mutation-test AC ("change production code, confirm the E2E test goes
red, revert, confirm byte-identical") cannot be executed live in this sandbox class — do the
edit/observe-would-fail-by-code-reading/revert cycle instead, verify the revert is byte-identical
via `git diff`/`git status` (that part *is* mechanically provable), and state the live-red
confirmation as deferred to CI in the report. Did not attempt the `dhi.io` container build this
session (task didn't need it — pure E2E test-file edits, no app change), so that half of the
2026-07-30 finding is unverified this round; re-attempt it fresh next time a task needs it rather
than assuming either outcome.

## Practical technique: overriding the browser executable without touching committed config

If a real Chromium binary ever IS available (e.g. `sbx policy allow` was granted, or a cached
binary exists), don't edit `e2e/playwright.config.ts` — create a scratch, **never-committed**
sibling config that imports and extends it, point `use.launchOptions.executablePath` at the
real binary for BOTH the `auth-setup` and `desktop` projects (auth-setup has its own separate
`use` block — overriding only `desktop` leaves `auth-setup` still trying to launch the missing
bundled headless-shell binary), run with `--config=<scratch file>`, then delete it before
finishing. Example that worked mechanically (blocked only by the missing real binary, see
above):

```ts
// e2e/playwright.local-verify.config.ts — SCRATCH ONLY, delete before finishing
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const CHROME_OVERRIDE = { executablePath: '/path/to/chromium', args: ['--no-sandbox'] };

export default defineConfig(base, {
  projects: (base.projects || [])
    .filter((p) => p.name === 'auth-setup' || p.name === 'desktop')
    .map((p) => ({
      ...p,
      use: { ...p.use, launchOptions: { ...(p.use?.launchOptions || {}), ...CHROME_OVERRIDE } },
    })),
});
```

Must live inside `e2e/` (not `/tmp`) so the relative `@playwright/test` / `./playwright.config.js`
module resolution works — a file outside the workspace fails with `Cannot find module
'@playwright/test'` even though the import looks correct.

## Re-confirmed 2026-09-06 (Issue #2046 session) — browser download now WORKS, but docker build context transfer newly broken

Both halves of the picture flipped again — re-check both independently every session, don't
assume either from a prior note:

1. **`npx playwright install chromium` succeeded** this session — no network-policy block at all
   (downloaded ffmpeg-1011, chromium_headless_shell-1228, and chromium-1228 fully, all three
   `cdn.playwright.dev`/`playwright.download.prss.microsoft.com` mirrors reachable). A real
   browser binary is available in `~/.cache/ms-playwright/` for the rest of this session.
2. **`docker build -t cornerstone:e2e .` failed immediately**, before even reaching the `dhi.io`
   pull step, with a DIFFERENT error than the historical `401 Unauthorized`:
   ```
   #1 ERROR: error from sender: failed to xattr node_modules: too many levels of symbolic links
   ```
   This is the Docker CLI failing to walk the build context (this worktree's `node_modules/`)
   while collecting file metadata — almost certainly the same class of issue as
   `local-typecheck-unreliable-in-worktrees` (a dangling/circular symlink inside a worktree's
   `node_modules`, this time breaking `docker build`'s context-sender instead of `tsc`). Did not
   attempt to hunt down and remove the specific offending symlink — that risks destabilizing a
   shared `node_modules` other sessions may be using concurrently, and is arguably a workspace
   hygiene issue outside an E2E-test-engineer's remit to silently fix. If a future session needs
   a live container build from a worktree and hits this again, the isolated next step would be
   `find node_modules -xtype l` or `find node_modules -maxdepth 6 -type l -exec test ! -e {} \;
-print` from the worktree root to identify the broken/circular link before deciding whether to
   report it or repair it.

Net effect this session: had a real browser binary but no app image, so still could not do a live
containerized Playwright run — fell back to static verification (lint, prettier, `--list`, and a
direct AC/type-shape diff read) for a same-shape mock-payload fix, which does not need a browser to
validate correctness.

## Cleanup checklist after any live-verification attempt

- `rm` any scratch `playwright.*.config.ts` file.
- `rm -rf e2e/e2e/ e2e/playwright-output/ e2e/playwright-report/ e2e/test-results/` — a
  misconfigured `--config` path or an interrupted run can leave a nested `e2e/e2e/test-results/
.state/containers.json` artifact (from `containers/setup.ts`'s state file) that `git status`
  won't flag as tracked but that still clutters the worktree.
- `docker images` / `docker rmi cornerstone:e2e` if you built a throwaway/deliberately-broken
  image for a red-test proof — a stale local image with the wrong config baked in will silently
  get reused by the next `docker build`'s layer cache or by a teammate's next test run in the
  same sandbox if left in place.
- Confirm `docker ps -a` and `docker network ls` have no leftover test containers/networks —
  the suite's own `globalTeardown` (`e2e/containers/teardown.ts`) handles this on a normal run,
  but verify after any run that errored before reaching teardown.
