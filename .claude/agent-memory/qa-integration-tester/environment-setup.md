# Environment & Worktree Setup Notes (living doc)

> Gotchas specific to running tests inside a git worktree in this sandbox (ARM64 crashes, @cornerstone/shared symlink issues, definitive jest invocation pattern, schema quirks). Not dated — update in place.

## Running Tests from a Worktree (Critical Pattern)

Worktrees have no `node_modules`. To run tests from a worktree:

1. Create symlinks: `ln -sf /main/node_modules /worktree/node_modules` and `ln -sf /main/server/node_modules /worktree/server/node_modules`
2. Run from the WORKTREE directory: `node --experimental-vm-modules /main/node_modules/.bin/jest "path/to/test.ts" --no-coverage`
3. **This worktree already has node_modules** — node_modules are present in the worktree directly. Run jest directly without symlink step.
4. **SIGILL (exit 132) crash**: In sandbox environments, Jest may crash with SIGILL when spawning worker processes (due to CPU instruction set incompatibility). If `--maxWorkers=1` still crashes, tests cannot be run locally — commit and rely on CI. The pre-commit hook will also show SIGILL errors but still creates the commit.

## EPIC-04 Worktree @cornerstone/shared Symlink Fix

When testing new stories that add types to `shared/`, the worktree's `node_modules/@cornerstone/shared` symlink resolves to the **main repo's shared** (not the worktree's). The main repo won't have the new types built yet.

**Fix**: Update the symlink to point to the worktree's own shared directory:

```bash
rm node_modules/@cornerstone/shared
ln -s /absolute/path/to/worktree/shared node_modules/@cornerstone/shared
```

Also rebuild the worktree's shared: `node_modules/.bin/tsc -p shared/tsconfig.json`

Do NOT use `import type { Foo } from '@cornerstone/shared'` in test files if Foo is a newly added type — instead use `Parameters<typeof service.method>[N]` to derive types from the service function signatures.

## Schema Quirk: tags table has NO updated_at

The `tags` table (migration 0002) only has: `id, name, color, created_at` — NO `updated_at`. `TagResponse` also has no `updatedAt`. Do not include this field in test inserts or type assertions.

- Do NOT cast `mockGet.mock.calls[0] as [string]` — TypeScript strict mode rejects empty arrays cast to tuple. Use `expect(mockGet).not.toHaveBeenCalledWith(expect.stringContaining(...))` pattern instead.

## Worktree Test Execution — ARM64 Crash and Shared Types

### ARM64 / SIGKILL (server tests with better-sqlite3)

- Server tests (all `server/src/services/*.test.ts`) get SIGKILL'd in the sandbox (ARM64 emulation).
- **Client tests** (jsdom, no native binary) run fine: `npx jest "Name" --no-coverage --testEnvironment=jsdom`
- Server tests MUST be validated via CI (ubuntu-latest, x86_64). Do not run them locally.
- The pre-commit hook and CI both run them successfully on the x86 CI machine.

### Stale @cornerstone/shared dist in Worktrees

- Worktrees share the main project's `node_modules` (symlink to `../../shared`).
- When a worktree branch adds fields to shared types (e.g., `vendorName` on `Invoice`), the main project's `shared/dist` is STALE — the symlink points to main project's compiled output which doesn't have the new field.
- Fix: copy the updated dist files from worktree to main project's shared/dist:
  ```bash
  cp worktree/shared/dist/types/invoice.d.ts mainproject/shared/dist/types/invoice.d.ts
  cp worktree/shared/dist/index.d.ts mainproject/shared/dist/index.d.ts
  ```
- The pre-commit hook automatically rebuilds shared (`npm run build -w shared`) before typechecking, so committing works correctly even when local test runs fail due to stale types.

## Worktree Jest Execution — Definitive Pattern

When running Jest from a worktree (no local node_modules):

```bash
NODE_PATH=/path/to/cornerstone/server/node_modules:/path/to/cornerstone/client/node_modules \
/usr/bin/node --experimental-vm-modules \
/path/to/cornerstone/node_modules/.bin/jest \
<test-file> --no-coverage \
--rootDir /path/to/worktree
```

- **Never `npm install` in a worktree** — installs ARM64-incompatible binaries → `Illegal instruction` (SIGKILL)
- If worktree has stale `node_modules`, remove them: `rm -rf /worktree/node_modules`
- **Stale shared dist**: worktrees share main project's `node_modules/@cornerstone/shared → ../../shared`
  → After changing `shared/src/types/`, rebuild main project's dist OR copy worktree dist files:
  `cp -r /worktree/shared/dist /path/to/cornerstone/shared/`
- Server tests (better-sqlite3 native binary) may SIGKILL on ARM64 sandbox — validate via CI if needed

