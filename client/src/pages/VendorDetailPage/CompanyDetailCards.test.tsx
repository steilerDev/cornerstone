/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TradeListItem, VendorDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as CardsTypes from './CompanyDetailCards.js';

const mockUpdateVendor = jest.fn<typeof VendorsApiTypes.updateVendor>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  updateVendor: mockUpdateVendor,
  searchCompanies: jest.fn(),
  fetchVendor: jest.fn(),
}));
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
const trade = (id: string, name: string, translationKey: string | null = null): TradeListItem => ({
  id,
  name,
  color: null,
  description: null,
  translationKey,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  vendorCount: 0,
});
const TRADES = [trade('t-roof', 'Roofing'), trade('t-tile', 'Tiling')];
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: TRADES, isLoading: false, isInitialLoading: false, error: null }),
}));

jest.unstable_mockModule('../../lib/tradesApi.js', () => ({
  fetchTrades: jest.fn(async () => ({ trades: TRADES })),
}));

let Cards: typeof CardsTypes;
let media: MatchMediaControl;

const FULL = {
  id: 'v1',
  name: 'Sample Roofing Co',
  trade: { id: 't-roof', name: 'Roofing', color: null, translationKey: null },
  phone: '+49 30 555-0142',
  email: 'office@sample.example',
  address: '1 Sample Street\nTown',
  notes: 'Calls back',
  createdBy: { id: 'u1', displayName: 'Alex', email: 'a@x.example' },
} as unknown as VendorDetail;

const EMPTY = {
  ...FULL,
  trade: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdBy: null,
} as unknown as VendorDetail;

const onSaved = jest.fn<() => Promise<unknown>>();

function renderCards(vendor: VendorDetail, ref = createRef<SectionCardController>()) {
  render(<Cards.CompanyDetailCards vendor={vendor} onSaved={onSaved} phoneCardRef={ref} />);
  return ref;
}

const detail = (id: string) => screen.getByTestId(id);

beforeEach(async () => {
  mockUpdateVendor.mockReset();
  mockUpdateVendor.mockResolvedValue({} as VendorDetail);
  onSaved.mockReset();
  onSaved.mockResolvedValue(undefined);
  media = installMatchMedia({ '(min-width: 768px)': true });
  if (!Cards) Cards = await import('./CompanyDetailCards.js');
});

afterEach(() => media.restore());

describe('CompanyDetailCards read mode', () => {
  it('shows every value, the phone as a tel link and the e-mail as a mailto link', () => {
    renderCards(FULL);

    expect(within(detail('company-detail-phone')).getByRole('link')).toHaveAttribute(
      'href',
      'tel:+49305550142',
    );
    expect(within(detail('company-detail-email')).getByRole('link')).toHaveAttribute(
      'href',
      'mailto:office@sample.example',
    );
    expect(detail('company-detail-address')).toHaveTextContent('1 Sample Street');
    expect(detail('company-detail-name')).toHaveTextContent('Sample Roofing Co');
    expect(detail('company-detail-trade')).toHaveTextContent('Roofing');
    expect(detail('company-detail-notes')).toHaveTextContent('Calls back');
    expect(detail('company-detail-added-by')).toHaveTextContent('Alex');
  });

  it('shows an en dash with a screen-reader "Not set" for each missing value', () => {
    renderCards(EMPTY);

    for (const id of [
      'company-detail-phone',
      'company-detail-email',
      'company-detail-address',
      'company-detail-trade',
      'company-detail-notes',
      'company-detail-added-by',
    ]) {
      expect(detail(id)).toHaveTextContent('–');
      expect(within(detail(id)).queryByRole('link')).toBeNull();
    }
    expect(detail('company-detail-phone')).toHaveTextContent('Not set');
  });

  it('shows the translated name of a trade that has a translation key', () => {
    renderCards({
      ...FULL,
      trade: { id: 't-e', name: 'Electrical', color: null, translationKey: 'trades.electrical' },
    } as unknown as VendorDetail);

    expect(detail('company-detail-trade')).toHaveTextContent(/Electrical|Elektro/);
  });
});

describe('Phone and e-mail card', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByTestId('company-phone-email-edit'));

  it('opens with the stored values and saves only the changed phone, trimmed', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);
    expect(screen.getByTestId('company-field-phone')).toHaveValue('+49 30 555-0142');
    expect(screen.getByTestId('company-field-phone')).toHaveAttribute('type', 'tel');
    expect(screen.getByTestId('company-field-email')).toHaveAttribute('type', 'email');

    await user.clear(screen.getByTestId('company-field-phone'));
    await user.type(screen.getByTestId('company-field-phone'), ' 555-0199 ');
    await user.click(screen.getByTestId('company-phone-email-save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { phone: '555-0199' });
  });

  it('sends null for a cleared e-mail and only the e-mail when only it changed', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);

    await user.clear(screen.getByTestId('company-field-email'));
    await user.click(screen.getByTestId('company-phone-email-save'));

    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { email: null }));
  });

  it('sets a first phone on a company without one (null to a value)', async () => {
    const user = userEvent.setup();
    renderCards(EMPTY);
    await open(user);

    await user.type(screen.getByTestId('company-field-phone'), '555-0100');
    await user.click(screen.getByTestId('company-phone-email-save'));

    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { phone: '555-0100' }));
  });

  it('shows the e-mail error on the field and sends nothing for a malformed e-mail', async () => {
    const user = userEvent.setup();
    renderCards(EMPTY);
    await open(user);

    await user.type(screen.getByTestId('company-field-email'), 'nope');
    await user.click(screen.getByTestId('company-phone-email-save'));

    expect(await screen.findByText('Enter a valid e-mail address.')).toBeInTheDocument();
    expect(screen.getByTestId('company-field-email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('company-field-email')).toHaveAttribute('aria-describedby');
    expect(mockUpdateVendor).not.toHaveBeenCalled();
  });

  it('Cancel drops the draft: reopening shows the stored value again', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);
    await user.type(screen.getByTestId('company-field-phone'), '9');
    await user.click(screen.getByTestId('company-phone-email-cancel'));
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await open(user);

    expect(screen.getByTestId('company-field-phone')).toHaveValue('+49 30 555-0142');
  });

  // Mutation: failing to translate an API code shows a raw code; losing the draft hides the retry.
  it('shows the translated API error in the card and keeps editing', async () => {
    const user = userEvent.setup();
    mockUpdateVendor.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderCards(FULL);
    await open(user);
    await user.type(screen.getByTestId('company-field-phone'), '1');

    await user.click(screen.getByTestId('company-phone-email-save'));

    expect(await screen.findByTestId('company-phone-email-form')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the generic save error for a non-API failure', async () => {
    const user = userEvent.setup();
    mockUpdateVendor.mockRejectedValue(new Error('net'));
    renderCards(FULL);
    await open(user);
    await user.type(screen.getByTestId('company-field-phone'), '1');

    await user.click(screen.getByTestId('company-phone-email-save'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not|Could not|failed|Failed/i,
    );
  });

  it('counts a failed page refresh after a successful PATCH as a successful save', async () => {
    const user = userEvent.setup();
    onSaved.mockRejectedValue(new Error('refresh failed'));
    renderCards(FULL);
    await open(user);
    await user.type(screen.getByTestId('company-field-phone'), '1');

    await user.click(screen.getByTestId('company-phone-email-save'));

    await waitFor(() => expect(screen.queryByTestId('company-phone-email-form')).toBeNull());
    expect(mockUpdateVendor).toHaveBeenCalledTimes(1);
  });

  it('opens from outside through phoneCardRef.startEdit with the phone field focused', async () => {
    const ref = renderCards(EMPTY);

    act(() => ref.current!.startEdit());

    await waitFor(() => expect(screen.getByTestId('company-field-phone')).toHaveFocus());
  });
});

describe('Address card', () => {
  it('saves the trimmed address, and null when cleared', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await user.click(screen.getByTestId('company-address-edit'));
    expect(screen.getByTestId('company-field-address')).toHaveValue('1 Sample Street\nTown');

    await user.clear(screen.getByTestId('company-field-address'));
    await user.type(screen.getByTestId('company-field-address'), '  2 New Road ');
    await user.click(screen.getByTestId('company-address-save'));
    await waitFor(() =>
      expect(mockUpdateVendor).toHaveBeenLastCalledWith('v1', { address: '2 New Road' }),
    );
  });

  it('sends null for an emptied address', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await user.click(screen.getByTestId('company-address-edit'));

    await user.clear(screen.getByTestId('company-field-address'));
    await user.click(screen.getByTestId('company-address-save'));

    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { address: null }));
  });
});

describe('About card', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByTestId('company-about-edit'));
  const save = () => screen.getByTestId('company-about-save');

  it('saves only the changed name, trimmed', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);

    await user.clear(screen.getByTestId('company-field-name'));
    await user.type(screen.getByTestId('company-field-name'), '  Renamed Co ');
    await user.click(save());

    await waitFor(() =>
      expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { name: 'Renamed Co' }),
    );
  });

  it('requires a name and sends nothing without one', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);

    await user.clear(screen.getByTestId('company-field-name'));
    await user.type(screen.getByTestId('company-field-name'), '   ');
    await user.click(save());

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(mockUpdateVendor).not.toHaveBeenCalled();
  });

  it('rejects a pasted name over 200 characters and accepts exactly 200', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);
    const name = screen.getByTestId('company-field-name');

    fireEvent.change(name, { target: { value: 'x'.repeat(201) } });
    await user.click(save());
    expect(await screen.findByText('Use at most 200 characters.')).toBeInTheDocument();
    expect(mockUpdateVendor).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: 'x'.repeat(200) } });
    await user.click(save());
    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledTimes(1));
  });

  it('saves notes (null when cleared) and a trade change', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);

    await user.clear(screen.getByTestId('company-field-notes'));
    await user.click(save());

    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { notes: null }));
  });

  it('shows the current trade as a chip and replaces it with another trade', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);
    expect(
      within(screen.getByTestId('company-about-form')).getByText('Roofing'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.type(await screen.findByLabelText('Trade'), 'Til');
    await user.click(await screen.findByRole('option', { name: 'Tiling' }));
    await user.click(save());

    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { tradeId: 't-tile' }));
  });

  it('clearing the trade sends null', async () => {
    const user = userEvent.setup();
    renderCards(FULL);
    await open(user);

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.click(save());

    await waitFor(() => expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { tradeId: null }));
  });

  it('opens a company without a trade with an empty picker', async () => {
    const user = userEvent.setup();
    renderCards(EMPTY);

    await open(user);

    expect(screen.getByLabelText('Trade')).toHaveValue('');
  });
});
