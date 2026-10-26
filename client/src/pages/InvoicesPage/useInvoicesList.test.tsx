/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { InvoiceListPaginatedResponse } from '@cornerstone/shared';
import { makeChipCounts, makeMeta, makeResponse, makeRow } from '../../test/invoiceListFixtures.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as ListModule from './useInvoicesList.js';

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let useInvoicesList: typeof ListModule.useInvoicesList;

const rowA = makeRow({ id: 'inv-a', invoiceNumber: 'INV-T-A' });
const rowB = makeRow({ id: 'inv-b', invoiceNumber: 'INV-T-B' });
const rowC = makeRow({ id: 'inv-c', invoiceNumber: 'INV-T-C' });

function setup(url = '/budget/invoices', paperlessConfigured: boolean | null = null) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => useInvoicesList({ paperlessConfigured }), { wrapper });
}

async function loaded(result: { current: ListModule.UseInvoicesListResult }) {
  await waitFor(() => expect(result.current.list.totalItems).not.toBeNull());
}

beforeEach(async () => {
  if (!useInvoicesList) ({ useInvoicesList } = await import('./useInvoicesList.js'));
  mockFetchAllInvoices.mockReset();
  mockFetchAllInvoices.mockResolvedValue(makeResponse([rowA, rowB]));
});

describe('fetchPage mapping', () => {
  it('requests the To pay chip on the default sort with page and pageSize, and maps the response', async () => {
    const response = makeResponse([rowA, rowB], {
      pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 },
    });
    mockFetchAllInvoices.mockResolvedValue(response);
    const { result } = setup();
    await loaded(result);

    expect(mockFetchAllInvoices).toHaveBeenCalledWith({ openOnly: true, page: 1, pageSize: 100 });
    expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-a', 'inv-b']);
    expect(result.current.list.totalItems).toBe(2);
    expect(result.current.meta).toEqual({
      summary: response.summary,
      chipCounts: response.chipCounts,
      listTotals: response.listTotals,
    });
  });

  it('sends the chip, search, sort and filters of the URL', async () => {
    const { result } = setup(
      '/budget/invoices?status=paid&q=roof&sortBy=amount&sortOrder=desc&notYetSplit=1&vendorId=v-1',
    );
    await loaded(result);
    expect(mockFetchAllInvoices.mock.calls[0]![0]).toEqual({
      status: 'paid',
      q: 'roof',
      sortBy: 'amount',
      sortOrder: 'desc',
      notYetSplit: true,
      vendorId: 'v-1',
      page: 1,
      pageSize: 100,
    });
  });
});

describe('config, labels and figures', () => {
  it('labels the chips with the totals and All with the overall total', async () => {
    const { result } = setup();
    await loaded(result);
    const chips = result.current.config.chips!;
    expect(chips.options.map((o) => o.label)).toEqual([
      'To pay (3)',
      'Offers (2)',
      'Paid (4)',
      'Submitted (1)',
    ]);
    expect(chips.allLabel).toBe('All (10)');
    expect(chips.defaultValue).toBe('pending');
  });

  it('uses the matching counts while filters are active', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([rowA], {
        chipCounts: makeChipCounts({
          matching: { toPay: 1, offers: 0, paid: 0, submitted: 0, all: 1 },
        }),
      }),
    );
    const { result } = setup('/budget/invoices?notYetSplit=1');
    await loaded(result);
    expect(result.current.config.chips!.options[0]!.label).toBe('To pay (1)');
    expect(result.current.config.chips!.allLabel).toBe('All (1)');
    expect(result.current.scopeTotal).toBe(3);
  });

  it('has no counts before the first batch', () => {
    mockFetchAllInvoices.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();
    expect(result.current.meta).toBeNull();
    expect(result.current.scopeTotal).toBeNull();
    expect(result.current.config.chips!.options[0]!.label).toBe('To pay');
    expect(result.current.config.chips!.allLabel).toBe('All');
    expect(result.current.searchingAll).toBeNull();
  });

  it('exposes the sort options, group options and the filter defs (Refunds due from the summary)', async () => {
    const { result } = setup('/budget/invoices', true);
    await loaded(result);
    expect(result.current.config.sort!.options.map((o) => o.value)).toEqual([
      'due_date',
      'date',
      'amount',
      'vendor_name',
      'invoice_number',
    ]);
    expect(result.current.config.groupBy!.options.map((o) => o.value)).toEqual([
      'status',
      'company',
    ]);
    expect(result.current.config.filters!.map((f) => f.param)).toContain('refundsDue');
  });

  it('groups by status in the fixed order with the done flag, and by company', async () => {
    const { result } = setup();
    await loaded(result);
    const [byStatus, byCompany] = result.current.config.groupBy!.options;
    expect(byStatus!.order).toEqual(['pending', 'quotation', 'paid', 'claimed']);
    expect(byStatus!.groupOf(makeRow({ status: 'paid' }))).toEqual({
      key: 'paid',
      label: 'Paid',
      done: true,
    });
    expect(byStatus!.groupOf(makeRow({ status: 'claimed' })).done).toBe(true);
    expect(byStatus!.groupOf(makeRow({ status: 'pending' })).done).toBe(false);
    expect(byStatus!.groupOf(makeRow({ status: 'quotation' })).done).toBe(false);
    expect(byCompany!.groupOf(makeRow())).toEqual({ key: 'v-1', label: 'Example Roofing Ltd' });
  });

  it('words the empty states: To pay has its own, other chips the general one', async () => {
    const pending = setup();
    await loaded(pending.result);
    expect(pending.result.current.labels.empty).toBe('Nothing to pay right now');
    expect(pending.result.current.labels.resultCount(4)).toContain('4');
    expect(pending.result.current.labels.title).toBe('Invoices');

    const paid = setup('/budget/invoices?status=paid');
    await loaded(paid.result);
    expect(paid.result.current.labels.empty).not.toBe(pending.result.current.labels.empty);
    expect(paid.result.current.labels.emptyDescription).not.toBe(
      pending.result.current.labels.emptyDescription,
    );
  });
});

describe('searching all statuses', () => {
  it('is null without a search', async () => {
    const { result } = setup();
    await loaded(result);
    expect(result.current.searchingAll).toBeNull();
  });

  it('names the other chips that have matches and the number outside To pay', async () => {
    const { result } = setup('/budget/invoices?q=roof');
    await loaded(result);
    expect(result.current.list.query.searchingAll).toBe(true);
    expect(result.current.searchingAll).toEqual({
      outside: 7,
      chips: ['Offers', 'Paid', 'Submitted'],
    });
  });

  it('leaves out chips without matches', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([rowA], {
        chipCounts: makeChipCounts({
          outsideToPay: { offers: 0, paid: 2, submitted: 0, all: 2 },
        }),
      }),
    );
    const { result } = setup('/budget/invoices?q=roof');
    await loaded(result);
    expect(result.current.searchingAll).toEqual({ outside: 2, chips: ['Paid'] });
  });

  it('can name Offers and Submitted without Paid', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([rowA], {
        chipCounts: makeChipCounts({
          outsideToPay: { offers: 1, paid: 0, submitted: 3, all: 4 },
        }),
      }),
    );
    const { result } = setup('/budget/invoices?q=roof');
    await loaded(result);
    expect(result.current.searchingAll).toEqual({ outside: 4, chips: ['Offers', 'Submitted'] });
  });
});

describe('refreshRows', () => {
  function figuresOnly(overrides: Partial<InvoiceListPaginatedResponse> = {}) {
    return makeResponse([rowA], {
      pagination: { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 },
      ...overrides,
    });
  }

  it('does nothing for no keys', async () => {
    const { result } = setup();
    await loaded(result);
    mockFetchAllInvoices.mockClear();
    await act(async () => {
      await result.current.refreshRows([]);
    });
    expect(mockFetchAllInvoices).not.toHaveBeenCalled();
  });

  it('patches the rows that still match and takes the newer figures', async () => {
    const { result } = setup();
    await loaded(result);
    const patched = makeRow({ id: 'inv-a', invoiceNumber: 'INV-T-A', openAmount: 10 });
    const newer = makeMeta({
      listTotals: {
        openPayable: { count: 1, totalAmount: 55 },
        offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
      },
    });
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockResolvedValueOnce(makeResponse([patched]))
      .mockResolvedValueOnce(figuresOnly({ listTotals: newer.listTotals }));

    await act(async () => {
      await result.current.refreshRows(['inv-a']);
    });

    expect(mockFetchAllInvoices).toHaveBeenCalledWith({ openOnly: true, ids: ['inv-a'] });
    expect(mockFetchAllInvoices).toHaveBeenCalledWith({ openOnly: true, page: 1, pageSize: 1 });
    expect(result.current.list.items.find((r) => r.id === 'inv-a')!.openAmount).toBe(10);
    expect(result.current.list.items).toHaveLength(2);
    expect(result.current.meta!.listTotals.openPayable.totalAmount).toBe(55);
  });

  it('removes a row that left the list', async () => {
    const { result } = setup();
    await loaded(result);
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockResolvedValueOnce(makeResponse([]))
      .mockResolvedValueOnce(figuresOnly());

    await act(async () => {
      await result.current.refreshRows(['inv-a']);
    });

    expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-b']);
  });

  it('reloads instead when several rows left at once', async () => {
    const { result } = setup();
    await loaded(result);
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockResolvedValueOnce(makeResponse([]))
      .mockResolvedValueOnce(figuresOnly())
      .mockResolvedValue(makeResponse([rowC]));

    await act(async () => {
      await result.current.refreshRows(['inv-a', 'inv-b']);
    });

    await waitFor(() => expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-c']));
  });

  it('reloads instead when one row left but more rows are on the server', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([rowA, rowB], {
        pagination: { page: 1, pageSize: 100, totalItems: 250, totalPages: 3 },
      }),
    );
    const { result } = setup();
    await loaded(result);
    expect(result.current.list.hasMore).toBe(true);
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockResolvedValueOnce(makeResponse([]))
      .mockResolvedValueOnce(figuresOnly())
      .mockResolvedValue(makeResponse([rowC]));

    await act(async () => {
      await result.current.refreshRows(['inv-a']);
    });

    await waitFor(() => expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-c']));
  });

  it('ignores keys that are not loaded and not returned', async () => {
    const { result } = setup();
    await loaded(result);
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockResolvedValueOnce(makeResponse([]))
      .mockResolvedValueOnce(figuresOnly());

    await act(async () => {
      await result.current.refreshRows(['inv-zzz']);
    });

    expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-a', 'inv-b']);
  });

  it('reloads without a request for more than 100 keys', async () => {
    const { result } = setup();
    await loaded(result);
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices.mockResolvedValue(makeResponse([rowC]));
    const keys = Array.from({ length: 101 }, (_, i) => `k-${i}`);

    await act(async () => {
      await result.current.refreshRows(keys);
    });

    await waitFor(() => expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-c']));
    expect(
      mockFetchAllInvoices.mock.calls.every(([params]) => !(params as { ids?: unknown }).ids),
    ).toBe(true);
  });

  it('reloads when a request fails', async () => {
    const { result } = setup();
    await loaded(result);
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(figuresOnly())
      .mockResolvedValue(makeResponse([rowC]));

    await act(async () => {
      await result.current.refreshRows(['inv-a']);
    });

    await waitFor(() => expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-c']));
  });

  it('drops the answer when the query changed meanwhile', async () => {
    const { result } = setup();
    await loaded(result);
    let resolveRows: (v: InvoiceListPaginatedResponse) => void = () => undefined;
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRows = resolve;
          }),
      )
      .mockResolvedValueOnce(figuresOnly())
      .mockResolvedValue(makeResponse([rowC]));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refreshRows(['inv-a']);
    });
    act(() => {
      result.current.list.setSearch('other');
    });
    await act(async () => {
      resolveRows(makeResponse([makeRow({ id: 'inv-a', openAmount: 777 })]));
      await pending;
    });

    await waitFor(() => expect(result.current.list.items.map((r) => r.id)).toEqual(['inv-c']));
    expect(result.current.list.items.some((r) => r.openAmount === 777)).toBe(false);
  });

  it('keeps the refreshed figures only until the next batch', async () => {
    const { result } = setup();
    await loaded(result);
    const newer = makeMeta({
      listTotals: {
        openPayable: { count: 1, totalAmount: 55 },
        offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
      },
    });
    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices
      .mockResolvedValueOnce(makeResponse([rowA]))
      .mockResolvedValueOnce(figuresOnly({ listTotals: newer.listTotals }));
    await act(async () => {
      await result.current.refreshRows(['inv-a']);
    });
    expect(result.current.meta!.listTotals.openPayable.totalAmount).toBe(55);

    mockFetchAllInvoices.mockReset();
    mockFetchAllInvoices.mockResolvedValue(makeResponse([rowA, rowB]));
    act(() => {
      result.current.list.refresh();
    });
    await waitFor(() =>
      expect(result.current.meta!.listTotals.openPayable.totalAmount).toBe(
        makeMeta().listTotals.openPayable.totalAmount,
      ),
    );
  });
});
