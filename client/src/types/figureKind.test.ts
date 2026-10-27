import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Figure-consistency guard (#2232). Every UI element that shows a Left to spend, Still to pay,
 * Paid or Ready to submit figure, or a holds-up sentence, marks it with `data-figure="<kind>"`
 * (or, on `StatTile`, `figureKind="<kind>"`). The E2E registry (`e2e/fixtures/figureSurfaces.ts`)
 * reads those markers. This test keeps the set of files that carry a marker, and the set of kinds
 * they use, a closed, reviewed list: a new surface is registered in the E2E registry first and
 * added to `FIGURE_FILES` here second.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLIENT_SRC = path.join(REPO_ROOT, 'client/src');

/** Mirrors client/src/types/figureKind.ts (closed list). */
const FIGURE_KINDS = [
  'left-to-spend',
  'still-to-pay',
  'paid',
  'ready-to-submit',
  'holds-up',
] as const;

/** The non-test client files that may carry a figure marker. */
const FIGURE_FILES = [
  'client/src/components/AttentionList/AttentionRowView.tsx',
  'client/src/components/GanttChart/GanttTooltip.tsx',
  'client/src/components/MoneyFigure/MoneyFigure.tsx',
  'client/src/components/StatTile/StatTile.tsx',
  'client/src/components/SummaryStrip/SummaryStrip.tsx',
  'client/src/pages/BudgetOverviewPage/BudgetOverviewPage.tsx',
  'client/src/pages/BudgetSourcesPage/FinancingSourceCard.tsx',
  'client/src/pages/HomePage/PulseSection.tsx',
  'client/src/pages/InvoicesPage/InvoicesPage.tsx',
  'client/src/pages/VendorDetailPage/VendorDetailPage.tsx',
] as const;

const REGISTER_HINT =
  'Register the surface in e2e/fixtures/figureSurfaces.ts, then add the file here.';

/** `data-figure="x"`, `figureKind="x"`, and `data-figure={...}` / `figureKind={...}` expressions. */
const MARKER_RE = /\b(?:data-figure|figureKind)=(?:"([^"]*)"|\{([^{}]*)\})/g;

/** Every string literal kind a marker attribute can resolve to in `source`. */
function markerKinds(source: string): string[] {
  const kinds: string[] = [];
  for (const match of source.matchAll(MARKER_RE)) {
    if (match[1] !== undefined) {
      kinds.push(match[1]);
      continue;
    }
    for (const literal of (match[2] ?? '').matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)`/g)) {
      kinds.push(literal[1] ?? literal[2] ?? literal[3] ?? '');
    }
  }
  return kinds;
}

function hasMarker(source: string): boolean {
  return /\b(?:data-figure|figureKind)=/.test(source);
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join('/');

const scanned = walk(CLIENT_SRC).map((file) => ({
  file: rel(file),
  source: fs.readFileSync(file, 'utf8'),
}));

describe('figure marker scanner', () => {
  it('reads literal attribute values', () => {
    expect(markerKinds('<span data-figure="paid">1</span>')).toEqual(['paid']);
    expect(markerKinds('<StatTile figureKind="still-to-pay" />')).toEqual(['still-to-pay']);
  });

  it('reads every string literal inside an expression', () => {
    expect(markerKinds("<span data-figure={x ? 'holds-up' : undefined} />")).toEqual(['holds-up']);
    expect(markerKinds('<span data-figure={a ? "paid" : "left-to-spend"} />')).toEqual([
      'paid',
      'left-to-spend',
    ]);
  });

  it('reads no kind from a pass-through expression', () => {
    expect(markerKinds('<span data-figure={figureKind} />')).toEqual([]);
    expect(hasMarker('<span data-figure={figureKind} />')).toBe(true);
  });

  it('finds nothing in a file without markers', () => {
    expect(markerKinds('<span className="x" />')).toEqual([]);
    expect(hasMarker('<span className="x" />')).toBe(false);
  });
});

describe('figure marker guard (#2232)', () => {
  it('scans a realistic number of client files (the walk is not vacuous)', () => {
    expect(scanned.length).toBeGreaterThan(100);
  });

  it('keeps the registered file list free of duplicates and sorted', () => {
    expect(new Set(FIGURE_FILES).size).toBe(FIGURE_FILES.length);
    expect([...FIGURE_FILES]).toEqual([...FIGURE_FILES].sort());
  });

  it('carries markers in exactly the registered files', () => {
    const actual = scanned
      .filter((f) => hasMarker(f.source))
      .map((f) => f.file)
      .sort();
    const unregistered = actual.filter((f) => !(FIGURE_FILES as readonly string[]).includes(f));
    const missing = FIGURE_FILES.filter((f) => !actual.includes(f));
    expect({
      unregistered,
      missing,
      hint: unregistered.length > 0 ? REGISTER_HINT : undefined,
    }).toEqual({ unregistered: [], missing: [], hint: undefined });
  });

  it('every registered file exists', () => {
    for (const file of FIGURE_FILES) {
      expect(fs.existsSync(path.join(REPO_ROOT, file))).toBe(true);
    }
  });

  it('uses only kinds from the closed FigureKind list', () => {
    const unknown = scanned.flatMap((f) =>
      markerKinds(f.source)
        .filter((kind) => !(FIGURE_KINDS as readonly string[]).includes(kind))
        .map((kind) => `${f.file}: ${kind}`),
    );
    expect(unknown).toEqual([]);
  });

  it('uses every kind in the list that the UI can produce today', () => {
    const used = new Set(scanned.flatMap((f) => markerKinds(f.source)));
    // Every kind is live: `paid` and `ready-to-submit` are on the Financing source card (#2242).
    for (const kind of FIGURE_KINDS) {
      expect(used).toContain(kind);
    }
  });

  it('mirrors the FigureKind union in figureKind.ts exactly', () => {
    const source = fs.readFileSync(path.join(CLIENT_SRC, 'types/figureKind.ts'), 'utf8');
    const union = /export type FigureKind =([^;]+);/.exec(source);
    expect(union).not.toBeNull();
    const declared = [...union![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(declared).toEqual([...FIGURE_KINDS]);
  });

  it('keeps the closed list in the StatTile prop type, not a free string', () => {
    const statTile = scanned.find((f) => f.file === 'client/src/components/StatTile/StatTile.tsx');
    expect(statTile?.source).toMatch(/figureKind\?: FigureKind;/);
  });
});
