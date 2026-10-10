import { describe, it, expect } from '@jest/globals';
import enCommon from '../i18n/en/common.json';
import { milestoneDisplayStatus, milestoneStatusLabel } from './milestoneStatusLabel.js';
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
