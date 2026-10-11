/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';
import enCommon from '../i18n/en/common.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as HouseholdItemsApiTypes from '../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type * as CategoriesApiTypes from '../lib/householdItemCategoriesApi.js';
import type { UseAreasResult } from '../hooks/useAreas.js';
import type * as FormTypes from './purchaseForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type * as StateTypes from '../components/ObjectForm/objectFormState.js';

const mockCreateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();

jest.unstable_mockModule('../lib/householdItemsApi.js', () => ({
  createHouseholdItem: mockCreateHouseholdItem,
}));
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({ fetchVendors: mockFetchVendors }));
jest.unstable_mockModule('../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));

const AREAS = [
  { id: 'a1', name: 'Kitchen', parentId: null, color: null },
] as unknown as UseAreasResult['areas'];
const mockUseAreas = jest.fn<() => UseAreasResult>();
jest.unstable_mockModule('../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));

jest.unstable_mockModule('../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: ({
    areas,
    value,
    onChange,
    id,
  }: {
    areas: Array<{ id: string; name: string }>;
    value: string;
    onChange: (id: string) => void;
    id?: string;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Area picker"
    >
      <option value="">None</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  ),
}));

const CREATED = { id: 'hi-1' } as unknown as Awaited<
  ReturnType<typeof HouseholdItemsApiTypes.createHouseholdItem>
>;

describe('purchaseForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let State: typeof StateTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateHouseholdItem.mockReset();
    mockFetchVendors.mockReset();
    mockFetchCategories.mockReset();
    onCreated.mockReset();
    mockUseAreas.mockReturnValue({
      areas: AREAS,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as UseAreasResult);
    mockFetchVendors.mockResolvedValue({
      vendors: [{ id: 'v1', name: 'Acme Supply' }],
      pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.fetchVendors>>);
    mockFetchCategories.mockResolvedValue({
      categories: [
        { id: 'hic-furniture', name: 'Furniture' },
        { id: 'hic-lighting', name: 'Lighting' },
      ],
    } as unknown as Awaited<ReturnType<typeof CategoriesApiTypes.fetchHouseholdItemCategories>>);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./purchaseForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
      State = await import('../components/ObjectForm/objectFormState.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({ search = '' }: { search?: string }) {
    const schema = Form.usePurchaseFormSchema();
    const prefill = State.mapPrefill(
      schema,
      Object.fromEntries(new URLSearchParams(search)) as never,
    );
    return (
      <FormComponent.ObjectForm
        schema={schema}
        prefill={prefill}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (search?: string) =>
    render(
      <MemoryRouter>
        <Harness search={search} />
      </MemoryRouter>,
    );

  const name = () => screen.findByLabelText(/^name/i) as Promise<HTMLInputElement>;
  const save = () => screen.getByTestId('object-form-save');

  it('titles the dialog "New purchase"', async () => {
    renderForm();
    await name();
    expect(screen.getByRole('dialog', { name: 'New purchase' })).toBeInTheDocument();
  });

  it('shows the essentials and keeps the delivery details under More details', async () => {
    renderForm();
    await name();
    for (const label of [/^name/i, /category/i, /purchase status/i, /quantity/i, /vendor/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Area picker')).toBeInTheDocument();
    const more = screen.getByTestId('object-form-more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    const hidden = document.getElementById(more.getAttribute('aria-controls')!)!;
    for (const label of [
      /description/i,
      /url/i,
      /order date/i,
      /earliest/i,
      /latest/i,
      /actual/i,
    ]) {
      expect(hidden.querySelector(`label`)).not.toBeNull();
      expect(
        Array.from(hidden.querySelectorAll('label')).some((l) => label.test(l.textContent ?? '')),
      ).toBe(true);
    }
  });

  it('status defaults to the first status and lists HOUSEHOLD_ITEM_STATUSES in order with translated labels', async () => {
    renderForm();
    await name();
    const select = screen.getByLabelText(/purchase status/i) as HTMLSelectElement;
    expect(select.value).toBe('planned');
    expect(Array.from(select.options).map((o) => o.value)).toEqual([...HOUSEHOLD_ITEM_STATUSES]);
    expect(select.options[0]!.textContent).toBe(enCommon.statusVocabulary.purchase.planned);
  });

  it('quantity defaults to 1', async () => {
    renderForm();
    await name();
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('1');
  });

  it('marks name, category as required', async () => {
    renderForm();
    await name();
    expect(screen.getByLabelText(/^name/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/category/i)).toHaveAttribute('aria-required', 'true');
  });

  it('offers the fetched vendors and categories (placeholder first)', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Acme Supply' })).toBeInTheDocument(),
    );
    const vendor = screen.getByLabelText(/vendor/i) as HTMLSelectElement;
    expect(Array.from(vendor.options).map((o) => o.textContent)).toEqual([
      'No vendor',
      'Acme Supply',
    ]);
    const category = screen.getByLabelText(/category/i) as HTMLSelectElement;
    expect(Array.from(category.options).map((o) => o.value)).toEqual([
      '',
      'hic-furniture',
      'hic-lighting',
    ]);
  });

  it('defaults the category to the first option and the form stays clean', async () => {
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText(/category/i) as HTMLSelectElement).value).toBe('hic-furniture'),
    );
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  describe('pre-fill', () => {
    it('pre-selects a known area and company', async () => {
      renderForm('?areaId=a1&companyId=v1');
      await waitFor(() =>
        expect((screen.getByLabelText(/vendor/i) as HTMLSelectElement).value).toBe('v1'),
      );
      expect((screen.getByLabelText('Area picker') as HTMLSelectElement).value).toBe('a1');
    });

    it('clears an unknown company once the vendors have loaded', async () => {
      renderForm('?companyId=gone');
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Acme Supply' })).toBeInTheDocument(),
      );
      expect((screen.getByLabelText(/vendor/i) as HTMLSelectElement).value).toBe('');
    });
  });

  describe('validation', () => {
    it('requires a name', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.click(save());
      expect(await screen.findByText('Name is required')).toBeInTheDocument();
      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    it('requires a category', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await waitFor(() =>
        expect((screen.getByLabelText(/category/i) as HTMLSelectElement).value).toBe(
          'hic-furniture',
        ),
      );
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '' } });
      await user.click(save());
      expect(await screen.findByText('Category is required')).toBeInTheDocument();
    });

    it('rejects a quantity below 1', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '0' } });
      await user.click(save());
      expect(await screen.findByText('Quantity must be at least 1')).toBeInTheDocument();
      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    it('rejects an empty quantity', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '' } });
      await user.click(save());
      expect(await screen.findByText('Quantity must be at least 1')).toBeInTheDocument();
    });

    it('rejects an actual delivery before the order date (inside More details)', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await user.click(screen.getByTestId('object-form-more'));
      fireEvent.change(screen.getByLabelText(/order date/i), { target: { value: '2026-03-10' } });
      fireEvent.change(screen.getByLabelText(/actual delivery/i), {
        target: { value: '2026-03-01' },
      });
      await user.click(save());
      expect(
        await screen.findByText('Actual delivery date must be after or equal to order date'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/actual delivery/i)).toHaveFocus();
    });

    it('rejects an earliest delivery after the latest', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await user.click(screen.getByTestId('object-form-more'));
      fireEvent.change(screen.getByLabelText(/earliest delivery/i), {
        target: { value: '2026-03-10' },
      });
      fireEvent.change(screen.getByLabelText(/latest delivery/i), {
        target: { value: '2026-03-01' },
      });
      await user.click(save());
      expect(
        await screen.findByText(
          'Earliest delivery date must be before or equal to latest delivery date',
        ),
      ).toBeInTheDocument();
    });

    it('clears the name error once a name is typed (aria-invalid wiring)', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.click(save());
      const input = screen.getByLabelText(/^name/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent(
        'Name is required',
      );
      await user.type(input, 'S');
      expect(input).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('submission', () => {
    it('creates the item with trimmed, null-normalised data and reports the new purchase', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      renderForm('?areaId=a1&companyId=v1');
      await waitFor(() =>
        expect((screen.getByLabelText(/vendor/i) as HTMLSelectElement).value).toBe('v1'),
      );
      await user.type(screen.getByLabelText(/^name/i), '  Kitchen Island  ');
      await user.click(screen.getByTestId('object-form-more'));
      await user.type(screen.getByLabelText(/description/i), 'Custom maple island');
      await user.click(save());

      await waitFor(() => expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1));
      expect(mockCreateHouseholdItem).toHaveBeenCalledWith({
        name: 'Kitchen Island',
        description: 'Custom maple island',
        category: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        areaId: 'a1',
        vendorId: 'v1',
        url: null,
        orderDate: null,
        earliestDeliveryDate: undefined,
        latestDeliveryDate: undefined,
        actualDeliveryDate: null,
      });
      await waitFor(() =>
        expect(onCreated).toHaveBeenCalledWith({
          id: 'hi-1',
          href: '/project/household-items/hi-1',
          label: 'Kitchen Island',
        }),
      );
    });

    it('sends a user-specified quantity', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '5' } });
      await user.click(save());
      await waitFor(() =>
        expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
          expect.objectContaining({ quantity: 5 }),
        ),
      );
    });

    it('shows a banner (never the raw error) when creation fails', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockRejectedValue(new Error('SQLITE_BUSY: raw detail'));
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      await user.click(save());
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE_BUSY');
      expect(onCreated).not.toHaveBeenCalled();
    });
  });

  describe('data loading failure', () => {
    it('shows no notice when the data loads', async () => {
      renderForm();
      await name();
      expect(document.getElementById('category-notice')).toBeNull();
    });

    it('ignores a late failure after unmount (nothing logged)', async () => {
      let rejectVendors!: (e: Error) => void;
      mockFetchVendors.mockReturnValue(
        new Promise((_r, reject) => {
          rejectVendors = reject;
        }),
      );
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderForm();
      unmount();
      await act(async () => {
        rejectVendors(new Error('late'));
      });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('shows the translated loadFailed notice and never the raw error message', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchVendors.mockRejectedValue(new Error('SQLITE_BUSY: raw internal detail'));
      renderForm();
      expect(
        await screen.findByText('Failed to load form data. Please try again.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE_BUSY');
      expect(document.body.textContent).not.toContain('raw internal detail');
      // A notice, not a validation error: wired to the category field, which is not invalid.
      const notice = document.getElementById('category-notice');
      expect(notice).toHaveTextContent('Failed to load form data. Please try again.');
      const category = screen.getByLabelText(/category/i);
      expect(category.getAttribute('aria-describedby')).toContain('category-notice');
      expect(category).not.toHaveAttribute('aria-invalid');
      consoleSpy.mockRestore();
    });
  });
});
