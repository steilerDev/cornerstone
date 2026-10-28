import {
  SCHEDULE_DURATION_DAYS_MAX,
  SCHEDULE_OVERRIDES_MAX,
  SCHEDULE_SIGNALS,
} from './schedule.js';
import type { ScheduleOverride, SchedulePreviewResponse } from './schedule.js';

describe('schedule constants', () => {
  it('caps a preview at 50 overrides (contract 3)', () => {
    expect(SCHEDULE_OVERRIDES_MAX).toBe(50);
  });

  it('caps an override duration at 3650 days (contract 3)', () => {
    expect(SCHEDULE_DURATION_DAYS_MAX).toBe(3650);
  });

  it('lists the derived signals', () => {
    expect([...SCHEDULE_SIGNALS]).toEqual(['late', 'held_up', 'critical']);
  });

  it('lets an override set any one of start, end and duration', () => {
    const overrides: ScheduleOverride[] = [
      { workItemId: 'a', startDate: '2026-03-01' },
      { workItemId: 'b', endDate: '2026-03-02' },
      { workItemId: 'c', durationDays: 3 },
    ];
    expect(overrides).toHaveLength(3);
  });

  it('extends the schedule response with the impact', () => {
    const response: Pick<SchedulePreviewResponse, 'impact'> = {
      impact: {
        movedItems: [],
        milestones: [],
        projectEnd: { previousDate: null, newDate: null },
        holdsUp: { count: 0, startingWithin14Days: 0 },
      },
    };
    expect(response.impact.projectEnd.newDate).toBeNull();
  });
});
