import { describe, it, expect } from '@jest/globals';
import { makeAttention, makeRow, AREA_KITCHEN } from '../../test/attentionFixtures.js';
import { catchUpRows } from './catchUpRows.js';

const holdsUp = { count: 2, startingWithin14Days: 1 };
const noHold = { count: 0, startingWithin14Days: 0 };

describe('catchUpRows', () => {
  it('keeps N1 and N2 task rows in rows order and drops every other rule', () => {
    const n1 = makeRow('N1');
    const n2 = makeRow('N2');
    const data = makeAttention([makeRow('N3'), n2, makeRow('N4'), n1, makeRow('N10')]);
    expect(catchUpRows(data).map((r) => r.key)).toEqual([n2.key, n1.key]);
  });

  it('expands an N2 group into one synthesized Start/Reschedule row per member', () => {
    const group = makeRow('N2', {
      subject: { type: 'group', id: 'g-1', label: null, area: null },
      params: {
        kind: 'group',
        plannedStartDate: '2026-03-02',
        items: [
          { id: 'wi-7', label: 'Task G', area: AREA_KITCHEN, daysLate: 8, holdsUp },
          { id: 'wi-8', label: 'Task H', area: null, daysLate: 8, holdsUp: noHold },
        ],
      },
    });
    const rows = catchUpRows(makeAttention([group]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      key: 'N2:work_item:wi-7',
      rule: 'N2',
      tier: 'late',
      severity: 'red',
      subject: { type: 'work_item', id: 'wi-7', label: 'Task G', area: AREA_KITCHEN },
      date: '2026-03-02',
      amount: null,
      holdsUp,
      params: {
        rule: 'N2',
        kind: 'task',
        plannedStartDate: '2026-03-02',
        projectedStartDate: null,
        daysLate: 8,
        companyName: null,
      },
      actions: ['start', 'reschedule'],
      link: { route: 'workItem', params: { id: 'wi-7' }, query: {} },
      snoozedUntil: null,
    });
    expect(rows[1]!.key).toBe('N2:work_item:wi-8');
  });

  it('leaves snoozed rows out, groups included', () => {
    const snoozedTask = makeRow('N1', { snoozedUntil: '2026-03-17' });
    const snoozedGroup = makeRow('N2', {
      subject: { type: 'group', id: 'g-2', label: null, area: null },
      snoozedUntil: '2026-03-17',
      params: {
        kind: 'group',
        plannedStartDate: '2026-03-02',
        items: [{ id: 'wi-9', label: 'Task I', area: null, daysLate: 1, holdsUp }],
      },
    });
    expect(catchUpRows(makeAttention([snoozedTask, snoozedGroup]))).toEqual([]);
  });

  it('ignores Tidy up rows (they are not in rows)', () => {
    expect(catchUpRows(makeAttention([], [makeRow('H4')]))).toEqual([]);
  });
});
