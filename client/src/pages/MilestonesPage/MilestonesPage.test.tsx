/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { makeMilestoneRow } from '../../test/milestoneListFixtures.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as PageModule from './MilestonesPage.js';

const mockListRows = jest.fn<typeof MilestonesApiTypes.listMilestoneRows>();
const mockDeleteMilestone = jest.fn<typeof MilestonesApiTypes.deleteMilestone>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestoneRows: mockListRows,
  listMilestones: jest.fn(),
  deleteMilestone: mockDeleteMilestone,
  getMilestone: jest.fn(),
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  linkWorkItem: jest.fn(),
  unlinkWorkItem: jest.fn(),
  addDependentWorkItem: jest.fn(),
  removeDependentWorkItem: jest.fn(),
  fetchMilestoneLinkedHouseholdItems: jest.fn(),
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

let MilestonesPage: typeof PageModule.MilestonesPage;

const ROOF = makeMilestoneRow({
  id: 1,
  title: 'Roof closed',
  description: 'Frame and roof weathertight',
  targetDate: '2026-04-01',
  projectedDate: '2026-04-04',
  workItemCount: 3,
  holdsUp: { count: 2, startingWithin14Days: 1 },
});
const WALLS = makeMilestoneRow({
  id: 2,
  title: 'Walls up',
  targetDate: '2026-03-01',
  projectedDate: '2026-02-27',
  workItemCount: 1,
});
const HANDOVER = makeMilestoneRow({
  id: 3,
  title: 'Handover',
  targetDate: '2026-09-01',
  isCompleted: true,
  completedAt: '2026-08-30T10:00:00.000Z',
});
const ALL = [ROOF, WALLS, HANDOVER];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="loc">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(url = '/project/milestones', log: RouterLog = createRouterLog()) {
  return {
    log,
    ...render(
      <ToastProvider>
        <ShortcutRegistryProvider>
          <RecordingRouter entries={[url]} log={log}>
            <MilestonesPage />
            <LocationProbe />
          </RecordingRouter>
        </ShortcutRegistryProvider>
      </ToastProvider>,
    ),
  };
}

async function loaded() {
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
}

const heading = () => screen.getByRole('heading', { level: 1 });
const loc = () => screen.getByTestId('loc').textContent;

beforeEach(async () => {
  if (!MilestonesPage) ({ MilestonesPage } = await import('./MilestonesPage.js'));
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockListRows.mockReset();
  mockListRows.mockResolvedValue(ALL);
  mockDeleteMilestone.mockReset();
  mockFetchDeleteImpact.mockReset();
  mockFetchDeleteImpact.mockResolvedValue({ entityType: 'milestone', id: '1', effects: [] });
});

describe('states', () => {
  it('shows the skeleton, then the rows', async () => {
    renderPage();
    expect(screen.getByLabelText('Loading the list')).toBeInTheDocument();
    await loaded();
    expect(screen.getByTestId('milestones-row-1')).toBeInTheDocument();
  });

  it('shows the load failure with Retry', async () => {
    mockListRows.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(
      await screen.findByText('Milestones could not be loaded. Try again.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('milestones-retry'));
    await loaded();

    expect(screen.getByTestId('milestones-row-2')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockListRows.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No milestones yet')).toBeInTheDocument();
  });

  it('shows the no-match state when a search finds nothing', async () => {
    renderPage('/project/milestones?q=zzz');

    expect(await screen.findByText('No milestones match.')).toBeInTheDocument();
  });
});

describe('heading, chips and legacy URLs', () => {
  it('always shows the count, and "(n of m)" while searching', async () => {
    renderPage();
    await loaded();
    expect(heading()).toHaveTextContent('Milestones (3)');

    document.body.innerHTML = '';
    renderPage('/project/milestones?q=roof');
    await loaded();
    expect(heading()).toHaveTextContent('Milestones (1 of 3)');
  });

  it('offers only the Upcoming and Reached chips', async () => {
    renderPage();
    await loaded();

    expect(screen.getByTestId('milestones-chip-upcoming')).toHaveTextContent('Upcoming');
    expect(screen.getByTestId('milestones-chip-reached')).toHaveTextContent('Reached');
    expect(screen.queryByTestId('milestones-chip-late')).not.toBeInTheDocument();
    expect(screen.queryByTestId('milestones-chip-early')).not.toBeInTheDocument();
  });

  it('a chip narrows the list on the client', async () => {
    renderPage();
    await loaded();

    await userEvent.click(screen.getByTestId('milestones-chip-reached'));

    await waitFor(() => expect(screen.queryByTestId('milestones-row-1')).toBeNull());
    expect(screen.getByTestId('milestones-row-3')).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Milestones (1)');
  });

  it('has no grouping control', async () => {
    renderPage();
    await loaded();

    expect(screen.queryByTestId('milestones-group-menu')).not.toBeInTheDocument();
  });

  it('absorbs an old ?page=2&pageSize=10 URL and a comma-separated status without an error', async () => {
    renderPage('/project/milestones?page=2&pageSize=10&status=upcoming,reached');
    await loaded();

    expect(loc()).not.toContain('page');
    expect(loc()).not.toContain('status');
    expect(screen.getByTestId('milestones-row-1')).toBeInTheDocument();
  });
});

describe('rows', () => {
  it('shows the title link with the first description line, dates, Waits for and Holds up', async () => {
    renderPage();
    await loaded();
    const row = screen.getByTestId('milestones-row-1');

    expect(within(row).getByTestId('milestones-title-1')).toHaveAttribute(
      'href',
      '/project/milestones/1',
    );
    expect(row).toHaveTextContent('Frame and roof weathertight');
    expect(row).toHaveTextContent('Apr 1, 2026');
    expect(row).toHaveTextContent('Apr 4, 2026');
    expect(row).toHaveTextContent('3 tasks');
    expect(within(row).getByTestId('milestones-holds-up-1')).toHaveTextContent('2 tasks');
    expect(within(row).getByTestId('milestones-holds-up-1')).toHaveAttribute(
      'data-figure',
      'holds-up',
    );
  });

  it('shows the status word, with the day count for Late and Early', async () => {
    renderPage();
    await loaded();

    expect(screen.getByTestId('milestones-status-1')).toHaveTextContent('Late · 3 d');
    expect(screen.getByTestId('milestones-status-2')).toHaveTextContent('Early · 2 d');
    expect(screen.getByTestId('milestones-status-3')).toHaveTextContent('Reached');
  });

  it('sorts by Target date ascending by default', async () => {
    renderPage();
    await loaded();

    const ids = screen
      .getAllByTestId(/^milestones-row-\d+$/)
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['milestones-row-2', 'milestones-row-1', 'milestones-row-3']);
  });

  it('sorts by Title from the sort menu', async () => {
    renderPage('/project/milestones?sortBy=title');
    await loaded();

    const ids = screen
      .getAllByTestId(/^milestones-row-\d+$/)
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['milestones-row-3', 'milestones-row-1', 'milestones-row-2']);
  });

  it('has no duplicate test ids with the menus open', async () => {
    const { container } = renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('milestones-row-menu-1'));

    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});

describe('filters', () => {
  it('opens the Filters panel with Target date and Waits for', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByTestId('milestones-filters-button'));

    expect(await screen.findByTestId('milestones-filter-targetDate-from')).toBeInTheDocument();
    expect(screen.getByTestId('milestones-filter-waitsFor-min')).toBeInTheDocument();
  });

  it('a Waits for range from the URL narrows the rows', async () => {
    renderPage('/project/milestones?waitsFor=min:2');
    await loaded();

    expect(screen.getByTestId('milestones-row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('milestones-row-2')).toBeNull();
  });
});

describe('delete', () => {
  async function openDelete(id = 2) {
    await userEvent.click(screen.getByTestId(`milestones-row-menu-${id}`));
    await userEvent.click(await screen.findByTestId(`milestones-delete-${id}`));
    return screen.findByRole('alertdialog');
  }

  it('confirms, deletes, reloads and puts focus on the heading', async () => {
    mockDeleteMilestone.mockResolvedValue(undefined as never);
    renderPage();
    await loaded();
    const dialog = await openDelete();
    expect(dialog).toHaveTextContent('Walls up');
    mockListRows.mockResolvedValue([ROOF, HANDOVER]);

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByTestId('milestones-row-2')).toBeNull());
    expect(mockDeleteMilestone).toHaveBeenCalledWith(2);
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('keeps the dialog in its blocked state on a 409', async () => {
    mockDeleteMilestone.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
    );
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(screen.getByTestId('milestones-row-2')).toBeInTheDocument();
  });

  it('shows a network error in the dialog and keeps it open', async () => {
    mockDeleteMilestone.mockRejectedValue(new NetworkError('offline', null));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('cancel closes the dialog without deleting and puts focus on the heading', async () => {
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockDeleteMilestone).not.toHaveBeenCalled();
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('cancel is ignored while the delete is running', async () => {
    let finish: () => void = () => undefined;
    mockDeleteMilestone.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
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

describe('shortcuts and create', () => {
  it('the New milestone button opens the create dialog route', async () => {
    const { log } = renderPage();
    await loaded();

    await userEvent.click(screen.getByTestId('new-milestone-button'));

    expect(log.actions.at(-1)).toContain('/project/milestones/new');
  });

  it('the n shortcut does the same', async () => {
    const { log } = renderPage();
    await loaded();

    await userEvent.keyboard('n');

    expect(log.actions.at(-1)).toContain('/project/milestones/new');
  });

  it('has no ? or Escape shortcut of its own any more', async () => {
    const { log } = renderPage();
    await loaded();

    await userEvent.keyboard('?');
    await userEvent.keyboard('{Escape}');

    expect(log.actions).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reloads when a milestone is created elsewhere', async () => {
    renderPage();
    await loaded();
    mockListRows.mockClear();

    act(() => notifyObjectCreated('milestone'));

    await waitFor(() => expect(mockListRows).toHaveBeenCalled());
  });
});
