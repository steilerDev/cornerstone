import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AC1 colour pins (#2195, UX §7.3). The jest CSS-module mock returns class names as keys, so
 * the real colour rules are read from the source CSS. Mutation to prove each assertion:
 * point `.offer` back at `--color-status-blocked-*` and the "never red" test fails; re-add a
 * `.quotation` rule and the "no .quotation rule" test fails.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const badgeCss = fs.readFileSync(path.join(here, 'Badge.module.css'), 'utf8');
const tokensCss = fs.readFileSync(path.join(here, '..', '..', 'styles', 'tokens.css'), 'utf8');

/** Declarations of the first rule whose selector list contains exactly `.name`. */
function rule(css: string, name: string): string | null {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selectors = m[1]!
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((x) => x.trim());
    if (selectors.includes(`.${name}`)) return m[2]!;
  }
  return null;
}

describe('Badge status colours (AC1)', () => {
  it.each(['offer', 'refund', 'pending', 'paid', 'claimed', 'dueSoon', 'overduePast'])(
    '.%s exists',
    (name) => {
      expect(rule(badgeCss, name)).not.toBeNull();
    },
  );

  it.each(['offer', 'refund', 'pending', 'paid', 'claimed'])(
    '.%s never references the error/blocked red tokens',
    (name) => {
      const body = rule(badgeCss, name)!;
      expect(body).not.toMatch(/--color-status-blocked-/);
      expect(body).not.toMatch(/--color-danger-/);
    },
  );

  it('.offer and .refund share the info pair', () => {
    for (const name of ['offer', 'refund']) {
      const body = rule(badgeCss, name)!;
      expect(body).toContain('background-color: var(--color-primary-bg)');
      expect(body).toContain('color: var(--color-primary-badge-text)');
    }
  });

  it('.pending is the neutral tertiary chip with a border', () => {
    const body = rule(badgeCss, 'pending')!;
    expect(body).toContain('var(--color-bg-tertiary)');
    expect(body).toContain('var(--color-text-secondary)');
    expect(body).toContain('1px solid var(--color-border)');
  });

  it('.paid uses the success badge pair', () => {
    const body = rule(badgeCss, 'paid')!;
    expect(body).toContain('var(--color-success-badge-bg)');
    expect(body).toContain('var(--color-success-badge-text)');
  });

  it('.claimed uses the alt success background and the success border', () => {
    const body = rule(badgeCss, 'claimed')!;
    expect(body).toContain('var(--color-success-badge-bg-alt)');
    expect(body).toContain('var(--color-success-badge-text)');
    expect(body).toContain('1px solid var(--color-success-border)');
  });

  it('has no .quotation rule any more', () => {
    expect(rule(badgeCss, 'quotation')).toBeNull();
  });

  it('has no legacy .overdue rule (replaced by .overduePast / .dueSoon)', () => {
    expect(rule(badgeCss, 'overdue')).toBeNull();
  });

  it('.dueSoon is the warning pair and .overduePast the danger pair', () => {
    const soon = rule(badgeCss, 'dueSoon')!;
    expect(soon).toContain('var(--color-warning-badge-bg)');
    expect(soon).toContain('var(--color-warning-text-on-light)');
    const past = rule(badgeCss, 'overduePast')!;
    expect(past).toContain('var(--color-danger-bg-strong)');
    expect(past).toContain('var(--color-danger-text-on-light)');
  });

  it('.icon is a 1em square that does not shrink and .badge has a spacing gap', () => {
    const icon = rule(badgeCss, 'icon')!;
    expect(icon).toContain('width: 1em');
    expect(icon).toContain('height: 1em');
    expect(icon).toContain('flex-shrink: 0');
    expect(rule(badgeCss, 'badge')!).toContain('gap: var(--spacing-1)');
  });

  it('every colour in the new rules is a design token (no hex / rgb literals)', () => {
    for (const name of ['offer', 'pending', 'paid', 'claimed', 'dueSoon', 'overduePast']) {
      expect(rule(badgeCss, name)!).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});

describe('dark theme contrast fix (AC1)', () => {
  it('dark --color-status-not-started-text is slate-100', () => {
    const darkStart = tokensCss.indexOf("[data-theme='dark']");
    expect(darkStart).toBeGreaterThan(-1);
    const darkBlock = tokensCss.slice(darkStart);
    expect(darkBlock).toMatch(/--color-status-not-started-text:\s*var\(--color-slate-100\)/);
    expect(darkBlock).not.toMatch(/--color-status-not-started-text:\s*var\(--color-slate-200\)/);
  });
});
