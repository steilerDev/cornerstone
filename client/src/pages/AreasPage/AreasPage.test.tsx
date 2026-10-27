/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  AreaCounts,
  AreaResponse,
  AreaWithCounts,
  CreateAreaRequest,
  DeleteAreaResponse,
  DeleteImpactResponse,
  ReorderAreasRequest,
  UpdateAreaRequest,
} from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type { ShowUndoToastOptions } from '../../components/Toast/ToastContext.js';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import type * as PageTypes from './AreasPage.js';

const WIDE = '(min-width: 768px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

// ─── Mocks (before the page is imported) ──────────────────────────────────────

// EntityPicker formats document dates, so it reads the locale.
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

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({
    houseName: null,
    setHouseName: jest.fn(),
    entriesLanguage: null,
    setEntriesLanguage: jest.fn(),
  }),
  useEntriesLanguage: () => null,
}));

const mockFetchAreasWithCounts = jest.fn<() => Promise<AreaWithCounts[]>>();
const mockReorderAreas = jest.fn<(body: ReorderAreasRequest) => Promise<AreaResponse[]>>();
const mockDeleteArea = jest.fn<(id: string) => Promise<DeleteAreaResponse>>();
const mockCreateArea = jest.fn<(data: CreateAreaRequest) => Promise<AreaResponse>>();
const mockUpdateArea = jest.fn<(id: string, data: UpdateAreaRequest) => Promise<AreaResponse>>();
jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  fetchAreasWithCounts: mockFetchAreasWithCounts,
  reorderAreas: mockReorderAreas,
  deleteArea: mockDeleteArea,
  createArea: mockCreateArea,
  updateArea: mockUpdateArea,
}));

const mockFetchDeleteImpact =
  jest.fn<(entityType: string, id: string | number) => Promise<DeleteImpactResponse>>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

const mockUndoChange = jest.fn<(token: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));

const mockShowUndoToast = jest.fn<(options: ShowUndoToastOptions) => void>();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({
    toasts: [],
    showToast: jest.fn(),
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));

let AreasPage: typeof PageTypes.AreasPage;

beforeAll(async () => {
  ({ AreasPage } = await import('./AreasPage.js'));
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function counts(
  tasks: [number, number] = [0, 0],
  purchases: [number, number] = [0, 0],
  photos: [number, string | null] = [0, null],
): AreaCounts {
  return {
    workItems: { total: tasks[0], open: tasks[1] },
    householdItems: { total: purchases[0], open: purchases[1] },
    photos: { total: photos[0], latestDate: photos[1] },
  };
}

function area(
  id: string,
  name: string,
  parentId: string | null,
  sortOrder: number,
  c: AreaCounts = counts(),
  extra: Partial<AreaResponse> = {},
): AreaWithCounts {
  return {
    id,
    name,
    parentId,
    color: null,
    description: null,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    counts: c,
    ...extra,
  };
}

// House (own 2/1 tasks)
//   Ground floor (own 1/1 tasks, 1 photo)
//     Küche (own 3/2 purchases, 2 photos)  <- depth 2: collapsed by default
//       Sink (empty)
//   Upper floor (empty)
// Garage (own 4/4 tasks)
// Archive (5 finished tasks: 5 total, 0 open)
// Shed (empty)
const HOUSE = area('house', 'House', null, 0, counts([2, 1]), { color: '#336699' });
const GROUND = area(
  'ground',
  'Ground floor',
  'house',
  0,
  counts([1, 1], [0, 0], [1, '2026-03-01']),
);
const KITCHEN = area('kitchen', 'Küche', 'ground', 0, counts([0, 0], [3, 2], [2, '2026-05-10']));
const SINK = area('sink', 'Sink', 'kitchen', 0);
const UPPER = area('upper', 'Upper floor', 'house', 1);
const GARAGE = area('garage', 'Garage', null, 1, counts([4, 4]));
const ARCHIVE = area('archive', 'Archive', null, 2, counts([5, 0]));
const SHED = area('shed', 'Shed', null, 3);
const TREE = [HOUSE, GROUND, KITCHEN, SINK, UPPER, GARAGE, ARCHIVE, SHED];

const UNDO = { token: 'undo-token-1', expiresAt: '2026-01-01T00:00:30.000Z' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AreasPage', () => {
  let media: MatchMediaControl;
  let scrollIntoView: jest.Mock<(arg?: unknown) => void>;

  beforeEach(() => {
    media = installMatchMedia({ [WIDE]: true, [REDUCED]: false });
    scrollIntoView = jest.fn<(arg?: unknown) => void>();
    Element.prototype.scrollIntoView =
      scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
    mockFetchAreasWithCounts.mockReset();
    mockFetchAreasWithCounts.mockResolvedValue(TREE);
    mockReorderAreas.mockReset();
    mockReorderAreas.mockResolvedValue([]);
    mockDeleteArea.mockReset();
    mockDeleteArea.mockResolvedValue({ undo: UNDO });
    mockCreateArea.mockReset();
    mockUpdateArea.mockReset();
    mockUndoChange.mockReset();
    mockUndoChange.mockResolvedValue({});
    mockShowUndoToast.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({
      entityType: 'area',
      id: 'x',
      effects: [{ kind: 'photosLoseArea', count: 4 }],
    });
  });

  afterEach(() => {
    media.restore();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/areas']}>
        <AreasPage />
      </MemoryRouter>,
    );
  }

  async function renderReady() {
    const utils = renderPage();
    await screen.findByTestId('areas-tree-row-house');
    return utils;
  }

  const row = (id: string) => screen.getByTestId(`areas-tree-row-${id}`);
  const menu = (id: string) => screen.getByTestId(`areas-tree-menu-${id}`);
  const status = () => screen.getByTestId('areas-status');
  const cell = (column: string, id: string) =>
    screen.getByTestId(`areas-tree-cell-${column}-${id}`);

  async function chooseAction(
    user: ReturnType<typeof userEvent.setup>,
    id: string,
    action: 'edit' | 'add-sub' | 'move-up' | 'move-down' | 'delete',
  ) {
    await user.click(menu(id));
    await user.click(await screen.findByTestId(`areas-tree-${action}-${id}`));
  }

  async function expectStatus(text: string | RegExp) {
    await waitFor(() => expect(status()).toHaveTextContent(text));
  }

  function topLevelOrder() {
    const root = screen.getByRole('list', { name: 'Areas' });
    return Array.from(root.children)
      .map((li) =>
        li.querySelector('[data-testid^="areas-tree-row-"]')?.getAttribute('data-testid'),
      )
      .filter((id): id is string => !!id)
      .map((id) => id.replace('areas-tree-row-', ''));
  }

  // ─── States ──────────────────────────────────────────────────────────────────

  describe('page frame and states', () => {
    it('shows the title, description, a filter field and a New area button', async () => {
      await renderReady();
      expect(screen.getByRole('heading', { level: 1, name: 'Areas' })).toBeInTheDocument();
      expect(
        screen.getByText(/The parts of your house: buildings, floors and rooms/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Filter areas')).toHaveAttribute('data-page-search');
      expect(screen.getByTestId('areas-new')).toHaveTextContent('New area');
      expect(screen.getByTestId('areas-new')).not.toHaveAttribute('aria-disabled');
      expect(document.title).toContain('Areas');
    });

    it('shows a skeleton and an aria-disabled New button while loading', () => {
      mockFetchAreasWithCounts.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByTestId('areas-new')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByRole('list', { name: 'Areas' })).toBeNull();
    });

    it('does not open the form while loading', async () => {
      const user = userEvent.setup();
      mockFetchAreasWithCounts.mockReturnValue(new Promise(() => {}));
      renderPage();
      await user.click(screen.getByTestId('areas-new'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the empty state when there are no areas', async () => {
      mockFetchAreasWithCounts.mockResolvedValue([]);
      renderPage();
      expect(
        await screen.findByText(
          'No areas yet. Add your building first, then its floors and rooms.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('areas-new')).not.toHaveAttribute('aria-disabled');
    });

    it('shows a load error, focuses the heading and retries', async () => {
      const user = userEvent.setup();
      mockFetchAreasWithCounts.mockRejectedValueOnce(new Error('offline'));
      renderPage();
      expect(await screen.findByText("Couldn't load the areas.")).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();

      await user.click(screen.getByTestId('areas-retry'));
      expect(await screen.findByTestId('areas-tree-row-house')).toBeInTheDocument();
      expect(mockFetchAreasWithCounts).toHaveBeenCalledTimes(2);
    });

    it('has one persistent polite status region without aria-live', async () => {
      await renderReady();
      expect(status()).toHaveAttribute('role', 'status');
      expect(status()).not.toHaveAttribute('aria-live');
    });

    it('renders no duplicate test ids', async () => {
      await renderReady();
      expect(findDuplicateTestIds(document.body)).toEqual([]);
    });
  });

  // ─── Tree, counts, roll-up, quiet rows ───────────────────────────────────────

  describe('tree and counts', () => {
    it('lists areas in order with the wide header and column labels', async () => {
      await renderReady();
      expect(topLevelOrder()).toEqual(['house', 'garage', 'archive', 'shed']);
      const header = screen.getByTestId('areas-tree-header');
      expect(header).toHaveTextContent('Area');
      expect(header).toHaveTextContent('Tasks');
      expect(header).toHaveTextContent('Purchases');
      expect(header).toHaveTextContent('Photos');
    });

    it('rolls the counts of the sub-areas up into each parent', async () => {
      await renderReady();
      // House 2/1 + Ground 1/1 = 3 total, 2 open (Küche has no tasks)
      expect(cell('tasks', 'house')).toHaveTextContent('2 of 3 open');
      expect(cell('purchases', 'house')).toHaveTextContent('2 of 3 open');
      expect(cell('photos', 'house')).toHaveTextContent('3 photos');
      expect(cell('photos', 'house')).toHaveTextContent(/Latest May 10/);
      // Ground: own 1/1 tasks; Küche purchases 3/2; photos 1+2
      expect(cell('tasks', 'ground')).toHaveTextContent('1 of 1 open');
      expect(cell('purchases', 'ground')).toHaveTextContent('2 of 3 open');
      expect(cell('photos', 'ground')).toHaveTextContent('3 photos');
    });

    it('shows a leaf area with its own counts and "None" muted where there is nothing', async () => {
      await renderReady();
      expect(cell('tasks', 'garage')).toHaveTextContent('4 of 4 open');
      expect(cell('purchases', 'garage')).toHaveTextContent('None');
      expect(cell('purchases', 'garage')).toHaveAttribute('data-muted', 'true');
      expect(cell('photos', 'garage')).toHaveTextContent('None');
      expect(cell('tasks', 'garage')).not.toHaveAttribute('data-muted');
    });

    it('uses the singular for one photo and a finished-only area shows 0 of N open', async () => {
      mockFetchAreasWithCounts.mockResolvedValue([
        area('a', 'Alpha', null, 0, counts([5, 0], [0, 0], [1, '2026-02-03'])),
      ]);
      renderPage();
      await screen.findByTestId('areas-tree-row-a');
      expect(cell('tasks', 'a')).toHaveTextContent('0 of 5 open');
      expect(cell('photos', 'a')).toHaveTextContent('1 photo');
      expect(cell('photos', 'a')).not.toHaveTextContent('1 photos');
    });

    it('shows photos without a latest date as the plain count', async () => {
      mockFetchAreasWithCounts.mockResolvedValue([
        area('a', 'Alpha', null, 0, counts([0, 0], [0, 0], [2, null])),
      ]);
      renderPage();
      await screen.findByTestId('areas-tree-row-a');
      expect(cell('photos', 'a')).toHaveTextContent('2 photos');
      expect(cell('photos', 'a')).not.toHaveTextContent('Latest');
    });

    it('shows the colour of an area on its dot', async () => {
      await renderReady();
      const dot = row('house').querySelector('[data-color]') as HTMLElement;
      expect(dot.style.getPropertyValue('--tree-color')).toBe('#336699');
      expect(row('garage').querySelector('[data-color]')).toBeNull();
    });

    it('adds a quiet row by depth only to parents that have direct items', async () => {
      await renderReady();
      const building = screen.getByTestId('areas-tree-quiet-house');
      expect(building).toHaveTextContent('Whole building (no floor)');
      expect(cell('tasks', 'quiet:house')).toHaveTextContent('1 of 2 open');
      expect(screen.getByTestId('areas-tree-quiet-ground')).toHaveTextContent(
        'Whole floor (no room)',
      );
      // Upper floor has no children, Garage has no children, Sink-parent Küche is collapsed
      expect(screen.queryByTestId('areas-tree-quiet-upper')).toBeNull();
      expect(screen.queryByTestId('areas-tree-quiet-garage')).toBeNull();
    });

    it('names a deeper quiet row after the area and puts it first in its group', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(screen.getByTestId('areas-tree-toggle-kitchen'));
      const quiet = screen.getByTestId('areas-tree-quiet-kitchen');
      expect(quiet).toHaveTextContent('Küche itself (no sub-area)');
      const group = screen.getByRole('list', { name: 'Parts of Küche' });
      expect(group.firstElementChild).toContainElement(quiet);
      expect(quiet.querySelector('button')).toBeNull();
    });

    it('a parent equals the sum of its children plus its quiet row', async () => {
      await renderReady();
      const total = (column: string, id: string) =>
        Number(/of (\d+) open/.exec(cell(column, id).textContent ?? '')?.[1] ?? 0);
      expect(total('tasks', 'house')).toBe(
        total('tasks', 'quiet:house') + total('tasks', 'ground') + 0,
      );
      expect(total('purchases', 'ground')).toBe(
        total('purchases', 'quiet:ground') + total('purchases', 'kitchen'),
      );
    });
  });

  // ─── Expansion ───────────────────────────────────────────────────────────────

  describe('expansion', () => {
    it('expands the first two levels by default and collapses deeper ones', async () => {
      await renderReady();
      expect(screen.getByTestId('areas-tree-toggle-house')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByTestId('areas-tree-toggle-ground')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByTestId('areas-tree-toggle-kitchen')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(screen.getByTestId('areas-tree-toggle-kitchen')).toHaveAccessibleName(
        'Sub-areas of Küche',
      );
    });

    it('toggles a row open and closed', async () => {
      const user = userEvent.setup();
      await renderReady();
      const toggle = screen.getByTestId('areas-tree-toggle-house');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // ─── Filter ──────────────────────────────────────────────────────────────────

  describe('filter', () => {
    it.each(['Kueche', 'Kuche', 'Küche', 'küche'])(
      'matches Küche when typing "%s" and shows its ancestors muted',
      async (typed) => {
        const user = userEvent.setup();
        await renderReady();
        await user.type(screen.getByLabelText('Filter areas'), typed);

        expect(row('kitchen')).toBeInTheDocument();
        expect(row('kitchen')).not.toHaveAttribute('data-muted');
        expect(row('ground')).toHaveAttribute('data-muted', 'true');
        expect(row('house')).toHaveAttribute('data-muted', 'true');
        expect(screen.queryByTestId('areas-tree-row-garage')).toBeNull();
        expect(screen.queryByTestId('areas-tree-row-upper')).toBeNull();
      },
    );

    it('highlights the matched part of the name', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'kuch');
      expect(row('kitchen').querySelector('mark')).toHaveTextContent('Küch');
    });

    it('hides quiet rows while filtering and brings them back after clearing', async () => {
      const user = userEvent.setup();
      await renderReady();
      expect(screen.getByTestId('areas-tree-quiet-house')).toBeInTheDocument();
      await user.type(screen.getByLabelText('Filter areas'), 'house');
      expect(screen.queryByTestId('areas-tree-quiet-house')).toBeNull();
      await user.click(screen.getByTestId('areas-filter-clear'));
      expect(screen.getByTestId('areas-tree-quiet-house')).toBeInTheDocument();
    });

    it('expands every ancestor of a match, even below the default depth', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'sink');
      expect(row('sink')).toBeInTheDocument();
      expect(screen.getByTestId('areas-tree-toggle-kitchen')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('ignores toggle clicks while filtering', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'sink');
      await user.click(screen.getByTestId('areas-tree-toggle-house'));
      expect(screen.getByTestId('areas-tree-toggle-house')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('disables reorder while filtering: handles are aria-disabled and carry the hint', async () => {
      const user = userEvent.setup();
      await renderReady();
      expect(screen.getByTestId('areas-tree-handle-house')).not.toHaveAttribute('aria-disabled');
      await user.type(screen.getByLabelText('Filter areas'), 'a');
      const handle = screen.getByTestId('areas-tree-handle-garage');
      expect(handle).toHaveAttribute('aria-disabled', 'true');
      const hint = handle
        .getAttribute('aria-describedby')!
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent);
      expect(hint).toContain('Clear the filter to reorder.');
    });

    it('disables Move up and Move down in the row menu while filtering', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'a');
      await user.click(menu('garage'));
      expect(await screen.findByTestId('areas-tree-move-up-garage')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByTestId('areas-tree-move-down-garage')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('announces the match count after a pause (singular and plural)', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'sink');
      await expectStatus('1 area matches');
      await user.clear(screen.getByLabelText('Filter areas'));
      await user.type(screen.getByLabelText('Filter areas'), 'floor');
      await expectStatus('2 areas match');
    });

    it('announces nothing for an empty query', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'x');
      await user.clear(screen.getByLabelText('Filter areas'));
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(status()).not.toHaveTextContent(/match/);
    });

    it('shows a no-match message with a Clear filter button that keeps focus in the field', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.type(screen.getByLabelText('Filter areas'), 'zzz');
      const none = screen.getByTestId('areas-no-match');
      expect(none).toHaveTextContent('No areas match zzz.');
      expect(screen.queryByRole('list', { name: 'Areas' })).toBeNull();
      await expectStatus('No areas match zzz.');

      await user.click(screen.getByTestId('areas-clear-filter'));
      expect(screen.getByLabelText('Filter areas')).toHaveFocus();
      expect(screen.getByLabelText('Filter areas')).toHaveValue('');
      expect(row('house')).toBeInTheDocument();
    });

    it('the clear button in the field empties it and returns focus to the field', async () => {
      const user = userEvent.setup();
      await renderReady();
      expect(screen.queryByTestId('areas-filter-clear')).toBeNull();
      await user.type(screen.getByLabelText('Filter areas'), 'ga');
      await user.click(screen.getByTestId('areas-filter-clear'));
      expect(screen.getByLabelText('Filter areas')).toHaveFocus();
      expect(screen.getByLabelText('Filter areas')).toHaveValue('');
    });
  });

  // ─── Row menu ────────────────────────────────────────────────────────────────

  describe('row menu', () => {
    it('offers Edit, Add sub-area, Move up, Move down and Delete', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(menu('garage'));
      for (const name of ['Edit', 'Add sub-area', 'Move up', 'Move down', 'Delete']) {
        expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
      }
      expect(menu('garage')).toHaveAccessibleName('Actions for Garage');
    });

    it('disables Move up for the first sibling and Move down for the last', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(menu('house'));
      expect(await screen.findByTestId('areas-tree-move-up-house')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByTestId('areas-tree-move-down-house')).not.toHaveAttribute('aria-disabled');
      await user.keyboard('{Escape}');
      await user.click(menu('shed'));
      expect(await screen.findByTestId('areas-tree-move-down-shed')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('a disabled Move up does nothing', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'house', 'move-up');
      expect(mockReorderAreas).not.toHaveBeenCalled();
    });

    it('has no menu on a quiet row', async () => {
      await renderReady();
      expect(screen.queryByTestId('areas-tree-menu-quiet:house')).toBeNull();
    });
  });

  // ─── Reorder ─────────────────────────────────────────────────────────────────

  describe('reorder', () => {
    it('Move down saves the whole sibling set once and shows the new order at once', async () => {
      const user = userEvent.setup();
      await renderReady();
      const pending = deferred<AreaResponse[]>();
      mockReorderAreas.mockReturnValueOnce(pending.promise);

      await chooseAction(user, 'house', 'move-down');

      expect(mockReorderAreas).toHaveBeenCalledTimes(1);
      expect(mockReorderAreas).toHaveBeenCalledWith({
        parentId: null,
        ids: ['garage', 'house', 'archive', 'shed'],
      });
      await waitFor(() => expect(topLevelOrder()).toEqual(['garage', 'house', 'archive', 'shed']));
      await act(async () => {
        pending.resolve([]);
      });
    });

    it('Move up reorders the children of a parent among themselves', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'upper', 'move-up');
      expect(mockReorderAreas).toHaveBeenCalledWith({
        parentId: 'house',
        ids: ['upper', 'ground'],
      });
    });

    it('announces the new position naming the parent', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'upper', 'move-up');
      await expectStatus('Upper floor, position 1 of 2 in House.');
    });

    it('announces a top-level move with the section name', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'garage', 'move-down');
      await expectStatus('Garage, position 3 of 4 in Areas.');
    });

    it('returns focus to the row menu of the moved row after the request', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'garage', 'move-up');
      await waitFor(() => expect(menu('garage')).toHaveFocus());
    });

    it('keyboard pick-up on the handle commits one request with the parent', async () => {
      await renderReady();
      const handle = screen.getByTestId('areas-tree-handle-ground');
      fireEvent.keyDown(handle, { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('areas-tree-handle-ground'), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('areas-tree-handle-ground'), { key: ' ' });

      await waitFor(() => expect(mockReorderAreas).toHaveBeenCalledTimes(1));
      expect(mockReorderAreas).toHaveBeenCalledWith({
        parentId: 'house',
        ids: ['upper', 'ground'],
      });
      await waitFor(() => expect(screen.getByTestId('areas-tree-handle-ground')).toHaveFocus());
    });

    it('rolls back, reloads and shows an alert when the order is stale (409)', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockReorderAreas.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'REORDER_SET_MISMATCH', message: 'stale' }),
      );

      await chooseAction(user, 'house', 'move-down');

      expect(await screen.findByTestId('areas-reorder-error')).toHaveTextContent(
        "Couldn't save the new order. Try again.",
      );
      expect(screen.getByTestId('areas-reorder-error')).toHaveAttribute('role', 'alert');
      expect(topLevelOrder()).toEqual(['house', 'garage', 'archive', 'shed']);
      await waitFor(() => expect(mockFetchAreasWithCounts).toHaveBeenCalledTimes(2));
    });

    it('clears the alert on the next reorder attempt', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockReorderAreas.mockRejectedValueOnce(new Error('409'));
      await chooseAction(user, 'house', 'move-down');
      await screen.findByTestId('areas-reorder-error');

      await chooseAction(user, 'garage', 'move-up');
      await waitFor(() => expect(screen.queryByTestId('areas-reorder-error')).toBeNull());
    });

    it('locks Move up and Move down while a request is pending', async () => {
      const user = userEvent.setup();
      await renderReady();
      const pending = deferred<AreaResponse[]>();
      mockReorderAreas.mockReturnValueOnce(pending.promise);
      await chooseAction(user, 'house', 'move-down');

      await user.click(menu('shed'));
      expect(await screen.findByTestId('areas-tree-move-up-shed')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByTestId('areas-tree-handle-garage')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await act(async () => {
        pending.resolve([]);
      });
    });
  });

  // ─── Form: new, add sub-area, edit ───────────────────────────────────────────

  describe('form', () => {
    const FRESH = area('porch', 'Porch', null, 4);

    it('New area creates a top-level area, reloads, announces with the path and focuses its menu', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockCreateArea.mockResolvedValue(FRESH);
      mockFetchAreasWithCounts.mockResolvedValue([...TREE, FRESH]);

      await user.click(screen.getByTestId('areas-new'));
      expect(await screen.findByRole('dialog', { name: 'New area' })).toBeInTheDocument();
      await user.type(screen.getByTestId('area-name-input'), 'Porch');
      await user.click(screen.getByTestId('areas-form-save'));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mockCreateArea).toHaveBeenCalledWith({
        name: 'Porch',
        parentId: null,
        color: null,
        description: null,
      });
      expect(await screen.findByTestId('areas-tree-row-porch')).toBeInTheDocument();
      await expectStatus('Porch added');
      await waitFor(() => expect(menu('porch')).toHaveFocus());
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    });

    it('scrolls without animation under reduced motion', async () => {
      media.set(REDUCED, true);
      const user = userEvent.setup();
      await renderReady();
      mockCreateArea.mockResolvedValue(FRESH);
      mockFetchAreasWithCounts.mockResolvedValue([...TREE, FRESH]);

      await user.click(screen.getByTestId('areas-new'));
      await user.type(await screen.findByTestId('area-name-input'), 'Porch');
      await user.click(screen.getByTestId('areas-form-save'));

      await waitFor(() => expect(menu('porch')).toHaveFocus());
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    });

    it('Add sub-area presets the parent, expands it and announces the full path', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(screen.getByTestId('areas-tree-toggle-house'));
      expect(screen.getByTestId('areas-tree-toggle-house')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      const pantry = area('pantry', 'Pantry', 'house', 2);
      mockCreateArea.mockResolvedValue(pantry);
      mockFetchAreasWithCounts.mockResolvedValue([...TREE, pantry]);

      await chooseAction(user, 'house', 'add-sub');
      expect(await screen.findByRole('dialog', { name: 'New area' })).toBeInTheDocument();
      await user.type(screen.getByTestId('area-name-input'), 'Pantry');
      await user.click(screen.getByTestId('areas-form-save'));

      await waitFor(() =>
        expect(mockCreateArea).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'house' })),
      );
      await expectStatus('House › Pantry added');
      expect(screen.getByTestId('areas-tree-toggle-house')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await waitFor(() => expect(menu('pantry')).toHaveFocus());
    });

    it('Edit opens the form with the area, saves only the change and announces "saved" with the path', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockUpdateArea.mockResolvedValue({ ...GROUND, name: 'Main floor' });
      mockFetchAreasWithCounts.mockResolvedValue(
        TREE.map((a) => (a.id === 'ground' ? { ...a, name: 'Main floor' } : a)),
      );

      await chooseAction(user, 'ground', 'edit');
      const dialog = await screen.findByRole('dialog', { name: 'Edit area' });
      const name = within(dialog).getByTestId('area-name-input') as HTMLInputElement;
      expect(name.value).toBe('Ground floor');
      await user.clear(name);
      await user.type(name, 'Main floor');
      await user.click(screen.getByTestId('areas-form-save'));

      await waitFor(() =>
        expect(mockUpdateArea).toHaveBeenCalledWith('ground', { name: 'Main floor' }),
      );
      await expectStatus('House › Main floor saved');
      await waitFor(() => expect(menu('ground')).toHaveFocus());
    });

    it('Edit with no changes sends no request but still closes, announces and focuses the row', async () => {
      const user = userEvent.setup();
      await renderReady();

      await chooseAction(user, 'garage', 'edit');
      await screen.findByRole('dialog', { name: 'Edit area' });
      await user.click(screen.getByTestId('areas-form-save'));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mockUpdateArea).not.toHaveBeenCalled();
      await expectStatus('Garage saved');
      await waitFor(() => expect(menu('garage')).toHaveFocus());
    });

    it('shows the duplicate error for a sibling with the same folded name and sends nothing', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(screen.getByTestId('areas-new'));
      await user.type(await screen.findByTestId('area-name-input'), 'GARAGE');
      await user.click(screen.getByTestId('areas-form-save'));

      expect(
        await screen.findByText('There is already a top-level area called GARAGE.'),
      ).toBeInTheDocument();
      expect(mockCreateArea).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'New area' })).toBeInTheDocument();
    });

    it('Cancel closes the form without a request', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(screen.getByTestId('areas-new'));
      await screen.findByRole('dialog', { name: 'New area' });
      await user.click(screen.getByTestId('areas-form-cancel'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mockCreateArea).not.toHaveBeenCalled();
    });
  });

  // ─── Delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('confirms an empty area with its consequences, deletes, reloads and shows an Undo toast', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockFetchAreasWithCounts.mockResolvedValue(TREE.filter((a) => a.id !== 'shed'));

      await chooseAction(user, 'shed', 'delete');
      expect(await screen.findByRole('alertdialog', { name: 'Delete Shed?' })).toBeInTheDocument();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('area', 'shed');
      await user.click(screen.getByTestId('areas-delete-dialog-confirm'));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteArea).toHaveBeenCalledWith('shed');
      expect(screen.queryByTestId('areas-tree-row-shed')).toBeNull();
      expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
      expect(mockShowUndoToast.mock.calls[0]![0]).toMatchObject({
        message: 'Shed deleted',
        dedupeKey: 'area-delete-shed',
      });
      expect(status()).not.toHaveTextContent('Shed deleted');
    });

    it('names a sub-area by its full path in the title and toast', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockFetchAreasWithCounts.mockResolvedValue(TREE.filter((a) => a.id !== 'upper'));

      await chooseAction(user, 'upper', 'delete');
      expect(
        await screen.findByRole('alertdialog', { name: 'Delete House › Upper floor?' }),
      ).toBeInTheDocument();
      await user.click(screen.getByTestId('areas-delete-dialog-confirm'));

      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
      expect(mockShowUndoToast.mock.calls[0]![0].message).toBe('House › Upper floor deleted');
      expect(status()).not.toHaveTextContent('deleted');
    });

    it('focuses the next sibling after a delete', async () => {
      const user = userEvent.setup();
      const trio = [area('x', 'X', null, 0), area('y', 'Y', null, 1), area('z', 'Z', null, 2)];
      mockFetchAreasWithCounts.mockResolvedValueOnce(trio);
      renderPage();
      await screen.findByTestId('areas-tree-row-x');
      mockFetchAreasWithCounts.mockResolvedValue(trio.filter((a) => a.id !== 'x'));

      await chooseAction(user, 'x', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await waitFor(() => expect(menu('y')).toHaveFocus());
    });

    it('focuses the previous sibling when the last one is deleted', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockFetchAreasWithCounts.mockResolvedValue(TREE.filter((a) => a.id !== 'shed'));
      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await waitFor(() => expect(menu('archive')).toHaveFocus());
    });

    it('focuses the parent when the only child is deleted', async () => {
      const user = userEvent.setup();
      await renderReady();
      await user.click(screen.getByTestId('areas-tree-toggle-kitchen'));
      mockFetchAreasWithCounts.mockResolvedValue(TREE.filter((a) => a.id !== 'sink'));
      await chooseAction(user, 'sink', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await waitFor(() => expect(menu('kitchen')).toHaveFocus());
    });

    it('focuses New area when the last remaining area is deleted', async () => {
      const user = userEvent.setup();
      mockFetchAreasWithCounts.mockResolvedValueOnce([SHED]);
      renderPage();
      await screen.findByTestId('areas-tree-row-shed');
      mockFetchAreasWithCounts.mockResolvedValue([]);
      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await waitFor(() => expect(screen.getByTestId('areas-new')).toHaveFocus());
    });

    it('Cancel keeps the area and sends nothing', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteArea).not.toHaveBeenCalled();
      expect(row('shed')).toBeInTheDocument();
    });

    it('is blocked by the rolled-up total of tasks and purchases, with links, and never deletes', async () => {
      const user = userEvent.setup();
      await renderReady();

      // House: tasks 3 total (own 2 + Ground 1), purchases 3 (in Küche) — nothing is booked on House
      // alone for purchases, so this proves the roll-up is used.
      await chooseAction(user, 'house', 'delete');
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete House?' });
      expect(within(dialog).getByText("House can't be deleted yet.")).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          '3 tasks and 3 purchases are booked here or in a sub-area. Move or delete them first.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByTestId('areas-delete-show-tasks').getAttribute('href')).toContain(
        'areaId=house',
      );
      expect(within(dialog).getByTestId('areas-delete-show-purchases')).toBeInTheDocument();
      expect(screen.queryByTestId('areas-delete-dialog-confirm')).toBeNull();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
      expect(mockDeleteArea).not.toHaveBeenCalled();
    });

    it('blocks on the total, not the open count: only finished tasks still block', async () => {
      const user = userEvent.setup();
      await renderReady();
      expect(cell('tasks', 'archive')).toHaveTextContent('0 of 5 open');

      await chooseAction(user, 'archive', 'delete');

      expect(await screen.findByText("Archive can't be deleted yet.")).toBeInTheDocument();
      expect(
        screen.getByText('5 tasks are booked here or in a sub-area. Move or delete them first.'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('areas-delete-dialog-confirm')).toBeNull();
    });

    it('a parent without items of its own is blocked by a sub-area', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'ground', 'delete');
      expect(
        await screen.findByText("House › Ground floor can't be deleted yet."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          '1 task and 3 purchases are booked here or in a sub-area. Move or delete them first.',
        ),
      ).toBeInTheDocument();
    });

    it('following a link closes the blocked dialog', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'garage', 'delete');
      await user.click(await screen.findByTestId('areas-delete-show-tasks'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('Close on the blocked dialog returns without deleting', async () => {
      const user = userEvent.setup();
      await renderReady();
      await chooseAction(user, 'garage', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteArea).not.toHaveBeenCalled();
    });

    it('a stale 409 AREA_IN_USE reloads and switches the confirm dialog to blocked', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockDeleteArea.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'AREA_IN_USE', message: 'in use' }),
      );

      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));

      expect(await screen.findByText("Shed can't be deleted yet.")).toBeInTheDocument();
      expect(screen.queryByTestId('areas-delete-dialog-confirm')).toBeNull();
      expect(mockFetchAreasWithCounts).toHaveBeenCalledTimes(2);
      expect(mockShowUndoToast).not.toHaveBeenCalled();
    });

    it.each([
      [
        'another API error',
        new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'raw server text' }),
        enErrors.UNAUTHORIZED,
      ],
      [
        'a network error',
        new NetworkError('offline', new TypeError('fetch failed')),
        enCommon.requestErrors.network,
      ],
      ['an unexpected error', new Error('boom'), enCommon.requestErrors.unexpected],
    ])('shows %s in the dialog and keeps it open', async (_name, failure, expected) => {
      const user = userEvent.setup();
      await renderReady();
      mockDeleteArea.mockRejectedValueOnce(failure);

      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));

      const dialog = await screen.findByRole('alertdialog');
      await waitFor(() => expect(dialog.textContent).toContain(expected));
      expect(screen.getByTestId('areas-delete-dialog-confirm')).toBeInTheDocument();
      expect(mockShowUndoToast).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('boom');
      expect(document.body.textContent).not.toContain('raw server text');
    });

    it('ignores a second confirm while the delete is busy', async () => {
      const user = userEvent.setup();
      await renderReady();
      const pending = deferred<DeleteAreaResponse>();
      mockDeleteArea.mockReturnValueOnce(pending.promise);
      await chooseAction(user, 'shed', 'delete');
      const confirm = await screen.findByTestId('areas-delete-dialog-confirm');
      await user.click(confirm);
      await user.click(confirm);
      expect(mockDeleteArea).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve({ undo: UNDO });
      });
    });

    it('Cancel is ignored while the delete is busy', async () => {
      const user = userEvent.setup();
      await renderReady();
      const pending = deferred<DeleteAreaResponse>();
      mockDeleteArea.mockReturnValueOnce(pending.promise);
      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await user.click(screen.getByTestId('areas-delete-dialog-cancel'));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await act(async () => {
        pending.resolve({ undo: UNDO });
      });
    });
  });

  // ─── Undo ────────────────────────────────────────────────────────────────────

  describe('undo', () => {
    async function deleteShed(user: ReturnType<typeof userEvent.setup>) {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE.filter((a) => a.id !== 'shed'));
      await chooseAction(user, 'shed', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
      return mockShowUndoToast.mock.calls[0]![0];
    }

    it('posts the token, reloads, announces "restored" and focuses the restored row menu', async () => {
      const user = userEvent.setup();
      await renderReady();
      const toast = await deleteShed(user);
      mockFetchAreasWithCounts.mockResolvedValue(TREE);
      const calls = mockFetchAreasWithCounts.mock.calls.length;

      await act(async () => {
        await toast.onUndo();
      });

      expect(mockUndoChange).toHaveBeenCalledWith('undo-token-1');
      expect(mockFetchAreasWithCounts.mock.calls.length).toBeGreaterThan(calls);
      expect(await screen.findByTestId('areas-tree-row-shed')).toBeInTheDocument();
      await expectStatus('Shed restored');
      await waitFor(() => expect(menu('shed')).toHaveFocus());
    });

    it('expands the ancestors of a restored sub-area', async () => {
      const user = userEvent.setup();
      await renderReady();
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE.filter((a) => a.id !== 'upper'));
      await chooseAction(user, 'upper', 'delete');
      await user.click(await screen.findByTestId('areas-delete-dialog-confirm'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
      const toast = mockShowUndoToast.mock.calls[0]![0];

      await user.click(screen.getByTestId('areas-tree-toggle-house'));
      expect(screen.getByTestId('areas-tree-toggle-house')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      mockFetchAreasWithCounts.mockResolvedValue(TREE);
      await act(async () => {
        await toast.onUndo();
      });

      expect(screen.getByTestId('areas-tree-toggle-house')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expectStatus('House › Upper floor restored');
      await waitFor(() => expect(menu('upper')).toHaveFocus());
    });

    it('keeps the old tree and does not announce when Undo itself fails', async () => {
      const user = userEvent.setup();
      await renderReady();
      const toast = await deleteShed(user);
      mockUndoChange.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'gone' }),
      );

      await expect(toast.onUndo()).rejects.toBeInstanceOf(ApiClientError);

      expect(status()).not.toHaveTextContent('restored');
    });

    it('lets a dismissed toast send focus to the New area button', async () => {
      const user = userEvent.setup();
      await renderReady();
      const toast = await deleteShed(user);
      expect(toast.focusFallback?.()).toBe(screen.getByTestId('areas-new'));
    });
  });

  // ─── Phone ───────────────────────────────────────────────────────────────────

  describe('phone layout', () => {
    beforeEach(() => {
      media.set(WIDE, false);
    });

    it('hides the header and the drag handles but keeps Move up and Move down in the menu', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('areas-tree-row-house');
      expect(screen.queryByTestId('areas-tree-header')).toBeNull();
      expect(screen.queryByTestId('areas-tree-handle-house')).toBeNull();

      await chooseAction(user, 'garage', 'move-up');
      expect(mockReorderAreas).toHaveBeenCalledWith({
        parentId: null,
        ids: ['garage', 'house', 'archive', 'shed'],
      });
    });

    it('shows the short photo text with the column labels in the cells', async () => {
      renderPage();
      await screen.findByTestId('areas-tree-row-house');
      expect(cell('photos', 'house')).toHaveTextContent(/3, latest May 10/);
      expect(cell('photos', 'house')).toHaveTextContent('Photos');
    });

    it('shows the count alone when the photos have no latest date', async () => {
      mockFetchAreasWithCounts.mockResolvedValue([
        area('a', 'Alpha', null, 0, counts([0, 0], [0, 0], [4, null])),
      ]);
      renderPage();
      await screen.findByTestId('areas-tree-row-a');
      expect(cell('photos', 'a').textContent).toMatch(/Photos\s*4$/);
    });
  });
});
