/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ToastList } from '../../components/Toast/Toast.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { KITCHEN, makeTaskResponse, makeTaskRow } from '../../test/taskListFixtures.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as StatusChangeApiTypes from '../../lib/statusChangeApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as PageModule from './WorkItemsPage.js';

const mockListWorkItemRows = jest.fn<typeof WorkItemsApiTypes.listWorkItemRows>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockChangeStatus = jest.fn<typeof StatusChangeApiTypes.changeWorkItemStatus>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItemRows: mockListWorkItemRows,
  listWorkItems: jest.fn(),
  getWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  deleteWorkItem: mockDeleteWorkItem,
  updateWorkItem: mockUpdateWorkItem,
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  changeWorkItemStatus: mockChangeStatus,
  workItemStatusBody: (to: string, date: string | null) => ({ status: to, date }),
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({
  undoChange: jest.fn(() => Promise.resolve({})),
}));
jest.unstable_mockModule('../../lib/usersApi.js', () => ({ listUsers: mockListUsers }));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest.fn(),
    updateArea: jest.fn(),
    deleteArea: jest.fn(),
  }),
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

let WorkItemsPage: typeof PageModule.WorkItemsPage;

const LATE = makeTaskRow({
  id: 'wi-late',
  title: 'Pour the slab',
  status: 'in_progress',
  timeWindow: 'late',
  isLate: true,
  lateDays: 3,
  isCritical: true,
  area: KITCHEN,
  startDate: '2026-05-01',
  endDate: '2026-05-10',
  actualStartDate: '2026-05-01',
  projectedEndDate: '2026-05-13',
  holdsUp: { count: 2, startingWithin14Days: 1 },
});
const SOON = makeTaskRow({
  id: 'wi-soon',
  title: 'Frame the walls',
  timeWindow: 'this_week',
  expectedCost: 1200,
  waitsFor: { id: 'wi-late', title: 'Pour the slab', more: 1 },
  assignedVendor: { id: 'v-1', name: 'Example Carpentry Co' } as never,
});
const NEXT = makeTaskRow({
  id: 'wi-next',
  title: 'Hang the doors',
  timeWindow: 'next_two_weeks',
  assignedUser: { id: 'u-1', displayName: 'Sam Example' } as never,
});
const DONE = makeTaskRow({
  id: 'wi-done',
  title: 'Dig the trench',
  status: 'completed',
  timeWindow: 'done',
  endDate: '2026-04-02',
  startDate: '2026-04-01',
});
const ALL = [LATE, SOON, NEXT, DONE];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(url = '/project/work-items') {
  return render(
    <ToastProvider>
      <ToastList />
      <ShortcutRegistryProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/project/work-items" element={<WorkItemsPage />} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ShortcutRegistryProvider>
    </ToastProvider>,
  );
}

async function loaded() {
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
}

/** The list's one status region (the toast list has its own). */
const statusRegion = () =>
  screen.getAllByRole('status').find((el) => el.hasAttribute('aria-atomic')) as HTMLElement;

const heading = () => screen.getByRole('heading', { level: 1 });
const location = () => screen.getByTestId('location').textContent;

beforeEach(async () => {
  if (!WorkItemsPage) ({ WorkItemsPage } = await import('./WorkItemsPage.js'));
  window.sessionStorage.clear();
  mockListWorkItemRows.mockReset();
  mockListWorkItemRows.mockResolvedValue(makeTaskResponse(ALL));
  mockDeleteWorkItem.mockReset();
  mockUpdateWorkItem.mockReset();
  mockUpdateWorkItem.mockResolvedValue({} as never);
  mockChangeStatus.mockReset();
  mockChangeStatus.mockResolvedValue({ record: {} as never, undo: null });
  mockListUsers.mockReset();
  mockListUsers.mockResolvedValue({ users: [] } as never);
  mockListMilestones.mockReset();
  mockListMilestones.mockResolvedValue([]);
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });
  mockFetchVendor.mockReset();
  mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
  mockFetchDeleteImpact.mockReset();
  mockFetchDeleteImpact.mockResolvedValue({ entityType: 'work_item', id: 'wi-1', effects: [] });
});

describe('states', () => {
  it('shows the skeleton, then the rows', async () => {
    renderPage();
    expect(screen.getByLabelText('Loading the list')).toBeInTheDocument();
    await loaded();
    expect(screen.getByTestId('tasks-row-wi-soon')).toBeInTheDocument();
  });

  it('shows the load failure with Retry', async () => {
    mockListWorkItemRows.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText("Couldn't load the tasks.")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('tasks-retry'));
    await loaded();
    expect(screen.getByTestId('tasks-row-wi-late')).toBeInTheDocument();
  });

  it('shows the empty state with the New task action', async () => {
    mockListWorkItemRows.mockResolvedValue(makeTaskResponse([]));
    renderPage();
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
    expect(screen.getByText(/Create a task to plan its dates/)).toBeInTheDocument();
  });

  it('shows the no-match state when a search finds nothing', async () => {
    mockListWorkItemRows.mockResolvedValue(makeTaskResponse([], { scopeTotal: 4 }));
    renderPage('/project/work-items?q=zzz');
    expect(await screen.findByText('No tasks match.')).toBeInTheDocument();
  });
});

describe('heading and chips', () => {
  it('shows no count while nothing is filtered, even after loading', async () => {
    renderPage();
    await loaded();
    expect(heading()).toHaveTextContent(/^Tasks$/);
  });

  it('a chip alone is not a filter: still no count, and the chip is sent as status', async () => {
    renderPage('/project/work-items?status=in_progress');
    await loaded();
    expect(heading()).toHaveTextContent(/^Tasks$/);
    expect(mockListWorkItemRows.mock.calls[0]![0]).toMatchObject({
      status: 'in_progress',
      group: 'time',
    });
  });

  it('a search shows "(n of m)" with the chip scope total', async () => {
    mockListWorkItemRows.mockResolvedValue(makeTaskResponse([SOON], { scopeTotal: 4 }));
    renderPage('/project/work-items?q=frame');
    await loaded();
    expect(heading()).toHaveTextContent('Tasks (1 of 4)');
  });

  it('offers a chip per status and sends the sort, search and filters of the URL', async () => {
    renderPage('/project/work-items?q=frame&sortBy=expected_cost&sortOrder=desc&areaId=area-1');
    await loaded();
    expect(screen.getByTestId('tasks-chip-not_started')).toHaveTextContent('Not started');
    expect(screen.getByTestId('tasks-chip-in_progress')).toHaveTextContent('In progress');
    expect(screen.getByTestId('tasks-chip-completed')).toHaveTextContent('Done');
    expect(mockListWorkItemRows.mock.calls[0]![0]).toMatchObject({
      q: 'frame',
      sortBy: 'expected_cost',
      sortOrder: 'desc',
      areaId: 'area-1',
      group: 'time',
      page: 1,
      pageSize: 100,
    });
  });
});

describe('groups', () => {
  it('groups by time with the Late badge, counts, and Done collapsed (AC10)', async () => {
    renderPage();
    await loaded();
    const late = screen.getByTestId('tasks-group-toggle-late');
    expect(within(late).getByText('Late')).toBeInTheDocument();
    expect(late).toHaveAttribute('aria-expanded', 'true');
    expect(late).toHaveTextContent('(1)');
    expect(screen.getByTestId('tasks-group-toggle-this_week')).toHaveTextContent('This week');
    expect(screen.getByTestId('tasks-group-toggle-next_two_weeks')).toHaveTextContent(
      'Next 2 weeks',
    );
    const done = screen.getByTestId('tasks-group-toggle-done');
    expect(done).toHaveTextContent('Done');
    expect(done).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(done);
    expect(done).toHaveAttribute('aria-expanded', 'true');
  });

  it('groups by area with No area last, and by company and status', async () => {
    renderPage('/project/work-items?group=area');
    await loaded();
    const toggles = screen
      .getAllByTestId(/^tasks-group-toggle-(?!mobile)/)
      .map((el) => el.getAttribute('data-testid'));
    expect(toggles).toEqual(['tasks-group-toggle-area-kitchen', 'tasks-group-toggle-__none__']);
    expect(screen.getByTestId('tasks-group-toggle-area-kitchen')).toHaveTextContent(
      'House › Ground floor › Kitchen',
    );
  });

  it('groups by company with No company last', async () => {
    renderPage('/project/work-items?group=company');
    await loaded();
    expect(screen.getByTestId('tasks-group-toggle-v-1')).toHaveTextContent('Example Carpentry Co');
    expect(screen.getByTestId('tasks-group-toggle-__none__')).toHaveTextContent('No company');
  });

  it('groups by status in status order', async () => {
    renderPage('/project/work-items?group=status');
    await loaded();
    expect(screen.getByTestId('tasks-group-toggle-in_progress')).toHaveTextContent('In progress');
    expect(screen.getByTestId('tasks-group-toggle-not_started')).toHaveTextContent('Not started');
    expect(screen.getByTestId('tasks-group-toggle-completed')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('rows', () => {
  it('shows the title link, area link, dates, who, cost and relations', async () => {
    renderPage();
    await loaded();
    const late = screen.getByTestId('tasks-row-wi-late');
    expect(within(late).getByTestId('tasks-title-wi-late')).toHaveAttribute(
      'href',
      '/project/work-items/wi-late',
    );
    expect(within(late).getByTestId('tasks-area-wi-late')).toHaveTextContent(
      'House › Ground floor › Kitchen',
    );
    expect(within(late).getByTestId('tasks-critical-wi-late')).toBeInTheDocument();
    expect(within(late).getByTestId('tasks-holds-up-wi-late')).toHaveTextContent(
      'Holds up 2 tasks',
    );
    const soon = screen.getByTestId('tasks-row-wi-soon');
    expect(soon).toHaveTextContent('€1,200.00');
    expect(soon).toHaveTextContent('Example Carpentry Co');
    expect(within(soon).getByTestId('tasks-waits-for-wi-soon')).toHaveTextContent('Pour the slab');
    expect(soon).toHaveTextContent('+1');
    expect(screen.getByTestId('tasks-row-wi-next')).toHaveTextContent('Sam Example');
  });

  it('has no duplicate test ids with the menus open', async () => {
    const { container } = renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-row-menu-wi-soon'));
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  // D-08 (#2195): the status badge carries the shared Badge class for its status, never a dead
  // badge-<status> class.
  it.each([
    ['not_started', 'Not started', 'notStarted', SOON],
    ['in_progress', 'In progress', 'inProgress', LATE],
    ['completed', 'Done', 'completed', DONE],
  ])('D-08: the %s badge carries the shared Badge status class', async (_s, label, key, row) => {
    renderPage();
    await loaded();
    const badge = screen.getByTestId(`tasks-status-${row.id}`);
    expect(badge).toHaveTextContent(label);
    expect(badge.className).toContain(key);
    expect(badge.className).not.toContain('badge-');
  });
});

describe('row commands', () => {
  it('Start asks for a date and moves the task, refreshing only that row', async () => {
    renderPage();
    await loaded();
    mockListWorkItemRows.mockClear();
    mockListWorkItemRows
      .mockResolvedValueOnce(
        makeTaskResponse([{ ...SOON, status: 'in_progress', timeWindow: 'this_week' }]),
      )
      .mockResolvedValueOnce(makeTaskResponse(ALL));
    await userEvent.click(screen.getByTestId('tasks-command-wi-soon'));
    await userEvent.click(await screen.findByTestId('tasks-command-wi-soon-date-today'));
    await waitFor(() => expect(mockChangeStatus).toHaveBeenCalledTimes(1));
    expect(mockChangeStatus.mock.calls[0]![0]).toBe('wi-soon');
    await waitFor(() =>
      expect(screen.getByTestId('tasks-status-wi-soon')).toHaveTextContent('In progress'),
    );
    expect(mockListWorkItemRows.mock.calls[0]![0]).toMatchObject({ ids: ['wi-soon'] });
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent('Frame the walls started. Late now 1.'),
    );
  });

  it('a done task has Reopen in its menu and no command', async () => {
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-group-toggle-done'));
    expect(screen.queryByTestId('tasks-command-wi-done')).toBeNull();
    await userEvent.click(screen.getByTestId('tasks-row-menu-wi-done'));
    await userEvent.click(await screen.findByTestId('tasks-reopen-wi-done'));
    await waitFor(() => expect(mockChangeStatus).toHaveBeenCalled());
    expect(mockChangeStatus.mock.calls[0]![0]).toBe('wi-done');
  });
});

describe('delete', () => {
  it('confirms, deletes and refreshes the row away', async () => {
    mockDeleteWorkItem.mockResolvedValue(undefined as never);
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-row-menu-wi-soon'));
    await userEvent.click(await screen.findByTestId('tasks-delete-wi-soon'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Frame the walls');
    mockListWorkItemRows
      .mockResolvedValueOnce(makeTaskResponse([]))
      .mockResolvedValueOnce(makeTaskResponse([LATE, NEXT, DONE]));
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByTestId('tasks-row-wi-soon')).toBeNull());
    expect(mockDeleteWorkItem).toHaveBeenCalledWith('wi-soon');
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('keeps the dialog and shows the error when the delete fails', async () => {
    mockDeleteWorkItem.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
    );
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-row-menu-wi-soon'));
    await userEvent.click(await screen.findByTestId('tasks-delete-wi-soon'));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(screen.getByTestId('tasks-row-wi-soon')).toBeInTheDocument();
  });
});

describe('bulk', () => {
  it('sets the status of the selected tasks and announces the result', async () => {
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-wi-soon'));
    await userEvent.click(screen.getByTestId('tasks-select-wi-next'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status-in_progress'));
    await waitFor(() => expect(mockUpdateWorkItem).toHaveBeenCalledTimes(2));
    expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-soon', { status: 'in_progress' });
    await waitFor(() => expect(statusRegion()).toHaveTextContent('2 of 2 updated.'));
    await waitFor(() => expect(screen.queryByTestId('tasks-selection-bar')).toBeNull());
  });

  it('a partial failure keeps the selection and shows the banner until the query changes', async () => {
    mockUpdateWorkItem.mockImplementation((id) =>
      id === 'wi-next' ? Promise.reject(new Error('boom')) : Promise.resolve({} as never),
    );
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-wi-soon'));
    await userEvent.click(screen.getByTestId('tasks-select-wi-next'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status-in_progress'));
    expect(await screen.findByTestId('tasks-bulk-error')).toHaveTextContent(
      "1 of 2 updated. The others couldn't be changed.",
    );
    expect(screen.getByTestId('tasks-selection-bar')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'x');
    await waitFor(() => expect(screen.queryByTestId('tasks-bulk-error')).toBeNull());
  });
});

describe('shortcut and create', () => {
  it('the New task button opens the create dialog route', async () => {
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('new-work-item-button'));
    expect(location()).toContain('/project/work-items/new');
  });

  it('the n shortcut does the same', async () => {
    renderPage();
    await loaded();
    await userEvent.keyboard('n');
    expect(location()).toContain('/project/work-items/new');
  });

  it('reloads when a task is created elsewhere', async () => {
    renderPage();
    await loaded();
    mockListWorkItemRows.mockClear();
    act(() => notifyObjectCreated('task'));
    await waitFor(() => expect(mockListWorkItemRows).toHaveBeenCalled());
  });
});

describe('filters', () => {
  it('opens the Filters panel with Area, Who, Milestone, dates and Cost lines', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByTestId('tasks-filters-button'));
    expect(await screen.findByTestId('tasks-filter-member')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-filter-milestone')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-filter-startDate-from')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-filter-budgetLines-min')).toBeInTheDocument();
  });
});
