import { describe, it, expect } from '@jest/globals';
import type { HouseholdItemSummary } from '@cornerstone/shared';
import {
  purchaseDeliveryShown,
  purchaseDiaryWindow,
  purchaseIsLateShown,
  purchaseLateExplanation,
} from './purchaseDates.js';

type Dates = Pick<
  HouseholdItemSummary,
  | 'status'
  | 'isLate'
  | 'orderDate'
  | 'actualDeliveryDate'
  | 'targetDeliveryDate'
  | 'earliestDeliveryDate'
  | 'latestDeliveryDate'
>;

const dates = (over: Partial<Dates> = {}): Dates => ({
  status: 'planned',
  isLate: false,
  orderDate: null,
  actualDeliveryDate: null,
  targetDeliveryDate: null,
  earliestDeliveryDate: null,
  latestDeliveryDate: null,
  ...over,
});

describe('purchaseDeliveryShown', () => {
  it('shows the delivered date once the purchase arrived', () => {
    expect(
      purchaseDeliveryShown(
        dates({
          status: 'arrived',
          actualDeliveryDate: '2026-03-05',
          targetDeliveryDate: '2026-03-01',
        }),
      ),
    ).toEqual({ kind: 'delivered', date: '2026-03-05' });
  });

  it('shows the target date before the purchase arrived, ahead of the window', () => {
    expect(
      purchaseDeliveryShown(
        dates({
          targetDeliveryDate: '2026-03-10',
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-03-20',
        }),
      ),
    ).toEqual({ kind: 'target', date: '2026-03-10' });
  });

  it('ignores an actual delivery date while the status is not arrived', () => {
    expect(
      purchaseDeliveryShown(dates({ actualDeliveryDate: '2026-03-05', targetDeliveryDate: null })),
    ).toBeNull();
  });

  it('shows the window when both bounds are set and there is no target', () => {
    expect(
      purchaseDeliveryShown(
        dates({ earliestDeliveryDate: '2026-03-01', latestDeliveryDate: '2026-03-20' }),
      ),
    ).toEqual({ kind: 'window', start: '2026-03-01', end: '2026-03-20' });
  });

  it('shows the latest bound alone', () => {
    expect(purchaseDeliveryShown(dates({ latestDeliveryDate: '2026-03-20' }))).toEqual({
      kind: 'single',
      date: '2026-03-20',
    });
  });

  it('shows the earliest bound alone', () => {
    expect(purchaseDeliveryShown(dates({ earliestDeliveryDate: '2026-03-01' }))).toEqual({
      kind: 'single',
      date: '2026-03-01',
    });
  });

  it('is null without any delivery date', () => {
    expect(purchaseDeliveryShown(dates())).toBeNull();
  });
});

describe('purchaseIsLateShown', () => {
  it.each([
    ['late and not delivered', { isLate: true, status: 'purchased' as const }, true],
    ['late but delivered', { isLate: true, status: 'arrived' as const }, false],
    ['not late', { isLate: false, status: 'planned' as const }, false],
  ])('%s', (_name, input, expected) => {
    expect(purchaseIsLateShown(input)).toBe(expected);
  });
});

describe('purchaseLateExplanation', () => {
  const TODAY = '2026-04-10';

  it('is null when the purchase is not late', () => {
    expect(purchaseLateExplanation(dates({ latestDeliveryDate: '2026-04-01' }), TODAY)).toBeNull();
  });

  it('is null once the purchase is delivered', () => {
    expect(
      purchaseLateExplanation(
        dates({ isLate: true, status: 'arrived', latestDeliveryDate: '2026-04-01' }),
        TODAY,
      ),
    ).toBeNull();
  });

  it('names the passed latest delivery date', () => {
    expect(
      purchaseLateExplanation(
        dates({
          isLate: true,
          latestDeliveryDate: '2026-04-01',
          targetDeliveryDate: '2026-03-20',
        }),
        TODAY,
      ),
    ).toEqual({ kind: 'latest', date: '2026-04-01' });
  });

  it('names the passed target date when there is no latest date', () => {
    expect(
      purchaseLateExplanation(dates({ isLate: true, targetDeliveryDate: '2026-03-20' }), TODAY),
    ).toEqual({ kind: 'target', date: '2026-03-20' });
  });

  it('is generic when the missed date has not passed (a predecessor pushed the delivery)', () => {
    expect(
      purchaseLateExplanation(dates({ isLate: true, latestDeliveryDate: '2026-05-01' }), TODAY),
    ).toEqual({ kind: 'generic' });
  });

  it('treats a missed date of today as not passed', () => {
    expect(
      purchaseLateExplanation(dates({ isLate: true, latestDeliveryDate: TODAY }), TODAY),
    ).toEqual({ kind: 'generic' });
  });

  it('is generic when late without any delivery date', () => {
    expect(purchaseLateExplanation(dates({ isLate: true }), TODAY)).toEqual({ kind: 'generic' });
  });
});

describe('purchaseDiaryWindow', () => {
  it('runs from the order date to the delivered date', () => {
    expect(
      purchaseDiaryWindow(
        dates({
          orderDate: '2026-02-01',
          earliestDeliveryDate: '2026-02-10',
          actualDeliveryDate: '2026-03-05',
          latestDeliveryDate: '2026-03-20',
          targetDeliveryDate: '2026-03-10',
        }),
      ),
    ).toEqual({ dateFrom: '2026-02-01', dateTo: '2026-03-05' });
  });

  it('starts at the earliest delivery date without an order date', () => {
    expect(
      purchaseDiaryWindow(
        dates({ earliestDeliveryDate: '2026-02-10', latestDeliveryDate: '2026-03-20' }),
      ),
    ).toEqual({ dateFrom: '2026-02-10', dateTo: '2026-03-20' });
  });

  it('ends at the target date when nothing else is set', () => {
    expect(
      purchaseDiaryWindow(dates({ orderDate: '2026-02-01', targetDeliveryDate: '2026-03-10' })),
    ).toEqual({ dateFrom: '2026-02-01', dateTo: '2026-03-10' });
  });

  it('accepts a single-day window', () => {
    expect(
      purchaseDiaryWindow(dates({ orderDate: '2026-02-01', actualDeliveryDate: '2026-02-01' })),
    ).toEqual({ dateFrom: '2026-02-01', dateTo: '2026-02-01' });
  });

  it('is null without a start, without an end, or when the end precedes the start', () => {
    expect(purchaseDiaryWindow(dates({ targetDeliveryDate: '2026-03-10' }))).toBeNull();
    expect(purchaseDiaryWindow(dates({ orderDate: '2026-02-01' }))).toBeNull();
    expect(
      purchaseDiaryWindow(dates({ orderDate: '2026-03-10', actualDeliveryDate: '2026-03-01' })),
    ).toBeNull();
  });
});
