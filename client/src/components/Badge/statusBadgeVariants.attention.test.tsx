/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { ATTENTION_TIERS, BUDGET_VERDICTS, CRITICAL_LINE_LEVELS } from '@cornerstone/shared';
import enCommon from '../../i18n/en/common.json';
import deCommon from '../../i18n/de/common.json';
import { Badge } from './Badge.js';
import {
  buildAttentionTierVariants,
  buildBudgetVerdictVariants,
  buildCriticalLineVariants,
  buildCriticalSignalVariant,
} from './statusBadgeVariants.js';
import type { StatusLabelT } from './statusBadgeVariants.js';

// identity-obj-proxy: badgeStyles.<name> === '<name>'

function tFor(resources: unknown): StatusLabelT {
  return (key) => {
    let node: unknown = resources;
    for (const part of key.split('.')) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node !== 'string') throw new Error(`missing key ${key}`);
    return node;
  };
}

const t = tFor(enCommon);

describe('buildAttentionTierVariants', () => {
  const variants = buildAttentionTierVariants(t);

  it('has one entry per tier with the canonical English labels', () => {
    expect(Object.keys(variants).sort()).toEqual([...ATTENTION_TIERS].sort());
    expect(Object.fromEntries(ATTENTION_TIERS.map((k) => [k, variants[k].label]))).toEqual({
      late: 'Late',
      overdue: 'Overdue',
      due: 'Due',
      ready: 'Ready',
      follow_up: 'Follow up',
      tidy: 'Tidy up',
    });
  });

  it('maps late/overdue to red, due/ready/follow_up to amber and tidy to tidy', () => {
    expect(variants.late.className).toBe('attentionRed');
    expect(variants.overdue.className).toBe('attentionRed');
    expect(variants.due.className).toBe('attentionAmber');
    expect(variants.ready.className).toBe('attentionAmber');
    expect(variants.follow_up.className).toBe('attentionAmber');
    expect(variants.tidy.className).toBe('attentionTidy');
  });

  it('gives every tier a distinct decorative aria-hidden icon', () => {
    const shapes = new Set<string>();
    for (const tier of ATTENTION_TIERS) {
      const { container, unmount } = render(<Badge variants={variants} value={tier} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
      expect(svg).toHaveAttribute('width', '14');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      shapes.add(svg!.innerHTML);
      unmount();
    }
    expect(shapes.size).toBe(ATTENTION_TIERS.length);
  });

  it('renders the label as text next to the icon', () => {
    render(<Badge variants={variants} value="late" testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent('Late');
  });

  it('resolves German labels from the de bundle', () => {
    const de = buildAttentionTierVariants(tFor(deCommon));
    expect(de.late.label).toMatch(/\S/);
    expect(de.late.label).not.toBe('Late');
  });
});

describe('buildCriticalLineVariants', () => {
  const variants = buildCriticalLineVariants(t);

  it('has one entry per level with English labels', () => {
    expect(Object.keys(variants).sort()).toEqual([...CRITICAL_LINE_LEVELS].sort());
    expect(variants.on_track.label).toBe('On track');
    expect(variants.warning.label).toBe('Warning');
    expect(variants.critical.label).toBe('Critical');
    expect(variants.overdue.label).toBe('Overdue');
  });

  it('maps on_track to its own class, warning to amber, critical/overdue to red', () => {
    expect(variants.on_track.className).toBe('criticalOnTrack');
    expect(variants.warning.className).toBe('attentionAmber');
    expect(variants.critical.className).toBe('attentionRed');
    expect(variants.overdue.className).toBe('attentionRed');
  });

  it('has an aria-hidden icon on every level', () => {
    for (const level of CRITICAL_LINE_LEVELS) {
      const { container, unmount } = render(<Badge variants={variants} value={level} />);
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });
});

describe('buildBudgetVerdictVariants', () => {
  const variants = buildBudgetVerdictVariants(t);

  it('has only On budget and Over budget (no Tight)', () => {
    expect(Object.keys(variants).sort()).toEqual([...BUDGET_VERDICTS].sort());
    expect(variants.on_budget.label).toBe('On budget');
    expect(variants.over_budget.label).toBe('Over budget');
  });

  it('uses the verdict classes and no icon', () => {
    expect(variants.on_budget.className).toBe('verdictOnBudget');
    expect(variants.over_budget.className).toBe('verdictOverBudget');
    expect(variants.on_budget.icon).toBeUndefined();
    expect(variants.over_budget.icon).toBeUndefined();
  });
});

describe('buildCriticalSignalVariant', () => {
  it('returns only the critical chip with the schedule-critical class', () => {
    const v = buildCriticalSignalVariant(t);
    expect(Object.keys(v)).toEqual(['critical']);
    expect(v.critical.label).toBe('Critical');
    expect(v.critical.className).toBe('scheduleCritical');
  });
});
