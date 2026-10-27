/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type {
  AreaResponse,
  SearchGroup,
  SearchResponse,
  SearchResultItem,
  UserResponse,
  VendorListItem,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { CompanyCreateContext } from '../../objectForms/companyCreateContext.js';
import type { RequestCompanyCreate } from '../../objectForms/companyCreateContext.js';
import { TagCreateContext } from '../../objectForms/tagCreateContext.js';
import type { CreatedTag, RequestTagCreate } from '../../objectForms/tagCreateContext.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as OrientationApiTypes from '../../lib/orientationApi.js';
import type * as TradesApiTypes from '../../lib/tradesApi.js';
import type * as CategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as DocumentLinksApiTypes from '../../lib/documentLinksApi.js';
import type * as PickerModule from './EntityPicker.js';
import type * as KindsModule from './entityPickerKinds.js';
import type { EntityOption, EntityPickerProps } from './types.js';

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockFetchOrientations = jest.fn<typeof OrientationApiTypes.fetchOrientations>();
const mockFetchTrades = jest.fn<typeof TradesApiTypes.fetchTrades>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListPaperlessDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
const mockListAllLinkedDocumentIds =
  jest.fn<typeof DocumentLinksApiTypes.listAllLinkedDocumentIds>();

// The picker formats document dates, so it reads the locale.
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
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  listPaperlessDocuments: mockListPaperlessDocuments,
}));
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listAllLinkedDocumentIds: mockListAllLinkedDocumentIds,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../lib/orientationApi.js', () => ({
  fetchOrientations: mockFetchOrientations,
}));
jest.unstable_mockModule('../../lib/tradesApi.js', () => ({ fetchTrades: mockFetchTrades }));
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));

// ---- fixtures (synthetic) ----

function company(id: string, name: string, trade: VendorListItem['trade'] = null): VendorListItem {
  return { id, name, trade } as VendorListItem;
}

const ROOFING = {
  id: 't-1',
  name: 'Roofing',
  color: null,
  translationKey: 'trades.roofing',
} as VendorListItem['trade'];

function member(id: string, displayName: string, deactivatedAt?: string): UserResponse {
  return {
    id,
    email: `${id}@example.com`,
    displayName,
    role: 'member',
    authProvider: 'local',
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00Z',
    ...(deactivatedAt ? { deactivatedAt } : {}),
  } as UserResponse;
}

const USERS = [
  member('u-1', 'Zoë Keller'),
  member('u-2', 'Ben Albrecht'),
  member('u-3', 'Old Timer', '2024-06-01T00:00:00Z'),
];

function areaOf(id: string, name: string, parentId: string | null = null): AreaResponse {
  return { id, name, parentId, sortOrder: 0 } as AreaResponse;
}

const AREAS = [
  areaOf('a-1', 'Ground floor'),
  areaOf('a-2', 'Hallway', 'a-1'),
  areaOf('a-3', 'Kitchen', 'a-1'),
  areaOf('a-4', 'Garden'),
];

function hit(
  id: string,
  label: string | null,
  areaPath: { id: string; name: string }[] | null = null,
): SearchResultItem {
  return {
    id,
    label,
    sublabel: null,
    matchedField: 'name',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath,
    parent: null,
  };
}

function searchResponse(groups: Partial<SearchGroup>[]): SearchResponse {
  return {
    query: 'q',
    groups: groups.map((g) => ({ total: 0, status: 'ok', items: [], ...g })) as SearchGroup[],
  };
}

const HALLWAY_HIT = searchResponse([
  {
    type: 'area',
    items: [
      hit('a-2', 'Hallway', [
        { id: 'a-1', name: 'Ground floor' },
        { id: 'a-2', name: 'Hallway' },
      ]),
      hit('a-4', 'Garden hall', [{ id: 'a-4', name: 'Garden hall' }]),
    ],
  },
]);

const listOf = (vendors: VendorListItem[]) =>
  vendors as Awaited<ReturnType<typeof VendorsApiTypes.searchCompanies>>;

// ---- harness ----

type HarnessProps = Partial<EntityPickerProps> & {
  kind: EntityPickerProps['kind'];
  initial?: string;
  onChangeSpy?: (value: string, option: EntityOption | null) => void;
  companyCreate?: RequestCompanyCreate | null;
  tagCreate?: RequestTagCreate | null;
};

describe('EntityPicker', () => {
  let Module: typeof PickerModule;
  let Kinds: typeof KindsModule;
  const onChange = jest.fn<(value: string, option: EntityOption | null) => void>();
  const requestCompany = jest.fn<RequestCompanyCreate>();
  const requestTag = jest.fn<RequestTagCreate>();

  beforeEach(async () => {
    for (const mock of [
      mockSearchCompanies,
      mockFetchVendor,
      mockSearchEverywhere,
      mockFetchOrientations,
      mockFetchTrades,
      mockFetchCategories,
      mockListWorkItems,
      mockListPaperlessDocuments,
      mockListAllLinkedDocumentIds,
      onChange,
      requestCompany,
      requestTag,
    ]) {
      mock.mockReset();
    }
    mockSearchCompanies.mockResolvedValue(
      listOf([company('v-1', 'Acme Roofing', ROOFING), company('v-2', 'Birch Tiling')]),
    );
    mockFetchVendor.mockResolvedValue({ id: 'v-9', name: 'Saved Co' } as never);
    mockSearchEverywhere.mockResolvedValue(searchResponse([]));
    mockFetchOrientations.mockResolvedValue({ orientations: [] } as never);
    mockFetchTrades.mockResolvedValue({ trades: [] } as never);
    mockFetchCategories.mockResolvedValue({ categories: [] } as never);
    mockListWorkItems.mockResolvedValue({ items: [] } as never);
    mockListPaperlessDocuments.mockResolvedValue({ documents: [] } as never);
    mockListAllLinkedDocumentIds.mockResolvedValue([]);
    if (!Module) {
      Module = await import('./EntityPicker.js');
      Kinds = await import('./entityPickerKinds.js');
    }
  });

  function Harness({
    initial = '',
    onChangeSpy,
    companyCreate = null,
    tagCreate = null,
    ...rest
  }: HarnessProps) {
    const [value, setValue] = useState(initial);
    return (
      <CompanyCreateContext value={companyCreate}>
        <TagCreateContext value={tagCreate}>
          <Module.EntityPicker
            {...(rest as EntityPickerProps)}
            value={value}
            onChange={(next, option) => {
              // An add-mode host (clearOnSelect) consumes the pick and keeps the field empty.
              setValue(rest.clearOnSelect ? '' : next);
              onChange(next, option);
              onChangeSpy?.(next, option);
            }}
          />
        </TagCreateContext>
      </CompanyCreateContext>
    );
  }

  const input = () => screen.getByRole('textbox');
  const optionNames = async () =>
    (await screen.findAllByRole('option')).map((option) => option.textContent);

  // ---- company ----

  describe('company', () => {
    it('lists the first companies on focus with the translated trade as the second line', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" />);

      await user.click(input());

      expect(await optionNames()).toEqual(['Acme RoofingRoofing', 'Birch Tiling']);
      expect(mockSearchCompanies).toHaveBeenCalledWith('', expect.any(AbortSignal));
    });

    it('sends the typed text to the server search', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" />);

      await user.type(input(), 'bir');

      await waitFor(() =>
        expect(mockSearchCompanies).toHaveBeenLastCalledWith('bir', expect.any(AbortSignal)),
      );
    });

    it('reports the picked id together with the option and shows its name', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));

      expect(onChange).toHaveBeenCalledWith(
        'v-2',
        expect.objectContaining({ id: 'v-2', label: 'Birch Tiling', entityId: 'v-2' }),
      );
      expect(screen.getByText('Birch Tiling')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('clearing reports an empty value and no option, and shows the input again', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" />);
      await user.click(input());
      await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));

      await user.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(onChange).toHaveBeenLastCalledWith('', null);
      expect(await screen.findByRole('textbox')).toBeInTheDocument();
    });

    it('leaves out the excluded ids', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" excludeIds={['v-1']} />);

      await user.click(input());

      expect(await optionNames()).toEqual(['Birch Tiling']);
    });

    it('uses the default placeholder, a custom one, the id and the aria props', () => {
      const { unmount } = render(<Harness kind="company" id="who-co" />);
      expect(input()).toHaveAttribute('placeholder', 'Search companies');
      expect(input()).toHaveAttribute('id', 'who-co');
      unmount();

      render(
        <Harness
          kind="company"
          placeholder="Pick one"
          inputAriaProps={{ 'aria-invalid': true, 'aria-describedby': 'err' }}
        />,
      );
      expect(input()).toHaveAttribute('placeholder', 'Pick one');
      expect(input()).toHaveAttribute('aria-invalid', 'true');
      expect(input()).toHaveAttribute('aria-describedby', 'err');
    });

    it('can be disabled', () => {
      render(<Harness kind="company" disabled />);
      expect(input()).toBeDisabled();
    });

    it('takes a generated id when the host passes none', () => {
      render(<Harness kind="company" />);
      expect(input().id).not.toBe('');
    });

    it('puts the data-testid of getOptionTestId on every option', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" getOptionTestId={(o) => `opt-${o.id}`} />);

      await user.click(input());

      expect(await screen.findByTestId('opt-v-1')).toBeInTheDocument();
      expect(screen.getByTestId('opt-v-2')).toBeInTheDocument();
    });

    it('add mode: a pick is reported, the input stays, empty and focused', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" clearOnSelect />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));

      expect(onChange).toHaveBeenCalledWith('v-2', expect.objectContaining({ id: 'v-2' }));
      // The harness stores the value, but the picker stays in add mode: input back, empty.
      await waitFor(() => expect(input()).toHaveValue(''));
      expect(input()).toHaveFocus();
    });

    it('focuses the input when asked to', async () => {
      render(<Harness kind="company" autoFocus />);
      await waitFor(() => expect(input()).toHaveFocus());
    });

    it('shows the host emptyHint when there is nothing to list', async () => {
      const user = userEvent.setup();
      mockSearchCompanies.mockResolvedValue([]);
      render(<Harness kind="company" emptyHint="Add a company in Settings" />);

      await user.click(input());

      expect(await screen.findByText('Add a company in Settings')).toBeInTheDocument();
    });

    it('reports a failing search in the list', async () => {
      const user = userEvent.setup();
      mockSearchCompanies.mockRejectedValue(new Error('down'));
      render(<Harness kind="company" />);

      await user.click(input());

      expect(await screen.findByText('Failed to load items')).toBeInTheDocument();
    });
  });

  describe('company: preselected value', () => {
    it('shows the host label without any lookup', () => {
      render(<Harness kind="company" initial="v-9" selectedLabel="Host Co" />);

      expect(screen.getByText('Host Co')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('shows a known company without any lookup', () => {
      render(
        <Harness kind="company" initial="v-9" knownCompany={{ id: 'v-9', name: 'Known Co' }} />,
      );

      expect(screen.getByText('Known Co')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('looks a saved company up by id and shows its name', async () => {
      render(<Harness kind="company" initial="v-9" />);

      expect(await screen.findByText('Saved Co')).toBeInTheDocument();
      expect(mockFetchVendor).toHaveBeenCalledWith('v-9');
    });

    it('is disabled while the company is being looked up', async () => {
      let resolve!: (vendor: never) => void;
      mockFetchVendor.mockReturnValue(new Promise((r) => (resolve = r as typeof resolve)));
      render(<Harness kind="company" initial="v-9" />);

      expect(input()).toBeDisabled();

      await act(async () => {
        resolve({ id: 'v-9', name: 'Saved Co' } as never);
      });
      expect(await screen.findByText('Saved Co')).toBeInTheDocument();
    });

    it('reports the lookup start and end through onResolvingChange', async () => {
      const resolving = jest.fn<(resolving: boolean) => void>();
      let resolve!: (vendor: never) => void;
      mockFetchVendor.mockReturnValue(new Promise((r) => (resolve = r as typeof resolve)));
      render(<Harness kind="company" initial="v-9" onResolvingChange={resolving} />);

      await waitFor(() => expect(resolving).toHaveBeenLastCalledWith(true));
      await act(async () => {
        resolve({ id: 'v-9', name: 'Saved Co' } as never);
      });

      await waitFor(() => expect(resolving).toHaveBeenLastCalledWith(false));
      expect(resolving.mock.calls.map((c) => c[0])).toEqual([true, false]);
    });

    it('reports false without a lookup when the label is known', () => {
      const resolving = jest.fn<(resolving: boolean) => void>();
      render(
        <Harness kind="company" initial="v-9" selectedLabel="Host" onResolvingChange={resolving} />,
      );

      expect(resolving.mock.calls.map((c) => c[0])).toEqual([false]);
    });

    it('ends the lookup report when the company turns out not to exist (404)', async () => {
      const resolving = jest.fn<(resolving: boolean) => void>();
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      render(<Harness kind="company" initial="v-gone" onResolvingChange={resolving} />);

      await waitFor(() => expect(resolving).toHaveBeenLastCalledWith(false));
      expect(resolving.mock.calls.map((c) => c[0])).toEqual([true, false]);
    });

    it('tells the host once when the company no longer exists and keeps the value', async () => {
      const onUnknownCompany = jest.fn();
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      render(<Harness kind="company" initial="v-gone" onUnknownCompany={onUnknownCompany} />);

      await waitFor(() => expect(onUnknownCompany).toHaveBeenCalledTimes(1));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not tell the host about a failed lookup that is not a 404', async () => {
      const onUnknownCompany = jest.fn();
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      render(<Harness kind="company" initial="v-9" onUnknownCompany={onUnknownCompany} />);

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalled());
      await waitFor(() => expect(input()).not.toBeDisabled());
      expect(onUnknownCompany).not.toHaveBeenCalled();
    });
  });

  describe('company: special options', () => {
    it('adds a "none" row whose value is empty and reports no option', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" noneLabel="No company" />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'No company' }));

      expect(onChange).toHaveBeenCalledWith('', null);
    });

    it('offers host special options that bypass excludeIds and report no option', async () => {
      const user = userEvent.setup();
      render(
        <Harness
          kind="company"
          excludeIds={['__other__']}
          specialOptions={[{ id: '__other__', label: 'Other…' }]}
          noneLabel="No company"
        />,
      );

      await user.click(input());
      expect(await screen.findByRole('option', { name: 'Other…' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'No company' })).toBeInTheDocument();
      await user.click(screen.getByRole('option', { name: 'Other…' }));

      expect(onChange).toHaveBeenCalledWith('__other__', null);
    });
  });

  describe('company: create row', () => {
    it('offers "New company ‹text›" through the company provider and selects what it returns', async () => {
      const user = userEvent.setup();
      requestCompany.mockResolvedValue({ id: 'v-new', name: 'Fresh Co' });
      render(<Harness kind="company" companyCreate={requestCompany} />);

      await user.type(input(), 'Fresh Co');
      await user.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

      expect(requestCompany).toHaveBeenCalledWith('Fresh Co');
      expect(onChange).toHaveBeenCalledWith('v-new', {
        id: 'v-new',
        label: 'Fresh Co',
        entityId: 'v-new',
      });
      expect(await screen.findByText('Fresh Co')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('selects nothing and returns focus to the input when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      requestCompany.mockResolvedValue(null);
      render(<Harness kind="company" companyCreate={requestCompany} />);

      await user.type(input(), 'Fresh Co');
      await user.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

      await waitFor(() => expect(requestCompany).toHaveBeenCalled());
      expect(onChange).not.toHaveBeenCalled();
      await waitFor(() => expect(input()).toHaveFocus());
    });

    it('offers no row outside a company provider', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" />);

      await user.type(input(), 'Fresh Co');
      await screen.findAllByRole('option');

      expect(screen.queryByRole('option', { name: /New company/ })).toBeNull();
    });

    it("offers no row when create is 'off'", async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" companyCreate={requestCompany} create="off" />);

      await user.type(input(), 'Fresh Co');
      await screen.findAllByRole('option');

      expect(screen.queryByRole('option', { name: /New company/ })).toBeNull();
    });

    it('hides the row when the typed text equals an existing name (case and umlaut folded)', async () => {
      const user = userEvent.setup();
      render(<Harness kind="company" companyCreate={requestCompany} />);

      await user.type(input(), 'BIRCH tiling');
      await screen.findByRole('option', { name: /Birch Tiling/ });

      expect(screen.queryByRole('option', { name: /New company/ })).toBeNull();
    });

    it('reports the dialog being open and closed through onCreatingChange', async () => {
      const user = userEvent.setup();
      const creating = jest.fn<(creating: boolean) => void>();
      let finish!: (company: { id: string; name: string } | null) => void;
      requestCompany.mockImplementation(() => new Promise((r) => (finish = r)));
      render(<Harness kind="company" companyCreate={requestCompany} onCreatingChange={creating} />);
      expect(creating).toHaveBeenLastCalledWith(false);

      await user.type(input(), 'Fresh Co');
      await user.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));
      await waitFor(() => expect(creating).toHaveBeenLastCalledWith(true));

      await act(async () => finish(null));
      await waitFor(() => expect(creating).toHaveBeenLastCalledWith(false));
    });
  });

  describe('create: host function and object forms', () => {
    it('a host function replaces the provider; what it returns is selected', async () => {
      const user = userEvent.setup();
      const create = jest.fn<(query: string) => Promise<EntityOption | null>>();
      create.mockResolvedValue({ id: 'v-child', label: 'Child Co' });
      render(<Harness kind="company" companyCreate={requestCompany} create={create} />);

      await user.type(input(), 'Child Co');
      await user.click(await screen.findByRole('option', { name: 'New company Child Co' }));

      expect(create).toHaveBeenCalledWith('Child Co');
      expect(requestCompany).not.toHaveBeenCalled();
      expect(await screen.findByText('Child Co')).toBeInTheDocument();
    });

    it('onChange receives the option a host function returned', async () => {
      const user = userEvent.setup();
      const created: EntityOption = { id: 'v-child', label: 'Child Co', entityId: 'v-child' };
      render(<Harness kind="company" create={() => Promise.resolve(created)} />);

      await user.type(input(), 'Child Co');
      await user.click(await screen.findByRole('option', { name: 'New company Child Co' }));

      await waitFor(() => expect(onChange).toHaveBeenCalled());
      expect(onChange).toHaveBeenCalledWith('v-child', created);
    });

    it('a host function that opens a child step and resolves null selects nothing', async () => {
      const user = userEvent.setup();
      const create = jest.fn<(query: string) => Promise<EntityOption | null>>();
      create.mockResolvedValue(null);
      render(<Harness kind="who" users={USERS} create={create} />);

      await user.type(input(), 'Child Co');
      await user.click(await screen.findByRole('option', { name: 'New company Child Co' }));

      await waitFor(() => expect(create).toHaveBeenCalledWith('Child Co'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('labels a host function row by its kind (area, trade, category, orientation)', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(searchResponse([]));
      render(<Harness kind="area" areas={AREAS} create={() => Promise.resolve(null)} />);

      await user.type(input(), 'Cellar');

      expect(await screen.findByRole('option', { name: 'New area Cellar' })).toBeInTheDocument();
    });

    it('an object form uses its own label and offers the row on an empty field with showWhenEmpty', async () => {
      const user = userEvent.setup();
      const onCreate = jest.fn<(query: string) => Promise<EntityOption | null>>();
      onCreate.mockResolvedValue({ id: 'v-x', label: 'Made here', entityId: 'v-x' });
      render(
        <Harness
          kind="company"
          create={{
            getLabel: (query) => (query ? `Make "${query}"` : 'Make a company'),
            onCreate,
            showWhenEmpty: true,
          }}
        />,
      );

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'Make a company' }));

      expect(onCreate).toHaveBeenCalledWith('');
      expect(onChange.mock.calls[0]?.[0]).toBe('v-x');
      expect(await screen.findByText('Made here')).toBeInTheDocument();
    });

    it('onChange receives the option an object-form create returned', async () => {
      const user = userEvent.setup();
      const created: EntityOption = { id: 'v-x', label: 'Made here', entityId: 'v-x' };
      render(
        <Harness
          kind="company"
          create={{
            getLabel: () => 'Make a company',
            onCreate: () => Promise.resolve(created),
            showWhenEmpty: true,
          }}
        />,
      );

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'Make a company' }));

      await waitFor(() => expect(onChange).toHaveBeenCalled());
      expect(onChange).toHaveBeenCalledWith('v-x', created);
    });

    it("an object form honours show: 'always' even when the text matches an existing name", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          kind="company"
          create={{
            getLabel: (query) => `Add ${query}`,
            onCreate: () => Promise.resolve(null),
            show: 'always',
          }}
        />,
      );

      await user.type(input(), 'Birch Tiling');
      await screen.findByRole('option', { name: 'Birch Tiling' });

      expect(screen.getByRole('option', { name: 'Add Birch Tiling' })).toBeInTheDocument();
    });

    it('offers no create row for the task kinds, whatever create says', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockResolvedValue({
        items: [{ id: 'w-1', title: 'Lay floors', status: 'in_progress', area: null }],
      } as never);
      render(
        <Harness kind="task" create={() => Promise.resolve(null)} companyCreate={requestCompany} />,
      );

      await user.click(input());
      await screen.findByRole('option', { name: /Lay floors/ });

      expect(screen.queryByRole('option', { name: /New/ })).toBeNull();
    });
  });

  // ---- who ----

  describe('who', () => {
    it('groups the options: Companies first, then Household members, as labelled groups', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} />);

      await user.click(input());
      await screen.findAllByRole('option');

      const groups = screen.getAllByRole('group');
      expect(
        groups.map((g) => within(g).getByText(/Companies|Household members/).textContent),
      ).toEqual(['Companies', 'Household members']);
      expect(groups[0]).toHaveAccessibleName('Companies');
      expect(groups[1]).toHaveAccessibleName('Household members');
      expect(
        within(groups[0]!)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Acme RoofingRoofing', 'Birch Tiling']);
      expect(
        within(groups[1]!)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Zoë Keller', 'Ben Albrecht']);
    });

    it('never lists a deactivated member', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} />);

      await user.click(input());
      await screen.findAllByRole('option');

      expect(screen.queryByRole('option', { name: /Old Timer/ })).toBeNull();
    });

    it('filters members with folding and sends the text to the company search', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} />);

      await user.type(input(), 'zoe');

      await waitFor(() =>
        expect(mockSearchCompanies).toHaveBeenLastCalledWith('zoe', expect.any(AbortSignal)),
      );
      await waitFor(() =>
        expect(screen.queryByRole('option', { name: 'Ben Albrecht' })).toBeNull(),
      );
      expect(screen.getByRole('option', { name: 'Zoë Keller' })).toBeInTheDocument();
    });

    it('ArrowDown from the input lands on the first company option, never on a heading', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} />);
      await user.click(input());
      await screen.findAllByRole('option');

      await user.keyboard('{ArrowDown}');

      expect(document.activeElement).toBe(screen.getByRole('option', { name: /Acme Roofing/ }));
      await user.keyboard('{ArrowDown}{ArrowDown}');
      // Past the last company the focus goes straight to the first member, not to the heading.
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Zoë Keller' }));
    });

    it('encodes a member pick as member:<id> and shows the kind after the name', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'Zoë Keller' }));

      expect(onChange).toHaveBeenCalledWith(
        'member:u-1',
        expect.objectContaining({ id: 'member:u-1', group: 'member', entityId: 'u-1' }),
      );
      expect(screen.getByText('Zoë Keller')).toBeInTheDocument();
      expect(screen.getByText('Household member')).toBeInTheDocument();
    });

    it('encodes a company pick as company:<id> and shows "Company" after the name', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));

      expect(onChange).toHaveBeenCalledWith(
        'company:v-2',
        expect.objectContaining({ id: 'company:v-2', group: 'company', entityId: 'v-2' }),
      );
      expect(screen.getByText('Company')).toBeInTheDocument();
    });

    it('a pick replaces the previous value whichever group it came from: a member after a company leaves member: only', async () => {
      const user = userEvent.setup();
      const values: string[] = [];
      render(<Harness kind="who" users={USERS} onChangeSpy={(value) => values.push(value)} />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      await user.click(await screen.findByRole('textbox'));
      await user.click(await screen.findByRole('option', { name: 'Ben Albrecht' }));

      expect(values).toEqual(['company:v-2', '', 'member:u-2']);
      const final = Kinds.decodeWho(values.at(-1)!);
      expect(final).toEqual({ userId: 'u-2', vendorId: undefined });
      expect(screen.getByText('Household member')).toBeInTheDocument();
      expect(screen.queryByText('Company')).toBeNull();
    });

    it('a pick replaces the previous value whichever group it came from: a company after a member leaves company: only', async () => {
      const user = userEvent.setup();
      const values: string[] = [];
      render(<Harness kind="who" users={USERS} onChangeSpy={(value) => values.push(value)} />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'Zoë Keller' }));
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      await user.click(await screen.findByRole('textbox'));
      await user.click(await screen.findByRole('option', { name: /Acme Roofing/ }));

      expect(values).toEqual(['member:u-1', '', 'company:v-1']);
      expect(Kinds.decodeWho(values.at(-1)!)).toEqual({
        userId: undefined,
        vendorId: 'v-1',
      });
      expect(screen.getByText('Company')).toBeInTheDocument();
      expect(screen.queryByText('Household member')).toBeNull();
    });

    it('holds one value: every value the control emits decodes to exactly one of member or company', async () => {
      const user = userEvent.setup();
      const values: string[] = [];
      render(<Harness kind="who" users={USERS} onChangeSpy={(value) => values.push(value)} />);

      for (const name of [/Acme Roofing/, 'Zoë Keller', /Birch Tiling/, 'Ben Albrecht']) {
        await user.click(await screen.findByRole('textbox'));
        await user.click(await screen.findByRole('option', { name }));
        await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      }

      const picked = values.filter((value) => value !== '');
      expect(picked).toHaveLength(4);
      for (const value of picked) {
        const { userId, vendorId } = Kinds.decodeWho(value);
        expect([userId, vendorId].filter((id) => id !== undefined)).toHaveLength(1);
      }
    });

    it('shows a preselected member by name with the kind, with no lookup', () => {
      render(<Harness kind="who" users={USERS} initial="member:u-1" />);

      expect(screen.getByText('Zoë Keller')).toBeInTheDocument();
      expect(screen.getByText('Household member')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('still shows a deactivated member who is already assigned', () => {
      render(<Harness kind="who" users={USERS} initial="member:u-3" />);

      expect(screen.getByText('Old Timer')).toBeInTheDocument();
    });

    it('falls back to the host label for a member who is not in the list', () => {
      render(
        <Harness kind="who" users={USERS} initial="member:u-gone" selectedLabel="Former Member" />,
      );

      expect(screen.getByText('Former Member')).toBeInTheDocument();
    });

    it('shows a host-labelled value of an unknown form without a kind suffix', () => {
      render(
        <Harness kind="who" users={USERS} initial="legacy:7" selectedLabel="Imported owner" />,
      );

      expect(screen.getByText('Imported owner')).toBeInTheDocument();
      expect(screen.queryByText('Company')).toBeNull();
      expect(screen.queryByText('Household member')).toBeNull();
    });

    it('shows the input for a member who is neither listed nor labelled', () => {
      render(<Harness kind="who" users={USERS} initial="member:u-gone" />);

      expect(input()).toBeInTheDocument();
    });

    it('looks a saved company up and shows its name with the kind "Company"', async () => {
      render(<Harness kind="who" users={USERS} initial="company:v-9" />);

      expect(await screen.findByText('Saved Co')).toBeInTheDocument();
      expect(mockFetchVendor).toHaveBeenCalledWith('v-9');
      expect(screen.getByText('Company')).toBeInTheDocument();
    });

    it('shows a known company without a lookup', () => {
      render(
        <Harness
          kind="who"
          users={USERS}
          initial="company:v-9"
          knownCompany={{ id: 'v-9', name: 'Known Co' }}
        />,
      );

      expect(screen.getByText('Known Co')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('keeps the value and tells the host when the assigned company no longer exists', async () => {
      const onUnknownCompany = jest.fn();
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      render(
        <Harness
          kind="who"
          users={USERS}
          initial="company:v-gone"
          onUnknownCompany={onUnknownCompany}
        />,
      );

      await waitFor(() => expect(onUnknownCompany).toHaveBeenCalledTimes(1));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('offers "New company ‹text›" only, never a household member', async () => {
      const user = userEvent.setup();
      render(<Harness kind="who" users={USERS} companyCreate={requestCompany} />);

      await user.type(input(), 'Fresh');
      await screen.findByRole('option', { name: 'New company Fresh' });

      expect(screen.queryByRole('option', { name: /New (household )?member/ })).toBeNull();
    });

    it('a company created in place becomes company:<id> in the Company group', async () => {
      const user = userEvent.setup();
      requestCompany.mockResolvedValue({ id: 'v-new', name: 'Fresh Co' });
      render(<Harness kind="who" users={USERS} companyCreate={requestCompany} />);

      await user.type(input(), 'Fresh Co');
      await user.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

      expect(onChange).toHaveBeenCalledWith('company:v-new', {
        id: 'company:v-new',
        label: 'Fresh Co',
        group: 'company',
        entityId: 'v-new',
      });
      expect(await screen.findByText('Fresh Co')).toBeInTheDocument();
      expect(screen.getByText('Company')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('has its own placeholder', () => {
      render(<Harness kind="who" users={USERS} />);
      expect(input()).toHaveAttribute('placeholder', 'Search companies or household members');
    });
  });

  // ---- area ----

  describe('area', () => {
    it('searches the server from two letters and lists the full path, ancestors muted and the last level bold', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(HALLWAY_HIT);
      render(<Harness kind="area" areas={AREAS} />);

      await user.type(input(), 'hal');

      await waitFor(() =>
        expect(mockSearchEverywhere).toHaveBeenLastCalledWith(
          { q: 'hal', types: ['area'], limit: 20 },
          expect.any(AbortSignal),
        ),
      );
      const option = await screen.findByRole('option', { name: 'Ground floor, Hallway' });
      expect(within(option).getByText('Ground floor')).toHaveClass('pathSegment');
      expect(within(option).getByText('Hallway')).toHaveClass('pathLast');
      expect(option).toHaveTextContent('Ground floor › Hallway');
    });

    it('names a top-level hit by itself', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(HALLWAY_HIT);
      render(<Harness kind="area" areas={AREAS} />);

      await user.type(input(), 'hal');

      expect(await screen.findByRole('option', { name: 'Garden hall' })).toBeInTheDocument();
    });

    it('after a pick the chip shows the plain full path and onChange receives the option with its path', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(HALLWAY_HIT);
      render(<Harness kind="area" areas={AREAS} />);

      await user.type(input(), 'hal');
      await user.click(await screen.findByRole('option', { name: 'Ground floor, Hallway' }));

      expect(onChange).toHaveBeenCalledWith('a-2', {
        id: 'a-2',
        label: 'Hallway',
        path: [
          { id: 'a-1', name: 'Ground floor' },
          { id: 'a-2', name: 'Hallway' },
        ],
      });
      expect(screen.getByText('Ground floor › Hallway')).toBeInTheDocument();
    });

    it('lists the whole tree on focus (no server call) and filters it on the client for one letter', async () => {
      const user = userEvent.setup();
      render(<Harness kind="area" areas={AREAS} />);

      await user.click(input());
      expect(await optionNames()).toEqual([
        'Garden',
        'Ground floor',
        'Ground floor › Hallway',
        'Ground floor › Kitchen',
      ]);

      await user.type(input(), 'k');
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
      expect(screen.getByRole('option', { name: 'Ground floor, Kitchen' })).toBeInTheDocument();
      expect(mockSearchEverywhere).not.toHaveBeenCalled();
    });

    it('leaves out excluded areas', async () => {
      const user = userEvent.setup();
      render(<Harness kind="area" areas={AREAS} excludeIds={['a-1', 'a-4']} />);

      await user.click(input());

      expect(await optionNames()).toEqual(['Ground floor › Hallway', 'Ground floor › Kitchen']);
    });

    it('shows a preselected area as its plain path from the loaded list', () => {
      render(<Harness kind="area" areas={AREAS} initial="a-3" />);

      expect(screen.getByText('Ground floor › Kitchen')).toBeInTheDocument();
    });

    it('falls back to the host label when the area is not in the list', () => {
      render(<Harness kind="area" areas={AREAS} initial="a-gone" selectedLabel="Old shed" />);

      expect(screen.getByText('Old shed')).toBeInTheDocument();
    });

    it('shows the input when the area is neither listed nor labelled', () => {
      render(<Harness kind="area" areas={AREAS} initial="a-gone" />);

      expect(input()).toBeInTheDocument();
    });

    it('offers a "No area" row with an empty value and no option', async () => {
      const user = userEvent.setup();
      render(<Harness kind="area" areas={AREAS} noneLabel="No area" />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'No area' }));

      expect(onChange).toHaveBeenCalledWith('', null);
      expect(screen.getByText('No area')).toBeInTheDocument();
    });

    it('reports a failing server search in the list', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockRejectedValue(new Error('down'));
      render(<Harness kind="area" areas={AREAS} />);

      await user.type(input(), 'hal');

      expect(await screen.findByText('Failed to search items')).toBeInTheDocument();
    });

    it('uses the select-an-area placeholder', () => {
      render(<Harness kind="area" areas={AREAS} />);
      expect(input()).toHaveAttribute('placeholder', 'Select an area');
    });

    it('"New area ‹text›" opens the area form with the text and the input as the opener, then selects the new area', async () => {
      const user = userEvent.setup();
      requestTag.mockResolvedValue({ id: 'a-new', name: 'Cellar' } satisfies CreatedTag);
      render(<Harness kind="area" areas={AREAS} id="area-input" tagCreate={requestTag} />);
      const opener = input();

      await user.type(input(), 'Cellar');
      await user.click(await screen.findByRole('option', { name: 'New area Cellar' }));

      expect(requestTag.mock.calls[0]).toEqual(['area', opener, 'Cellar']);
      expect(onChange).toHaveBeenCalledWith('a-new', { id: 'a-new', label: 'Cellar' });
      expect(await screen.findByText('Cellar')).toBeInTheDocument();
    });

    it('selects nothing when the area form is cancelled', async () => {
      const user = userEvent.setup();
      requestTag.mockResolvedValue(null);
      render(<Harness kind="area" areas={AREAS} tagCreate={requestTag} />);

      await user.type(input(), 'Cellar');
      await user.click(await screen.findByRole('option', { name: 'New area Cellar' }));

      await waitFor(() => expect(requestTag).toHaveBeenCalled());
      expect(onChange).not.toHaveBeenCalled();
    });

    it('offers no row without a tag provider, and none for create="off"', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<Harness kind="area" areas={AREAS} />);
      await user.type(input(), 'Cellar');
      await waitFor(() => expect(screen.queryByText('Searching...')).toBeNull());
      expect(screen.queryByRole('option', { name: /New area/ })).toBeNull();
      unmount();

      render(<Harness kind="area" areas={AREAS} tagCreate={requestTag} create="off" />);
      await user.type(input(), 'Cellar');
      await waitFor(() => expect(screen.queryByText('Searching...')).toBeNull());
      expect(screen.queryByRole('option', { name: /New area/ })).toBeNull();
    });

    it('hides the row when the text is the full name of an existing area', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(HALLWAY_HIT);
      render(<Harness kind="area" areas={AREAS} tagCreate={requestTag} />);

      await user.type(input(), 'Hallway');
      await screen.findByRole('option', { name: 'Ground floor, Hallway' });

      expect(screen.queryByRole('option', { name: /New area/ })).toBeNull();
    });

    it('reports the tag dialog being open through onCreatingChange', async () => {
      const user = userEvent.setup();
      const creating = jest.fn<(creating: boolean) => void>();
      let finish!: (tag: CreatedTag | null) => void;
      requestTag.mockImplementation(() => new Promise((r) => (finish = r)));
      render(
        <Harness kind="area" areas={AREAS} tagCreate={requestTag} onCreatingChange={creating} />,
      );

      await user.type(input(), 'Cellar');
      await user.click(await screen.findByRole('option', { name: 'New area Cellar' }));
      await waitFor(() => expect(creating).toHaveBeenLastCalledWith(true));

      await act(async () => finish(null));
      await waitFor(() => expect(creating).toHaveBeenLastCalledWith(false));
    });
  });

  // ---- orientation ----

  describe('orientation', () => {
    beforeEach(() => {
      mockFetchOrientations.mockResolvedValue({
        orientations: [
          { id: 'o-1', name: 'North', description: 'Faces the street' },
          { id: 'o-2', name: 'South', description: null },
        ],
      } as never);
    });

    it('lists orientations on focus with the description as the second line', async () => {
      const user = userEvent.setup();
      render(<Harness kind="orientation" />);

      await user.click(input());

      expect(await optionNames()).toEqual(['NorthFaces the street', 'South']);
      expect(mockFetchOrientations).toHaveBeenCalledWith(undefined);
    });

    it('sends the typed text as the search parameter', async () => {
      const user = userEvent.setup();
      render(<Harness kind="orientation" />);

      await user.type(input(), 'sou');

      await waitFor(() =>
        expect(mockFetchOrientations).toHaveBeenLastCalledWith({ search: 'sou' }),
      );
    });

    it('reports the pick and shows the preselected name', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<Harness kind="orientation" />);
      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'South' }));
      expect(onChange).toHaveBeenCalledWith(
        'o-2',
        expect.objectContaining({ id: 'o-2', label: 'South' }),
      );
      unmount();

      render(<Harness kind="orientation" initial="o-1" selectedLabel="North" />);
      expect(screen.getByText('North')).toBeInTheDocument();
    });

    it('has the select-an-orientation placeholder and a "No orientation" row', async () => {
      const user = userEvent.setup();
      render(<Harness kind="orientation" noneLabel="No orientation" />);
      expect(input()).toHaveAttribute('placeholder', 'Select an orientation');

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'No orientation' }));

      expect(onChange).toHaveBeenCalledWith('', null);
    });

    it('"New orientation ‹text›" opens the orientation form and selects the created one', async () => {
      const user = userEvent.setup();
      requestTag.mockResolvedValue({ id: 'o-new', name: 'East' });
      render(<Harness kind="orientation" id="o-input" tagCreate={requestTag} />);
      const opener = input();

      await user.type(input(), 'East');
      await user.click(await screen.findByRole('option', { name: 'New orientation East' }));

      expect(requestTag.mock.calls[0]).toEqual(['orientation', opener, 'East']);
      expect(onChange).toHaveBeenCalledWith('o-new', { id: 'o-new', label: 'East' });
    });

    it('does not refetch its trade cache for orientations (no trade call)', async () => {
      const user = userEvent.setup();
      render(<Harness kind="orientation" />);

      await user.click(input());
      await screen.findAllByRole('option');

      expect(mockFetchTrades).not.toHaveBeenCalled();
    });
  });

  // ---- trade and category ----

  describe('trade', () => {
    beforeEach(() => {
      mockFetchTrades.mockResolvedValue({
        trades: [
          { id: 't-1', name: 'Roofing', translationKey: 'trades.roofing' },
          { id: 't-2', name: 'Stonemason', translationKey: null },
        ],
      } as never);
    });

    it('lists every trade on focus from one list call', async () => {
      const user = userEvent.setup();
      render(<Harness kind="trade" />);

      await user.click(input());

      expect(await optionNames()).toEqual(['Roofing', 'Stonemason']);
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });

    it('filters on the client against the stored and the translated name without asking the server again', async () => {
      const user = userEvent.setup();
      render(<Harness kind="trade" />);
      await user.click(input());
      await screen.findAllByRole('option');

      await user.type(input(), 'stone');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
      expect(screen.getByRole('option', { name: 'Stonemason' })).toBeInTheDocument();
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });

    it('matches a built-in trade by its translated display name', async () => {
      const user = userEvent.setup();
      mockFetchTrades.mockResolvedValue({
        trades: [{ id: 't-9', name: 'Dachdecker', translationKey: 'trades.roofing' }],
      } as never);
      render(<Harness kind="trade" />);

      await user.type(input(), 'roof');

      expect(await screen.findByRole('option', { name: 'Roofing' })).toBeInTheDocument();
    });

    it('leaves out excluded trades, translated built-ins included', async () => {
      const user = userEvent.setup();
      render(<Harness kind="trade" excludeIds={['t-1']} />);

      await user.click(input());

      expect(await optionNames()).toEqual(['Stonemason']);
    });

    it('reports the pick and shows a host-labelled preselected trade', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<Harness kind="trade" />);
      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'Stonemason' }));
      expect(onChange).toHaveBeenCalledWith(
        't-2',
        expect.objectContaining({ id: 't-2', label: 'Stonemason' }),
      );
      unmount();

      render(<Harness kind="trade" initial="t-1" selectedLabel="Roofing" />);
      expect(screen.getByText('Roofing')).toBeInTheDocument();
    });

    it('retries the list after a failed load instead of caching the failure', async () => {
      const user = userEvent.setup();
      mockFetchTrades.mockRejectedValueOnce(new Error('down'));
      render(<Harness kind="trade" />);

      await user.click(input());
      expect(await screen.findByText('Failed to load items')).toBeInTheDocument();

      await user.type(input(), 'r');
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('option', { name: 'Roofing' })).toBeInTheDocument();
    });

    it('"New trade ‹text›" opens the trade form, selects the created trade and reloads the list next time', async () => {
      const user = userEvent.setup();
      requestTag.mockResolvedValue({ id: 't-new', name: 'Glazing' });
      render(<Harness kind="trade" id="trade-input" tagCreate={requestTag} />);
      const opener = input();

      await user.type(input(), 'Glazing');
      await user.click(await screen.findByRole('option', { name: 'New trade Glazing' }));

      expect(requestTag.mock.calls[0]).toEqual(['trade', opener, 'Glazing']);
      expect(onChange).toHaveBeenCalledWith('t-new', { id: 't-new', label: 'Glazing' });
      await screen.findByText('Glazing');

      // The cache was dropped: the next search asks the server again, so the new trade is listed.
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      await user.click(await screen.findByRole('textbox'));
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(2));
    });

    it('a failed load that settles after a create does not drop the newer cache', async () => {
      const user = userEvent.setup();
      // Two creates are in flight (both rows came from the cached list); the first finishing clears
      // the cache, the next search starts a load that is still running when the second finishes.
      const finishCreate: Array<(created: { id: string; name: string }) => void> = [];
      requestTag.mockImplementation(
        () => new Promise((resolve) => finishCreate.push(resolve)) as never,
      );
      let rejectLoad: (error: Error) => void = () => {};
      render(<Harness kind="trade" id="trade-input" tagCreate={requestTag} />);

      await user.type(input(), 'Glazing');
      await user.click(await screen.findByRole('option', { name: 'New trade Glazing' }));
      await user.type(input(), 's');
      await user.click(await screen.findByRole('option', { name: 'New trade Glazings' }));
      expect(finishCreate).toHaveLength(2);

      mockFetchTrades.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectLoad = reject;
        }) as never,
      );
      await act(async () => {
        finishCreate[0]!({ id: 't-1', name: 'Glazing' });
      });
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      await user.type(input(), 'x');
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(2));
      await act(async () => {
        finishCreate[1]!({ id: 't-2', name: 'Glazings' });
      });

      await act(async () => {
        rejectLoad(new Error('down'));
      });
      expect(mockFetchTrades).toHaveBeenCalledTimes(2);
    });

    it('keeps the cached list when the trade form is cancelled', async () => {
      const user = userEvent.setup();
      requestTag.mockResolvedValue(null);
      render(<Harness kind="trade" tagCreate={requestTag} />);

      await user.type(input(), 'Glazing');
      await user.click(await screen.findByRole('option', { name: 'New trade Glazing' }));
      await waitFor(() => expect(requestTag).toHaveBeenCalled());
      await user.type(input(), 'x');

      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('has the select-a-trade placeholder', () => {
      render(<Harness kind="trade" />);
      expect(input()).toHaveAttribute('placeholder', 'Select a trade');
    });
  });

  describe('category', () => {
    beforeEach(() => {
      mockFetchCategories.mockResolvedValue({
        categories: [
          { id: 'c-1', name: 'Furniture', translationKey: 'householdItemCategories.furniture' },
          { id: 'c-2', name: 'Garden tools', translationKey: null },
        ],
      } as never);
    });

    it('lists the purchase categories and filters them on the client', async () => {
      const user = userEvent.setup();
      render(<Harness kind="category" />);

      await user.click(input());
      expect(await optionNames()).toEqual(['Furniture', 'Garden tools']);

      await user.type(input(), 'garden');
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
      expect(mockFetchCategories).toHaveBeenCalledTimes(1);
      expect(mockFetchTrades).not.toHaveBeenCalled();
    });

    it('has its own placeholder and reports the pick', async () => {
      const user = userEvent.setup();
      render(<Harness kind="category" />);
      expect(input()).toHaveAttribute('placeholder', 'Select a category');

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'Garden tools' }));

      expect(onChange).toHaveBeenCalledWith(
        'c-2',
        expect.objectContaining({ id: 'c-2', label: 'Garden tools' }),
      );
    });

    it('"New category ‹text›" opens the category form and selects the created one', async () => {
      const user = userEvent.setup();
      requestTag.mockResolvedValue({ id: 'c-new', name: 'Lighting' });
      render(<Harness kind="category" id="cat-input" tagCreate={requestTag} />);
      const opener = input();

      await user.type(input(), 'Lighting');
      await user.click(await screen.findByRole('option', { name: 'New category Lighting' }));

      expect(requestTag.mock.calls[0]).toEqual(['category', opener, 'Lighting']);
      expect(onChange).toHaveBeenCalledWith('c-new', { id: 'c-new', label: 'Lighting' });
    });

    it('hides the row when the text is an existing category name, translated or stored', async () => {
      const user = userEvent.setup();
      render(<Harness kind="category" tagCreate={requestTag} />);

      await user.type(input(), 'FURNITURE');
      await screen.findByRole('option', { name: 'Furniture' });

      expect(screen.queryByRole('option', { name: /New category/ })).toBeNull();
    });
  });

  // ---- task ----

  describe('task', () => {
    beforeEach(() => {
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            id: 'w-1',
            title: 'Lay floors',
            status: 'in_progress',
            area: { id: 'a-3', name: 'Kitchen', ancestors: [{ id: 'a-1', name: 'House' }] },
          },
          { id: 'w-2', title: 'Paint walls', status: 'not_started', area: null },
        ],
      } as never);
    });

    it('lists tasks on focus with the status word and the area path', async () => {
      const user = userEvent.setup();
      render(<Harness kind="task" />);

      await user.click(input());

      const first = await screen.findByRole('option', { name: /Lay floors/ });
      expect(first).toHaveTextContent('In progress');
      expect(first).toHaveTextContent('House › Kitchen');
      expect(screen.getByRole('option', { name: /Paint walls/ })).toHaveTextContent('Not started');
      expect(mockListWorkItems).toHaveBeenCalledWith({ q: undefined, pageSize: 15 });
    });

    it('sends the typed text as q', async () => {
      const user = userEvent.setup();
      render(<Harness kind="task" />);

      await user.type(input(), 'lay');

      await waitFor(() =>
        expect(mockListWorkItems).toHaveBeenLastCalledWith({ q: 'lay', pageSize: 15 }),
      );
    });

    it('reports the pick and shows the title; excludes ids', async () => {
      const user = userEvent.setup();
      render(<Harness kind="task" excludeIds={['w-2']} />);

      await user.click(input());
      expect(await optionNames()).toHaveLength(1);
      await user.click(screen.getByRole('option', { name: /Lay floors/ }));

      expect(onChange).toHaveBeenCalledWith(
        'w-1',
        expect.objectContaining({ id: 'w-1', label: 'Lay floors', trailing: 'In progress' }),
      );
      expect(screen.getByText('Lay floors')).toBeInTheDocument();
    });

    it('has its own placeholder, hints and messages', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockResolvedValue({ items: [] } as never);
      render(<Harness kind="task" />);
      expect(input()).toHaveAttribute('placeholder', 'Search tasks');

      await user.click(input());
      expect(await screen.findByText('Type to search tasks')).toBeInTheDocument();

      await user.type(input(), 'zzz');
      expect(await screen.findByText('No matching tasks')).toBeInTheDocument();
    });

    it('a host emptyHint wins over the default hint', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockResolvedValue({ items: [] } as never);
      render(<Harness kind="task" emptyHint="Nothing to depend on yet" />);

      await user.click(input());

      expect(await screen.findByText('Nothing to depend on yet')).toBeInTheDocument();
    });

    it('says the tasks could not be loaded, and that the search did not work', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockRejectedValueOnce(new Error('down'));
      render(<Harness kind="task" />);

      await user.click(input());
      expect(await screen.findByText('Tasks could not be loaded.')).toBeInTheDocument();

      mockListWorkItems.mockRejectedValueOnce(new Error('down'));
      await user.type(input(), 'lay');
      expect(await screen.findByText('The search did not work. Try again.')).toBeInTheDocument();
    });

    it('special options (This task) come first and report no option', async () => {
      const user = userEvent.setup();
      render(<Harness kind="task" specialOptions={[{ id: '__this__', label: 'This task' }]} />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: 'This task' }));

      expect(onChange).toHaveBeenCalledWith('__this__', null);
    });
  });

  // ---- task or purchase ----

  describe('taskOrPurchase', () => {
    const RESULTS = searchResponse([
      {
        type: 'work_item',
        items: [
          hit('wi-1', 'Lay floors', [
            { id: 'a1', name: 'House' },
            { id: 'a2', name: 'Kitchen' },
          ]),
        ],
      },
      { type: 'household_item', items: [hit('hi-1', 'Floor lamp')] },
      { type: 'invoice', items: [hit('inv-1', 'Ignored invoice')] },
    ]);

    it('does not open or search on focus, and has its own placeholder', async () => {
      const user = userEvent.setup();
      render(<Harness kind="taskOrPurchase" />);

      await user.click(input());

      expect(input()).toHaveAttribute('placeholder', 'Search tasks or purchases');
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(mockSearchEverywhere).not.toHaveBeenCalled();
    });

    it('asks for two letters before it searches', async () => {
      const user = userEvent.setup();
      render(
        <Harness kind="taskOrPurchase" specialOptions={[{ id: '__x__', label: 'Special' }]} />,
      );

      await user.click(input());
      await user.type(input(), 'f');
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(mockSearchEverywhere).not.toHaveBeenCalled();
    });

    it('lists tasks and purchases with the kind word and the area path, skipping other kinds', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(RESULTS);
      render(<Harness kind="taskOrPurchase" />);

      await user.type(input(), 'fl');

      const task = await screen.findByRole('option', { name: /Lay floors/ });
      expect(task).toHaveTextContent('Task');
      expect(task).toHaveTextContent('House › Kitchen');
      const purchase = screen.getByRole('option', { name: /Floor lamp/ });
      expect(purchase).toHaveTextContent('Purchase');
      expect(purchase).not.toHaveTextContent('›');
      expect(screen.queryByRole('option', { name: /Ignored invoice/ })).toBeNull();
      expect(mockSearchEverywhere).toHaveBeenCalledWith(
        { q: 'fl', types: ['work_item', 'household_item'], limit: 10 },
        expect.any(AbortSignal),
      );
    });

    it('reports an encoded value with the item type, the raw id and the label', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(RESULTS);
      render(<Harness kind="taskOrPurchase" />);

      await user.type(input(), 'fl');
      await user.click(await screen.findByRole('option', { name: /Floor lamp/ }));

      expect(onChange).toHaveBeenCalledWith(
        'household_item:hi-1',
        expect.objectContaining({
          id: 'household_item:hi-1',
          itemType: 'household_item',
          entityId: 'hi-1',
          label: 'Floor lamp',
        }),
      );
    });

    it('leaves out excluded encoded values', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(RESULTS);
      render(<Harness kind="taskOrPurchase" excludeIds={['work_item:wi-1']} />);

      await user.type(input(), 'fl');
      await screen.findByRole('option', { name: /Floor lamp/ });

      expect(screen.queryByRole('option', { name: /Lay floors/ })).toBeNull();
    });

    it('shows the current target by its host label', () => {
      render(<Harness kind="taskOrPurchase" initial="work_item:wi-1" selectedLabel="Lay floors" />);

      expect(screen.getByText('Lay floors')).toBeInTheDocument();
    });

    it('says when nothing matches', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(searchResponse([]));
      render(<Harness kind="taskOrPurchase" />);

      await user.type(input(), 'zz');

      expect(await screen.findByText('No tasks or purchases match.')).toBeInTheDocument();
    });
  });
  describe('document', () => {
    const doc = (id: number, title: string, correspondent: string | null, created: string | null) =>
      ({ id, title, correspondent, created }) as never;

    const respond = (...documents: unknown[]) =>
      mockListPaperlessDocuments.mockResolvedValue({ documents } as never);

    it('lists the newest documents on focus, sorted by creation date, with a placeholder and the linked-hidden hint', async () => {
      const user = userEvent.setup();
      respond(doc(1, 'Roof quote', 'Acme Roofing', '2026-04-02'));
      render(<Harness kind="document" />);

      await user.click(input());

      expect(input()).toHaveAttribute('placeholder', 'Search your documents');
      expect(await screen.findByRole('option', { name: /Roof quote/ })).toBeInTheDocument();
      expect(mockListPaperlessDocuments).toHaveBeenCalledWith({
        pageSize: 25,
        sortBy: 'created',
        sortOrder: 'desc',
      });
    });

    it('sends the typed text without a sort', async () => {
      const user = userEvent.setup();
      respond();
      render(<Harness kind="document" />);

      await user.type(input(), 'roof');

      await waitFor(() =>
        expect(mockListPaperlessDocuments).toHaveBeenLastCalledWith({
          query: 'roof',
          pageSize: 25,
        }),
      );
    });

    it('shows the correspondent and the formatted date as the second line, or nothing', async () => {
      const user = userEvent.setup();
      respond(
        doc(1, 'Both', 'Acme Roofing', '2026-04-02'),
        doc(2, 'Correspondent only', 'Birch Tiling', null),
        doc(3, 'Date only', null, '2026-04-02'),
        doc(4, 'Neither', null, null),
      );
      render(<Harness kind="document" />);

      await user.click(input());

      const options = await screen.findAllByRole('option');
      expect(options[0]).toHaveTextContent(/Acme Roofing · .*2026/);
      expect(options[1]).toHaveTextContent(/^Correspondent onlyBirch Tiling$/);
      expect(options[2]).toHaveTextContent(/^Date only.*2026$/);
      expect(options[3]).toHaveTextContent(/^Neither$/);
    });

    it('leaves out documents that are already linked', async () => {
      const user = userEvent.setup();
      mockListAllLinkedDocumentIds.mockResolvedValue([2]);
      respond(doc(1, 'Free one', null, null), doc(2, 'Linked one', null, null));
      render(<Harness kind="document" />);

      await user.click(input());

      expect(await screen.findByRole('option', { name: /Free one/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Linked one/ })).toBeNull();
    });

    it('loads the linked ids once across several searches', async () => {
      const user = userEvent.setup();
      respond(doc(1, 'Free one', null, null));
      render(<Harness kind="document" />);

      await user.type(input(), 'fr');
      await screen.findByRole('option', { name: /Free one/ });
      await user.type(input(), 'ee');
      await waitFor(() => expect(mockListPaperlessDocuments.mock.calls.length).toBeGreaterThan(1));

      expect(mockListAllLinkedDocumentIds).toHaveBeenCalledTimes(1);
    });

    it('retries the linked-ids load after a failure and still lists the documents', async () => {
      const user = userEvent.setup();
      mockListAllLinkedDocumentIds.mockRejectedValueOnce(new Error('down'));
      respond(doc(1, 'Free one', null, null));
      render(<Harness kind="document" />);

      await user.type(input(), 'f');
      expect(await screen.findByRole('option', { name: /Free one/ })).toBeInTheDocument();
      await user.type(input(), 'r');
      await waitFor(() => expect(mockListAllLinkedDocumentIds).toHaveBeenCalledTimes(2));
    });

    it('says when no document matches', async () => {
      const user = userEvent.setup();
      respond();
      render(<Harness kind="document" />);

      await user.type(input(), 'zz');

      expect(await screen.findByText('No documents found.')).toBeInTheDocument();
    });

    it('says when the documents could not be loaded', async () => {
      const user = userEvent.setup();
      mockListPaperlessDocuments.mockRejectedValue(new Error('down'));
      render(<Harness kind="document" />);

      await user.type(input(), 'zz');

      expect(await screen.findByText("Couldn't load documents.")).toBeInTheDocument();
    });

    it('offers no create row, even for text that matches nothing', async () => {
      const user = userEvent.setup();
      respond();
      render(<Harness kind="document" />);

      await user.type(input(), 'zz');
      await screen.findByText('No documents found.');

      expect(screen.queryByRole('option', { name: /^New/ })).toBeNull();
    });

    it('reports the picked document with its id, title, correspondent and date', async () => {
      const user = userEvent.setup();
      respond(doc(7, 'Roof quote', 'Acme Roofing', '2026-04-02'));
      render(<Harness kind="document" />);

      await user.click(input());
      await user.click(await screen.findByRole('option', { name: /Roof quote/ }));

      expect(onChange).toHaveBeenCalledWith(
        '7',
        expect.objectContaining({
          id: '7',
          entityId: '7',
          label: 'Roof quote',
          document: { title: 'Roof quote', correspondent: 'Acme Roofing', created: '2026-04-02' },
        }),
      );
    });
  });
});
