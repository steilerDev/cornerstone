/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import type { AreaSummary } from '@cornerstone/shared';
import type { OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { APPLIANCES, FURNITURE, makePurchaseRow } from '../../test/purchaseListFixtures.js';
import type * as RowsModule from './usePurchaseRows.js';

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
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'de',
  useHouseName: () => ({
    houseName: null,
    setHouseName: () => undefined,
    entriesLanguage: 'de',
    setEntriesLanguage: () => undefined,
  }),
  HouseNameProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let usePurchaseRows: typeof RowsModule.usePurchaseRows;
let out: ReturnType<typeof RowsModule.usePurchaseRows>;
const requestDelete = jest.fn<RowsModule.UsePurchaseRowsOptions['requestDelete']>();

const KITCHEN: AreaSummary = {
  id: 'area-kitchen',
  name: 'Kitchen',
  color: null,
  ancestors: [{ id: 'area-gf', name: 'Ground Floor', color: null }],
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function Probe({ categories = true }: { categories?: boolean }) {
  out = usePurchaseRows({
    categories: { categories: categories ? [FURNITURE, APPLIANCES] : [], failure: null },
    requestDelete,
  });
  return null;
}

function show(node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/project/household-items']}>
      <Routes>
        <Route path="*" element={node} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  if (!usePurchaseRows) ({ usePurchaseRows } = await import('./usePurchaseRows.js'));
  requestDelete.mockClear();
  show(<Probe />);
});

const column = (key: string) => out.columns!.find((c) => c.key === key)!;
const cell = (key: string, row = makePurchaseRow()) =>
  show(<div data-testid="cell">{column(key).render(row)}</div>);

describe('title and secondary line', () => {
  it('links the title to the purchase page as user text', () => {
    expect(out.title(makePurchaseRow({ id: 'hi-9', name: 'Oak table' }))).toEqual({
      text: 'Oak table',
      to: '/project/household-items/hi-9',
      isUserText: true,
    });
  });

  it('shows the category name with the grant chips', () => {
    show(
      <>
        {out.renderSecondary!(
          makePurchaseRow({
            category: 'hic-appliances',
            grants: [
              { id: 'g-1', name: 'Example Heat Grant', reductionType: 'percentage', rate: 15 },
            ],
          }),
        )}
      </>,
    );

    expect(screen.getByText('Appliances')).toBeInTheDocument();
    expect(screen.getByTestId('household-item-grants-hi-1')).toBeInTheDocument();
  });

  it('shows no category line for a category that is not (yet) loaded', () => {
    show(<>{out.renderSecondary!(makePurchaseRow({ category: 'hic-unknown' }))}</>);

    expect(screen.queryByText('Appliances')).toBeNull();
    expect(screen.queryByText('Furniture')).toBeNull();
  });
});

describe('default columns', () => {
  it('are Area, Company, Delivery, Expected cost and Invoiced, the rest hidden by default', () => {
    const visible = out.columns!.filter((c) => c.defaultVisible !== false).map((c) => c.key);
    const hidden = out.columns!.filter((c) => c.defaultVisible === false).map((c) => c.key);

    expect(visible).toEqual(['area', 'company', 'delivery', 'expectedCost', 'invoiced']);
    expect(hidden).toEqual(['category', 'orderDate', 'grants', 'afterGrants', 'costLines']);
  });

  it('Delivery, Expected cost, Invoiced, Category and Order date are sortable', () => {
    expect(column('delivery').sortValue).toBe('delivery');
    expect(column('expectedCost').sortValue).toBe('expected_cost');
    expect(column('invoiced').sortValue).toBe('invoiced');
    expect(column('category').sortValue).toBe('category');
    expect(column('orderDate').sortValue).toBe('order_date');
  });
});

describe('Area and Company', () => {
  it('Area is a link with the full path, "No area" as plain text otherwise', () => {
    cell('area', makePurchaseRow({ area: KITCHEN }));
    expect(screen.getByTestId('purchases-area-hi-1')).toHaveTextContent('Ground Floor › Kitchen');
    document.body.innerHTML = '';
    cell('area');
    expect(screen.getByTestId('cell')).toHaveTextContent('No area');
    expect(screen.queryByTestId('purchases-area-hi-1')).toBeNull();
  });

  it('Company is a link to the company page, "Not set" otherwise', () => {
    cell(
      'company',
      makePurchaseRow({ vendor: { id: 'v-1', name: 'Example Carpentry Co' } as never }),
    );
    const link = screen.getByTestId('purchases-company-hi-1');
    expect(link).toHaveTextContent('Example Carpentry Co');
    expect(link).toHaveAttribute('href', '/companies/v-1');
    document.body.innerHTML = '';
    cell('company');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });
});

describe('Delivery', () => {
  it('a delivered purchase shows its actual date, announced as Delivered', () => {
    cell(
      'delivery',
      makePurchaseRow({
        status: 'arrived',
        actualDeliveryDate: '2026-03-05',
        targetDeliveryDate: '2026-03-01',
      }),
    );

    expect(screen.getByTestId('cell')).toHaveTextContent(/Delivered.*Mar 5, 2026/);
  });

  it('any other purchase shows its target date, announced as Target', () => {
    cell('delivery', makePurchaseRow({ targetDeliveryDate: '2026-03-01' }));

    expect(screen.getByTestId('cell')).toHaveTextContent(/Target.*Mar 1, 2026/);
  });

  it('an arrived purchase without an actual date falls back to its target date', () => {
    cell('delivery', makePurchaseRow({ status: 'arrived', targetDeliveryDate: '2026-03-01' }));

    expect(screen.getByTestId('cell')).toHaveTextContent(/Target.*Mar 1, 2026/);
  });

  it('a purchase with neither date reads "Not set"', () => {
    cell('delivery');

    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });
});

describe('money columns', () => {
  it('Expected cost shows the amount right-aligned, or "Not set" when there are no cost lines', () => {
    expect(column('expectedCost').align).toBe('end');
    cell('expectedCost', makePurchaseRow({ expectedCost: 1234.5 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('€1,234.50');
    document.body.innerHTML = '';
    cell('expectedCost', makePurchaseRow({ expectedCost: 0 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('€0.00');
    document.body.innerHTML = '';
    cell('expectedCost');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Invoiced shows the amount; a zero is muted, not "Not set"', () => {
    const row = makePurchaseRow();
    cell('invoiced', { ...row, budgetSummary: { ...row.budgetSummary, totalActual: 250 } });
    expect(screen.getByTestId('cell')).toHaveTextContent('€250.00');
    expect(screen.getByTestId('cell').firstElementChild!.className).not.toContain('muted');
    document.body.innerHTML = '';
    cell('invoiced');
    expect(screen.getByTestId('cell')).toHaveTextContent('€0.00');
    expect(screen.getByTestId('cell')).not.toHaveTextContent('Not set');
    expect(screen.getByTestId('cell').firstElementChild!.className).toContain('muted');
  });

  it('Grants and After grants show the amounts, "Not set" for After grants without an expected cost', () => {
    const row = makePurchaseRow();
    cell('grants', { ...row, budgetSummary: { ...row.budgetSummary, subsidyReduction: 50 } });
    expect(screen.getByTestId('cell')).toHaveTextContent('€50.00');
    document.body.innerHTML = '';
    cell('afterGrants', makePurchaseRow({ afterGrants: 450 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('€450.00');
    document.body.innerHTML = '';
    cell('afterGrants');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });
});

describe('hidden-by-default columns', () => {
  it('Category shows the translated name, "Not set" when unknown', () => {
    cell('category', makePurchaseRow({ category: 'hic-appliances' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Appliances');
    document.body.innerHTML = '';
    cell('category', makePurchaseRow({ category: 'hic-unknown' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Order date shows the date or "Not set"', () => {
    cell('orderDate', makePurchaseRow({ orderDate: '2026-02-01' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Feb 1, 2026');
    document.body.innerHTML = '';
    cell('orderDate');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Cost lines shows the count', () => {
    cell('costLines', makePurchaseRow({ budgetLineCount: 3 }));

    expect(screen.getByTestId('cell')).toHaveTextContent('3');
  });
});

describe('status', () => {
  it('shows the status badge with the purchase word on both surfaces', () => {
    show(
      <>
        <div>{out.renderStatus!(makePurchaseRow({ status: 'arrived' }), 'table')}</div>
        <div>{out.renderStatus!(makePurchaseRow({ status: 'arrived' }), 'card')}</div>
      </>,
    );

    expect(screen.getByTestId('purchases-status-hi-1')).toHaveTextContent('Delivered');
    expect(screen.getByTestId('purchases-status-mobile-hi-1')).toHaveTextContent('Delivered');
  });
});

describe('⋯ menu', () => {
  const menu = (row = makePurchaseRow(), surface: 'table' | 'card' = 'table') =>
    out.rowMenu!(row, surface) as readonly OverflowMenuItem[];

  it('is Open and Delete, with surface-specific test ids', () => {
    expect(menu().map((e) => [e.id, e.label, e.testId])).toEqual([
      ['open', 'Open', 'purchases-open-hi-1'],
      ['delete', 'Delete', 'purchases-delete-hi-1'],
    ]);
    expect(menu(makePurchaseRow(), 'card').map((e) => e.testId)).toEqual([
      'purchases-open-mobile-hi-1',
      'purchases-delete-mobile-hi-1',
    ]);
  });

  it('Open goes to the purchase page', () => {
    act(() => menu(makePurchaseRow({ id: 'hi-7' })).find((e) => e.id === 'open')!.onClick!());

    expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/hi-7');
  });

  it('Delete is destructive and asks to delete the purchase', () => {
    const del = menu().find((e) => e.id === 'delete')!;

    expect(del.variant).toBe('destructive');
    del.onClick!();
    expect(requestDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'hi-1' }));
  });

  it('has no duplicate test ids when both surfaces are rendered', () => {
    const row = makePurchaseRow({ area: KITCHEN });
    const { container } = show(
      <>
        <div>{out.renderStatus!(row, 'table')}</div>
        <div>{out.renderStatus!(row, 'card')}</div>
        {out.renderSecondary!(row)}
        {menu(row, 'table').map((e) => (
          <i key={`t${e.id}`} data-testid={e.testId} />
        ))}
        {menu(row, 'card').map((e) => (
          <i key={`c${e.id}`} data-testid={e.testId} />
        ))}
      </>,
    );

    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});

describe('card facts', () => {
  const facts = (row = makePurchaseRow()) =>
    show(
      <div data-testid="facts">
        {out.facts!(row).map((f) => (
          <span key={f.key} data-key={f.key} data-keep={String(f.keep ?? false)}>
            {f.content}
          </span>
        ))}
      </div>,
    );

  it('shows the area (kept), the delivery date and the expected cost', () => {
    facts(makePurchaseRow({ area: KITCHEN, targetDeliveryDate: '2026-03-01', expectedCost: 300 }));

    const keys = Array.from(screen.getByTestId('facts').children).map((c) =>
      c.getAttribute('data-key'),
    );
    expect(keys).toEqual(['area', 'delivery', 'expectedCost']);
    expect(screen.getByTestId('facts').children[0]).toHaveAttribute('data-keep', 'true');
    expect(screen.getByTestId('facts')).toHaveTextContent('Mar 1, 2026');
    expect(screen.getByTestId('facts')).toHaveTextContent('€300.00');
  });

  it('shows "Not set" for a missing delivery date and a missing expected cost', () => {
    facts();

    const text = screen.getByTestId('facts').textContent!;
    expect(text.match(/Not set/g)).toHaveLength(2);
  });

  it('renders the leaf area name in the compact breadcrumb with the full path', () => {
    facts(makePurchaseRow({ area: KITCHEN }));

    expect(screen.getByText('Ground Floor › Kitchen')).toBeInTheDocument();
  });

  it('renders a compact span with the full path and no tooltip', () => {
    const { container } = facts(
      makePurchaseRow({
        area: {
          id: 'area-study',
          name: 'Study',
          color: null,
          ancestors: [{ id: 'area-upper', name: 'Upper Floor', color: null }],
        },
      }),
    );

    expect(container.querySelectorAll('[role="tooltip"]')).toHaveLength(0);
    const compact = Array.from(container.querySelectorAll('span[class*="compact"]')).find(
      (el) => el.textContent === 'Upper Floor › Study',
    );
    expect(compact).toBeDefined();
  });

  it('renders every ancestor level of a deep area', () => {
    facts(
      makePurchaseRow({
        area: {
          id: 'area-cabinet',
          name: 'Kitchen Cabinet',
          color: null,
          ancestors: [
            { id: 'area-gf', name: 'Ground Floor', color: null },
            { id: 'area-kitchen', name: 'Kitchen', color: null },
          ],
        },
      }),
    );

    expect(screen.getByText('Ground Floor › Kitchen › Kitchen Cabinet')).toBeInTheDocument();
  });

  it('renders "No area" without a nav element when the purchase has no area', () => {
    const { container } = facts(makePurchaseRow({ area: null }));

    expect(screen.getByText('No area')).toBeInTheDocument();
    expect(container.querySelector('nav[aria-label="Area path"]')).toBeNull();
  });
});
