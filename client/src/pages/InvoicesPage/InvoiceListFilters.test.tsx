/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ObjectListFilterDef } from '../../components/ObjectList/types.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as FiltersModule from './InvoiceListFilters.js';
import type { InvoiceListFiltersInput } from './InvoiceListFilters.js';

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
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

let useInvoiceListFilters: typeof FiltersModule.useInvoiceListFilters;
let useActiveShowOnlyLabels: typeof FiltersModule.useActiveShowOnlyLabels;

const REFUNDS = { count: 2, totalAmount: 250 };

type Writes = Array<[string, string | null]>;

/**
 * Renders the filter defs the way the Filters panel does (consecutive fieldset defs share a
 * fieldset), with the values held by the test so a write can lag behind or be ignored.
 */
function PanelHarness({
  input,
  initial = {},
  writes,
  applyWrites = true,
}: {
  input: InvoiceListFiltersInput;
  initial?: Record<string, string>;
  writes: Writes;
  applyWrites?: boolean;
}) {
  const defs: readonly ObjectListFilterDef[] = useInvoiceListFilters(input);
  const [values, setValues] = useState<Record<string, string>>(initial);
  return (
    <div>
      <button
        type="button"
        data-testid="set-external"
        onClick={() => setValues((v) => ({ ...v, notYetSplit: '1', date: 'from:2026-02-01' }))}
      >
        external
      </button>
      {defs.map((def) => (
        <div key={def.param} data-testid={`def-${def.param}`}>
          {def.render({
            value: values[def.param] ?? null,
            onChange: (value) => {
              writes.push([def.param, value]);
              if (!applyWrites) return;
              setValues((v) => {
                const next = { ...v };
                if (value === null) delete next[def.param];
                else next[def.param] = value;
                return next;
              });
            },
            id: `inv-filter-${def.param}`,
          })}
        </div>
      ))}
    </div>
  );
}

function Labels({ filters }: { filters: Record<string, string> }) {
  const labels = useActiveShowOnlyLabels(filters);
  return <p data-testid="labels">{labels.join(' | ')}</p>;
}

function renderPanel(
  input: Partial<InvoiceListFiltersInput> = {},
  extra: { initial?: Record<string, string>; applyWrites?: boolean } = {},
) {
  const writes: Writes = [];
  const view = render(
    <PanelHarness
      input={{ refundsDue: REFUNDS, paperlessConfigured: true, ...input }}
      writes={writes}
      {...extra}
    />,
  );
  return { writes, ...view };
}

beforeEach(async () => {
  if (!useInvoiceListFilters) {
    ({ useInvoiceListFilters, useActiveShowOnlyLabels } = await import('./InvoiceListFilters.js'));
  }
  mockFetchVendors.mockReset();
  mockFetchVendor.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });
  mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
});

describe('useInvoiceListFilters defs', () => {
  it('lists the params in order: the four flags, Company, Invoice date, Due date, Amount', () => {
    const defs: ObjectListFilterDef[] = [];
    function Capture() {
      defs.push(...useInvoiceListFilters({ refundsDue: null, paperlessConfigured: null }));
      return null;
    }
    render(<Capture />);
    expect(defs.map((d) => d.param)).toEqual([
      'notYetSplit',
      'withoutDocument',
      'refundsDue',
      'due',
      'vendorId',
      'date',
      'dueDate',
      'amount',
    ]);
    const fieldsetIds = defs.map((d) => d.fieldset?.id);
    expect(fieldsetIds.slice(0, 4)).toEqual(['showOnly', 'showOnly', 'showOnly', 'showOnly']);
    expect(fieldsetIds.slice(4)).toEqual([undefined, undefined, undefined, undefined]);
    expect(defs[0]!.fieldset?.legend).toBe('Show only');
  });
});

describe('Show only checkboxes', () => {
  it('Not yet split and Due or overdue are always shown; checking writes 1, unchecking clears', async () => {
    const { writes } = renderPanel();
    const box = screen.getByTestId('invoices-filter-notYetSplit');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(writes).toEqual([['notYetSplit', '1']]);
    await waitFor(() => expect(box).toBeChecked());
    fireEvent.click(box);
    expect(writes[1]).toEqual(['notYetSplit', null]);

    fireEvent.click(screen.getByTestId('invoices-filter-due'));
    expect(writes[2]).toEqual(['due', '1']);
  });

  it('keeps the checkbox checked while the URL lags (the write is not applied)', () => {
    const { writes } = renderPanel({}, { applyWrites: false });
    const box = screen.getByTestId('invoices-filter-notYetSplit');
    fireEvent.click(box);
    expect(writes).toEqual([['notYetSplit', '1']]);
    expect(box).toBeChecked();
  });

  it('follows an external change of the URL value', async () => {
    renderPanel();
    expect(screen.getByTestId('invoices-filter-notYetSplit')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('set-external'));
    await waitFor(() => expect(screen.getByTestId('invoices-filter-notYetSplit')).toBeChecked());
  });

  it('shows Without document only while Paperless is configured', () => {
    const { unmount } = renderPanel({ paperlessConfigured: true });
    expect(screen.getByTestId('invoices-filter-withoutDocument')).toBeInTheDocument();
    unmount();

    renderPanel({ paperlessConfigured: false });
    expect(screen.queryByTestId('invoices-filter-withoutDocument')).toBeNull();
  });

  it('hides Without document while unknown, but keeps it once it is on in the URL', () => {
    const { unmount } = renderPanel({ paperlessConfigured: null });
    expect(screen.queryByTestId('invoices-filter-withoutDocument')).toBeNull();
    unmount();

    renderPanel({ paperlessConfigured: false }, { initial: { withoutDocument: '1' } });
    expect(screen.getByTestId('invoices-filter-withoutDocument')).toBeChecked();
  });

  it('shows Refunds due with count and amount only when a refund is due', () => {
    renderPanel({ refundsDue: REFUNDS });
    const box = screen.getByTestId('invoices-filter-refundsDue');
    expect(box.closest('label')).toHaveTextContent('Refunds due (2 · €250.00)');
  });

  it('hides Refunds due when nothing is due or the figures are unknown', () => {
    const { unmount } = renderPanel({ refundsDue: { count: 0, totalAmount: 0 } });
    expect(screen.queryByTestId('invoices-filter-refundsDue')).toBeNull();
    unmount();

    renderPanel({ refundsDue: null });
    expect(screen.queryByTestId('invoices-filter-refundsDue')).toBeNull();
  });

  it('keeps an on Refunds due visible with the plain word when nothing is due any more', () => {
    renderPanel({ refundsDue: { count: 0, totalAmount: 0 } }, { initial: { refundsDue: '1' } });
    const box = screen.getByTestId('invoices-filter-refundsDue');
    expect(box).toBeChecked();
    expect(box.closest('label')).toHaveTextContent(/^Refunds due$/);
    expect(box.closest('label')).not.toHaveTextContent('(0');
  });
});

describe('Company filter', () => {
  it('searches on the server and writes the picked id', async () => {
    const user = userEvent.setup();
    mockFetchVendors.mockResolvedValue({
      vendors: [{ id: 'v-250', name: 'Example Tiling Co' } as never],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });
    const { writes } = renderPanel();
    await user.click(within(screen.getByTestId('def-vendorId')).getByRole('textbox'));
    await user.click(await screen.findByRole('option', { name: 'Example Tiling Co' }));
    await waitFor(() => expect(writes).toContainEqual(['vendorId', 'v-250']));
  });

  it('drops a company id that no longer exists', async () => {
    const { writes } = renderPanel({}, { initial: { vendorId: 'v-gone' } });
    await waitFor(() => expect(writes).toContainEqual(['vendorId', null]));
  });

  it('clears the param when the chip is cleared', async () => {
    const user = userEvent.setup();
    mockFetchVendor.mockResolvedValue({ id: 'v-1', name: 'Example Roofing Ltd' } as never);
    const { writes } = renderPanel({}, { initial: { vendorId: 'v-1' } });
    await within(screen.getByTestId('def-vendorId')).findByText('Example Roofing Ltd');
    await user.click(
      within(screen.getByTestId('def-vendorId')).getByRole('button', { name: /clear/i }),
    );
    await waitFor(() => expect(writes).toContainEqual(['vendorId', null]));
  });
});

describe('range filters wiring (behaviour lives in ObjectListRangeFilters.test.tsx)', () => {
  it.each([
    ['date', 'invoices-filter-date'],
    ['dueDate', 'invoices-filter-dueDate'],
  ])('%s: the date inputs write from:…,to:… to the param', (param, testId) => {
    const { writes } = renderPanel();
    fireEvent.change(screen.getByTestId(`${testId}-from`), { target: { value: '2026-01-01' } });
    expect(writes.at(-1)).toEqual([param, 'from:2026-01-01']);
  });

  it('shows the Invoices labels and writes the amount range on blur', () => {
    const { writes } = renderPanel({}, { initial: { dueDate: 'from:2026-04-01,to:2026-05-01' } });
    expect((screen.getByTestId('invoices-filter-dueDate-to') as HTMLInputElement).value).toBe(
      '2026-05-01',
    );
    const min = screen.getByTestId('invoices-filter-amount-min') as HTMLInputElement;
    fireEvent.change(min, { target: { value: '10' } });
    fireEvent.blur(min);
    expect(writes).toEqual([['amount', 'min:10']]);
    expect(screen.getAllByText('Minimum').length).toBeGreaterThan(0);
  });
});

describe('useActiveShowOnlyLabels', () => {
  it('names the active flags in def order and ignores the rest', () => {
    render(
      <Labels
        filters={{
          due: '1',
          notYetSplit: '1',
          withoutDocument: '0',
          vendorId: 'v-1',
          refundsDue: '1',
        }}
      />,
    );
    expect(screen.getByTestId('labels')).toHaveTextContent(
      'Not yet split | Refunds due | Due or overdue',
    );
  });

  it('is empty without flags', () => {
    render(<Labels filters={{}} />);
    expect(screen.getByTestId('labels')).toBeEmptyDOMElement();
  });

  it('names Without document when it is on', () => {
    render(<Labels filters={{ withoutDocument: '1' }} />);
    expect(screen.getByTestId('labels')).toHaveTextContent('Without document');
  });
});
