/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as PartsModule from './CostLineRowParts.js';
import type { CostLineRow } from './types.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: unknown }) => children,
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
}));

let Parts: typeof PartsModule;

beforeEach(async () => {
  Parts = (await import('./CostLineRowParts.js')) as typeof PartsModule;
});

function makeRow(overrides: Partial<CostLineRow> = {}): CostLineRow {
  return {
    id: 'bl1',
    lineType: 'work_item',
    invoiceBudgetLineId: null,
    invoiceId: null,
    invoiceStatus: null,
    invoiceNumber: null,
    invoiceDate: null,
    invoiceVendorName: null,
    state: 'estimate',
    basis: 'own_estimate',
    margin: 0.2,
    description: 'Tile the hallway',
    quantity: 12,
    unit: 'm²',
    unitPrice: 45,
    includesVat: false,
    plannedAmount: 540,
    plannedGross: 642.6,
    gross: 642.6,
    net: 540,
    estimateDiffers: false,
    target: null,
    categoryId: null,
    categoryName: null,
    categoryTranslationKey: null,
    budgetSourceId: null,
    budgetSourceName: null,
    vendorId: null,
    vendorName: null,
    ...overrides,
  };
}

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('StateCell', () => {
  it('renders the state chip with a surface-unique test id', () => {
    wrap(<Parts.StateCell row={makeRow()} surface="card" prefix="cl" />);
    expect(screen.getByTestId('cl-state-mobile-bl1')).toBeInTheDocument();
  });

  it('uses the plain test id on the table surface', () => {
    wrap(<Parts.StateCell row={makeRow()} surface="table" prefix="cl" />);
    expect(screen.getByTestId('cl-state-bl1')).toBeInTheDocument();
  });
});

describe('DescriptionCell', () => {
  it('shows the description and a facts line of category, source and company', () => {
    wrap(
      <Parts.DescriptionCell
        row={makeRow({
          categoryName: 'Flooring',
          budgetSourceName: 'Savings',
          vendorName: 'Example Tiling Co',
        })}
      />,
    );
    expect(screen.getByText('Tile the hallway')).toBeInTheDocument();
    expect(screen.getByText(/Flooring/)).toHaveTextContent(/Flooring.*Savings.*Example Tiling Co/);
  });

  it('omits the facts line when there are no facts', () => {
    const { container } = wrap(<Parts.DescriptionCell row={makeRow()} />);
    expect(container.querySelector('.facts')).toBeNull();
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });

  it('shows the muted fallback for a line without a description', () => {
    wrap(<Parts.DescriptionCell row={makeRow({ description: null })} />);
    expect(screen.getByText('Line without a description')).toBeInTheDocument();
  });

  it('lists only the facts that exist', () => {
    wrap(<Parts.DescriptionCell row={makeRow({ vendorName: 'Example Tiling Co' })} />);
    expect(screen.getByText('Example Tiling Co')).toBeInTheDocument();
  });
});

describe('QuantityPriceCell', () => {
  it('shows quantity, unit and price', () => {
    wrap(<Parts.QuantityPriceCell row={makeRow()} />);
    expect(screen.getByText('12 m² × €45.00')).toBeInTheDocument();
  });

  it('shows quantity and price without a unit', () => {
    wrap(<Parts.QuantityPriceCell row={makeRow({ unit: null })} />);
    expect(screen.getByText('12 × €45.00')).toBeInTheDocument();
  });

  it('shows an en dash without a quantity, without a price, or when the estimate differs', () => {
    for (const overrides of [
      { quantity: null },
      { unitPrice: null },
      { estimateDiffers: true },
    ] as Partial<CostLineRow>[]) {
      const { unmount } = wrap(<Parts.QuantityPriceCell row={makeRow(overrides)} />);
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.queryByText(/×/)).toBeNull();
      unmount();
    }
  });
});

describe('GrossCell', () => {
  it('item mode renders the net tip around the gross amount', () => {
    wrap(
      <Parts.GrossCell row={makeRow()} surface="table" prefix="cl" mode="item" vatRate={0.19} />,
    );
    expect(screen.getByTestId('cl-gross-bl1')).toHaveTextContent('€642.60');
    expect(screen.getByRole('button', { name: /Tile the hallway/ })).toBeInTheDocument();
  });

  it('document mode renders the plain amount without a tip', () => {
    wrap(
      <Parts.GrossCell row={makeRow()} surface="card" prefix="cl" mode="document" vatRate={0.19} />,
    );
    expect(screen.getByTestId('cl-gross-mobile-bl1')).toHaveTextContent('€642.60');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Estimate/)).toBeNull();
  });

  it('shows the estimate when it differs, and names a line without a description', () => {
    wrap(
      <Parts.GrossCell
        row={makeRow({ estimateDiffers: true, plannedGross: 500, description: null })}
        surface="table"
        prefix="cl"
        mode="item"
        vatRate={0.19}
      />,
    );
    expect(screen.getByText('Estimate €500.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Line without a description/ })).toBeInTheDocument();
  });
});

describe('EnteredAsCell', () => {
  it('shows Net with a neutral badge class for a net line', () => {
    wrap(<Parts.EnteredAsCell row={makeRow({ includesVat: false })} />);
    const badge = screen.getByText('Net');
    expect(badge.className).toContain('neutral');
  });

  it('shows Gross with a neutral badge class for a gross line', () => {
    wrap(<Parts.EnteredAsCell row={makeRow({ includesVat: true })} />);
    const badge = screen.getByText('Gross');
    expect(badge.className).toContain('neutral');
  });
});

describe('TargetLabel', () => {
  it('shows a neutral Not assigned badge without a target', () => {
    wrap(<Parts.TargetLabel target={null} />);
    const badge = screen.getByText('Not assigned');
    expect(badge.className).toContain('neutral');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links a task target to its page with the origin state and shows its area', () => {
    wrap(
      <Parts.TargetLabel
        target={{
          type: 'work_item',
          id: 'w1',
          label: 'Tile the hallway',
          area: { id: 'a1', name: 'Kitchen', color: null, ancestors: [] },
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Tile the hallway' })).toHaveAttribute(
      'href',
      expect.stringContaining('w1'),
    );
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('links a purchase target to the purchase page and tolerates a missing area', () => {
    wrap(<Parts.TargetLabel target={{ type: 'household_item', id: 'h1', label: 'Oak table' }} />);
    expect(screen.getByRole('link', { name: 'Oak table' })).toHaveAttribute(
      'href',
      expect.stringContaining('h1'),
    );
  });
});

describe('TargetLabel with a bare target (#2239)', () => {
  it('renders the link, the area and the page of a task target', () => {
    const target = {
      type: 'work_item' as const,
      id: 'w1',
      label: 'Tile the hallway',
      area: { id: 'a1', name: 'Kitchen', color: null, ancestors: [] },
    };
    wrap(<Parts.TargetLabel target={target} />);
    expect(screen.getByRole('link', { name: 'Tile the hallway' })).toHaveAttribute(
      'href',
      '/project/work-items/w1',
    );
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('renders the neutral Not assigned badge for a null target', () => {
    wrap(<Parts.TargetLabel target={null} />);
    expect(screen.getByText('Not assigned').className).toContain('neutral');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('TargetLabel plain (#2240)', () => {
  const target = {
    type: 'work_item' as const,
    id: 'w1',
    label: 'Tile the hallway',
    area: { id: 'a1', name: 'Kitchen', color: null, ancestors: [] },
  };

  it('renders the name as plain text, with its area, and no link', () => {
    wrap(<Parts.TargetLabel target={target} plain />);
    expect(screen.getByText('Tile the hallway')).toBeInTheDocument();
    expect(screen.getByText('Tile the hallway').closest('a')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('plain does not change the not-assigned badge', () => {
    wrap(<Parts.TargetLabel target={null} plain />);
    expect(screen.getByText('Not assigned').className).toContain('neutral');
  });

  it('without plain the same target is still a link', () => {
    wrap(<Parts.TargetLabel target={target} />);
    expect(screen.getByRole('link', { name: 'Tile the hallway' })).toBeInTheDocument();
  });
});

describe('ActionsCell', () => {
  it('renders nothing without menu items', () => {
    const { container } = wrap(
      <Parts.ActionsCell row={makeRow()} surface="table" prefix="cl" items={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the menu from a named trigger and reports the trigger element', async () => {
    const onTrigger = jest.fn();
    const onEdit = jest.fn();
    wrap(
      <Parts.ActionsCell
        row={makeRow()}
        surface="table"
        prefix="cl"
        items={[{ id: 'edit', label: 'Edit line', onClick: onEdit }]}
        onTrigger={onTrigger}
      />,
    );
    const trigger = screen.getByRole('button', { name: /Tile the hallway/ });
    await userEvent.click(trigger);
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({ id: 'bl1' }), trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit line' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('works without an onTrigger callback and names a line without a description', async () => {
    wrap(
      <Parts.ActionsCell
        row={makeRow({ description: null })}
        surface="card"
        prefix="cl"
        items={[{ id: 'edit', label: 'Edit line', onClick: jest.fn() }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Line without a description/ }));
    expect(await screen.findByRole('menuitem', { name: 'Edit line' })).toBeInTheDocument();
  });
});
