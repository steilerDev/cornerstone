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
import { APPLIANCES, FURNITURE } from '../../test/purchaseListFixtures.js';
import type * as CategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as FiltersModule from './PurchaseListFilters.js';

const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
let areasError: string | null = null;

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: jest.fn(() => Promise.resolve({ results: [] })),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [
      { id: 'a-1', name: 'Ground floor', parentId: null, sortOrder: 0 },
      { id: 'a-3', name: 'Kitchen', parentId: 'a-1', sortOrder: 0 },
    ],
    isLoading: false,
    error: areasError,
    refetch: jest.fn(),
  }),
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

let usePurchaseListFilters: typeof FiltersModule.usePurchaseListFilters;
let usePurchaseCategories: typeof FiltersModule.usePurchaseCategories;

type Writes = Array<[string, string | null]>;

function Panel({ initial, writes }: { initial: Record<string, string>; writes: Writes }) {
  const categories = usePurchaseCategories();
  const defs: readonly ObjectListFilterDef[] = usePurchaseListFilters(categories);
  const [values, setValues] = useState(initial);
  return (
    <div>
      {defs.map((def) => (
        <fieldset key={def.param} data-testid={`def-${def.param}`}>
          {def.render({
            id: `f-${def.param}`,
            value: values[def.param] ?? null,
            onChange: (value) => {
              writes.push([def.param, value]);
              setValues((v) => {
                const next = { ...v };
                if (value === null) delete next[def.param];
                else next[def.param] = value;
                return next;
              });
            },
          })}
        </fieldset>
      ))}
    </div>
  );
}

function renderPanel(initial: Record<string, string> = {}) {
  const writes: Writes = [];
  render(<Panel initial={initial} writes={writes} />);
  return writes;
}

beforeEach(async () => {
  if (!usePurchaseListFilters) {
    ({ usePurchaseListFilters, usePurchaseCategories } = await import('./PurchaseListFilters.js'));
  }
  areasError = null;
  mockFetchCategories.mockReset();
  mockFetchCategories.mockResolvedValue({ categories: [FURNITURE, APPLIANCES] });
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });
  mockFetchVendor.mockReset();
  mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
});

describe('the defs', () => {
  it('are Category, Area, Company, two delivery ranges, four money ranges and Cost lines, in order', () => {
    const seen: Array<[string, string]> = [];
    function Probe() {
      const defs = usePurchaseListFilters({ categories: [], failure: null });
      seen.push(...defs.map((d) => [d.param, d.label] as [string, string]));
      return null;
    }
    render(<Probe />);

    expect(seen.slice(0, 10)).toEqual([
      ['category', 'Category'],
      ['areaId', 'Area'],
      ['vendorId', 'Company'],
      ['targetDelivery', 'Target delivery'],
      ['actualDelivery', 'Delivered on'],
      ['plannedCost', 'Expected cost'],
      ['actualCost', 'Invoiced'],
      ['grants', 'Grants'],
      ['afterGrants', 'After grants'],
      ['budgetLines', 'Cost lines'],
    ]);
  });
});

describe('usePurchaseCategories', () => {
  it('loads the categories once', async () => {
    renderPanel();

    const select = (await screen.findByTestId('purchases-filter-category')) as HTMLSelectElement;
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Furniture' })).toBeInTheDocument(),
    );
    expect(mockFetchCategories).toHaveBeenCalledTimes(1);
  });

  it('does not set state after unmount', async () => {
    let release: (v: never) => void = () => undefined;
    mockFetchCategories.mockReturnValue(new Promise((resolve) => (release = resolve as never)));
    const view = render(<Panel initial={{}} writes={[]} />);
    view.unmount();
    release({ categories: [] } as never);
    await Promise.resolve();
  });

  it('does not set state after unmount when the load fails', async () => {
    let fail: (e: unknown) => void = () => undefined;
    mockFetchCategories.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const view = render(<Panel initial={{}} writes={[]} />);
    view.unmount();
    fail(new Error('late'));
    await Promise.resolve();
  });
});

describe('category', () => {
  it('lists the categories, writes the pick and clears with Any category', async () => {
    const writes = renderPanel();
    const select = (await screen.findByTestId('purchases-filter-category')) as HTMLSelectElement;
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Appliances' })).toBeInTheDocument(),
    );

    fireEvent.change(select, { target: { value: 'hic-appliances' } });
    expect(writes.at(-1)).toEqual(['category', 'hic-appliances']);
    await waitFor(() => expect(select.value).toBe('hic-appliances'));
    fireEvent.change(select, { target: { value: '' } });
    expect(writes.at(-1)).toEqual(['category', null]);
  });

  it('shows the first id of a legacy comma-separated value', async () => {
    renderPanel({ category: 'hic-appliances,hic-furniture' });
    const select = (await screen.findByTestId('purchases-filter-category')) as HTMLSelectElement;

    await waitFor(() => expect(select.value).toBe('hic-appliances'));
  });

  it('shows the translated error when the categories cannot be loaded', async () => {
    mockFetchCategories.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPanel();
    const field = (await screen.findByTestId('purchases-filter-category')).parentElement!;

    expect(
      await within(field).findByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument();
  });

  it('uses the list text for a failure that is not an API error', async () => {
    mockFetchCategories.mockRejectedValue(new Error('offline'));
    renderPanel();
    const field = (await screen.findByTestId('purchases-filter-category')).parentElement!;

    expect(
      await within(field).findByText('The categories could not be loaded.'),
    ).toBeInTheDocument();
  });
});

describe('area', () => {
  it('shows the first id of a legacy multi-value CSV as its path', () => {
    renderPanel({ areaId: 'a-3,a-1' });

    expect(
      within(screen.getByTestId('def-areaId')).getByText('Ground floor › Kitchen'),
    ).toBeInTheDocument();
  });

  it('shows the "No area" sentinel by its label and clears to null', async () => {
    const writes = renderPanel({ areaId: '__none__' });
    const field = screen.getByTestId('def-areaId');

    expect(within(field).getByText('No area')).toBeInTheDocument();
    await userEvent.click(within(field).getByRole('button', { name: /clear/i }));
    expect(writes.at(-1)).toEqual(['areaId', null]);
  });

  it('picking the "No area" row writes the sentinel', async () => {
    const writes = renderPanel();

    await userEvent.click(within(screen.getByTestId('def-areaId')).getByRole('textbox'));
    await userEvent.click(await screen.findByRole('option', { name: 'No area' }));

    expect(writes.at(-1)).toEqual(['areaId', '__none__']);
  });

  it('shows an areas load error under the picker', () => {
    areasError = 'Areas failed to load';
    renderPanel();

    expect(
      within(screen.getByTestId('def-areaId')).getByText('Areas failed to load'),
    ).toBeInTheDocument();
  });
});

describe('company', () => {
  it('drops a company id that no longer exists', async () => {
    const writes = renderPanel({ vendorId: 'v-gone' });

    await waitFor(() => expect(writes).toContainEqual(['vendorId', null]));
  });

  it('searches the server and writes the picked id; clearing writes null', async () => {
    mockFetchVendors.mockResolvedValue({
      vendors: [{ id: 'v-250', name: 'Example Tiling Co' } as never],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });
    const writes = renderPanel();

    await userEvent.click(within(screen.getByTestId('def-vendorId')).getByRole('textbox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Example Tiling Co' }));
    await waitFor(() => expect(writes).toContainEqual(['vendorId', 'v-250']));
    await userEvent.click(
      within(screen.getByTestId('def-vendorId')).getByRole('button', { name: /clear/i }),
    );
    await waitFor(() => expect(writes.at(-1)).toEqual(['vendorId', null]));
  });
});

describe('ranges', () => {
  it('the delivery dates write from:…,to:…', () => {
    const writes = renderPanel();

    fireEvent.change(screen.getByTestId('purchases-filter-targetDelivery-from'), {
      target: { value: '2026-03-01' },
    });
    expect(writes.at(-1)).toEqual(['targetDelivery', 'from:2026-03-01']);
    fireEvent.change(screen.getByTestId('purchases-filter-actualDelivery-to'), {
      target: { value: '2026-04-01' },
    });
    expect(writes.at(-1)).toEqual(['actualDelivery', 'to:2026-04-01']);
  });

  it.each(['plannedCost', 'actualCost', 'grants', 'afterGrants'])(
    'the %s range writes min:…,max:… in cents steps',
    (param) => {
      const writes = renderPanel();
      const min = screen.getByTestId(`purchases-filter-${param}-min`);

      expect(min).toHaveAttribute('step', '0.01');
      fireEvent.change(min, { target: { value: '12.5' } });
      fireEvent.blur(min);
      expect(writes.at(-1)).toEqual([param, 'min:12.5']);
    },
  );

  it('Cost lines write min:…,max:… in whole steps', () => {
    const writes = renderPanel();
    const max = screen.getByTestId('purchases-filter-budgetLines-max');

    expect(max).toHaveAttribute('step', '1');
    fireEvent.change(max, { target: { value: '3' } });
    fireEvent.blur(max);
    expect(writes.at(-1)).toEqual(['budgetLines', 'max:3']);
  });
});
