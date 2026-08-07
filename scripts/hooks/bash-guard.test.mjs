#!/usr/bin/env node
// Minimal behavioral tests for bash-guard.mjs. Run: node scripts/hooks/bash-guard.test.mjs
// Spawns the hook with a JSON payload on stdin and asserts the exit code.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'bash-guard.mjs');

const push = (rest) => ['git', 'push', ...rest].join(' ');
const cases = [
  // [description, command, expected exit code]
  ['push refspec to beta via refs/heads', push(['origin', 'HEAD:refs/heads/beta']), 2],
  ['push beta directly', push(['origin', 'beta']), 2],
  ['push main via refs/heads', push(['origin', 'refs/heads/main']), 2],
  ['push src:dst onto beta', push(['origin', 'mybranch:beta']), 2],
  ['push worktree branch', push(['-u', 'origin', 'worktree-foo']), 2],
  ['push feature branch', push(['-u', 'origin', 'feat/123-thing']), 0],
  ['push beta-lookalike branch', push(['origin', 'beta-fixes']), 0],
  ['unrelated command', 'ls -la', 0],
];

let failed = 0;
for (const [name, command, expected] of cases) {
  const res = spawnSync('node', [hook], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  const ok = res.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (exit ${res.status}, expected ${expected})`);
}
process.exit(failed > 0 ? 1 : 0);
