import { describe, it, expect } from '@jest/globals';
import type { InvoiceDeposit } from '@cornerstone/shared';
import {
  toCents,
  fromCents,
  parseAmount,
  computeProRataProposal,
  computeDelta,
  computeDepositTotals,
  computeFinalPayment,
  computeShortfall,
  computeDepositExcess,
  hasTotalMismatch,
  defaultRefundSourceId,
} from './quotationConversion.js';

let seq = 0;
function deposit(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  seq += 1;
  return {
    id: `dep-${seq}`,
    invoiceId: 'inv-1',
    amount: 100,
    dueDate: '2026-01-01',
    paidDate: null,
    claimedDate: null,
    description: null,
    status: 'pending',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('quotationConversion helpers', () => {
  describe('toCents / fromCents', () => {
    it('rounds float noise to integer cents', () => {
      expect(toCents(0.1 + 0.2)).toBe(30);
      expect(toCents(332.85)).toBe(33285);
    });

    it('converts cents back to major units', () => {
      expect(fromCents(33285)).toBe(332.85);
      expect(fromCents(0)).toBe(0);
    });
  });

  describe('scenario 29: parseAmount', () => {
    it('returns null for an empty string', () => {
      expect(parseAmount('')).toBeNull();
    });

    it('returns null for whitespace only', () => {
      expect(parseAmount('   ')).toBeNull();
    });

    it('returns null for non-numeric input', () => {
      expect(parseAmount('abc')).toBeNull();
    });

    it('returns null for Infinity', () => {
      expect(parseAmount('Infinity')).toBeNull();
    });

    it('parses a decimal with a dot', () => {
      expect(parseAmount('12.5')).toBe(12.5);
    });

    it('trims surrounding whitespace', () => {
      expect(parseAmount(' 7 ')).toBe(7);
    });
  });

  describe('computeProRataProposal', () => {
    it('scenario 21: scales 6000/3000/500 from 10000 to 10500', () => {
      const result = computeProRataProposal(
        [
          { id: 'a', itemizedAmount: 6000 },
          { id: 'b', itemizedAmount: 3000 },
          { id: 'c', itemizedAmount: 500 },
        ],
        10000,
        10500,
      );

      expect(result.get('a')).toBe(6300);
      expect(result.get('b')).toBe(3150);
      expect(result.get('c')).toBe(525);
      expect(result.size).toBe(3);
    });

    it('scenario 22: puts the rounding remainder on the first of equal-largest lines (1/1/1, 3 -> 10)', () => {
      const result = computeProRataProposal(
        [
          { id: 'a', itemizedAmount: 1 },
          { id: 'b', itemizedAmount: 1 },
          { id: 'c', itemizedAmount: 1 },
        ],
        3,
        10,
      );

      expect(result.get('a')).toBe(3.34);
      expect(result.get('b')).toBe(3.33);
      expect(result.get('c')).toBe(3.33);
    });

    it('puts the remainder on the strictly largest line, not the first', () => {
      // 1 / 2 / 1 scaled 4 -> 10: exact 2.5 / 5 / 2.5 -> rounds 2.5->3(x.5 up) ; base = 10
      const result = computeProRataProposal(
        [
          { id: 'a', itemizedAmount: 1 },
          { id: 'b', itemizedAmount: 2 },
          { id: 'c', itemizedAmount: 1 },
        ],
        4,
        10,
      );

      const sum = toCents(result.get('a')!) + toCents(result.get('b')!) + toCents(result.get('c')!);
      expect(sum).toBe(1000);
      expect(result.get('b')).toBe(5);
    });

    it('scenario 23a: returns an empty map for empty lines', () => {
      expect(computeProRataProposal([], 10000, 12000).size).toBe(0);
    });

    it('scenario 23b: final equal to quoted returns the old amounts', () => {
      const result = computeProRataProposal(
        [
          { id: 'a', itemizedAmount: 6000 },
          { id: 'b', itemizedAmount: 3000 },
        ],
        10000,
        10000,
      );

      expect(result.get('a')).toBe(6000);
      expect(result.get('b')).toBe(3000);
    });

    it('returns the old amounts unchanged when the quoted amount is 0', () => {
      const result = computeProRataProposal([{ id: 'a', itemizedAmount: 50 }], 0, 100);

      expect(result.get('a')).toBe(50);
    });

    it('returns the old amounts unchanged when the quoted amount is negative', () => {
      const result = computeProRataProposal([{ id: 'a', itemizedAmount: 50 }], -5, 100);

      expect(result.get('a')).toBe(50);
    });

    it('scales down as well as up', () => {
      const result = computeProRataProposal(
        [
          { id: 'a', itemizedAmount: 6000 },
          { id: 'b', itemizedAmount: 3000 },
        ],
        10000,
        5000,
      );

      expect(result.get('a')).toBe(3000);
      expect(result.get('b')).toBe(1500);
    });
  });

  describe('scenario 24: computeDelta', () => {
    it('reports an increase with the percent in percent units (500 on 10000 is 5)', () => {
      expect(computeDelta(10000, 10500)).toEqual({
        absolute: 500,
        percent: 5,
        direction: 'increase',
      });
    });

    it('reports a decrease', () => {
      expect(computeDelta(10000, 9000)).toEqual({
        absolute: 1000,
        percent: 10,
        direction: 'decrease',
      });
    });

    it('reports none when the cents are equal', () => {
      expect(computeDelta(10000, 10000)).toEqual({ absolute: 0, percent: 0, direction: 'none' });
    });

    it('treats float noise below a cent as no change', () => {
      expect(computeDelta(0.3, 0.1 + 0.2).direction).toBe('none');
    });

    it('reports percent 0 when the quoted amount is 0', () => {
      expect(computeDelta(0, 100)).toEqual({ absolute: 100, percent: 0, direction: 'increase' });
    });
  });

  describe('computeDepositTotals', () => {
    it('separates deposits, refunds, and received (paid/claimed) refunds', () => {
      const totals = computeDepositTotals([
        deposit({ amount: 6000, status: 'paid' }),
        deposit({ amount: 400, entryType: 'refund', status: 'pending' }),
        deposit({ amount: 300, entryType: 'refund', status: 'paid' }),
        deposit({ amount: 200, entryType: 'refund', status: 'claimed' }),
      ]);

      expect(totals).toEqual({
        depositTotal: 6000,
        refundTotal: 900,
        receivedRefundTotal: 500,
        netDeposits: 5100,
      });
    });

    it('returns zeros for no deposits', () => {
      expect(computeDepositTotals([])).toEqual({
        depositTotal: 0,
        refundTotal: 0,
        receivedRefundTotal: 0,
        netDeposits: 0,
      });
    });
  });

  describe('scenario 25: computeFinalPayment', () => {
    it('subtracts deposits of any status and ignores a pending refund', () => {
      const deposits = [
        deposit({ amount: 3000, status: 'pending' }),
        deposit({ amount: 500, entryType: 'refund', status: 'pending' }),
      ];

      expect(computeFinalPayment(10000, deposits)).toBe(7000);
    });

    it('adds back a paid refund', () => {
      const deposits = [
        deposit({ amount: 3000, status: 'paid' }),
        deposit({ amount: 500, entryType: 'refund', status: 'paid' }),
      ];

      // max(0, 10000 - 3000 - 500) = 6500
      expect(computeFinalPayment(10000, deposits)).toBe(6500);
    });

    it('counts a claimed refund as received', () => {
      const deposits = [
        deposit({ amount: 3000, status: 'paid' }),
        deposit({ amount: 250, entryType: 'refund', status: 'claimed' }),
      ];

      expect(computeFinalPayment(10000, deposits)).toBe(6750);
    });

    it('never goes below zero', () => {
      expect(computeFinalPayment(1000, [deposit({ amount: 6000, status: 'paid' })])).toBe(0);
    });
  });

  describe('scenario 26: computeShortfall', () => {
    it('is 0 when deposits are covered', () => {
      expect(computeShortfall(10000, [deposit({ amount: 6000 })])).toBe(0);
    });

    it('is 0 when net deposits equal the final amount', () => {
      expect(computeShortfall(6000, [deposit({ amount: 6000 })])).toBe(0);
    });

    it('is 1000 for a 6000 deposit against a 5000 final amount', () => {
      expect(computeShortfall(5000, [deposit({ amount: 6000, status: 'paid' })])).toBe(1000);
    });

    it('counts a pending refund (any status)', () => {
      const deposits = [
        deposit({ amount: 6000, status: 'paid' }),
        deposit({ amount: 1000, entryType: 'refund', status: 'pending' }),
      ];

      expect(computeShortfall(5000, deposits)).toBe(0);
    });

    it('is the remaining gap after a partial refund', () => {
      const deposits = [
        deposit({ amount: 6000, status: 'paid' }),
        deposit({ amount: 400, entryType: 'refund' }),
      ];

      expect(computeShortfall(5000, deposits)).toBe(600);
    });
  });

  describe('computeDepositExcess (#2188)', () => {
    it('is 0 when net deposits plus the entered amount stay within the invoice amount', () => {
      expect(computeDepositExcess(1000, [deposit({ amount: 600 })], 300)).toBe(0);
    });

    it('is 0 when the total exactly equals the invoice amount', () => {
      expect(computeDepositExcess(1000, [deposit({ amount: 600 })], 400)).toBe(0);
    });

    it('returns the cents-exact overage when the total exceeds the invoice amount', () => {
      expect(computeDepositExcess(1000, [deposit({ amount: 600 })], 400.01)).toBe(0.01);
      expect(computeDepositExcess(100, [deposit({ amount: 60 })], 60)).toBe(20);
    });

    it('counts all statuses of existing deposits', () => {
      const entries = [
        deposit({ amount: 300, status: 'pending' }),
        deposit({ amount: 300, status: 'paid' }),
        deposit({ amount: 300, status: 'claimed' }),
      ];
      expect(computeDepositExcess(1000, entries, 150)).toBe(50);
    });

    it('lets refunds reduce net deposits', () => {
      const entries = [
        deposit({ amount: 900 }),
        deposit({ amount: 500, entryType: 'refund', status: 'pending' }),
      ];
      expect(computeDepositExcess(1000, entries, 600)).toBe(0);
      expect(computeDepositExcess(1000, entries, 700)).toBe(100);
    });

    it('ignores the excluded entry (edit mode)', () => {
      const edited = deposit({ amount: 600 });
      expect(computeDepositExcess(1000, [edited], 600, edited.id)).toBe(0);
      // without the exclusion the edited entry would be double counted
      expect(computeDepositExcess(1000, [edited], 600)).toBe(200);
    });

    it('is 0 for null, zero, negative and non-finite input', () => {
      const entries = [deposit({ amount: 2000 })];
      expect(computeDepositExcess(1000, entries, null)).toBe(0);
      expect(computeDepositExcess(1000, entries, 0)).toBe(0);
      expect(computeDepositExcess(1000, entries, -5)).toBe(0);
      expect(computeDepositExcess(1000, entries, Number.NaN)).toBe(0);
      expect(computeDepositExcess(1000, entries, Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('is not fooled by float noise (332.85 + 333.04 + 334.11 against 1000)', () => {
      const entries = [deposit({ amount: 332.85 }), deposit({ amount: 333.04 })];
      expect(computeDepositExcess(1000, entries, 334.11)).toBe(0);
    });
  });

  describe('scenario 27: hasTotalMismatch', () => {
    it('is false at exactly 1% difference', () => {
      expect(hasTotalMismatch(10100, 10000)).toBe(false);
    });

    it('is true just above 1%', () => {
      expect(hasTotalMismatch(10100.01, 10000)).toBe(true);
    });

    it('is false just below 1%', () => {
      expect(hasTotalMismatch(10099.99, 10000)).toBe(false);
    });

    it('is symmetric for lower extracted totals', () => {
      expect(hasTotalMismatch(9899, 10000)).toBe(true);
      expect(hasTotalMismatch(9900, 10000)).toBe(false);
    });

    it('is false for identical totals', () => {
      expect(hasTotalMismatch(10000, 10000)).toBe(false);
    });
  });

  describe('scenario 28: defaultRefundSourceId', () => {
    it('returns the single shared source across deposits', () => {
      expect(
        defaultRefundSourceId([
          deposit({ budgetSourceId: 'src-1' }),
          deposit({ budgetSourceId: 'src-1' }),
        ]),
      ).toBe('src-1');
    });

    it('returns null for mixed sources', () => {
      expect(
        defaultRefundSourceId([
          deposit({ budgetSourceId: 'src-1' }),
          deposit({ budgetSourceId: 'src-2' }),
        ]),
      ).toBeNull();
    });

    it('returns null when all sources are null', () => {
      expect(defaultRefundSourceId([deposit(), deposit()])).toBeNull();
    });

    it('returns null for no deposits', () => {
      expect(defaultRefundSourceId([])).toBeNull();
    });

    it('ignores refund entries and null-source deposits', () => {
      expect(
        defaultRefundSourceId([
          deposit({ budgetSourceId: 'src-1' }),
          deposit({ budgetSourceId: null }),
          deposit({ entryType: 'refund', budgetSourceId: 'src-9' }),
        ]),
      ).toBe('src-1');
    });
  });
});
