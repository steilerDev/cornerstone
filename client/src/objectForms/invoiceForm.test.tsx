/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Invoice, InvoiceDetail } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormField, ObjectFormValues } from '../components/ObjectForm/types.js';
import type { DocumentIntegration } from '../hooks/useDocumentIntegration.js';
import type * as InvoicesApiTypes from '../lib/invoicesApi.js';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type * as SearchApiTypes from '../lib/searchApi.js';
import type * as PaperlessApiTypes from '../lib/paperlessApi.js';
import type * as FormTypes from './invoiceForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type { InvoiceCreateRequest } from './invoiceCreateContext.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

jest.unstable_mockModule('../contexts/LocaleContext.js', () => {
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

const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockUpdateInvoice = jest.fn<typeof InvoicesApiTypes.updateInvoice>();
jest.unstable_mockModule('../lib/invoicesApi.js', () => ({
  createInvoice: mockCreateInvoice,
  updateInvoice: mockUpdateInvoice,
}));

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
  createVendor: mockCreateVendor,
}));

const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
jest.unstable_mockModule('../lib/searchApi.js', () => ({ searchEverywhere: mockSearchEverywhere }));

const mockListPaperlessDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
const mockGetPaperlessDocument = jest.fn<typeof PaperlessApiTypes.getPaperlessDocument>();
jest.unstable_mockModule('../lib/paperlessApi.js', () => ({
  listPaperlessDocuments: mockListPaperlessDocuments,
  getPaperlessDocument: mockGetPaperlessDocument,
}));
jest.unstable_mockModule('../lib/documentLinksApi.js', () => ({
  listAllLinkedDocumentIds: jest.fn(() => Promise.resolve([])),
}));

jest.unstable_mockModule('../lib/tradesApi.js', () => ({
  fetchTrades: jest.fn(() => Promise.resolve({ trades: [] })),
}));
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));

const OFF: DocumentIntegration = {
  loaded: true,
  status: null,
  available: false,
  llmEnabled: false,
};
const ON: DocumentIntegration = { ...OFF, available: true };
const LOADING: DocumentIntegration = { ...OFF, loaded: false };
let mockIntegration: DocumentIntegration = ON;
jest.unstable_mockModule('../hooks/useDocumentIntegration.js', () => ({
  useDocumentIntegration: () => mockIntegration,
}));

// ─── Fixtures (synthetic) ────────────────────────────────────────────────────

const CREATED = {
  id: 'inv-new',
  vendorId: 'v-1',
  vendorName: 'Acme Roofing',
  invoiceNumber: 'INV-7',
  status: 'pending',
} as Invoice;

function detail(over: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 'inv-1',
    vendorId: 'v-1',
    vendorName: 'Acme Roofing',
    invoiceNumber: 'INV-1',
    amount: 1200,
    date: '2026-03-04T00:00:00.000Z',
    dueDate: '2026-04-04T00:00:00.000Z',
    status: 'pending',
    notes: 'Some note',
    ...over,
  } as InvoiceDetail;
}

const COMPANY = { id: 'v-1', name: 'Acme Roofing' };

describe('invoiceForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;

  beforeEach(async () => {
    for (const mock of [
      mockCreateInvoice,
      mockUpdateInvoice,
      mockSearchCompanies,
      mockFetchVendor,
      mockCreateVendor,
      mockSearchEverywhere,
      mockListPaperlessDocuments,
      mockGetPaperlessDocument,
    ]) {
      mock.mockReset();
    }
    mockIntegration = ON;
    mockCreateInvoice.mockResolvedValue(CREATED);
    mockSearchCompanies.mockResolvedValue([] as never);
    mockFetchVendor.mockResolvedValue({ id: 'v-1', name: 'Acme Roofing' } as never);
    mockSearchEverywhere.mockResolvedValue({ query: 'q', groups: [] });
    mockListPaperlessDocuments.mockResolvedValue({ documents: [] } as never);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./invoiceForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  const create = (request: Partial<InvoiceCreateRequest> = {}) => ({
    mode: 'create' as const,
    request: { kind: 'invoice' as const, ...request },
  });
  const edit = (invoice: InvoiceDetail, onSaved = jest.fn(() => Promise.resolve())) => ({
    mode: 'edit' as const,
    invoice,
    onSaved,
  });
  const schemaFor = (options: FormTypes.InvoiceFormOptions) =>
    renderHook(() => Form.useInvoiceFormSchema(options), { wrapper: MemoryRouter }).result.current;
  const fieldOf = (fields: readonly ObjectFormField[], name: string) =>
    fields.find((f) => f.name === name);
  const names = (fields: readonly ObjectFormField[]) => fields.map((f) => f.name);

  const validValues = (over: ObjectFormValues = {}): ObjectFormValues => ({
    vendorId: 'v-1',
    amount: '120',
    date: '2026-03-01',
    dueDate: '',
    costLine: '',
    ...over,
  });

  // ─── Create schema ─────────────────────────────────────────────────────────

  describe('create schema', () => {
    it('D-17: a new invoice is never an offer: it defaults to To pay and offers no quotation status', () => {
      const schema = schemaFor(create());

      expect(schema.initialValues.status).toBe('pending');
      const status = fieldOf(schema.fields, 'status')!;
      expect(status.kind).toBe('select');
      const values = status.options!.map((o) => o.value);
      expect(values).toEqual(['pending', 'paid', 'claimed']);
      expect(values).not.toContain('quotation');
      expect(status.options!.map((o) => o.label)).toEqual(['To pay', 'Paid', 'Submitted']);
    });

    it('an offer has no Status field and is sent as a quotation', async () => {
      const schema = schemaFor(create({ kind: 'offer' }));
      expect(fieldOf(schema.fields, 'status')).toBeUndefined();
      expect(schema.title).toBe('New offer');

      await schema.submit(validValues({ status: 'paid' }));

      expect(mockCreateInvoice.mock.calls[0]![1].status).toBe('quotation');
    });

    it('is titled and identified by its kind, with Add another on', () => {
      const invoice = schemaFor(create());
      expect(invoice).toMatchObject({ id: 'invoice', title: 'New invoice', addAnother: true });
      expect(schemaFor(create({ kind: 'offer' })).id).toBe('offer');
    });

    it('lists the document, company, number, amount, date, due date, status, task and notes fields', () => {
      const schema = schemaFor(create());
      expect(names(schema.fields)).toEqual([
        'paperlessDocumentId',
        'vendorId',
        'invoiceNumber',
        'amount',
        'date',
        'dueDate',
        'status',
        'costLine',
        'notes',
      ]);
      expect(schema.fields.filter((f) => !f.essential).map((f) => f.name)).toEqual(['notes']);
      expect(fieldOf(schema.fields, 'amount')).toMatchObject({
        required: true,
        step: 0.01,
        inputMode: 'decimal',
        hint: 'In EUR',
      });
      expect(schema.fields.filter((f) => f.keep).map((f) => f.name)).toEqual([
        'vendorId',
        'date',
        'status',
      ]);
    });

    it('starts with today as the date and everything else empty', () => {
      const schema = schemaFor(create());
      expect(schema.initialValues).toMatchObject({
        paperlessDocumentId: '',
        vendorId: '',
        invoiceNumber: '',
        amount: '',
        dueDate: '',
        costLine: '',
        notes: '',
      });
      expect(schema.initialValues.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('leaves out the document field when Paperless is not available', () => {
      mockIntegration = OFF;
      expect(names(schemaFor(create()).fields)).not.toContain('paperlessDocumentId');
    });

    it('keeps the document field, loading, while Paperless is still being checked', () => {
      mockIntegration = LOADING;
      const doc = fieldOf(schemaFor(create()).fields, 'paperlessDocumentId');
      expect(doc?.optionsLoading).toBe(true);
    });

    it('does not mark the document field loading once Paperless is known', () => {
      expect(fieldOf(schemaFor(create()).fields, 'paperlessDocumentId')?.optionsLoading).toBe(
        false,
      );
    });
  });

  describe('prefill', () => {
    it('seeds the company and the task or purchase from a request', () => {
      expect(
        Form.invoiceFormPrefill({
          kind: 'invoice',
          company: COMPANY,
          item: { type: 'household_item', id: 'hi-1', label: 'Sofa' },
        }),
      ).toEqual({ vendorId: 'v-1', costLine: 'household_item:hi-1' });
    });

    it('seeds nothing for a bare request', () => {
      expect(Form.invoiceFormPrefill({ kind: 'offer' })).toEqual({});
    });
  });

  describe('validate', () => {
    const errorsOf = (values: ObjectFormValues, kind: 'invoice' | 'offer' = 'invoice') =>
      schemaFor(create({ kind })).validate(values);

    it('accepts a complete form', () => {
      expect(errorsOf(validValues())).toEqual({});
    });

    it('requires a company', () => {
      expect(errorsOf(validValues({ vendorId: '' }))).toEqual({ vendorId: 'Choose a company.' });
    });

    it.each(['', '0', '-5', 'abc', 'Infinity'])(
      'requires an amount above 0 (rejects %p)',
      (amount) => {
        expect(errorsOf(validValues({ amount })).amount).toBe('Enter an amount greater than 0.');
      },
    );

    it('asks for the amount in the cost-line words when a task or purchase is chosen', () => {
      expect(errorsOf(validValues({ amount: '', costLine: 'work_item:wi-1' })).amount).toBe(
        'Enter the amount so the cost line can be created.',
      );
    });

    it('requires a date', () => {
      expect(errorsOf(validValues({ date: '' }))).toEqual({ date: 'Enter a date.' });
    });

    it('rejects a due date before the date but accepts the same day and a later one', () => {
      expect(errorsOf(validValues({ dueDate: '2026-02-28' }))).toEqual({
        dueDate: 'The due date must be on or after the date.',
      });
      expect(errorsOf(validValues({ dueDate: '2026-03-01' }))).toEqual({});
      expect(errorsOf(validValues({ dueDate: '2026-03-02' }))).toEqual({});
    });

    it('does not compare a due date with a missing date (only the date error shows)', () => {
      expect(errorsOf(validValues({ date: '', dueDate: '2026-02-28' }))).toEqual({
        date: 'Enter a date.',
      });
    });

    it('reports every problem at once', () => {
      expect(Object.keys(errorsOf({})).sort()).toEqual(['amount', 'date', 'vendorId']);
    });

    it('treats non-text values as empty', () => {
      expect(Object.keys(errorsOf({ vendorId: 5, amount: null, date: undefined })).sort()).toEqual([
        'amount',
        'date',
        'vendorId',
      ]);
    });
  });

  describe('submit (create)', () => {
    it('posts the trimmed fields to the chosen company and returns the invoice link', async () => {
      const schema = schemaFor(create());

      const result = await schema.submit(
        validValues({
          invoiceNumber: '  INV-7 ',
          dueDate: '2026-04-01',
          status: 'paid',
          notes: '  A note ',
        }),
      );

      expect(mockCreateInvoice).toHaveBeenCalledWith('v-1', {
        invoiceNumber: 'INV-7',
        amount: 120,
        date: '2026-03-01',
        dueDate: '2026-04-01',
        status: 'paid',
        notes: 'A note',
      });
      expect(result).toEqual({
        id: 'inv-new',
        href: '/budget/invoices/inv-new',
        label: 'Acme Roofing · INV-7',
      });
    });

    it('sends null for an empty number, due date and notes and omits cost line and document', async () => {
      await schemaFor(create()).submit(validValues({ status: 'pending' }));
      const body = mockCreateInvoice.mock.calls[0]![1];
      expect(body).toMatchObject({ invoiceNumber: null, dueDate: null, notes: null });
      expect(body).not.toHaveProperty('costLine');
      expect(body).not.toHaveProperty('paperlessDocumentId');
    });

    it.each([
      ['work_item:wi-1', { targetType: 'work_item', targetId: 'wi-1' }],
      ['household_item:hi-9', { targetType: 'household_item', targetId: 'hi-9' }],
    ])('sends the cost line for %s', async (costLine, expected) => {
      await schemaFor(create()).submit(validValues({ costLine, status: 'pending' }));
      expect(mockCreateInvoice.mock.calls[0]![1].costLine).toEqual(expected);
    });

    it('omits the cost line for an unreadable task value', async () => {
      await schemaFor(create()).submit(validValues({ costLine: 'garbage', status: 'pending' }));
      expect(mockCreateInvoice.mock.calls[0]![1]).not.toHaveProperty('costLine');
    });

    it('sends the document id as a number', async () => {
      await schemaFor(create()).submit(
        validValues({ paperlessDocumentId: '42', status: 'pending' }),
      );
      expect(mockCreateInvoice.mock.calls[0]![1].paperlessDocumentId).toBe(42);
    });

    it('names the added invoice or offer per kind', () => {
      const invoice = schemaFor(create());
      const offer = schemaFor(create({ kind: 'offer' }));
      const result = { id: 'x', href: '/x', label: 'Acme Roofing · Offer' };
      expect(invoice.addedMessage?.(result)).toBe('Invoice ‘Acme Roofing · Offer’ added.');
      expect(offer.addedMessage?.(result)).toBe('Offer ‘Acme Roofing · Offer’ added.');
    });

    it('labels an offer without company or number by the word Offer', async () => {
      mockCreateInvoice.mockResolvedValue({ id: 'o-1', status: 'quotation' } as Invoice);
      const result = await schemaFor(create({ kind: 'offer' })).submit(validValues());
      expect(result.label).toBe('Offer');
    });

    it('has no server error mapping (create)', () => {
      expect(schemaFor(create()).mapError).toBeUndefined();
    });
  });

  describe('forItem hint', () => {
    const hintOf = (request: Partial<InvoiceCreateRequest>, values: ObjectFormValues) => {
      const hint = fieldOf(schemaFor(create(request)).fields, 'costLine')!.hint;
      return typeof hint === 'function' ? hint(values) : hint;
    };
    const item = { type: 'work_item' as const, id: 'wi-1', label: 'Roof' };

    it('names the cost line with the amount and the task once all three are known', () => {
      expect(hintOf({ item }, { costLine: 'work_item:wi-1', amount: '120' })).toBe(
        'One cost line of €120.00 on Roof.',
      );
    });

    it.each([
      ['no amount yet', { costLine: 'work_item:wi-1', amount: '' }],
      ['a zero amount', { costLine: 'work_item:wi-1', amount: '0' }],
      ['the task was cleared', { costLine: '', amount: '120' }],
    ])('falls back to the generic hint with %s', (_name, values) => {
      expect(hintOf({ item }, values)).toBe('Creates one cost line for the full amount.');
    });

    it('falls back to the generic hint when no task is known', () => {
      expect(hintOf({}, { costLine: 'work_item:wi-1', amount: '120' })).toBe(
        'Creates one cost line for the full amount.',
      );
    });
  });

  // ─── Edit schema ───────────────────────────────────────────────────────────

  describe('edit schema', () => {
    it('is the Edit details form with the stored values, dates cut to the day', () => {
      const schema = schemaFor(edit(detail()));
      expect(schema).toMatchObject({ id: 'invoice-edit', title: 'Edit details' });
      expect(schema.addAnother).toBeUndefined();
      expect(schema.initialValues).toEqual({
        vendorId: 'v-1',
        invoiceNumber: 'INV-1',
        amount: '1200',
        date: '2026-03-04',
        dueDate: '2026-04-04',
        status: 'pending',
        notes: 'Some note',
      });
    });

    it('has no document, task or purchase row and shows Notes as an essential field', () => {
      const schema = schemaFor(edit(detail()));
      expect(names(schema.fields)).toEqual([
        'vendorId',
        'invoiceNumber',
        'amount',
        'date',
        'dueDate',
        'status',
        'notes',
      ]);
      expect(schema.fields.every((f) => f.essential)).toBe(true);
    });

    it('turns missing number, due date and notes into empty text', () => {
      const schema = schemaFor(
        edit(detail({ invoiceNumber: null, dueDate: null, notes: null } as never)),
      );
      expect(schema.initialValues).toMatchObject({ invoiceNumber: '', dueDate: '', notes: '' });
    });

    it('offers no quotation status when editing an invoice', () => {
      const status = fieldOf(schemaFor(edit(detail({ status: 'paid' }))).fields, 'status')!;
      expect(status.options!.map((o) => o.value)).toEqual(['pending', 'paid', 'claimed']);
    });

    it('edits an offer without a Status field or value', async () => {
      const schema = schemaFor(edit(detail({ status: 'quotation' })));
      expect(fieldOf(schema.fields, 'status')).toBeUndefined();
      expect(schema.initialValues).not.toHaveProperty('status');

      await schema.submit({ ...schema.initialValues, amount: '99' });

      expect(mockUpdateInvoice.mock.calls[0]![2]).not.toHaveProperty('status');
    });

    it('PATCHes the invoice, then refreshes the page, then returns its link', async () => {
      const order: string[] = [];
      mockUpdateInvoice.mockImplementation(() => {
        order.push('patch');
        return Promise.resolve({} as never);
      });
      const onSaved = jest.fn(() => {
        order.push('saved');
        return Promise.resolve();
      });
      const schema = schemaFor(edit(detail(), onSaved));

      const result = await schema.submit({
        vendorId: 'v-2',
        invoiceNumber: ' INV-2 ',
        amount: '1500',
        date: '2026-03-05',
        dueDate: '',
        status: 'paid',
        notes: ' ',
      });

      expect(mockUpdateInvoice).toHaveBeenCalledWith('v-1', 'inv-1', {
        invoiceNumber: 'INV-2',
        amount: 1500,
        date: '2026-03-05',
        dueDate: null,
        status: 'paid',
        notes: null,
        vendorId: 'v-2',
      });
      expect(order).toEqual(['patch', 'saved']);
      expect(result).toEqual({ id: 'inv-1', href: '/budget/invoices/inv-1', label: '' });
    });

    it('maps the itemized-sum error onto the amount, naming the formatted itemized total from the details', () => {
      const { mapError } = schemaFor(edit(detail()));
      expect(mapError?.('ITEMIZED_SUM_EXCEEDS_INVOICE', {}, { itemizedTotal: 1800 })).toEqual({
        amount:
          "The amount can't be lower than €1,800.00, the total of the cost lines on it. Lower the cost lines first.",
      });
    });

    it.each([
      ['missing', undefined],
      ['empty', {}],
      ['non-numeric', { itemizedTotal: 'abc' }],
      ['null', { itemizedTotal: null }],
      ['a numeric string', { itemizedTotal: '12' }],
      ['not finite', { itemizedTotal: Infinity }],
    ])('names no figure (and never NaN) when the details are %s', (_name, details) => {
      const { mapError } = schemaFor(edit(detail()));
      expect(mapError?.('ITEMIZED_SUM_EXCEEDS_INVOICE', {}, details)).toEqual({
        amount: "The amount can't be lower than the cost lines on it. Lower the cost lines first.",
      });
    });

    it('maps a missing company onto the company and leaves other codes alone', () => {
      const { mapError } = schemaFor(edit(detail()));
      expect(mapError?.('NOT_FOUND', {})).toEqual({ vendorId: 'That company no longer exists.' });
      expect(mapError?.('SOMETHING_ELSE', {})).toBeNull();
    });

    it('closes after a saved PATCH even when the page refresh rejects', async () => {
      mockUpdateInvoice.mockResolvedValue({} as never);
      const onSaved = jest.fn(() => Promise.reject(new Error('refresh failed')));
      const schema = schemaFor(edit(detail(), onSaved));

      const result = await schema.submit(schema.initialValues);

      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'inv-1', href: '/budget/invoices/inv-1', label: '' });
    });

    it('validates like create but never asks for a document or cost line', () => {
      const schema = schemaFor(edit(detail()));
      expect(schema.validate(schema.initialValues)).toEqual({});
      expect(schema.validate({ ...schema.initialValues, amount: '0' }).amount).toBe(
        'Enter an amount greater than 0.',
      );
    });
  });

  // ─── In the form ───────────────────────────────────────────────────────────

  describe('in the ObjectForm', () => {
    const onCreated = jest.fn();

    function Harness({
      request,
      options,
    }: {
      request?: InvoiceCreateRequest;
      options?: FormTypes.InvoiceFormOptions;
    }) {
      const resolved = options ?? create(request);
      const schema = Form.useInvoiceFormSchema(resolved);
      return (
        <FormComponent.ObjectForm
          schema={schema}
          prefill={resolved.mode === 'create' ? Form.invoiceFormPrefill(resolved.request) : {}}
          testId="invoice-form"
          onCreated={onCreated}
          onCancel={() => {}}
        />
      );
    }

    const renderForm = (props: Parameters<typeof Harness>[0] = {}) =>
      render(
        <MemoryRouter>
          <Harness {...props} />
        </MemoryRouter>,
      );

    beforeEach(() => {
      onCreated.mockReset();
    });

    const amount = () => screen.getByLabelText(/^Amount/) as HTMLInputElement;
    const save = () => screen.getByTestId('invoice-form-save');

    it('shows the invoice fields with To pay selected, and no Status for an offer', () => {
      renderForm({ request: { kind: 'invoice' } });
      expect(screen.getByLabelText('Status')).toHaveValue('pending');
      expect(screen.getByRole('dialog', { name: 'New invoice' })).toBeInTheDocument();
    });

    it('shows an offer without Status', () => {
      renderForm({ request: { kind: 'offer' } });
      expect(screen.queryByLabelText('Status')).toBeNull();
      expect(screen.getByRole('dialog', { name: 'New offer' })).toBeInTheDocument();
    });

    it('focuses Amount first when the company is pre-filled', async () => {
      renderForm({ request: { kind: 'invoice', company: COMPANY } });
      await waitFor(() => expect(amount()).toHaveFocus());
    });

    it('shows the field errors from an empty save', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(save());

      expect(await screen.findByText('Choose a company.')).toBeInTheDocument();
      expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
      expect(mockCreateInvoice).not.toHaveBeenCalled();
    });

    it('creates the invoice for the pre-filled company and task, and hands over its link', async () => {
      const user = userEvent.setup();
      renderForm({
        request: {
          kind: 'invoice',
          company: COMPANY,
          item: { type: 'work_item', id: 'wi-1', label: 'Roof' },
        },
      });
      await user.type(amount(), '250');
      expect(await screen.findByText('One cost line of €250.00 on Roof.')).toBeInTheDocument();

      await user.click(save());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockCreateInvoice).toHaveBeenCalledWith(
        'v-1',
        expect.objectContaining({
          amount: 250,
          status: 'pending',
          costLine: { targetType: 'work_item', targetId: 'wi-1' },
        }),
      );
      expect(onCreated.mock.calls[0]![0]).toMatchObject({ href: '/budget/invoices/inv-new' });
    });

    it('Add another keeps company, status and date, clears the amount and restores the task', async () => {
      const user = userEvent.setup();
      renderForm({
        request: {
          kind: 'invoice',
          company: COMPANY,
          item: { type: 'work_item', id: 'wi-1', label: 'Roof' },
        },
      });
      await user.click(screen.getByTestId('invoice-form-add-another'));
      await user.selectOptions(screen.getByLabelText('Status'), 'paid');
      const date = screen.getByLabelText(/^Date/) as HTMLInputElement;
      await user.clear(date);
      await user.type(date, '2026-05-06');
      await user.type(amount(), '250');
      await user.type(screen.getByLabelText(/^Number/), 'INV-1');

      await user.click(save());

      await waitFor(() =>
        expect(screen.getByTestId('invoice-form-added')).toHaveTextContent(
          'Invoice ‘Acme Roofing · INV-7’ added.',
        ),
      );
      expect(onCreated).not.toHaveBeenCalled();
      expect(amount()).toHaveValue(null);
      expect(screen.getByLabelText(/^Number/)).toHaveValue('');
      expect(screen.getByLabelText('Status')).toHaveValue('paid');
      expect(screen.getByLabelText(/^Date/)).toHaveValue('2026-05-06');
      expect(screen.getByText('Acme Roofing')).toBeInTheDocument();
      expect(screen.getByText('Roof')).toBeInTheDocument();
    });

    it('shows a notice and clears the company when the pre-filled company no longer exists', async () => {
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderForm({ request: { kind: 'invoice', company: { id: 'gone' } } });

      expect(await screen.findByText('That company no longer exists.')).toBeInTheDocument();
    });

    it('selects the company created in the child step', async () => {
      const user = userEvent.setup();
      mockCreateVendor.mockResolvedValue({ id: 'v-new', name: 'Brand New Co' } as never);
      renderForm();

      await user.type(screen.getByLabelText(/^Company/), 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));
      expect(await screen.findByRole('heading', { name: 'New company' })).toBeInTheDocument();
      await user.click(save());

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'New invoice' })).toBeInTheDocument(),
      );
      expect(screen.getByText('Brand New Co')).toBeInTheDocument();
      expect(screen.queryByText('That company no longer exists.')).toBeNull();
    });

    it('picks a task or purchase, names the cost line, and forgets it when cleared', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue({
        query: 'ro',
        groups: [
          {
            type: 'work_item',
            total: 1,
            status: 'ok',
            items: [{ id: 'wi-7', label: 'Roof', sublabel: null, areaPath: null }],
          },
        ],
      } as never);
      renderForm({ request: { kind: 'invoice', company: COMPANY } });
      await user.type(amount(), '80');

      await user.type(screen.getByLabelText('For task / purchase'), 'ro');
      await user.click(await screen.findByRole('option', { name: /Roof/ }));
      expect(await screen.findByText('One cost line of €80.00 on Roof.')).toBeInTheDocument();

      await user.click(screen.getByTestId('invoice-form-save'));
      await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalled());
      expect(mockCreateInvoice.mock.calls[0]![1].costLine).toEqual({
        targetType: 'work_item',
        targetId: 'wi-7',
      });
    });

    it('starts from a document in the URL: fills the form once Paperless is available', async () => {
      mockGetPaperlessDocument.mockResolvedValue({
        document: { id: 5, title: 'Roof invoice', correspondent: null, created: '2026-02-02' },
      } as never);
      renderForm({ request: { kind: 'invoice', documentId: 5 } });

      await waitFor(() => expect(screen.getByLabelText(/^Date/)).toHaveValue('2026-02-02'));
      expect(mockGetPaperlessDocument).toHaveBeenCalledTimes(1);
      expect(mockGetPaperlessDocument).toHaveBeenCalledWith(5);
      expect(screen.getByText('Roof invoice', { selector: 'span' })).toBeInTheDocument();
    });

    it('edits an invoice in the same form: PATCH, refresh, close', async () => {
      const user = userEvent.setup();
      const onSaved = jest.fn(() => Promise.resolve());
      mockUpdateInvoice.mockResolvedValue({} as never);
      renderForm({ options: edit(detail(), onSaved) });

      expect(screen.getByRole('dialog', { name: 'Edit details' })).toBeInTheDocument();
      await user.clear(amount());
      await user.type(amount(), '1300');
      await user.click(save());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockUpdateInvoice).toHaveBeenCalledWith(
        'v-1',
        'inv-1',
        expect.objectContaining({ amount: 1300, status: 'pending' }),
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('invoice-form-add-another')).toBeNull();
    });

    it('shows the itemized-sum error under Amount when the server refuses a lower amount', async () => {
      const user = userEvent.setup();
      mockUpdateInvoice.mockRejectedValue(
        new ApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'x',
          details: { itemizedTotal: 1800 },
        }),
      );
      renderForm({ options: edit(detail()) });

      await user.clear(amount());
      await user.type(amount(), '10');
      await user.click(save());

      expect(
        await screen.findByText(
          "The amount can't be lower than €1,800.00, the total of the cost lines on it. Lower the cost lines first.",
        ),
      ).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
