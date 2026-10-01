#!/usr/bin/env node
/**
 * Refreshes scripts/jest-timings.json from a CI run's per-shard timing artifacts.
 *
 * Usage: node scripts/update-jest-timings.mjs <ci-run-id>
 *
 * Downloads every `jest-timings-shard-*` artifact of the given run (requires the
 * `gh` CLI), merges them, drops entries for test files that no longer exist, and
 * rewrites scripts/jest-timings.json with sorted keys. Commit the result whenever
 * shards drift apart (e.g. after adding or splitting a slow test file).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node scripts/update-jest-timings.mjs <ci-run-id>');
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, '..');
const outputFile = join(repoRoot, 'scripts', 'jest-timings.json');
const downloadDir = mkdtempSync(join(tmpdir(), 'jest-timings-'));

try {
  execFileSync('gh', ['run', 'download', runId, '-p', 'jest-timings-shard-*', '-D', downloadDir], {
    stdio: 'inherit',
  });

  const merged = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.json')) Object.assign(merged, JSON.parse(readFileSync(path)));
    }
  };
  walk(downloadDir);

  const kept = Object.keys(merged)
    .filter((file) => existsSync(join(repoRoot, file)))
    .sort();
  if (kept.length === 0) {
    console.error(`No timing data found in run ${runId}; leaving ${outputFile} untouched.`);
    process.exit(1);
  }

  const timings = Object.fromEntries(kept.map((file) => [file, merged[file]]));
  writeFileSync(outputFile, `${JSON.stringify(timings, null, 2)}\n`);
  const total = kept.reduce((sum, file) => sum + timings[file], 0);
  console.log(`Wrote ${kept.length} timings (${Math.round(total)} s total) to ${outputFile}`);
} finally {
  rmSync(downloadDir, { recursive: true, force: true });
}
