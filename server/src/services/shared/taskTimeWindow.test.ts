/**
 * Tasks list time windows (#2245, D2): every rule and the boundaries today+6 / +7 / +20 / +21.
 */

import { describe, it, expect } from '@jest/globals';
import type { WorkItemScheduleFields } from '@cornerstone/shared';
import { isTaskLate, taskTimeWindowOf } from './taskTimeWindow.js';
import { addDaysUtc } from './holdsUp.js';

const TODAY = '2026-03-10';

function fields(o: Partial<WorkItemScheduleFields> = {}): WorkItemScheduleFields {
  return {
    projectedStartDate: null,
    projectedEndDate: null,
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...o,
  };
}

const row = (status: string, startDate: string | null = '2026-03-12') => ({ status, startDate });

describe('isTaskLate', () => {
  it('is true for an unfinished task whose projection is late', () => {
    expect(isTaskLate('not_started', fields({ isLate: true }))).toBe(true);
    expect(isTaskLate('in_progress', fields({ isLate: true }))).toBe(true);
  });

  it('is false for a completed task, an on-time task and a task without a projection', () => {
    expect(isTaskLate('completed', fields({ isLate: true }))).toBe(false);
    expect(isTaskLate('not_started', fields({ isLate: false }))).toBe(false);
    expect(isTaskLate('not_started', undefined)).toBe(false);
  });
});

describe('taskTimeWindowOf', () => {
  it('a completed task is done, even when it was flagged late', () => {
    expect(taskTimeWindowOf(row('completed'), fields({ isLate: true }), TODAY)).toBe('done');
  });

  it('an unfinished late task is late, whatever its status', () => {
    expect(taskTimeWindowOf(row('not_started'), fields({ isLate: true }), TODAY)).toBe('late');
    expect(taskTimeWindowOf(row('in_progress'), fields({ isLate: true }), TODAY)).toBe('late');
  });

  it('an on-time task in progress is this week, with or without dates', () => {
    expect(taskTimeWindowOf(row('in_progress', null), fields(), TODAY)).toBe('this_week');
    expect(
      taskTimeWindowOf(
        row('in_progress'),
        fields({ projectedStartDate: addDaysUtc(TODAY, 90) }),
        TODAY,
      ),
    ).toBe('this_week');
  });

  it('a not started task without a stored start date is later, even with a forecast', () => {
    expect(taskTimeWindowOf(row('not_started', null), fields(), TODAY)).toBe('later');
    expect(
      taskTimeWindowOf(row('not_started', null), fields({ projectedStartDate: TODAY }), TODAY),
    ).toBe('later');
  });

  it.each([
    [-3, 'this_week'],
    [0, 'this_week'],
    [6, 'this_week'],
    [7, 'next_two_weeks'],
    [20, 'next_two_weeks'],
    [21, 'later'],
    [200, 'later'],
  ])('a not started task forecast to start today%+d days is %s', (offset, expected) => {
    expect(
      taskTimeWindowOf(
        row('not_started'),
        fields({ projectedStartDate: addDaysUtc(TODAY, offset) }),
        TODAY,
      ),
    ).toBe(expected);
  });

  it('follows the forecast start, not the stored start date', () => {
    expect(
      taskTimeWindowOf(
        row('not_started', '2026-03-11'),
        fields({ projectedStartDate: addDaysUtc(TODAY, 30) }),
        TODAY,
      ),
    ).toBe('later');
  });
});
