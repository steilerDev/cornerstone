/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { InvoiceDeposit, InvoiceListRow } from '@cornerstone/shared';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import { CommandSearchProvider } from '../../components/CommandSearch/CommandSearchContext.js';
import type { ObjectListConfig } from '../../components/ObjectList/types.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { makeDeposit, makeRow } from '../../test/invoiceListFixtures.js';
import type * as RowsModule from './useInvoiceRows.js';
import type { InvoiceListMeta } from './useInvoicesList.js';
import type { OverflowMenuItem } from '../../components/OverflowMenu/OverflowMenu.js';
import type { InvoiceMarkPaidActions } from './InvoiceMarkPaid.js';
import { todayIso } from './openItemsUtils.js';

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

// The entries language is context state fed by the signed-in user's settings; here it is a variable.
let entriesLanguage: string | null = 'de';
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => entriesLanguage,
  useHouseName: () => ({
    houseName: null,
    setHouseName: () => undefined,
    entriesLanguage,
    setEntriesLanguage: () => undefined,
  }),
  HouseNameProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let useInvoiceRows: typeof RowsModule.useInvoiceRows;

const actions: InvoiceMarkPaidActions = {
  markInvoicePaid: jest.fn<InvoiceMarkPaidActions['markInvoicePaid']>().mockResolvedValue(),
  markProgressPaymentPaid: jest
    .fn<InvoiceMarkPaidActions['markProgressPaymentPaid']>()
    .mockResolvedValue(),
  markManyPaid: jest.fn<InvoiceMarkPaidActions['markManyPaid']>().mockResolvedValue(),
};

/** Local ISO date `days` from today (the hook reads the real clock). */
function isoOffset(days: number): string {
  const [y, m, d] = todayIso().split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

let out: ReturnType<typeof RowsModule.useInvoiceRows>;

function Probe({ chip }: { chip: string }) {
  out = useInvoiceRows({ chip, actions });
  return null;
}

function mountHook(chip = 'pending') {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Probe chip={chip} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function show(node: ReactNode) {
  return render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );
}

function showCells(node: ReactNode) {
  return show(
    <table>
      <tbody>
        <tr>{node}</tr>
      </tbody>
    </table>,
  );
}

beforeEach(async () => {
  if (!useInvoiceRows) ({ useInvoiceRows } = await import('./useInvoiceRows.js'));
  jest.mocked(actions.markInvoicePaid).mockClear();
});

function column(key: string) {
  const col = out.columns!.find((c) => c.key === key);
  if (!col) throw new Error(`no column ${key}`);
  return col;
}

describe('title and secondary line', () => {
  it('links the invoice number to the invoice and marks it as user text', () => {
    mountHook();
    expect(out.title(makeRow())).toEqual({
      text: 'INV-T-001',
      to: '/budget/invoices/inv-1',
      isUserText: true,
    });
  });

  it('falls back to "No number" as plain text', () => {
    mountHook();
    expect(out.title(makeRow({ invoiceNumber: null }))).toEqual({
      text: 'No number',
      to: '/budget/invoices/inv-1',
      isUserText: false,
    });
  });

  it('shows the company as a link to the company page', () => {
    mountHook();
    show(<>{out.renderSecondary!(makeRow())}</>);
    const link = screen.getByRole('link', { name: 'Example Roofing Ltd' });
    expect(link).toHaveAttribute('href', '/companies/v-1');
    expect(link).toHaveAttribute('data-testid', 'invoices-company-inv-1');
  });

  it('adds Not yet split, Overdue and no other badge for a pending overdue split-less invoice', () => {
    mountHook();
    show(
      <>
        {out.renderSecondary!(
          makeRow({ notYetSplit: true, dueDate: isoOffset(-3), status: 'pending' }),
        )}
      </>,
    );
    expect(screen.getByTestId('invoices-badge-not-yet-split-inv-1')).toHaveTextContent(
      'Not yet split',
    );
    expect(screen.getByTestId('invoices-badge-flag-inv-1')).toHaveTextContent('Overdue');
    expect(screen.queryByTestId('invoices-badge-progress-overdue-inv-1')).toBeNull();
    expect(screen.queryByTestId('invoices-badge-progress-only-inv-1')).toBeNull();
  });

  it('shows Due soon within seven days and no flag for a far or missing due date', () => {
    mountHook();
    const { unmount } = show(<>{out.renderSecondary!(makeRow({ dueDate: isoOffset(7) }))}</>);
    expect(screen.getByTestId('invoices-badge-flag-inv-1')).toHaveTextContent('Due soon');
    unmount();

    const far = show(<>{out.renderSecondary!(makeRow({ dueDate: isoOffset(30) }))}</>);
    expect(screen.queryByTestId('invoices-badge-flag-inv-1')).toBeNull();
    far.unmount();

    show(<>{out.renderSecondary!(makeRow({ dueDate: null }))}</>);
    expect(screen.queryByTestId('invoices-badge-flag-inv-1')).toBeNull();
  });

  it('flags only pending invoices: a paid invoice past due has no Overdue badge', () => {
    mountHook();
    show(<>{out.renderSecondary!(makeRow({ status: 'paid', dueDate: isoOffset(-10) }))}</>);
    expect(screen.queryByTestId('invoices-badge-flag-inv-1')).toBeNull();
  });

  it('shows Progress payment overdue when an open progress payment is overdue and the invoice itself is not', () => {
    mountHook();
    const row = makeRow({
      dueDate: isoOffset(30),
      deposits: [makeDeposit({ dueDate: isoOffset(-2) })],
    });
    show(<>{out.renderSecondary!(row)}</>);
    expect(screen.getByTestId('invoices-badge-progress-overdue-inv-1')).toHaveTextContent(
      'Progress payment overdue',
    );
  });

  it('shows Progress payments only for a container row on the To pay chip, not on other chips', () => {
    mountHook('pending');
    const offer = makeRow({ status: 'quotation', deposits: [makeDeposit()] });
    const { unmount } = show(<>{out.renderSecondary!(offer)}</>);
    expect(screen.getByTestId('invoices-badge-progress-only-inv-1')).toHaveTextContent(
      'Progress payments only',
    );
    unmount();

    mountHook('quotation');
    show(<>{out.renderSecondary!(offer)}</>);
    expect(screen.queryByTestId('invoices-badge-progress-only-inv-1')).toBeNull();
  });
});

describe('columns', () => {
  it('lists the columns in order with the sort values', () => {
    mountHook();
    expect(out.columns!.map((c) => [c.key, c.sortValue ?? null, c.defaultVisible ?? true])).toEqual(
      [
        ['date', 'date', true],
        ['dueDate', 'due_date', true],
        ['amount', 'amount', true],
        ['stillDue', null, true],
        ['allocated', null, false],
        ['notes', null, false],
        ['offered', null, true],
        ['offerPaid', null, true],
        ['remainingOnOffer', null, true],
        ['progressPayments', null, true],
      ],
    );
  });

  const text = (key: string, row: InvoiceListRow) => {
    const { container } = show(<>{column(key).render(row)}</>);
    return container.textContent;
  };

  it('formats the date, due date (en dash when missing), amount and still to pay', () => {
    mountHook();
    expect(text('date', makeRow({ date: '2026-05-01' }))).toMatch(/2026/);
    expect(text('dueDate', makeRow({ dueDate: '2026-08-30' }))).toMatch(/2026/);
    expect(text('dueDate', makeRow({ dueDate: null }))).toBe('—');
    expect(text('amount', makeRow({ amount: 1234.5 }))).toBe('€1,234.50');
    expect(text('stillDue', makeRow({ openAmount: 99 }))).toBe('€99.00');
  });

  it('words the split as a percentage of the amount, an en dash without lines or amount', () => {
    mountHook();
    const line = (itemizedAmount: number) =>
      ({ id: 'l', itemizedAmount }) as unknown as InvoiceListRow['budgetLines'][number];
    expect(text('allocated', makeRow({ budgetLines: [] }))).toBe('—');
    expect(text('allocated', makeRow({ amount: 0, budgetLines: [line(5)] }))).toBe('—');
    expect(text('allocated', makeRow({ amount: 200, budgetLines: [line(50), line(50)] }))).toBe(
      '50% split',
    );
  });

  it('shows the notes or an en dash', () => {
    mountHook();
    expect(text('notes', makeRow({ notes: 'Scaffolding included' }))).toBe('Scaffolding included');
    expect(text('notes', makeRow({ notes: null }))).toBe('—');
  });

  it('shows the Offers columns for offers only', () => {
    mountHook();
    const offer = makeRow({
      status: 'quotation',
      amount: 5000,
      paid: 1200,
      remainingOnOffer: 3800,
      deposits: [
        makeDeposit({ id: 'd1' }),
        makeDeposit({ id: 'd2', entryType: 'refund' }),
        makeDeposit({ id: 'd3' }),
      ],
    });
    expect(text('offered', offer)).toBe('€5,000.00');
    expect(text('offerPaid', offer)).toBe('€1,200.00');
    expect(text('remainingOnOffer', offer)).toBe('€3,800.00');
    expect(text('progressPayments', offer)).toBe('2');

    const invoice = makeRow();
    expect(text('offered', invoice)).toBe('—');
    expect(text('offerPaid', invoice)).toBe('—');
    expect(text('remainingOnOffer', invoice)).toBe('—');
    expect(text('progressPayments', invoice)).toBe('—');
  });

  it('hides the Offers columns on every chip except Offers', () => {
    const offerKeys = ['offered', 'offerPaid', 'remainingOnOffer', 'progressPayments'];
    for (const chip of ['pending', 'paid', 'claimed', 'all']) {
      const { unmount } = mountHook(chip);
      expect(out.hiddenColumnKeys).toEqual(offerKeys);
      unmount();
    }
    mountHook('quotation');
    expect(out.hiddenColumnKeys).toEqual([]);
  });
});

describe('status, command, row menu and facts', () => {
  it('renders the status badge on both surfaces and the flag only on the card', () => {
    mountHook();
    const row = makeRow({ dueDate: isoOffset(-1) });
    const table = show(<>{out.renderStatus!(row, 'table')}</>);
    expect(screen.getByTestId('invoices-status-inv-1')).toHaveTextContent('To pay');
    expect(screen.queryByTestId('invoices-badge-flag-mobile-inv-1')).toBeNull();
    table.unmount();

    show(<>{out.renderStatus!(row, 'card')}</>);
    expect(screen.getByTestId('invoices-status-mobile-inv-1')).toHaveTextContent('To pay');
    expect(screen.getByTestId('invoices-badge-flag-mobile-inv-1')).toHaveTextContent('Overdue');
  });

  it('shows no flag on the card without one', () => {
    mountHook();
    show(<>{out.renderStatus!(makeRow({ dueDate: null }), 'card')}</>);
    expect(screen.queryByTestId('invoices-badge-flag-mobile-inv-1')).toBeNull();
  });

  it('the row command is Mark paid for a pending invoice and nothing for others', () => {
    mountHook();
    const { unmount } = show(<>{out.renderCommand!(makeRow())}</>);
    expect(screen.getByTestId('invoices-mark-paid-inv-1')).toBeInTheDocument();
    unmount();
    show(<>{out.renderCommand!(makeRow({ status: 'paid' }))}</>);
    expect(screen.queryByTestId('invoices-mark-paid-inv-1')).toBeNull();
  });

  it('the card row menu has Mark paid for a pending invoice, which marks it paid', () => {
    mountHook();
    const entries = out.rowMenu!(makeRow(), 'card');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'mark-paid',
      label: 'Mark paid',
      testId: 'invoices-mark-paid-mobile-inv-1',
    });
    (entries[0] as OverflowMenuItem).onClick();
    expect(actions.markInvoicePaid).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-1' }),
      'INV-T-001',
    );
  });

  it('has no menu entries on the table surface or for a row that is not pending', () => {
    mountHook();
    expect(out.rowMenu!(makeRow(), 'table')).toEqual([]);
    expect(out.rowMenu!(makeRow({ status: 'paid' }), 'card')).toEqual([]);
    expect(out.rowMenu!(makeRow({ status: 'quotation' }), 'card')).toEqual([]);
  });

  it('card facts for an invoice: company, due date or "No due date", amount', () => {
    mountHook();
    const facts = out.facts(makeRow({ dueDate: '2026-08-30', amount: 1234.5 }));
    expect(facts.map((f) => f.key)).toEqual(['company', 'due', 'amount']);
    const { container } = show(
      <>
        {facts.map((f) => (
          <span key={f.key}>{f.content}</span>
        ))}
      </>,
    );
    expect(container).toHaveTextContent(/Example Roofing Ltd/);
    expect(container).toHaveTextContent(/Due .*2026/);
    expect(container).toHaveTextContent('€1,234.50');

    const none = out.facts(makeRow({ dueDate: null }));
    expect(none[1]!.content).toBe('No due date');
  });

  it('card facts for an offer: company, remaining on offer, offered', () => {
    mountHook();
    const facts = out.facts(makeRow({ status: 'quotation', amount: 900, remainingOnOffer: 400 }));
    expect(facts.map((f) => f.key)).toEqual(['company', 'remaining', 'offered']);
    expect(facts[1]!.content).toBe('€400.00 remaining on offer');
    expect(facts[2]!.content).toBe('€900.00 offered');
    expect(out.facts(makeRow({ status: 'quotation', remainingOnOffer: null }))[1]!.content).toBe(
      '€0.00 remaining on offer',
    );
  });
});

describe('progress payments as child rows', () => {
  const open = makeDeposit({ id: 'd-open', dueDate: isoOffset(-4), amount: 300 });
  const paid = makeDeposit({ id: 'd-paid', status: 'paid', dueDate: isoOffset(-40), amount: 200 });
  const refund = makeDeposit({
    id: 'd-refund',
    entryType: 'refund',
    status: 'paid',
    dueDate: isoOffset(5),
    amount: 50,
    description: 'Returned deposit',
  });
  const row = makeRow({ status: 'quotation', deposits: [open, paid, refund] });

  it('lists only the open progress payments on To pay and all of them elsewhere', () => {
    mountHook('pending');
    expect(out.expandable!.getChildren(row).map((d) => d.id)).toEqual(['d-open']);
    mountHook('quotation');
    expect(out.expandable!.getChildren(row).map((d) => d.id)).toEqual([
      'd-open',
      'd-paid',
      'd-refund',
    ]);
    expect(out.expandable!.getChildKey(open, row)).toBe('d-open');
  });

  it('keeps a pending refund among the open children: flagged when due soon, with no Mark paid', () => {
    mountHook('pending');
    const pendingRefund = makeDeposit({
      id: 'd-pr',
      entryType: 'refund',
      status: 'pending',
      dueDate: isoOffset(2),
      amount: 80,
    });
    const withRefund = makeRow({ status: 'quotation', deposits: [open, pendingRefund] });
    expect(out.expandable!.getChildren(withRefund).map((d) => d.id)).toEqual(['d-open', 'd-pr']);
    show(
      <>
        <table>
          <tbody>
            <tr>
              {out.expandable!.renderChildCells(pendingRefund, withRefund, ['dueDate', 'stillDue'])}
            </tr>
          </tbody>
        </table>
        {out.expandable!.renderChildCommand!(pendingRefund, withRefund)}
      </>,
    );
    expect(screen.getByTestId('invoices-child-flag-d-pr')).toHaveTextContent('Due soon');
    expect(screen.queryByTestId('invoices-child-command-d-pr')).toBeNull();
    expect(screen.getAllByRole('cell')[1]).toHaveTextContent('—');
  });

  it('expands by default only on To pay and only with children', () => {
    mountHook('pending');
    expect(out.expandable!.isDefaultExpanded!(row)).toBe(true);
    expect(out.expandable!.isDefaultExpanded!(makeRow())).toBe(false);
    mountHook('paid');
    expect(out.expandable!.isDefaultExpanded!(row)).toBe(false);
  });

  it('words the expand and collapse labels with the number or "No number"', () => {
    mountHook();
    const { getExpandLabel } = out.expandable!;
    expect(getExpandLabel(row, false, 1)).toBe('Show 1 progress payment of INV-T-001');
    expect(getExpandLabel(row, true, 2)).toBe('Hide 2 progress payments of INV-T-001');
    const anon = makeRow({ invoiceNumber: null });
    expect(getExpandLabel(anon, false, 2)).toBe('Show 2 progress payments of No number');
    expect(getExpandLabel(anon, true, 1)).toBe('Hide 1 progress payment of No number');
  });

  it('titles a progress payment with its ordinal and a hidden "Part of" prefix', () => {
    mountHook('quotation');
    show(<>{out.expandable!.renderChildTitle!(paid, row)}</>);
    expect(screen.getByText('Part of INV-T-001:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Progress payment 2 of 2/)).toBeInTheDocument();
  });

  it('titles a refund with the Refund badge and a number-less parent with "No number"', () => {
    mountHook('quotation');
    const anon = makeRow({ invoiceNumber: null, deposits: [refund] });
    show(<>{out.expandable!.renderChildTitle!(refund, anon)}</>);
    expect(screen.getByText('Refund')).toBeInTheDocument();
    expect(screen.getByText(/Part of No number/)).toBeInTheDocument();
  });

  it('names a payment that is not among the invoice deposits by the invoice number, or nothing', () => {
    mountHook('quotation');
    const stray = makeDeposit({ id: 'd-stray' });
    const { container, unmount } = show(
      <>{out.expandable!.renderChildTitle!(stray, makeRow({ deposits: [] }))}</>,
    );
    expect(container).toHaveTextContent('INV-T-001');
    unmount();
    const bare = show(
      <>
        {out.expandable!.renderChildTitle!(stray, makeRow({ invoiceNumber: null, deposits: [] }))}
      </>,
    );
    expect(bare.container).not.toHaveTextContent('INV-T-001');
  });

  it('renders the child status and the child Mark paid command (pending only)', () => {
    mountHook('quotation');
    const { unmount } = show(
      <>
        {out.expandable!.renderChildStatus!(open, row)}
        {out.expandable!.renderChildCommand!(open, row)}
      </>,
    );
    expect(screen.getByTestId('invoices-child-status-d-open')).toHaveTextContent('To pay');
    expect(screen.getByTestId('invoices-child-command-d-open')).toBeInTheDocument();
    unmount();

    show(
      <>
        {out.expandable!.renderChildStatus!(paid, row)}
        {out.expandable!.renderChildCommand!(paid, row)}
      </>,
    );
    expect(screen.getByTestId('invoices-child-status-d-paid')).toHaveTextContent('Paid');
    expect(screen.queryByTestId('invoices-child-command-d-paid')).toBeNull();
  });

  it('renders the table cells of a pending overdue progress payment', () => {
    mountHook('quotation');
    const keys = ['dueDate', 'amount', 'stillDue', 'notes', 'date', 'offered'];
    showCells(out.expandable!.renderChildCells(open, row, keys));
    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent(/2026|\d{4}/);
    expect(within(cells[0]!).getByTestId('invoices-child-flag-d-open')).toHaveTextContent(
      'Overdue',
    );
    expect(cells[1]).toHaveTextContent('€300.00');
    expect(cells[2]).toHaveTextContent('€300.00');
    expect(cells[3]).toHaveTextContent('—');
    expect(cells[4]).toHaveTextContent('—');
    expect(cells[5]).toHaveTextContent('—');
  });

  it('shows a refund negative, with its description, and nothing still to pay', () => {
    mountHook('quotation');
    showCells(
      out.expandable!.renderChildCells(refund, row, ['dueDate', 'amount', 'stillDue', 'notes']),
    );
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('-€50.00');
    expect(cells[2]).toHaveTextContent('—');
    expect(cells[3]).toHaveTextContent('Returned deposit');
    expect(screen.queryByTestId('invoices-child-flag-d-refund')).toBeNull();
  });

  it('wraps a description as user text: it carries the entries language and the userText class', () => {
    entriesLanguage = 'de';
    mountHook('quotation');
    showCells(out.expandable!.renderChildCells(refund, row, ['notes']));
    const note = screen.getByText('Returned deposit');
    expect(note.tagName).toBe('SPAN');
    expect(note).toHaveAttribute('lang', 'de');
    expect(note).toHaveClass('userText');
  });

  it('sets no lang while the entries language is unknown, but keeps the class', () => {
    entriesLanguage = null;
    mountHook('quotation');
    showCells(out.expandable!.renderChildCells(refund, row, ['notes']));
    const note = screen.getByText('Returned deposit');
    expect(note).not.toHaveAttribute('lang');
    expect(note).toHaveClass('userText');
    entriesLanguage = 'de';
  });

  it.each([[null], [''], ['   '.slice(0, 0)]])(
    'shows a plain en dash without any user-text marker for the description %p',
    (description) => {
      mountHook('quotation');
      const bare = makeDeposit({ id: 'd-bare', description });
      showCells(out.expandable!.renderChildCells(bare, row, ['notes']));
      const cell = screen.getByRole('cell');
      expect(cell).toHaveTextContent(/^—$/);
      expect(cell.querySelector('[lang]')).toBeNull();
      expect(cell.querySelector('.userText')).toBeNull();
      expect(cell.querySelector('span')).toBeNull();
    },
  );

  it('flags nothing on a paid progress payment and shows Due soon for one due within a week', () => {
    mountHook('quotation');
    const soon = makeDeposit({ id: 'd-soon', dueDate: isoOffset(3) });
    const far = makeDeposit({ id: 'd-far', dueDate: isoOffset(60) });
    showCells(
      <>
        {out.expandable!.renderChildCells(paid, row, ['dueDate'])}
        {out.expandable!.renderChildCells(soon, row, ['dueDate'])}
        {out.expandable!.renderChildCells(far, row, ['dueDate'])}
      </>,
    );
    expect(screen.queryByTestId('invoices-child-flag-d-paid')).toBeNull();
    expect(screen.getByTestId('invoices-child-flag-d-soon')).toHaveTextContent('Due soon');
    expect(screen.queryByTestId('invoices-child-flag-d-far')).toBeNull();
    // a paid progress payment still due nothing
    showCells(out.expandable!.renderChildCells(paid, row, ['stillDue']));
    expect(screen.getAllByRole('cell').at(-1)).toHaveTextContent('—');
  });

  it('renders the card of a child with title, due date and flag, signed amount, status and command', () => {
    mountHook('quotation');
    show(<>{out.expandable!.renderChildCard!(open, row)}</>);
    expect(screen.getAllByText(/Progress payment 1 of 2/).length).toBeGreaterThan(0);
    expect(screen.getByText('€300.00')).toBeInTheDocument();
    expect(screen.getByTestId('invoices-child-flag-mobile-d-open')).toHaveTextContent('Overdue');
    expect(screen.getByTestId('invoices-child-status-mobile-d-open')).toBeInTheDocument();
    expect(screen.getByTestId('invoices-child-command-mobile-d-open')).toBeInTheDocument();
  });
});

describe('inside the ObjectList', () => {
  const config: ObjectListConfig<InvoiceListRow> = {
    listKey: 'invoices',
    testIdPrefix: 'invoices',
    sort: {
      options: [{ value: 'date', label: 'Date' }],
      defaultValue: 'date',
      defaultOrder: 'asc',
    },
  };

  function Host({ rows, chip }: { rows: InvoiceListRow[]; chip: string }) {
    const list = useObjectList<InvoiceListRow, InvoiceListMeta>({
      config,
      getKey: (r) => r.id,
      fetchPage: () => Promise.resolve({ items: rows, totalItems: rows.length }),
    });
    const props = useInvoiceRows({ chip, actions });
    return (
      <ObjectList<InvoiceListRow, InvoiceListMeta, InvoiceDeposit>
        list={list}
        config={config}
        labels={{
          title: 'Invoices',
          search: 'Search',
          resultCount: (n) => `${n}`,
          empty: 'none',
          noMatch: 'none',
          loadFailed: 'failed',
        }}
        primary={{ label: 'New invoice', onClick: () => undefined }}
        titleHeader="Invoice"
        statusHeader="Status"
        {...props}
      />
    );
  }

  it('keeps every data-testid unique across the table and the cards, with a row menu open', async () => {
    const rows = [
      makeRow({ id: 'inv-1', deposits: [makeDeposit({ id: 'd1', invoiceId: 'inv-1' })] }),
      makeRow({ id: 'inv-2', invoiceNumber: 'INV-T-002' }),
    ];
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <CommandSearchProvider isOpen={false} onOpen={() => undefined} onClose={() => undefined}>
            <Host rows={rows} chip="pending" />
          </CommandSearchProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await screen.findByTestId('invoices-row-inv-1');
    expect(findDuplicateTestIds(container)).toEqual([]);
    expect(screen.getByTestId('invoices-title-inv-1')).toHaveTextContent('INV-T-001');

    fireEvent.click(screen.getByTestId('invoices-row-menu-mobile-inv-1'));
    expect(findDuplicateTestIds(container)).toEqual([]);
    expect(findDuplicateTestIds(document.body)).toEqual([]);
  });
});
