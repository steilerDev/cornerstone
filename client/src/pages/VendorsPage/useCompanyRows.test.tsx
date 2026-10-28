/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import type { VendorListItem } from '@cornerstone/shared';
import type { OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import type * as RowsModule from './useCompanyRows.js';

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

let useCompanyRows: typeof RowsModule.useCompanyRows;
let out: ReturnType<typeof RowsModule.useCompanyRows>;
const onDelete = jest.fn<RowsModule.UseCompanyRowsOptions['onDelete']>();

const company = (over: Partial<VendorListItem> = {}): VendorListItem =>
  ({
    id: 'c1',
    name: 'Sample Roofing Co',
    trade: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    createdBy: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...over,
  }) as VendorListItem;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function Probe() {
  out = useCompanyRows({ displayName: (t) => `T:${t.name}`, onDelete });
  return null;
}

function show(node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/companies']}>
      <Routes>
        <Route path="*" element={node} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  if (!useCompanyRows) ({ useCompanyRows } = await import('./useCompanyRows.js'));
  onDelete.mockClear();
  show(<Probe />);
});

const column = (key: string) => out.columns!.find((c) => c.key === key)!;
const cell = (key: string, row = company()) =>
  show(<div data-testid="cell">{column(key).render(row)}</div>);

describe('columns', () => {
  it('shows Trade, Phone, Still to pay, Offers, Contact persons and Last on site by default; the rest is hidden', () => {
    const visible = out.columns!.filter((c) => c.defaultVisible !== false).map((c) => c.key);
    const hidden = out.columns!.filter((c) => c.defaultVisible === false).map((c) => c.key);

    expect(visible).toEqual([
      'trade',
      'phone',
      'stillToPay',
      'offers',
      'contactCount',
      'lastOnSite',
    ]);
    expect(hidden).toEqual(['email', 'address', 'notes', 'createdAt', 'updatedAt']);
  });

  it('Trade, Still to pay, Last on site, Date added and Last updated are sortable', () => {
    expect(column('trade').sortValue).toBe('trade');
    expect(column('stillToPay').sortValue).toBe('still_to_pay');
    expect(column('lastOnSite').sortValue).toBe('last_on_site');
    expect(column('createdAt').sortValue).toBe('created_at');
    expect(column('updatedAt').sortValue).toBe('updated_at');
    expect(column('offers').sortValue).toBeUndefined();
  });

  it('links the title to the company page as user text', () => {
    expect(out.title(company({ id: 'c9', name: 'Example Tiling Co' }))).toEqual({
      text: 'Example Tiling Co',
      to: '/companies/c9',
      isUserText: true,
    });
  });

  it('Trade shows the translated trade, "Not set" without one', () => {
    cell('trade', company({ trade: { id: 't-1', name: 'Roofing' } as never }));
    expect(screen.getByTestId('cell')).toHaveTextContent('T:Roofing');
    document.body.innerHTML = '';
    cell('trade');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Phone shows the number with a Call button; the first contact phone is the fallback', () => {
    cell('phone', company({ phone: '555-0142' }));
    expect(screen.getByTestId('company-call-c1')).toHaveAttribute('href', 'tel:5550142');
    expect(screen.getByTestId('cell')).toHaveTextContent('555-0142');
    document.body.innerHTML = '';
    cell('phone', company({ phone: '  ', firstContactPhone: '555-0101' }));
    expect(screen.getByTestId('company-call-c1')).toHaveAttribute('href', 'tel:5550101');
    document.body.innerHTML = '';
    cell('phone', company({ phone: null, firstContactPhone: null }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
    expect(screen.queryByTestId('company-call-c1')).toBeNull();
  });

  it('Still to pay is a still-to-pay figure, muted at zero or when unknown', () => {
    cell('stillToPay', company({ stillToPay: 250 }));
    const owed = screen.getByTestId('company-still-to-pay-c1');
    expect(owed).toHaveTextContent('€250.00');
    expect(owed).toHaveAttribute('data-figure', 'still-to-pay');
    expect(owed.className).not.toContain('muted');
    document.body.innerHTML = '';
    cell('stillToPay', company({ stillToPay: 0 }));
    expect(screen.getByTestId('company-still-to-pay-c1')).toHaveTextContent('€0.00');
    expect(screen.getByTestId('company-still-to-pay-c1').className).toContain('muted');
    document.body.innerHTML = '';
    cell('stillToPay');
    expect(screen.getByTestId('company-still-to-pay-c1')).toHaveTextContent('€0.00');
  });

  it('Offers shows the amount with the paid part, a dash with text for none', () => {
    cell('offers', company({ offers: { count: 2, amount: 1000, paid: 250 } as never }));
    expect(screen.getByTestId('cell')).toHaveTextContent('€1,000.00');
    expect(screen.getByTestId('cell')).toHaveTextContent('€250.00 paid');
    document.body.innerHTML = '';
    cell('offers', company({ offers: { count: 0, amount: 0, paid: 0 } as never }));
    expect(screen.getByTestId('cell')).toHaveTextContent('No offers');
    document.body.innerHTML = '';
    cell('offers');
    expect(screen.getByTestId('cell')).toHaveTextContent('No offers');
  });

  it('Contact persons shows the count, "Not set" for none', () => {
    cell('contactCount', company({ contactCount: 3 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('3');
    document.body.innerHTML = '';
    cell('contactCount', company({ contactCount: 0 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
    document.body.innerHTML = '';
    cell('contactCount');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Last on site shows the date, "Not set" for none', () => {
    cell('lastOnSite', company({ lastOnSite: '2026-03-05' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Mar 5, 2026');
    document.body.innerHTML = '';
    cell('lastOnSite');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });
});

describe('hidden-by-default columns', () => {
  it('E-mail is a mailto link, "Not set" without one', () => {
    cell('email', company({ email: 'office@example.test' }));
    expect(screen.getByRole('link', { name: 'office@example.test' })).toHaveAttribute(
      'href',
      'mailto:office@example.test',
    );
    document.body.innerHTML = '';
    cell('email');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Address shows the text, "Not set" without one', () => {
    cell('address', company({ address: '1 Sample Street' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('1 Sample Street');
    document.body.innerHTML = '';
    cell('address');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Notes show the text with the full note as title, "Not set" without one', () => {
    cell('notes', company({ notes: 'Call before 9' }));
    expect(screen.getByTitle('Call before 9')).toHaveTextContent('Call before 9');
    document.body.innerHTML = '';
    cell('notes');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Date added and Last updated show dates; Last updated falls back to the creation date', () => {
    cell('createdAt');
    expect(screen.getByTestId('cell')).toHaveTextContent('Jan 2, 2026');
    document.body.innerHTML = '';
    cell('updatedAt');
    expect(screen.getByTestId('cell')).toHaveTextContent('Jan 3, 2026');
    document.body.innerHTML = '';
    cell('updatedAt', company({ updatedAt: undefined } as never));
    expect(screen.getByTestId('cell')).toHaveTextContent('Jan 2, 2026');
  });
});

describe('⋯ menu', () => {
  const menu = (row = company(), surface: 'table' | 'card' = 'table') =>
    out.rowMenu!(row, surface) as readonly OverflowMenuItem[];

  it('is Open and Delete, with surface-specific test ids', () => {
    expect(menu().map((e) => [e.id, e.label, e.testId])).toEqual([
      ['open', 'Open', 'company-open-c1'],
      ['delete', 'Delete', 'company-delete-c1'],
    ]);
    expect(menu(company(), 'card').map((e) => e.testId)).toEqual([
      'company-open-mobile-c1',
      'company-delete-mobile-c1',
    ]);
  });

  it('Open goes to the company page', () => {
    act(() => menu(company({ id: 'c7' })).find((e) => e.id === 'open')!.onClick!());

    expect(screen.getByTestId('location')).toHaveTextContent('/companies/c7');
  });

  it('Delete is destructive and asks to delete the company', () => {
    const del = menu().find((e) => e.id === 'delete')!;

    expect(del.variant).toBe('destructive');
    del.onClick!();
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });
});

describe('card facts', () => {
  const facts = (row = company()) =>
    show(
      <div data-testid="facts">
        {out.facts!(row).map((f) => (
          <span key={f.key} data-key={f.key} data-keep={String(f.keep ?? false)}>
            {f.content}
          </span>
        ))}
      </div>,
    );

  it('shows the trade (kept), Still to pay and a Call button with the number', () => {
    facts(
      company({
        trade: { id: 't-1', name: 'Roofing' } as never,
        phone: '555-0142',
        stillToPay: 90,
      }),
    );

    const keys = Array.from(screen.getByTestId('facts').children).map((c) =>
      c.getAttribute('data-key'),
    );
    expect(keys).toEqual(['trade', 'stillToPay', 'call']);
    expect(screen.getByTestId('facts').children[0]).toHaveAttribute('data-keep', 'true');
    expect(screen.getByTestId('facts')).toHaveTextContent('T:Roofing');
    expect(screen.getByTestId('company-still-to-pay-mobile-c1')).toHaveTextContent('€90.00');
    expect(screen.getByTestId('company-call-mobile-c1')).toHaveTextContent('Call 555-0142');
  });

  it('shows "Not set" for a missing trade and a missing phone', () => {
    facts();

    expect(screen.getByTestId('facts').textContent!.match(/Not set/g)).toHaveLength(2);
    expect(screen.queryByTestId('company-call-mobile-c1')).toBeNull();
  });

  it('has no duplicate test ids when both surfaces are rendered', () => {
    const row = company({ phone: '555-0142' });
    const { container } = show(
      <>
        {out.columns!.map((c) => (
          <div key={c.key}>{c.render(row)}</div>
        ))}
        {out.facts!(row).map((f) => (
          <div key={f.key}>{f.content}</div>
        ))}
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

  function menu(row = company(), surface: 'table' | 'card' = 'table') {
    return out.rowMenu!(row, surface) as readonly OverflowMenuItem[];
  }
});
