/**
 * @jest-environment jsdom
 */
/**
 * Component tests for the Companies list on the object template (#2246). All data is synthetic.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TradeListItem, VendorListItem } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as UseTradesTypes from '../../hooks/useTrades.js';
import type * as TradesManagerTypes from '../../components/TradesManager/TradesManager.js';

// ─── Mocks (before the component import) ───────────────────────────────────────

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockDeleteVendor = jest.fn<typeof VendorsApiTypes.deleteVendor>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  deleteVendor: mockDeleteVendor,
  createVendor: jest.fn(),
  fetchVendor: jest.fn(),
  searchCompanies: jest.fn(),
  updateVendor: jest.fn(),
}));

const mockUseTrades = jest.fn<typeof UseTradesTypes.useTrades>();
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({ useTrades: mockUseTrades }));

const managerProps: { current: TradesManagerTypes.TradesManagerProps | null } = { current: null };
jest.unstable_mockModule('../../components/TradesManager/TradesManager.js', () => ({
  TradesManager: (props: TradesManagerTypes.TradesManagerProps) => {
    managerProps.current = props;
    return (
      <div role="dialog" aria-label="Trades" data-testid="trades-manager-stub">
        <button type="button" data-testid="stub-close" onClick={props.onClose} />
        <button
          type="button"
          data-testid="stub-changed"
          onClick={() => props.onChanged?.({ kind: 'created', tradeId: 't-new' })}
        />
      </div>
    );
  },
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const trade = (id: string, name: string, over: Partial<TradeListItem> = {}): TradeListItem => ({
  id,
  name,
  color: null,
  description: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  vendorCount: 1,
  ...over,
});
const ROOFING = trade('t-roof', 'Dachdecker', { translationKey: 'trades.roofing', vendorCount: 5 });
const TILING = trade('t-tile', 'Tiling', { vendorCount: 4 });
const ELECTRICAL = trade('t-elec', 'Electrical', { vendorCount: 3 });
const PLUMBING = trade('t-plum', 'Plumbing', { vendorCount: 2 });
const WALLS = trade('t-wall', 'Walls', { vendorCount: 1 });

const company = (over: Partial<VendorListItem> = {}): VendorListItem => ({
  id: 'c1',
  name: 'Sample Roofing Co',
  trade: null,
  phone: '555-0142',
  email: 'office@sample-roofing.example',
  address: '1 Sample Street',
  notes: null,
  createdBy: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  firstContactPhone: null,
  contactCount: 0,
  lastOnSite: null,
  stillToPay: 0,
  ...over,
});
const ROOF_CO = company({
  trade: { id: 't-roof', name: 'Dachdecker', translationKey: 'trades.roofing' } as never,
  stillToPay: 250,
});
const TILE_CO = company({
  id: 'c2',
  name: 'Example Tiling Co',
  trade: { id: 't-tile', name: 'Tiling', translationKey: null } as never,
  phone: null,
});
const NO_TRADE_CO = company({ id: 'c3', name: 'Plain Supplies Ltd', phone: null });

const response = (vendors: VendorListItem[], scopeTotal = vendors.length) => ({
  vendors,
  pagination: { page: 1, pageSize: 100, totalItems: vendors.length, totalPages: 1 },
  scopeTotal,
});

function tradesResult(
  trades: TradeListItem[] = [],
  over: Partial<UseTradesTypes.UseTradesResult> = {},
): UseTradesTypes.UseTradesResult {
  return {
    trades,
    isLoading: false,
    isInitialLoading: false,
    error: null,
    refetch: jest.fn(),
    createTrade: jest.fn<UseTradesTypes.UseTradesResult['createTrade']>(),
    updateTrade: jest.fn<UseTradesTypes.UseTradesResult['updateTrade']>(),
    deleteTrade: jest.fn<UseTradesTypes.UseTradesResult['deleteTrade']>(),
    mergeTrade: jest.fn<UseTradesTypes.UseTradesResult['mergeTrade']>(),
    ...over,
  };
}

// ─── Harness ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let VendorsPage: any;

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="loc">{`${location.pathname}${location.search}`}</output>
      <output data-testid="loc-state">{JSON.stringify(location.state)}</output>
    </>
  );
}

function renderPage(
  url = '/companies',
  options: { state?: unknown; log?: RouterLog } = {},
): ReturnType<typeof render> & { log: RouterLog } {
  const log = options.log ?? createRouterLog();
  const tree: ReactNode = (
    <ToastProvider>
      <ShortcutRegistryProvider>
        <RecordingRouter entries={[options.state ? { url, state: options.state } : url]} log={log}>
          <VendorsPage />
          <LocationProbe />
        </RecordingRouter>
      </ShortcutRegistryProvider>
    </ToastProvider>
  );
  return { ...render(tree), log };
}

const loc = () => screen.getByTestId('loc').textContent;
const lastFetch = () => mockFetchVendors.mock.calls[mockFetchVendors.mock.calls.length - 1]![0]!;
const heading = () => screen.getByRole('heading', { level: 1 });

async function loaded() {
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
}

beforeEach(async () => {
  if (!VendorsPage) ({ VendorsPage } = await import('./VendorsPage.js'));
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue(response([ROOF_CO, TILE_CO, NO_TRADE_CO], 9));
  mockDeleteVendor.mockReset();
  mockFetchDeleteImpact.mockReset();
  mockFetchDeleteImpact.mockResolvedValue({ entityType: 'vendor', id: 'c1', effects: [] });
  mockUseTrades.mockReset();
  mockUseTrades.mockReturnValue(tradesResult([ROOFING, TILING]));
  managerProps.current = null;
});

describe('page identity and the trades gate', () => {
  it('titles the tab "Companies" and has the one Companies heading', async () => {
    renderPage();
    await loaded();

    expect(document.title).toContain('Companies');
    expect(heading()).toHaveTextContent('Companies');
  });

  it('shows the heading and a skeleton, and no list, until the trades have answered', async () => {
    mockUseTrades.mockReturnValue(tradesResult([], { isInitialLoading: true }));
    renderPage();

    expect(heading()).toHaveTextContent('Companies');
    expect(mockFetchVendors).not.toHaveBeenCalled();
    expect(screen.queryByTestId('companies-search')).not.toBeInTheDocument();
  });

  it('mounts the list once the trades answered, and keeps a deep-linked trade chip', async () => {
    renderPage('/companies?tradeId=t-tile');
    await loaded();

    expect(screen.getByTestId('companies-chip-t-tile')).toHaveAttribute('aria-pressed', 'true');
    expect(lastFetch()).toMatchObject({ tradeId: 't-tile' });
    expect(loc()).toContain('tradeId=t-tile');
  });

  it('shows the list without trade chips and the trades error when the trades failed', async () => {
    mockUseTrades.mockReturnValue(tradesResult([], { error: 'Trades could not be loaded.' }));
    renderPage();
    await loaded();

    expect(screen.getByText('Trades could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByTestId('companies-chip-all')).not.toBeInTheDocument();
    expect(screen.getByTestId('companies-row-c1')).toBeInTheDocument();
  });

  it('falls back to All for a trade that has been removed instead of filtering by it', async () => {
    renderPage('/companies?tradeId=t-gone');
    await loaded();

    await waitFor(() => expect(lastFetch()).not.toHaveProperty('tradeId'));
    expect(screen.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('absorbs an old ?page=2&pageSize=10 URL without an error', async () => {
    renderPage('/companies?page=2&pageSize=10');
    await loaded();

    expect(loc()).not.toContain('page');
    expect(lastFetch()).toMatchObject({ page: 1, pageSize: 100 });
    expect(screen.getByTestId('companies-row-c1')).toBeInTheDocument();
  });
});

describe('states and heading', () => {
  it('shows the skeleton, then the rows', async () => {
    renderPage();
    expect(screen.getByLabelText('Loading the list')).toBeInTheDocument();
    await loaded();
    expect(screen.getByTestId('companies-row-c2')).toBeInTheDocument();
  });

  it('shows the load failure with Retry', async () => {
    mockFetchVendors.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(
      await screen.findByText('Companies could not be loaded. Try again.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('companies-retry'));
    await loaded();

    expect(screen.getByTestId('companies-row-c1')).toBeInTheDocument();
  });

  it('shows the empty state with the New company action', async () => {
    mockFetchVendors.mockResolvedValue(response([]));
    const { log } = renderPage();

    expect(await screen.findByText('No companies yet')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'New company' })[0]!);
    expect(log.actions).toEqual(['PUSH /companies/new']);
  });

  it('shows the no-match state when a search finds nothing', async () => {
    mockFetchVendors.mockResolvedValue(response([], 9));
    renderPage('/companies?q=zzz');

    expect(await screen.findByText('No companies match.')).toBeInTheDocument();
  });

  it('always shows the count, and "(n of m)" with the trade scope total when searching', async () => {
    renderPage();
    await loaded();
    expect(heading()).toHaveTextContent('Companies (3)');

    document.body.innerHTML = '';
    mockFetchVendors.mockResolvedValue(response([TILE_CO], 9));
    renderPage('/companies?q=tiling');
    await loaded();
    expect(heading()).toHaveTextContent('Companies (1 of 9)');
  });
});

describe('trade chips', () => {
  it('lists All and the trades by displayed name, A to Z', async () => {
    renderPage();
    await loaded();

    const group = screen.getByRole('group', { name: 'Trade' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Roofing', 'Tiling', 'All']);
  });

  it('a chip writes tradeId with REPLACE and filters the request; All removes it', async () => {
    const { log } = renderPage();
    await loaded();

    await userEvent.click(screen.getByTestId('companies-chip-t-tile'));
    await waitFor(() => expect(lastFetch()).toMatchObject({ tradeId: 't-tile' }));
    expect(log.actions.at(-1)).toMatch(/^REPLACE .*tradeId=t-tile/);

    await userEvent.click(screen.getByTestId('companies-chip-all'));
    await waitFor(() => expect(lastFetch()).not.toHaveProperty('tradeId'));
    expect(screen.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('with more than four trades, the rest are in a More trades menu that sets the same chip', async () => {
    mockUseTrades.mockReturnValue(tradesResult([ROOFING, TILING, ELECTRICAL, PLUMBING, WALLS]));
    renderPage();
    await loaded();

    expect(screen.queryByTestId('companies-chip-t-wall')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('companies-chip-more'));
    await userEvent.click(await screen.findByTestId('companies-chip-more-t-wall'));

    await waitFor(() => expect(lastFetch()).toMatchObject({ tradeId: 't-wall' }));
    expect(screen.getByTestId('companies-chip-t-wall')).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no More trades menu with four trades or fewer', async () => {
    renderPage();
    await loaded();

    expect(screen.queryByTestId('companies-chip-more')).not.toBeInTheDocument();
  });

  it('has no chips when no trade has a company', async () => {
    mockUseTrades.mockReturnValue(tradesResult([trade('t-1', 'Unused', { vendorCount: 0 })]));
    renderPage();
    await loaded();

    expect(screen.queryByTestId('companies-chip-all')).not.toBeInTheDocument();
  });
});

describe('a selected trade that disappears while the Trades sheet is open (D11)', () => {
  /**
   * Opens the sheet with the URL's trade selected, then swaps the trades the way a refetch does
   * (the page re-renders with the new list) and reports a change.
   */
  async function changeTrades(
    url: string,
    next: UseTradesTypes.UseTradesResult,
    state?: unknown,
  ): Promise<RouterLog> {
    let setTrades: (value: UseTradesTypes.UseTradesResult) => void = () => undefined;
    const initial = tradesResult([ROOFING, TILING]);
    mockUseTrades.mockImplementation(() => {
      const [value, setValue] = useState(initial);
      setTrades = setValue;
      return value;
    });
    const { log } = renderPage(url, { state });
    await loaded();
    await userEvent.click(screen.getByTestId('stub-changed'));
    act(() => setTrades(next));
    return log;
  }

  it('falls back to All and reloads without tradeId when the trade is gone after a refetch', async () => {
    await changeTrades('/companies?trades=1&tradeId=t-tile', tradesResult([ROOFING]));

    await waitFor(() =>
      expect(screen.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true'),
    );
    await waitFor(() => expect(lastFetch()).not.toHaveProperty('tradeId'));
    expect(screen.queryByTestId('companies-chip-t-tile')).not.toBeInTheDocument();
  });

  it('keeps the tradesSheet location state through the reset, so closing the sheet goes back', async () => {
    const log = await changeTrades('/companies?trades=1&tradeId=t-tile', tradesResult([ROOFING]), {
      tradesSheet: true,
    });

    await waitFor(() =>
      expect(screen.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(JSON.parse(screen.getByTestId('loc-state').textContent ?? 'null')).toMatchObject({
      tradesSheet: true,
    });
    expect(loc()).toContain('trades=1');

    await userEvent.click(screen.getByTestId('stub-close'));

    expect(log.actions.at(-1)).toBe('GO -1');
  });

  it('changes nothing while the selected trade is still there', async () => {
    const log = await changeTrades(
      '/companies?trades=1&tradeId=t-tile',
      tradesResult([ROOFING, TILING, ELECTRICAL]),
    );

    expect(screen.getByTestId('companies-chip-t-tile')).toHaveAttribute('aria-pressed', 'true');
    expect(lastFetch()).toMatchObject({ tradeId: 't-tile' });
    expect(loc()).toContain('tradeId=t-tile');
    expect(log.actions.filter((a) => a.startsWith('REPLACE'))).toEqual([]);
  });

  it('does not reset the filter when the trades could not be reloaded', async () => {
    const log = await changeTrades(
      '/companies?trades=1&tradeId=t-tile',
      tradesResult([], { error: 'Trades could not be loaded.' }),
    );

    await screen.findByText('Trades could not be loaded.');
    expect(loc()).not.toContain('tradeId=all');
    expect(log.actions.filter((a) => a.includes('tradeId=all'))).toEqual([]);
  });

  it('does not reset when All is already selected', async () => {
    const log = await changeTrades('/companies?trades=1&tradeId=all', tradesResult([ROOFING]));

    expect(screen.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true');
    expect(log.actions.filter((a) => a.startsWith('REPLACE'))).toEqual([]);
  });

  it('does not reset when no trade is selected', async () => {
    const log = await changeTrades('/companies?trades=1', tradesResult([ROOFING]));

    expect(log.actions.filter((a) => a.startsWith('REPLACE'))).toEqual([]);
  });
});

describe('search and sort', () => {
  it('sends the typed text and the ids of trades whose displayed name contains it', async () => {
    renderPage();
    await loaded();

    await userEvent.type(screen.getByTestId('companies-search'), 'roof');

    await waitFor(() => expect(lastFetch()).toMatchObject({ q: 'roof', tradeIds: 't-roof' }));
  });

  it('keeps the active trade chip when the user sorts, and sends the sort', async () => {
    renderPage('/companies?tradeId=t-roof');
    await loaded();

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }));
    await userEvent.click(await screen.findByTestId('companies-sort-last_on_site'));

    await waitFor(() => expect(lastFetch()).toMatchObject({ sortBy: 'last_on_site' }));
    expect(lastFetch()).toMatchObject({ tradeId: 't-roof' });
    expect(loc()).toContain('tradeId=t-roof');
  });
});

describe('grouping', () => {
  it('Group by Trade lists the trades with No trade last and hides the Trade column', async () => {
    renderPage('/companies?group=trade');
    await loaded();

    const toggles = screen
      .getAllByTestId(/^companies-group-toggle-(?!mobile)/)
      .map((el) => el.getAttribute('data-testid'));
    expect(toggles).toEqual([
      'companies-group-toggle-t-roof',
      'companies-group-toggle-t-tile',
      'companies-group-toggle-__none__',
    ]);
    expect(screen.getByTestId('companies-group-toggle-t-roof')).toHaveTextContent('Roofing');
    expect(screen.getByTestId('companies-group-toggle-__none__')).toHaveTextContent('No trade');
    expect(screen.queryByRole('columnheader', { name: 'Trade' })).not.toBeInTheDocument();
  });

  it('shows the Trade column when not grouped', async () => {
    renderPage();
    await loaded();

    expect(screen.getByRole('columnheader', { name: 'Trade' })).toBeInTheDocument();
  });
});

describe('rows', () => {
  it('links the name to the company page and shows the translated trade, Still to pay and the dash for none', async () => {
    renderPage();
    await loaded();
    const row = screen.getByTestId('companies-row-c1');

    expect(within(row).getByTestId('companies-title-c1')).toHaveAttribute('href', '/companies/c1');
    expect(row).toHaveTextContent('Roofing');
    expect(within(row).getByTestId('company-still-to-pay-c1')).toHaveTextContent('€250.00');
    expect(within(row).getByTestId('company-still-to-pay-c1')).toHaveAttribute(
      'data-figure',
      'still-to-pay',
    );
  });

  it('has no duplicate test ids with a menu open', async () => {
    const { container } = renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('companies-row-menu-c1'));

    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  it('keeps the optional columns hidden by default', async () => {
    renderPage();
    await loaded();

    for (const name of ['E-mail', 'Address', 'Notes', 'Date added', 'Last updated']) {
      expect(screen.queryByRole('columnheader', { name })).not.toBeInTheDocument();
    }
    for (const name of ['Phone', 'Still to pay', 'Offers', 'Contact persons', 'Last on site']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });
});

describe('phone and Call (D-34 contact phone fallback, #2197)', () => {
  const calls = () =>
    screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('tel:'));

  it('D-34: shows the company phone with a Call button in the row and a full-width one in the card', async () => {
    renderPage();
    await loaded();

    const rowCall = screen.getByTestId('company-call-c1');
    expect(rowCall).toHaveAttribute('href', 'tel:5550142');
    expect(rowCall).toHaveAccessibleName('Call Sample Roofing Co on 555-0142');
    expect(rowCall.textContent).toBe('Call');
    expect(screen.getAllByText('555-0142').length).toBeGreaterThan(0);

    const cardCall = screen.getByTestId('company-call-mobile-c1');
    expect(cardCall).toHaveTextContent('Call 555-0142');
    expect(cardCall).toHaveAccessibleName('Call 555-0142, Sample Roofing Co');
  });

  it('D-34: falls back to the first contact phone as a tel link when the company has no phone', async () => {
    mockFetchVendors.mockResolvedValue(
      response([company({ phone: null, firstContactPhone: '555-0101' })]),
    );
    renderPage();
    await loaded();

    expect(new Set(calls().map((a) => a.getAttribute('href')))).toEqual(new Set(['tel:5550101']));
    expect(screen.getAllByText('555-0101').length).toBeGreaterThan(0);
  });

  it('D-34: falls back to the contact phone when the company phone is blank', async () => {
    mockFetchVendors.mockResolvedValue(
      response([company({ phone: '   ', firstContactPhone: '555-0101' })]),
    );
    renderPage();
    await loaded();

    expect(new Set(calls().map((a) => a.getAttribute('href')))).toEqual(new Set(['tel:5550101']));
  });

  it("D-34: prefers the company's own phone over the contact phone", async () => {
    mockFetchVendors.mockResolvedValue(
      response([company({ phone: '555-0102', firstContactPhone: '555-0103' })]),
    );
    renderPage();
    await loaded();

    expect(new Set(calls().map((a) => a.getAttribute('href')))).toEqual(new Set(['tel:5550102']));
    expect(screen.queryByText('555-0103')).not.toBeInTheDocument();
  });

  it('D-34: shows no Call button without a company phone or a contact phone', async () => {
    mockFetchVendors.mockResolvedValue(
      response([company({ phone: null, firstContactPhone: null })]),
    );
    renderPage();
    await loaded();

    expect(calls()).toHaveLength(0);
  });

  it('does not open the company when Call is clicked', async () => {
    const { log } = renderPage();
    await loaded();
    const swallow = (e: Event) => e.preventDefault();
    document.addEventListener('click', swallow);
    try {
      fireEvent.click(screen.getByTestId('company-call-c1'));
      fireEvent.click(screen.getByTestId('company-call-mobile-c1'));
    } finally {
      document.removeEventListener('click', swallow);
    }

    expect(log.actions).toEqual([]);
  });
});

describe('Trades sheet (⋯ › Trades)', () => {
  const openTradesFromMenu = async () => {
    await userEvent.click(screen.getByTestId('companies-page-menu'));
    await userEvent.click(await screen.findByTestId('companies-menu-trades'));
  };

  it('opens from the page ⋯ menu with a push that remembers it was pushed here', async () => {
    const { log } = renderPage();
    await loaded();

    await openTradesFromMenu();

    expect(await screen.findByTestId('trades-manager-stub')).toBeInTheDocument();
    expect(log.actions.at(-1)).toBe('PUSH /companies?trades=1');
    expect(JSON.parse(screen.getByTestId('loc-state').textContent ?? 'null')).toMatchObject({
      tradesSheet: true,
    });
  });

  it('keeps the existing router state (the origin) when it opens', async () => {
    renderPage('/companies', { state: { origin: 'home' } });
    await loaded();

    await openTradesFromMenu();

    await screen.findByTestId('trades-manager-stub');
    expect(JSON.parse(screen.getByTestId('loc-state').textContent ?? 'null')).toEqual({
      origin: 'home',
      tradesSheet: true,
    });
  });

  it('keeps the other query keys when it opens', async () => {
    renderPage('/companies?q=sample&tradeId=t-roof');
    await loaded();

    await openTradesFromMenu();

    await screen.findByTestId('trades-manager-stub');
    expect(loc()).toContain('q=sample');
    expect(loc()).toContain('tradeId=t-roof');
    expect(loc()).toContain('trades=1');
  });

  it('does not refetch the companies when the sheet opens and closes', async () => {
    renderPage();
    await loaded();
    const before = mockFetchVendors.mock.calls.length;

    await openTradesFromMenu();
    await userEvent.click(await screen.findByTestId('stub-close'));

    await waitFor(() => expect(screen.queryByTestId('trades-manager-stub')).toBeNull());
    expect(mockFetchVendors.mock.calls.length).toBe(before);
  });

  it('closes by going back when this page pushed the sheet', async () => {
    const { log } = renderPage();
    await loaded();
    await openTradesFromMenu();

    await userEvent.click(await screen.findByTestId('stub-close'));

    await waitFor(() => expect(log.actions.at(-1)).toBe('GO -1'));
    expect(loc()).not.toContain('trades=1');
  });

  it('opened by URL, closing replaces the entry without the trades key', async () => {
    const { log } = renderPage('/companies?trades=1&q=sample');
    await screen.findByTestId('trades-manager-stub');

    await userEvent.click(screen.getByTestId('stub-close'));

    await waitFor(() => expect(screen.queryByTestId('trades-manager-stub')).toBeNull());
    expect(log.actions.at(-1)).toMatch(/^REPLACE/);
    expect(loc()).toContain('q=sample');
    expect(loc()).not.toContain('trades=1');
  });

  it('treats ?trades=1 as a mode, not a filter', async () => {
    renderPage('/companies?trades=1');
    await loaded();

    for (const call of mockFetchVendors.mock.calls) {
      expect(call[0]).not.toHaveProperty('trades');
    }
  });

  it('returns focus to the page ⋯ menu button as the sheet closes', async () => {
    renderPage();
    await loaded();
    await openTradesFromMenu();
    await screen.findByTestId('trades-manager-stub');

    expect(managerProps.current?.returnFocusRef?.current).toBe(
      screen.getByTestId('companies-page-menu'),
    );
  });

  it('refetches trades and companies when the sheet reports a change', async () => {
    const refetch = jest.fn();
    mockUseTrades.mockReturnValue(tradesResult([ROOFING, TILING], { refetch }));
    renderPage('/companies?trades=1');
    await loaded();
    const before = mockFetchVendors.mock.calls.length;

    await userEvent.click(screen.getByTestId('stub-changed'));

    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockFetchVendors.mock.calls.length).toBe(before + 1));
  });

  it('turns off the n shortcut while the sheet is open', async () => {
    const { log } = renderPage('/companies?trades=1');
    await screen.findByTestId('trades-manager-stub');

    fireEvent.keyDown(document, { key: 'n' });

    expect(log.actions).toEqual([]);
  });
});

describe('creating a company', () => {
  it('New company pushes /companies/new', async () => {
    const { log } = renderPage();
    await loaded();

    await userEvent.click(screen.getByTestId('new-company-button'));

    expect(log.actions.at(-1)).toBe('PUSH /companies/new');
  });

  it('the n shortcut opens the same dialog route', async () => {
    const { log } = renderPage();
    await loaded();

    await userEvent.keyboard('n');

    expect(log.actions.at(-1)).toBe('PUSH /companies/new');
  });

  it('replaces ?create=1 with the dialog route (deep-link mode)', async () => {
    const { log } = renderPage('/companies?create=1');

    await waitFor(() => expect(log.actions).toContain('REPLACE /companies/new'));
  });

  it('does not treat create as a filter, and does nothing without ?create=1', async () => {
    const { log } = renderPage();
    await loaded();

    expect(log.actions).toEqual([]);
    for (const call of mockFetchVendors.mock.calls) {
      expect(call[0]).not.toHaveProperty('create');
    }
  });

  it('reloads when a company is created elsewhere', async () => {
    renderPage();
    await loaded();
    mockFetchVendors.mockClear();

    act(() => notifyObjectCreated('company'));

    await waitFor(() => expect(mockFetchVendors).toHaveBeenCalled());
  });
});

describe('delete', () => {
  async function openDelete(id = 'c2') {
    await userEvent.click(screen.getByTestId(`companies-row-menu-${id}`));
    await userEvent.click(await screen.findByTestId(`company-delete-${id}`));
    return screen.findByRole('alertdialog');
  }

  it('offers Open and Delete in the row menu', async () => {
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('companies-row-menu-c1'));

    expect(await screen.findByTestId('company-open-c1')).toBeInTheDocument();
    expect(screen.getByTestId('company-delete-c1')).toBeInTheDocument();
  });

  it('opens a confirm named for the company, nothing deleted yet', async () => {
    renderPage();
    await loaded();

    const dialog = await openDelete();

    expect(dialog).toHaveTextContent('Example Tiling Co');
    expect(mockDeleteVendor).not.toHaveBeenCalled();
  });

  it('lists what the delete also changes, from the delete-impact endpoint', async () => {
    mockFetchDeleteImpact.mockResolvedValue({
      entityType: 'vendor',
      id: 'c2',
      effects: [{ kind: 'unlink', entity: 'diary_entry', count: 2 }] as never,
    });
    renderPage();
    await loaded();

    await openDelete();

    await waitFor(() => expect(mockFetchDeleteImpact).toHaveBeenCalledWith('vendor', 'c2'));
  });

  it('deletes, reloads the list and puts focus on the heading', async () => {
    mockDeleteVendor.mockResolvedValue(undefined as never);
    renderPage();
    await loaded();
    const dialog = await openDelete();
    mockFetchVendors.mockResolvedValue(response([ROOF_CO, NO_TRADE_CO], 8));

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByTestId('companies-row-c2')).toBeNull());
    expect(mockDeleteVendor).toHaveBeenCalledWith('c2');
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('a 409 shows the blocked message and no way to retry', async () => {
    mockDeleteVendor.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(
      await within(dialog).findByText(/can't be deleted while invoices or cost lines/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^delete$/i })).toBeNull();
    expect(screen.getByTestId('companies-row-c2')).toBeInTheDocument();
  });

  it('another API failure shows the translated message and keeps the action', async () => {
    mockDeleteVendor.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'An unexpected error occurred. Please try again.',
    );
    expect(within(dialog).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('a network failure shows its own message', async () => {
    mockDeleteVendor.mockRejectedValue(new NetworkError('offline', null));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('Cancel closes without deleting and puts focus on the heading', async () => {
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockDeleteVendor).not.toHaveBeenCalled();
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('cancel is ignored while the delete is running', async () => {
    let finish: () => void = () => undefined;
    mockDeleteVendor.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$|deleting/i }));
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('column preferences', () => {
  it('ignores stored keys of the old page that no longer exist', async () => {
    window.localStorage.setItem('table.companies.columns', JSON.stringify(['name', 'phone']));
    renderPage();
    await loaded();

    expect(screen.getByRole('columnheader', { name: 'Phone' })).toBeInTheDocument();
  });
});
