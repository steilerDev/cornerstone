#!/usr/bin/env node
// check-all.mjs -- runs every restructure check (the CI entry point, `npm run plan:check`).
//
//   route map        build-routes.mjs    router drift + route-map validation
//   capability map   build-capmap.mjs    placement, click bound, route references
//   pattern baseline build-baseline.mjs  UI pattern counts vs the committed baseline
//   privacy          scan-privacy.mjs    personal data in plan/restructure (profile full)
//
// Every part always runs; the exit code is 1 when any part failed. A missing input file is
// reported as an error naming the file, never as a crash.
//
// Usage: node plan/restructure/scripts/check-all.mjs [--write]
//   --write regenerates router-routes.json, summary.json and baseline.json (npm run plan:build)
// Exit 0 = all ok, 1 = findings, 2 = usage or unexpected IO error.

import { join } from 'node:path';
import { run as runBaseline } from './build-baseline.mjs';
import { run as runCapmap } from './build-capmap.mjs';
import { run as runRoutes } from './build-routes.mjs';
import { REPO_ROOT, isMain } from './lib/io.mjs';
import { scanPaths } from './scan-privacy.mjs';

/**
 * Run every check against a repository root.
 * @param {{ root?: string, mode?: 'check'|'write' }} [opts]
 * @returns {Promise<{ name: string, errors: string[], notes: string[] }[]>}
 */
export async function runAll({ root = REPO_ROOT, mode = 'check' } = {}) {
  const parts = [];
  const guarded = async (name, fn) => {
    try {
      parts.push(await fn());
    } catch (err) {
      parts.push({ name, errors: [`${name} failed unexpectedly: ${err.message}`], notes: [] });
    }
  };

  await guarded('route map', () => runRoutes({ root, mode }));
  await guarded('capability map', () => runCapmap({ root, mode }));
  await guarded('pattern baseline', () => runBaseline({ root, mode }));
  await guarded('privacy', async () => {
    const dir = join(root, 'plan/restructure');
    const errors = scanPaths([dir], { profile: 'full', cwd: root });
    return {
      name: 'privacy',
      errors:
        errors.length > 0 ? [...errors, 'personal data found — use synthetic data only (Q18)'] : [],
      notes: [],
    };
  });
  return parts;
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--write' && a !== '--check');
  if (unknown.length > 0) {
    console.error(`check-all: unknown argument ${unknown[0]} (use --check or --write)`);
    process.exit(2);
  }
  const parts = await runAll({ mode: args.includes('--write') ? 'write' : 'check' });
  let failed = 0;
  for (const part of parts) {
    console.log(`\n== ${part.name} ==`);
    part.notes.forEach((n) => console.log(n));
    if (part.errors.length > 0) {
      failed++;
      part.errors.forEach((e) => console.log(`  ERROR ${e}`));
    } else {
      console.log('  ok');
    }
  }
  console.log(failed > 0 ? `\nplan:check failed (${failed} part(s))` : '\nplan:check passed');
  process.exit(failed > 0 ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
