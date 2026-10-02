/**
 * Unit tests for client/src/lib/reportPdf/partPlan.ts (#2161): maximum-file-size parsing and the
 * ordered greedy part planner.
 *
 * Planner fixtures use L = 1000, part-1 overhead p1 = 100 and continuation overhead c = 50, so
 * part 1 has 900 bytes of attachment room and every continuation 950.
 */
import { describe, it, expect } from '@jest/globals';
import {
  BYTES_PER_MB,
  parseMaxFileSizeInput,
  planReportParts,
  shiftLastItem,
  type PartPlan,
  type PlanItem,
} from './partPlan.js';

describe('BYTES_PER_MB', () => {
  it('is the decimal megabyte (10^6 bytes)', () => {
    expect(BYTES_PER_MB).toBe(1_000_000);
  });
});

describe('parseMaxFileSizeInput', () => {
  it.each([[''], ['  '], ['\t\n']])('treats %j as empty (no limit)', (raw) => {
    expect(parseMaxFileSizeInput(raw)).toEqual({ status: 'empty' });
  });

  it('parses a whole number of MB', () => {
    expect(parseMaxFileSizeInput('10')).toEqual({ status: 'valid', bytes: 10_000_000 });
  });

  it('parses a one-decimal value with a dot', () => {
    expect(parseMaxFileSizeInput('9.5')).toEqual({ status: 'valid', bytes: 9_500_000 });
  });

  it('parses a one-decimal value with a comma', () => {
    expect(parseMaxFileSizeInput('9,5')).toEqual({ status: 'valid', bytes: 9_500_000 });
  });

  it('accepts a trailing separator ("1." means 1 MB)', () => {
    expect(parseMaxFileSizeInput('1.')).toEqual({ status: 'valid', bytes: 1_000_000 });
    expect(parseMaxFileSizeInput('1,')).toEqual({ status: 'valid', bytes: 1_000_000 });
  });

  it('trims surrounding whitespace', () => {
    expect(parseMaxFileSizeInput('  2 ')).toEqual({ status: 'valid', bytes: 2_000_000 });
  });

  it('rounds floating-point noise to whole bytes ("1.1" is exactly 1,100,000)', () => {
    expect(parseMaxFileSizeInput('1.1')).toEqual({ status: 'valid', bytes: 1_100_000 });
  });

  it('accepts exactly 1 as the minimum', () => {
    expect(parseMaxFileSizeInput('1')).toEqual({ status: 'valid', bytes: 1_000_000 });
    expect(parseMaxFileSizeInput('1.0')).toEqual({ status: 'valid', bytes: 1_000_000 });
  });

  it.each([['0.9'], ['0'], ['0.0'], ['00']])('rejects %j as below the 1 MB minimum', (raw) => {
    expect(parseMaxFileSizeInput(raw)).toEqual({ status: 'invalid', reason: 'min' });
  });

  it.each([['1.25'], ['9,55'], ['2.00']])('rejects %j for more than one decimal', (raw) => {
    expect(parseMaxFileSizeInput(raw)).toEqual({ status: 'invalid', reason: 'decimals' });
  });

  it.each([['-1'], ['abc'], ['1e3'], ['.5'], ['1.2.3'], ['1,2,3'], ['5 MB'], ['+3'], ['1 0']])(
    'rejects %j as not a number',
    (raw) => {
      expect(parseMaxFileSizeInput(raw)).toEqual({ status: 'invalid', reason: 'invalid' });
    },
  );
});

const L = 1000;
const P1 = 100;
const C = 50;

function plan(items: PlanItem[], extra: { fixedPartCounts?: number[] } = {}): PartPlan {
  return planReportParts({
    items,
    limitBytes: L,
    part1OverheadBytes: P1,
    continuationOverheadBytes: C,
    ...extra,
  });
}

function keysOf(p: PartPlan): string[][] {
  return p.parts.map((part) => part.itemKeys);
}

describe('planReportParts', () => {
  describe('basic shapes', () => {
    it('returns exactly one empty part 1 when there are no items', () => {
      const p = plan([]);
      expect(p.parts).toEqual([{ itemKeys: [], estimatedBytes: P1, oversizedItemKey: null }]);
      expect(p.reportExceedsLimit).toBe(false);
    });

    it('keeps everything in one part when it all fits', () => {
      const p = plan([
        { key: 'a', size: 300 },
        { key: 'b', size: 400 },
      ]);
      expect(p.parts).toEqual([
        { itemKeys: ['a', 'b'], estimatedBytes: 800, oversizedItemKey: null },
      ]);
      expect(p.reportExceedsLimit).toBe(false);
    });

    it('treats an item that makes the estimate exactly L as fitting (size == L - overhead)', () => {
      const p = plan([{ key: 'a', size: L - P1 }]);
      expect(keysOf(p)).toEqual([['a']]);
      expect(p.parts[0]?.estimatedBytes).toBe(L);
    });

    it('moves an item that exceeds L by one byte to a new part', () => {
      const p = plan([{ key: 'a', size: L - P1 + 1 }]);
      expect(keysOf(p)).toEqual([[], ['a']]);
    });
  });

  describe('part 1 never takes an oversized item', () => {
    it('puts the first non-fitting item into part 2 and leaves part 1 empty (it fits a continuation)', () => {
      const p = plan([{ key: 'a', size: 950 }]);
      expect(keysOf(p)).toEqual([[], ['a']]);
      expect(p.parts[0]?.oversizedItemKey).toBeNull();
      // 50 + 950 == L: fits exactly, so it is NOT an oversized singleton.
      expect(p.parts[1]).toEqual({ itemKeys: ['a'], estimatedBytes: 1000, oversizedItemKey: null });
    });

    it('marks a continuation singleton as oversized only when overhead + size > L', () => {
      const exact = plan([{ key: 'a', size: L - C }]);
      expect(exact.parts[1]?.oversizedItemKey).toBeNull();
      const over = plan([{ key: 'a', size: L - C + 1 }]);
      expect(over.parts[1]).toEqual({
        itemKeys: ['a'],
        estimatedBytes: L + 1,
        oversizedItemKey: 'a',
      });
    });

    it('never flags part 1 as oversized; the oversized item gets its own continuation', () => {
      const p = plan([{ key: 'a', size: 5000 }]);
      expect(p.parts[0]).toEqual({ itemKeys: [], estimatedBytes: P1, oversizedItemKey: null });
      expect(p.parts[1]?.oversizedItemKey).toBe('a');
    });
  });

  describe('oversized singletons', () => {
    it('gives each of several oversized items its own part, with small items packed around them', () => {
      const p = plan([
        { key: 'big1', size: 2000 },
        { key: 'big2', size: 3000 },
        { key: 's1', size: 100 },
        { key: 's2', size: 100 },
      ]);
      expect(keysOf(p)).toEqual([[], ['big1'], ['big2'], ['s1', 's2']]);
      expect(p.parts.map((x) => x.oversizedItemKey)).toEqual([null, 'big1', 'big2', null]);
      expect(p.parts[3]?.estimatedBytes).toBe(C + 200);
    });

    it('closes an oversized singleton so the next item never joins it', () => {
      const p = plan([
        { key: 'big', size: 2000 },
        { key: 'tiny', size: 1 },
      ]);
      expect(keysOf(p)).toEqual([[], ['big'], ['tiny']]);
    });

    it('packs small items into part 1 before an oversized item forces a split', () => {
      const p = plan([
        { key: 's', size: 200 },
        { key: 'big', size: 2000 },
      ]);
      expect(keysOf(p)).toEqual([['s'], ['big']]);
      expect(p.parts[0]?.oversizedItemKey).toBeNull();
      expect(p.parts[1]?.oversizedItemKey).toBe('big');
    });
  });

  describe('greedy packing and ordering', () => {
    it('opens a new part when the next item does not fit the open one', () => {
      const p = plan([
        { key: 'a', size: 500 },
        { key: 'b', size: 500 },
        { key: 'c', size: 500 },
        { key: 'd', size: 500 },
      ]);
      expect(keysOf(p)).toEqual([['a'], ['b'], ['c'], ['d']]);
    });

    it('fills continuations up to exactly L', () => {
      const p = plan([
        { key: 'a', size: 900 },
        { key: 'b', size: 475 },
        { key: 'c', size: 475 },
        { key: 'd', size: 1 },
      ]);
      expect(keysOf(p)).toEqual([['a'], ['b', 'c'], ['d']]);
      expect(p.parts[1]?.estimatedBytes).toBe(L);
    });

    it('preserves the input order across all parts (concatenated itemKeys equal the input)', () => {
      const sizes = [120, 880, 40, 999, 1500, 5, 5, 700, 300, 950, 951, 10, 2000, 1];
      const items = sizes.map((size, i) => ({ key: `k${i}`, size }));
      const p = plan(items);
      expect(p.parts.flatMap((x) => x.itemKeys)).toEqual(items.map((i) => i.key));
      expect(p.parts.length).toBeGreaterThan(1);
    });

    it('keeps the documents of one invoice in order even when they straddle two parts', () => {
      const p = plan([
        { key: 'inv1:1', size: 500 },
        { key: 'inv1:2', size: 500 },
        { key: 'inv2:3', size: 100 },
      ]);
      expect(keysOf(p)).toEqual([['inv1:1'], ['inv1:2', 'inv2:3']]);
    });

    it('handles 60 equally-sized attachments, keeping order and respecting L in every part', () => {
      const items = Array.from({ length: 60 }, (_, i) => ({ key: `k${i}`, size: 300 }));
      const p = plan(items);
      expect(p.parts.flatMap((x) => x.itemKeys)).toEqual(items.map((i) => i.key));
      for (const part of p.parts) expect(part.estimatedBytes).toBeLessThanOrEqual(L);
      // part 1 holds 3 (100 + 900), continuations 3 each (50 + 900 = 950; a 4th would be 1250).
      expect(p.parts).toHaveLength(20);
    });
  });

  describe('report-only over limit', () => {
    it('flags reportExceedsLimit and returns a single empty part when p1 > L and there are no items', () => {
      const p = planReportParts({
        items: [],
        limitBytes: L,
        part1OverheadBytes: 1500,
        continuationOverheadBytes: C,
      });
      expect(p.reportExceedsLimit).toBe(true);
      expect(p.parts).toEqual([{ itemKeys: [], estimatedBytes: 1500, oversizedItemKey: null }]);
    });

    it('closes part 1 empty when p1 > L and puts every attachment into continuations', () => {
      const p = planReportParts({
        items: [
          { key: 'a', size: 400 },
          { key: 'b', size: 400 },
          { key: 'c', size: 400 },
        ],
        limitBytes: L,
        part1OverheadBytes: 1500,
        continuationOverheadBytes: C,
      });
      expect(p.reportExceedsLimit).toBe(true);
      expect(keysOf(p)).toEqual([[], ['a', 'b'], ['c']]);
      expect(p.parts[0]?.oversizedItemKey).toBeNull();
    });

    it('does not flag reportExceedsLimit when p1 == L exactly', () => {
      const p = planReportParts({
        items: [{ key: 'a', size: 1 }],
        limitBytes: L,
        part1OverheadBytes: L,
        continuationOverheadBytes: C,
      });
      expect(p.reportExceedsLimit).toBe(false);
      expect(keysOf(p)).toEqual([[], ['a']]);
    });
  });

  describe('fixedPartCounts (frozen prefix)', () => {
    const items = [
      { key: 'a', size: 100 },
      { key: 'b', size: 100 },
      { key: 'c', size: 100 },
      { key: 'd', size: 100 },
    ];

    it('freezes the leading parts at the given counts, then packs the remainder greedily', () => {
      const p = plan(items, { fixedPartCounts: [1, 1] });
      expect(keysOf(p)).toEqual([['a'], ['b'], ['c', 'd']]);
      expect(p.parts[0]?.estimatedBytes).toBe(P1 + 100);
      expect(p.parts[1]?.estimatedBytes).toBe(C + 100);
      expect(p.parts[2]?.estimatedBytes).toBe(C + 200);
    });

    it('allows a count of 0 for part 1 (everything moves to continuations)', () => {
      const p = plan(items, { fixedPartCounts: [0] });
      expect(keysOf(p)).toEqual([[], ['a', 'b', 'c', 'd']]);
      expect(p.parts[0]).toEqual({ itemKeys: [], estimatedBytes: P1, oversizedItemKey: null });
    });

    it('does not open a fresh part 1 when a frozen prefix exists', () => {
      const p = plan(items, { fixedPartCounts: [4] });
      expect(keysOf(p)).toEqual([['a', 'b', 'c', 'd']]);
    });

    it('clamps counts to the items that remain', () => {
      const p = plan(items, { fixedPartCounts: [3, 9] });
      expect(keysOf(p)).toEqual([['a', 'b', 'c'], ['d']]);
    });

    it('clamps a negative count to 0', () => {
      const p = plan(items, { fixedPartCounts: [-2] });
      expect(keysOf(p)).toEqual([[], ['a', 'b', 'c', 'd']]);
    });

    it('produces an empty trailing frozen part when the count outruns the items', () => {
      const p = plan(items.slice(0, 1), { fixedPartCounts: [1, 2] });
      expect(keysOf(p)).toEqual([['a'], []]);
    });

    it('marks a frozen continuation singleton as oversized but never frozen part 1', () => {
      const p = plan(
        [
          { key: 'big1', size: 5000 },
          { key: 'big2', size: 5000 },
        ],
        { fixedPartCounts: [1, 1] },
      );
      expect(p.parts.map((x) => x.oversizedItemKey)).toEqual([null, 'big2']);
    });

    it('treats an empty fixedPartCounts array like no frozen prefix', () => {
      expect(plan(items, { fixedPartCounts: [] })).toEqual(plan(items));
    });

    it('still reports reportExceedsLimit from p1 with a frozen prefix', () => {
      const p = planReportParts({
        items,
        limitBytes: L,
        part1OverheadBytes: 1500,
        continuationOverheadBytes: C,
        fixedPartCounts: [0],
      });
      expect(p.reportExceedsLimit).toBe(true);
      expect(keysOf(p)).toEqual([[], ['a', 'b', 'c', 'd']]);
    });
  });
});

describe('shiftLastItem', () => {
  const part = (n: number) => ({
    itemKeys: Array.from({ length: n }, (_, i) => `k${i}`),
    estimatedBytes: 0,
    oversizedItemKey: null,
  });
  const threeParts: PartPlan = {
    parts: [part(2), part(3), part(1)],
    reportExceedsLimit: false,
  };

  it('keeps earlier parts and drops the last item of the chosen part', () => {
    expect(shiftLastItem(threeParts, 1)).toEqual([2, 2]);
  });

  it('returns a single count when shifting part 1', () => {
    expect(shiftLastItem(threeParts, 0)).toEqual([1]);
  });

  it('can shift the last part down to 0 items', () => {
    expect(shiftLastItem(threeParts, 2)).toEqual([2, 3, 0]);
  });

  it('never goes below 0 for an empty part', () => {
    expect(shiftLastItem({ parts: [part(0)], reportExceedsLimit: false }, 0)).toEqual([0]);
  });

  it('treats a missing part index as 0 items', () => {
    expect(shiftLastItem(threeParts, 4)).toEqual([2, 3, 1, 0, 0]);
  });

  it('round-trips through planReportParts: the shifted plan moves exactly the last item onward', () => {
    const items = [
      { key: 'a', size: 400 },
      { key: 'b', size: 400 },
      { key: 'c', size: 400 },
    ];
    const first = plan(items);
    expect(keysOf(first)).toEqual([['a', 'b'], ['c']]);
    const second = plan(items, { fixedPartCounts: shiftLastItem(first, 0) });
    expect(keysOf(second)).toEqual([['a'], ['b', 'c']]);
  });
});
