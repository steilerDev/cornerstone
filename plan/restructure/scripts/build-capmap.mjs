#!/usr/bin/env node
// build-capmap.mjs -- validates the capability map (plan/restructure/capmap.json) against the
// capability inventory and the route map, and generates plan/restructure/summary.json.
//
// Rules: ADR-038 section 4 (reachability: every capability has a placement, clicks <= 2) and
// section 5 (click-counting rule). Never hand-edit summary.json.
// Usage: node plan/restructure/scripts/build-capmap.mjs [--check|--write]
// Exit 0 = ok, 1 = drift or validation errors, 2 = usage or IO error.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { baseFroms } from './build-routes.mjs';
import { REPO_ROOT, formatJson, isMain, readJson, writeOrCheck } from './lib/io.mjs';

export const PLACEMENT_CHANGES = [
  'same',
  'demoted',
  'promoted',
  'consolidated-entry-points',
  'merged',
  'moved',
];
export const CAPMAP_GATES = ['none', 'paperless', 'paperless+ai', 'ai', 'oidc'];
export const MAX_CLICKS = 2;

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Number of clicks a click path claims: split alternatives on `;`, take the highest `(n)` step
 * marker of each, and return the minimum over the alternatives.
 * @param {string} clickPath
 * @returns {number}
 */
export function clicksFromPath(clickPath) {
  const counts = String(clickPath)
    .split(';')
    .map((alt) => {
      const markers = [...alt.matchAll(/\((\d+)\)/g)].map((m) => Number(m[1]));
      return markers.length > 0 ? Math.max(...markers) : 0;
    });
  return Math.min(...counts);
}

/**
 * App paths named in parentheses in a `to` text, e.g. "Tasks > Tasks list (/project/work-items)".
 * @param {string} to
 * @returns {string[]}
 */
export function pathsInTo(to) {
  return [...String(to).matchAll(/\((\/[A-Za-z0-9/_:.-]*)/g)].map((m) =>
    m[1].replace(/[:.]+$/, '').replace(/[?#].*$/, ''),
  );
}

/** Segment-wise path match; `:param` matches any segment in either direction. */
export function pathsMatch(a, b) {
  const sa = a.split('/');
  const sb = b.split('/');
  if (sa.length !== sb.length) return false;
  return sa.every((seg, i) => seg === sb[i] || seg.startsWith(':') || sb[i].startsWith(':'));
}

function routePatterns(routemap) {
  const patterns = new Set();
  for (const e of routemap ?? []) {
    if (e?.kind === 'page' && nonEmpty(e.from)) baseFroms(e.from).forEach((p) => patterns.add(p));
    if (nonEmpty(e?.to)) baseFroms(e.to).forEach((p) => patterns.add(p));
  }
  return [...patterns].filter((p) => p.startsWith('/'));
}

/**
 * @param {{ inventory: any[], capmap: Record<string, any>, routemap: any[] }} input
 * @returns {string[]} error messages (empty when valid)
 */
export function validateCapmap({ inventory, capmap, routemap }) {
  const errors = [];
  if (!Array.isArray(inventory)) return ['capabilities.json must be an array'];
  if (!capmap || typeof capmap !== 'object' || Array.isArray(capmap)) {
    return ['capmap.json must be an object keyed by capability id'];
  }
  const ids = new Set(inventory.map((c) => c?.id));
  const patterns = routePatterns(routemap);

  for (const id of [...ids].sort()) {
    if (!(id in capmap)) errors.push(`capability ${id} has no placement`);
  }
  for (const id of Object.keys(capmap).sort()) {
    if (!ids.has(id)) errors.push(`capmap key ${id} is not in capabilities.json`);
  }

  for (const [id, entry] of Object.entries(capmap)) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`capability ${id} has no placement`);
      continue;
    }
    if (!nonEmpty(entry.to) || !PLACEMENT_CHANGES.includes(entry.change)) {
      errors.push(`capability ${id} has no placement`);
    }
    if (!CAPMAP_GATES.includes(entry.gate)) {
      errors.push(`${id} gate must be one of ${CAPMAP_GATES.join(', ')}`);
    }
    if (!nonEmpty(entry.name)) errors.push(`${id} name must not be empty`);
    if (!nonEmpty(entry.from)) errors.push(`${id} from must not be empty`);

    const hasClicks = entry.clicks !== undefined && entry.clicks !== null;
    if (hasClicks) {
      if (!Number.isInteger(entry.clicks) || entry.clicks < 0) {
        errors.push(`${id} clicks must be an integer between 0 and ${MAX_CLICKS}`);
      } else if (entry.clicks > MAX_CLICKS) {
        errors.push(`${id} clicks ${entry.clicks} exceeds the bound ${MAX_CLICKS}`);
      }
      if (!nonEmpty(entry.clickPath)) {
        errors.push(`${id} has clicks but no clickPath`);
      } else {
        const derived = clicksFromPath(entry.clickPath);
        if (derived > MAX_CLICKS && !(entry.clicks > MAX_CLICKS)) {
          errors.push(`${id} clicks ${derived} exceeds the bound ${MAX_CLICKS}`);
        } else if (Number.isInteger(entry.clicks) && derived !== entry.clicks) {
          errors.push(`${id} clicks ${entry.clicks} does not match its clickPath (${derived})`);
        }
      }
    } else if (entry.change === 'demoted') {
      errors.push(`${id} is demoted but has no clicks`);
    }

    if (nonEmpty(entry.to)) {
      for (const p of pathsInTo(entry.to)) {
        if (!patterns.some((pattern) => pathsMatch(p, pattern))) {
          errors.push(`${id} destination path ${p} is not in the route map`);
        }
      }
    }
  }
  return errors;
}

function tally(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** Text before the first " > " of a destination. */
export function destinationSection(to) {
  return String(to).split(' > ')[0].trim();
}

/**
 * Deterministic summary of the capability map and route map.
 * @param {{ inventory: any[], capmap: Record<string, any>, routemap: any[] }} input
 */
export function summarize({ inventory, capmap, routemap }) {
  const entries = Object.entries(capmap);
  const domainOf = new Map(inventory.map((c) => [c.id, c.domain]));
  const freqOf = new Map(inventory.map((c) => [c.id, c.frequency]));
  const clickValues = entries
    .filter(([, e]) => e.clicks !== undefined && e.clicks !== null)
    .map(([, e]) => String(e.clicks));
  const settingsDailyWeekly = entries.filter(
    ([id, e]) =>
      ['daily', 'weekly'].includes(freqOf.get(id)) && destinationSection(e.to) === 'Settings',
  ).length;

  return {
    schemaVersion: 1,
    capabilities: {
      total: entries.length,
      byChange: tally(entries.map(([, e]) => e.change)),
      byGate: tally(entries.map(([, e]) => e.gate)),
      byDestinationSection: tally(entries.map(([, e]) => destinationSection(e.to))),
      byDomain: tally(entries.map(([id]) => domainOf.get(id) ?? 'unknown')),
      clicksHistogram: tally(clickValues),
      dailyWeeklyInSettings: settingsDailyWeekly,
    },
    routes: {
      total: routemap.length,
      byKind: tally(routemap.map((e) => e.kind)),
      byChange: tally(routemap.map((e) => e.change)),
      bySection: tally(routemap.map((e) => e.section)),
      permanent: routemap
        .filter((e) => e.permanent === true)
        .map((e) => e.from)
        .sort(),
    },
  };
}

/**
 * @param {{ root?: string, mode?: 'check'|'write' }} [opts]
 * @returns {Promise<{ name: string, errors: string[], notes: string[] }>}
 */
export async function run({ root = REPO_ROOT, mode = 'check' } = {}) {
  const name = 'capability map';
  const dir = join(root, 'plan/restructure');
  const inputs = ['capabilities.json', 'capmap.json', 'routemap.json'];
  const missing = inputs.filter((f) => !existsSync(join(dir, f)));
  if (missing.length > 0) {
    return {
      name,
      errors: missing.map((f) => `input missing: plan/restructure/${f} (curated data)`),
      notes: [],
    };
  }
  const data = {
    inventory: readJson(join(dir, 'capabilities.json')),
    capmap: readJson(join(dir, 'capmap.json')),
    routemap: readJson(join(dir, 'routemap.json')),
  };
  const errors = validateCapmap(data);
  const notes = [];
  if (errors.length > 0) return { name, errors, notes };

  const summary = summarize(data);
  const outPath = join(dir, 'summary.json');
  const res = writeOrCheck(outPath, await formatJson(outPath, summary), mode);
  if (!res.ok) errors.push('summary.json is stale — run npm run plan:build');
  else if (mode === 'write' && res.changed) notes.push('summary.json written');
  notes.push(`${summary.capabilities.total} capabilities placed`);
  return { name, errors, notes };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--check' && a !== '--write');
  if (unknown.length > 0) {
    console.error(`build-capmap: unknown argument ${unknown[0]} (use --check or --write)`);
    process.exit(2);
  }
  try {
    const result = await run({ mode: args.includes('--write') ? 'write' : 'check' });
    result.notes.forEach((n) => console.log(n));
    result.errors.forEach((e) => console.error(e));
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`build-capmap: ${err.message}`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) await main();
