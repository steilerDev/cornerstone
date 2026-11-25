/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiClientError } from '../lib/apiClient.js';
import { makeSearchCompanies } from '../test/companySearchMock.js';
import { HOUSEHOLD_ITEM_STATUSES, routeUrl } from '@cornerstone/shared';
import enCommon from '../i18n/en/common.json';
import enHouseholdItems from '../i18n/en/householdItems.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as HouseholdItemsApiTypes from '../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type * as HouseholdItemDepsApiTypes from '../lib/householdItemDepsApi.js';
import type * as WorkItemsApiTypes from '../lib/workItemsApi.js';
import type * as MilestonesApiTypes from '../lib/milestonesApi.js';
import type * as CategoriesApiTypes from '../lib/householdItemCategoriesApi.js';
import type { UseAreasResult } from '../hooks/useAreas.js';
import type * as FormTypes from './purchaseForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type * as StateTypes from '../components/ObjectForm/objectFormState.js';

const mockCreateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const mockCreateDep = jest.fn<typeof HouseholdItemDepsApiTypes.createHouseholdItemDep>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();

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

jest.unstable_mockModule('../lib/householdItemsApi.js', () => ({
  createHouseholdItem: mockCreateHouseholdItem,
}));
const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: mockCreateVendor,
}));
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));
jest.unstable_mockModule('../lib/householdItemDepsApi.js', () => ({
  createHouseholdItemDep: mockCreateDep,
}));
jest.unstable_mockModule('../lib/workItemsApi.js', () => ({ listWorkItems: mockListWorkItems }));
jest.unstable_mockModule('../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));

const AREAS = [
  { id: 'a1', name: 'Kitchen', parentId: null, color: null, sortOrder: 0 },
] as unknown as UseAreasResult['areas'];
const mockUseAreas = jest.fn<(options?: { enabled?: boolean }) => UseAreasResult>();
jest.unstable_mockModule('../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));

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
    mockCreateVendor.mockReset();
    mockFetchVendor.mockReset();
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
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
        { id: 'hic-furniture', name: 'Furniture', translationKey: null },
        { id: 'hic-lighting', name: 'Lighting', translationKey: 'householdItemCategories.other' },
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
      <MemoryRouter initialEntries={[`/project/household-items/new${search ?? ''}`]}>
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
    for (const label of [/^name/i, /^status/i, /quantity/i, /company/i, /earliest/i, /latest/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Category is an EntityPicker custom field: the first category is preselected as a chip.
    expect(await screen.findByText('Furniture')).toBeInTheDocument();
    // Area is an EntityPicker (kind area): its input is labelled by the field label.
    expect(screen.getByLabelText(/^area/i)).toHaveAttribute('placeholder', 'Select an area');
    const more = screen.getByTestId('object-form-more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    const hidden = document.getElementById(more.getAttribute('aria-controls')!)!;
    for (const label of [/description/i, /product link/i, /ordered on/i, /delivered on/i]) {
      expect(hidden.querySelector(`label`)).not.toBeNull();
      expect(
        Array.from(hidden.querySelectorAll('label')).some((l) => label.test(l.textContent ?? '')),
      ).toBe(true);
    }
  });

  it('status defaults to the first status and lists HOUSEHOLD_ITEM_STATUSES in order with translated labels', async () => {
    renderForm();
    await name();
    const select = screen.getByLabelText(/^status/i) as HTMLSelectElement;
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
    const user = userEvent.setup();
    renderForm();
    await name();
    expect(screen.getByLabelText(/^name/i)).toHaveAttribute('aria-required', 'true');
    // The category chip has no input; clearing it brings the required input back.
    await user.click(await screen.findByRole('button', { name: /^Clear selection/ }));
    expect(await screen.findByLabelText(/category/i)).toHaveAttribute('aria-required', 'true');
  });

  it('offers the categories with their display names and searches companies as you type', async () => {
    const user = userEvent.setup();
    renderForm();
    await name();
    await screen.findByText('Furniture');
    await user.click(screen.getAllByRole('button', { name: /^Clear selection/ })[0]!);
    await user.click(await screen.findByLabelText(/category/i));
    const list = await screen.findByRole('listbox');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Furniture',
      // A built-in category shows its translated name, not the stored one.
      'Other',
    ]);

    // The company is a text picker now: no <select>, the list loads from the search.
    expect((await screen.findByLabelText(/company/i)).tagName).toBe('INPUT');
    await user.click(await screen.findByLabelText(/company/i));
    expect(await screen.findByRole('option', { name: 'Acme Supply' })).toBeInTheDocument();
    expect(mockFetchVendors).toHaveBeenCalledWith(
      { pageSize: 50 },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('sends the typed text to the company search', async () => {
    const user = userEvent.setup();
    renderForm();
    await name();

    await user.type(await screen.findByLabelText(/company/i), 'acm');

    await waitFor(() =>
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'acm', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('defaults the category to the first option and the form stays clean', async () => {
    renderForm();
    expect(await screen.findByText('Furniture')).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  describe('pre-fill', () => {
    it('pre-selects a known area and company, showing the company name', async () => {
      renderForm('?areaId=a1&companyId=v1');
      expect(await screen.findByText('Acme Supply')).toBeInTheDocument();
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: /^Clear selection/ }).length,
      ).toBeGreaterThanOrEqual(2);
    });

    async function submitNamed(user: ReturnType<typeof userEvent.setup>) {
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      await name();
      await screen.findByText('Furniture');
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      await user.click(save());
      await waitFor(() => expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1));
    }

    it('looks up an unknown pre-filled company, finds none, drops the id and never posts it', async () => {
      const user = userEvent.setup();
      renderForm('?companyId=gone');

      await submitNamed(user);

      expect(mockFetchVendor).toHaveBeenCalledWith('gone');
      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: null }),
      );
    });

    it('shows the load error, not a silent drop, when the lookup fails with a server error (only a 404 drops it)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockFetchVendor.mockRejectedValue(
          new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
        );
        renderForm('?companyId=gone');

        expect(
          await screen.findByText('Failed to load form data. Please try again.'),
        ).toBeInTheDocument();
        expect(mockFetchVendor).toHaveBeenCalledWith('gone');
        expect(document.body.textContent).not.toContain('RAW-SERVER-SENTINEL');
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        // nothing was posted: the company was neither dropped nor submitted
        expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('keeps a valid company beyond the first page, found by its own lookup, and posts it', async () => {
      const user = userEvent.setup();
      mockFetchVendor.mockResolvedValue({
        id: 'v-far',
        name: 'Far Away Co',
      } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.fetchVendor>>);
      renderForm('?companyId=v-far');

      expect(await screen.findByText('Far Away Co')).toBeInTheDocument();
      await submitNamed(user);

      expect(mockFetchVendor).toHaveBeenCalledWith('v-far');
      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: 'v-far' }),
      );
    });

    it('does not look up a company that is already in the first page', async () => {
      renderForm('?companyId=v1');
      await screen.findByText('Acme Supply');
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('does no lookup without a pre-filled company', async () => {
      renderForm();
      await name();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('clears nothing while the lookup is pending, and keeps the id when it succeeds later', async () => {
      let finish: (v: Awaited<ReturnType<typeof VendorsApiTypes.fetchVendor>>) => void = () => {};
      mockFetchVendor.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderForm('?companyId=v-far');
      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-far'));
      await act(async () => {
        await Promise.resolve();
      });
      // The form is still loading its options; the id has not been dropped.
      expect(screen.queryByText('Far Away Co')).not.toBeInTheDocument();

      await act(async () => {
        finish({ id: 'v-far', name: 'Far Away Co' } as unknown as Awaited<
          ReturnType<typeof VendorsApiTypes.fetchVendor>
        >);
      });

      expect(await screen.findByText('Far Away Co')).toBeInTheDocument();
    });
  });

  describe('company picker (#2213)', () => {
    async function pickCompany(user: ReturnType<typeof userEvent.setup>, text: string) {
      await name();
      await user.type(await screen.findByLabelText(/company/i), text);
    }

    it('selects a found company and posts its id', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      renderForm();
      await pickCompany(user, 'Acme');
      await user.click(await screen.findByRole('option', { name: 'Acme Supply' }));
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      await user.click(save());

      await waitFor(() => expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1));
      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: 'v1' }),
      );
    });

    it('posts no company when none was chosen', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      await user.click(save());

      await waitFor(() => expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1));
      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: null }),
      );
    });

    it('offers "New company ‹text›" when no result equals the text', async () => {
      const user = userEvent.setup();
      renderForm();
      await pickCompany(user, 'Brand New Co');

      expect(
        await screen.findByRole('option', { name: 'New company Brand New Co' }),
      ).toBeInTheDocument();
    });

    it('offers no create row when a result equals the text', async () => {
      const user = userEvent.setup();
      renderForm();
      await pickCompany(user, 'acme supply');

      await screen.findByRole('option', { name: 'Acme Supply' });
      expect(screen.queryByRole('option', { name: /^New company/ })).not.toBeInTheDocument();
    });

    it('continues in a child step with the typed name, then returns with the new company set', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      mockCreateVendor.mockResolvedValue({
        id: 'v-new',
        name: 'Brand New Co',
      } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.createVendor>>);
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      await pickCompany(user, 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));

      // The child step shows the company form with the typed name; the dialog does not stack.
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: 'New company' })).toBeInTheDocument();
      expect((await screen.findByTestId('company-name-input')) as HTMLInputElement).toHaveValue(
        'Brand New Co',
      );
      await user.click(save());

      await waitFor(() =>
        expect(mockCreateVendor).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Brand New Co', tradeId: null }),
        ),
      );
      // Back on the purchase step: the company shows its name and the typed purchase name stays.
      expect(await screen.findByText('Brand New Co')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'New purchase' })).toBeInTheDocument();
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Chair');
      expect(onCreated).not.toHaveBeenCalled();

      await user.click(save());
      await waitFor(() => expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1));
      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: 'v-new', name: 'Chair' }),
      );
    });

    it('selects nothing when the child step is cancelled', async () => {
      const user = userEvent.setup();
      renderForm();
      await pickCompany(user, 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));
      await screen.findByTestId('company-name-input');
      await user.click(screen.getByTestId('object-form-cancel'));

      expect(await screen.findByRole('dialog', { name: 'New purchase' })).toBeInTheDocument();
      expect(mockCreateVendor).not.toHaveBeenCalled();
      expect(screen.queryByText('Brand New Co')).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('requires a name', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.click(save());
      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    it('requires a category', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await screen.findByText('Furniture');
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await user.click(screen.getAllByRole('button', { name: /^Clear selection/ })[0]!);
      await user.click(save());
      expect(await screen.findByText('Choose a category.')).toBeInTheDocument();
      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    it('rejects a quantity below 1', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '0' } });
      await user.click(save());
      expect(await screen.findByText('Enter a whole number, 1 or more.')).toBeInTheDocument();
      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    it('rejects an empty quantity', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '' } });
      await user.click(save());
      expect(await screen.findByText('Enter a whole number, 1 or more.')).toBeInTheDocument();
    });

    it('rejects an actual delivery before the order date (inside More details)', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await user.click(screen.getByTestId('object-form-more'));
      fireEvent.change(screen.getByLabelText(/ordered on/i), { target: { value: '2026-03-10' } });
      fireEvent.change(screen.getByLabelText(/delivered on/i), {
        target: { value: '2026-03-01' },
      });
      await user.click(save());
      expect(
        await screen.findByText("The delivery date can't be before the order date."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/delivered on/i)).toHaveFocus();
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
        await screen.findByText("Latest delivery can't be before earliest delivery."),
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
        'Enter a name.',
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
      await screen.findByText('Acme Supply');
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
          incomplete: false,
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

  describe('quick create (#2254): Waits for, delivery window, scope', () => {
    const TASKS = {
      items: [
        { id: 'wi-1', title: 'Roof tiles', area: null },
        { id: 'wi-2', title: 'Wiring', area: null },
      ],
      pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
    };
    const MILESTONES = [
      { id: 9, title: 'Shell finished', targetDate: '2026-09-01' },
    ] as unknown as Awaited<ReturnType<typeof MilestonesApiTypes.listMilestones>>;

    const hiddenLabels = () => {
      const more = screen.getByTestId('object-form-more');
      const hidden = document.getElementById(more.getAttribute('aria-controls')!)!;
      return Array.from(hidden.querySelectorAll('label')).map((l) => l.textContent ?? '');
    };

    async function pick(user: ReturnType<typeof userEvent.setup>, ...titles: RegExp[]) {
      const multi = screen.getByTestId('purchase-form-waits-for');
      for (const title of titles) {
        await user.click(within(multi).getByRole('textbox'));
        await user.click(await screen.findByRole('option', { name: title }));
      }
      return multi;
    }

    beforeEach(() => {
      mockListWorkItems.mockReset();
      mockListMilestones.mockReset();
      mockCreateDep.mockReset();
      mockListWorkItems.mockResolvedValue(TASKS as never);
      mockListMilestones.mockResolvedValue(MILESTONES);
      mockCreateDep.mockResolvedValue({} as never);
    });

    it('shows Waits for and the delivery window up front; the rest waits under More details', async () => {
      renderForm();
      await name();
      expect(screen.getByTestId('purchase-form-waits-for')).toBeInTheDocument();
      const hidden = hiddenLabels();
      expect(hidden).toHaveLength(4);
      for (const label of ['Description', 'Product link', 'Ordered on', 'Delivered on']) {
        expect(hidden).toContain(label);
      }
      const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-field]'))
        .filter((el) => el.closest('[hidden]') === null)
        .map((el) => el.getAttribute('data-field'));
      expect(visible).toEqual([
        'name',
        'category',
        'status',
        'quantity',
        'area',
        'vendorId',
        'waitsFor',
        'earliestDeliveryDate',
        'latestDeliveryDate',
      ]);
      expect(screen.getByLabelText('Earliest delivery')).toBeVisible();
      expect(screen.getByLabelText('Latest delivery')).toBeVisible();
    });

    it('limits description to 5000, product link and name as documented', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.click(screen.getByTestId('object-form-more'));
      expect(screen.getByLabelText(/^name/i)).toHaveAttribute('maxlength', '500');
      expect(screen.getByLabelText(/description/i)).toHaveAttribute('maxlength', '5000');
      expect(screen.getByLabelText(/product link/i)).toHaveAttribute('maxlength', '2000');
    });

    it('creates one finish-to-start dependency per choice (a task and a milestone)', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await pick(user, /Roof tiles/, /Shell finished/);
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockCreateDep.mock.calls).toEqual([
        ['hi-1', { predecessorType: 'work_item', predecessorId: 'wi-1' }],
        ['hi-1', { predecessorType: 'milestone', predecessorId: '9' }],
      ]);
      expect(onCreated).toHaveBeenCalledWith({
        id: 'hi-1',
        href: '/project/household-items/hi-1',
        label: 'Sofa',
        incomplete: false,
      });
    });

    it('creates no dependency when nothing was chosen', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockCreateDep).not.toHaveBeenCalled();
    });

    it('keeps the purchase and names only the failed link in depError on the Timing tab', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      mockCreateDep.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error('cycle'));
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await pick(user, /Roof tiles/, /Shell finished/);
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated).toHaveBeenCalledWith({
        id: 'hi-1',
        href: routeUrl(
          'householdItem',
          { id: 'hi-1' },
          { tab: 'timing', depError: 'Shell finished' },
        ),
        label: 'Sofa',
        incomplete: true,
      });
      expect(onCreated.mock.calls[0]![0].href).toBe(
        '/project/household-items/hi-1?tab=timing&depError=Shell+finished',
      );
    });

    it('joins several failed titles with a comma', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      mockCreateDep.mockRejectedValue(new Error('cycle'));
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Sofa');
      await pick(user, /Roof tiles/, /Wiring/);
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated.mock.calls[0]![0]).toMatchObject({
        incomplete: true,
        href: routeUrl(
          'householdItem',
          { id: 'hi-1' },
          { tab: 'timing', depError: 'Roof tiles, Wiring' },
        ),
      });
    });

    it('skips a malformed Waits for value instead of posting it', async () => {
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      const view = renderHook(() => Form.usePurchaseFormSchema(), { wrapper: MemoryRouter });
      await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled());
      const outcome = await view.result.current.submit({
        name: 'Sofa',
        category: 'c',
        status: 'planned',
        quantity: '1',
        waitsFor: [{ id: 'garbage', label: 'Bad' }],
      });
      expect(mockCreateDep).not.toHaveBeenCalled();
      expect(outcome.incomplete).toBe(true);
      expect(outcome.href).toBe('/project/household-items/hi-1?tab=timing&depError=Bad');
    });

    it('treats a non-list Waits for value as no choices', async () => {
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      const view = renderHook(() => Form.usePurchaseFormSchema(), { wrapper: MemoryRouter });
      await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled());
      await view.result.current.submit({
        name: 'Sofa',
        category: 'c',
        status: 'planned',
        quantity: '1',
        waitsFor: 'nope',
      });
      expect(mockCreateDep).not.toHaveBeenCalled();
    });

    it('renders the Waits for picker empty for a non-list value', async () => {
      const view = renderHook(() => Form.usePurchaseFormSchema(), { wrapper: MemoryRouter });
      await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled());
      const field = view.result.current.fields.find((f) => f.name === 'waitsFor')!;
      render(
        <MemoryRouter>
          {field.render!({
            id: 'waitsFor',
            value: 'nope',
            setValue: jest.fn(),
            busy: false,
            invalid: false,
            describedBy: undefined,
            createChild: jest.fn(),
            setValues: jest.fn(),
            values: {},
          })}
        </MemoryRouter>,
      );
      expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    });

    it('rejects a fractional quantity with the whole-number message', async () => {
      const user = userEvent.setup();
      renderForm();
      await name();
      await user.type(screen.getByLabelText(/^name/i), 'Chair');
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '1.5' } });
      await user.click(save());
      expect(await screen.findByText('Enter a whole number, 1 or more.')).toBeInTheDocument();
      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    describe('scopes', () => {
      const names = (fields: readonly { name: string }[]) => fields.map((f) => f.name);

      it('create scope has every field', async () => {
        const view = renderHook(() => Form.usePurchaseFormSchema(), { wrapper: MemoryRouter });
        await act(async () => {});
        expect(names(view.result.current.fields)).toEqual([
          'name',
          'category',
          'status',
          'quantity',
          'area',
          'vendorId',
          'waitsFor',
          'earliestDeliveryDate',
          'latestDeliveryDate',
          'description',
          'url',
          'orderDate',
          'actualDeliveryDate',
        ]);
      });

      it('edit scope drops status and waitsFor, never loads companies, still loads categories', async () => {
        const view = renderHook(() => Form.usePurchaseFormSchema({ scope: 'edit' }), {
          wrapper: MemoryRouter,
        });
        await waitFor(() => expect(mockFetchCategories).toHaveBeenCalledTimes(1));
        await act(async () => {});
        const all = names(view.result.current.fields);
        expect(all).not.toContain('status');
        expect(all).not.toContain('waitsFor');
        expect(all).toContain('earliestDeliveryDate');
        expect(mockFetchVendors).not.toHaveBeenCalled();
        const vendor = view.result.current.fields.find((f) => f.name === 'vendorId')!;
        expect(vendor.options).toBeUndefined();
      });

      it('edit scope shows the known company name and offers no "New company"', async () => {
        const user = userEvent.setup();
        const view = renderHook(
          () =>
            Form.usePurchaseFormSchema({
              scope: 'edit',
              knownCompany: { id: 'v9', name: 'Known Supplies' },
            }),
          { wrapper: MemoryRouter },
        );
        await act(async () => {});
        const vendor = view.result.current.fields.find((f) => f.name === 'vendorId')!;
        render(
          <MemoryRouter>
            {vendor.render!({
              id: 'vendorId',
              value: 'v9',
              setValue: jest.fn(),
              busy: false,
              invalid: false,
              describedBy: undefined,
              createChild: jest.fn(),
              setValues: jest.fn(),
              values: {},
            })}
          </MemoryRouter>,
        );
        expect(await screen.findByText('Known Supplies')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /^Clear selection/ }));
        await user.type(screen.getByRole('textbox'), 'Fresh');
        await waitFor(() => expect(mockFetchVendors).toHaveBeenCalled());
        expect(screen.queryByRole('option', { name: /new company/i })).toBeNull();
      });
    });

    describe('validatePurchaseValues', () => {
      const messages = () => renderHook(() => Form.usePurchaseValueMessages()).result.current;

      it('has the dialog copy', () => {
        expect(messages()).toEqual({
          name: 'Enter a name.',
          category: 'Choose a category.',
          quantity: 'Enter a whole number, 1 or more.',
          deliveryDates: enHouseholdItems.create.form.deliveryDates.error,
          deliveryWindow: "Latest delivery can't be before earliest delivery.",
        });
      });

      it('accepts whole quantities of 1 or more only', () => {
        const m = messages();
        const check = (quantity: string) =>
          Form.validatePurchaseValues({ name: 'x', category: 'c', quantity }, m).quantity;
        expect(check('1')).toBeUndefined();
        expect(check('12')).toBeUndefined();
        expect(check('0')).toBe(m.quantity);
        expect(check('-2')).toBe(m.quantity);
        expect(check('1.5')).toBe(m.quantity);
        expect(check('')).toBe(m.quantity);
        expect(check('abc')).toBe(m.quantity);
      });

      it('flags a latest delivery before the earliest and a delivery before the order date', () => {
        const m = messages();
        const base = { name: 'x', category: 'c', quantity: '1' };
        expect(
          Form.validatePurchaseValues(
            { ...base, earliestDeliveryDate: '2026-05-02', latestDeliveryDate: '2026-05-01' },
            m,
          ),
        ).toEqual({ latestDeliveryDate: m.deliveryWindow });
        expect(
          Form.validatePurchaseValues(
            { ...base, orderDate: '2026-05-02', actualDeliveryDate: '2026-05-01' },
            m,
          ),
        ).toEqual({ actualDeliveryDate: m.deliveryDates });
      });

      it('treats a whitespace-only name and a missing category as missing', () => {
        const m = messages();
        expect(Form.validatePurchaseValues({ name: '  ', quantity: '1' }, m)).toEqual({
          name: m.name,
          category: m.category,
        });
      });
    });
  });

  describe('reference-data loading (#2254)', () => {
    it('loads categories and areas by default (the create dialog)', async () => {
      renderHook(() => Form.usePurchaseFormSchema(), { wrapper: MemoryRouter });
      await waitFor(() => expect(mockFetchCategories).toHaveBeenCalledTimes(1));
      expect(mockUseAreas).toHaveBeenCalledWith({ enabled: true });
    });

    it('requests neither categories nor areas when the card opts out of both', async () => {
      mockUseAreas.mockClear();
      const view = renderHook(
        () =>
          Form.usePurchaseFormSchema({
            scope: 'edit',
            load: { areas: false, categories: false },
          }),
        { wrapper: MemoryRouter },
      );
      await act(async () => {});
      expect(mockFetchCategories).not.toHaveBeenCalled();
      expect(mockUseAreas.mock.calls.every(([options]) => options?.enabled === false)).toBe(true);
      const category = view.result.current.fields.find((f) => f.name === 'category');
      expect(category).toBeDefined();
    });

    it('loads only the categories when just the areas are skipped', async () => {
      mockUseAreas.mockClear();
      renderHook(() => Form.usePurchaseFormSchema({ scope: 'edit', load: { areas: false } }), {
        wrapper: MemoryRouter,
      });
      await waitFor(() => expect(mockFetchCategories).toHaveBeenCalledTimes(1));
      expect(mockUseAreas.mock.calls.every(([options]) => options?.enabled === false)).toBe(true);
    });
  });

  describe('schema (called directly)', () => {
    const schema = async () => {
      const view = renderHook(() => Form.usePurchaseFormSchema(), { wrapper: MemoryRouter });
      await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled());
      return view.result;
    };

    it('reports every missing required field for an empty value set', async () => {
      const result = await schema();

      expect(result.current.validate({})).toEqual({
        name: 'Enter a name.',
        category: 'Choose a category.',
        quantity: 'Enter a whole number, 1 or more.',
      });
    });

    it('submits the minimal value set with every optional field normalised to null or undefined', async () => {
      mockCreateHouseholdItem.mockResolvedValue(CREATED);
      const result = await schema();

      const outcome = await result.current.submit({
        name: ' Lamp ',
        category: 'hic-lighting',
        status: 'planned',
        quantity: '2',
      });

      expect(mockCreateHouseholdItem).toHaveBeenCalledWith({
        name: 'Lamp',
        description: null,
        category: 'hic-lighting',
        status: 'planned',
        quantity: 2,
        areaId: null,
        vendorId: null,
        url: null,
        orderDate: null,
        earliestDeliveryDate: undefined,
        latestDeliveryDate: undefined,
        actualDeliveryDate: null,
      });
      expect(outcome).toEqual({
        id: 'hi-1',
        href: '/project/household-items/hi-1',
        label: 'Lamp',
        incomplete: false,
      });
    });

    it.each(['category', 'vendorId'])(
      'renders the %s picker empty when its value is not text',
      async (field) => {
        const result = await schema();
        const definition = result.current.fields.find((f) => f.name === field);
        if (definition?.kind !== 'custom' || !definition.render) {
          throw new Error('expected a custom field');
        }

        render(
          <MemoryRouter>
            {definition.render({
              id: field,
              value: undefined,
              setValue: jest.fn(),
              busy: false,
              invalid: false,
              describedBy: undefined,
              createChild: jest.fn(),
              setValues: jest.fn(),
              values: {},
            })}
          </MemoryRouter>,
        );

        expect(screen.getByRole('textbox')).toHaveValue('');
      },
    );

    it('accepts equal delivery dates and an in-order delivery window', async () => {
      const result = await schema();

      expect(
        result.current.validate({
          name: 'Lamp',
          category: 'c',
          quantity: '1',
          orderDate: '2026-03-01',
          actualDeliveryDate: '2026-03-01',
          earliestDeliveryDate: '2026-03-02',
          latestDeliveryDate: '2026-03-02',
        }),
      ).toEqual({});
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

    it('ignores a late success after unmount (no state update, nothing logged)', async () => {
      let resolveVendors!: (value: never) => void;
      mockFetchVendors.mockReturnValue(new Promise((resolve) => (resolveVendors = resolve)));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderForm();
      unmount();

      await act(async () => {
        resolveVendors({ vendors: [], pagination: {} } as never);
      });

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('ignores a late company lookup after unmount', async () => {
      let resolveVendor!: (value: never) => void;
      mockFetchVendor.mockReturnValue(new Promise((resolve) => (resolveVendor = resolve)));
      const { unmount } = renderForm('?companyId=v-far');
      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-far'));
      unmount();

      await act(async () => {
        resolveVendor({ id: 'v-far', name: 'Far Away Co' } as never);
      });

      expect(screen.queryByText('Far Away Co')).toBeNull();
    });

    it('ignores a late company lookup failure after unmount', async () => {
      let rejectVendor!: (error: Error) => void;
      mockFetchVendor.mockReturnValue(new Promise((_r, reject) => (rejectVendor = reject)));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderForm('?companyId=v-far');
      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalled());
      unmount();

      await act(async () => {
        rejectVendor(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
      });

      expect(spy).not.toHaveBeenCalled();
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
