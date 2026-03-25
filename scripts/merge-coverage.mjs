#!/usr/bin/env node
/**
 * Merges Istanbul JSON coverage files produced by Jest shards.
 *
 * Usage: node scripts/merge-coverage.mjs <input-dir> [output-dir]
 *
 * - <input-dir>: directory containing coverage-final.json files from each shard
 * - [output-dir]: directory for merged output (default: coverage/)
 *
 * Outputs:
 * - coverage-final.json  — merged Istanbul coverage data
 * - coverage-summary.json — per-file and total coverage percentages
 *
 * No external dependencies required — uses only Node.js built-ins and the
 * Istanbul JSON format that Jest produces natively.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const inputDir = resolve(process.argv[2] || 'coverage-parts');
const outputDir = resolve(process.argv[3] || 'coverage');

if (!existsSync(inputDir)) {
  console.error(`Input directory not found: ${inputDir}`);
  process.exit(1);
}
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Read and merge all shard coverage JSON files
// ---------------------------------------------------------------------------

const merged = {};
const files = readdirSync(inputDir).filter((f) => f.endsWith('.json'));

if (files.length === 0) {
  console.error(`No JSON files found in ${inputDir}`);
  process.exit(1);
}

for (const file of files) {
  const data = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  for (const [filePath, fileCoverage] of Object.entries(data)) {
    if (!merged[filePath]) {
      merged[filePath] = structuredClone(fileCoverage);
      continue;
    }
    // Merge statement counts (s)
    for (const [id, count] of Object.entries(fileCoverage.s || {})) {
      merged[filePath].s[id] = (merged[filePath].s[id] || 0) + count;
    }
    // Merge function counts (f)
    for (const [id, count] of Object.entries(fileCoverage.f || {})) {
      merged[filePath].f[id] = (merged[filePath].f[id] || 0) + count;
    }
    // Merge branch counts (b) — arrays of hit counts per branch arm
    for (const [id, counts] of Object.entries(fileCoverage.b || {})) {
      if (!merged[filePath].b[id]) {
        merged[filePath].b[id] = [...counts];
      } else {
        merged[filePath].b[id] = merged[filePath].b[id].map((v, i) => v + (counts[i] || 0));
      }
    }
  }
}

writeFileSync(join(outputDir, 'coverage-final.json'), JSON.stringify(merged));

// ---------------------------------------------------------------------------
// 2. Compute per-file and total summary
// ---------------------------------------------------------------------------

const pct = (covered, total) => (total === 0 ? 100 : parseFloat(((covered / total) * 100).toFixed(2)));

const fileSummaries = {};
let totalS = 0,
  coveredS = 0;
let totalB = 0,
  coveredB = 0;
let totalF = 0,
  coveredF = 0;
let totalL = 0,
  coveredL = 0;

for (const [filePath, fc] of Object.entries(merged)) {
  let fS = 0,
    cS = 0,
    fB = 0,
    cB = 0,
    fF = 0,
    cF = 0,
    fL = 0,
    cL = 0;

  // Statements
  for (const count of Object.values(fc.s || {})) {
    fS++;
    if (count > 0) cS++;
  }
  // Functions
  for (const count of Object.values(fc.f || {})) {
    fF++;
    if (count > 0) cF++;
  }
  // Branches
  for (const counts of Object.values(fc.b || {})) {
    for (const count of counts) {
      fB++;
      if (count > 0) cB++;
    }
  }
  // Lines (derived from statementMap)
  const lineHits = {};
  if (fc.statementMap) {
    for (const [id, range] of Object.entries(fc.statementMap)) {
      const line = range.start.line;
      lineHits[line] = Math.max(lineHits[line] || 0, fc.s[id] || 0);
    }
  }
  for (const hit of Object.values(lineHits)) {
    fL++;
    if (hit > 0) cL++;
  }

  fileSummaries[filePath] = {
    statements: { total: fS, covered: cS, pct: pct(cS, fS) },
    branches: { total: fB, covered: cB, pct: pct(cB, fB) },
    functions: { total: fF, covered: cF, pct: pct(cF, fF) },
    lines: { total: fL, covered: cL, pct: pct(cL, fL) },
  };

  totalS += fS;
  coveredS += cS;
  totalB += fB;
  coveredB += cB;
  totalF += fF;
  coveredF += cF;
  totalL += fL;
  coveredL += cL;
}

const summary = {
  total: {
    statements: { total: totalS, covered: coveredS, pct: pct(coveredS, totalS) },
    branches: { total: totalB, covered: coveredB, pct: pct(coveredB, totalB) },
    functions: { total: totalF, covered: coveredF, pct: pct(coveredF, totalF) },
    lines: { total: totalL, covered: coveredL, pct: pct(coveredL, totalL) },
  },
  ...fileSummaries,
};

writeFileSync(join(outputDir, 'coverage-summary.json'), JSON.stringify(summary, null, 2));

// ---------------------------------------------------------------------------
// 3. Print text summary
// ---------------------------------------------------------------------------

const pad = (s, n) => String(s).padStart(n);

console.log(`\nCoverage Report (${files.length} shards merged, ${Object.keys(merged).length} files)\n`);
console.log('Category     | Coverage | Covered / Total');
console.log('-------------|----------|----------------');
console.log(`Statements   | ${pad(summary.total.statements.pct.toFixed(2), 7)}% | ${coveredS} / ${totalS}`);
console.log(`Branches     | ${pad(summary.total.branches.pct.toFixed(2), 7)}% | ${coveredB} / ${totalB}`);
console.log(`Functions    | ${pad(summary.total.functions.pct.toFixed(2), 7)}% | ${coveredF} / ${totalF}`);
console.log(`Lines        | ${pad(summary.total.lines.pct.toFixed(2), 7)}% | ${coveredL} / ${totalL}`);
console.log('');
