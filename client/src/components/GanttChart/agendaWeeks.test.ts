import { describe, it, expect } from '@jest/globals';
import { buildAgendaWeeks, isoWeekNumber, weekBar } from './agendaWeeks.js';
import {
  makeMilestone,
  makePurchase,
  makeTask,
  makeTimeline,
} from '../../test/scheduleFixtures.js';

// 2026-03-02 is a Monday
const TODAY = '2026-03-04';

describe('isoWeekNumber', () => {
  it('numbers ISO weeks, including the year boundaries', () => {
    expect(isoWeekNumber('2026-03-02')).toBe(10);
    expect(isoWeekNumber('2026-03-08')).toBe(10);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2024-12-30')).toBe(1);
  });
});

describe('buildAgendaWeeks', () => {
  it('returns no weeks for an empty timeline', () => {
    expect(buildAgendaWeeks(makeTimeline(), TODAY)).toEqual([]);
  });

  it('puts a task in every week it covers, once each, oldest first', () => {
    const weeks = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('a', { projectedStartDate: '2026-03-04', projectedEndDate: '2026-03-17' }),
        ],
      }),
      TODAY,
    );
    expect(weeks.map((w) => w.monday)).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
    expect(weeks.map((w) => w.sunday)).toEqual(['2026-03-08', '2026-03-15', '2026-03-22']);
    expect(weeks.map((w) => w.number)).toEqual([10, 11, 12]);
    for (const week of weeks) expect(week.items.map((i) => i.key)).toEqual(['task:a']);
  });

  it('marks the current week and the target week', () => {
    const weeks = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('a', { projectedStartDate: '2026-03-04', projectedEndDate: '2026-03-17' }),
        ],
      }),
      TODAY,
    );
    expect(weeks.map((w) => w.isCurrent)).toEqual([true, false, false]);
    expect(weeks.map((w) => w.isTarget)).toEqual([true, false, false]);
  });

  it('targets the first later week when this week is empty, and the last week when all are past', () => {
    const later = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('a', { projectedStartDate: '2026-02-02', projectedEndDate: '2026-02-03' }),
          makeTask('b', { projectedStartDate: '2026-03-16', projectedEndDate: '2026-03-17' }),
        ],
      }),
      TODAY,
    );
    expect(later.find((w) => w.isTarget)!.monday).toBe('2026-03-16');
    expect(later.some((w) => w.isCurrent)).toBe(false);

    const past = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('a', { projectedStartDate: '2026-02-02', projectedEndDate: '2026-02-03' }),
          makeTask('b', { projectedStartDate: '2026-02-09', projectedEndDate: '2026-02-10' }),
        ],
      }),
      TODAY,
    );
    expect(past.filter((w) => w.isTarget).map((w) => w.monday)).toEqual(['2026-02-09']);
  });

  it('uses actual dates over the forecast and swaps a reversed range', () => {
    const [week] = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('a', {
            actualStartDate: '2026-03-03',
            actualEndDate: '2026-03-04',
            projectedStartDate: '2026-04-01',
            projectedEndDate: '2026-04-02',
          }),
        ],
      }),
      TODAY,
    );
    expect(week!.items[0]).toMatchObject({ start: '2026-03-03', end: '2026-03-04' });
    const [reversed] = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('b', { projectedStartDate: '2026-03-06', projectedEndDate: '2026-03-04' }),
        ],
      }),
      TODAY,
    );
    expect(reversed!.items[0]).toMatchObject({ start: '2026-03-04', end: '2026-03-06' });
  });

  it('handles a task with only one date and skips a task with none', () => {
    const weeks = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('onlyStart', { projectedStartDate: '2026-03-03', projectedEndDate: null }),
          makeTask('onlyEnd', { projectedStartDate: null, projectedEndDate: '2026-03-10' }),
          makeTask('none', { projectedStartDate: null, projectedEndDate: null }),
        ],
      }),
      TODAY,
    );
    const keys = weeks.flatMap((w) => w.items.map((i) => i.key));
    expect(keys).toEqual(['task:onlyStart', 'task:onlyEnd']);
  });

  it('places a milestone on its completion day, else its projection, else its target', () => {
    const weeks = buildAgendaWeeks(
      makeTimeline({
        milestones: [
          makeMilestone(1, { isCompleted: true, completedAt: '2026-03-03T10:00:00.000Z' }),
          makeMilestone(2, { projectedDate: '2026-03-10', targetDate: '2026-03-30' }),
          makeMilestone(3, { targetDate: '2026-03-17' }),
        ],
      }),
      TODAY,
    );
    const days = weeks.flatMap((w) => w.items.map((i) => [i.key, i.start, i.end]));
    expect(days).toEqual([
      ['milestone:1', '2026-03-03', '2026-03-03'],
      ['milestone:2', '2026-03-10', '2026-03-10'],
      ['milestone:3', '2026-03-17', '2026-03-17'],
    ]);
  });

  it('places a purchase by actual, else target, else earliest delivery and ignores undated ones', () => {
    const weeks = buildAgendaWeeks(
      makeTimeline({
        householdItems: [
          makePurchase('actual', {
            actualDeliveryDate: '2026-03-03',
            targetDeliveryDate: '2026-04-01',
            latestDeliveryDate: '2026-04-09',
          }),
          makePurchase('window', {
            targetDeliveryDate: '2026-03-10',
            latestDeliveryDate: '2026-03-12',
          }),
          makePurchase('earliest', { earliestDeliveryDate: '2026-03-17' }),
          makePurchase('badWindow', {
            targetDeliveryDate: '2026-03-24',
            latestDeliveryDate: '2026-03-20',
          }),
          makePurchase('undated'),
        ],
      }),
      TODAY,
    );
    const rows = weeks.flatMap((w) => w.items.map((i) => [i.key, i.start, i.end]));
    expect(rows).toEqual([
      ['purchase:actual', '2026-03-03', '2026-03-03'],
      ['purchase:window', '2026-03-10', '2026-03-12'],
      ['purchase:earliest', '2026-03-17', '2026-03-17'],
      ['purchase:badWindow', '2026-03-24', '2026-03-24'],
    ]);
  });

  it('sorts a week by start, end, kind (task, milestone, purchase) then title', () => {
    const [week] = buildAgendaWeeks(
      makeTimeline({
        workItems: [
          makeTask('t2', {
            title: 'Beta',
            projectedStartDate: '2026-03-03',
            projectedEndDate: '2026-03-04',
          }),
          makeTask('t1', {
            title: 'Alpha',
            projectedStartDate: '2026-03-03',
            projectedEndDate: '2026-03-04',
          }),
          makeTask('long', {
            title: 'Long',
            projectedStartDate: '2026-03-03',
            projectedEndDate: '2026-03-06',
          }),
          makeTask('early', {
            title: 'Early',
            projectedStartDate: '2026-03-02',
            projectedEndDate: '2026-03-05',
          }),
        ],
        milestones: [makeMilestone(1, { targetDate: '2026-03-03', projectedDate: '2026-03-03' })],
        householdItems: [makePurchase('p', { targetDeliveryDate: '2026-03-03' })],
      }),
      TODAY,
    );
    expect(week!.items.map((i) => i.key)).toEqual([
      'task:early',
      'milestone:1',
      'purchase:p',
      'task:t1',
      'task:t2',
      'task:long',
    ]);
  });
});

describe('weekBar', () => {
  const MONDAY = '2026-03-02';

  it('gives a one-day item one seventh of the week and centres it on its day', () => {
    const bar = weekBar({ start: '2026-03-04', end: '2026-03-04' }, MONDAY);
    expect(bar.leftPct).toBeCloseTo((2 / 7) * 100);
    expect(bar.widthPct).toBeCloseTo((1 / 7) * 100);
    expect(bar.centrePct).toBeCloseTo((2.5 / 7) * 100);
  });

  it('clips an item that starts before and ends after the week to the whole week', () => {
    const bar = weekBar({ start: '2026-02-20', end: '2026-03-30' }, MONDAY);
    expect(bar.leftPct).toBe(0);
    expect(bar.widthPct).toBeCloseTo(100);
  });

  it('covers only the part inside the week', () => {
    const bar = weekBar({ start: '2026-03-06', end: '2026-03-20' }, MONDAY);
    expect(bar.leftPct).toBeCloseTo((4 / 7) * 100);
    expect(bar.widthPct).toBeCloseTo((3 / 7) * 100);
  });
});
