/**
 * @jest-environment jsdom
 *
 * The purchase page shell (#2249): states, header (status chip, the two date-step primaries,
 * Log once delivered), strip, tabs, the one-replace edit intent, delete and shortcuts. The panels
 * are covered per module; here they are stubs that expose their props.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  Link,
  useLocation,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';

import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as StatusApiTypes from '../../lib/statusChangeApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as StatusHookTypes from '../../hooks/useUndoableStatusChange.js';
import type * as CreateMenuTypes from '../../components/CreateMenu/CreateMenuContext.js';
import type * as EventsTypes from '../../lib/objectCreatedEvents.js';
import type * as PageModule from './HouseholdItemDetailPage.js';

const mockGetItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockDeleteItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockChangeStatus = jest.fn<typeof StatusApiTypes.changeHouseholdItemStatus>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
const mockRunStatusChange =
  jest.fn<ReturnType<typeof StatusHookTypes.useUndoableStatusChange>['run']>();
const mockUseCreateContext = jest.fn<typeof CreateMenuTypes.useCreateContext>();
const startEditDetails = jest.fn<() => void>();
const diaryInputs: unknown[] = [];
let documentsFact: SummaryFact | null = null;
let diaryCount: number | null = 3;

const realItemsApi = await import('../../lib/householdItemsApi.js');
const realStatusApi = await import('../../lib/statusChangeApi.js');
const realCreateMenu = await import('../../components/CreateMenu/CreateMenuContext.js');

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  ...realItemsApi,
  getHouseholdItem: mockGetItem,
  deleteHouseholdItem: mockDeleteItem,
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...realStatusApi,
  changeHouseholdItemStatus: mockChangeStatus,
}));
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../hooks/useUndoableStatusChange.js', () => ({
  useUndoableStatusChange: () => ({ run: mockRunStatusChange }),
}));
jest.unstable_mockModule('../../components/CreateMenu/CreateMenuContext.js', () => ({
  ...realCreateMenu,
  useCreateContext: mockUseCreateContext,
}));
jest.unstable_mockModule('../../components/ObjectHeader/useLogPrimary.js', () => ({
  useLogPrimary: (testId: string) => ({
    kind: 'link',
    label: 'Log',
    to: '/diary/new',
    state: undefined,
    testId,
  }),
}));
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  useDocumentsPanel: () => ({ fact: documentsFact, panel: <div data-testid="stub-documents" /> }),
}));
jest.unstable_mockModule('../../hooks/useObjectDiary.js', () => ({
  useObjectDiary: (input: unknown) => {
    diaryInputs.push(input);
    return {
      primary: { items: [], totalItems: diaryCount, scope: 'company' },
      other: null,
      failure: null,
      reload: () => undefined,
      count: diaryCount,
    };
  },
}));
jest.unstable_mockModule('../../components/FeedRow/ObjectDiaryPanel.js', () => ({
  ObjectDiaryPanel: (props: {
    companyId: string | null;
    areaId: string | null;
    dates: unknown;
    testIdPrefix: string;
    labels: { srCount: (n: number) => string } & Record<string, unknown>;
  }) => (
    <div
      data-testid="stub-diary"
      data-prefix={props.testIdPrefix}
      data-company={props.companyId ?? ''}
      data-area={props.areaId ?? ''}
      data-dates={JSON.stringify(props.dates)}
      data-labels={JSON.stringify({ ...props.labels, srCount: props.labels.srCount(2) })}
    />
  ),
}));
jest.unstable_mockModule('./PurchaseOverviewPanel.js', () => ({
  PurchaseOverviewPanel: (props: { detailsCardRef: { current: unknown } }) => {
    useEffect(() => {
      props.detailsCardRef.current = { startEdit: startEditDetails };
    }, [props.detailsCardRef]);
    return <div data-testid="stub-overview" />;
  },
}));
jest.unstable_mockModule('./PurchaseTimingPanel.js', () => ({
  PurchaseTimingPanel: () => <div data-testid="stub-timing" />,
}));
jest.unstable_mockModule('./PurchaseCostPanel.js', () => ({
  PurchaseCostPanel: () => <div data-testid="stub-cost" />,
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u-me', role: 'admin' } }),
}));

let Page: typeof PageModule;
let Events: typeof EventsTypes;

const PURCHASE = makePurchasePage({
  name: 'Sample sofa',
  createdBy: { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' },
  createdAt: '2026-01-05T08:00:00.000Z',
  updatedAt: '2026-02-10T08:00:00.000Z',
  budgets: [{ id: 'b1' }, { id: 'b2' }] as never,
});

interface Seen {
  keys: string[];
  type: string;
  path: string;
  search: string;
  hash: string;
  state: unknown;
}
const seen: Seen = { keys: [], type: '', path: '', search: '', hash: '', state: null };

function Probe() {
  const location = useLocation();
  const type = useNavigationType();
  const [params] = useSearchParams();
  seen.type = type;
  seen.path = location.pathname;
  seen.search = location.search;
  seen.hash = location.hash;
  seen.state = location.state;
  useEffect(() => {
    seen.keys.push(location.key);
  }, [location.key]);
  return (
    <>
      <div data-testid="probe-tab">{params.get('tab') ?? ''}</div>
      <Link data-testid="go-hi-2" to="/project/household-items/hi-2">
        Other purchase
      </Link>
    </>
  );
}

function renderPage(
  entry:
    | string
    | {
        pathname: string;
        search?: string;
        hash?: string;
        state?: unknown;
      } = '/project/household-items/hi-1',
) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/project/household-items/:id" element={<Page.default />} />
          <Route path="/project/household-items" element={<div data-testid="purchases-list" />} />
          <Route path="/needs-no-id" element={<Page.HouseholdItemDetailPage />} />
          <Route path="*" element={null} />
        </Routes>
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function loaded(entry?: Parameters<typeof renderPage>[0]) {
  const view = renderPage(entry);
  await screen.findByRole('heading', { level: 1, name: /Sample sofa|Untitled purchase/ });
  return view;
}

const h1s = () => screen.queryAllByRole('heading', { level: 1 });

describe('HouseholdItemDetailPage', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockGetItem,
      mockDeleteItem,
      mockChangeStatus,
      mockFetchDeleteImpact,
      mockRunStatusChange,
      mockUseCreateContext,
      startEditDetails,
    ]) {
      mock.mockReset();
    }
    mockGetItem.mockResolvedValue(PURCHASE);
    mockFetchDeleteImpact.mockResolvedValue({
      entityType: 'household_item',
      id: 'hi-1',
      effects: [],
    });
    mockRunStatusChange.mockResolvedValue(undefined);
    mockDeleteItem.mockResolvedValue(undefined);
    documentsFact = null;
    diaryCount = 3;
    diaryInputs.length = 0;
    seen.keys = [];
    document.title = 'initial';
    if (!Page) {
      Page = await import('./HouseholdItemDetailPage.js');
      Events = await import('../../lib/objectCreatedEvents.js');
    }
  });

  describe('route and states', () => {
    it('sends a route without a purchase id back to the Purchases list', async () => {
      renderPage('/needs-no-id');
      expect(await screen.findByTestId('probe-tab')).toBeInTheDocument();
      await waitFor(() => expect(seen.path).toBe('/project/household-items'));
      expect(seen.type).toBe('REPLACE');
      expect(mockGetItem).not.toHaveBeenCalled();
    });

    it('shows exactly one h1 with the purchase name and sets the tab title', async () => {
      await loaded();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Sample sofa', level: 1 })).toBeVisible();
      await waitFor(() => expect(document.title).toBe('Sample sofa · Purchases · Cornerstone'));
      expect(mockGetItem).toHaveBeenCalledWith('hi-1');
    });

    it('shows the loading heading, not the first purchase, when the route moves to another one', async () => {
      mockGetItem.mockImplementation((id) =>
        id === 'hi-2' ? new Promise(() => {}) : Promise.resolve(PURCHASE),
      );
      const view = renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Sample sofa' });
      fireEvent.click(screen.getByTestId('go-hi-2'));
      expect(await screen.findByRole('heading', { level: 1, name: 'Purchase' })).toBeVisible();
      expect(screen.queryByRole('heading', { level: 1, name: 'Sample sofa' })).toBeNull();
      expect(mockGetItem).toHaveBeenCalledWith('hi-2');
      view.unmount();
    });

    it('falls back to "Untitled purchase" for a whitespace-only name, without user-text marking', async () => {
      mockGetItem.mockResolvedValue(makePurchasePage({ name: '   ' }));
      renderPage();
      const heading = await screen.findByRole('heading', { name: 'Untitled purchase', level: 1 });
      expect(heading).toBeVisible();
      expect(h1s()).toHaveLength(1);
      await waitFor(() =>
        expect(document.title).toBe('Untitled purchase · Purchases · Cornerstone'),
      );
    });

    it('shows the typed h1 "Purchase" with the breadcrumb and a skeleton while loading', async () => {
      mockGetItem.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { name: 'Purchase', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('link', { name: /Purchases/ })).toHaveAttribute(
        'href',
        '/project/household-items',
      );
      expect(screen.getByRole('status', { name: 'Loading the purchase…' })).toBeInTheDocument();
      await waitFor(() => expect(document.title).toBe('Purchase · Purchases · Cornerstone'));
    });

    it('shows one "Purchase not found" h1, the breadcrumb and Back to Purchases on 404, without Retry', async () => {
      mockGetItem.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Household item not found' }),
      );
      renderPage('/project/household-items/missing');
      expect(
        await screen.findByRole('heading', { name: 'Purchase not found', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('navigation', { name: 'You are here' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await waitFor(() =>
        expect(document.title).toBe('Purchase not found · Purchases · Cornerstone'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Back to Purchases' }));
      expect(await screen.findByTestId('purchases-list')).toBeInTheDocument();
    });

    it('keeps h1 "Purchase" above an alert with the translated message, Back and Retry on an API error', async () => {
      mockGetItem.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/.+/);
      expect(screen.getByRole('heading', { name: 'Purchase', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(within(alert).getByRole('button', { name: 'Back to Purchases' })).toBeVisible();
      expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
    });

    it('uses the generic sentence for a network failure, and Retry loads the purchase again', async () => {
      mockGetItem.mockRejectedValueOnce(new Error('down'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('heading', { name: 'Sample sofa', level: 1 })).toBeVisible();
      expect(mockGetItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('page identity and origin', () => {
    it('D-37: trails only the Purchases parent and offers no old back button', async () => {
      await loaded();
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getAllByRole('link')).toHaveLength(1);
      expect(within(nav).getByRole('link', { name: /Purchases/ })).toHaveAttribute(
        'href',
        '/project/household-items',
      );
      expect(nav).not.toHaveTextContent('Sample sofa');
      expect(screen.queryByRole('button', { name: /back to household items/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /back to schedule/i })).toBeNull();
      expect(screen.queryByTestId('breadcrumbs-back')).toBeNull();
    });

    it('offers Back to the exact Calendar URL the user came from', async () => {
      await loaded({
        pathname: '/project/household-items/hi-1',
        state: { origin: { to: '/schedule/calendar?calendarMode=week' } },
      });
      expect(screen.getByRole('link', { name: /Back to Calendar/ })).toHaveAttribute(
        'href',
        '/schedule/calendar?calendarMode=week',
      );
    });

    it('offers no Back when the origin is the Purchases list (the nearest parent)', async () => {
      await loaded({
        pathname: '/project/household-items/hi-1',
        state: { origin: { to: '/project/household-items?status=planned' } },
      });
      expect(screen.queryByTestId('breadcrumbs-back')).toBeNull();
    });

    it('carries the page as origin (with the purchase name) on strip links', async () => {
      mockGetItem.mockResolvedValue(
        makePurchasePage({ area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] } }),
      );
      await loaded('/project/household-items/hi-1?tab=timing');
      fireEvent.click(screen.getByTestId('summary-fact-where'));
      await waitFor(() => expect(seen.path).toBe('/areas/a-1'));
      expect(seen.state).toEqual({
        origin: { to: '/project/household-items/hi-1?tab=timing', name: 'Sample sofa' },
      });
    });
  });

  describe('header', () => {
    it('shows the status chip and a Mark ordered primary for a planned purchase', async () => {
      await loaded();
      expect(screen.getByTestId('purchase-header')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-status')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-primary-ordered')).toHaveTextContent('Mark ordered');
      expect(screen.queryByTestId('purchase-primary-delivered')).toBeNull();
    });

    it.each(['purchased', 'scheduled'] as const)(
      'offers Mark delivered, not "Mark delivery scheduled", for an %s purchase',
      async (status) => {
        mockGetItem.mockResolvedValue(makePurchasePage({ status }));
        await loaded();
        expect(screen.getByTestId('purchase-primary-delivered')).toHaveTextContent(
          'Mark delivered',
        );
        expect(screen.queryByTestId('purchase-primary-ordered')).toBeNull();
        expect(screen.getByTestId('purchase-primary-delivered')).not.toHaveTextContent(
          /scheduled/i,
        );
      },
    );

    it('offers the Log link once the purchase arrived', async () => {
      mockGetItem.mockResolvedValue(makePurchasePage({ status: 'arrived' }));
      await loaded();
      expect(screen.getByTestId('purchase-primary-log')).toHaveAttribute('href', '/diary/new');
      expect(screen.queryByTestId('purchase-primary-ordered')).toBeNull();
      expect(screen.queryByTestId('purchase-primary-delivered')).toBeNull();
    });

    type RunOptions = {
      request: () => Promise<unknown>;
      recordName: string;
      statusLabel: string;
      dedupeKey: string;
      onChanged: () => void;
      onUndone: () => Promise<void>;
    };
    const lastRun = () => mockRunStatusChange.mock.calls.at(-1)![0] as unknown as RunOptions;

    it('Mark ordered asks when, then sends the order date, names the purchase and refreshes on change and on undo', async () => {
      mockChangeStatus.mockResolvedValue({ record: PURCHASE, undo: null } as never);
      await loaded();
      fireEvent.click(screen.getByTestId('purchase-primary-ordered'));
      expect((await screen.findAllByText('When was it ordered?')).length).toBeGreaterThan(0);
      fireEvent.click(await screen.findByTestId('purchase-primary-ordered-date-today'));

      await waitFor(() => expect(mockRunStatusChange).toHaveBeenCalledTimes(1));
      const options = lastRun();
      expect(options.recordName).toBe('Sample sofa');
      expect(options.statusLabel).toBe('Ordered');
      expect(options.dedupeKey).toBe('purchase:hi-1');
      await options.request();
      expect(mockChangeStatus).toHaveBeenCalledWith('hi-1', {
        status: 'purchased',
        orderDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      const loads = mockGetItem.mock.calls.length;
      await act(async () => options.onChanged());
      await waitFor(() => expect(mockGetItem.mock.calls.length).toBe(loads + 1));
      await act(async () => options.onUndone());
      expect(mockGetItem.mock.calls.length).toBe(loads + 2);
    });

    it('Mark ordered offers the planned order date as a chip when there is one', async () => {
      mockGetItem.mockResolvedValue(makePurchasePage({ orderDate: '2026-02-01' }));
      await loaded();
      fireEvent.click(screen.getByTestId('purchase-primary-ordered'));
      expect(
        await screen.findByTestId('purchase-primary-ordered-date-planned'),
      ).toBeInTheDocument();
    });

    it('Mark delivered sends the delivery date as the actual delivery date', async () => {
      mockGetItem.mockResolvedValue(
        makePurchasePage({ status: 'purchased', targetDeliveryDate: '2026-03-10' }),
      );
      mockChangeStatus.mockResolvedValue({ record: PURCHASE, undo: null } as never);
      await loaded();
      fireEvent.click(screen.getByTestId('purchase-primary-delivered'));
      fireEvent.click(await screen.findByTestId('purchase-primary-delivered-date-planned'));
      await waitFor(() => expect(mockRunStatusChange).toHaveBeenCalledTimes(1));
      await lastRun().request();
      expect(mockChangeStatus).toHaveBeenCalledWith('hi-1', {
        status: 'arrived',
        actualDeliveryDate: '2026-03-10',
      });
      expect(lastRun().statusLabel).toBe('Delivered');
    });
  });

  describe('strip and tabs', () => {
    it('the summary strip uses five columns (two rows on desktop, AC6)', async () => {
      await loaded();
      expect(screen.getByTestId('purchase-summary').querySelector('dl')).toHaveAttribute(
        'data-columns',
        '5',
      );
    });

    it('shows the strip with the seven facts of the purchase when there is a Documents fact', async () => {
      documentsFact = { id: 'documents', kind: 'static', label: 'Documents', value: '2' };
      await loaded();
      expect(screen.getByTestId('purchase-summary')).toBeInTheDocument();
      for (const id of [
        'delivery',
        'where',
        'company',
        'cost',
        'invoiced',
        'waitsFor',
        'documents',
      ]) {
        expect(screen.getByTestId(`summary-fact-${id}`)).toBeInTheDocument();
      }
      expect(screen.getByTestId('stub-documents')).toBeInTheDocument();
    });

    it('leaves the Documents fact out when there is none', async () => {
      await loaded();
      expect(screen.queryByTestId('summary-fact-documents')).toBeNull();
    });

    it('lists Overview, Timing, Cost, Site diary and History with the cost and diary counts', async () => {
      await loaded();
      const tabs = screen.getByRole('tablist');
      expect(within(tabs).getAllByRole('tab')).toHaveLength(5);
      expect(within(tabs).getByRole('tab', { name: /Cost/ })).toHaveTextContent('2');
      expect(within(tabs).getByRole('tab', { name: /diary/i })).toHaveTextContent('3');
      expect(screen.getByTestId('stub-overview')).toBeInTheDocument();
      expect(screen.queryByTestId('stub-timing')).toBeNull();
    });

    it('mounts each panel on its first visit', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /Timing/ }));
      expect(await screen.findByTestId('stub-timing')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /Cost/ }));
      expect(await screen.findByTestId('stub-cost')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /diary/i }));
      expect(await screen.findByTestId('stub-diary')).toBeInTheDocument();
    });

    it('the Site diary panel gets the purchase window, company, area and its own labels', async () => {
      mockGetItem.mockResolvedValue(
        makePurchasePage({
          orderDate: '2026-02-01',
          targetDeliveryDate: '2026-03-10',
          vendor: { id: 'v-1', name: 'Company One', trade: null, phone: null },
          area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] },
        }),
      );
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /diary/i }));
      const diary = await screen.findByTestId('stub-diary');
      expect(diary).toHaveAttribute('data-prefix', 'purchase-diary');
      expect(diary).toHaveAttribute('data-company', 'v-1');
      expect(diary).toHaveAttribute('data-area', 'a-1');
      expect(JSON.parse(diary.dataset.dates!)).toEqual({
        dateFrom: '2026-02-01',
        dateTo: '2026-03-10',
      });
      expect(JSON.parse(diary.dataset.labels!)).toMatchObject({
        title: 'Site diary',
        log: 'Log for this purchase',
        forCompany: 'Entries for Company One',
        forSubject: 'Entries for this purchase',
        srCount: '2 entries',
      });
      expect(diaryInputs.at(-1)).toMatchObject({
        subjectKey: 'hi-1',
        vendorId: 'v-1',
        areaId: 'a-1',
        dates: { dateFrom: '2026-02-01', dateTo: '2026-03-10' },
      });
    });

    it('the Site diary panel works without company, area or dates', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /diary/i }));
      const diary = await screen.findByTestId('stub-diary');
      expect(diary).toHaveAttribute('data-company', '');
      expect(diary).toHaveAttribute('data-area', '');
      expect(diary.dataset.dates).toBe('null');
      expect(diaryInputs.at(-1)).toMatchObject({ vendorId: null, areaId: null, dates: null });
    });

    it('History shows who created the purchase and when it was last updated', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /History/ }));
      expect(await screen.findByRole('heading', { level: 2, name: 'History' })).toBeVisible();
      const line = screen.getByTestId('purchase-history-created');
      expect(line).toHaveTextContent('Created by Pat Sample on Jan 5, 2026');
      expect(line).toHaveTextContent('Last updated Feb 10, 2026');
    });

    it('History says "Created on" when the creator is unknown', async () => {
      mockGetItem.mockResolvedValue(makePurchasePage({ createdBy: null }));
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /History/ }));
      const line = await screen.findByTestId('purchase-history-created');
      expect(line).toHaveTextContent(/^Created on/);
      expect(line).not.toHaveTextContent('Created by');
    });

    it('registers the purchase area and company as the creation context', async () => {
      mockGetItem.mockResolvedValue(
        makePurchasePage({
          area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] },
          vendor: { id: 'v-1', name: 'Company One', trade: null, phone: null },
        }),
      );
      await loaded();
      expect(mockUseCreateContext).toHaveBeenLastCalledWith({ areaId: 'a-1', companyId: 'v-1' });
    });

    it('registers no area or company for a purchase without them', async () => {
      await loaded();
      expect(mockUseCreateContext).toHaveBeenLastCalledWith({
        areaId: undefined,
        companyId: undefined,
      });
    });

    it('refreshes the purchase when an invoice was created from its dialog, and only then', async () => {
      await loaded();
      const loads = mockGetItem.mock.calls.length;
      act(() => Events.notifyObjectCreated('purchase'));
      expect(mockGetItem.mock.calls.length).toBe(loads);
      act(() => Events.notifyObjectCreated('invoice'));
      await waitFor(() => expect(mockGetItem.mock.calls.length).toBe(loads + 1));
    });
  });

  describe('empty Where and Company facts open the Details card', () => {
    it.each(['where', 'company'])(
      '%s on the Overview tab starts editing right away',
      async (id) => {
        await loaded();
        fireEvent.click(screen.getByTestId(`summary-fact-${id}`));
        expect(startEditDetails).toHaveBeenCalledTimes(1);
      },
    );

    it('from another tab it selects Overview first, then starts editing', async () => {
      await loaded('/project/household-items/hi-1?tab=timing');
      expect(screen.queryByTestId('stub-overview')).toBeNull();
      fireEvent.click(screen.getByTestId('summary-fact-company'));
      expect(await screen.findByTestId('stub-overview')).toBeInTheDocument();
      await waitFor(() => expect(startEditDetails).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('probe-tab')).toHaveTextContent('');
    });
  });

  describe('edit intent (the old edit URLs; read once, one replace)', () => {
    it('does not navigate without an edit intent', async () => {
      await loaded('/project/household-items/hi-1?tab=cost#something');
      expect(seen.keys).toHaveLength(1);
      expect(seen.type).toBe('POP');
      expect(seen.hash).toBe('#something');
      expect(startEditDetails).not.toHaveBeenCalled();
    });

    it('drops edit and tab in one replace, keeps the state, other parameters and the hash, and opens the Details card once', async () => {
      const state = { origin: { to: '/project/household-items', name: 'Purchases' } };
      await loaded({
        pathname: '/project/household-items/hi-1',
        search: '?edit=overview&tab=cost&foo=bar',
        hash: '#details',
        state,
      });
      await waitFor(() => expect(startEditDetails).toHaveBeenCalledTimes(1));
      expect(seen.type).toBe('REPLACE');
      expect(seen.keys).toHaveLength(2);
      expect(seen.state).toEqual(state);
      expect(seen.hash).toBe('#details');
      const params = new URLSearchParams(seen.search);
      expect(params.has('edit')).toBe(false);
      expect(params.has('tab')).toBe(false);
      expect(params.get('foo')).toBe('bar');
      expect(await screen.findByTestId('stub-overview')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('leaves no query string behind when edit was the only parameter', async () => {
      await loaded('/project/household-items/hi-1?edit=overview');
      await waitFor(() => expect(startEditDetails).toHaveBeenCalledTimes(1));
      expect(seen.search).toBe('');
      expect(seen.type).toBe('REPLACE');
    });

    it('does not open the Details card again on a later refresh', async () => {
      await loaded('/project/household-items/hi-1?edit=overview');
      await waitFor(() => expect(startEditDetails).toHaveBeenCalledTimes(1));
      act(() => Events.notifyObjectCreated('invoice'));
      await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(2));
      expect(startEditDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    async function openByKey(key: string) {
      await loaded();
      fireEvent.keyDown(document.body, { key });
      return screen.findByRole('alertdialog');
    }

    it('opens from the header menu with the purchase name and loads the delete impact', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('object-header-menu'));
      fireEvent.click(await screen.findByTestId('object-header-delete'));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Sample sofa');
      await waitFor(() =>
        expect(mockFetchDeleteImpact).toHaveBeenCalledWith('household_item', 'hi-1'),
      );
    });

    it.each(['Delete', 'Backspace'])('opens with the %s key', async (key) => {
      const dialog = await openByKey(key);
      expect(dialog).toHaveTextContent('Sample sofa');
    });

    it('does not load the delete impact before the dialog opens', async () => {
      await loaded();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('Cancel after the shortcut returns focus to the page heading', async () => {
      await openByKey('Delete');
      fireEvent.click(screen.getByTestId('purchase-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteItem).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1, name: 'Sample sofa' })).toHaveFocus(),
      );
    });

    it('Cancel after the header menu returns focus to the page heading (the menu item is gone)', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByTestId('object-header-menu'));
      await user.click(await screen.findByTestId('object-header-delete'));
      await screen.findByRole('alertdialog');
      await user.click(screen.getByTestId('purchase-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1, name: 'Sample sofa' })).toHaveFocus(),
      );
    });

    it('deleting returns to the Purchases list with a replace and a toast', async () => {
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('purchase-delete-confirm'));
      });
      expect(mockDeleteItem).toHaveBeenCalledWith('hi-1');
      expect(await screen.findByTestId('purchases-list')).toBeInTheDocument();
      expect(seen.path).toBe('/project/household-items');
      expect(seen.type).toBe('REPLACE');
      expect(await screen.findByText('Purchase deleted.')).toBeInTheDocument();
    });

    it('a blocked delete (409) shows the translated reason and no confirm button', async () => {
      mockDeleteItem.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('purchase-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('purchase-delete-confirm')).toBeNull();
    });

    it('another API error keeps the confirm button', async () => {
      mockDeleteItem.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('purchase-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-delete-confirm')).toBeInTheDocument();
    });

    it('a network failure shows the fallback sentence; reopening clears the error', async () => {
      mockDeleteItem.mockRejectedValueOnce(new Error('down'));
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('purchase-delete-confirm'));
      });
      expect(await screen.findByText("Couldn't delete the purchase.")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('purchase-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      fireEvent.keyDown(document.body, { key: 'Delete' });
      await screen.findByRole('alertdialog');
      expect(screen.queryByText("Couldn't delete the purchase.")).toBeNull();
    });
  });

  describe('keyboard shortcuts', () => {
    it('e starts editing the Details card on the Overview tab', async () => {
      await loaded();
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(startEditDetails).toHaveBeenCalledTimes(1);
    });

    it('e from another tab selects Overview first, then edits the Details card', async () => {
      await loaded('/project/household-items/hi-1?tab=cost');
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(await screen.findByTestId('stub-overview')).toBeInTheDocument();
      await waitFor(() => expect(startEditDetails).toHaveBeenCalledTimes(1));
    });

    it('? opens the shortcut help with the page shortcuts, without the Backspace twin', async () => {
      await loaded();
      fireEvent.keyDown(document.body, { key: '?' });
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Edit the purchase details');
      expect(dialog).toHaveTextContent('Delete the purchase');
      expect(dialog).toHaveTextContent('Show keyboard shortcuts');
      expect(within(dialog).queryByText('Backspace')).toBeNull();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
});
