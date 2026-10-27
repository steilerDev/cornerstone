/**
 * ReportInvoiceList paging and grouping (#2243, AC4): invoices grouped by company, shown 25 at a
 * time through useInfiniteScroll, with the selection, group checkbox and counts always covering
 * every invoice. Synthetic data.
 */
import { screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import { renderWithRouter } from '../../test/testUtils.js';
import { reportSelection } from '../../lib/reportSelection.js';
import type { ReportInvoiceList as ReportInvoiceListType } from './ReportInvoiceList.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `EUR ${n.toFixed(2)}`,
    formatDate: (d: string) => d,
    formatPercent: (n: number) => `${n}%`,
  }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({ resolvedLocale: 'en' }),
}));

let ReportInvoiceList: typeof ReportInvoiceListType;
let PAGE: number;

beforeAll(async () => {
  ({ ReportInvoiceList, REPORT_INVOICE_PAGE_SIZE: PAGE } = await import('./ReportInvoiceList.js'));
});

function inv(n: number, o: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: `inv-${String(n).padStart(3, '0')}`,
    vendorId: 'v-a',
    vendorName: 'Alpha Build',
    invoiceNumber: `N-${String(n).padStart(3, '0')}`,
    date: '2026-01-10',
    status: 'pending',
    invoiceAmount: 100,
    allocatedAmount: 100,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
    ...o,
  };
}

function report(
  invoices: SourceReportInvoice[],
  generatedAt = '2026-01-15T00:00:00.000Z',
): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices,
    totalAmount: invoices.reduce((s, i) => s + i.allocatedAmount, 0),
    unallocatedInvoices: [],
    generatedAt,
  };
}

interface Opts {
  excluded?: string[];
  excludedLines?: string[];
  onToggleInvoices?: jest.Mock;
  onBack?: jest.Mock;
}

function element(rep: SourceReportResponse, o: Opts = {}) {
  const excludedInvoiceIds = new Set(o.excluded ?? []);
  const excludedLineIds = new Set(o.excludedLines ?? []);
  return (
    <ReportInvoiceList
      report={rep}
      selection={reportSelection(rep, excludedInvoiceIds, excludedLineIds)}
      excludedInvoiceIds={excludedInvoiceIds}
      excludedLineIds={excludedLineIds}
      onToggle={jest.fn()}
      onToggleInvoices={o.onToggleInvoices ?? jest.fn()}
      onToggleAll={jest.fn()}
      onToggleLine={jest.fn()}
      onBack={o.onBack ?? jest.fn()}
      t={t}
    />
  );
}

async function renderList(rep: SourceReportResponse, o: Opts = {}) {
  const view = renderWithRouter(element(rep, o));
  await act(async () => {});
  return {
    ...view,
    async rerenderList(next: SourceReportResponse, nextOpts: Opts = {}) {
      // renderWithRouter wraps in a MemoryRouter wrapper, so rerender takes the bare element
      view.rerender(element(next, nextOpts));
      await act(async () => {});
    },
  };
}

const rowLinks = () =>
  screen.queryAllByRole('link', { name: /sourceReports.openInvoiceAriaLabel/ });
const headings = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

function many(count: number, o: (n: number) => Partial<SourceReportInvoice> = () => ({})) {
  return Array.from({ length: count }, (_, i) => inv(i + 1, o(i + 1)));
}

describe('ReportInvoiceList paging and grouping', () => {
  it('uses a page size of 25', () => {
    expect(PAGE).toBe(25);
  });

  it('orders groups by company name and rows by date within a group', async () => {
    await renderList(
      report([
        inv(1, { vendorId: 'v-z', vendorName: 'Zeta Roofing', date: '2026-01-01' }),
        inv(2, { date: '2026-02-01', invoiceNumber: 'LATE' }),
        inv(3, { date: '2026-01-01', invoiceNumber: 'EARLY' }),
      ]),
    );

    expect(headings().map((h) => h?.replace(/\s.*/, ''))).toEqual(['Alpha', 'Zeta']);
    const text = document.body.textContent ?? '';
    expect(text.indexOf('EARLY')).toBeLessThan(text.indexOf('LATE'));
  });

  it('shows 25 of 27, then loads the rest and ends with the all-shown message', async () => {
    await renderList(report(many(27)));

    expect(rowLinks()).toHaveLength(25);
    expect(screen.getByTestId('report-invoices-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('report-invoices-end-of-list')).toBeNull();

    fireEvent.click(screen.getByTestId('report-invoices-load-more-button'));
    await act(async () => {});

    expect(rowLinks()).toHaveLength(27);
    expect(screen.getByTestId('report-invoices-end-of-list')).toHaveTextContent(
      'sourceReports.paging.end::{"count":27}',
    );
    expect(screen.queryByTestId('report-invoices-load-more-button')).toBeNull();
    expect(screen.getByTestId('report-invoices-status')).toHaveTextContent(
      'sourceReports.paging.shown::{"count":27,"total":27}',
    );
  });

  it('shows no footer paging control as "more" when everything fits on one page', async () => {
    await renderList(report(many(3)));
    expect(rowLinks()).toHaveLength(3);
    expect(screen.getByTestId('report-invoices-end-of-list')).toBeInTheDocument();
  });

  it('renders one heading for a company that spans the page boundary', async () => {
    // 14 invoices of Alpha, then 13 of Beta: Beta straddles the 25 boundary (11 + 2)
    const invoices = [
      ...many(14),
      ...Array.from({ length: 13 }, (_, i) =>
        inv(100 + i, { vendorId: 'v-b', vendorName: 'Beta Electric' }),
      ),
    ];
    await renderList(report(invoices));

    expect(headings()).toHaveLength(2);
    expect(rowLinks()).toHaveLength(25);

    fireEvent.click(screen.getByTestId('report-invoices-load-more-button'));
    await act(async () => {});

    expect(headings()).toHaveLength(2);
    expect(rowLinks()).toHaveLength(27);
    const betaGroup = screen.getByTestId('report-invoices-group-mobile-v-b');
    expect(within(betaGroup).getAllByRole('link', { name: /openInvoiceAriaLabel/ })).toHaveLength(
      13,
    );
  });

  it('group checkbox is indeterminate when only unloaded rows are excluded, and toggles every id', async () => {
    const onToggleInvoices = jest.fn();
    const invoices = many(27);
    await renderList(report(invoices), {
      excluded: ['inv-026', 'inv-027'],
      onToggleInvoices,
    });

    // rows 26 and 27 are not loaded yet
    expect(rowLinks()).toHaveLength(25);
    const group = screen.getByTestId('report-invoices-group-mobile-v-a');
    const groupCheckbox = within(group).getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(groupCheckbox.indeterminate).toBe(true);

    fireEvent.click(groupCheckbox);
    expect(onToggleInvoices).toHaveBeenCalledTimes(1);
    const [ids, excluded] = onToggleInvoices.mock.calls[0] as [string[], boolean];
    expect(ids).toHaveLength(27);
    expect(excluded).toBe(false); // an indeterminate group is completed (re-included)
  });

  it('group count reads "of" while rows are unloaded and the select-all label counts every invoice', async () => {
    await renderList(report(many(27)));

    expect(
      screen.getByRole('checkbox', { name: /sourceReports.selectAllInvoices::\{"count":27\}/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('report-invoices-group-toggle-mobile-v-a')).toBeInTheDocument();
  });

  it('shows the subtotal of the included invoices in the group heading', async () => {
    await renderList(report(many(3)), { excluded: ['inv-002'] });

    const group = screen.getByTestId('report-invoices-group-mobile-v-a');
    expect(group).toHaveTextContent('sourceReports.groupSubtotal');
    expect(group).toHaveTextContent('EUR 200.00');
  });

  it('shows the empty state with a Back action', async () => {
    const onBack = jest.fn();
    await renderList(report([]), { onBack });

    expect(screen.getByText('sourceReports.emptyInvoices')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common:button.back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('resets paging on a refreshed report but not on a line exclusion', async () => {
    const rep = report(many(27));
    const view = await renderList(rep);
    fireEvent.click(screen.getByTestId('report-invoices-load-more-button'));
    await act(async () => {});
    expect(rowLinks()).toHaveLength(27);

    // A line exclusion: same report identity (generatedAt), different excluded lines
    await view.rerenderList(rep, { excludedLines: ['line-x'] });
    expect(rowLinks()).toHaveLength(27);

    // REPORT_REFRESHED: new generatedAt
    await view.rerenderList(report(many(27), '2026-01-16T00:00:00.000Z'));
    expect(rowLinks()).toHaveLength(25);
    expect(screen.getByTestId('report-invoices-load-more-button')).toBeInTheDocument();
  });

  it('drops an invoice that vanished from a refreshed report before the reset lands', async () => {
    const view = await renderList(report(many(3)));
    expect(rowLinks()).toHaveLength(3);

    await view.rerenderList(report(many(2)));
    expect(rowLinks()).toHaveLength(2);
  });

  it('appends a middle batch without the end message (25 -> 50 of 60)', async () => {
    await renderList(report(many(60)));
    fireEvent.click(screen.getByTestId('report-invoices-load-more-button'));
    await act(async () => {});

    expect(rowLinks()).toHaveLength(50);
    expect(screen.queryByTestId('report-invoices-end-of-list')).toBeNull();
    expect(screen.getByTestId('report-invoices-status')).toHaveTextContent(
      'sourceReports.paging.shown::{"count":50,"total":60}',
    );
  });

  it('collapses and re-opens a company group from its heading toggle', async () => {
    await renderList(report(many(2)));
    const toggle = screen.getByTestId('report-invoices-group-toggle-mobile-v-a');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles a budget line from the mobile card checkbox', async () => {
    const onToggleLine = jest.fn();
    const line = {
      id: 'line-1',
      description: 'Plaster',
      allocatedPortion: 50,
      linkedItem: null,
    } as unknown as SourceReportInvoice['budgetLinesForSource'][number];
    const rep = report([inv(1, { budgetLinesForSource: [line] })]);
    const props = element(rep).props;
    renderWithRouter(<ReportInvoiceList {...props} onToggleLine={onToggleLine} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'sourceReports.expand.expandInvoice' }));

    const boxes = screen.getAllByRole('checkbox', {
      name: /sourceReports.expand.excludeItemAriaLabel/,
    });
    expect(boxes).toHaveLength(2); // table row and mobile card
    fireEvent.click(boxes[1]!);
    expect(onToggleLine).toHaveBeenCalledWith('line-1', true);
  });
});
