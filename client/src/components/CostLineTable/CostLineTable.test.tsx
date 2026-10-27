/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { CostLineTable, focusVisibleSplit } from './CostLineTable.js';
import type { CostLineSplitHandle, CostLineTableProps } from './CostLineTable.js';
import { groupForDocument } from './costLineRows.js';
import type { CostLineGroup, CostLineRow } from './types.js';

function makeRow(overrides: Partial<CostLineRow> = {}): CostLineRow {
  return {
    id: 'l1',
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
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: false,
    plannedAmount: 100,
    plannedGross: 119,
    gross: 119,
    net: 100,
    estimateDiffers: false,
    target: { type: 'work_item', id: 'task-1', label: 'Hallway tiling' },
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

function group(id: string, rows: CostLineRow[], extra: Partial<CostLineGroup> = {}): CostLineGroup {
  const total = rows.reduce((sum, r) => sum + r.gross, 0);
  return {
    id,
    heading: null,
    rows,
    total,
    plannedTotal: rows.reduce((sum, r) => sum + r.plannedGross, 0),
    ...extra,
  };
}

const ACTIONS = [{ id: 'edit', label: 'Edit', onClick: jest.fn() }];

function renderTable(props: Partial<CostLineTableProps> = {}) {
  const rowActions = jest.fn(() => ACTIONS);
  const view = render(
    <MemoryRouter>
      <LocaleProvider>
        <CostLineTable
          mode="item"
          groups={[group('g', [makeRow()])]}
          rowActions={rowActions}
          vatRate={0.19}
          {...props}
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
  return { ...view, rowActions };
}

const ESTIMATES: CostLineGroup = group('estimates', [makeRow()], {
  heading: { kind: 'estimates' },
});
const INVOICE_GROUP: CostLineGroup = group(
  'inv-1',
  [
    makeRow({
      id: 'l2',
      state: 'invoiced',
      invoiceId: 'inv-1',
      gross: 500,
      plannedGross: 450,
      estimateDiffers: true,
      margin: 0,
    }),
  ],
  {
    heading: {
      kind: 'document',
      invoiceId: 'inv-1',
      invoiceStatus: 'pending',
      invoiceNumber: 'INV-7',
      invoiceDate: '2026-03-02',
      vendorName: 'Example Plumbing Co',
    },
    total: 500,
    plannedTotal: 450,
  },
);

describe('CostLineTable item mode', () => {
  it('mounts both surfaces without duplicate test ids or data-figure', () => {
    const { container } = renderTable({ groups: [ESTIMATES, INVOICE_GROUP] });
    expect(screen.getByTestId('cost-lines-row-l1')).toBeInTheDocument();
    expect(screen.getByTestId('cost-lines-row-mobile-l1')).toBeInTheDocument();
    expect(findDuplicateTestIds(container)).toEqual([]);
    expect(container.querySelector('[data-figure]')).toBeNull();
  });

  it('lists the Estimates group first, then the invoice group with number, company and totals', () => {
    renderTable({ groups: [ESTIMATES, INVOICE_GROUP] });
    const table = screen.getByRole('table');
    const headings = within(table).getAllByRole('rowgroup');
    expect(headings.length).toBeGreaterThan(0);
    expect(within(table).getByText('Estimates')).toBeInTheDocument();
    const link = within(table).getByRole('link', { name: 'Invoice INV-7' });
    expect(link).toHaveAttribute('href', '/budget/invoices/inv-1');
    expect(within(table).getByText('Example Plumbing Co')).toBeInTheDocument();
    expect(within(table).getAllByText('Estimate €450.00').length).toBeGreaterThan(0);
    // Gross total of all groups.
    expect(screen.getByTestId('cost-lines-total').textContent).toContain('619');
    expect(screen.getByTestId('cost-lines-mobile-total').textContent).toContain('619');
  });

  it('names an offer group and falls back to the date without a number', () => {
    const offer = group('inv-2', [makeRow({ id: 'l3', invoiceId: 'inv-2' })], {
      heading: {
        kind: 'document',
        invoiceId: 'inv-2',
        invoiceStatus: 'quotation',
        invoiceNumber: null,
        invoiceDate: '2026-03-02',
        vendorName: null,
      },
    });
    renderTable({ groups: [offer] });
    const table = screen.getByRole('table');
    const link = within(table).getByRole('link');
    expect(link.textContent).toMatch(/^Offer from /);
    expect(link.textContent).toContain('2026');
    // plannedTotal equals total: no estimate hint in the heading.
    expect(within(table).queryByText(/^Estimate €/)).toBeNull();
  });

  it('shows quantity × price, the net tip and no estimate hint for a matching line', () => {
    const row = makeRow({ quantity: 12.5, unit: 'm²', unitPrice: 9.52, description: null });
    renderTable({ groups: [group('g', [row])] });
    expect(screen.getAllByText('12.5 m² × €9.52').length).toBe(2);
    expect(screen.getAllByText('Line without a description').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cost-lines-gross-l1')).toBeInTheDocument();
  });

  it('formats quantity × price without a unit and hides it when the estimate differs', () => {
    const noUnit = makeRow({ id: 'a', quantity: 3, unit: null, unitPrice: 10 });
    const differs = makeRow({
      id: 'b',
      quantity: 3,
      unitPrice: 10,
      estimateDiffers: true,
      plannedGross: 80,
    });
    renderTable({ groups: [group('g', [noUnit, differs])] });
    expect(screen.getAllByText('3 × €10.00').length).toBe(2);
    expect(screen.getAllByText('Estimate €80.00').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('cost-lines-row-b')).getAllByText('—').length).toBe(1);
  });

  it('shows the facts line from category, funding source and company', () => {
    const row = makeRow({
      categoryName: 'Materials',
      categoryTranslationKey: null,
      budgetSourceName: 'Savings',
      vendorName: 'Example Tiles Ltd',
    });
    renderTable({ groups: [group('g', [row])] });
    expect(
      within(screen.getByTestId('cost-lines-row-l1')).getByText(
        'Materials · Savings · Example Tiles Ltd',
      ),
    ).toBeInTheDocument();
  });

  it('asks rowActions per row and reports the ⋯ trigger that was pressed', async () => {
    const onTrigger = jest.fn();
    renderTable({ onRowActionsTrigger: onTrigger });
    const trigger = within(screen.getByTestId('cost-lines-row-l1')).getByRole('button', {
      name: 'Actions for Tile the hallway',
    });
    await userEvent.click(trigger);
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), trigger);
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('works without an onRowActionsTrigger and renders no menu without actions', async () => {
    renderTable();
    await userEvent.click(
      within(screen.getByTestId('cost-lines-row-l1')).getByRole('button', {
        name: 'Actions for Tile the hallway',
      }),
    );
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('omits the ⋯ menu for a row with no actions', () => {
    renderTable({ rowActions: () => [] });
    expect(
      within(screen.getByTestId('cost-lines-row-l1')).queryByRole('button', {
        name: /Actions for/,
      }),
    ).toBeNull();
  });

  it('uses a custom test id prefix', () => {
    renderTable({ testIdPrefix: 'task-lines' });
    expect(screen.getByTestId('task-lines-row-l1')).toBeInTheDocument();
  });

  it('never shows a split row in item mode', () => {
    renderTable({ remainingAmount: 500 });
    expect(screen.queryByTestId('cost-lines-not-yet-split')).toBeNull();
  });
});

describe('CostLineTable document mode', () => {
  const docRows = [
    makeRow({ id: 'd1', includesVat: false, description: 'Adhesive' }),
    makeRow({
      id: 'd2',
      includesVat: true,
      description: 'Grout',
      target: { type: 'household_item', id: 'buy-1', label: 'Bathroom tiles' },
    }),
    makeRow({
      id: 'd3',
      description: 'Loose line',
      target: null,
    }),
  ];

  function renderDoc(props: Partial<CostLineTableProps> = {}) {
    return renderTable({
      mode: 'document',
      groups: groupForDocument(docRows),
      remainingAmount: 0,
      documentKind: 'invoice',
      ...props,
    });
  }

  it('S9: adds an Entered as column but no Belongs to column, with Net and Gross badges', () => {
    renderDoc();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Entered as' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Belongs to' })).toBeNull();
    // 5 data columns + actions: item mode has one fewer (no Entered as)
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
    expect(screen.getByTestId('cost-lines-row-d1').querySelectorAll('td')).toHaveLength(6);
    expect(within(screen.getByTestId('cost-lines-row-d1')).getByText('Net')).toBeInTheDocument();
    expect(within(screen.getByTestId('cost-lines-row-d2')).getByText('Gross')).toBeInTheDocument();
  });

  it('S9: one group per task or purchase, the unassigned lines last, each heading with its total', () => {
    const { container } = renderDoc();
    const heads = ['target-work_item-task-1', 'target-household_item-buy-1', 'unassigned'].map(
      (id) => screen.getByTestId(`cost-lines-group-${id}`),
    );
    // DOM order is first appearance, unassigned last
    for (let i = 0; i < heads.length - 1; i += 1) {
      expect(
        heads[i]!.compareDocumentPosition(heads[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(heads[0]).toHaveTextContent('Hallway tiling');
    expect(heads[0]).toHaveTextContent('€119.00');
    expect(heads[2]).toHaveTextContent('Not assigned');
    expect(heads[0]).toHaveAttribute('colspan', '6');
    // the mobile cards carry their own heading ids
    expect(screen.getByTestId('cost-lines-group-mobile-unassigned')).toHaveTextContent(
      'Not assigned',
    );
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  it('S9: item mode keeps five columns and no target group heading', () => {
    renderTable({ groups: [ESTIMATES] });
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.queryByTestId('cost-lines-group-estimates')).not.toBeNull();
  });

  it('links the group heading target with the origin state and marks unassigned lines', () => {
    renderDoc({ linkState: { from: '/budget/invoices/x' } as never });
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'Hallway tiling' })).toHaveAttribute(
      'href',
      '/project/work-items/task-1',
    );
    expect(within(table).getByRole('link', { name: 'Bathroom tiles' })).toHaveAttribute(
      'href',
      '/project/household-items/buy-1',
    );
    expect(within(table).getByText('Not assigned')).toBeInTheDocument();
  });

  it('shows a muted "No area" for a task or purchase without an area, on both surfaces', () => {
    const row = makeRow({
      target: { type: 'household_item', id: 'buy-9', label: 'Spare tiles' },
    });
    renderDoc({ groups: groupForDocument([row]) });
    expect(screen.getAllByText('No area')).toHaveLength(2);
  });

  it('groups quantity × price with the Net or Gross badge on the card money line', () => {
    const { container } = renderDoc({
      groups: [
        group('doc', [
          makeRow({ id: 'q1', includesVat: false, quantity: 4, unit: 'm²', unitPrice: 10 }),
        ]),
      ],
    });
    const entered = container.querySelectorAll('.cardEntered');
    expect(entered).toHaveLength(1);
    expect(entered[0]).toHaveTextContent('Net');
    expect(entered[0]).toHaveTextContent('4 m² × €10');
  });

  it('keeps the card money line free of the Net or Gross badge in item mode', () => {
    const { container } = renderTable({ groups: [group('g', [makeRow({ id: 'i1' })])] });
    const entered = container.querySelectorAll('.cardEntered');
    expect(entered).toHaveLength(1);
    expect(entered[0]).not.toHaveTextContent('Net');
  });

  it('shows the area breadcrumb of the target', () => {
    const row = makeRow({
      target: {
        type: 'work_item',
        id: 'task-1',
        label: 'Hallway tiling',
        area: {
          id: 'a1',
          name: 'Kitchen',
          color: null,
          ancestors: [{ id: 'a0', name: 'Ground floor', color: null }],
        } as never,
      },
    });
    renderDoc({ groups: groupForDocument([row]) });
    expect(screen.getAllByText(/Kitchen/).length).toBeGreaterThan(0);
  });

  it('shows no split row when nothing is left (cents compare)', () => {
    renderDoc({ remainingAmount: 0.99, onSplit: jest.fn() });
    expect(screen.queryByTestId('cost-lines-not-yet-split')).toBeNull();
    expect(screen.queryByTestId('cost-lines-over')).toBeNull();
  });

  it('shows Not yet split with a Split button on both surfaces that calls onSplit', async () => {
    const onSplit = jest.fn();
    const { container } = renderDoc({ remainingAmount: 40, onSplit });
    expect(screen.getByTestId('cost-lines-not-yet-split')).toHaveTextContent(
      'Not yet split · €40.00',
    );
    expect(screen.getByTestId('cost-lines-mobile-not-yet-split')).toBeInTheDocument();
    const split = screen.getByTestId('cost-lines-split');
    expect(split).toHaveAccessibleName('Split the rest of this invoice into cost lines');
    await userEvent.click(split);
    await userEvent.click(screen.getByTestId('cost-lines-mobile-split'));
    expect(onSplit).toHaveBeenCalledTimes(2);
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  it('names the offer in the Split label', () => {
    renderDoc({ remainingAmount: 40, onSplit: jest.fn(), documentKind: 'offer' });
    expect(screen.getByTestId('cost-lines-split')).toHaveAccessibleName(
      'Split the rest of this offer into cost lines',
    );
  });

  it('defaults the document kind to invoice', () => {
    renderDoc({ remainingAmount: 40, onSplit: jest.fn(), documentKind: undefined });
    expect(screen.getByTestId('cost-lines-split').getAttribute('aria-label')).toContain('invoice');
  });

  it('shows the Not yet split text without a button when no onSplit is given', () => {
    renderDoc({ remainingAmount: 40 });
    expect(screen.getByTestId('cost-lines-not-yet-split')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-lines-split')).toBeNull();
  });

  it('shows the over row without a Split button when the lines exceed the document', () => {
    renderDoc({ remainingAmount: -25, onSplit: jest.fn() });
    expect(screen.getByTestId('cost-lines-over')).toHaveTextContent('Lines are €25.00 over');
    expect(screen.getByTestId('cost-lines-mobile-over')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-lines-split')).toBeNull();
  });

  it('shows no split row when the remaining amount is unknown', () => {
    renderDoc({ remainingAmount: undefined, onSplit: jest.fn() });
    expect(screen.queryByTestId('cost-lines-not-yet-split')).toBeNull();
  });

  it('exposes a Split handle that focuses a split button', () => {
    const ref = createRef<CostLineSplitHandle>();
    renderDoc({ remainingAmount: 40, onSplit: jest.fn(), splitButtonRef: ref });
    ref.current?.focus();
    expect(document.activeElement?.getAttribute('data-testid')).toMatch(/^cost-lines-split/);
  });
});

describe('focusVisibleSplit', () => {
  function button(rendered: boolean): HTMLButtonElement {
    const el = document.createElement('button');
    document.body.appendChild(el);
    el.getClientRects = () => (rendered ? ([{}] as unknown as DOMRectList) : ([] as never));
    return el;
  }

  it('focuses the copy that has layout boxes', () => {
    const hidden = button(false);
    const shown = button(true);
    focusVisibleSplit([hidden, shown]);
    expect(shown).toHaveFocus();
    hidden.remove();
    shown.remove();
  });

  it('falls back to the first present button when none has layout (jsdom)', () => {
    const first = button(false);
    const second = button(false);
    focusVisibleSplit([null, first, second]);
    expect(first).toHaveFocus();
    first.remove();
    second.remove();
  });

  it('does nothing when no button is mounted', () => {
    expect(() => focusVisibleSplit([null, null])).not.toThrow();
  });
});

describe('CostLineTable net tip', () => {
  it('opens the net tip from the gross cell', async () => {
    renderTable();
    const row = screen.getByTestId('cost-lines-row-l1');
    const tip = within(row).getByRole('button', { name: /net/i });
    fireEvent.focus(tip);
    expect(await screen.findAllByRole('tooltip')).not.toHaveLength(0);
  });
});
