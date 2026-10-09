// io.mjs -- shared file helpers for the restructure tooling.
// Pure helpers; every function takes explicit paths so tests can pass fixtures.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Repository root (this file lives in plan/restructure/scripts/lib). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Directory holding the curated and generated restructure data. */
export const RESTRUCTURE_DIR = resolve(REPO_ROOT, 'plan/restructure');

/**
 * Read and parse a JSON file.
 * @param {string} path
 * @returns {any}
 */
export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Serialise data as JSON formatted with the repository's Prettier configuration,
 * so generated files are byte-identical to what `npm run format` would produce.
 * @param {string} path target path (used to resolve the Prettier config)
 * @param {unknown} data
 * @returns {Promise<string>}
 */
export async function formatJson(path, data) {
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(path)) ?? {};
  return prettier.format(JSON.stringify(data), { ...config, parser: 'json', filepath: path });
}

/**
 * Write content to a file, or in check mode compare it with what is on disk.
 * @param {string} path
 * @param {string} content
 * @param {'write'|'check'} mode
 * @returns {{ ok: boolean, changed: boolean }} `ok` is false only in check mode when the file differs
 */
export function writeOrCheck(path, content, mode) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const changed = current !== content;
  if (mode === 'write') {
    if (changed) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    return { ok: true, changed };
  }
  return { ok: !changed, changed };
}

/**
 * True when the module is the process entry point (CLI invocation).
 * @param {string} metaUrl `import.meta.url` of the calling module
 * @returns {boolean}
 */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}
