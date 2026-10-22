/**
 * Purchase Late, the one definition (#2229): planned date = latest ?? earliest; late when not
 * delivered and the planned date is before today.
 *
 * Mutations caught: `<=` instead of `<` (T would be late), earliest winning over latest, an
 * arrived or delivered purchase flagged late, a purchase without dates flagged late.
 */

import { describe, it, expect } from '@jest/globals';
import { isPurchaseLate, purchasePlannedDate, type PurchaseLateFields } from './purchaseLate.js';

const TODAY = '2026-03-10';

function p(o: Partial<PurchaseLateFields> = {}): PurchaseLateFields {
  return {
    status: 'purchased',
    actualDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    ...o,
  };
}

describe('purchasePlannedDate', () => {
  it('is the latest date when set, else the earliest, else null', () => {
    expect(
      purchasePlannedDate({ earliestDeliveryDate: '2026-03-01', latestDeliveryDate: '2026-03-20' }),
    ).toBe('2026-03-20');
    expect(
      purchasePlannedDate({ earliestDeliveryDate: '2026-03-01', latestDeliveryDate: null }),
    ).toBe('2026-03-01');
    expect(
      purchasePlannedDate({ earliestDeliveryDate: null, latestDeliveryDate: null }),
    ).toBeNull();
  });
});

describe('isPurchaseLate', () => {
  it.each([
    ['T-1 is late', '2026-03-09', true],
    ['T is not late', '2026-03-10', false],
    ['T+1 is not late', '2026-03-11', false],
  ])('earliest only: %s', (_label, date, expected) => {
    expect(isPurchaseLate(p({ earliestDeliveryDate: date }), TODAY)).toBe(expected);
    expect(isPurchaseLate(p({ latestDeliveryDate: date }), TODAY)).toBe(expected);
  });

  it('the latest date wins over the earliest in both directions', () => {
    expect(
      isPurchaseLate(
        p({ earliestDeliveryDate: '2026-03-01', latestDeliveryDate: '2026-03-20' }),
        TODAY,
      ),
    ).toBe(false);
    expect(
      isPurchaseLate(
        p({ earliestDeliveryDate: '2026-03-20', latestDeliveryDate: '2026-03-05' }),
        TODAY,
      ),
    ).toBe(true);
  });

  it('an arrived purchase is never late', () => {
    expect(isPurchaseLate(p({ status: 'arrived', latestDeliveryDate: '2026-01-01' }), TODAY)).toBe(
      false,
    );
  });

  it('a purchase with an actual delivery date is never late', () => {
    expect(
      isPurchaseLate(
        p({ latestDeliveryDate: '2026-01-01', actualDeliveryDate: '2026-03-09' }),
        TODAY,
      ),
    ).toBe(false);
  });

  it('a purchase without dates is never late', () => {
    expect(isPurchaseLate(p(), TODAY)).toBe(false);
  });
});
