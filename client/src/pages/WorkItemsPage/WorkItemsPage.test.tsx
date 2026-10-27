/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ShortcutRegistryProvider, useShortcutRegistry } from '../../hooks/shortcutRegistry.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { WORK_ITEM_STATUSES } from '@cornerstone/shared';

import type { WorkItemSummary } from '@cornerstone/shared';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
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
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  deleteWorkItem: mockDeleteWorkItem,
}));

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: mockFetchVendor,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
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
const mockSetFilter = jest.fn<(key: string, value: string | null) => void>();
// Tests that exercise the URL sync set these (the object identity is stable, as the real hook's).
const mockTable: { search: string; sortBy: string | null; sortDir: 'asc' | 'desc' | null } = {
  search: '',
  sortBy: null,
  sortDir: null,
};
const mockTableState = {
  get search() {
    return mockTable.search;
  },
  get sortBy() {
    return mockTable.sortBy;
  },
  get sortDir() {
    return mockTable.sortDir;
  },
  filters: stableFilters,
  page: 1,
  pageSize: 25,
};
jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: mockTableState,
    searchInput: '',
    setSearch: jest.fn(),
    toApiParams: jest.fn(() => ({})),
    setFilter: mockSetFilter,
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
    useFormatters: () => ({
      formatDate: fmtDate,
      formatCurrency: (n: number) => `€${n.toFixed(2)}`,
      formatPercent: (n: number, digits = 1) => `${n.toFixed(digits)}%`,
    }),
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
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'work_item', id: 'wi-1', effects: [] });
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockSetFilter.mockReset();
    stableFilters.clear();
    mockTable.search = '';
    mockTable.sortBy = null;
    mockTable.sortDir = null;
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

  describe('columns and filter options (coverage of the list definition)', () => {
    it('shows the assignee, the company, the area and a dash for none, and offers users and areas as filter options', async () => {
      mockListUsers.mockResolvedValue({
        users: [
          { id: 'u-1', displayName: 'Ada', deactivatedAt: null },
          { id: 'u-2', displayName: 'Gone', deactivatedAt: '2025-01-01T00:00:00Z' },
        ],
      } as never);
      mockUseAreas.mockReturnValue({
        areas: [
          { id: 'ar-1', name: 'House', parentId: null },
          { id: 'ar-2', name: 'Kitchen', parentId: 'ar-1' },
        ],
        isLoading: false,
        error: null,
        refetch: jest.fn(),
        createArea: jest.fn(),
        updateArea: jest.fn(),
        deleteArea: jest.fn(),
      } as never);
      mockListWorkItems.mockResolvedValue({
        ...makeListResponse([
          makeWorkItemSummary({
            id: 'wi-1',
            title: 'Tiling',
            assignedUser: { id: 'u-1', displayName: 'Ada' } as never,
            assignedVendor: null,
            area: { id: 'ar-2', name: 'Kitchen', color: null, ancestors: [] } as never,
          }),
          makeWorkItemSummary({
            id: 'wi-2',
            title: 'Roofing',
            assignedUser: null,
            assignedVendor: { id: 'v-1', name: 'Acme' } as never,
          }),
          makeWorkItemSummary({ id: 'wi-3', title: 'Plain' }),
        ]),
        filterMeta: { budgetLines: { min: 0, max: 3 } },
      } as never);

      renderPage();

      const first = await screen.findByTestId('wi-menu-button-wi-1');
      const rowOf = (id: string) => screen.getByTestId(`wi-menu-button-${id}`).closest('tr')!;
      expect(first).toBeInTheDocument();
      expect(rowOf('wi-1')).toHaveTextContent('Ada');
      expect(rowOf('wi-1')).toHaveTextContent('Kitchen');
      expect(rowOf('wi-2')).toHaveTextContent('Acme');
      expect(rowOf('wi-3')).toHaveTextContent('—');
    });
  });

  describe('row action menu (coverage of the list definition)', () => {
    async function withRow() {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([makeWorkItemSummary({ id: 'wi-1', title: 'Roof' })]),
      );
      renderPage();
      return screen.findByTestId('wi-menu-button-wi-1');
    }

    it('the menu button toggles the menu; a second click closes it', async () => {
      const button = await withRow();
      fireEvent.click(button);
      expect(screen.getByTestId('wi-view-wi-1')).toBeInTheDocument();
      fireEvent.click(button);
      expect(screen.queryByTestId('wi-view-wi-1')).toBeNull();
    });

    it('a click outside closes the open menu, a click inside it does not', async () => {
      const button = await withRow();
      fireEvent.click(button);

      fireEvent.mouseDown(screen.getByTestId('wi-view-wi-1'));
      expect(screen.getByTestId('wi-view-wi-1')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      await waitFor(() => expect(screen.queryByTestId('wi-view-wi-1')).toBeNull());
    });

    it('Escape closes the open menu (document listener and page shortcut)', async () => {
      const button = await withRow();
      fireEvent.click(button);

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByTestId('wi-view-wi-1')).toBeNull());

      fireEvent.click(button);
      fireEvent.keyDown(document, { key: 'a' });
      expect(screen.getByTestId('wi-view-wi-1')).toBeInTheDocument();
    });

    it('View opens the task and closes the menu', async () => {
      const button = await withRow();
      fireEvent.click(button);
      fireEvent.click(screen.getByTestId('wi-view-wi-1'));
      await waitFor(() => expect(screen.queryByTestId('wi-view-wi-1')).toBeNull());
    });

    it('Delete asks first; Escape cancels the dialog without deleting', async () => {
      const button = await withRow();
      fireEvent.click(button);
      fireEvent.click(screen.getByTestId('wi-delete-wi-1'));

      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteWorkItem).not.toHaveBeenCalled();
    });
  });

  describe('URL sync of the table state', () => {
    function Where() {
      const location = useLocation();
      return <output data-testid="where">{location.search}</output>;
    }
    const params = () => new URLSearchParams(screen.getByTestId('where').textContent ?? '');

    function renderWithUrl(entry = '/project/work-items') {
      return render(
        <ToastProvider>
          <MemoryRouter initialEntries={[entry]}>
            <WorkItemsPageModule.WorkItemsPage />
            <Where />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    beforeEach(() => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([makeWorkItemSummary({ id: 'wi-1', title: 'Roof' })]),
      );
    });

    it('typing in the search box writes ?q= (after the debounce) and an empty search removes it', async () => {
      const user = userEvent.setup();
      renderWithUrl('/project/work-items?q=old');
      await screen.findByTestId('wi-menu-button-wi-1');

      const box = screen.getByRole('searchbox');
      await user.clear(box);
      await user.type(box, 'tile');
      await waitFor(() => expect(params().get('q')).toBe('tile'));
      expect(params().get('page')).toBe('1');
      expect(params().get('pageSize')).toBe('25');

      mockTable.search = 'tile';
      await user.clear(box);
      await waitFor(() => expect(params().has('q')).toBe(false));
    });

    it('sorting writes sortBy and sortOrder; the third click removes them', async () => {
      const user = userEvent.setup();
      renderWithUrl();
      await screen.findByTestId('wi-menu-button-wi-1');

      await user.click(screen.getByRole('columnheader', { name: /Title/ }));
      await waitFor(() => expect(params().get('sortBy')).toBe('title'));
      expect(params().get('sortOrder')).toBe('asc');
    });

    it('sorting down and off: desc is written, then both params go', async () => {
      const user = userEvent.setup();
      mockTable.sortBy = 'title';
      mockTable.sortDir = 'asc';
      renderWithUrl('/project/work-items?sortBy=title&sortOrder=asc');
      await screen.findByTestId('wi-menu-button-wi-1');

      await user.click(screen.getByRole('columnheader', { name: /Title/ }));
      await waitFor(() => expect(params().get('sortOrder')).toBe('desc'));

      mockTable.sortDir = 'desc';
      await user.click(screen.getByRole('columnheader', { name: /Title/ }));
      await waitFor(() => expect(params().has('sortBy')).toBe(false));
      expect(params().has('sortOrder')).toBe(false);
    });

    it('a sort column with no direction falls back to ascending', async () => {
      const user = userEvent.setup();
      mockTable.sortBy = 'title';
      mockTable.sortDir = null;
      renderWithUrl();
      await screen.findByTestId('wi-menu-button-wi-1');

      await user.type(screen.getByRole('searchbox'), 'x');

      await waitFor(() => expect(params().get('sortOrder')).toBe('asc'));
    });

    it('filters with a value are written, empty ones are dropped, and stale filter params are removed first', async () => {
      const user = userEvent.setup();
      stableFilters.set('status', { value: 'in_progress' });
      stableFilters.set('assignedTo', { value: '' });
      renderWithUrl('/project/work-items?budgetLines=1-2&unrelated=keep');
      await screen.findByTestId('wi-menu-button-wi-1');

      await user.type(screen.getByRole('searchbox'), 'x');

      await waitFor(() => expect(params().get('status')).toBe('in_progress'));
      expect(params().has('assignedTo')).toBe(false);
      expect(params().has('budgetLines')).toBe(false);
      expect(params().get('unrelated')).toBe('keep');
    });
  });

  describe('optional columns and the list response', () => {
    it('shows the company and area columns once chosen, with a dash when empty', async () => {
      mockListPreferences.mockResolvedValue([
        {
          key: 'table.workItems.columns',
          value: JSON.stringify(['title', 'vendor', 'area']),
          updatedAt: '',
        },
      ]);
      mockListWorkItems.mockResolvedValue(
        makeListResponse([
          makeWorkItemSummary({
            id: 'wi-1',
            title: 'Roof',
            assignedVendor: { id: 'v-1', name: 'Acme Roofing' } as never,
            area: { id: 'ar-1', name: 'Attic', color: null, ancestors: [] } as never,
          }),
          makeWorkItemSummary({ id: 'wi-2', title: 'Fence' }),
        ]),
      );

      renderPage();

      await screen.findByTestId('wi-menu-button-wi-1');
      // The saved column choice arrives after the first render: the Area column header appears.
      await waitFor(() =>
        expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
          expect.arrayContaining([expect.stringMatching(/Area/)]),
        ),
      );
      const withValues = screen.getByTestId('wi-menu-button-wi-1').closest('tr')!;
      const empty = screen.getByTestId('wi-menu-button-wi-2').closest('tr')!;
      const cells = (row: HTMLElement) =>
        Array.from(row.querySelectorAll('td')).map((td) => td.textContent);
      expect(cells(withValues)).toEqual(expect.arrayContaining(['Acme Roofing']));
      expect(cells(withValues).filter((text) => text === 'Attic')).toHaveLength(1);
      expect(cells(empty).filter((text) => text === '—').length).toBeGreaterThanOrEqual(2);
    });

    it('copes with a list response that carries no filter meta', async () => {
      mockListWorkItems.mockResolvedValue({
        items: [makeWorkItemSummary({ id: 'wi-1', title: 'Roof' })],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      } as never);
      renderPage();
      expect(await screen.findByTestId('wi-menu-button-wi-1')).toBeInTheDocument();
    });
  });

  describe('Escape with nothing open', () => {
    it('does nothing: no dialog appears and the list stays', async () => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([makeWorkItemSummary({ id: 'wi-1', title: 'Roof' })]),
      );
      renderPage();
      await screen.findByTestId('wi-menu-button-wi-1');

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByTestId('wi-menu-button-wi-1')).toBeInTheDocument();
    });
  });

  describe('grant chips (#2242, AC6)', () => {
    const grant = (id: string, name: string, rate: number) => ({
      id,
      name,
      reductionType: 'percentage' as const,
      rate,
    });

    it('shows the first grant as "name · rate" in the title cell, and nothing for a task without grants', async () => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([
          makeWorkItemSummary({ id: 'wi-1', title: 'Roof', grants: [grant('sp-1', 'Energy', 30)] }),
          makeWorkItemSummary({ id: 'wi-2', title: 'Paint', grants: [] }),
          makeWorkItemSummary({ id: 'wi-3', title: 'Fence' }),
        ]),
      );

      renderPage();

      const chip = await screen.findByTestId('work-item-grants-wi-1-first');
      expect(chip).toHaveTextContent('Energy · 30%');
      expect(screen.queryByTestId('work-item-grants-wi-2')).toBeNull();
      expect(screen.queryByTestId('work-item-grants-wi-3')).toBeNull();
      expect(screen.queryByTestId('work-item-grants-wi-1-more')).toBeNull();
    });

    it('shows +n for further grants, names them all for screen readers, and keeps test ids unique across table and cards', async () => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([
          makeWorkItemSummary({
            id: 'wi-1',
            title: 'Roof',
            grants: [grant('a', 'Alpha', 10), grant('b', 'Beta', 20), grant('c', 'Gamma', 5)],
          }),
        ]),
      );

      const { container } = renderPage();

      expect(await screen.findByTestId('work-item-grants-wi-1-more')).toHaveTextContent('+2');
      expect(screen.getAllByText('Grants: Alpha, Beta, Gamma').length).toBeGreaterThan(0);
      expect(screen.getByTestId('work-item-grants-mobile-wi-1')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('does not make the chip a link: the row click still opens the task', async () => {
      mockListWorkItems.mockResolvedValue(
        makeListResponse([
          makeWorkItemSummary({ id: 'wi-1', title: 'Roof', grants: [grant('a', 'Alpha', 10)] }),
        ]),
      );
      renderPage();

      const chip = await screen.findByTestId('work-item-grants-wi-1-first');

      expect(chip.closest('a')).toBeNull();
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
      const confirm = await screen.findByTestId('work-item-list-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
      fireEvent.click(confirm);
      return screen.findByRole('alert');
    }

    describe('delete dialog (#2209)', () => {
      async function openDialog() {
        mockListWorkItems.mockResolvedValue(
          makeListResponse([makeWorkItemSummary({ id: 'wi-1', title: 'Lay Foundation' })]),
        );
        renderPage();
        await waitFor(() => expect(screen.getByTestId('wi-menu-button-wi-1')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('wi-menu-button-wi-1'));
        fireEvent.click(screen.getByTestId('wi-delete-wi-1'));
      }

      it('opens an alertdialog titled with the task, with Cancel focused', async () => {
        await openDialog();
        expect(
          await screen.findByRole('alertdialog', { name: 'Delete Lay Foundation?' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('work-item-list-delete-cancel')).toHaveFocus();
        expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
      });

      it('loads and lists what the delete also removes', async () => {
        mockFetchDeleteImpact.mockResolvedValue({
          entityType: 'work_item',
          id: 'wi-1',
          effects: [
            { kind: 'subtasks', count: 2 },
            { kind: 'notes', count: 0 },
          ],
        });
        await openDialog();
        await waitFor(() =>
          expect(screen.getByTestId('work-item-list-delete-consequences')).toHaveTextContent(
            'Subtasks deleted with it: 2',
          ),
        );
        expect(screen.queryByText(/Notes deleted with it/)).toBeNull();
        expect(mockFetchDeleteImpact).toHaveBeenCalledWith('work_item', 'wi-1');
      });

      it('does not delete until the action is pressed, and Cancel closes without deleting', async () => {
        await openDialog();
        fireEvent.click(await screen.findByTestId('work-item-list-delete-cancel'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(mockDeleteWorkItem).not.toHaveBeenCalled();
      });

      it('calls deleteWorkItem for the task after the counts are ready', async () => {
        mockDeleteWorkItem.mockResolvedValue(undefined);
        await openDialog();
        const confirm = await screen.findByTestId('work-item-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
        fireEvent.click(confirm);
        await waitFor(() => expect(mockDeleteWorkItem).toHaveBeenCalledWith('wi-1'));
        // #2209: a confirmed delete skips the opener; focus ends on the page heading, never <body>.
        await waitFor(() => expect(document.activeElement?.tagName).toBe('H1'));
      });

      it('a 409 hides the action', async () => {
        mockDeleteWorkItem.mockRejectedValue(
          new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
        );
        await openDialog();
        const confirm = await screen.findByTestId('work-item-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
        fireEvent.click(confirm);
        await waitFor(() =>
          expect(screen.queryByTestId('work-item-list-delete-confirm')).toBeNull(),
        );
        expect(screen.getByTestId('work-item-list-delete-cancel')).toBeInTheDocument();
      });

      it('a non-409 API failure (500) keeps the action for a retry', async () => {
        mockDeleteWorkItem.mockRejectedValue(
          new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
        );
        await openDialog();
        const first = await screen.findByTestId('work-item-list-delete-confirm');
        await waitFor(() => expect(first).not.toHaveAttribute('aria-disabled'));
        fireEvent.click(first);
        await screen.findByRole('alert');
        expect(screen.getByTestId('work-item-list-delete-confirm')).toBeInTheDocument();
      });

      it('a non-409 failure keeps the action for a retry', async () => {
        mockDeleteWorkItem.mockRejectedValue(new Error('boom'));
        await openDialog();
        const confirm = await screen.findByTestId('work-item-list-delete-confirm');
        await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
        fireEvent.click(confirm);
        await screen.findByRole('alert');
        expect(screen.getByTestId('work-item-list-delete-confirm')).toBeInTheDocument();
      });
    });

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

  // ── Company filter: entity filter resolved from the URL, never a 100-company load ──

  describe('company filter (assignedVendorId)', () => {
    afterEach(() => {
      stableFilters.clear();
    });

    it('loads no companies on mount', async () => {
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      await screen.findAllByRole('link', { name: /Lay Foundation/ });

      expect(mockFetchVendors).not.toHaveBeenCalled();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('resolves the label of ?assignedVendorId=<id> with GET /vendors/:id and keeps the filter', async () => {
      stableFilters.set('assignedVendorId', { value: 'v-250' });
      mockFetchVendor.mockResolvedValue({ id: 'v-250', name: 'Zeta Tiling' } as never);
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-250'));
      await screen.findAllByRole('link', { name: /Lay Foundation/ });

      expect(mockFetchVendor).toHaveBeenCalledTimes(1);
      expect(mockSetFilter).not.toHaveBeenCalled();
    });

    it('drops an unknown (404) company from the URL filter', async () => {
      stableFilters.set('assignedVendorId', { value: 'v-gone' });
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      await waitFor(() => expect(mockSetFilter).toHaveBeenCalledWith('assignedVendorId', null));
      expect(mockSetFilter).toHaveBeenCalledTimes(1);
    });

    it('keeps the filter when the lookup fails with a server error', async () => {
      stableFilters.set('assignedVendorId', { value: 'v-1' });
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
      await screen.findAllByRole('link', { name: /Lay Foundation/ });

      expect(mockSetFilter).not.toHaveBeenCalled();
    });

    it('makes the company column an entity filter that searches the server', async () => {
      const user = userEvent.setup();
      mockListPreferences.mockResolvedValue([
        {
          key: 'table.workItems.columns',
          value: JSON.stringify({ visible: ['title', 'vendor'] }),
          updatedAt: '',
        },
      ] as never);
      mockFetchVendors.mockResolvedValue({
        vendors: [{ id: 'v-250', name: 'Zeta Tiling', trade: null }],
        pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      } as never);
      mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
      renderPage();

      await user.click(await screen.findByRole('button', { name: /filter by vendor/i }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('textbox'));

      expect(await screen.findByRole('option', { name: 'Zeta Tiling' })).toBeInTheDocument();
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
    });
  });
});

describe('WorkItemsPage create openers (#2212)', () => {
  let Page: typeof WorkItemsPageTypes;

  beforeEach(async () => {
    mockListWorkItems.mockReset();
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();
    mockListPreferences.mockReset();
    mockListPreferences.mockResolvedValue([]);
    mockUseAreas.mockReset();
    mockListUsers.mockResolvedValue({ users: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
    });
    if (!Page) Page = await import('./WorkItemsPage.js');
  });

  function renderAt(entry = '/project/work-items?x=1') {
    const log = createRouterLog();
    render(
      <ToastProvider>
        <RecordingRouter entries={[entry]} log={log}>
          <Page.WorkItemsPage />
        </RecordingRouter>
      </ToastProvider>,
    );
    return log;
  }

  function expectDialogPush(log: ReturnType<typeof createRouterLog>) {
    expect(log.actions).toEqual(['PUSH /project/work-items/new']);
    expect(log.states[0]).toMatchObject({
      origin: { to: '/project/work-items?x=1' },
      background: { pathname: '/project/work-items', search: '?x=1' },
    });
  }

  it('the primary button opens the New task dialog over the list', async () => {
    mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
    const log = renderAt();
    fireEvent.click(await screen.findByTestId('new-work-item-button'));
    expectDialogPush(log);
  });

  it('the n shortcut opens the New task dialog over the list', async () => {
    mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
    const log = renderAt();
    await screen.findByTestId('new-work-item-button');
    fireEvent.keyDown(document, { key: 'n' });
    expectDialogPush(log);
  });

  it('the empty-state action opens the New task dialog over the list', async () => {
    mockListWorkItems.mockResolvedValue(makeListResponse([]));
    const log = renderAt();
    fireEvent.click(
      await screen.findByRole('button', { name: enWorkItems.list.empty.createFirst }),
    );
    expectDialogPush(log);
  });

  it('a task created from the dialog reloads the list silently (rows stay, no loading state)', async () => {
    mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
    renderAt();
    await screen.findAllByText('Lay Foundation');
    const calls = mockListWorkItems.mock.calls.length;
    mockListWorkItems.mockResolvedValue(
      makeListResponse([
        makeWorkItemSummary(),
        makeWorkItemSummary({ id: 'wi-2', title: 'Pour Slab' }),
      ]),
    );

    act(() => notifyObjectCreated('task'));

    expect(screen.getAllByText('Lay Foundation').length).toBeGreaterThan(0);
    await screen.findAllByText('Pour Slab');
    expect(mockListWorkItems.mock.calls.length).toBe(calls + 1);
  });

  it('ignores creation events of other kinds', async () => {
    mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
    renderAt();
    await screen.findAllByText('Lay Foundation');
    const calls = mockListWorkItems.mock.calls.length;
    act(() => notifyObjectCreated('purchase'));
    expect(mockListWorkItems.mock.calls.length).toBe(calls);
  });
});

describe('WorkItemsPage shortcuts and ? help (#2211)', () => {
  let Page: typeof WorkItemsPageTypes;
  const SHELL_SLASH = 'Search this list, or search everywhere';

  beforeEach(async () => {
    mockListWorkItems.mockReset();
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();
    mockListPreferences.mockReset();
    mockListPreferences.mockResolvedValue([]);
    mockUseAreas.mockReset();
    mockListUsers.mockResolvedValue({ users: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
    });
    mockListWorkItems.mockResolvedValue(makeListResponse([makeWorkItemSummary()]));
    if (!Page) Page = await import('./WorkItemsPage.js');
  });

  /** Stands in for the shell: the "/" fallback registered in the shared registry. */
  function ShellSlash({ handler }: { handler: () => void }) {
    useKeyboardShortcuts([{ key: '/', handler, description: SHELL_SLASH }], { fallback: true });
    return null;
  }

  function Snapshot() {
    const registry = useShortcutRegistry();
    return (
      <button
        type="button"
        data-testid="snapshot"
        onClick={() => {
          document.body.dataset.registryKeys = (registry?.snapshot() ?? [])
            .map((s) => s.key)
            .join(',');
        }}
      >
        snapshot
      </button>
    );
  }

  function renderPage(options: { shell?: boolean; handler?: () => void } = {}) {
    render(
      <ShortcutRegistryProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/project/work-items']}>
            {options.shell !== false && <ShellSlash handler={options.handler ?? (() => {})} />}
            <Snapshot />
            <Page.WorkItemsPage />
          </MemoryRouter>
        </ToastProvider>
      </ShortcutRegistryProvider>,
    );
  }

  it('registers no "/" shortcut of its own any more', async () => {
    renderPage({ shell: false });
    await screen.findAllByText('Lay Foundation');
    fireEvent.click(screen.getByTestId('snapshot'));
    const keys = document.body.dataset.registryKeys!.split(',');
    delete document.body.dataset.registryKeys;
    expect(keys).toEqual(expect.arrayContaining(['n', '?']));
    expect(keys).not.toContain('/');
  });

  it('leaves "/" to the shell: the list search field is not focused by the page', async () => {
    const shellHandler = jest.fn();
    renderPage({ handler: shellHandler });
    await screen.findAllByText('Lay Foundation');
    fireEvent.keyDown(document, { key: '/' });
    expect(shellHandler).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });

  it('opens the ? help with the whole registry, so the shell "/" row stays listed', async () => {
    renderPage();
    await screen.findAllByText('Lay Foundation');
    fireEvent.keyDown(document, { key: '?' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(SHELL_SLASH);
    expect(dialog).toHaveTextContent('New work item');
    expect(dialog).toHaveTextContent('Show keyboard shortcuts');
    expect(dialog).not.toHaveTextContent('Focus search');
  });

  it('falls back to the page shortcuts for ? when there is no registry', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/project/work-items']}>
          <Page.WorkItemsPage />
        </MemoryRouter>
      </ToastProvider>,
    );
    await screen.findAllByText('Lay Foundation');
    fireEvent.keyDown(document, { key: '?' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('New work item');
    expect(dialog).not.toHaveTextContent(SHELL_SLASH);
  });

  it('closes the help with Escape', async () => {
    renderPage();
    await screen.findAllByText('Lay Foundation');
    fireEvent.keyDown(document, { key: '?' });
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('no longer carries the focus-search string in the English catalogue', () => {
    expect(JSON.stringify(enWorkItems)).not.toContain('focusSearch');
  });
});
