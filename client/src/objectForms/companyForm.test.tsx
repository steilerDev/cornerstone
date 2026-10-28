/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { TradeListItem } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type * as TradesApiTypes from '../lib/tradesApi.js';
import type * as FormTypes from './companyForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
// EntityPicker formats document dates, so it reads the locale.
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

jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  createVendor: mockCreateVendor,
  // Named imports of EntityPicker's closure (the trade field is an EntityPicker).
  searchCompanies: jest.fn(),
  fetchVendor: jest.fn(),
}));
const mockFetchTrades = jest.fn<typeof TradesApiTypes.fetchTrades>();
jest.unstable_mockModule('../lib/tradesApi.js', () => ({ fetchTrades: mockFetchTrades }));

const trade = (id: string, name: string): TradeListItem => ({
  id,
  name,
  color: null,
  description: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  vendorCount: 0,
});
const TRADES = [
  trade('t-roof', 'Roofing'),
  trade('t-tile', 'Tiling'),
  { ...trade('t-elec', 'Electrical'), translationKey: 'trades.electrical' },
];
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: TRADES, isLoading: false, isInitialLoading: false, error: null }),
}));

describe('companyForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateVendor.mockReset();
    mockFetchTrades.mockReset();
    mockFetchTrades.mockResolvedValue({ trades: TRADES } as never);
    onCreated.mockReset();
    mockCreateVendor.mockResolvedValue({
      id: 'c-1',
      name: 'Sample Roofing Co',
    } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.createVendor>>);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./companyForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({ prefill }: { prefill?: Record<string, unknown> }) {
    const schema = Form.useCompanyFormSchema();
    return (
      <FormComponent.ObjectForm
        schema={schema}
        {...(prefill ? { prefill } : {})}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (prefill?: Record<string, unknown>) =>
    render(
      <MemoryRouter>
        <Harness prefill={prefill} />
      </MemoryRouter>,
    );

  const nameInput = () => screen.getByTestId('company-name-input') as HTMLInputElement;
  const save = () => screen.getByTestId('object-form-save');
  const schemaNow = () =>
    renderHook(() => Form.useCompanyFormSchema(), { wrapper: MemoryRouter }).result.current;

  describe('schema', () => {
    it('is the "New company" form with name and trade as the essentials', () => {
      const schema = schemaNow();

      expect(schema.id).toBe('company');
      expect(schema.title).toBe('New company');
      expect(schema.fields.map((f) => f.name)).toEqual([
        'name',
        'tradeId',
        'phone',
        'email',
        'address',
        'notes',
      ]);
      expect(schema.fields.filter((f) => f.essential).map((f) => f.name)).toEqual([
        'name',
        'tradeId',
      ]);
      expect(schema.fields.find((f) => f.name === 'name')).toMatchObject({
        required: true,
        maxLength: 200,
      });
    });

    // Mutation: kind 'text' loses the phone keypad and e-mail keyboard on phones.
    it('types the phone as tel and the e-mail as email, each with its autocomplete token (#2244)', () => {
      const fields = schemaNow().fields;

      expect(fields.find((f) => f.name === 'phone')).toMatchObject({
        kind: 'tel',
        autoComplete: 'tel',
      });
      expect(fields.find((f) => f.name === 'email')).toMatchObject({
        kind: 'email',
        autoComplete: 'email',
      });
      expect(fields.find((f) => f.name === 'address')?.autoComplete).toBeUndefined();
    });

    it('renders the phone and e-mail inputs with the matching type and autocomplete', () => {
      renderForm({ name: 'Co' });
      const phone = screen.getByTestId('company-phone-input');
      const email = screen.getByTestId('company-email-input');

      expect(phone).toHaveAttribute('type', 'tel');
      expect(phone).toHaveAttribute('autocomplete', 'tel');
      expect(email).toHaveAttribute('type', 'email');
      expect(email).toHaveAttribute('autocomplete', 'email');
    });

    it('names its fields like the API body keys', () => {
      const schema = schemaNow();
      expect(Object.keys(schema.initialValues ?? {}).sort()).toEqual(
        ['address', 'email', 'name', 'notes', 'phone', 'tradeId'].sort(),
      );
    });
  });

  describe('validation', () => {
    const errorsFor = (values: Record<string, unknown>) => schemaNow().validate(values);

    it.each(['', '   ', undefined])('requires a name (%j)', (name) => {
      expect(errorsFor({ name })).toEqual({ name: 'Enter a name.' });
    });

    it('rejects a name longer than 200 characters and accepts exactly 200', () => {
      expect(errorsFor({ name: 'x'.repeat(201) })).toEqual({
        name: 'Use at most 200 characters.',
      });
      expect(errorsFor({ name: 'x'.repeat(200) })).toEqual({});
    });

    it('accepts a blank or well-formed e-mail and rejects a malformed one (shared isEmailAddress)', () => {
      expect(errorsFor({ name: 'Co', email: '' })).toEqual({});
      expect(errorsFor({ name: 'Co', email: '  ' })).toEqual({});
      expect(errorsFor({ name: 'Co', email: ' a@b.co ' })).toEqual({});
      expect(errorsFor({ name: 'Co', email: 'a b@c.de' })).toEqual({
        email: 'Enter a valid e-mail address.',
      });
    });

    it('measures the name after trimming', () => {
      expect(errorsFor({ name: `  ${'x'.repeat(200)}  ` })).toEqual({});
    });

    it.each(['not-an-email', 'a@b', 'a b@c.de', '@c.de', 'a@.de '])(
      'rejects the e-mail %j',
      (email) => {
        expect(errorsFor({ name: 'Co', email }).email).toBe('Enter a valid e-mail address.');
      },
    );

    it.each(['', '   ', 'office@sample-roofing.example', '  office@sample-roofing.example '])(
      'accepts the e-mail %j',
      (email) => {
        expect(errorsFor({ name: 'Co', email })).toEqual({});
      },
    );

    it('reports both problems together', () => {
      expect(errorsFor({ name: '', email: 'nope' })).toEqual({
        name: 'Enter a name.',
        email: 'Enter a valid e-mail address.',
      });
    });
  });

  describe('submit', () => {
    it('maps empty and blank optional fields to null and trims the rest', async () => {
      const result = await schemaNow().submit({
        name: '  Sample Roofing Co  ',
        tradeId: '',
        phone: '   ',
        email: '',
        address: '',
        notes: '',
      });

      expect(mockCreateVendor).toHaveBeenCalledWith({
        name: 'Sample Roofing Co',
        tradeId: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
      });
      expect(result).toEqual({
        id: 'c-1',
        href: '/companies/c-1',
        label: 'Sample Roofing Co',
      });
    });

    it('sends the filled fields, trimmed', async () => {
      await schemaNow().submit({
        name: 'Sample Roofing Co',
        tradeId: 't-roof',
        phone: ' 555-0142 ',
        email: ' office@sample-roofing.example ',
        address: ' 1 Sample Street ',
        notes: ' Calls back ',
      });

      expect(mockCreateVendor).toHaveBeenCalledWith({
        name: 'Sample Roofing Co',
        tradeId: 't-roof',
        phone: '555-0142',
        email: 'office@sample-roofing.example',
        address: '1 Sample Street',
        notes: 'Calls back',
      });
    });

    it('labels the result with the name the server stored', async () => {
      mockCreateVendor.mockResolvedValue({
        id: 'c-2',
        name: 'Stored Name',
      } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.createVendor>>);

      const result = await schemaNow().submit({ name: 'typed name' });

      expect(result.label).toBe('Stored Name');
      expect(result.href).toBe('/companies/c-2');
    });
  });

  describe('in the dialog', () => {
    it('shows the pre-filled name, focuses nothing wrong and creates the company', async () => {
      const user = userEvent.setup();
      renderForm({ name: 'Brand New Co' });

      expect(nameInput()).toHaveValue('Brand New Co');
      await user.click(save());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated).toHaveBeenCalledWith({
        id: 'c-1',
        href: '/companies/c-1',
        label: 'Sample Roofing Co',
      });
    });

    it('requires a name before it posts', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(save());

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(mockCreateVendor).not.toHaveBeenCalled();
    });

    it('offers the trades in the trade picker and posts the chosen one', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(nameInput(), 'Sample Roofing Co');

      await user.click(screen.getByLabelText('Trade'));
      await user.click(await screen.findByRole('option', { name: 'Tiling' }));
      await user.click(save());

      await waitFor(() => expect(mockCreateVendor).toHaveBeenCalledTimes(1));
      expect(mockCreateVendor).toHaveBeenCalledWith(expect.objectContaining({ tradeId: 't-tile' }));
    });

    it('lists the trades with their translated names and filters them as the person types', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByLabelText('Trade'));
      expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
        'Roofing',
        'Tiling',
        'Electrical',
      ]);
      await user.type(screen.getByLabelText('Trade'), 'tili');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
      expect(screen.getByRole('option', { name: 'Tiling' })).toBeInTheDocument();
    });

    it('shows a prefilled trade by its translated display name', () => {
      renderForm({ tradeId: 't-elec' });

      expect(screen.getByText('Electrical')).toBeInTheDocument();
      expect(screen.queryByLabelText('Trade')).toBeNull();
    });

    it('shows a prefilled trade without a translation under its stored name, and clears it again', async () => {
      const user = userEvent.setup();
      renderForm({ tradeId: 't-roof' });

      expect(screen.getByText('Roofing')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(await screen.findByLabelText('Trade')).toBeInTheDocument();
    });

    it('uses the form placeholder for the trade input and offers no inline trade creation outside a provider', async () => {
      const user = userEvent.setup();
      renderForm();
      const input = screen.getByLabelText('Trade');

      expect(input).not.toHaveAttribute('aria-invalid');
      expect(input).toHaveAttribute('placeholder', 'Choose a trade');
      await user.type(input, 'Glazing');
      await waitFor(() => expect(screen.queryByText('Searching...')).toBeNull());
      expect(screen.queryByRole('option', { name: /New trade/ })).toBeNull();
    });

    it('shows an invalid e-mail on the e-mail field', async () => {
      const user = userEvent.setup();
      renderForm({ name: 'Co' });
      await user.type(screen.getByTestId('company-email-input'), 'nope');

      await user.click(save());

      expect(await screen.findByText('Enter a valid e-mail address.')).toBeInTheDocument();
      expect(screen.getByTestId('company-email-input')).toHaveAttribute('aria-invalid', 'true');
      expect(mockCreateVendor).not.toHaveBeenCalled();
    });

    it('maps a server details.fields path /email onto the e-mail field', async () => {
      const user = userEvent.setup();
      mockCreateVendor.mockRejectedValue(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'bad',
          details: { fields: [{ path: '/email', message: 'must match format' }] },
        }),
      );
      renderForm({ name: 'Co' });
      await user.type(screen.getByTestId('company-email-input'), 'a@b.co');

      await user.click(save());

      await waitFor(() =>
        expect(screen.getByTestId('company-email-input')).toHaveAttribute('aria-invalid', 'true'),
      );
      expect(nameInput()).not.toHaveAttribute('aria-invalid');
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('keeps the form open and shows a banner when the server fails', async () => {
      const user = userEvent.setup();
      mockCreateVendor.mockRejectedValue(new Error('SQLITE_BUSY: raw detail'));
      renderForm({ name: 'Co' });

      await user.click(save());

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE_BUSY');
      expect(onCreated).not.toHaveBeenCalled();
      expect(nameInput()).toHaveValue('Co');
    });
  });
});
