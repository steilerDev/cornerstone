/**
 * @jest-environment jsdom
 *
 * The Convert page (#2240): load states, identity (h1, title, breadcrumbs), the not-an-offer
 * state, the row/group wiring into the form, and leaving the page. The form itself is a stub
 * (ConvertOfferForm.test.tsx covers it); the record and cost line hooks are real over mocked clients.
 *
 * Mutations these tests catch:
 *  - a not-an-offer record redirecting instead of showing "Offer not found" with a link (D11);
 *  - a state rendering zero or two h1s, or the wrong text;
 *  - rows keyed by the task budget id instead of the invoice budget line id (D4);
 *  - leaving with `navigate(-1)` when the page was not opened from the offer (or a push);
 *  - Try again reloading only one of the two requests;
 *  - arrival not focusing the h1, or leaving not asking the offer page to focus its heading.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import type { InvoiceDetail } from '@cornerstone/shared';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import * as houseNameActual from '../../contexts/HouseNameContext.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeCostLine, makeInvoiceDetail } from '../../test/invoiceDetailFixtures.js';
import type * as PageModule from './InvoiceConvertPage.js';

const actualInvoicesApi = await import('../../lib/invoicesApi.js');
const mockFetchInvoiceById = jest.fn<(id: string) => Promise<InvoiceDetail>>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  ...actualInvoicesApi,
  fetchInvoiceById: mockFetchInvoiceById,
}));
const actualCostLinesApi = await import('../../lib/invoiceBudgetLinesApi.js');
const mockFetchCostLines = jest.fn<(id: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  ...actualCostLinesApi,
  fetchInvoiceBudgetLines: mockFetchCostLines,
}));
const actualSourcesApi = await import('../../lib/budgetSourcesApi.js');
const mockFetchBudgetSources = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  ...actualSourcesApi,
  fetchBudgetSources: mockFetchBudgetSources,
}));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  ...houseNameActual,
  useEntriesLanguage: () => 'en',
}));
const actualFocus = await import('../../lib/focusPageHeading.js');
const mockFocusWhenReady = jest.fn<(maxFrames?: number) => () => void>(() => () => undefined);
jest.unstable_mockModule('../../lib/focusPageHeading.js', () => ({
  ...actualFocus,
  focusPageHeadingWhenReady: mockFocusWhenReady,
}));

interface FormStubProps {
  invoice: InvoiceDetail;
  rows: Array<{ id: string; invoiceBudgetLineId: string | null }>;
  groups: Array<{ id: string; rows: unknown[] }>;
  budgetSources: Array<{ id: string }>;
  onDone: () => void;
  onNotOffer: () => void;
}
jest.unstable_mockModule('./ConvertOfferForm.js', () => ({
  ConvertOfferForm: (props: FormStubProps) => (
    <div data-testid="form-stub" data-invoice={props.invoice.id}>
      <span data-testid="stub-row-keys">
        {props.rows.map((r) => `${r.id}>${r.invoiceBudgetLineId}`).join(',')}
      </span>
      <span data-testid="stub-groups">{props.groups.map((g) => g.id).join(',')}</span>
      <span data-testid="stub-sources">{props.budgetSources.map((s) => s.id).join(',')}</span>
      <button type="button" onClick={props.onDone}>
        stub-done
      </button>
      <button type="button" onClick={props.onNotOffer}>
        stub-not-offer
      </button>
    </div>
  ),
}));

let InvoiceConvertPage: (typeof PageModule)['InvoiceConvertPage'];

const ID = 'off-1';
const CONVERT = `/budget/invoices/${ID}/convert`;
const OFFER_URL = `/budget/invoices/${ID}`;

function record(over: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return makeInvoiceDetail({
    id: ID,
    status: 'quotation',
    vendorName: 'Acme Construction',
    invoiceNumber: 'OFF-7',
    ...over,
  });
}

const apiError = (status: number, code: string) =>
  new ApiClientError(status, { code, message: 'prose' } as never);

function renderPage(
  entries: ReadonlyArray<string | { url: string; state?: unknown }> = [CONVERT],
  initialIndex?: number,
) {
  const log = createRouterLog();
  render(
    <LocaleProvider>
      <RecordingRouter entries={entries} log={log} initialIndex={initialIndex}>
        <Routes>
          <Route path="/budget/invoices/:id/convert" element={<InvoiceConvertPage />} />
          <Route path="/no-id" element={<InvoiceConvertPage />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </RecordingRouter>
    </LocaleProvider>,
  );
  return log;
}

function trail(): string[] {
  const nav = screen.getByRole('navigation', { name: 'You are here' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => (a.textContent ?? '').replace('‹', ''));
}

const h1 = () => screen.getByRole('heading', { level: 1 });

beforeEach(async () => {
  mockFetchInvoiceById.mockReset().mockResolvedValue(record());
  mockFetchCostLines.mockReset().mockResolvedValue({
    budgetLines: [
      makeCostLine({ id: 'ibl-1', workItemBudgetId: 'wb-1', itemizedAmount: 600 }),
      makeCostLine({ id: 'ibl-2', workItemBudgetId: 'wb-2', itemizedAmount: 300 }),
    ],
    remainingAmount: 100,
  });
  mockFetchBudgetSources.mockReset().mockResolvedValue({ budgetSources: [{ id: 'src-1' }] });
  mockFocusWhenReady.mockClear();
  ({ InvoiceConvertPage } = (await import('./InvoiceConvertPage.js')) as typeof PageModule);
});

describe('loading', () => {
  it('shows exactly one h1 "Convert offer", the document title and a skeleton while loading', async () => {
    mockFetchInvoiceById.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(h1()).toHaveTextContent('Convert offer');
    expect(screen.queryByTestId('form-stub')).toBeNull();
    await waitFor(() => expect(document.title).toBe('Convert offer · Money · Cornerstone'));
  });

  it('stays on loading until the cost lines have arrived too', async () => {
    mockFetchCostLines.mockReturnValue(new Promise(() => undefined));
    renderPage();
    await waitFor(() => expect(mockFetchInvoiceById).toHaveBeenCalled());
    await act(async () => undefined);
    expect(h1()).toHaveTextContent('Convert offer');
    expect(screen.queryByTestId('form-stub')).toBeNull();
  });
});

describe('ready', () => {
  it('has one h1 "Convert to final invoice", the offer title, an Offer badge and the intro', async () => {
    renderPage();
    await screen.findByTestId('form-stub');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(h1()).toHaveTextContent('Convert to final invoice');
    // The offer title is the last breadcrumb and the subtitle under the h1.
    expect(screen.getAllByText('Acme Construction · OFF-7')).toHaveLength(2);
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText(/Nothing changes until you confirm\./)).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe('Convert to final invoice · Money · Cornerstone'),
    );
  });

  it('breadcrumbs read Money, Invoices, then the offer', async () => {
    renderPage();
    await screen.findByTestId('form-stub');
    const names = trail();
    expect(names).toContain('Money');
    expect(names).toContain('Invoices');
    expect(names[names.length - 1]).toContain('Acme Construction · OFF-7');
  });

  it('moves focus to the h1 on arrival', async () => {
    renderPage();
    await screen.findByTestId('form-stub');
    await waitFor(() => expect(h1()).toHaveFocus());
  });

  it('hands the form the offer, rows keyed by invoice budget line id, groups and sources', async () => {
    renderPage();
    const form = await screen.findByTestId('form-stub');
    expect(form).toHaveAttribute('data-invoice', ID);
    // The row id is the task budget id; the convert request must use the invoice line id (D4).
    expect(screen.getByTestId('stub-row-keys')).toHaveTextContent('wb-1>ibl-1,wb-2>ibl-2');
    expect(screen.getByTestId('stub-groups')).not.toBeEmptyDOMElement();
    expect(screen.getByTestId('stub-sources')).toHaveTextContent('src-1');
    expect(mockFetchInvoiceById).toHaveBeenCalledWith(ID);
    expect(mockFetchCostLines).toHaveBeenCalledWith(ID);
  });
});

describe('errors', () => {
  it('a failed load shows h1 "Convert offer", the error and Try again, which reloads both requests', async () => {
    mockFetchInvoiceById.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    renderPage();
    const box = await screen.findByTestId('convert-error');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(h1()).toHaveTextContent('Convert offer');
    expect(within(box).getByRole('alert')).toBeInTheDocument();
    expect(trail().length).toBeGreaterThan(0);
    const invoiceCalls = mockFetchInvoiceById.mock.calls.length;
    const lineCalls = mockFetchCostLines.mock.calls.length;
    mockFetchInvoiceById.mockResolvedValue(record());
    fireEvent.click(screen.getByTestId('convert-retry'));
    await screen.findByTestId('form-stub');
    expect(mockFetchInvoiceById.mock.calls.length).toBeGreaterThan(invoiceCalls);
    expect(mockFetchCostLines.mock.calls.length).toBeGreaterThan(lineCalls);
    expect(h1()).toHaveTextContent('Convert to final invoice');
  });

  it('a failed cost line load is an error state as well', async () => {
    mockFetchCostLines.mockRejectedValue(new Error('offline'));
    renderPage();
    const box = await screen.findByTestId('convert-error');
    expect(box).toHaveTextContent('The cost lines could not be loaded.');
    expect(h1()).toHaveTextContent('Convert offer');
    expect(screen.queryByTestId('form-stub')).toBeNull();
  });

  it('a missing record shows "Offer not found" with a way back to the invoices', async () => {
    mockFetchInvoiceById.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    renderPage();
    const box = await screen.findByTestId('convert-not-found');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(h1()).toHaveTextContent('Offer not found');
    expect(box).toHaveTextContent("This offer doesn't exist or was deleted.");
    expect(within(box).getByRole('link')).toHaveAttribute('href', '/budget/invoices');
    await waitFor(() => expect(document.title).toBe('Offer not found · Money · Cornerstone'));
    expect(screen.queryByTestId('convert-error')).toBeNull();
  });
});

describe('a record that is not an offer (D11)', () => {
  it('shows "Offer not found" and links to the invoice, without redirecting', async () => {
    mockFetchInvoiceById.mockResolvedValue(record({ status: 'pending' }));
    const log = renderPage();
    const box = await screen.findByTestId('convert-not-offer');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(h1()).toHaveTextContent('Offer not found');
    expect(box).toHaveTextContent(
      'This is already a final invoice. Only an offer can be converted.',
    );
    expect(within(box).getByRole('link', { name: 'Open the invoice' })).toHaveAttribute(
      'href',
      OFFER_URL,
    );
    expect(log.actions).toEqual([]);
    expect(log.entries).toEqual([CONVERT]);
    expect(screen.queryByTestId('form-stub')).toBeNull();
    await waitFor(() => expect(document.title).toBe('Offer not found · Money · Cornerstone'));
  });

  it('the form saying the record is no longer an offer reloads it into this state', async () => {
    renderPage();
    await screen.findByTestId('form-stub');
    mockFetchInvoiceById.mockResolvedValue(record({ status: 'pending' }));
    const calls = mockFetchInvoiceById.mock.calls.length;
    fireEvent.click(screen.getByText('stub-not-offer'));
    await screen.findByTestId('convert-not-offer');
    expect(mockFetchInvoiceById.mock.calls.length).toBeGreaterThan(calls);
    expect(h1()).toHaveTextContent('Offer not found');
  });
});

describe('leaving the page (D10)', () => {
  it('steps back when the page was opened from this offer, and asks the next page to focus its heading', async () => {
    const log = renderPage(
      [OFFER_URL, { url: CONVERT, state: { origin: { to: OFFER_URL, name: 'x' } } }],
      1,
    );
    await screen.findByTestId('form-stub');
    fireEvent.click(screen.getByText('stub-done'));
    expect(log.actions).toEqual(['GO -1']);
    expect(log.index).toBe(0);
    expect(mockFocusWhenReady).toHaveBeenCalledWith(180);
  });

  it('steps back for an origin that is this offer with a query string', async () => {
    const log = renderPage(
      [
        `${OFFER_URL}?tab=payments`,
        { url: CONVERT, state: { origin: { to: `${OFFER_URL}?tab=payments` } } },
      ],
      1,
    );
    await screen.findByTestId('form-stub');
    fireEvent.click(screen.getByText('stub-done'));
    expect(log.actions).toEqual(['GO -1']);
  });

  it('replaces with the offer when there is no origin', async () => {
    const log = renderPage();
    await screen.findByTestId('form-stub');
    fireEvent.click(screen.getByText('stub-done'));
    expect(log.actions).toEqual([`REPLACE ${OFFER_URL}`]);
    expect(log.entries).toEqual([OFFER_URL]);
    expect(mockFocusWhenReady).toHaveBeenCalledWith(180);
  });

  it('replaces with the offer when the origin is another page', async () => {
    const log = renderPage([
      '/budget/invoices',
      { url: CONVERT, state: { origin: { to: '/budget/invoices' } } },
    ]);
    await screen.findByTestId('form-stub');
    fireEvent.click(screen.getByText('stub-done'));
    expect(log.actions).toEqual([`REPLACE ${OFFER_URL}`]);
  });
});

describe('route without an id', () => {
  it('goes to the invoices list', async () => {
    const log = renderPage(['/no-id']);
    await screen.findByTestId('elsewhere');
    expect(log.actions).toEqual(['REPLACE /budget/invoices']);
  });
});
