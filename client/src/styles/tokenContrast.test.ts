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
  // Top bar and user menu (#2206): focus ring on the menu item hover wash and on the page
  ['dark', '--color-border-focus', '--color-bg-primary', 3], // 5.75
  ['both', '--color-border-focus', '--color-bg-secondary', 3], // item focus: ring on bg-secondary
  // Selected theme/language option border on its fill (light fill is opaque; dark is composited below)
  ['light', '--color-primary', '--color-primary-bg', 3], // 4.24
  // Avatar text on the avatar fill (light fill is opaque; dark is composited below)
  ['light', '--color-primary-badge-text', '--color-primary-bg', 4.5], // 7.15
  // Role line in the menu header and the muted labels on the secondary surface
  ['both', '--color-text-muted', '--color-bg-secondary', 4.5],
  ...SURFACES.map((bg): Row => ['both', '--color-text-primary', bg, 4.5]),
  // Phone and tablet shell (#2207): bottom bar and More sheet
  ['dark', '--color-primary', '--color-bg-primary', 4.5], // active slot label on the bar
  ['both', '--color-text-primary', '--color-bg-hover', 4.5], // slot / row hover wash
  ['both', '--color-danger-text', '--color-danger', 4.5], // Home attention badge
  ['both', '--color-text-secondary', '--color-bg-tertiary', 4.5], // inactive slot label while pressed
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

/** Composites a translucent token over an opaque base token and returns the resulting hex. */
function compositeOver(theme: Theme, translucent: string, base: string): string {
  const raw = tokens[theme].get(translucent) ?? '';
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(raw);
  if (!m) throw new Error(`${translucent} is not an rgba() token (${theme}): "${raw}"`);
  const alpha = Number(m[4]);
  const under = resolve(theme, base);
  const mix = [1, 2, 3].map((i) => {
    const top = Number(m[i]);
    const bottom = parseInt(under.slice(1 + (i - 1) * 2, 3 + (i - 1) * 2), 16);
    return Math.round(top * alpha + bottom * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${mix.join('')}`;
}

describe('top bar and user menu composites (#2206)', () => {
  // Dark --color-primary-bg(-hover) are translucent: measure on the surface the menu paints on.
  it.each([
    ['--color-primary-bg', '--color-bg-primary'],
    ['--color-primary-bg', '--color-bg-page'],
    ['--color-primary-bg-hover', '--color-bg-primary'],
    ['--color-primary-bg-hover', '--color-bg-page'],
  ])('dark: avatar / selected-option text on %s over %s is at least 4.5:1', (fill, base) => {
    const bg = compositeOver('dark', fill, base);
    expect(ratio(resolve('dark', '--color-primary-badge-text'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark: the avatar text on the card surface measures 6.72:1 (documented figure)', () => {
    const bg = compositeOver('dark', '--color-primary-bg', '--color-bg-primary');
    expect(ratio(resolve('dark', '--color-primary-badge-text'), bg)).toBeCloseTo(6.72, 1);
  });

  it('dark: the selected-option / avatar border (--color-primary) on its composited fill is at least 3:1', () => {
    const bg = compositeOver('dark', '--color-primary-bg', '--color-bg-primary');
    const value = ratio(resolve('dark', '--color-primary'), bg);
    expect(value).toBeGreaterThanOrEqual(3);
    expect(value).toBeCloseTo(4.77, 1);
  });

  it('dark: the current More sheet row text (badge text on the composited primary wash over the sheet) is at least 4.5:1', () => {
    const bg = compositeOver('dark', '--color-primary-bg', '--color-bg-primary');
    expect(ratio(resolve('dark', '--color-primary-badge-text'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('compositeOver rejects a token that is not translucent', () => {
    expect(() => compositeOver('light', '--color-primary-bg', '--color-bg-primary')).toThrow(
      /not an rgba/,
    );
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

  it('Sidebar .active uses the shared active-item tokens and weight 600', () => {
    const decls = ruleFor(sidebar, '.active');
    expect(decls.get('background-color') ?? decls.get('background')).toBe(
      'var(--color-nav-active-bg)',
    );
    expect(decls.get('color')).toBe('var(--color-nav-active-text)');
    expect(decls.get('font-weight')).toBe('var(--font-weight-semibold)');
  });

  it('Sidebar .navLink.active:hover keeps the active background (no hover wash on the current item)', () => {
    const decls = ruleFor(sidebar, '.navLink.active:hover');
    expect(decls.get('background-color') ?? decls.get('background')).toBe(
      'var(--color-nav-active-bg)',
    );
  });

  it('Sidebar no longer styles .logoutButton.active (Settings is an ordinary .navLink)', () => {
    expect(() => ruleFor(sidebar, '.logoutButton.active')).toThrow(/No rule for/);
  });

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

describe('top bar and user menu rule pins (#2206)', () => {
  const appShell = readCss('components', 'AppShell', 'AppShell.module.css');
  const overflow = readCss('components', 'OverflowMenu', 'OverflowMenu.module.css');
  const sidebarCss = fs.readFileSync(
    path.join(srcDir, 'components', 'Sidebar', 'Sidebar.module.css'),
    'utf8',
  );
  const sidebarRules = parseRules(sidebarCss);
  const topBar = readCss('components', 'TopBar', 'TopBar.module.css');

  const bottomBar = readCss('components', 'BottomBar', 'BottomBar.module.css');
  const moreSheet = readCss('components', 'MoreSheet', 'MoreSheet.module.css');
  const sheet = readCss('components', 'Modal', 'Sheet.module.css');

  it('no shell rule paints a primary-coloured background (the shell has no primary button)', () => {
    for (const rules of [appShell, bottomBar, moreSheet, sheet, topBar]) {
      for (const rule of rules) {
        const bg = rule.decls.get('background-color') ?? rule.decls.get('background');
        expect(`${rule.selectors.join(',')}: ${bg ?? ''}`).not.toMatch(/var\(--color-primary\)/);
      }
    }
  });

  it('AppShell no longer styles the retired floating menu button or overlay', () => {
    for (const selector of ['.menuFab', '.menuFab:hover', '.overlay']) {
      expect(() => ruleFor(appShell, selector)).toThrow(/No rule for/);
    }
    expect(
      stripComments(
        fs.readFileSync(path.join(srcDir, 'components/AppShell/AppShell.module.css'), 'utf8'),
      ),
    ).not.toMatch(/menuFab|overlay/);
  });

  it('OverflowMenu items focus with the focus-border token and inset ring, not the old ring token', () => {
    const decls = ruleFor(overflow, '.item:focus-visible');
    expect(decls.get('box-shadow')).toContain('var(--color-border-focus)');
    expect(decls.get('box-shadow')).not.toContain('--color-focus-ring');
    expect(decls.get('outline')).toBe('none');
  });

  it('Sidebar styles none of the retired drawer and footer controls', () => {
    for (const selector of [
      '.footerLegacy',
      '.logoutButton',
      '.projectInfo',
      '.githubLink',
      '.menuFab',
      ".sidebar[data-open='true']",
      '.sidebar.open',
    ]) {
      expect(sidebarRules.some((r) => r.selectors.includes(selector))).toBe(false);
    }
    expect(stripComments(sidebarCss)).not.toMatch(/footerLegacy|logoutButton|data-open/);
  });

  it('Sidebar has no off-canvas drawer media block and is sticky at every width', () => {
    expect(stripComments(sidebarCss)).not.toMatch(/max-width:\s*1023px/);
    expect(stripComments(sidebarCss)).not.toMatch(/translateX/);
    const decls = ruleFor(sidebarRules, '.sidebar');
    expect(decls.get('position')).toBe('sticky');
    expect(decls.get('top')).toBe('0');
  });

  it('the ThemeToggle component and its stylesheet are gone', () => {
    expect(fs.existsSync(path.join(srcDir, 'components', 'ThemeToggle'))).toBe(false);
  });

  it('the shell breakpoints are 1023 / 1024 px (no 1024 / 1025 pair left to leave a gap)', () => {
    for (const file of [
      'components/AppShell/AppShell.module.css',
      'components/Sidebar/Sidebar.module.css',
      'components/Breadcrumbs/Breadcrumbs.module.css',
      'components/TopBar/TopBar.module.css',
      'components/BottomBar/BottomBar.module.css',
    ]) {
      const css = stripComments(fs.readFileSync(path.join(srcDir, file), 'utf8'));
      expect(css).not.toMatch(/max-width:\s*1024px/);
      expect(css).not.toMatch(/min-width:\s*1025px/);
    }
  });

  it('the top bar is a flex row at every width and hidden in print', () => {
    const all = topBar.filter((r) => r.selectors.includes('.topBar'));
    expect(all.map((r) => r.decls.get('display')).filter(Boolean)).toEqual(['flex', 'none']);
    const css = fs.readFileSync(
      path.join(srcDir, 'components', 'TopBar', 'TopBar.module.css'),
      'utf8',
    );
    expect(css).not.toMatch(/min-width:\s*1024px/);
    expect(css).toMatch(/@media\s+print\s*\{\s*\.topBar\s*\{\s*display:\s*none;/);
  });

  it('the compact top bar pads for the top safe-area inset without growing past --topbar-height', () => {
    const decls = ruleFor(topBar, '.compact');
    expect(decls.get('padding-top')).toBe('env(safe-area-inset-top)');
    expect(decls.has('min-height')).toBe(false);
    expect(decls.has('height')).toBe(false);
    expect(ruleFor(appShell, '.compact').get('--topbar-height')).toBe(
      'calc(var(--spacing-12) + var(--spacing-2) + env(safe-area-inset-top, 0rem))',
    );
  });

  it('the top bar sticks to the viewport above page dropdowns and defines its height token', () => {
    const decls = ruleFor(topBar, '.topBar');
    expect(decls.get('position')).toBe('sticky');
    expect(decls.get('top')).toBe('0');
    expect(decls.get('z-index')).toBe('calc(var(--z-dropdown) + 1)');
    // Exactly the token height: a min-height plus padding made the bar ~61px instead of 56px.
    // Mutation: restoring `min-height` (or the vertical padding) must fail here.
    expect(decls.get('height')).toBe('var(--topbar-height)');
    expect(decls.has('min-height')).toBe(false);
    expect(decls.get('padding-block')).toBe('0');
    expect(decls.get('box-sizing')).toBe('border-box');
    expect(ruleFor(appShell, '.appShell').get('--topbar-height')).toBe(
      'calc(var(--spacing-12) + var(--spacing-2))',
    );
  });

  it.each(['.search', '.newButton'])(
    '%s is a fixed 40px control with no vertical padding',
    (sel) => {
      const decls = ruleFor(topBar, sel);
      expect(decls.get('height')).toBe('var(--spacing-10)');
      expect(decls.get('padding-block')).toBe('0');
      expect(decls.has('min-height')).toBe(false);
    },
  );

  it('the column that holds the bar does not scroll, so the bar can stick', () => {
    const column = ruleFor(appShell, '.shellColumn');
    expect(column.get('display')).toBe('flex');
    expect(column.get('flex-direction')).toBe('column');
    expect(column.get('overflow')).toBeUndefined();
    expect(column.get('overflow-y')).toBeUndefined();
  });

  it('OverflowMenu danger items focus with an inset danger ring', () => {
    const decls = ruleFor(overflow, '.itemDanger:focus-visible');
    expect(decls.get('box-shadow')).toBe('inset 0 0 0 2px var(--color-danger)');
    expect(decls.get('outline')).toBe('none');
  });

  it('the top bar buttons turn their transition off for reduced motion', () => {
    const css = fs.readFileSync(
      path.join(srcDir, 'components', 'TopBar', 'TopBar.module.css'),
      'utf8',
    );
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^@]*?\})\s*\}/.exec(css);
    expect(block).not.toBeNull();
    const rules = parseRules(block?.[0] ?? '');
    const rule = rules.find((r) => r.selectors.includes('.search'));
    expect(rule?.selectors).toEqual(['.search', '.newButton', '.bell']);
    expect(rule?.decls.get('transition')).toBe('none');
  });

  it('the compact title and search icon turn their transition off for reduced motion', () => {
    const css = fs.readFileSync(
      path.join(srcDir, 'components', 'TopBar', 'TopBar.module.css'),
      'utf8',
    );
    const blocks = [
      ...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^@]*?\})\s*\}/g),
    ];
    const rules = blocks.flatMap((b) => parseRules(b[0]));
    const rule = rules.find((r) => r.selectors.includes('.title'));
    expect(rule?.selectors).toEqual(['.title', '.searchIcon']);
    expect(rule?.decls.get('transition')).toBe('none');
  });

  it('the Timeline page is one dynamic-viewport height minus the top bar and the bottom bar, at every width', () => {
    const css = fs.readFileSync(
      path.join(srcDir, 'pages', 'TimelinePage', 'TimelinePage.module.css'),
      'utf8',
    );
    const page = parseRules(css).filter((r) => r.selectors.includes('.page'));
    expect(page[0]?.decls.get('height')).toBe(
      'calc(100dvh - var(--topbar-height) - var(--shell-bottom-height))',
    );
    expect(stripComments(css)).not.toMatch(/-\s*60px/);
    expect(stripComments(css)).not.toMatch(/100vh/);
    expect(stripComments(css)).not.toMatch(/min-width:\s*1024px/);
  });

  it.each([
    ['pages/TimelinePage/TimelinePage.module.css', '.page'],
    ['pages/AutoItemizePage/AutoItemizePage.module.css', '.pageContainer'],
    ['pages/PaperlessInvoiceReviewPage/PaperlessInvoiceReviewPage.module.css', '.pageContainer'],
    ['components/photos/SpotViewer.module.css', '.viewer'],
    ['components/photos/SpotViewer.module.css', '.image'],
    ['pages/PhotoSpotViewerPage/PhotoSpotViewerPage.module.css', '.root'],
  ])('%s %s subtracts the top bar and the bottom bar from the viewport', (file, selector) => {
    const css = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const rules = parseRules(css).filter((r) => r.selectors.includes(selector));
    const subtracts = rules.some((r) =>
      [...r.decls.values()].some(
        (v) =>
          /100dvh/.test(v) &&
          /var\(--topbar-height\)/.test(v) &&
          /var\(--shell-bottom-height\)/.test(v),
      ),
    );
    expect(subtracts).toBe(true);
    // The old 1024 px override is gone: one rule at every width
    expect(rules.every((r) => ![...r.decls.values()].some((v) => /100vh/.test(v)))).toBe(true);
  });

  it('the desktop SpotViewer layout keeps the same two subtractions', () => {
    const rules = readCss('components', 'photos', 'SpotViewer.module.css').filter((r) =>
      r.selectors.includes('.viewer'),
    );
    const heights = rules.flatMap((r) => [r.decls.get('height'), r.decls.get('min-height')]);
    expect(heights.filter(Boolean)).toEqual(
      Array(heights.filter(Boolean).length).fill(
        'calc(100dvh - var(--topbar-height) - var(--shell-bottom-height))',
      ),
    );
  });

  it('Toast lifts above the bottom bar on desktop and phone placements', () => {
    const css = stripComments(
      fs.readFileSync(path.join(srcDir, 'components', 'Toast', 'Toast.module.css'), 'utf8'),
    );
    expect(css.match(/bottom:\s*calc\([^;]*var\(--shell-bottom-height\)\)/g)).toHaveLength(2);
  });
});

describe('phone and tablet shell rule pins (#2207)', () => {
  const bottomBar = readCss('components', 'BottomBar', 'BottomBar.module.css');
  const indexCss = stripComments(fs.readFileSync(path.join(srcDir, 'styles', 'index.css'), 'utf8'));
  const indexRules = parseRules(indexCss);

  it('the bar content row is exactly 64px: a height, never a min-height', () => {
    const decls = ruleFor(bottomBar, '.list');
    expect(decls.get('height')).toBe('var(--spacing-16)');
    expect(decls.has('min-height')).toBe(false);
  });

  it('the current slot is marked by a 3px top bar as well as colour (not colour alone)', () => {
    const decls = ruleFor(bottomBar, '.slotActive');
    expect(decls.get('box-shadow')).toBe('inset 0 3px 0 var(--color-primary)');
    expect(decls.get('color')).toBe('var(--color-primary)');
    expect(decls.get('font-weight')).toBe('var(--font-weight-semibold)');
  });

  it('keyboard focus on the current slot keeps the top bar and adds the focus ring', () => {
    const decls = ruleFor(bottomBar, '.slotActive:focus-visible');
    expect(decls.get('box-shadow')).toContain('inset 0 3px 0 var(--color-primary)');
    expect(decls.get('box-shadow')).toContain('var(--color-border-focus)');
  });

  it('slot labels never truncate: nowrap, no ellipsis, no clipping (German labels must fit)', () => {
    const decls = ruleFor(bottomBar, '.label');
    expect(decls.get('white-space')).toBe('nowrap');
    expect(decls.has('text-overflow')).toBe(false);
    expect(decls.get('overflow')).toBe('visible');
  });

  it('the bar sits above page dropdowns, under the sheet, and respects the bottom inset', () => {
    const decls = ruleFor(bottomBar, '.bar');
    expect(decls.get('position')).toBe('fixed');
    expect(decls.get('z-index')).toBe('calc(var(--z-dropdown) + 1)');
    expect(decls.get('padding-bottom')).toBe('env(safe-area-inset-bottom)');
  });

  it('the bar hides itself while the on-screen keyboard is open', () => {
    const decls = ruleFor(bottomBar, ".bar[data-keyboard-open='true']");
    expect(decls.get('visibility')).toBe('hidden');
  });

  it('index.css reserves the bar height only while the bar is shown, and locks scroll under the sheet', () => {
    expect(ruleFor(indexRules, ':root').get('--shell-bottom-height')).toBe('0rem');
    expect(ruleFor(indexRules, ":root[data-shell-bar='shown']").get('--shell-bottom-height')).toBe(
      'calc(var(--spacing-16) + env(safe-area-inset-bottom, 0rem))',
    );
    expect(ruleFor(indexRules, "html[data-scroll-locked='true']").get('overflow')).toBe('hidden');
  });

  // The plain pressed wash (--color-bg-tertiary) under the primary label is 4.07:1 in dark, so the
  // current slot repaints its pressed state with --color-bg-hover (4.94 dark / 4.95 light).
  it.each(['light', 'dark'] as const)(
    '%s: the active slot label (primary) on its pressed wash (hover) is at least 4.5:1',
    (theme) => {
      expect(tokenRatio(theme, '--color-primary', '--color-bg-hover')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('pins the current slot pressed rule: .slotActive:active paints --color-bg-hover', () => {
    expect(ruleFor(bottomBar, '.slotActive:active').get('background-color')).toBe(
      'var(--color-bg-hover)',
    );
  });

  it('tokens.css defines the 44px minimum touch target', () => {
    expect(tokens.light.get('--touch-target-min')).toBe('2.75rem');
    expect(tokens.dark.get('--touch-target-min')).toBe('2.75rem');
  });

  it('the shell controls use the touch target token, never a literal 44px', () => {
    for (const file of [
      'components/Breadcrumbs/Breadcrumbs.module.css',
      'components/OverflowMenu/OverflowMenu.module.css',
      'components/PageLayout/PageLayout.module.css',
      'components/calendar/CalendarView.module.css',
      'components/calendar/CalendarMilestone.module.css',
      'components/calendar/CalendarHouseholdItem.module.css',
      'components/reports/ReportInvoiceList.module.css',
    ]) {
      const full = path.join(srcDir, file);
      if (!fs.existsSync(full)) continue;
      expect(stripComments(fs.readFileSync(full, 'utf8'))).not.toMatch(/\b44px\b/);
    }
  });

  it('the shell and sheet transitions turn off for reduced motion', () => {
    for (const file of [
      'components/BottomBar/BottomBar.module.css',
      'components/Modal/Sheet.module.css',
    ]) {
      const css = fs.readFileSync(path.join(srcDir, file), 'utf8');
      const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*?\}\s*\}/.exec(css);
      expect(block).not.toBeNull();
      expect(parseRules(block?.[0] ?? '').every((r) => r.decls.get('transition') === 'none')).toBe(
        true,
      );
    }
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
