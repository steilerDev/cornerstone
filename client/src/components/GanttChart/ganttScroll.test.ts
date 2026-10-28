import { describe, it, expect } from '@jest/globals';
import {
  anchorFromScroll,
  dateAtX,
  firstCurrentRowIndex,
  scrollFromAnchor,
  type GanttScrollGeometry,
} from './ganttScroll.js';
import { COLUMN_WIDTHS, ROW_HEIGHT, computeChartRange, type GanttRow } from './ganttUtils.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';
import { makeMilestone, makeTask } from '../../test/scheduleFixtures.js';

const RANGE = computeChartRange('2026-03-01', '2026-04-30', 'day');
const KEYS: (ScheduleRowKey | null)[] = [null, 'task:a', 'task:b', null, 'task:c'];
const GEO: GanttScrollGeometry = { chartRange: RANGE, zoom: 'day', rowKeys: KEYS };

function taskRow(id: string, o: Parameters<typeof makeTask>[1] = {}): GanttRow {
  return { kind: 'workItem', key: `task:${id}`, item: makeTask(id, o) };
}

describe('dateAtX', () => {
  it('maps a pixel to the date under it (day zoom)', () => {
    // range starts 3 days before 2026-03-01
    expect(dateAtX(0, RANGE, 'day')).toBe('2026-02-26');
    expect(dateAtX(3 * COLUMN_WIDTHS.day, RANGE, 'day')).toBe('2026-03-01');
  });

  it('clamps a negative x to the range start', () => {
    expect(dateAtX(-500, RANGE, 'day')).toBe('2026-02-26');
  });

  it('honours a custom column width', () => {
    expect(dateAtX(100, RANGE, 'day', 10)).toBe('2026-03-08');
  });
});

describe('anchorFromScroll', () => {
  it('anchors on the date at the left edge and the row at the top with its offset', () => {
    const anchor = anchorFromScroll(3 * COLUMN_WIDTHS.day, ROW_HEIGHT * 2 + 10, GEO);
    expect(anchor).toEqual({ date: '2026-03-01', rowKey: 'task:b', rowOffset: 10 });
  });

  it('anchors a group header at the top on the row below it', () => {
    const anchor = anchorFromScroll(0, ROW_HEIGHT * 3 + 5, GEO);
    expect(anchor.rowKey).toBe('task:c');
    expect(anchor.rowOffset).toBe(5 - ROW_HEIGHT);
  });

  it('has no row when only group headers remain below, or there are no rows', () => {
    expect(anchorFromScroll(0, ROW_HEIGHT * 10, GEO)).toMatchObject({ rowKey: null, rowOffset: 0 });
    expect(anchorFromScroll(0, 0, { ...GEO, rowKeys: [] }).rowKey).toBeNull();
  });

  it('treats a negative scrollTop as the top', () => {
    expect(anchorFromScroll(0, -40, GEO).rowKey).toBe('task:a');
  });
});

describe('scrollFromAnchor', () => {
  it('turns an anchor back into pixels', () => {
    const pos = scrollFromAnchor({ date: '2026-03-01', rowKey: 'task:b', rowOffset: 10 }, GEO);
    expect(pos).toEqual({ left: 3 * COLUMN_WIDTHS.day, top: ROW_HEIGHT * 2 + 10 });
  });

  it('round-trips with anchorFromScroll', () => {
    const left = 12 * COLUMN_WIDTHS.day;
    const top = ROW_HEIGHT + 7;
    expect(scrollFromAnchor(anchorFromScroll(left, top, GEO), GEO)).toEqual({ left, top });
  });

  it('keeps the date but reports no top when the row is gone', () => {
    const pos = scrollFromAnchor({ date: '2026-03-01', rowKey: 'task:gone', rowOffset: 0 }, GEO);
    expect(pos).toEqual({ left: 3 * COLUMN_WIDTHS.day, top: null });
    expect(
      scrollFromAnchor({ date: '2026-03-01', rowKey: null, rowOffset: 0 }, GEO).top,
    ).toBeNull();
  });

  it('never returns a negative position', () => {
    const pos = scrollFromAnchor({ date: '2020-01-01', rowKey: 'task:a', rowOffset: -999 }, GEO);
    expect(pos.left).toBe(0);
    expect(pos.top).toBe(0);
  });

  it('keeps the anchor date when the chart range changes (AC6)', () => {
    const anchor = anchorFromScroll(20 * COLUMN_WIDTHS.day, 0, GEO);
    const wider = {
      ...GEO,
      chartRange: computeChartRange('2026-01-01', '2026-06-30', 'day'),
    };
    const { left } = scrollFromAnchor(anchor, wider);
    expect(dateAtX(left, wider.chartRange, 'day')).toBe(anchor.date);
  });
});

describe('firstCurrentRowIndex', () => {
  const today = new Date(2026, 2, 10, 12);

  it('picks the first in-progress or late task', () => {
    const rows = [
      taskRow('future', { projectedStartDate: '2026-04-01' }),
      taskRow('active', { status: 'in_progress' }),
      taskRow('late', { isLate: true, lateDays: 2 }),
    ];
    expect(firstCurrentRowIndex(rows, today)).toBe(1);
  });

  it('skips group headers, milestones and purchases when counting', () => {
    const rows: GanttRow[] = [
      { kind: 'group', groupId: 'g', name: 'G', count: 1, collapsed: false },
      { kind: 'milestone', key: 'milestone:1', milestone: makeMilestone(1) },
      taskRow('late', { isHeldUp: true }),
    ];
    expect(firstCurrentRowIndex(rows, today)).toBe(2);
  });

  it('falls back to the first not-started task starting today or later', () => {
    const rows = [
      taskRow('past', { projectedStartDate: '2026-03-01' }),
      taskRow('today', { projectedStartDate: '2026-03-10' }),
      taskRow('later', { projectedStartDate: '2026-03-20' }),
    ];
    expect(firstCurrentRowIndex(rows, today)).toBe(1);
  });

  it('is -1 with nothing current or upcoming', () => {
    expect(firstCurrentRowIndex([], today)).toBe(-1);
    expect(
      firstCurrentRowIndex(
        [
          taskRow('undated', { projectedStartDate: null }),
          taskRow('done', { status: 'completed' }),
          taskRow('past', { projectedStartDate: '2026-03-01' }),
        ],
        today,
      ),
    ).toBe(-1);
  });
});
