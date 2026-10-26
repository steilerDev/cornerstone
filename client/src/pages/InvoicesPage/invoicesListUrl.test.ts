import { describe, it, expect } from '@jest/globals';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import {
  chipCountKey,
  formatAmountRange,
  formatDateRange,
  invoiceListApiParams,
  legacyInvoicesSearch,
  parseAmountRange,
  parseDateRange,
} from './invoicesListUrl.js';

function query(overrides: Partial<ObjectListQuery> = {}): ObjectListQuery {
  return {
    q: '',
    chip: 'pending',
    searchingAll: false,
    serverGroup: null,
    sortBy: 'due_date',
    sortOrder: 'asc',
    isDefaultSort: true,
    filters: {},
    ...overrides,
  };
}

describe('chipCountKey', () => {
  it.each([
    ['pending', 'toPay'],
    ['quotation', 'offers'],
    ['paid', 'paid'],
    ['claimed', 'submitted'],
    ['all', 'all'],
    ['whatever', 'all'],
  ])('maps %s to %s', (chip, key) => {
    expect(chipCountKey(chip)).toBe(key);
  });
});

describe('parseDateRange / formatDateRange', () => {
  it('reads both sides', () => {
    expect(parseDateRange('from:2026-01-01,to:2026-02-01')).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
    });
  });

  it('reads one side only', () => {
    expect(parseDateRange('from:2026-01-01')).toEqual({ from: '2026-01-01', to: null });
    expect(parseDateRange('to:2026-02-01')).toEqual({ from: null, to: '2026-02-01' });
  });

  it('drops an invalid side and keeps the valid one', () => {
    expect(parseDateRange('from:nope,to:2026-02-01')).toEqual({ from: null, to: '2026-02-01' });
    expect(parseDateRange('from:2026-02-30,to:2026-02-01')).toEqual({
      from: null,
      to: '2026-02-01',
    });
    expect(parseDateRange('from:2026-13-01')).toBeNull();
  });

  it('is null for no value, an empty value, no valid side or parts without a colon', () => {
    expect(parseDateRange(null)).toBeNull();
    expect(parseDateRange('')).toBeNull();
    expect(parseDateRange('from:,to:')).toBeNull();
    expect(parseDateRange('garbage,more')).toBeNull();
    expect(parseDateRange('other:2026-01-01')).toBeNull();
  });

  it('serialises, with null for an empty range', () => {
    expect(formatDateRange('2026-01-01', '2026-02-01')).toBe('from:2026-01-01,to:2026-02-01');
    expect(formatDateRange('2026-01-01', null)).toBe('from:2026-01-01');
    expect(formatDateRange(null, '2026-02-01')).toBe('to:2026-02-01');
    expect(formatDateRange(null, null)).toBeNull();
  });
});

describe('parseAmountRange / formatAmountRange', () => {
  it('reads both sides, including zero and decimals', () => {
    expect(parseAmountRange('min:0,max:250.5')).toEqual({ min: 0, max: 250.5 });
  });

  it('reads one side only', () => {
    expect(parseAmountRange('min:10')).toEqual({ min: 10, max: null });
    expect(parseAmountRange('max:10')).toEqual({ min: null, max: 10 });
  });

  it('drops sides that are not finite numbers', () => {
    expect(parseAmountRange('min:abc,max:5')).toEqual({ min: null, max: 5 });
    expect(parseAmountRange('min:Infinity,max:  ')).toBeNull();
  });

  it('is null for no value or no valid side', () => {
    expect(parseAmountRange(null)).toBeNull();
    expect(parseAmountRange('')).toBeNull();
    expect(parseAmountRange('min:,max:')).toBeNull();
  });

  it('serialises, with null for an empty range', () => {
    expect(formatAmountRange(10, 20.5)).toBe('min:10,max:20.5');
    expect(formatAmountRange(0, null)).toBe('min:0');
    expect(formatAmountRange(null, 5)).toBe('max:5');
    expect(formatAmountRange(null, null)).toBeNull();
  });
});

describe('invoiceListApiParams', () => {
  it('sends openOnly and no sort for the To pay chip on the default sort', () => {
    expect(invoiceListApiParams(query())).toEqual({ openOnly: true });
  });

  it('sends the sort on the To pay chip once it is not the default', () => {
    expect(
      invoiceListApiParams(query({ sortBy: 'amount', sortOrder: 'desc', isDefaultSort: false })),
    ).toEqual({ openOnly: true, sortBy: 'amount', sortOrder: 'desc' });
  });

  it('sends the default sort on every other chip', () => {
    expect(invoiceListApiParams(query({ chip: 'paid' }))).toEqual({
      status: 'paid',
      sortBy: 'due_date',
      sortOrder: 'asc',
    });
  });

  it.each(['quotation', 'paid', 'claimed'])('sends status=%s for that chip', (chip) => {
    expect(invoiceListApiParams(query({ chip })).status).toBe(chip);
  });

  it('sends neither status nor openOnly when searching all', () => {
    const params = invoiceListApiParams(query({ chip: 'all', q: 'roof', searchingAll: true }));
    expect(params).toEqual({ q: 'roof', sortBy: 'due_date', sortOrder: 'asc' });
  });

  it('drops a sort the server does not know', () => {
    expect(invoiceListApiParams(query({ chip: 'all', sortBy: 'bogus' }))).toEqual({});
  });

  it('passes every filter, flags as true only for 1', () => {
    const params = invoiceListApiParams(
      query({
        chip: 'all',
        sortBy: 'bogus',
        filters: {
          notYetSplit: '1',
          withoutDocument: '0',
          refundsDue: '1',
          due: '1',
          vendorId: 'v-1',
          date: 'from:2026-01-01,to:2026-02-01',
          dueDate: 'from:2026-03-01',
          amount: 'min:10,max:20',
        },
      }),
    );
    expect(params).toEqual({
      notYetSplit: true,
      refundsDue: true,
      due: true,
      vendorId: 'v-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      dueDateFrom: '2026-03-01',
      amountMin: 10,
      amountMax: 20,
    });
  });

  it('ignores invalid ranges and sends zero as an amount bound', () => {
    expect(
      invoiceListApiParams(
        query({
          chip: 'all',
          sortBy: 'bogus',
          filters: { date: 'from:x', dueDate: 'to:2026-04-01', amount: 'min:0' },
        }),
      ),
    ).toEqual({ dueDateTo: '2026-04-01', amountMin: 0 });
    expect(
      invoiceListApiParams(
        query({ chip: 'all', sortBy: 'bogus', filters: { amount: 'max:7', date: 'junk' } }),
      ),
    ).toEqual({ amountMax: 7 });
  });

  it('never sends page, pageSize or ids', () => {
    const params = invoiceListApiParams(query({ q: 'x', chip: 'paid' })) as Record<string, unknown>;
    expect(params.page).toBeUndefined();
    expect(params.pageSize).toBeUndefined();
    expect(params.ids).toBeUndefined();
  });
});

describe('legacyInvoicesSearch', () => {
  const rewrite = (search: string) => legacyInvoicesSearch(new URLSearchParams(search))?.toString();

  it('is null without openOnly', () => {
    expect(legacyInvoicesSearch(new URLSearchParams('status=paid&page=2'))).toBeNull();
  });

  it('openOnly=true becomes status=pending', () => {
    expect(rewrite('openOnly=true')).toBe('status=pending');
  });

  it('keeps an explicit status', () => {
    expect(rewrite('openOnly=true&status=paid')).toBe('status=paid');
  });

  it('openOnly=false is dropped without a status', () => {
    expect(rewrite('openOnly=false')).toBe('');
  });

  it('removes page and pageSize and keeps the other params', () => {
    expect(rewrite('openOnly=true&page=2&pageSize=50&q=roof')).toBe('q=roof&status=pending');
  });
});
