import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static accessibility guards for the stylesheets and the HTML shell (#2261). Pure `fs`, no
 * DOM: the jest CSS-module mock hides real values, so the source CSS is read from disk.
 *
 * Mutations that must fail this file: drop the `box-shadow` from any `:focus-visible` rule that
 * sets `outline: none` (focus replacement guard), swap a `.input` border back to
 * `--color-border-strong` (control-border guard), remove the border change next to a
 * `--shadow-focus-subtle` halo (subtle-halo guard), reference `--color-focus-ring` again
 * (translucent guard), delete the forced-colors block from index.css, add `user-scalable=no`
 * to the viewport meta.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..');
const clientDir = path.join(srcDir, '..');

// ── Minimal CSS parsing (copied on purpose; test files do not import each other) ─────────

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

interface CssRule {
  selectors: string[];
  decls: Map<string, string>;
}

/** Flat list of style rules in source order; descends into @media/@supports. */
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

function listCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCssFiles(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

const allCssFiles = listCssFiles(srcDir);
const rel = (file: string) => path.relative(srcDir, file).split(path.sep).join('/');
const scannedFiles = allCssFiles.filter(
  (f) => !['styles/tokens.css', 'styles/print.css'].includes(rel(f)),
);

interface FileRules {
  file: string;
  rules: CssRule[];
}
const scanned: FileRules[] = scannedFiles.map((file) => ({
  file: rel(file),
  rules: parseRules(fs.readFileSync(file, 'utf8')),
}));

// ── 6. Focus replacement guard ───────────────────────────────────────────────────────────

const FOCUS_PSEUDO = /:(focus-visible|focus-within|focus)(?![\w-])/;
const FOCUS_PSEUDO_G = /:(focus-visible|focus-within|focus)(?![\w-])/g;
const INDICATOR_COLOUR =
  /--(color-border-focus|color-primary|color-danger|color-photo-focus-ring|color-sidebar-focus-ring)(?![\w-])/;

/** True when the declarations alone paint a visible, >=3:1 focus indicator. */
function providesIndicator(decls: Map<string, string>): boolean {
  const shadow = decls.get('box-shadow') ?? '';
  if (/--shadow-focus(-danger)?(?![\w-])/.test(shadow) || INDICATOR_COLOUR.test(shadow))
    return true;
  const outline = decls.get('outline') ?? '';
  if (/^\S+\s+solid\s+var\(--/.test(outline) && !/^0(px)?\s/.test(outline)) return true;
  for (const prop of ['border-color', 'border']) {
    if (INDICATOR_COLOUR.test(decls.get(prop) ?? '')) return true;
  }
  return false;
}

function removesOutline(decls: Map<string, string>): boolean {
  return /^(none|0)$/.test(decls.get('outline') ?? '');
}

function baseSelector(selector: string): string {
  return selector.replace(FOCUS_PSEUDO_G, '');
}

/** `file|selector` offenders: outline removed with no replacement indicator. */
function focusOffenders(entries: FileRules[]): string[] {
  const offenders: string[] = [];
  for (const { file, rules } of entries) {
    for (const rule of rules) {
      if (!removesOutline(rule.decls)) continue;
      for (const selector of rule.selectors) {
        if (providesIndicator(rule.decls)) continue;
        const base = baseSelector(selector);
        const replaced = rules.some(
          (other) =>
            providesIndicator(other.decls) &&
            other.selectors.some((s) => FOCUS_PSEUDO.test(s) && baseSelector(s).startsWith(base)),
        );
        if (!replaced) offenders.push(`${file}|${selector}`);
      }
    }
  }
  return [...new Set(offenders)].sort();
}

/**
 * (InvoiceConvertPage .saveError/.recorded and InfiniteScrollFooter .endOfList also reset the
 * outline on :focus, but each paints a :focus-visible ring, so they are not offenders.)
 * Elements that keep `outline: none` and paint no ring because they only receive programmatic
 * focus (tabIndex=-1, never in the Tab order). Frozen: a new entry needs the same reason.
 */
const PROGRAMMATIC_FOCUS_ONLY: readonly string[] = [
  // tabIndex=-1, not in Tab order: the shell's <main>, focused by the skip link / AuthGuard
  'components/AppShell/AppShell.module.css|.pageContent:focus-visible',
  // tabIndex=-1, not in Tab order: the sheet heading, focused on open
  'components/Modal/Sheet.module.css|.title:focus-visible',
  // tabIndex=-1, not in Tab order: the side panel heading, focused on open
  'components/Modal/SidePanel.module.css|.title:focus-visible',
  // tabIndex=-1, not in Tab order: the auth error banner, focused on submit failure
  'pages/shared/AuthPage.module.css|.errorBanner:focus',
  // tabIndex=-1, not in Tab order: the report expansion panel, focused when expanded
  'components/reports/ReportInvoiceList.module.css|.expansionPanel',
];

describe('focus replacement guard (#2261)', () => {
  const offenders = focusOffenders(scanned);

  it('scans a meaningful number of stylesheets and outline resets', () => {
    expect(scanned.length).toBeGreaterThan(100);
    const resets = scanned.flatMap(({ rules }) => rules.filter((r) => removesOutline(r.decls)));
    expect(resets.length).toBeGreaterThan(100);
  });

  it('every allowlist entry still names an outline reset with no indicator (no stale entries)', () => {
    for (const entry of PROGRAMMATIC_FOCUS_ONLY) {
      expect(offenders).toContain(entry);
    }
  });

  it('every outline reset has a focus indicator or is programmatic-focus-only', () => {
    expect(offenders.filter((o) => !PROGRAMMATIC_FOCUS_ONLY.includes(o))).toEqual([]);
  });

  it('self-test: an outline reset without a ring is flagged, with a shadow ring it is not', () => {
    const bad = [{ file: 'x.css', rules: parseRules('.btn:focus-visible { outline: none; }') }];
    expect(focusOffenders(bad)).toEqual(['x.css|.btn:focus-visible']);
    const good = [
      {
        file: 'x.css',
        rules: parseRules(
          '.btn { outline: none; } .btn:focus-visible { box-shadow: var(--shadow-focus); }',
        ),
      },
    ];
    expect(focusOffenders(good)).toEqual([]);
    const subtleOnly = [
      {
        file: 'x.css',
        rules: parseRules(
          '.btn { outline: none; } .btn:focus-visible { box-shadow: var(--shadow-focus-subtle); }',
        ),
      },
    ];
    expect(focusOffenders(subtleOnly)).toEqual(['x.css|.btn']);
  });
});

// ── 7. Subtle-halo guard ─────────────────────────────────────────────────────────────────

const PAIRED_BORDER = /--(color-primary|color-border-focus|color-danger)(?![\w-])/;

function hasPairedBorder(decls: Map<string, string>): boolean {
  return ['border-color', 'border'].some((p) => PAIRED_BORDER.test(decls.get(p) ?? ''));
}

function subtleOffenders(entries: FileRules[]): string[] {
  const offenders: string[] = [];
  for (const { file, rules } of entries) {
    rules.forEach((rule, index) => {
      if (!/--shadow-focus-subtle(?![\w-])/.test(rule.decls.get('box-shadow') ?? '')) return;
      if (hasPairedBorder(rule.decls)) return;
      const earlier = rules
        .slice(0, index)
        .some(
          (prev) =>
            hasPairedBorder(prev.decls) &&
            prev.selectors.some((s) => rule.selectors.some((r) => r === s)),
        );
      if (!earlier) offenders.push(`${file}|${rule.selectors.join(', ')}`);
    });
  }
  return offenders;
}

describe('subtle focus halo guard (#2261)', () => {
  it('every --shadow-focus-subtle rule also sets a primary, focus or danger border', () => {
    expect(subtleOffenders(scanned)).toEqual([]);
  });

  it('the halo is still used (the guard is not vacuous)', () => {
    const uses = scanned.flatMap(({ rules }) =>
      rules.filter((r) => /--shadow-focus-subtle/.test(r.decls.get('box-shadow') ?? '')),
    );
    expect(uses.length).toBeGreaterThan(5);
  });

  it('self-test: a halo with no border change is flagged; a border set earlier or in-rule is not', () => {
    const bad = [
      { file: 'x.css', rules: parseRules('.a:focus { box-shadow: var(--shadow-focus-subtle); }') },
    ];
    expect(subtleOffenders(bad)).toEqual(['x.css|.a:focus']);
    const inRule = [
      {
        file: 'x.css',
        rules: parseRules(
          '.a:focus { border-color: var(--color-primary); box-shadow: var(--shadow-focus-subtle); }',
        ),
      },
    ];
    expect(subtleOffenders(inRule)).toEqual([]);
    const earlier = [
      {
        file: 'x.css',
        rules: parseRules(
          '.a:focus, .b:focus { border-color: var(--color-border-focus); } .a:focus { box-shadow: var(--shadow-focus-subtle); }',
        ),
      },
    ];
    expect(subtleOffenders(earlier)).toEqual([]);
  });
});

// ── 8. No translucent focus colours, no invalid drop-shadow ──────────────────────────────

describe('translucent focus colours and drop-shadow (#2261)', () => {
  it('no stylesheet outside tokens.css references --color-focus-ring', () => {
    const offenders = allCssFiles
      .filter((f) => rel(f) !== 'styles/tokens.css')
      .filter((f) => /--color-focus-ring(?![\w-])/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  /** drop-shadow(<x> <y> [blur] [colour]) takes at most 3 lengths; a 4th (spread) voids the filter. */
  function dropShadowSpreadOffenders(css: string): string[] {
    const out: string[] = [];
    for (const m of stripComments(css).matchAll(/drop-shadow\(([^;]*?)\)(?=\s|;|$)/g)) {
      const args = (m[1] ?? '').replace(/var\([^)]*\)|rgba?\([^)]*\)|#[0-9a-fA-F]+/g, ' ');
      const lengths = args.match(/-?\d*\.?\d+(px|rem|em)?(?![\w-])/g) ?? [];
      if (lengths.length > 3) out.push(m[0]);
    }
    return out;
  }

  it('no drop-shadow() takes four length arguments', () => {
    const offenders = allCssFiles
      .filter((f) => dropShadowSpreadOffenders(fs.readFileSync(f, 'utf8')).length > 0)
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('self-test: the spread form is flagged, the valid forms are not', () => {
    expect(
      dropShadowSpreadOffenders('a { filter: drop-shadow(0 0 0 3px var(--c)); }'),
    ).toHaveLength(1);
    expect(dropShadowSpreadOffenders('a { filter: drop-shadow(0 0 3px var(--c)); }')).toEqual([]);
    expect(
      dropShadowSpreadOffenders('a { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4)); }'),
    ).toEqual([]);
  });
});

// ── 9. Control-border guard ──────────────────────────────────────────────────────────────

const CONTROL_NAME = /input|select|textarea|selectedDisplay|checkbox/i;
const BORDER_TOKEN = /var\(--color-border[\w-]*\)|transparent/;

function lastClass(selector: string): string | null {
  const matches = [...selector.matchAll(/\.([\w-]+)/g)];
  return matches.length ? (matches[matches.length - 1]?.[1] ?? null) : null;
}

/** Frozen, commented false positives. Empty: every control rule found uses the control token. */
const CONTROL_BORDER_ALLOWLIST: readonly string[] = [];

function controlBorderOffenders(entries: FileRules[]): string[] {
  const offenders: string[] = [];
  for (const { file, rules } of entries) {
    for (const rule of rules) {
      const composesControl = /^(input|select|textarea)\s+from\b/.test(
        rule.decls.get('composes') ?? '',
      );
      for (const selector of rule.selectors) {
        if (
          /:(hover|focus|focus-visible|focus-within|disabled)|\[aria-invalid|\[disabled/.test(
            selector,
          )
        )
          continue;
        const cls = lastClass(selector);
        if (!cls) continue;
        if (/error|invalid/i.test(cls)) continue;
        if (!composesControl && !CONTROL_NAME.test(cls)) continue;
        const border = [rule.decls.get('border'), rule.decls.get('border-color')]
          .filter((v): v is string => v !== undefined)
          .join(' ');
        if (!BORDER_TOKEN.test(border)) continue;
        if (/--color-border-control(?![\w-])/.test(border)) continue;
        offenders.push(`${file}|${selector}`);
      }
    }
  }
  return [...new Set(offenders)].sort();
}

describe('form-control border guard (#2261, WCAG 1.4.11)', () => {
  it('every control border uses --color-border-control', () => {
    expect(
      controlBorderOffenders(scanned).filter((o) => !CONTROL_BORDER_ALLOWLIST.includes(o)),
    ).toEqual([]);
  });

  it('the control token is in real use (the guard is not vacuous)', () => {
    const uses = scanned.filter(({ rules }) =>
      rules.some((r) =>
        /--color-border-control/.test(`${r.decls.get('border')} ${r.decls.get('border-color')}`),
      ),
    );
    expect(uses.length).toBeGreaterThan(10);
  });

  it('self-test: a .searchInput with the strong border is flagged', () => {
    const bad = [
      {
        file: 'x.css',
        rules: parseRules('.searchInput { border: 1px solid var(--color-border-strong); }'),
      },
    ];
    expect(controlBorderOffenders(bad)).toEqual(['x.css|.searchInput']);
  });

  it('self-test: composes of a shared control with a transparent border is flagged; control token passes', () => {
    const composed = [
      {
        file: 'x.css',
        rules: parseRules(
          ".field { composes: input from '../shared.module.css'; border-color: transparent; }",
        ),
      },
    ];
    expect(controlBorderOffenders(composed)).toEqual(['x.css|.field']);
    const ok = [
      {
        file: 'x.css',
        rules: parseRules('.searchInput { border: 1px solid var(--color-border-control); }'),
      },
    ];
    expect(controlBorderOffenders(ok)).toEqual([]);
  });

  it('self-test: hover, focus, disabled and error variants are ignored', () => {
    const variants = [
      {
        file: 'x.css',
        rules: parseRules(
          '.input:hover { border-color: var(--color-border-strong); } .input:disabled { border-color: var(--color-border); } .inputError { border-color: var(--color-danger); } .input[aria-invalid="true"] { border-color: var(--color-border); }',
        ),
      },
    ];
    expect(controlBorderOffenders(variants)).toEqual([]);
  });
});

// ── 10. Forced colours ───────────────────────────────────────────────────────────────────

describe('forced colours (#2261)', () => {
  const indexCss = stripComments(fs.readFileSync(path.join(here, 'index.css'), 'utf8'));

  it('index.css restores a CanvasText outline on :focus-visible in forced-colors mode', () => {
    const at = indexCss.indexOf('@media (forced-colors: active)');
    expect(at).toBeGreaterThanOrEqual(0);
    const block = indexCss.slice(at, indexCss.indexOf('}', indexCss.indexOf('}', at) + 1) + 1);
    expect(block).toContain(':focus-visible');
    expect(block).toContain('outline: 2px solid CanvasText');
  });
});

// ── 11. Viewport (AC5) ───────────────────────────────────────────────────────────────────

describe('viewport meta (#2261, AC5)', () => {
  const html = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
  const meta = /<meta[^>]*name=["']viewport["'][^>]*>/i.exec(html)?.[0] ?? '';
  const content = /content=["']([^"']*)["']/i.exec(meta)?.[1] ?? '';

  it('declares a viewport meta with device-width', () => {
    expect(content).toContain('width=device-width');
  });

  it('allows pinch-zoom: no user-scalable=no/0 and no maximum-scale', () => {
    expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    expect(content).not.toMatch(/maximum-scale/i);
  });
});
