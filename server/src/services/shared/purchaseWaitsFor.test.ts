/**
 * purchaseWaitsForOf (#2249): the first unfinished predecessor of a purchase and how many more
 * follow it. Pure; the completed milestone ids are supplied by the caller.
 *
 * Mutations these tests catch:
 *  - a completed task or milestone still counted as waiting;
 *  - end date sorted ascending instead of descending, or a missing end date sorted first;
 *  - the tie-breaks (title, then id) dropped, which would make the pick depend on row order;
 *  - `more` counting the shown predecessor itself.
 */

import { describe, it, expect } from '@jest/globals';
import type { HouseholdItemDepDetail } from '@cornerstone/shared';
import { purchaseWaitsForOf } from './purchaseWaitsFor.js';

const NONE: ReadonlySet<string> = new Set();

function task(
  id: string,
  title: string,
  endDate: string | null,
  status = 'in_progress',
): HouseholdItemDepDetail {
  return {
    householdItemId: 'hi-1',
    predecessorType: 'work_item',
    predecessorId: id,
    predecessor: { id, title, status, endDate, area: null },
  };
}

function milestone(id: string, title: string, endDate: string | null): HouseholdItemDepDetail {
  return {
    householdItemId: 'hi-1',
    predecessorType: 'milestone',
    predecessorId: id,
    predecessor: { id, title, status: null, endDate, area: null },
  };
}

describe('purchaseWaitsForOf', () => {
  it('returns null without predecessors', () => {
    expect(purchaseWaitsForOf([], NONE)).toBeNull();
  });

  it('returns null when every predecessor is finished', () => {
    const deps = [task('t1', 'Plaster', '2026-03-01', 'completed'), milestone('7', 'Shell', null)];
    expect(purchaseWaitsForOf(deps, new Set(['7']))).toBeNull();
  });

  it('returns the only unfinished task with nothing more', () => {
    expect(purchaseWaitsForOf([task('t1', 'Plaster', '2026-03-01')], NONE)).toEqual({
      type: 'work_item',
      id: 't1',
      title: 'Plaster',
      more: 0,
    });
  });

  it('skips a completed task and counts the rest as more', () => {
    const deps = [
      task('t1', 'Plaster', '2026-03-01', 'completed'),
      task('t2', 'Paint', '2026-03-05'),
      task('t3', 'Floor', '2026-03-02'),
    ];
    expect(purchaseWaitsForOf(deps, NONE)).toEqual({
      type: 'work_item',
      id: 't2',
      title: 'Paint',
      more: 1,
    });
  });

  it('keeps an unfinished milestone and drops a completed one', () => {
    const deps = [milestone('7', 'Shell done', '2026-04-01'), milestone('8', 'Roof done', null)];
    expect(purchaseWaitsForOf(deps, new Set(['7']))).toEqual({
      type: 'milestone',
      id: '8',
      title: 'Roof done',
      more: 0,
    });
  });

  it('picks the latest end date first, whatever the input order', () => {
    const early = task('t1', 'Early', '2026-03-01');
    const late = task('t2', 'Late', '2026-05-01');
    expect(purchaseWaitsForOf([early, late], NONE)?.id).toBe('t2');
    expect(purchaseWaitsForOf([late, early], NONE)?.id).toBe('t2');
  });

  it('sorts a predecessor without an end date after one with a date', () => {
    const dated = task('t1', 'Dated', '2026-03-01');
    const open = task('t2', 'Open', null);
    expect(purchaseWaitsForOf([open, dated], NONE)?.id).toBe('t1');
    expect(purchaseWaitsForOf([dated, open], NONE)).toMatchObject({ id: 't1', more: 1 });
  });

  it('breaks an end date tie by title, then by id', () => {
    const b = task('t1', 'Beta', '2026-03-01');
    const a = task('t2', 'Alpha', '2026-03-01');
    expect(purchaseWaitsForOf([b, a], NONE)?.id).toBe('t2');
    const sameTitleHigh = task('t9', 'Same', null);
    const sameTitleLow = task('t3', 'Same', null);
    expect(purchaseWaitsForOf([sameTitleHigh, sameTitleLow], NONE)?.id).toBe('t3');
  });

  it('mixes tasks and milestones in one ordering and does not mutate the input', () => {
    const deps = [task('t1', 'Paint', '2026-03-05'), milestone('7', 'Handover', '2026-06-01')];
    const copy = [...deps];
    expect(purchaseWaitsForOf(deps, NONE)).toEqual({
      type: 'milestone',
      id: '7',
      title: 'Handover',
      more: 1,
    });
    expect(deps).toEqual(copy);
  });
});
