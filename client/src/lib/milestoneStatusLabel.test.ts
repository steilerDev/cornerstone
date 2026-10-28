import { describe, it, expect } from '@jest/globals';
import enCommon from '../i18n/en/common.json';
import {
  milestoneBadgeProps,
  milestoneDisplayStatus,
  milestoneStatusLabel,
} from './milestoneStatusLabel.js';
import type { BadgeVariantMap } from '../components/Badge/Badge.js';
import type { MilestoneLabelT } from './milestoneStatusLabel.js';

/** Real-resource t(): resolves the key in en common and interpolates {{days}}. */
const t: MilestoneLabelT = (key, options) => {
  const node = key
    .split('.')
    .reduce<unknown>((n, part) => (n as Record<string, unknown> | undefined)?.[part], enCommon);
  if (typeof node !== 'string') throw new Error(`missing ${key}`);
  return node.replace('{{days}}', String(options.days));
};

describe('milestoneDisplayStatus', () => {
  it('is reached when completed, regardless of dates', () => {
    expect(
      milestoneDisplayStatus({
        isCompleted: true,
        targetDate: '2026-03-01',
        projectedDate: '2026-04-01',
      }),
    ).toEqual({ status: 'reached', days: 0 });
  });

  it('is late with the day count when projected after target', () => {
    expect(
      milestoneDisplayStatus({
        isCompleted: false,
        targetDate: '2026-03-01',
        projectedDate: '2026-03-04',
      }),
    ).toEqual({ status: 'late', days: 3 });
  });

  it('is early with the day count when projected before target', () => {
    expect(
      milestoneDisplayStatus({
        isCompleted: false,
        targetDate: '2026-03-10',
        projectedDate: '2026-03-08',
      }),
    ).toEqual({ status: 'early', days: 2 });
  });

  it('counts days across a month boundary and a DST change without drift', () => {
    expect(
      milestoneDisplayStatus({
        isCompleted: false,
        targetDate: '2026-03-28',
        projectedDate: '2026-04-02',
      }),
    ).toEqual({ status: 'late', days: 5 });
  });

  it('is upcoming when there is no projection', () => {
    expect(
      milestoneDisplayStatus({ isCompleted: false, targetDate: '2026-03-01', projectedDate: null }),
    ).toEqual({ status: 'upcoming', days: 0 });
  });

  it('is upcoming (and does not throw) when projectedDate is undefined', () => {
    const milestone = {
      isCompleted: false,
      targetDate: '2026-03-01',
      projectedDate: undefined,
    } as unknown as Parameters<typeof milestoneDisplayStatus>[0];
    expect(() => milestoneDisplayStatus(milestone)).not.toThrow();
    expect(milestoneDisplayStatus(milestone)).toEqual({ status: 'upcoming', days: 0 });
  });

  it('is upcoming when projected equals target', () => {
    expect(
      milestoneDisplayStatus({
        isCompleted: false,
        targetDate: '2026-03-01',
        projectedDate: '2026-03-01',
      }),
    ).toEqual({ status: 'upcoming', days: 0 });
  });
});

describe('milestoneStatusLabel', () => {
  it('returns the canonical words', () => {
    expect(
      milestoneStatusLabel(t, { isCompleted: true, targetDate: '2026-03-01', projectedDate: null }),
    ).toBe('Reached');
    expect(
      milestoneStatusLabel(t, {
        isCompleted: false,
        targetDate: '2026-03-01',
        projectedDate: null,
      }),
    ).toBe('Upcoming');
    expect(
      milestoneStatusLabel(t, {
        isCompleted: false,
        targetDate: '2026-03-01',
        projectedDate: '2026-03-04',
      }),
    ).toBe('Late · 3 d');
    expect(
      milestoneStatusLabel(t, {
        isCompleted: false,
        targetDate: '2026-03-10',
        projectedDate: '2026-03-08',
      }),
    ).toBe('Early · 2 d');
  });
});

describe('milestoneBadgeProps', () => {
  const variants = {
    upcoming: { label: 'Upcoming', className: 'u' },
    late: { label: 'Late', className: 'l' },
    early: { label: 'Early', className: 'e' },
    reached: { label: 'Reached', className: 'r' },
  } as unknown as BadgeVariantMap;

  it('uses the display status as the value, with the full word as that status label', () => {
    const props = milestoneBadgeProps(variants, t, {
      isCompleted: false,
      targetDate: '2026-03-01',
      projectedDate: '2026-03-04',
    });

    expect(props.value).toBe('late');
    expect(props.variants.late).toEqual({ label: 'Late · 3 d', className: 'l' });
  });

  it('leaves the other statuses as they were, and the input untouched', () => {
    const props = milestoneBadgeProps(variants, t, {
      isCompleted: true,
      targetDate: '2026-03-01',
      projectedDate: null,
    });

    expect(props.value).toBe('reached');
    expect(props.variants.late).toBe(variants.late);
    expect(props.variants.upcoming).toBe(variants.upcoming);
    expect(variants.reached).toEqual({ label: 'Reached', className: 'r' });
  });

  it('says Upcoming and Early with their words', () => {
    expect(
      milestoneBadgeProps(variants, t, { isCompleted: false, targetDate: '2026-03-01' }).variants
        .upcoming!.label,
    ).toBe('Upcoming');
    expect(
      milestoneBadgeProps(variants, t, {
        isCompleted: false,
        targetDate: '2026-03-10',
        projectedDate: '2026-03-08',
      }).variants.early!.label,
    ).toBe('Early · 2 d');
  });
});
