---
name: issue-2101-infinite-scroll-tests
description: Issue #2101 Paperless infinite-scroll test patterns and the ts-node-less jest invocation workaround
metadata:
  type: project
---

**Jest without ts-node:** on Node 22 with no `ts-node` installed, `npx jest` fails parsing `jest.config.ts`. Workaround: transpile the config with `typescript` (`ts.transpileModule`, module ESNext) to an untracked `jest.local.config.mjs` at the repo root, run `NODE_OPTIONS=--experimental-vm-modules npx jest -c jest.local.config.mjs <file> --maxWorkers=1`, delete it afterwards.

**Sandbox guard:** in a worktree-isolated session, Bash commands that chain `cd ../..`, use `sed` with a shell variable as the target, or embed long heredocs are refused as "too complex". Write scripts to the scratchpad with the Write tool and run them by absolute path; use Edit for small changes.

**Mutation-runner pattern:** a scratchpad python script that patches one production line, runs the relevant test files, restores in `finally`, and prints failing test names proves each assertion is discriminating (15 mutations on #2101, all killed).

**Act warnings:** tests that toggle filters must `await waitFor(listStatus === 'done')` before ending, otherwise the in-flight refetch resolves outside act. Never hold two `renderHook` instances mounted while awaiting the second.

**Mocked react-i18next returns raw keys** (InvoicePaperlessPickerModal.test.tsx), so DocumentCard's aria-label is a key; locate cards via the `h3` title heading `.closest('[role="button"]')`.

**How to apply:** reuse the integration harness in `client/src/components/documents/DocumentBrowser.infiniteScroll.test.tsx` (MockIntersectionObserver with `options`, `intersect()` helper, server-like `serve()` pager, `deferred()`) for any future infinite-scroll consumer.
