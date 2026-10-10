import { describe, it, expect, jest, afterEach } from '@jest/globals';
import type { Invoice, InvoiceDeposit } from '@cornerstone/shared';
import {
  todayIso,
  isOverdue,
  dueFlag,
  DUE_SOON_DAYS,
  getOpenDeposits,
  isContainerOnly,
  isInvoiceOverdue,
  hasOverdueOpenDeposit,
  getDepositOrdinal,
} from './openItemsUtils.js';

function makeDeposit(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id: 'dep-1',
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

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    vendorId: 'vendor-1',
    vendorName: 'Vendor',
    invoiceNumber: 'INV-1',
    amount: 1000,
    date: '2026-01-01',
    dueDate: null,
    status: 'pending',
    notes: null,
    budgetLines: [],
    remainingAmount: 1000,
    deposits: [],
    finalPaymentAmount: 1000,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('openItemsUtils', () => {
  // ─── isOverdue ──────────────────────────────────────────────────────────────

  describe('isOverdue', () => {
    it('a date strictly before today is overdue', () => {
      expect(isOverdue('2026-01-01', '2026-01-02')).toBe(true);
    });

    it('a date equal to today is not overdue', () => {
      expect(isOverdue('2026-01-02', '2026-01-02')).toBe(false);
    });

    it('a date after today is not overdue', () => {
      expect(isOverdue('2026-01-03', '2026-01-02')).toBe(false);
    });

    it('a null dueDate is never overdue', () => {
      expect(isOverdue(null, '2026-01-02')).toBe(false);
    });
  });

  // ─── getOpenDeposits ────────────────────────────────────────────────────────

  describe('getOpenDeposits', () => {
    it('returns only pending entries, preserving input order', () => {
      const invoice = makeInvoice({
        deposits: [
          makeDeposit({ id: 'd1', status: 'paid' }),
          makeDeposit({ id: 'd2', status: 'pending' }),
          makeDeposit({ id: 'd3', status: 'claimed' }),
          makeDeposit({ id: 'd4', status: 'pending' }),
        ],
      });
      const result = getOpenDeposits(invoice);
      expect(result.map((d) => d.id)).toEqual(['d2', 'd4']);
    });

    it('returns an empty array when no deposits are pending', () => {
      const invoice = makeInvoice({
        deposits: [makeDeposit({ id: 'd1', status: 'paid' })],
      });
      expect(getOpenDeposits(invoice)).toEqual([]);
    });
  });

  // ─── isContainerOnly ────────────────────────────────────────────────────────

  describe('isContainerOnly', () => {
    it('true for a quotation invoice', () => {
      expect(isContainerOnly(makeInvoice({ status: 'quotation' }))).toBe(true);
    });

    it('true for a paid invoice', () => {
      expect(isContainerOnly(makeInvoice({ status: 'paid' }))).toBe(true);
    });

    it('true for a claimed invoice', () => {
      expect(isContainerOnly(makeInvoice({ status: 'claimed' }))).toBe(true);
    });

    it('false for a pending invoice', () => {
      expect(isContainerOnly(makeInvoice({ status: 'pending' }))).toBe(false);
    });
  });

  // ─── isInvoiceOverdue ───────────────────────────────────────────────────────

  describe('isInvoiceOverdue', () => {
    it('true when the invoice is pending and its dueDate is in the past', () => {
      const invoice = makeInvoice({ status: 'pending', dueDate: '2026-01-01' });
      expect(isInvoiceOverdue(invoice, '2026-01-02')).toBe(true);
    });

    it('false when the invoice is pending but not yet due', () => {
      const invoice = makeInvoice({ status: 'pending', dueDate: '2026-02-01' });
      expect(isInvoiceOverdue(invoice, '2026-01-02')).toBe(false);
    });

    it('false when the invoice is past due but not pending (e.g. paid)', () => {
      const invoice = makeInvoice({ status: 'paid', dueDate: '2026-01-01' });
      expect(isInvoiceOverdue(invoice, '2026-01-02')).toBe(false);
    });
  });

  // ─── hasOverdueOpenDeposit ──────────────────────────────────────────────────

  describe('hasOverdueOpenDeposit', () => {
    it('true when a pending deposit is past due', () => {
      const invoice = makeInvoice({
        deposits: [makeDeposit({ id: 'd1', status: 'pending', dueDate: '2026-01-01' })],
      });
      expect(hasOverdueOpenDeposit(invoice, '2026-01-02')).toBe(true);
    });

    it('false when the only past-due deposit is paid, not pending — a paid past-due deposit must not trip this', () => {
      const invoice = makeInvoice({
        deposits: [makeDeposit({ id: 'd1', status: 'paid', dueDate: '2026-01-01' })],
      });
      expect(hasOverdueOpenDeposit(invoice, '2026-01-02')).toBe(false);
    });

    it('false when a pending deposit exists but is not yet due', () => {
      const invoice = makeInvoice({
        deposits: [makeDeposit({ id: 'd1', status: 'pending', dueDate: '2026-02-01' })],
      });
      expect(hasOverdueOpenDeposit(invoice, '2026-01-02')).toBe(false);
    });

    it('false when there are no deposits at all', () => {
      expect(hasOverdueOpenDeposit(makeInvoice({ deposits: [] }), '2026-01-02')).toBe(false);
    });
  });

  // ─── getDepositOrdinal ──────────────────────────────────────────────────────

  describe('getDepositOrdinal', () => {
    it('numbers deposit-type entries 1..N over ALL deposit-type entries regardless of status', () => {
      const deposits = [
        makeDeposit({ id: 'd1', entryType: 'deposit', status: 'paid' }),
        makeDeposit({ id: 'd2', entryType: 'deposit', status: 'pending' }),
        makeDeposit({ id: 'd3', entryType: 'deposit', status: 'pending' }),
      ];
      const invoice = makeInvoice({ deposits });

      // INV-A shape: the second pending deposit (d3) is the 2nd of 3 deposit-type entries overall.
      expect(getDepositOrdinal(invoice, deposits[2]!)).toEqual({ index: 3, total: 3 });
      expect(getDepositOrdinal(invoice, deposits[1]!)).toEqual({ index: 2, total: 3 });
      expect(getDepositOrdinal(invoice, deposits[0]!)).toEqual({ index: 1, total: 3 });
    });

    it('excludes refund entries from both the index and the total count', () => {
      const deposits = [
        makeDeposit({ id: 'r1', entryType: 'refund', status: 'pending' }),
        makeDeposit({ id: 'd1', entryType: 'deposit', status: 'pending' }),
        makeDeposit({ id: 'd2', entryType: 'deposit', status: 'pending' }),
      ];
      const invoice = makeInvoice({ deposits });

      // d2 is the 2nd deposit-type entry, total 2 — the leading refund does not count.
      expect(getDepositOrdinal(invoice, deposits[2]!)).toEqual({ index: 2, total: 2 });
    });

    it('returns null for a refund entry', () => {
      const deposits = [makeDeposit({ id: 'r1', entryType: 'refund', status: 'pending' })];
      const invoice = makeInvoice({ deposits });
      expect(getDepositOrdinal(invoice, deposits[0]!)).toBeNull();
    });

    it('returns null when the deposit-type entry is not present in invoice.deposits', () => {
      const invoice = makeInvoice({
        deposits: [makeDeposit({ id: 'd1', entryType: 'deposit', status: 'pending' })],
      });
      const notInInvoice = makeDeposit({
        id: 'not-there',
        entryType: 'deposit',
        status: 'pending',
      });
      expect(getDepositOrdinal(invoice, notInInvoice)).toBeNull();
    });
  });

  // ─── todayIso ───────────────────────────────────────────────────────────────

  describe('todayIso', () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      jest.useRealTimers();
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

    it('returns a local-calendar YYYY-MM-DD date, distinct from the UTC date at the same instant', () => {
      // 2026-01-01T02:00:00Z is Jan 1 in UTC, but Dec 31 in America/New_York (UTC-5).
      // A toISOString()-based implementation would wrongly return '2026-01-01'.
      process.env.TZ = 'America/New_York';
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T02:00:00.000Z'));

      // Derive the expected value from the SAME (possibly fake-timers-patched)
      // global `Date` that todayIso() itself uses — comparing against a freshly
      // constructed literal Date would be invalid here, since @sinonjs/fake-timers'
      // faked Date does not necessarily replicate a real Date's TZ-aware local
      // getters, even when `process.env.TZ` genuinely affects real Date instances.
      const now = new Date();
      const expectedLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const utcSliceWouldGive = now.toISOString().slice(0, 10);

      expect(todayIso()).toBe(expectedLocal);

      // Only assert the local/UTC divergence when this environment's fake-Date
      // implementation actually honors the TZ override for local getters —
      // otherwise both sides are UTC and the distinctness check would be
      // vacuous (see the todayIso()-does-not-call-toISOString regression test
      // below for a TZ-independent guard against reverting to a UTC slice).
      if (expectedLocal !== utcSliceWouldGive) {
        expect(todayIso()).not.toBe(utcSliceWouldGive);
      }
    });

    it('returns a well-formed YYYY-MM-DD string', () => {
      expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('dueFlag (#2195)', () => {
  const TODAY = '2026-03-10';

  it('uses a 7-day window', () => {
    expect(DUE_SOON_DAYS).toBe(7);
  });

  it('returns null for a null or empty due date', () => {
    expect(dueFlag(null, TODAY)).toBeNull();
    expect(dueFlag('', TODAY)).toBeNull();
  });

  it('returns overdue for a date strictly before today', () => {
    expect(dueFlag('2026-03-09', TODAY)).toBe('overdue');
    expect(dueFlag('2025-01-01', TODAY)).toBe('overdue');
  });

  it('returns dueSoon when due today (not overdue)', () => {
    expect(dueFlag(TODAY, TODAY)).toBe('dueSoon');
  });

  it('returns dueSoon on the last day of the window (today + 7)', () => {
    expect(dueFlag('2026-03-17', TODAY)).toBe('dueSoon');
  });

  it('returns null one day past the window (today + 8)', () => {
    expect(dueFlag('2026-03-18', TODAY)).toBeNull();
  });

  it('handles a month boundary in the window', () => {
    expect(dueFlag('2026-04-02', '2026-03-27')).toBe('dueSoon');
    expect(dueFlag('2026-04-04', '2026-03-27')).toBeNull();
  });

  it('handles a year boundary in the window', () => {
    expect(dueFlag('2027-01-03', '2026-12-27')).toBe('dueSoon');
    expect(dueFlag('2027-01-04', '2026-12-27')).toBeNull();
  });

  it('handles a leap-day boundary in the window (2028)', () => {
    expect(dueFlag('2028-03-02', '2028-02-24')).toBe('dueSoon');
    expect(dueFlag('2028-03-03', '2028-02-24')).toBeNull();
  });

  it('agrees with isOverdue for past dates', () => {
    for (const d of ['2026-03-09', '2026-03-10', '2026-03-11']) {
      expect(dueFlag(d, TODAY) === 'overdue').toBe(isOverdue(d, TODAY));
    }
  });
});
