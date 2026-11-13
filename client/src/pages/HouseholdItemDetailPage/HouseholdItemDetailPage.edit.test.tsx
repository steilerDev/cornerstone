/**
 * @jest-environment jsdom
 *
 * The old edit URLs end on the purchase page (#2249, D8): `?edit=overview` opens the real Details
 * card in edit mode with focus on Name, removes `edit` and `tab` in one replace, and keeps the
 * origin state. The shell is covered in HouseholdItemDetailPage.test.tsx with stub panels.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as CategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';

const mockGetItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const realItemsApi = await import('../../lib/householdItemsApi.js');
const realVendorsApi = await import('../../lib/vendorsApi.js');
const realSearchApi = await import('../../lib/searchApi.js');

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  ...realItemsApi,
  getHouseholdItem: mockGetItem,
}));
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  ...realVendorsApi,
  searchCompanies: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  fetchVendor: jest.fn(),
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  ...realSearchApi,
  searchEverywhere: jest.fn<() => Promise<unknown>>().mockResolvedValue({ query: '', groups: [] }),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: [], isLoading: false, error: null }),
}));
jest.unstable_mockModule('../../hooks/useObjectDiary.js', () => ({
  useObjectDiary: () => ({
    primary: { items: [], totalItems: 0, scope: 'none' },
    other: null,
    failure: null,
    reload: () => undefined,
    count: 0,
  }),
}));
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  useDocumentsPanel: () => ({ fact: null, panel: null }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u-me', role: 'admin' } }),
}));

const { default: Page } = await import('./HouseholdItemDetailPage.js');

const seen = { type: '', search: '', hash: '', state: null as unknown, keys: [] as string[] };
function Probe() {
  const location = useLocation();
  const type = useNavigationType();
  seen.type = type;
  seen.search = location.search;
  seen.hash = location.hash;
  seen.state = location.state;
  useEffect(() => {
    seen.keys.push(location.key);
  }, [location.key]);
  return null;
}

const STATE = { origin: { to: '/project/household-items', name: 'Purchases' } };

function renderPage(entry: { pathname: string; search: string; state?: unknown }) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/project/household-items/:id" element={<Page />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('HouseholdItemDetailPage: the edit URLs', () => {
  beforeEach(() => {
    installMatchMedia({ '(min-width: 768px)': true });
    mockGetItem.mockReset();
    mockGetItem.mockResolvedValue(makePurchasePage());
    mockFetchCategories.mockResolvedValue({ categories: [] } as never);
    seen.keys = [];
  });

  it('?edit=overview opens the Details card in edit mode with focus on Name, from any tab', async () => {
    renderPage({
      pathname: '/project/household-items/hi-1',
      search: '?edit=overview&tab=cost',
      state: STATE,
    });
    const name = await screen.findByTestId('purchase-field-name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue('Sample sofa');
    expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('replaces the URL once: no edit, no tab, and the origin state survives', async () => {
    renderPage({
      pathname: '/project/household-items/hi-1',
      search: '?edit=overview&tab=cost',
      state: STATE,
    });
    await screen.findByTestId('purchase-field-name');
    expect(seen.type).toBe('REPLACE');
    expect(seen.search).toBe('');
    expect(seen.state).toEqual(STATE);
    expect(seen.keys).toHaveLength(2);
  });

  it('without edit the Details card stays in read mode', async () => {
    renderPage({ pathname: '/project/household-items/hi-1', search: '' });
    await screen.findByTestId('section-purchase-details');
    expect(screen.queryByTestId('purchase-field-name')).toBeNull();
    expect(seen.keys).toHaveLength(1);
  });
});
