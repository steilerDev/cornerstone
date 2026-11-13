/**
 * @jest-environment jsdom
 *
 * The purchase page's Overview tab (#2249, D9): the Details card in read and edit mode, the
 * product-link scheme guard, saving only the changed fields, and the controller that opens it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';
import type { UseAreasResult } from '../../hooks/useAreas.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as CategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as PanelModule from './PurchaseOverviewPanel.js';

const mockUpdate = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockUseAreas = jest.fn<() => UseAreasResult>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  updateHouseholdItem: mockUpdate,
}));
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Panel: typeof PanelModule;

const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/household-items/hi-1', name: 'Sample sofa' } };
const VENDOR = { id: 'v-1', name: 'Company One', trade: null, phone: null };
const AREA = { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] };
const FULL: Partial<HouseholdItemPageDetail> = {
  description: 'Three seats, grey fabric.',
  quantity: 2,
  vendor: VENDOR,
  area: AREA,
  url: 'https://shop.example.test/sofa?id=1',
};

function renderPanel(purchase: HouseholdItemPageDetail = makePurchasePage()) {
  const detailsRef = createRef<SectionCardController>();
  const view = render(
    <MemoryRouter>
      <Panel.PurchaseOverviewPanel
        purchase={purchase}
        revision={0}
        refresh={refresh}
        originState={ORIGIN}
        headingRef={{ current: null }}
        detailsCardRef={detailsRef}
      />
    </MemoryRouter>,
  );
  return { ...view, detailsRef };
}

async function edit() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('section-purchase-details-edit'));
  return user;
}
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByTestId('section-purchase-details-save'));

describe('safeLinkHost', () => {
  beforeEach(async () => {
    if (!Panel) Panel = await import('./PurchaseOverviewPanel.js');
  });

  it.each([
    ['https://shop.example.test/sofa', 'shop.example.test'],
    ['http://shop.example.test:8080/x', 'shop.example.test:8080'],
  ])('returns the host of %s', (url, host) => {
    expect(Panel.safeLinkHost(url)).toBe(host);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://files.example.test',
    'not a url',
    '',
  ])('returns null for %p', (url) => {
    expect(Panel.safeLinkHost(url)).toBeNull();
  });
});

describe('PurchaseOverviewPanel', () => {
  beforeEach(async () => {
    for (const mock of [
      mockUpdate,
      mockFetchCategories,
      mockSearchCompanies,
      mockFetchVendor,
      mockSearchEverywhere,
      refresh,
    ]) {
      mock.mockReset();
    }
    mockUpdate.mockResolvedValue({} as never);
    mockFetchCategories.mockResolvedValue({
      categories: [
        { id: 'hic-furniture', name: 'Furniture', translationKey: null },
        { id: 'hic-appliances', name: 'Appliances', translationKey: null },
      ],
    } as never);
    mockSearchCompanies.mockResolvedValue([] as never);
    mockFetchVendor.mockResolvedValue({ id: 'v-1', name: 'Company One' } as never);
    mockSearchEverywhere.mockResolvedValue({ query: '', groups: [] });
    mockUseAreas.mockReturnValue({
      areas: [
        { id: 'a-1', name: 'Kitchen', parentId: null, sortOrder: 0 },
        { id: 'a-2', name: 'Garden', parentId: null, sortOrder: 1 },
      ],
      isLoading: false,
      error: null,
    } as unknown as UseAreasResult);
    refresh.mockResolvedValue(undefined);
    if (!Panel) Panel = await import('./PurchaseOverviewPanel.js');
  });

  it('exports the panel as the default too', () => {
    expect(Panel.default).toBe(Panel.PurchaseOverviewPanel);
  });

  describe('read mode', () => {
    it('shows only the category and "Nothing added yet" for a bare purchase', () => {
      renderPanel();
      expect(screen.getByTestId('purchase-detail-empty')).toHaveTextContent('Nothing added yet');
      expect(screen.getByTestId('purchase-detail-category')).toHaveTextContent('Furniture');
      for (const id of ['description', 'quantity', 'company', 'link', 'area']) {
        expect(screen.queryByTestId(`purchase-detail-${id}`)).toBeNull();
      }
    });

    it('puts the muted line before the Category row', () => {
      renderPanel();
      const empty = screen.getByTestId('purchase-detail-empty');
      const category = screen.getByTestId('purchase-detail-category');
      expect(
        empty.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('shows every set row and drops the empty line', () => {
      renderPanel(makePurchasePage(FULL));
      expect(screen.queryByTestId('purchase-detail-empty')).toBeNull();
      expect(screen.getByTestId('purchase-detail-description')).toHaveTextContent(
        'Three seats, grey fabric.',
      );
      expect(screen.getByTestId('purchase-detail-quantity')).toHaveTextContent('2');
      expect(screen.getByTestId('purchase-detail-area')).toHaveTextContent('Kitchen');
    });

    it.each([
      ['a description', { description: 'Grey' }],
      ['a company', { vendor: VENDOR }],
      ['a link', { url: 'https://shop.example.test' }],
      ['an area', { area: AREA }],
      ['a quantity above 1', { quantity: 3 }],
    ])('drops "Nothing added yet" once there is %s', (_name, over) => {
      renderPanel(makePurchasePage(over));
      expect(screen.queryByTestId('purchase-detail-empty')).toBeNull();
    });

    it("treats an empty-string description and link as not added: no rows, and 'Nothing added yet'", () => {
      renderPanel(makePurchasePage({ description: '', url: '' }));
      expect(screen.getByTestId('purchase-detail-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('purchase-detail-description')).toBeNull();
      expect(screen.queryByTestId('purchase-detail-link')).toBeNull();
    });

    it('hides the quantity row for one piece', () => {
      renderPanel(makePurchasePage({ ...FULL, quantity: 1 }));
      expect(screen.queryByTestId('purchase-detail-quantity')).toBeNull();
    });

    it('links the company to its page with the origin', () => {
      renderPanel(makePurchasePage(FULL));
      expect(screen.getByRole('link', { name: 'Company One' })).toHaveAttribute(
        'href',
        '/companies/v-1',
      );
    });

    it('opens an http(s) product link in a new tab, shown as its host, with a screen-reader hint', () => {
      renderPanel(makePurchasePage(FULL));
      const link = screen.getByRole('link', { name: /shop\.example\.test/ });
      expect(link).toHaveAttribute('href', 'https://shop.example.test/sofa?id=1');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveTextContent('shop.example.test');
      expect(link).toHaveTextContent('(opens in a new tab)');
      expect(link).not.toHaveTextContent('/sofa');
    });

    it.each(['javascript:alert(1)', 'not a url'])(
      'shows %p as plain text, never as a link',
      (url) => {
        renderPanel(makePurchasePage({ url }));
        const row = screen.getByTestId('purchase-detail-link');
        expect(row).toHaveTextContent(url);
        expect(row.querySelector('a')).toBeNull();
      },
    );

    it('shows the translated category name for a default category', () => {
      renderPanel(
        makePurchasePage({
          categoryEntry: { id: 'hic-furniture', name: 'Furniture', translationKey: 'furniture' },
        }),
      );
      expect(screen.getByTestId('purchase-detail-category')).toHaveTextContent(/.+/);
    });
  });

  describe('edit mode', () => {
    it('opens with every field filled and focuses the name', async () => {
      renderPanel(makePurchasePage(FULL));
      await edit();
      expect(screen.getByTestId('purchase-field-name')).toHaveValue('Sample sofa');
      expect(screen.getByTestId('purchase-field-description')).toHaveValue(
        'Three seats, grey fabric.',
      );
      expect(screen.getByTestId('purchase-field-quantity')).toHaveValue(2);
      expect(screen.getByTestId('purchase-field-url')).toHaveValue(
        'https://shop.example.test/sofa?id=1',
      );
      expect(screen.getByTestId('purchase-field-name')).toHaveFocus();
    });

    it('opens through the controller ref (the e shortcut and the empty strip facts)', async () => {
      const { detailsRef } = renderPanel();
      act(() => detailsRef.current!.startEdit());
      expect(await screen.findByTestId('purchase-field-name')).toBeInTheDocument();
    });

    it('sends nothing but the changed name, trimmed, and refreshes the page', async () => {
      renderPanel();
      const user = await edit();
      await user.clear(screen.getByTestId('purchase-field-name'));
      await user.type(screen.getByTestId('purchase-field-name'), '  Grey sofa  ');
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { name: 'Grey sofa' }));
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('sends a new description trimmed and an emptied one as null', async () => {
      const { unmount } = renderPanel();
      let user = await edit();
      await user.type(screen.getByTestId('purchase-field-description'), ' Soft ');
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { description: 'Soft' }));
      unmount();
      mockUpdate.mockClear();
      renderPanel(makePurchasePage({ description: 'Soft' }));
      user = await edit();
      await user.clear(screen.getByTestId('purchase-field-description'));
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { description: null }));
    });

    it('sends the quantity as a number', async () => {
      renderPanel();
      const user = await edit();
      await user.clear(screen.getByTestId('purchase-field-quantity'));
      await user.type(screen.getByTestId('purchase-field-quantity'), '4');
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { quantity: 4 }));
    });

    it('sends the product link trimmed, and an emptied one as null', async () => {
      const { unmount } = renderPanel();
      let user = await edit();
      await user.type(screen.getByTestId('purchase-field-url'), ' https://x.example.test ');
      await save(user);
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith('hi-1', { url: 'https://x.example.test' }),
      );
      unmount();
      mockUpdate.mockClear();
      renderPanel(makePurchasePage({ url: 'https://x.example.test' }));
      user = await edit();
      await user.clear(screen.getByTestId('purchase-field-url'));
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { url: null }));
    });

    it('picks another category and sends its id', async () => {
      renderPanel();
      const user = await edit();
      await user.click(screen.getByRole('button', { name: /Clear selection/ }));
      await user.click(screen.getByLabelText(/Category/));
      await user.click(await screen.findByRole('option', { name: /Appliances/ }));
      await save(user);
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith('hi-1', { category: 'hic-appliances' }),
      );
    });

    it('picks a company and sends its id', async () => {
      mockSearchCompanies.mockResolvedValue([
        { id: 'v-7', name: 'Birch Furniture', trade: null },
      ] as never);
      renderPanel();
      const user = await edit();
      await user.click(screen.getByLabelText('Company'));
      await user.click(await screen.findByRole('option', { name: /Birch Furniture/ }));
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { vendorId: 'v-7' }));
    });

    it('clears the company with "No company" and sends null', async () => {
      renderPanel(makePurchasePage({ vendor: VENDOR }));
      const user = await edit();
      // The category chip clears first, the company chip second.
      await user.click(screen.getAllByRole('button', { name: /Clear selection/ })[1]!);
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { vendorId: null }));
    });

    it('picks an area and sends its id, and clears it as null', async () => {
      const { unmount } = renderPanel();
      let user = await edit();
      await user.click(screen.getByLabelText('Area'));
      await user.click(await screen.findByRole('option', { name: /Garden/ }));
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { areaId: 'a-2' }));
      unmount();
      mockUpdate.mockClear();
      renderPanel(makePurchasePage({ area: AREA }));
      user = await edit();
      await user.click(screen.getAllByRole('button', { name: /Clear selection/ })[1]!);
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('hi-1', { areaId: null }));
    });

    it('requires a name and sends nothing', async () => {
      renderPanel();
      const user = await edit();
      await user.clear(screen.getByTestId('purchase-field-name'));
      await save(user);
      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-field-name')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('requires a category after it was cleared', async () => {
      renderPanel();
      const user = await edit();
      await user.click(screen.getByRole('button', { name: /Clear selection/ }));
      await save(user);
      expect(await screen.findByText('Choose a category.')).toBeInTheDocument();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it.each(['0', '1.5', ''])('rejects the quantity %p', async (value) => {
      renderPanel();
      const user = await edit();
      const input = screen.getByTestId('purchase-field-quantity');
      await user.clear(input);
      if (value) await user.type(input, value);
      await save(user);
      expect(await screen.findByText('Enter a whole number, 1 or more.')).toBeInTheDocument();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('shows the translated server error and keeps the editor open', async () => {
      mockUpdate.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderPanel();
      const user = await edit();
      await user.type(screen.getByTestId('purchase-field-name'), '!');
      await save(user);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-field-name')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('shows the fallback sentence for a network failure', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('down'));
      renderPanel();
      const user = await edit();
      await user.type(screen.getByTestId('purchase-field-name'), '!');
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the purchase.");
    });

    it('returns focus to the Edit button after Save', async () => {
      renderPanel();
      const user = await edit();
      await user.type(screen.getByTestId('purchase-field-name'), '!');
      await save(user);
      await waitFor(() => expect(screen.queryByTestId('purchase-field-name')).toBeNull());
      expect(screen.getByTestId('section-purchase-details-edit')).toHaveFocus();
    });

    it('discarding resets the draft and the error', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('down'));
      renderPanel();
      const user = await edit();
      await user.type(screen.getByTestId('purchase-field-name'), '!');
      await save(user);
      await screen.findByRole('alert');
      await user.click(screen.getByTestId('section-purchase-details-cancel'));
      await user.click(await screen.findByTestId('section-purchase-details-discard-confirm'));
      await user.click(screen.getByTestId('section-purchase-details-edit'));
      expect(screen.getByTestId('purchase-field-name')).toHaveValue('Sample sofa');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
