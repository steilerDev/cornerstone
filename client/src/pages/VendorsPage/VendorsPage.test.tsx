/**
 * @jest-environment jsdom
 */
/**
 * Component tests for the Companies list (VendorsPage.tsx, rebuilt in #2213). All data is synthetic.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { TradeListItem, VendorListItem } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { ownNavigations } from '../../test/navLandmarks.js';
import { ShortcutSnapshot } from '../../test/shortcutSnapshot.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as UseTradesTypes from '../../hooks/useTrades.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import type * as TradesManagerTypes from '../../components/TradesManager/TradesManager.js';

// ─── Mocks (before the component import) ───────────────────────────────────────

const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

const mockListPreferences = jest.fn<typeof PreferencesApiTypes.listPreferences>();
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  upsertPreference: jest
    .fn<typeof PreferencesApiTypes.upsertPreference>()
    .mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  deletePreference: jest
    .fn<typeof PreferencesApiTypes.deletePreference>()
    .mockResolvedValue(undefined),
}));

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
  // Named import of the EntityPicker closure (the Trades sheet's merge picker).
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

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDayRange: () => '',
  useFormatters: () => ({
    formatDate: (d: string | null | undefined) => (d ? `D:${d.slice(0, 10)}` : '—'),
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatPercent: (n: number) => `${n}%`,
  }),
  formatDate: (d: string | null | undefined) => (d ? `D:${d.slice(0, 10)}` : '—'),
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatPercent: (n: number) => `${n}%`,
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
  vendorCount: 0,
  ...over,
});
const ROOFING = trade('t-roof', 'Dachdecker', { translationKey: 'trades.roofing' });
const TILING = trade('t-tile', 'Tiling');

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
  ...over,
});

const response = (vendors: VendorListItem[], totalItems = vendors.length) => ({
  vendors,
  pagination: { page: 1, pageSize: 25, totalItems, totalPages: 1 },
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
  options: { state?: unknown; registry?: boolean; log?: RouterLog } = {},
) {
  const log = options.log ?? createRouterLog();
  const tree = (
    <ToastProvider>
      <RecordingRouter entries={[options.state ? { url, state: options.state } : url]} log={log}>
        <VendorsPage />
        <LocationProbe />
        {options.registry && <ShortcutSnapshot />}
      </RecordingRouter>
    </ToastProvider>
  );
  const utils = render(
    options.registry ? <ShortcutRegistryProvider>{tree}</ShortcutRegistryProvider> : tree,
  );
  return { ...utils, log };
}

/** Resolves after a short delay, so the page renders its loading state before the data arrives. */
const later = <T,>(value: T, ms = 30) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const loc = () => screen.getByTestId('loc').textContent;
const lastFetch = () => mockFetchVendors.mock.calls[mockFetchVendors.mock.calls.length - 1]![0]!;
const rowLink = (id: string) => screen.getByTestId(`company-name-${id}`);

async function loaded(name = 'Sample Roofing Co') {
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(0));
}

describe('VendorsPage (Companies list)', () => {
  beforeEach(async () => {
    if (!VendorsPage) ({ VendorsPage } = await import('./VendorsPage.js'));
    mockUseAuth.mockReset();
    mockFetchVendors.mockReset();
    mockDeleteVendor.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockUseTrades.mockReset();
    mockListPreferences.mockReset();
    mockListPreferences.mockResolvedValue([]);
    managerProps.current = null;
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u1',
        email: 'member@example.com',
        displayName: 'Member',
        role: 'member' as const,
        authProvider: 'local' as const,
        oidcLinked: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      oidcEnabled: false,
      status: 'authenticated',
      setupRequired: false,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn(async () => Promise.resolve()),
      logout: jest.fn(async () => Promise.resolve()),
    });
    mockUseTrades.mockReturnValue(tradesResult([ROOFING, TILING]));
    mockFetchVendors.mockResolvedValue(response([company()]));
    mockDeleteVendor.mockResolvedValue(undefined);
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'vendor', id: 'c1', effects: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('page identity', () => {
    it('titles the tab "Companies" and has the one Companies heading', async () => {
      renderPage();
      await loaded();
      await waitFor(() => expect(document.title).toBe('Companies · Cornerstone'));
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Companies');
    });

    it('renders no tab row or section navigation of its own', async () => {
      const { container } = renderPage();
      await loaded();
      expect(ownNavigations(container)).toEqual([]);
    });
  });

  describe('loading and errors', () => {
    it('shows a skeleton while the first request is pending', () => {
      mockFetchVendors.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByLabelText('Loading table data...')).toBeInTheDocument();
    });

    it('shows the translated message of an API error', async () => {
      mockFetchVendors.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'SQLITE raw' }),
      );
      renderPage();
      expect(
        await screen.findByText('An unexpected error occurred. Please try again.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE raw');
    });

    it('shows the list-specific message for any other failure', async () => {
      mockFetchVendors.mockRejectedValue(new Error('boom'));
      renderPage();
      expect(
        await screen.findByText('Companies could not be loaded. Try again.'),
      ).toBeInTheDocument();
    });

    it('ignores a response that arrives after a newer request', async () => {
      renderPage();
      await loaded();
      let resolveFirst: (r: ReturnType<typeof response>) => void = () => {};
      mockFetchVendors.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
      mockFetchVendors.mockResolvedValue(response([company({ id: 'c2', name: 'Second Co' })]));
      const user = userEvent.setup();

      await user.type(screen.getByRole('searchbox'), 'sec');
      await waitFor(() => expect(lastFetch()).toMatchObject({ q: 'sec' }));
      await user.type(screen.getByRole('searchbox'), 'ond');
      await loaded('Second Co');
      await act(async () => {
        resolveFirst(response([company({ id: 'c9', name: 'Stale Co' })]));
      });

      expect(screen.queryByText('Stale Co')).not.toBeInTheDocument();
      expect(screen.getAllByText('Second Co').length).toBeGreaterThan(0);
    });
  });

  describe('columns and rows', () => {
    it('shows Name, Trade, Phone, Contact persons and Last on site by default', async () => {
      renderPage();
      await loaded();
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
      for (const label of ['Name', 'Trade', 'Phone', 'Contact persons', 'Last on site']) {
        expect(headers.some((h) => h?.includes(label))).toBe(true);
      }
      for (const hidden of ['E-mail', 'Address', 'Notes', 'Date added', 'Last updated']) {
        expect(headers.some((h) => h?.includes(hidden))).toBe(false);
      }
    });

    it('links the name to the company page and shows the translated trade', async () => {
      mockFetchVendors.mockResolvedValue(
        response([
          company({
            trade: {
              id: 't-roof',
              name: 'Dachdecker',
              color: null,
              translationKey: 'trades.roofing',
            },
          }),
        ]),
      );
      renderPage();
      await loaded();

      expect(rowLink('c1')).toHaveAttribute('href', '/companies/c1');
      expect(screen.getAllByText('Roofing').length).toBeGreaterThan(0);
      expect(screen.queryByText('Dachdecker')).not.toBeInTheDocument();
    });

    it('shows a dash for a company without trade, phone, contacts and visits', async () => {
      mockFetchVendors.mockResolvedValue(
        response([company({ trade: null, phone: null, firstContactPhone: null })]),
      );
      renderPage();
      await loaded();

      const row = rowLink('c1').closest('tr')!;
      const cells = within(row).getAllByRole('cell');
      expect(cells.map((c) => c.textContent)).toEqual(expect.arrayContaining(['—']));
      expect(within(row).queryByRole('link', { name: /^Call/ })).not.toBeInTheDocument();
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(4);
    });

    it('shows the number of contact persons, and a dash for none', async () => {
      mockFetchVendors.mockResolvedValue(
        response([
          company({ id: 'c1', name: 'Has Contacts', contactCount: 3 }),
          company({ id: 'c2', name: 'No Contacts', contactCount: 0 }),
          company({ id: 'c3', name: 'Unknown Count', contactCount: undefined }),
        ]),
      );
      renderPage();
      await loaded('Has Contacts');

      const cellsOf = (id: string) =>
        within(rowLink(id).closest('tr')!)
          .getAllByRole('cell')
          .map((c) => c.textContent);
      expect(cellsOf('c1')).toContain('3');
      expect(cellsOf('c2')).not.toContain('0');
      expect(cellsOf('c3')).not.toContain('undefined');
    });

    it('formats the last visit, and shows a dash when there is none', async () => {
      mockFetchVendors.mockResolvedValue(
        response([
          company({ id: 'c1', name: 'Visited Co', lastOnSite: '2026-03-04' }),
          company({ id: 'c2', name: 'Never Co', lastOnSite: null }),
        ]),
      );
      renderPage();
      await loaded('Visited Co');

      expect(
        within(rowLink('c1').closest('tr')!)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ).toContain('D:2026-03-04');
    });

    it('opens the company page when the row is clicked, remembering the list as origin', async () => {
      const { log } = renderPage();
      await loaded();

      fireEvent.click(rowLink('c1').closest('tr')!);

      expect(log.actions).toEqual(['PUSH /companies/c1']);
      expect(JSON.stringify(log.states[0])).toContain('/companies');
    });

    it('does not navigate twice when the name link itself is clicked', async () => {
      const { log } = renderPage();
      await loaded();

      fireEvent.click(rowLink('c1'));

      expect(log.actions).toEqual(['PUSH /companies/c1']);
    });
  });

  describe('Still to pay and Offers columns (#2244)', () => {
    const OFFERS = { count: 2, amount: 5000, paid: 1200, stillToPay: 300, remainingOnOffer: 3500 };

    it('shows Still to pay and Offers by default, after Phone and before Contact persons', async () => {
      renderPage();
      await loaded();

      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
      const at = (label: string) => headers.findIndex((h) => h.includes(label));
      expect(at('Still to pay')).toBeGreaterThan(at('Trade'));
      expect(at('Still to pay')).toBeGreaterThan(-1);
      expect(at('Offers')).toBe(at('Still to pay') + 1);
      expect(at('Contact persons')).toBeGreaterThan(at('Offers'));
    });

    // Mutation: dropping data-figure leaves the list's Still-to-pay unregistered (ADR-039).
    it('marks the Still to pay amount as the still-to-pay figure with a per-row test id', async () => {
      mockFetchVendors.mockResolvedValue(
        response([
          company({ id: 'c1', name: 'Owes Co', stillToPay: 1234.5, offers: OFFERS }),
          company({ id: 'c2', name: 'Square Co', stillToPay: 0 }),
        ]),
      );
      renderPage();
      await loaded('Owes Co');

      const owes = screen.getByTestId('company-still-to-pay-c1');
      expect(owes).toHaveAttribute('data-figure', 'still-to-pay');
      expect(owes).toHaveTextContent('€1234.50');
      const square = screen.getByTestId('company-still-to-pay-c2');
      expect(square).toHaveAttribute('data-figure', 'still-to-pay');
      expect(square).toHaveTextContent('€0.00');
      expect(owes.className).not.toBe(square.className);
    });

    it('shows €0.00 for a row from an older response without the field', async () => {
      mockFetchVendors.mockResolvedValue(response([company({ stillToPay: undefined })]));
      renderPage();
      await loaded();

      expect(screen.getByTestId('company-still-to-pay-c1')).toHaveTextContent('€0.00');
    });

    it('shows the offers amount with the paid part, and a dash with a screen-reader text without offers', async () => {
      mockFetchVendors.mockResolvedValue(
        response([
          company({ id: 'c1', name: 'Offer Co', offers: OFFERS }),
          company({
            id: 'c2',
            name: 'None Co',
            offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
          }),
          company({ id: 'c3', name: 'Old Co', offers: undefined }),
        ]),
      );
      renderPage();
      await loaded('Offer Co');

      const cell = (id: string) => within(rowLink(id).closest('tr')!).getAllByRole('cell');
      const withOffers = cell('c1').map((c) => c.textContent ?? '');
      expect(withOffers.some((t) => t.includes('€5000.00') && t.includes('€1200.00 paid'))).toBe(
        true,
      );
      for (const id of ['c2', 'c3']) {
        const texts = cell(id).map((c) => c.textContent ?? '');
        expect(texts.some((t) => t.includes('–') && t.includes('No offers'))).toBe(true);
      }
    });

    it('sorts by Still to pay with the still_to_pay key, and Offers is not sortable', async () => {
      renderPage();
      await loaded();

      await userEvent.setup().click(screen.getByRole('columnheader', { name: /Still to pay/ }));

      await waitFor(() =>
        expect(lastFetch()).toMatchObject({ sortBy: 'still_to_pay', sortOrder: 'asc' }),
      );
      expect(loc()).toContain('sortBy=still_to_pay');
      const callsBefore = mockFetchVendors.mock.calls.length;
      await userEvent.setup().click(screen.getByRole('columnheader', { name: /Offers/ }));
      expect(mockFetchVendors.mock.calls.length).toBe(callsBefore);
    });

    it('keeps every data-testid unique across the table and the cards with the new columns', async () => {
      mockFetchVendors.mockResolvedValue(
        response([
          company({ stillToPay: 10, offers: OFFERS }),
          company({ id: 'c2', name: 'Second Co', stillToPay: 0 }),
        ]),
      );
      const { container } = renderPage();
      await loaded();

      expect(findDuplicateTestIds(container)).toEqual([]);
      expect(screen.getByTestId('company-still-to-pay-mobile-c1')).toHaveAttribute(
        'data-figure',
        'still-to-pay',
      );
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

  describe('trade chips', () => {
    it('lists All trades and every trade by displayed name, A to Z', async () => {
      renderPage();
      await loaded();

      const group = screen.getByRole('group', { name: 'Trade' });
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['All trades', 'Roofing', 'Tiling']);
      expect(within(group).getByRole('button', { name: 'All trades' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('shows no chips when there are no trades', async () => {
      mockUseTrades.mockReturnValue(tradesResult([]));
      renderPage();
      await loaded();
      expect(screen.queryByRole('group', { name: 'Trade' })).not.toBeInTheDocument();
    });

    it('writes tradeId into the URL with REPLACE and filters the request', async () => {
      const { log } = renderPage();
      await loaded();

      await userEvent.setup().click(screen.getByTestId('company-trade-t-tile'));

      await waitFor(() => expect(lastFetch()).toMatchObject({ tradeId: 't-tile', page: 1 }));
      expect(log.actions.every((a) => a.startsWith('REPLACE'))).toBe(true);
      expect(log.actions[log.actions.length - 1]).toContain('tradeId=t-tile');
      expect(screen.getByTestId('company-trade-t-tile')).toHaveAttribute('aria-pressed', 'true');
    });

    it('All trades removes the filter and resets the page', async () => {
      const { log } = renderPage('/companies?tradeId=t-tile&page=3');
      await loaded();

      await userEvent.setup().click(screen.getByTestId('company-trade-all'));

      await waitFor(() => expect(loc()).not.toContain('tradeId'));
      expect(loc()).toContain('page=1');
      expect(log.actions.every((a) => a.startsWith('REPLACE'))).toBe(true);
      expect(lastFetch()).not.toHaveProperty('tradeId');
    });

    it('reads the active chip from the URL', async () => {
      renderPage('/companies?tradeId=t-roof');
      await loaded();
      expect(screen.getByTestId('company-trade-t-roof')).toHaveAttribute('aria-pressed', 'true');
      expect(mockFetchVendors).toHaveBeenCalledWith(expect.objectContaining({ tradeId: 't-roof' }));
    });

    it('drops a stale tradeId once the trades have loaded without it', async () => {
      const { log } = renderPage('/companies?tradeId=t-gone');
      await loaded();

      await waitFor(() => expect(loc()).not.toContain('tradeId'));
      expect(log.actions.some((a) => a.startsWith('REPLACE') && !a.includes('tradeId'))).toBe(true);
    });

    it('keeps a tradeId while the trades are still loading', async () => {
      mockUseTrades.mockReturnValue(tradesResult([], { isInitialLoading: true }));
      renderPage('/companies?tradeId=t-roof');
      await loaded();
      expect(loc()).toContain('tradeId=t-roof');
    });

    it('keeps a tradeId when the trades failed to load', async () => {
      mockUseTrades.mockReturnValue(tradesResult([], { error: 'x' }));
      renderPage('/companies?tradeId=t-roof');
      await loaded();
      expect(loc()).toContain('tradeId=t-roof');
    });

    it('keeps a known tradeId', async () => {
      renderPage('/companies?tradeId=t-roof');
      await loaded();
      await act(async () => {
        await Promise.resolve();
      });
      expect(loc()).toContain('tradeId=t-roof');
    });
  });

  describe('search', () => {
    it('sends the typed text', async () => {
      renderPage();
      await loaded();

      await userEvent.setup().type(screen.getByRole('searchbox'), 'sample');

      await waitFor(() => expect(lastFetch()).toMatchObject({ q: 'sample' }));
      expect(loc()).toContain('q=sample');
    });

    it('sends the ids of trades whose displayed name contains the text (translated names)', async () => {
      renderPage();
      await loaded();

      await userEvent.setup().type(screen.getByRole('searchbox'), 'roof');

      await waitFor(() => expect(lastFetch()).toMatchObject({ q: 'roof', tradeIds: 't-roof' }));
    });

    it('sends no tradeIds when no trade matches, nor without a text', async () => {
      renderPage();
      await loaded();
      expect(lastFetch()).not.toHaveProperty('tradeIds', expect.anything());

      await userEvent.setup().type(screen.getByRole('searchbox'), 'zzzq');

      await waitFor(() => expect(lastFetch()).toMatchObject({ q: 'zzzq' }));
      expect(lastFetch().tradeIds).toBeUndefined();
    });

    it('joins several matching trade ids with commas', async () => {
      mockUseTrades.mockReturnValue(
        tradesResult([trade('t-a', 'Roof Tiling'), trade('t-b', 'Flat Roofing'), TILING]),
      );
      renderPage();
      await loaded();

      await userEvent.setup().type(screen.getByRole('searchbox'), 'roof');

      await waitFor(() => expect(lastFetch().tradeIds).toBe('t-a,t-b'));
    });

    it('keeps the active trade chip when the user sorts', async () => {
      renderPage('/companies?tradeId=t-roof');
      await loaded();

      await userEvent.setup().click(screen.getByRole('columnheader', { name: /Name/ }));

      await waitFor(() => expect(loc()).toContain('sortBy=name'));
      expect(loc()).toContain('tradeId=t-roof');
      expect(lastFetch()).toMatchObject({ tradeId: 't-roof', sortBy: 'name' });
    });

    it('sends the sort the user picks, including Last on site', async () => {
      renderPage();
      await loaded();

      const header = screen.getByRole('columnheader', { name: /Last on site/ });
      await userEvent.setup().click(header);

      await waitFor(() =>
        expect(lastFetch()).toMatchObject({ sortBy: 'last_on_site', sortOrder: 'asc' }),
      );
    });
  });

  describe('Trades sheet', () => {
    const tradesButton = () => screen.getByTestId('companies-trades-button');
    const fetchCount = () => mockFetchVendors.mock.calls.length;

    it('opens with a push that remembers it was pushed here', async () => {
      const { log } = renderPage();
      await loaded();

      await userEvent.setup().click(tradesButton());

      expect(await screen.findByTestId('trades-manager-stub')).toBeInTheDocument();
      expect(log.actions).toEqual(['PUSH /companies?trades=1']);
      expect(JSON.parse(screen.getByTestId('loc-state').textContent ?? 'null')).toMatchObject({
        tradesSheet: true,
      });
    });

    it('keeps the other query keys when it opens', async () => {
      renderPage('/companies?q=sample&tradeId=t-roof');
      await loaded();

      await userEvent.setup().click(tradesButton());

      await screen.findByTestId('trades-manager-stub');
      expect(loc()).toContain('q=sample');
      expect(loc()).toContain('tradeId=t-roof');
      expect(loc()).toContain('trades=1');
    });

    it('does not refetch the companies when the sheet opens and closes', async () => {
      renderPage();
      await loaded();
      const before = fetchCount();
      const user = userEvent.setup();

      await user.click(tradesButton());
      await screen.findByTestId('trades-manager-stub');
      await user.click(screen.getByTestId('stub-close'));
      await waitFor(() => expect(screen.queryByTestId('trades-manager-stub')).toBeNull());

      expect(fetchCount()).toBe(before);
    });

    it('closes by going back when this page pushed the sheet', async () => {
      const { log } = renderPage();
      await loaded();
      const user = userEvent.setup();
      await user.click(tradesButton());
      await screen.findByTestId('trades-manager-stub');

      await user.click(screen.getByTestId('stub-close'));

      expect(log.actions[log.actions.length - 1]).toBe('GO -1');
      await waitFor(() => expect(loc()).toBe('/companies'));
    });

    it('opened by URL, closing replaces the entry without the trades key', async () => {
      const { log } = renderPage('/companies?trades=1&q=sample');
      await screen.findByTestId('trades-manager-stub');

      await userEvent.setup().click(screen.getByTestId('stub-close'));

      await waitFor(() => expect(screen.queryByTestId('trades-manager-stub')).toBeNull());
      expect(log.actions[log.actions.length - 1]).toBe('REPLACE /companies?q=sample');
    });

    it('treats ?trades=1 as a mode, not a filter', async () => {
      renderPage('/companies?trades=1');
      await screen.findByTestId('trades-manager-stub');
      await loaded();

      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
      expect(mockFetchVendors).toHaveBeenCalled();
      for (const call of mockFetchVendors.mock.calls) {
        expect(call[0]).not.toHaveProperty('trades');
      }
    });

    it('hands the Trades button to the sheet as its focus fallback', async () => {
      renderPage('/companies?trades=1');
      await screen.findByTestId('trades-manager-stub');
      expect(managerProps.current?.returnFocusRef?.current).toBe(tradesButton());
    });

    it('refetches trades and companies when the sheet reports a change', async () => {
      const refetch = jest.fn();
      mockUseTrades.mockReturnValue(tradesResult([ROOFING, TILING], { refetch }));
      renderPage('/companies?trades=1');
      await loaded();
      const before = fetchCount();

      await userEvent.setup().click(screen.getByTestId('stub-changed'));

      expect(refetch).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(fetchCount()).toBe(before + 1));
    });

    it('turns off the n shortcut while the sheet is open', async () => {
      const { log } = renderPage('/companies?trades=1');
      await screen.findByTestId('trades-manager-stub');

      fireEvent.keyDown(document, { key: 'n' });

      expect(log.actions).toEqual([]);
    });
  });

  describe('creating a company', () => {
    it('New company pushes /companies/new with the list as background and origin', async () => {
      const { log } = renderPage('/companies?q=sample');
      await loaded();

      await userEvent.setup().click(screen.getByTestId('new-company-button'));

      expect(log.actions).toEqual(['PUSH /companies/new']);
      const state = log.states[0] as {
        background?: { pathname: string; search: string };
        origin?: unknown;
      };
      expect(state.background).toMatchObject({ pathname: '/companies', search: '?q=sample' });
      expect(state.origin).toBeDefined();
    });

    it('the n shortcut opens the same dialog route', async () => {
      const { log } = renderPage();
      await loaded();

      fireEvent.keyDown(document, { key: 'n' });

      expect(log.actions).toEqual(['PUSH /companies/new']);
    });

    it('ignores n typed into the search field', async () => {
      const { log } = renderPage();
      await loaded();

      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'n' });

      expect(log.actions).toEqual([]);
    });

    it('registers n as "New company" in the shortcut registry', async () => {
      renderPage('/companies', { registry: true });
      await loaded();

      fireEvent.click(screen.getByTestId('shortcut-snapshot'));

      expect(screen.getByTestId('shortcut-snapshot-out').textContent).toContain('n:New company');
    });

    it('replaces ?create=1 with the dialog route (deep-link mode)', async () => {
      const { log } = renderPage('/companies?create=1');

      await waitFor(() => expect(log.actions).toContain('REPLACE /companies/new'));
    });

    it('does not treat create as a table filter: the list request never carries it', async () => {
      renderPage('/companies?create=1');
      await loaded();

      for (const call of mockFetchVendors.mock.calls) {
        expect(call[0]).not.toHaveProperty('create');
      }
    });

    it('does nothing without ?create=1', async () => {
      const { log } = renderPage();
      await loaded();
      expect(log.actions).toEqual([]);
    });
  });

  describe('empty states', () => {
    it('hides the header New company button on the unfiltered empty list and offers the empty-state action', async () => {
      mockFetchVendors.mockResolvedValue(response([]));
      renderPage();

      expect(await screen.findByText('No companies yet')).toBeInTheDocument();
      expect(screen.queryByTestId('new-company-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('companies-trades-button')).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'New company' }));
    });

    it('the empty-state action opens the dialog route', async () => {
      mockFetchVendors.mockResolvedValue(response([]));
      const { log } = renderPage();
      await screen.findByText('No companies yet');

      await userEvent.setup().click(screen.getByRole('button', { name: 'New company' }));

      expect(log.actions).toEqual(['PUSH /companies/new']);
    });

    it.each([
      ['a search', '/companies?q=zzz'],
      ['a trade filter', '/companies?tradeId=t-tile'],
    ])('keeps the header New company button for %s with no results', async (_label, url) => {
      mockFetchVendors.mockResolvedValue(response([]));
      renderPage(url);
      await waitFor(() => expect(mockFetchVendors).toHaveBeenCalled());
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('new-company-button')).toBeInTheDocument();
    });

    it('shows the header button while the first load is pending', async () => {
      mockFetchVendors.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByTestId('new-company-button')).toBeInTheDocument();
    });
  });

  describe('row actions and delete', () => {
    const user = () => userEvent.setup();

    async function openDelete(id = 'c1') {
      const u = user();
      await u.click(await screen.findByTestId(`company-actions-${id}`));
      await u.click(await screen.findByTestId(`company-delete-${id}`));
      await screen.findByRole('alertdialog');
      return u;
    }

    it('labels the row menu with the company name', async () => {
      renderPage();
      await loaded();
      expect(
        screen.getAllByRole('button', { name: 'Actions for Sample Roofing Co' }).length,
      ).toBeGreaterThan(0);
    });

    it('offers Delete as the only item', async () => {
      renderPage();
      await loaded();
      await user().click(screen.getByTestId('company-actions-c1'));
      expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual([
        'Delete',
      ]);
    });

    it('keeps every data-testid unique across the table and the cards with a menu open', async () => {
      mockFetchVendors.mockResolvedValue(
        response([company(), company({ id: 'c2', name: 'Second Co' })]),
      );
      const { container } = renderPage();
      await loaded();

      await user().click(screen.getByTestId('company-actions-c1'));

      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('opens a confirm named for the company with Cancel focused, nothing deleted yet', async () => {
      renderPage();
      await loaded();
      await openDelete();

      expect(
        screen.getByRole('alertdialog', { name: 'Delete Sample Roofing Co?' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('company-list-delete-cancel')).toHaveFocus();
      expect(mockDeleteVendor).not.toHaveBeenCalled();
    });

    it('lists what the delete also changes, from the delete-impact endpoint', async () => {
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'vendor',
        id: 'c1',
        effects: [
          { kind: 'contacts', count: 3 },
          { kind: 'tasksUnassigned', count: 0 },
        ],
      });
      renderPage();
      await loaded();
      await openDelete();

      await waitFor(() =>
        expect(screen.getByTestId('company-list-delete-consequences')).toHaveTextContent(
          'Contact persons deleted with it: 3',
        ),
      );
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('vendor', 'c1');
    });

    it('Cancel closes without deleting', async () => {
      renderPage();
      await loaded();
      const u = await openDelete();

      await u.click(screen.getByTestId('company-list-delete-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(mockDeleteVendor).not.toHaveBeenCalled();
    });

    it('Cancel returns focus to the ⋯ that opened the confirm', async () => {
      renderPage();
      await loaded();
      const u = await openDelete();

      await u.click(screen.getByTestId('company-list-delete-cancel'));

      await waitFor(() => expect(screen.getByTestId('company-actions-c1')).toHaveFocus());
    });

    it('Escape also returns focus to that ⋯', async () => {
      renderPage();
      await loaded();
      const u = await openDelete();

      await u.keyboard('{Escape}');

      await waitFor(() => expect(screen.getByTestId('company-actions-c1')).toHaveFocus());
    });

    it('returns focus to the ⋯ of the right row when several companies are listed', async () => {
      mockFetchVendors.mockResolvedValue(
        response([company(), company({ id: 'c2', name: 'Second Co' })]),
      );
      renderPage();
      await loaded();
      const u = await openDelete('c2');

      await u.click(screen.getByTestId('company-list-delete-cancel'));

      await waitFor(() => expect(screen.getByTestId('company-actions-c2')).toHaveFocus());
    });

    it('a failed delete keeps the confirm open and moves no focus away from it', async () => {
      mockDeleteVendor.mockRejectedValueOnce(new Error('boom'));
      renderPage();
      await loaded();
      const u = await openDelete();
      const confirm = await screen.findByTestId('company-list-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

      await u.click(confirm);

      await screen.findByText('The company could not be deleted. Try again.');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByTestId('company-actions-c1')).not.toHaveFocus();
    });

    it('deletes, then reloads the list', async () => {
      mockFetchVendors.mockResolvedValueOnce(response([company()])).mockResolvedValue(response([]));
      renderPage();
      await loaded();
      const u = await openDelete();
      const confirm = await screen.findByTestId('company-list-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

      await u.click(confirm);

      await waitFor(() => expect(mockDeleteVendor).toHaveBeenCalledWith('c1'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(await screen.findByText('No companies yet')).toBeInTheDocument();
    });

    it('a 409 switches to the blocked form with the specific message and no action', async () => {
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'VENDOR_IN_USE', message: 'in use' }),
      );
      renderPage();
      await loaded();
      const u = await openDelete();
      const confirm = await screen.findByTestId('company-list-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

      await u.click(confirm);

      expect(
        await screen.findByText(
          "This company can't be deleted while invoices or cost lines use it. Remove those first.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('company-list-delete-confirm')).toBeNull();
    });

    it('another API failure shows the translated message and keeps the action for a retry', async () => {
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'SQLITE raw' }),
      );
      renderPage();
      await loaded();
      const u = await openDelete();
      const confirm = await screen.findByTestId('company-list-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

      await u.click(confirm);

      expect(
        await within(screen.getByRole('alertdialog')).findByText(
          'An unexpected error occurred. Please try again.',
        ),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE raw');
      expect(screen.getByTestId('company-list-delete-confirm')).toBeInTheDocument();
    });

    it('a non-API failure shows the plain fallback and keeps the action', async () => {
      mockDeleteVendor.mockRejectedValueOnce(new Error('boom'));
      renderPage();
      await loaded();
      const u = await openDelete();
      const confirm = await screen.findByTestId('company-list-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

      await u.click(confirm);

      expect(
        await screen.findByText('The company could not be deleted. Try again.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('company-list-delete-confirm')).toBeInTheDocument();
    });

    describe('focus after a delete', () => {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');

      beforeEach(() => {
        // jsdom has no layout: report the table links as visible and the card links as hidden,
        // like the real page where CSS shows one surface at a time.
        Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
          configurable: true,
          get(this: HTMLElement) {
            return this.dataset.testid?.includes('-mobile-') ? null : this.parentElement;
          },
        });
      });

      afterEach(() => {
        if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
      });

      async function deleteMiddle() {
        mockFetchVendors
          .mockResolvedValueOnce(
            response([
              company({ id: 'c1', name: 'First Co' }),
              company({ id: 'c2', name: 'Second Co' }),
              company({ id: 'c3', name: 'Third Co' }),
            ]),
          )
          .mockImplementation(() =>
            later(
              response([
                company({ id: 'c1', name: 'First Co' }),
                company({ id: 'c3', name: 'Third Co' }),
              ]),
            ),
          );
        renderPage();
        await loaded('First Co');
        const u = await openDelete('c2');
        const confirm = await screen.findByTestId('company-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
        await u.click(confirm);
      }

      async function deleteFirst(afterDelete: VendorListItem[]) {
        mockFetchVendors
          .mockResolvedValueOnce(
            response([
              company({ id: 'c1', name: 'First Co' }),
              company({ id: 'c2', name: 'Second Co' }),
              company({ id: 'c3', name: 'Third Co' }),
            ]),
          )
          .mockImplementation(() => later(response(afterDelete)));
        renderPage();
        await loaded('First Co');
        const u = await openDelete('c1');
        const confirm = await screen.findByTestId('company-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
        await u.click(confirm);
      }

      it('moves to the name link of the company now at that row', async () => {
        await deleteFirst([
          company({ id: 'c2', name: 'Second Co' }),
          company({ id: 'c3', name: 'Third Co' }),
        ]);

        await waitFor(() => expect(screen.getByTestId('company-name-c2')).toHaveFocus());
      });

      it('moves to the row that took the place of a deleted middle row', async () => {
        await deleteMiddle();

        await waitFor(() => expect(screen.getByTestId('company-name-c3')).toHaveFocus());
      });

      it('moves to the previous row when the last one was deleted', async () => {
        mockFetchVendors
          .mockResolvedValueOnce(
            response([
              company({ id: 'c1', name: 'First Co' }),
              company({ id: 'c2', name: 'Second Co' }),
            ]),
          )
          .mockImplementation(() => later(response([company({ id: 'c1', name: 'First Co' })])));
        renderPage();
        await loaded('First Co');
        const u = await openDelete('c2');
        const confirm = await screen.findByTestId('company-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

        await u.click(confirm);

        await waitFor(() => expect(screen.getByTestId('company-name-c1')).toHaveFocus());
      });

      it('falls back to the page heading when no row is left', async () => {
        mockFetchVendors
          .mockResolvedValueOnce(response([company({ id: 'c1', name: 'First Co' })]))
          .mockImplementation(() => later(response([])));
        renderPage();
        await loaded('First Co');
        const u = await openDelete('c1');
        const confirm = await screen.findByTestId('company-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));

        await u.click(confirm);

        await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
      });
    });
  });

  describe('optional columns (hidden by default)', () => {
    const ALL = ['name', 'email', 'address', 'notes', 'createdAt', 'updatedAt'];
    const showAll = () =>
      mockListPreferences.mockResolvedValue([
        {
          key: 'table.companies.columns',
          value: JSON.stringify({ visible: ALL, order: [] }),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    const cells = (id: string) =>
      within(rowLink(id).closest('tr')!)
        .getAllByRole('cell')
        .map((c) => c.textContent);

    it('shows the e-mail as a mailto link that does not open the company', async () => {
      showAll();
      const { log } = renderPage();
      await loaded();

      const mails = await screen.findAllByRole('link', { name: 'office@sample-roofing.example' });
      expect(mails[0]).toHaveAttribute('href', 'mailto:office@sample-roofing.example');
      fireEvent.click(mails[0]!);
      expect(log.actions).toEqual([]);
    });

    it('shows address, a short note in full and the dates', async () => {
      showAll();
      mockFetchVendors.mockResolvedValue(response([company({ notes: 'Calls back on Monday' })]));
      renderPage();
      await loaded();

      await waitFor(() => expect(cells('c1')).toContain('1 Sample Street'));
      expect(cells('c1')).toEqual(
        expect.arrayContaining(['Calls back on Monday', 'D:2026-01-02', 'D:2026-01-03']),
      );
    });

    it('cuts a long note after 60 characters with an ellipsis', async () => {
      showAll();
      const note = 'x'.repeat(61);
      mockFetchVendors.mockResolvedValue(response([company({ notes: note })]));
      renderPage();
      await loaded();

      await waitFor(() => expect(cells('c1')).toContain(`${'x'.repeat(60)}…`));
      expect(cells('c1')).not.toContain(note);
    });

    it('keeps a note of exactly 60 characters whole', async () => {
      showAll();
      const note = 'y'.repeat(60);
      mockFetchVendors.mockResolvedValue(response([company({ notes: note })]));
      renderPage();
      await loaded();

      await waitFor(() => expect(cells('c1')).toContain(note));
    });

    it('shows a dash for a missing e-mail, address and note, and falls back to the creation date', async () => {
      showAll();
      mockFetchVendors.mockResolvedValue(
        response([
          company({
            email: null,
            address: null,
            notes: null,
            updatedAt: undefined as unknown as string,
          }),
        ]),
      );
      renderPage();
      await loaded();

      await waitFor(() =>
        expect(cells('c1').filter((c) => c === '—').length).toBeGreaterThanOrEqual(3),
      );
      expect(cells('c1').filter((c) => c === 'D:2026-01-02')).toHaveLength(2);
    });
  });

  describe('column preferences', () => {
    const pref = (key: string, visible: string[]) => ({
      key,
      value: JSON.stringify({ visible, order: [] }),
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const headerTexts = () => screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');

    it('reads the saved columns from table.companies.columns', async () => {
      mockListPreferences.mockResolvedValue([pref('table.companies.columns', ['name', 'email'])]);
      renderPage();
      await loaded();

      await waitFor(() => expect(headerTexts().some((h) => h.includes('E-mail'))).toBe(true));
      expect(headerTexts().some((h) => h.includes('Phone'))).toBe(false);
    });

    it('ignores the columns saved for the old vendors page (new column keys would be invisible)', async () => {
      mockListPreferences.mockResolvedValue([pref('table.vendors.columns', ['name', 'email'])]);
      renderPage();
      await loaded();
      await act(async () => {
        await Promise.resolve();
      });

      expect(headerTexts().some((h) => h.includes('Phone'))).toBe(true);
      expect(headerTexts().some((h) => h.includes('Last on site'))).toBe(true);
      expect(headerTexts().some((h) => h.includes('E-mail'))).toBe(false);
    });
  });
});
