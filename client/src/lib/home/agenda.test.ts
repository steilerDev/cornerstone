import { describe, it, expect } from '@jest/globals';
import { makeAgendaItem, makeRow } from '../../test/attentionFixtures.js';
import { addDays, dropAttentionRepeats, groupAgendaByDay, splitWeek } from './agenda.js';

const noHold = { count: 0, startingWithin14Days: 0 };

describe('dropAttentionRepeats', () => {
  const start = makeAgendaItem('starts', '2026-03-11', 'wi-1');
  const payment = makeAgendaItem('payment', '2026-03-12', 'inv-1');
  const milestone = makeAgendaItem('milestone', '2026-03-13', '7');
  const other = makeAgendaItem('delivery', '2026-03-14', 'hi-9');

  it('drops items whose type and id match an attention row subject', () => {
    const rows = [makeRow('N1'), makeRow('N4')];
    const kept = dropAttentionRepeats([start, payment, milestone, other], rows);
    expect(kept.map((i) => i.key)).toEqual([milestone.key, other.key]);
  });

  it('matches on type AND id: the same id under another type survives', () => {
    const sameId = makeAgendaItem('milestone', '2026-03-13', 'wi-1');
    expect(dropAttentionRepeats([sameId], [makeRow('N1')])).toEqual([sameId]);
  });

  it('counts the members of an N2 group as work_item subjects', () => {
    const group = makeRow('N2', {
      subject: { type: 'group', id: 'g-1', label: null, area: null },
      params: {
        kind: 'group',
        plannedStartDate: '2026-03-02',
        items: [{ id: 'wi-1', label: 'Task A', area: null, daysLate: 3, holdsUp: noHold }],
      },
    });
    expect(dropAttentionRepeats([start, other], [group])).toEqual([other]);
  });

  it('drops nothing while the rows are unknown (loading or failed)', () => {
    expect(dropAttentionRepeats([start, other], null)).toEqual([start, other]);
  });

  it('returns a copy, never the input array', () => {
    const input = [start];
    expect(dropAttentionRepeats(input, null)).not.toBe(input);
  });
});

describe('groupAgendaByDay', () => {
  it('groups by date, ascending, omitting empty days', () => {
    const a = makeAgendaItem('starts', '2026-03-12', 'a');
    const b = makeAgendaItem('ends', '2026-03-10', 'b');
    const c = makeAgendaItem('payment', '2026-03-12', 'c');
    expect(groupAgendaByDay([a, b, c], '2026-03-10', '2026-03-30')).toEqual([
      { date: '2026-03-10', items: [b] },
      { date: '2026-03-12', items: [a, c] },
    ]);
  });

  it('keeps both bounds and drops items outside [from, to]', () => {
    const inFrom = makeAgendaItem('starts', '2026-03-10', 'a');
    const inTo = makeAgendaItem('starts', '2026-03-30', 'b');
    const before = makeAgendaItem('starts', '2026-03-09', 'c');
    const after = makeAgendaItem('starts', '2026-03-31', 'd');
    const days = groupAgendaByDay([before, inFrom, inTo, after], '2026-03-10', '2026-03-30');
    expect(days.map((d) => d.date)).toEqual(['2026-03-10', '2026-03-30']);
  });

  it('is empty for no items', () => {
    expect(groupAgendaByDay([], '2026-03-10', '2026-03-30')).toEqual([]);
  });
});

describe('addDays', () => {
  it('adds whole days across month and year ends', () => {
    expect(addDays('2026-03-10', 6)).toBe('2026-03-16');
    expect(addDays('2026-03-28', 5)).toBe('2026-04-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('is not shifted by a DST change', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('subtracts with a negative count', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('splitWeek', () => {
  const mk = (date: string) => ({ date, items: [makeAgendaItem('starts', date, date)] });

  it('puts today..today+6 into week and the rest into next', () => {
    const days = ['2026-03-10', '2026-03-16', '2026-03-17', '2026-03-30'].map(mk);
    const { week, next } = splitWeek(days, '2026-03-10');
    expect(week.map((d) => d.date)).toEqual(['2026-03-10', '2026-03-16']);
    expect(next.map((d) => d.date)).toEqual(['2026-03-17', '2026-03-30']);
  });

  it('returns two empty lists for no days', () => {
    expect(splitWeek([], '2026-03-10')).toEqual({ week: [], next: [] });
  });
});
