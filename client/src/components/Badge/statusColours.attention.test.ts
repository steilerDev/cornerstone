import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * #2230 colour pins for the attention tiers, critical-line levels, budget verdict and critical
 * signal. The CSS-module mock returns class names as keys, so the real rules are read from CSS.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const badgeCss = fs.readFileSync(path.join(here, 'Badge.module.css'), 'utf8');

function rule(css: string, name: string): string | null {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((x) => x.trim());
    if (selectors.includes(`.${name}`)) return m[2]!;
  }
  return null;
}

const PAIRS: Array<[string, string, string]> = [
  ['attentionRed', '--color-status-blocked-bg', '--color-status-blocked-text'],
  ['attentionAmber', '--color-warning-badge-bg', '--color-warning-badge-text'],
  ['attentionTidy', '--color-status-not-started-bg', '--color-status-not-started-text'],
  ['criticalOnTrack', '--color-status-completed-bg', '--color-status-completed-text'],
  ['verdictOnBudget', '--color-success-badge-bg', '--color-success-badge-text'],
  ['verdictOverBudget', '--color-status-blocked-bg', '--color-status-blocked-text'],
  ['scheduleCritical', '--color-status-blocked-bg', '--color-status-blocked-text'],
];

describe('#2230 badge colour pairs', () => {
  it.each(PAIRS)('.%s uses the %s / %s token pair', (name, bg, text) => {
    const body = rule(badgeCss, name);
    expect(body).not.toBeNull();
    expect(body).toContain(`background-color: var(${bg})`);
    expect(body).toContain(`color: var(${text})`);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it('removed the BudgetHealthIndicator classes', () => {
    for (const name of ['budgetHealthOnBudget', 'budgetHealthAtRisk', 'budgetHealthOverBudget']) {
      expect(rule(badgeCss, name)).toBeNull();
    }
  });
});
