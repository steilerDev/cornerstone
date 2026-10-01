/**
 * Jest reporter that records each test file's runtime in seconds.
 *
 * Enabled in CI only (see the `test` job in .github/workflows/ci.yml):
 *   jest --reporters=default --reporters=./scripts/jest-timing-reporter.mjs
 * and writes `{ "<repo-relative path>": seconds }` to $JEST_TIMINGS_FILE when the
 * run completes. Each shard uploads its file as a `jest-timings-shard-N` artifact;
 * scripts/update-jest-timings.mjs merges them into scripts/jest-timings.json, which
 * the duration-aware shard sequencer (scripts/jest-shard-sequencer.mjs) reads.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

export default class JestTimingReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.outputFile = process.env.JEST_TIMINGS_FILE;
    this.timings = {};
  }

  onTestResult(test, testResult) {
    const { start, end, runtime } = testResult.perfStats;
    const ms = runtime ?? end - start;
    const key = relative(this.rootDir, test.path).split('\\').join('/');
    this.timings[key] = Math.round(ms / 100) / 10;
  }

  onRunComplete() {
    if (!this.outputFile) return;
    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, `${JSON.stringify(this.timings, null, 2)}\n`);
  }

  getLastError() {
    return undefined;
  }
}
