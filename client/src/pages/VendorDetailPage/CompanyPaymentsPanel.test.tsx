/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  InvoiceDeposit,
  InvoiceListRow,
  InvoiceStatus,
  VendorDetail,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { InvoiceCreateContext } from '../../objectForms/invoiceCreateContext.js';
import type { OpenInvoiceForm } from '../../objectForms/invoiceCreateContext.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as DeleteImpactTypes from '../../lib/deleteImpactApi.js';
import type * as PanelTypes from './CompanyPaymentsPanel.js';
import type { UseCompanyPaymentsResult } from './useCompanyPayments.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));
const mockDeleteInvoice = jest.fn<typeof InvoicesApiTypes.deleteInvoice>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({ deleteInvoice: mockDeleteInvoice }));
const mockImpact = jest.fn<typeof DeleteImpactTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({ fetchDeleteImpact: mockImpact }));

let Panel: typeof PanelTypes;

const VENDOR = {
  id: 'v1',
  name: 'Sample Co',
  paid: 900,
  stillToPay: 600,
} as unknown as VendorDetail;

function deposit(id: string, over: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id,
    invoiceId: 'x',
    amount: 100,
    dueDate: '2026-03-01',
    paidDate: null,
    claimedDate: null,
    description: null,
    status: 'paid',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function rec(
  id: string,
  status: InvoiceStatus,
  over: Partial<Record<string, unknown>> = {},
): InvoiceListRow {
  return {
    id,
    vendorId: 'v1',
    invoiceNumber: `R-${id}`,
    amount: 1000,
    date: '2026-02-01',
    dueDate: null,
    status,
    paid: 0,
    openAmount: 1000,
    remainingOnOffer: 400,
    deposits: [],
    ...over,
  } as unknown as InvoiceListRow;
}

const result = (
  rows: readonly InvoiceListRow[] | null,
  failure: UseCompanyPaymentsResult['failure'] = null,
): UseCompanyPaymentsResult => ({ rows, failure, retry: jest.fn() });

const onChanged = jest.fn<() => Promise<unknown>>();
const openForm = jest.fn<OpenInvoiceForm>();

function renderPanel(payments: UseCompanyPaymentsResult, withForm = true) {
  const headingRef = createRef<HTMLHeadingElement>();
  const utils = render(
    <ToastProvider>
      <MemoryRouter>
        <InvoiceCreateContext value={withForm ? openForm : null}>
          <h1 ref={headingRef} tabIndex={-1}>
            Sample Co
          </h1>
          <Panel.CompanyPaymentsPanel
            vendor={VENDOR}
            payments={payments}
            originState={{ origin: { to: '/companies/v1', label: 'Sample Co' } } as never}
            onChanged={onChanged}
            headingRef={headingRef}
          />
        </InvoiceCreateContext>
      </MemoryRouter>
    </ToastProvider>,
  );
  return { ...utils, headingRef };
}

beforeEach(async () => {
  mockDeleteInvoice.mockReset();
  mockDeleteInvoice.mockResolvedValue(undefined);
  mockImpact.mockReset();
  mockImpact.mockResolvedValue({ effects: [] } as never);
  onChanged.mockReset();
  onChanged.mockResolvedValue(undefined);
  openForm.mockReset();
  if (!Panel) Panel = await import('./CompanyPaymentsPanel.js');
});

describe('CompanyPaymentsPanel totals and markers', () => {
  // Mutation: dropping data-figure leaves the Paid/Still-to-pay figure unregistered (ADR-039).
  it('shows Paid and Still to pay with the registry markers and the company figures', () => {
    renderPanel(result([rec('a', 'pending')]));

    expect(screen.getByTestId('company-payments-totals')).toHaveTextContent(
      'Paid €900.00 · Still to pay €600.00',
    );
    const paid = screen.getByTestId('company-paid-figure');
    const still = screen.getByTestId('company-still-to-pay-figure');
    expect(paid).toHaveAttribute('data-figure', 'paid');
    expect(still).toHaveAttribute('data-figure', 'still-to-pay');
    expect(paid).toHaveTextContent('€900.00');
    expect(still).toHaveTextContent('€600.00');
  });

  it('marks nothing else as a figure: per-row amounts and remarks carry no marker', () => {
    renderPanel(result([rec('a', 'pending', { openAmount: 250 }), rec('o', 'quotation')]));

    expect(document.querySelectorAll('[data-figure]')).toHaveLength(2);
  });

  it('notes submitted invoices, singular and plural, and shows no note without any', () => {
    const { unmount } = renderPanel(result([rec('a', 'pending')]));
    expect(screen.queryByTestId('company-submitted-note')).toBeNull();
    unmount();

    const one = renderPanel(result([rec('c', 'claimed')]));
    expect(screen.getByTestId('company-submitted-note')).toHaveTextContent(
      '1 submitted invoice is not counted in Still to pay.',
    );
    one.unmount();

    renderPanel(result([rec('c1', 'claimed'), rec('c2', 'claimed'), rec('o', 'quotation')]));
    expect(screen.getByTestId('company-submitted-note')).toHaveTextContent(
      '2 submitted invoices are not counted in Still to pay.',
    );
  });
});

describe('CompanyPaymentsPanel rows', () => {
  // D-07 pins this title in plan/restructure/defects.json: invoice status Badges on Payments rows.
  it('D-07: invoice rows carry a status Badge per status and offer rows carry none', () => {
    renderPanel(
      result([rec('p', 'pending'), rec('c', 'claimed'), rec('d', 'paid'), rec('o', 'quotation')]),
    );

    expect(
      within(screen.getByTestId('company-invoices-row-p')).getByText('To pay'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('company-invoices-row-c')).getByText('Submitted'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('company-invoices-row-d')).getByText('Paid'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('company-offers-row-o')).queryByText('Offer')).toBeNull();
    expect(
      within(screen.getByTestId('company-offers-row-o')).queryByText(
        /^(To pay|Submitted|Paid|Offer)$/,
      ),
    ).toBeNull();
  });

  it('orders pending, submitted, paid and links each row to its page', () => {
    renderPanel(result([rec('d', 'paid'), rec('p', 'pending'), rec('c', 'claimed')]));

    const list = screen.getByTestId('company-invoices');
    const order = within(list)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('data-testid'));
    expect(order).toEqual([
      'company-invoices-row-p',
      'company-invoices-row-c',
      'company-invoices-row-d',
    ]);
    expect(screen.getByTestId('company-invoices-link-p')).toHaveAttribute(
      'href',
      '/budget/invoices/p',
    );
  });

  it('shows due date, paid and still to pay for a pending invoice, and falls back to "No number"', () => {
    renderPanel(
      result([
        rec('a', 'pending', {
          dueDate: '2026-04-15',
          paid: 100,
          openAmount: 900,
          invoiceNumber: null,
        }),
      ]),
    );

    const row = screen.getByTestId('company-invoices-row-a');
    expect(row).toHaveTextContent('Due');
    expect(row).toHaveTextContent('Paid €100.00 · Still to pay €900.00');
    expect(row).toHaveTextContent('€1,000.00');
    expect(row).toHaveTextContent(/no number/i);
  });

  // Mutation: showing Still to pay on a submitted row contradicts the strip total (claimed never counts).
  it('omits Still to pay on a submitted invoice and shows it on pending and paid', () => {
    renderPanel(result([rec('c', 'claimed', { paid: 1000 }), rec('p', 'pending')]));

    expect(screen.getByTestId('company-invoices-row-c')).not.toHaveTextContent('Still to pay');
    expect(screen.getByTestId('company-invoices-row-p')).toHaveTextContent('Still to pay');
  });

  it('shows remaining on offer for an offer and no due date', () => {
    renderPanel(
      result([rec('o', 'quotation', { dueDate: '2026-04-15', paid: 50, remainingOnOffer: 350 })]),
    );

    const row = screen.getByTestId('company-offers-row-o');
    expect(row).toHaveTextContent('Paid €50.00 · Remaining on offer €350.00');
    expect(row).not.toHaveTextContent('Due');
    expect(row).not.toHaveTextContent('Still to pay');
  });

  // Mutation: showing the refund amount unsigned inflates a refund as if it were a payment.
  it('lists progress payments only when there are rows, a refund as a negative amount with a Refund badge', () => {
    const { unmount } = renderPanel(result([rec('a', 'pending')]));
    expect(screen.queryByTestId('company-progress-payments')).toBeNull();
    unmount();

    renderPanel(
      result([
        rec('a', 'pending', {
          invoiceNumber: 'R-77',
          deposits: [
            deposit('dep1', { amount: 300, paidDate: '2026-03-05' }),
            deposit('dep2', {
              amount: 40,
              entryType: 'refund',
              status: 'pending',
              dueDate: '2026-03-09',
            }),
          ],
        }),
        rec('b', 'quotation', { invoiceNumber: null, deposits: [deposit('dep3', { amount: 10 })] }),
      ]),
    );

    const list = screen.getByTestId('company-progress-payments');
    expect(within(list).getByTestId('company-progress-payments-row-dep1')).toHaveTextContent(
      '€300.00',
    );
    const refund = within(list).getByTestId('company-progress-payments-row-dep2');
    expect(refund).toHaveTextContent('-€40.00');
    expect(refund).toHaveTextContent('Refund');
    expect(within(list).getByTestId('company-progress-payments-link-dep1')).toHaveAttribute(
      'href',
      '/budget/invoices/a?payment=dep1',
    );
    expect(within(list).getByTestId('company-progress-payments-row-dep1')).toHaveTextContent(
      'R-77',
    );
    expect(within(list).getByTestId('company-progress-payments-row-dep3')).toHaveTextContent(
      /no number/i,
    );
  });

  it('uses the paid date, else the due date, in the progress payment title', () => {
    renderPanel(
      result([
        rec('a', 'pending', {
          deposits: [
            deposit('d-paid', { paidDate: '2026-03-05', dueDate: '2026-02-01' }),
            deposit('d-due', { paidDate: null, dueDate: '2026-02-01', status: 'pending' }),
          ],
        }),
      ]),
    );

    expect(screen.getByTestId('company-progress-payments-row-d-paid')).toHaveTextContent('Mar');
    expect(screen.getByTestId('company-progress-payments-row-d-due')).toHaveTextContent('Feb');
  });
});

describe('CompanyPaymentsPanel states', () => {
  it('shows each list loading while rows are null', () => {
    renderPanel(result(null));

    expect(screen.getByTestId('company-invoices')).toBeInTheDocument();
    expect(screen.getByTestId('company-offers')).toBeInTheDocument();
    expect(screen.queryByTestId('company-progress-payments')).toBeNull();
  });

  it('shows the load error with Retry when the first load failed', () => {
    const payments = result(null, { kind: 'other' });
    renderPanel(payments);

    expect(
      screen.getAllByText("This company's records could not be loaded. Try again.").length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /try again|retry/i })[0]!);
    expect(payments.retry).toHaveBeenCalled();
  });

  it('keeps the rows and shows no error when a reload failed after rows were loaded', () => {
    renderPanel(result([rec('a', 'pending')], { kind: 'other' }));

    expect(screen.getByTestId('company-invoices-row-a')).toBeInTheDocument();
    expect(screen.queryByText("This company's records could not be loaded. Try again.")).toBeNull();
  });

  it('translates an API failure code', () => {
    renderPanel(result(null, { kind: 'api', code: 'INTERNAL_ERROR', notFound: false }));

    expect(screen.queryByText("This company's records could not be loaded. Try again.")).toBeNull();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('shows one whole-tab empty state with New invoice when nothing exists', async () => {
    const user = userEvent.setup();
    renderPanel(result([]));

    expect(
      screen.getByText('No offers, invoices or payments for this company yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('company-invoices')).toBeNull();
    expect(screen.queryByTestId('company-payments-totals')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New invoice' }));

    expect(openForm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'invoice', company: { id: 'v1', name: 'Sample Co' } }),
    );
  });

  it('shows the whole-tab empty state without an action outside the invoice form provider', () => {
    renderPanel(result([]), false);

    expect(
      screen.getByText('No offers, invoices or payments for this company yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New invoice' })).toBeNull();
  });

  it('opens New invoice and New offer from the list headers with the company and origin', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('o', 'quotation')]));

    await user.click(screen.getByTestId('company-invoices-add'));
    await user.click(screen.getByTestId('company-offers-add'));

    expect(openForm).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'invoice', company: { id: 'v1', name: 'Sample Co' } }),
    );
    expect(openForm).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'offer' }));
    expect(openForm.mock.calls[0]![0].returnFocusRef!.current).toBe(
      screen.getByTestId('company-invoices-add'),
    );
  });

  it('offers no New buttons outside the invoice form provider', () => {
    renderPanel(result([rec('a', 'pending')]), false);

    expect(screen.queryByTestId('company-invoices-add')).toBeNull();
    expect(screen.queryByTestId('company-offers-add')).toBeNull();
  });
});

describe('CompanyPaymentsPanel delete', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, list: string, id: string) => {
    await user.click(screen.getByTestId(`${list}-actions-${id}`));
    await user.click(await screen.findByTestId(`company-invoice-delete-${id}`));
  };
  const confirm = async (user: ReturnType<typeof userEvent.setup>) => {
    const button = await screen.findByTestId('company-invoice-delete-confirm');
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await user.click(button);
  };

  it('offers Delete (and no Remove) in the row menu of invoices and offers', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('o', 'quotation')]));

    await user.click(screen.getByTestId('company-invoices-actions-a'));

    expect(await screen.findByTestId('company-invoice-delete-a')).toBeInTheDocument();
    expect(screen.queryByTestId('company-invoices-remove-a')).toBeNull();
  });

  it('asks first, names the invoice, deletes, refreshes the page and closes', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('b', 'pending')]));

    await openMenu(user, 'company-invoices', 'a');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete R-a?');
    expect(mockImpact).toHaveBeenCalledWith('invoice', 'a');
    expect(mockDeleteInvoice).not.toHaveBeenCalled();
    await confirm(user);

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockDeleteInvoice).toHaveBeenCalledWith('v1', 'a');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('names an unnumbered invoice and an unnumbered offer generically', async () => {
    const user = userEvent.setup();
    renderPanel(
      result([
        rec('a', 'pending', { invoiceNumber: null }),
        rec('o', 'quotation', { invoiceNumber: null }),
      ]),
    );

    await openMenu(user, 'company-invoices', 'a');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete this invoice?');
    await user.click(screen.getByTestId('company-invoice-delete-cancel'));
    await openMenu(user, 'company-offers', 'o');

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete this offer?');
  });

  it('Cancel closes without deleting and returns focus to the row menu trigger', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending')]));
    await openMenu(user, 'company-invoices', 'a');

    await user.click(await screen.findByTestId('company-invoice-delete-cancel'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockDeleteInvoice).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('company-invoices-actions-a')).toHaveFocus());
  });

  // Mutation: "last record overall" would send focus to the heading although the list still has a row.
  it('deleting one of two invoices moves focus to the Invoices New button', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('b', 'pending'), rec('o', 'quotation')]));
    await openMenu(user, 'company-invoices', 'a');

    await confirm(user);

    await waitFor(() => expect(screen.getByTestId('company-invoices-add')).toHaveFocus());
  });

  it('deleting the only invoice (an offer remains) moves focus to the heading', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('o', 'quotation')]));
    await openMenu(user, 'company-invoices', 'a');

    await confirm(user);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('deleting one of two offers moves focus to the Offers New button', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('o1', 'quotation'), rec('o2', 'quotation')]));
    await openMenu(user, 'company-offers', 'o1');

    await confirm(user);

    await waitFor(() => expect(screen.getByTestId('company-offers-add')).toHaveFocus());
    expect(mockDeleteInvoice).toHaveBeenCalledWith('v1', 'o1');
  });

  it('deleting the only offer (an invoice remains) moves focus to the heading', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('o', 'quotation')]));
    await openMenu(user, 'company-offers', 'o');

    await confirm(user);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('deleting the only record of a list without a New button falls back to the heading', async () => {
    const user = userEvent.setup();
    renderPanel(result([rec('a', 'pending'), rec('b', 'pending')]), false);
    await openMenu(user, 'company-invoices', 'a');

    await confirm(user);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('keeps the dialog open on an API error; a 409 removes the confirm action', async () => {
    const user = userEvent.setup();
    mockDeleteInvoice.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'in use' }),
    );
    renderPanel(result([rec('a', 'pending'), rec('b', 'pending')]));
    await openMenu(user, 'company-invoices', 'a');

    await confirm(user);

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/./);
    expect(onChanged).not.toHaveBeenCalled();
    // A blocked delete (409) drops the confirm action and leaves only the way out.
    expect(screen.queryByTestId('company-invoice-delete-confirm')).toBeNull();
    expect(screen.getByTestId('company-invoice-delete-cancel')).toBeInTheDocument();
  });

  it('ignores Cancel while the delete is running', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    mockDeleteInvoice.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderPanel(result([rec('a', 'pending')]));
    await openMenu(user, 'company-invoices', 'a');
    await confirm(user);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    const cancel = screen.queryByTestId('company-invoice-delete-cancel');
    if (cancel) fireEvent.click(cancel);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('shows a non-conflict API error without blocking', async () => {
    const user = userEvent.setup();
    mockDeleteInvoice.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPanel(result([rec('a', 'pending')]));
    await openMenu(user, 'company-invoices', 'a');

    await confirm(user);

    await waitFor(() =>
      expect(screen.getByTestId('company-invoice-delete-confirm')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('shows the generic delete error for a non-API failure', async () => {
    const user = userEvent.setup();
    mockDeleteInvoice.mockRejectedValue(new Error('net'));
    renderPanel(result([rec('a', 'pending')]));
    await openMenu(user, 'company-invoices', 'a');

    await confirm(user);

    expect(
      await screen.findByText('The invoice could not be deleted. Try again.'),
    ).toBeInTheDocument();
  });
});
