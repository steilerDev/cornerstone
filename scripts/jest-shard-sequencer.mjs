/**
 * Duration-aware Jest test sequencer.
 *
 * Jest's default `--shard` splits test FILES by path hash, ignoring runtime, so CI
 * shards ranged from 8 to 42 minutes: whichever shard drew the picker-family
 * component tests became the long pole. This sequencer instead packs files into
 * shards by their recorded runtime (scripts/jest-timings.json) using greedy
 * longest-processing-time-first bin packing, which keeps shards within seconds
 * of each other.
 *
 * - shard(): every shard computes the same deterministic assignment (weight desc,
 *   then path asc; ties go to the lowest-index bin) and keeps its own bin.
 * - time(): falls back to the recorded runtime when Jest has no local cache entry
 *   (always the case on a fresh CI runner), so the built-in sort still starts the
 *   longest files first instead of ordering by file size.
 *
 * Files missing from the timings file get DEFAULT_SECONDS. Refresh the timings
 * after test-suite changes with `node scripts/update-jest-timings.mjs <run-id>`.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import TestSequencer from '@jest/test-sequencer';

const BaseSequencer = TestSequencer.default ?? TestSequencer;

const DEFAULT_SECONDS = 5;

function loadTimings() {
  try {
    const url = new URL('./jest-timings.json', import.meta.url);
    return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
  } catch {
    return {};
  }
}

const timings = loadTimings();

function weightSeconds(test) {
  const key = relative(test.context.config.rootDir, test.path).split('\\').join('/');
  return timings[key] ?? DEFAULT_SECONDS;
}

export default class DurationShardSequencer extends BaseSequencer {
  shard(tests, { shardIndex, shardCount }) {
    const ordered = [...tests].sort(
      (a, b) => weightSeconds(b) - weightSeconds(a) || (a.path < b.path ? -1 : 1),
    );
    const loads = new Array(shardCount).fill(0);
    const selected = [];
    for (const test of ordered) {
      let bin = 0;
      for (let i = 1; i < shardCount; i++) {
        if (loads[i] < loads[bin]) bin = i;
      }
      loads[bin] += weightSeconds(test);
      if (bin === shardIndex - 1) selected.push(test);
    }
    return selected;
  }

  time(test) {
    return super.time(test) ?? weightSeconds(test) * 1000;
  }
}
