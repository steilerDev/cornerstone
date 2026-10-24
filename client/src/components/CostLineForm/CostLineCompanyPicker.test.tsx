/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import type { ObjectFormRenderContext, ObjectFormSchema } from '../ObjectForm/types.js';
import type * as VendorsTypes from '../../lib/vendorsApi.js';
import type * as PickerTypes from './CostLineCompanyPicker.js';

const mockFetchVendors = jest.fn<typeof VendorsTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsTypes.fetchVendor>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
}));

const COMPANY_SCHEMA = { id: 'company' } as unknown as ObjectFormSchema;

describe('CostLineCompanyPicker', () => {
  let Picker: typeof PickerTypes;
  const setValue = jest.fn<(value: unknown) => void>();
  const createChild = jest.fn<ObjectFormRenderContext['createChild']>();
  const onCreatedCompany = jest.fn<(company: { id: string; name: string }) => void>();

  beforeEach(async () => {
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    setValue.mockReset();
    onCreatedCompany.mockReset();
    createChild.mockReset();
    mockFetchVendors.mockResolvedValue({ vendors: [{ id: 'v1', name: 'Acme Supply' }] } as never);
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    if (!Picker) Picker = await import('./CostLineCompanyPicker.js');
  });

  const ctx = (over: Partial<ObjectFormRenderContext> = {}): ObjectFormRenderContext => ({
    id: 'vendorId',
    value: '',
    setValue,
    busy: false,
    invalid: false,
    describedBy: undefined,
    createChild,
    values: {},
    ...over,
  });

  function renderPicker(
    over: Partial<ObjectFormRenderContext> = {},
    extra: Partial<PickerTypes.CostLineCompanyPickerProps> = {},
  ) {
    return render(
      <Picker.CostLineCompanyPicker
        ctx={ctx(over)}
        companySchema={COMPANY_SCHEMA}
        placeholder="No company"
        onCreatedCompany={onCreatedCompany}
        {...extra}
      />,
    );
  }

  it('treats a non-text value as no company and offers the first companies on focus', async () => {
    const user = userEvent.setup();
    renderPicker({ value: undefined });
    const input = screen.getByPlaceholderText('No company');
    expect(input).toHaveValue('');
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Acme Supply' }));
    expect(setValue).toHaveBeenCalledWith('v1');
    expect(mockFetchVendor).not.toHaveBeenCalled();
  });

  it('shows a known company by name without a lookup', () => {
    renderPicker({ value: 'v1' }, { known: { id: 'v1', name: 'Acme Supply' } });
    expect(screen.getByText('Acme Supply')).toBeInTheDocument();
    expect(mockFetchVendor).not.toHaveBeenCalled();
  });

  it('looks an unknown id up and clears it when the company no longer exists', async () => {
    renderPicker({ value: 'v-gone' });
    await waitFor(() => expect(setValue).toHaveBeenCalledWith(''));
  });

  it('is disabled while busy and marks the input invalid', () => {
    renderPicker({ busy: true, invalid: true, describedBy: 'err' });
    const input = screen.getByPlaceholderText('No company');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'err');
  });

  it('continues in a New company child step and sets the created company', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByPlaceholderText('No company'), 'Brand New Co');
    await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));

    expect(createChild).toHaveBeenCalledTimes(1);
    const child = createChild.mock.calls[0]![0];
    expect(child.schema).toBe(COMPANY_SCHEMA);
    expect(child.prefill).toEqual({ name: 'Brand New Co' });
    child.onCreated({ id: 'v-new', href: '', label: 'Brand New Co' });
    expect(setValue).toHaveBeenCalledWith('v-new');
    expect(onCreatedCompany).toHaveBeenCalledWith({ id: 'v-new', name: 'Brand New Co' });
  });
});
