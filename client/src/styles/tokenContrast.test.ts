import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Colour-contrast guard for the design tokens and every same-rule colour/background pair
 * (#2200, D-26). The jest CSS-module mock returns class names as keys, so the real values
 * are read from the source CSS on disk. Pure `fs` — no DOM.
 *
 * Mutations that must fail this file: dark `--color-bg-primary` -> slate-800 (card vs page
 * rows), light `--color-primary` -> blue-500 (5.17 rows), dark `--color-gantt-bar-not-started`
 * -> slate-400 (gantt rows), dark `--color-budget-projected` -> rgba(...) (non-opaque check),
 * `.statusClosed` back to `--color-text-muted` (rule scan).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..');
const tokensCss = fs.readFileSync(path.join(here, 'tokens.css'), 'utf8');

type Theme = 'light' | 'dark';

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    map.set(decl.slice(0, idx).trim(), decl.slice(idx + 1).trim());
  }
  return map;
}

function parseTokens(css: string): Record<Theme, Map<string, string>> {
  const clean = stripComments(css);
  const darkAt = clean.indexOf("[data-theme='dark']");
  if (darkAt < 0) throw new Error('tokens.css has no dark block');
  const lightText = clean.slice(0, darkAt);
  const darkText = clean.slice(darkAt);
  const light = new Map<string, string>();
  for (const m of lightText.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    light.set(m[1] ?? '', (m[2] ?? '').trim());
  }
  const dark = new Map(light);
  for (const m of darkText.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    dark.set(m[1] ?? '', (m[2] ?? '').trim());
  }
  return { light, dark };
}

const tokens = parseTokens(tokensCss);

/** Resolves var() chains to a 6-digit hex; throws for anything non-opaque. */
function resolve(theme: Theme, name: string, map = tokens): string {
  let current = name;
  for (let i = 0; i < 20; i++) {
    const value = map[theme].get(current);
    if (value === undefined) throw new Error(`Token ${current} is not defined (${theme})`);
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref) {
      current = ref[1] ?? '';
      continue;
    }
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
    throw new Error(`Token ${name} resolves to non-opaque or non-hex value "${value}" (${theme})`);
  }
  throw new Error(`Token ${name} has a var() cycle (${theme})`);
}

function resolveOrNull(theme: Theme, name: string): string | null {
  try {
    return resolve(theme, name);
  } catch {
    return null;
  }
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function tokenRatio(theme: Theme, fg: string, bg: string, map = tokens): number {
  return ratio(resolve(theme, fg, map), resolve(theme, bg, map));
}

const BARS = [
  '--color-gantt-bar-in-progress',
  '--color-gantt-bar-completed',
  '--color-gantt-bar-blocked',
];
const SURFACES = [
  '--color-bg-page',
  '--color-bg-primary',
  '--color-bg-secondary',
  '--color-bg-tertiary',
];

type Row = [theme: Theme | 'both', fg: string, bg: string, min: number];

const rows: Row[] = [
  // Cards must stand out from the page behind them (expected 1.26)
  ['dark', '--color-bg-primary', '--color-bg-page', 1.25],
  ['dark', '--color-border-strong', '--color-bg-primary', 3], // 3.07
  ['dark', '--color-border-strong', '--color-bg-page', 3], // 3.87
  ['dark', '--color-text-muted', '--color-bg-primary', 4.5], // 5.71
  ['dark', '--color-text-muted', '--color-bg-secondary', 4.5], // 4.89
  ['dark', '--color-text-muted', '--color-bg-hover', 4.5], // 4.89
  ['dark', '--color-text-secondary', '--color-bg-tertiary', 4.5], // 6.97
  ['both', '--color-nav-active-text', '--color-nav-active-bg', 4.5], // 5.17
  ['dark', '--color-gantt-bar-not-started', '--color-gantt-row-even', 3], // 5.71
  ['dark', '--color-gantt-bar-not-started', '--color-gantt-row-odd', 3], // 4.89
  ...BARS.flatMap((bar): Row[] => [
    ['dark', bar, '--color-gantt-row-even', 3],
    ['dark', bar, '--color-gantt-row-odd', 3],
  ]),
  ['dark', '--color-gantt-arrow-default', '--color-bg-primary', 3], // 5.71
  ['dark', '--color-gantt-arrow-critical', '--color-bg-primary', 3], // 8.67
  ['dark', '--color-budget-projected', '--color-budget-track', 3], // 5.74
  ['dark', '--color-primary-text', '--color-primary', 4.5], // 6.98
  ['dark', '--color-primary-text', '--color-primary-hover', 4.5], // 9.84
  ['dark', '--color-primary-text', '--color-primary-active', 4.5], // 4.82
  ['dark', '--color-primary', '--color-bg-hover', 3], // 4.94 pagination hover border
  ['light', '--color-primary-text', '--color-primary', 4.5], // 5.17
  ['light', '--color-primary-text', '--color-primary-hover', 4.5], // 6.70
  ['light', '--color-primary-text', '--color-primary-active', 4.5], // 8.72
  ['light', '--color-primary', '--color-bg-primary', 4.5], // 5.17
  ['light', '--color-primary', '--color-bg-secondary', 4.5], // 4.95
  ['light', '--color-primary', '--color-bg-tertiary', 4.5], // 4.70
  ['light', '--color-primary-badge-text', '--color-primary-bg', 4.5], // 7.15
  ['light', '--color-primary-badge-text', '--color-primary-bg-hover', 4.5], // 6.14
  ['light', '--color-border-focus', '--color-bg-primary', 3], // 5.17
  ['light', '--color-primary', '--color-bg-hover', 3], // 4.95
  // Follow-up pairs (success / danger / placeholder / role / calendar today header)
  ['light', '--color-success-text', '--color-success', 4.5], // 5.48
  ['dark', '--color-success-text', '--color-success', 4.5], // 9.23
  ['light', '--color-success', '--color-success-badge-bg', 4.5], // 4.84
  ['light', '--color-danger', '--color-danger-bg', 4.5], // 5.91
  ['dark', '--color-danger', '--color-bg-primary', 4.5], // 5.29
  ['both', '--color-text-placeholder', '--color-bg-primary', 4.5], // 5.77 / 5.71
  // Breadcrumbs row (#2202) sits on the page background: trail links, Back link, separators
  ['both', '--color-text-muted', '--color-bg-page', 4.5], // 5.52 / 7.18
  ['both', '--color-text-secondary', '--color-bg-page', 4.5], // 9.86 / 12.39
  ['light', '--color-text-muted', '--color-bg-primary', 4.5], // 5.77
  // Page status lines (#2203, e.g. the new-invoice extraction note) use secondary text on cards
  ['both', '--color-text-secondary', '--color-bg-primary', 4.5],
  // Cross-rule: calendar week view "today" header (WeekGrid .dayName on .headerCellToday)
  ['light', '--color-text-muted', '--color-primary-bg', 4.5], // 4.73
  ['dark', '--color-role-member-text', '--color-role-member-bg', 4.5], // 8.40
  ...SURFACES.map((bg): Row => ['both', '--color-text-primary', bg, 4.5]),
];

const expanded = rows.flatMap(([theme, fg, bg, min]) =>
  (theme === 'both' ? (['light', 'dark'] as const) : [theme]).map(
    (t) => [t, fg, bg, min] as [Theme, string, string, number],
  ),
);

describe('design token contrast (D-26)', () => {
  it.each(expanded)('%s: %s on %s is at least %s:1', (theme, fg, bg, min) => {
    expect(tokenRatio(theme, fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each(['--color-bg-primary', '--color-bg-page'])(
    'dark: muted text on the translucent today-header tint over %s is at least 4.5:1',
    (base) => {
      // --color-primary-bg is rgba in dark; composite it over the surface it sits on
      // (4.73 on a card, 6.01 on the page).
      const tint = tokens.dark.get('--color-primary-bg') ?? '';
      const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(tint);
      expect(m).not.toBeNull();
      const alpha = Number(m?.[4]);
      const under = resolve('dark', base);
      const mix = [1, 2, 3].map((i) => {
        const top = Number(m?.[i]);
        const bottom = parseInt(under.slice(1 + (i - 1) * 2, 3 + (i - 1) * 2), 16);
        return Math.round(top * alpha + bottom * (1 - alpha))
          .toString(16)
          .padStart(2, '0');
      });
      expect(
        ratio(resolve('dark', '--color-text-muted'), `#${mix.join('')}`),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('rejects a non-opaque token in a measured pair', () => {
    const mutated = parseTokens(tokensCss);
    mutated.dark.set('--color-budget-projected', 'rgba(147, 197, 253, 0.5)');
    expect(() =>
      tokenRatio('dark', '--color-budget-projected', '--color-budget-track', mutated),
    ).toThrow(/non-opaque/);
  });

  it('rejects an undefined token and a var() cycle', () => {
    const mutated = parseTokens(tokensCss);
    mutated.light.set('--a', 'var(--b)');
    mutated.light.set('--b', 'var(--a)');
    expect(() => resolve('light', '--a', mutated)).toThrow(/cycle/);
    expect(() => resolve('light', '--does-not-exist', mutated)).toThrow(/not defined/);
    expect(resolveOrNull('light', '--does-not-exist')).toBeNull();
  });

  it('light page background equals the light secondary background; dark does not', () => {
    expect(resolve('light', '--color-bg-page')).toBe(resolve('light', '--color-bg-secondary'));
    expect(resolve('dark', '--color-bg-page')).not.toBe(resolve('dark', '--color-bg-secondary'));
  });

  it('defines the navigation active tokens once, shared by both themes', () => {
    const darkBlock = tokensCss.slice(tokensCss.indexOf("[data-theme='dark']"));
    expect(darkBlock).not.toMatch(/--color-nav-active-(bg|text)\s*:/);
  });

  it('computes the WCAG ratio correctly (black on white is 21:1)', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

// ── Removed tokens ───────────────────────────────────────────────────────────

function listCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCssFiles(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

const cssFiles = listCssFiles(srcDir);

describe('removed tokens', () => {
  it('tokens.css no longer defines --color-sidebar-active', () => {
    expect(tokensCss).not.toContain('--color-sidebar-active');
  });

  it.each([
    '--color-sidebar-active',
    '--color-slate-800',
    '--color-slate-700',
    '--color-slate-250',
  ])('no CSS file references %s', (token) => {
    const offenders = cssFiles
      .filter((file) => new RegExp(`${token}(?![\\w-])`).test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcDir, file));
    expect(offenders).toEqual([]);
  });

  it('scans a meaningful number of CSS files', () => {
    expect(cssFiles.length).toBeGreaterThan(50);
  });
});

// ── Rule pins ────────────────────────────────────────────────────────────────

interface CssRule {
  selectors: string[];
  decls: Map<string, string>;
}

/** Flat list of style rules; descends into @media/@supports, skips @keyframes/@font-face. */
function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) {
        if (/^@(media|supports|layer)/.test(prelude)) walk(body);
      } else {
        rules.push({
          selectors: prelude.split(',').map((s) => s.trim()),
          decls: declarations(body),
        });
      }
      i = j;
    }
  };
  walk(stripComments(css));
  return rules;
}

function readCss(...segments: string[]): CssRule[] {
  return parseRules(fs.readFileSync(path.join(srcDir, ...segments), 'utf8'));
}

function ruleFor(rules: CssRule[], selector: string): Map<string, string> {
  const found = rules.find((r) => r.selectors.includes(selector));
  if (!found) throw new Error(`No rule for ${selector}`);
  return found.decls;
}

describe('colour rule pins', () => {
  const sidebar = readCss('components', 'Sidebar', 'Sidebar.module.css');

  it.each(['.active', '.logoutButton.active'])(
    'Sidebar %s uses the shared active-item tokens and weight 600',
    (selector) => {
      const decls = ruleFor(sidebar, selector);
      expect(decls.get('background-color') ?? decls.get('background')).toBe(
        'var(--color-nav-active-bg)',
      );
      expect(decls.get('color')).toBe('var(--color-nav-active-text)');
      expect(decls.get('font-weight')).toBe('var(--font-weight-semibold)');
    },
  );

  it.each([
    ['components/AppShell/AppShell.module.css', '.pageContent'],
    ['styles/index.css', 'body'],
    ['components/AuthGuard/AuthGuard.module.css', '.loading'],
    ['pages/shared/AuthPage.module.css', '.container'],
  ])('%s %s paints the page background token', (file, selector) => {
    const decls = ruleFor(readCss(...file.split('/')), selector);
    expect(decls.get('background-color') ?? decls.get('background')).toBe('var(--color-bg-page)');
  });

  it('print.css resets --color-bg-page to a light page', () => {
    const printCss = fs.readFileSync(path.join(srcDir, 'styles', 'print.css'), 'utf8');
    expect(stripComments(printCss)).toMatch(/--color-bg-page\s*:\s*#[0-9a-fA-F]{6}/);
  });

  it('pagination hover has a fill and a primary border, not only a fill', () => {
    const decls = ruleFor(
      readCss('components', 'DataTable', 'DataTable.module.css'),
      '.paginationButton:hover:not(:disabled)',
    );
    expect(decls.get('background-color') ?? decls.get('background')).toBe('var(--color-bg-hover)');
    expect(decls.get('border-color')).toBe('var(--color-primary)');
  });
});

// ── Same-rule colour/background scan ─────────────────────────────────────────

const VAR_ONLY = /^var\((--[\w-]+)\s*(?:,[^)]*)?\)$/;

function themesFor(selector: string): Theme[] {
  if (/:disabled|\[aria-disabled/.test(selector)) return [];
  if (/\[data-theme=['"]dark['"]\]/.test(selector)) return ['dark'];
  if (/\[data-theme=['"]light['"]\]/.test(selector)) return ['light'];
  return ['light', 'dark'];
}

interface Offender {
  key: string;
  ratio: number;
}

/** Measures every rule that sets both `color` and a background as plain var() references. */
function scanCss(rel: string, css: string): { offenders: Offender[]; measured: number } {
  const offenders: Offender[] = [];
  let measured = 0;
  for (const rule of parseRules(css)) {
    const fgRef = VAR_ONLY.exec(rule.decls.get('color') ?? '');
    const bgRef = VAR_ONLY.exec(
      rule.decls.get('background-color') ?? rule.decls.get('background') ?? '',
    );
    if (!fgRef || !bgRef) continue;
    for (const selector of rule.selectors) {
      for (const theme of themesFor(selector)) {
        const fg = resolveOrNull(theme, fgRef[1] ?? '');
        const bg = resolveOrNull(theme, bgRef[1] ?? '');
        if (!fg || !bg) continue;
        measured++;
        const value = ratio(fg, bg);
        if (value < 4.5) {
          offenders.push({
            key: `${rel}|${selector}|${theme}|${fgRef[1]} on ${bgRef[1]}`,
            ratio: value,
          });
        }
      }
    }
  }
  return { offenders, measured };
}

/**
 * Frozen list of known below-AA pairs. It is EMPTY on purpose and may never grow: only
 * `:disabled` / `[aria-disabled` selectors are exempt (WCAG 1.4.3).
 */
const KNOWN_BELOW_AA: string[] = [];

describe('every CSS rule that sets both colour and background', () => {
  const skipped = [path.join('styles', 'tokens.css'), path.join('styles', 'print.css')];
  const all = cssFiles
    .map((file) => ({ rel: path.relative(srcDir, file), file }))
    .filter(({ rel }) => !skipped.includes(rel))
    .map(({ rel, file }) => scanCss(rel, fs.readFileSync(file, 'utf8')));
  const offenders = all.flatMap((r) => r.offenders);
  const measured = all.reduce((sum, r) => sum + r.measured, 0);

  it('measures a meaningful number of pairs', () => {
    expect(measured).toBeGreaterThan(300);
  });

  it('has no pair below 4.5:1 in any theme', () => {
    const unexpected = offenders
      .filter((o) => !KNOWN_BELOW_AA.includes(o.key))
      .map((o) => `${o.key} = ${o.ratio.toFixed(2)}`);
    expect(unexpected).toEqual([]);
  });

  it('keeps the known-failures list empty', () => {
    expect(KNOWN_BELOW_AA).toEqual([]);
  });
});

describe('rule scanner', () => {
  it('skips disabled selectors and honours theme-scoped selectors', () => {
    expect(themesFor('.saveButton:disabled')).toEqual([]);
    expect(themesFor(".a[aria-disabled='true']")).toEqual([]);
    expect(themesFor("[data-theme='dark'] .x")).toEqual(['dark']);
    expect(themesFor("[data-theme='light'] .x")).toEqual(['light']);
    expect(themesFor('.x')).toEqual(['light', 'dark']);
  });

  it('parses rules inside @media and ignores @keyframes', () => {
    const rules = parseRules(
      '@media (max-width: 1px) { .a { color: red; } } @keyframes k { from { color: blue; } } .b { color: green; }',
    );
    expect(rules.map((r) => r.selectors[0])).toEqual(['.a', '.b']);
  });

  it('flags a deliberately low-contrast pair in both themes where it fails', () => {
    // dark muted text on dark tertiary background was the regression class fixed by F9
    const { offenders } = scanCss(
      'x.css',
      '.bad { color: var(--color-bg-secondary); background: var(--color-bg-tertiary); }',
    );
    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders.every((o) => o.key.startsWith('x.css|.bad|'))).toBe(true);
  });

  it('does not flag a disabled low-contrast pair, nor a passing pair', () => {
    const css =
      '.ok:disabled { color: var(--color-bg-secondary); background: var(--color-bg-tertiary); }' +
      '.fine { color: var(--color-text-primary); background: var(--color-bg-primary); }';
    const { offenders, measured } = scanCss('y.css', css);
    expect(offenders).toEqual([]);
    expect(measured).toBe(2);
  });
});
