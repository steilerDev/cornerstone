/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { WORK_ITEM_STATUSES } from '@cornerstone/shared';

import type { WorkItemSummary } from '@cornerstone/shared';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as WorkItemsPageTypes from './WorkItemsPage.js';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import enWorkItems from '../../i18n/en/workItems.json';

// ─── Module-scope mock functions ─────────────────────────────────────────────

const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  deleteWorkItem: mockDeleteWorkItem,
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
}));

// ─── preferencesApi mock — DataTable calls useColumnPreferences -> listPreferences ──

const mockListPreferences = jest
  .fn<typeof PreferencesApiTypes.listPreferences>()
  .mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  upsertPreference: jest
    .fn<typeof PreferencesApiTypes.upsertPreference>()
    .mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  deletePreference: jest
    .fn<typeof PreferencesApiTypes.deletePreference>()
    .mockResolvedValue(undefined),
}));

// ─── useTableState mock — prevents infinite useEffect re-renders ─────────────

const stableFilters = new Map<string, { value: string }>();
jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      filters: stableFilters,
      sortBy: null,
      sortDir: null,
      page: 1,
      pageSize: 25,
    },
    searchInput: '',
    setSearch: jest.fn(),
    toApiParams: jest.fn(() => ({})),
    setFilter: jest.fn(),
  }),
}));

// ─── useAreas mock ────────────────────────────────────────────────────────────
// WorkItemsPage uses useAreas() for the area filter column enumOptions.

const mockUseAreas = jest.fn(() => ({
  areas: [],
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  createArea: jest.fn(),
  updateArea: jest.fn(),
  deleteArea: jest.fn(),
}));

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

// ─── Formatters mock — WorkItemsPage uses useFormatters() ────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  return {
    formatDayRange: (start: Date, end: Date) =>
      `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
    formatDate: fmtDate,
    useFormatters: () => ({ formatDate: fmtDate }),
  };
});

// ─── Shared fixture builders ──────────────────────────────────────────────────

function makeWorkItemSummary(overrides: Partial<WorkItemSummary> = {}): WorkItemSummary {
  return {
    id: 'wi-1',
    title: 'Lay Foundation',
    status: 'not_started',
    startDate: null,
    endDate: null,
    durationDays: null,
    actualStartDate: null,
    actualEndDate: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    budgetLineCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    projectedStartDate: overrides.startDate !== undefined ? overrides.startDate : null,
    projectedEndDate: overrides.endDate !== undefined ? overrides.endDate : null,
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...overrides,
  };
}

function makeListResponse(items: WorkItemSummary[]) {
  return {
    items,
    filterMeta: {},
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: 1,
    },
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('WorkItemsPage', () => {
  let WorkItemsPageModule: typeof WorkItemsPageTypes;

  beforeEach(async () => {
    mockListWorkItems.mockReset();
    mockDeleteWorkItem.mockReset();
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();
    mockListPreferences.mockReset();
    mockListPreferences.mockResolvedValue([]);
    mockUseAreas.mockReset();

    if (!WorkItemsPageModule) {
      WorkItemsPageModule = await import('./WorkItemsPage.js');
    }

    // Default: empty users + vendors so secondary API calls resolve quickly
    mockListUsers.mockResolvedValue({ users: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });

    // Default useAreas: no areas
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
    });
  });

  function renderPage() {
    return render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/project/work-items']}>
          <WorkItemsPageModule.WorkItemsPage />
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  // ── Breadcrumb rendering: work item with ancestors ────────────────────────

  describe('breadcrumb in title cell', () => {
    it('shows ancestor name and area name in title cell when area has ancestors', async () => {
      const item = makeWorkItemSummary({
        area: {
          id: 'a1',
          name: 'Kitchen',
          color: null,
          ancestors: [{ id: 'a0', name: 'Ground Floor', color: null }],
        },
      });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      // DataTable renders both table and mobile card — use getAllByText and verify at least one match
      await waitFor(() => {
        expect(screen.getAllByText('Ground Floor \u203a Kitchen').length).toBeGreaterThanOrEqual(1);
      });
    });

    it.each(WORK_ITEM_STATUSES)(
      'renders the translated status badge label for %s',
      async (status) => {
        const label = enCommon.statusVocabulary.task[status];
        mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary({ status })]));

        renderPage();

        await waitFor(() => {
          expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
        });
        // D-08: the badge carries the shared Badge status class, never a dead badge-<status> one
        const badge = screen.getAllByText(label).find((el) => el.className.includes('badge'));
        expect(badge).toBeDefined();
        const cssKey = {
          not_started: 'notStarted',
          in_progress: 'inProgress',
          completed: 'completed',
        }[status];
        expect(badge!.className).toContain(cssKey);
        expect(badge!.className).not.toContain('badge-');
      },
    );

    it('status filter lists WORK_ITEM_STATUSES in order with translated labels', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();
      fireEvent.click((await screen.findAllByRole('button', { name: /filter by status/i }))[0]!);

      const dialog = await screen.findByRole('dialog', { name: /filter by status/i });
      const rows = Array.from(dialog.querySelectorAll('label')).map((label) => [
        label.querySelector('input')?.id,
        label.querySelector('span')?.textContent,
      ]);

      expect(rows).toEqual(
        WORK_ITEM_STATUSES.map((status) => [
          `enum-${status}`,
          enCommon.statusVocabulary.task[status],
        ]),
      );
    });

    it('shows just the area name when area has no ancestors', async () => {
      const item = makeWorkItemSummary({
        area: {
          id: 'a1',
          name: 'Garage',
          color: null,
          ancestors: [],
        },
      });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Garage').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows "No area" text when area is null', async () => {
      const item = makeWorkItemSummary({ area: null });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('No area').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('work item title link is present alongside the area breadcrumb', async () => {
      const item = makeWorkItemSummary({
        title: 'Install Tiles',
        area: {
          id: 'a1',
          name: 'Bathroom',
          color: null,
          ancestors: [{ id: 'a0', name: 'First Floor', color: null }],
        },
      });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install Tiles').length).toBeGreaterThanOrEqual(1);
      });

      // Both title link and breadcrumb text should appear
      expect(screen.getAllByText('First Floor \u203a Bathroom').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Multiple items — each gets its own breadcrumb ─────────────────────────

  describe('DataTable dual-mount testids (#2069)', () => {
    it('keeps every data-testid unique with the table and mobile cards mounted together, even with a row menu open', async () => {
      const items = [
        makeWorkItemSummary({ id: 'wi-1', title: 'Item A' }),
        makeWorkItemSummary({ id: 'wi-2', title: 'Item B' }),
      ];
      mockListWorkItems.mockResolvedValue(makeListResponse(items));

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('wi-menu-button-wi-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('wi-menu-button-mobile-wi-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('wi-menu-button-wi-1'));

      expect(screen.getByTestId('wi-view-wi-1')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });
  });

  describe('schedule signal chip (contract 4, #2199)', () => {
    const lateItem = makeWorkItemSummary({
      id: 'wi-late',
      title: 'Late task',
      startDate: '2026-03-05',
      endDate: '2026-03-08',
      projectedStartDate: '2026-03-10',
      projectedEndDate: '2026-03-13',
      isLate: true,
      lateDays: 5,
    });
    const heldItem = makeWorkItemSummary({
      id: 'wi-held',
      title: 'Held task',
      startDate: '2026-03-08',
      endDate: '2026-03-12',
      projectedStartDate: '2026-03-13',
      projectedEndDate: '2026-03-17',
      isHeldUp: true,
    });
    const okItem = makeWorkItemSummary({
      id: 'wi-ok',
      title: 'On time task',
      startDate: '2026-03-20',
      endDate: '2026-03-23',
    });

    it('shows Late with the day count on the table row and the mobile card', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([lateItem]));
      renderPage();

      const chip = await screen.findByTestId('wi-schedule-signal-wi-late');
      expect(chip).toHaveTextContent('Late · 5 d');
      expect(screen.getByTestId('wi-schedule-signal-mobile-wi-late')).toHaveTextContent(
        'Late · 5 d',
      );
    });

    it('shows Held up for a held-up row', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([heldItem]));
      renderPage();

      expect(await screen.findByTestId('wi-schedule-signal-wi-held')).toHaveTextContent('Held up');
      expect(screen.getByTestId('wi-schedule-signal-mobile-wi-held')).toHaveTextContent('Held up');
    });

    it('shows no chip for an on-time row', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([okItem]));
      renderPage();

      await screen.findAllByText('On time task');
      expect(screen.queryByTestId('wi-schedule-signal-wi-ok')).not.toBeInTheDocument();
      expect(screen.queryByTestId('wi-schedule-signal-mobile-wi-ok')).not.toBeInTheDocument();
    });

    it('shows the chip only on late and held-up rows when mixed', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([lateItem, heldItem, okItem]));
      renderPage();

      await screen.findByTestId('wi-schedule-signal-wi-late');
      expect(screen.getByTestId('wi-schedule-signal-wi-held')).toBeInTheDocument();
      expect(screen.queryByTestId('wi-schedule-signal-wi-ok')).not.toBeInTheDocument();
    });

    it('shows the forecast dates (not the planned ones) in the date columns', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([lateItem]));
      renderPage();

      await screen.findByTestId('wi-schedule-signal-wi-late');
      expect(screen.getAllByText('Mar 10, 2026').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mar 13, 2026').length).toBeGreaterThan(0);
      expect(screen.queryByText('Mar 5, 2026')).not.toBeInTheDocument();
      expect(screen.queryByText('Mar 8, 2026')).not.toBeInTheDocument();
    });

    it('prefers actual dates over the forecast in the date columns', async () => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([
          makeWorkItemSummary({
            id: 'wi-act',
            title: 'Started task',
            status: 'in_progress',
            startDate: '2026-03-01',
            endDate: '2026-03-04',
            actualStartDate: '2026-03-02',
            projectedStartDate: '2026-03-02',
            projectedEndDate: '2026-03-12',
          }),
        ]),
      );
      renderPage();

      await screen.findAllByText('Started task');
      expect(screen.getAllByText('Mar 2, 2026').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mar 12, 2026').length).toBeGreaterThan(0);
      expect(screen.queryByText('Mar 1, 2026')).not.toBeInTheDocument();
    });

    it('shows an undated task at its forecast dates, without a chip', async () => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([
          makeWorkItemSummary({
            id: 'wi-undated',
            title: 'Undated task',
            projectedStartDate: '2026-03-10',
            projectedEndDate: '2026-03-12',
          }),
        ]),
      );
      renderPage();

      await screen.findAllByText('Undated task');
      expect(screen.queryByTestId('wi-schedule-signal-wi-undated')).not.toBeInTheDocument();
      expect(screen.getAllByText('Mar 10, 2026').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mar 12, 2026').length).toBeGreaterThan(0);
    });

    it('keeps every data-testid unique with all chip surfaces mounted', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([lateItem, heldItem, okItem]));
      const { container } = renderPage();

      await screen.findByTestId('wi-schedule-signal-wi-late');
      expect(findDuplicateTestIds(container)).toEqual([]);
    });
  });

  describe('multiple work items with different area states', () => {
    it('renders breadcrumb per item independently', async () => {
      const items = [
        makeWorkItemSummary({
          id: 'wi-1',
          title: 'Item A',
          area: { id: 'a1', name: 'Living Room', color: null, ancestors: [] },
        }),
        makeWorkItemSummary({
          id: 'wi-2',
          title: 'Item B',
          area: null,
        }),
      ];
      mockListWorkItems.mockResolvedValue(makeListResponse(items));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Item A').length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getAllByText('Living Room').length).toBeGreaterThanOrEqual(1);
      // "No area" should appear for Item B
      expect(screen.getAllByText('No area').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── #2129: translated errors, never raw server text ───────────────────────

  describe('translated errors (#2129)', () => {
    it('list failure with ApiClientError shows the code copy, never the server text', async () => {
      mockListWorkItems.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );
      renderPage();
      expect(await screen.findByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('list failure with NetworkError shows the network copy', async () => {
      mockListWorkItems.mockRejectedValue(new NetworkError('RAW-LOCAL', new Error('cause')));
      renderPage();
      expect(await screen.findByText(enCommon.requestErrors.network)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    it('list failure with a plain Error shows the loadFailed fallback', async () => {
      mockListWorkItems.mockRejectedValue(new Error('RAW-LOCAL'));
      renderPage();
      expect(await screen.findByText(enWorkItems.list.errors.loadFailed)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    async function deleteWith(rejection: unknown) {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([makeWorkItemSummary({ id: 'wi-1', title: 'Lay Foundation' })]),
      );
      mockDeleteWorkItem.mockRejectedValue(rejection);
      renderPage();
      await waitFor(() => expect(screen.getByTestId('wi-menu-button-wi-1')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('wi-menu-button-wi-1'));
      fireEvent.click(screen.getByTestId('wi-delete-wi-1'));
      const confirm = await screen.findByRole('button', {
        name: enWorkItems.list.deleteModal.deleteLabel,
      });
      fireEvent.click(confirm);
      return screen.findByRole('alert');
    }

    it('delete failure with ApiClientError shows the code copy, never the server text', async () => {
      const alert = await deleteWith(
        new ApiClientError(409, { code: 'CONFLICT', message: 'RAW-SERVER-SENTINEL' }),
      );
      expect(alert).toHaveTextContent(enErrors.CONFLICT);
      expect(alert).not.toHaveTextContent('RAW-SERVER-SENTINEL');
    });

    it('delete failure with NetworkError shows the network copy', async () => {
      const alert = await deleteWith(new NetworkError('RAW-LOCAL', new Error('cause')));
      expect(alert).toHaveTextContent(enCommon.requestErrors.network);
    });

    it('delete failure with a plain Error shows the deleteFailed fallback (not the modal title)', async () => {
      const alert = await deleteWith(new Error('RAW-LOCAL'));
      expect(alert).toHaveTextContent(enWorkItems.list.errors.deleteFailed);
      expect(alert).not.toHaveTextContent('RAW-LOCAL');
    });
  });

  // ── Page identity (#2202) ──────────────────────────────────────────────────

  describe('page identity (#2202)', () => {
    function Probe() {
      const location = useLocation();
      const type = useNavigationType();
      return (
        <>
          <div data-testid="probe-type">{type}</div>
          <div data-testid="probe-search">{location.search}</div>
        </>
      );
    }

    function renderWithProbe() {
      return render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/project/work-items']}>
            <WorkItemsPageModule.WorkItemsPage />
            <Probe />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    it('shows exactly one h1 "Tasks" and sets the tab title', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await waitFor(() => expect(document.title).toBe('Tasks · Cornerstone'));
    });

    it('is a view: it renders no "You are here" trail and no Back link', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      await screen.findByRole('heading', { name: 'Tasks', level: 1 });
      expect(screen.queryByRole('navigation', { name: 'You are here' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument();
    });

    it('does not push a history entry on mount', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderWithProbe();

      await screen.findByRole('heading', { name: 'Tasks', level: 1 });
      expect(screen.getByTestId('probe-type')).toHaveTextContent('POP');
    });

    it('replaces (not pushes) the history entry when a filter changes', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderWithProbe();

      fireEvent.click((await screen.findAllByRole('button', { name: /filter by status/i }))[0]!);
      const dialog = await screen.findByRole('dialog', { name: /filter by status/i });
      fireEvent.click(dialog.querySelector('input') as HTMLInputElement);

      await waitFor(() => expect(screen.getByTestId('probe-search')).toHaveTextContent('status='));
      expect(screen.getByTestId('probe-type')).toHaveTextContent('REPLACE');
    });
  });
  describe('row click guard', () => {
    it('clicking the title link pushes exactly once, to the task', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      const log = createRouterLog();
      render(
        <ToastProvider>
          <RecordingRouter entries={['/project/work-items']} log={log}>
            <WorkItemsPageModule.WorkItemsPage />
          </RecordingRouter>
        </ToastProvider>,
      );

      const links = await screen.findAllByRole('link', { name: /Lay Foundation/ });
      fireEvent.click(links[0]!);

      expect(log.actions).toEqual(['PUSH /project/work-items/wi-1']);
    });
  });
});
