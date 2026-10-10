#!/usr/bin/env node
// check-defects.mjs -- every Phase-0 defect id is named by an existing test.
//
// plan/restructure/defects.json lists each Phase-0 defect id (ids, story numbers and repo paths
// only) with the test files that cover it. Each listed file must exist and name the id as a
// whole token, so a test cannot be deleted or renamed without the registry noticing.
//
// Usage: node plan/restructure/scripts/check-defects.mjs
// Exit 0 = ok, 1 = findings.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, isMain } from './lib/io.mjs';

export const DEFECT_ID = /^D-\d{2}$/;
const TEST_FILE = /\.(test\.(ts|tsx|mjs)|spec\.ts)$/;
const REGISTRY = 'plan/restructure/defects.json';

/**
 * @param {string} path repo-relative path
 * @returns {boolean} true when the path stays inside the repository
 */
function isRepoRelative(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.split(/[\\/]/).includes('..')
  );
}

/**
 * Check the defect registry against the repository.
 * @param {{ root?: string, mode?: 'check'|'write' }} [opts] mode is accepted for signature
 *   parity with the other parts; nothing is generated.
 * @returns {Promise<{ name: 'defects', errors: string[], notes: string[] }>}
 */
export async function run({ root = REPO_ROOT } = {}) {
  const errors = [];
  const notes = [];
  const registryPath = join(root, REGISTRY);

  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (err) {
    const why = err.code === 'ENOENT' ? 'is missing' : `is not valid JSON (${err.message})`;
    return { name: 'defects', errors: [`${REGISTRY} ${why}`], notes };
  }

  const defects = Array.isArray(registry?.defects) ? registry.defects : [];
  const later = Array.isArray(registry?.later) ? registry.later : [];
  if (!Array.isArray(registry?.defects)) errors.push(`${REGISTRY}: "defects" must be an array`);

  const seen = new Set();
  const files = new Set();
  const cache = new Map();

  for (const entry of [...defects, ...later]) {
    const id = entry?.id;
    if (typeof id !== 'string' || !DEFECT_ID.test(id)) {
      errors.push(`${REGISTRY}: invalid defect id ${JSON.stringify(id)} (expected D-NN)`);
      continue;
    }
    if (seen.has(id)) errors.push(`${id}: listed more than once`);
    seen.add(id);
  }

  // The ids must be contiguous from D-01 to the highest one, so deleting an entry is noticed.
  const numbers = [...seen].map((id) => Number(id.slice(2)));
  const highest = numbers.length > 0 ? Math.max(...numbers) : 0;
  const missing = [];
  for (let n = 1; n <= highest; n++) {
    const id = `D-${String(n).padStart(2, '0')}`;
    if (!seen.has(id)) missing.push(id);
  }
  if (missing.length > 0) {
    errors.push(
      `${REGISTRY}: ids must cover D-01 to D-${String(highest).padStart(2, '0')} without gaps; missing ${missing.join(', ')}`,
    );
  }

  for (const entry of defects) {
    const id = entry?.id;
    if (typeof id !== 'string' || !DEFECT_ID.test(id)) continue;
    if (!Number.isInteger(entry.story) || entry.story <= 0) {
      errors.push(`${id}: story must be a positive integer`);
    }
    if (!Array.isArray(entry.tests) || entry.tests.length === 0) {
      errors.push(`${id}: tests must be a non-empty array of test file paths`);
      continue;
    }
    const token = new RegExp(`(^|[^A-Za-z0-9-])${id}(?![0-9])`);
    for (const file of entry.tests) {
      if (!isRepoRelative(file)) {
        errors.push(`${id}: ${JSON.stringify(file)} is not a repo-relative path`);
        continue;
      }
      if (!TEST_FILE.test(file)) {
        errors.push(`${id}: ${file} is not a test file (*.test.ts|tsx|mjs, *.spec.ts)`);
        continue;
      }
      const abs = join(root, file);
      if (!existsSync(abs)) {
        errors.push(`${id}: ${file} does not exist`);
        continue;
      }
      files.add(file);
      if (!cache.has(abs)) cache.set(abs, readFileSync(abs, 'utf8'));
      if (!token.test(cache.get(abs))) errors.push(`${id}: ${file} does not name ${id}`);
    }
  }

  notes.push(`defects: ${defects.length} Phase-0 ids, ${files.size} test files`);
  return { name: 'defects', errors, notes };
}

async function main() {
  const part = await run();
  part.notes.forEach((n) => console.log(n));
  part.errors.forEach((e) => console.log(`  ERROR ${e}`));
  if (part.errors.length === 0) console.log('  ok');
  process.exit(part.errors.length > 0 ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
