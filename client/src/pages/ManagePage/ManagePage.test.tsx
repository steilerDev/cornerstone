/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as SharedTypes from '@cornerstone/shared';
import type {
  AreaResponse,
  BudgetCategory,
  HouseholdItemCategoryEntity,
  HouseholdSettings,
  OrientationResponse,
} from '@cornerstone/shared';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { OriginProbe } from '../../test/originProbe.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as BudgetApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as HouseholdApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as OrientationApiTypes from '../../lib/orientationApi.js';
import type * as SettingsApiTypes from '../../lib/settingsApi.js';
import type * as PageTypes from './ManagePage.js';
import enSettings from '../../i18n/en/settings.json';

type RouteId = Parameters<typeof SharedTypes.isRouteServed>[0];

// ─── Mocks (before the page is imported) ──────────────────────────────────────

const served = new Set<string>();

let mockEntriesLanguage: 'de' | 'en' | null = null;
const mockSetHouseName = jest.fn<(name: string | null) => void>();
const mockSetEntriesLanguage = jest.fn<(language: 'de' | 'en') => void>();
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({
    houseName: null,
    setHouseName: mockSetHouseName,
    entriesLanguage: mockEntriesLanguage,
    setEntriesLanguage: mockSetEntriesLanguage,
  }),
  useEntriesLanguage: () => mockEntriesLanguage,
}));

const mockUseAreas = jest.fn<typeof UseAreasTypes.useAreas>();
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));

const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

const budgetApi = {
  fetchBudgetCategories: jest.fn<typeof BudgetApiTypes.fetchBudgetCategories>(),
  createBudgetCategory: jest.fn<typeof BudgetApiTypes.createBudgetCategory>(),
  updateBudgetCategory: jest.fn<typeof BudgetApiTypes.updateBudgetCategory>(),
  deleteBudgetCategory: jest.fn<typeof BudgetApiTypes.deleteBudgetCategory>(),
  reorderBudgetCategories: jest.fn<typeof BudgetApiTypes.reorderBudgetCategories>(),
};
jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => budgetApi);

const householdApi = {
  fetchHouseholdItemCategories: jest.fn<typeof HouseholdApiTypes.fetchHouseholdItemCategories>(),
  createHouseholdItemCategory: jest.fn<typeof HouseholdApiTypes.createHouseholdItemCategory>(),
  updateHouseholdItemCategory: jest.fn<typeof HouseholdApiTypes.updateHouseholdItemCategory>(),
  deleteHouseholdItemCategory: jest.fn<typeof HouseholdApiTypes.deleteHouseholdItemCategory>(),
  reorderHouseholdItemCategories:
    jest.fn<typeof HouseholdApiTypes.reorderHouseholdItemCategories>(),
};
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => householdApi);

const orientationApi = {
  fetchOrientations: jest.fn<typeof OrientationApiTypes.fetchOrientations>(),
  createOrientation: jest.fn<typeof OrientationApiTypes.createOrientation>(),
  updateOrientation: jest.fn<typeof OrientationApiTypes.updateOrientation>(),
  deleteOrientation: jest.fn<typeof OrientationApiTypes.deleteOrientation>(),
  reorderOrientations: jest.fn<typeof OrientationApiTypes.reorderOrientations>(),
};
jest.unstable_mockModule('../../lib/orientationApi.js', () => orientationApi);

const mockFetchSettings = jest.fn<typeof SettingsApiTypes.fetchHouseholdSettings>();
const mockUpdateSettings = jest.fn<typeof SettingsApiTypes.updateHouseholdSettings>();
jest.unstable_mockModule('../../lib/settingsApi.js', () => ({
  fetchHouseholdSettings: mockFetchSettings,
  updateHouseholdSettings: mockUpdateSettings,
}));

jest.unstable_mockModule('../../components/EntityPicker/EntityPicker.js', () => ({
  EntityPicker: () => <select data-testid="area-picker" />,
}));

let ManagePage: typeof PageTypes.ManagePage;

beforeAll(async () => {
  const shared = await import('@cornerstone/shared');
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...shared,
    isRouteServed: (id: RouteId) => served.has(id) || shared.isRouteServed(id),
    getRouteEntry: (id: RouteId) => {
      const entry = shared.getRouteEntry(id);
      return served.has(id) ? { ...entry, stage: 'done' } : entry;
    },
  }));
  // routeUrl resolves stages inside the shared module, which the patched lookup cannot reach.
  const navActive = await import('../../navigation/navActive.js');
  jest.unstable_mockModule('../../navigation/navActive.js', () => ({
    ...navActive,
    navHref: (id: string) => `/${id}`,
  }));
  ({ ManagePage } = await import('./ManagePage.js'));
});

// ─── Data ─────────────────────────────────────────────────────────────────────

const STAMP = '2026-01-01T00:00:00.000Z';
const costRow = (over: Partial<BudgetCategory>): BudgetCategory => ({
  id: 'bc-1',
  name: 'Materials',
  description: null,
  color: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const BUILT_IN = costRow({
  id: 'bc-1',
  name: 'Materials DB name',
  translationKey: 'budgetCategories.materials',
});
const TILES = costRow({
  id: 'bc-2',
  name: 'Tiles',
  description: 'Floor and wall',
  color: '#336699',
});

const purchaseRow = (over: Partial<HouseholdItemCategoryEntity>): HouseholdItemCategoryEntity => ({
  id: 'hic-1',
  name: 'Furniture',
  color: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const FURNITURE = purchaseRow({ id: 'hic-1', name: 'Furniture' });
const APPLIANCES = purchaseRow({ id: 'hic-2', name: 'Appliances', color: '#8B5CF6' });

const orientationRow = (over: Partial<OrientationResponse>): OrientationResponse => ({
  id: 'or-1',
  name: 'North',
  description: 'Faces the street',
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const NORTH = orientationRow({ id: 'or-1', name: 'North' });
const SOUTH = orientationRow({ id: 'or-2', name: 'South', description: null, sortOrder: 1 });

const AREA: AreaResponse = {
  id: 'area-1',
  name: 'Kitchen',
  parentId: null,
  color: '#F59E0B',
  description: null,
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
};

const SETTINGS: HouseholdSettings = {
  householdName: 'Sample House',
  householdAddress: '1 Example Lane',
  entriesLanguage: 'en',
};

describe('ManagePage (Settings > Project setup)', () => {
  let media: MatchMediaControl;

  beforeEach(() => {
    served.clear();
    mockEntriesLanguage = null;
    media = installMatchMedia({ '(min-width: 768px)': true });
    mockSetHouseName.mockReset();
    mockSetEntriesLanguage.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'orientation', id: 'x', effects: [] });
    for (const api of [budgetApi, householdApi, orientationApi]) {
      for (const fn of Object.values(api)) fn.mockReset();
    }
    mockFetchSettings.mockReset();
    mockUpdateSettings.mockReset();
    mockFetchSettings.mockResolvedValue(SETTINGS);
    budgetApi.fetchBudgetCategories.mockResolvedValue({ categories: [BUILT_IN, TILES] });
    householdApi.fetchHouseholdItemCategories.mockResolvedValue({
      categories: [FURNITURE, APPLIANCES],
    });
    orientationApi.fetchOrientations.mockResolvedValue({ orientations: [NORTH, SOUTH] });
    mockUseAreas.mockReset();
    mockUseAreas.mockReturnValue({
      areas: [AREA],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
    } as unknown as ReturnType<typeof UseAreasTypes.useAreas>);
  });

  afterEach(() => {
    media.restore();
  });

  function renderPage(url = '/settings/manage') {
    const log: RouterLog = createRouterLog();
    const view = render(
      <RecordingRouter entries={['/start', url]} log={log}>
        <OriginProbe />
        <ManagePage />
      </RecordingRouter>,
    );
    return { log, view };
  }

  async function loaded(url?: string) {
    const result = renderPage(url);
    await screen.findByTestId('cost-categories-row-bc-1');
    await screen.findByTestId('purchase-categories-row-hic-1');
    await screen.findByTestId('photo-orientations-row-or-1');
    await screen.findByTestId('project-setup-house-name');
    return result;
  }

  const statusRegion = () => screen.getByTestId('project-setup-status');
  const costMenu = (id: string) => screen.getByTestId(`cost-categories-menu-${id}`);

  async function chooseCostAction(
    user: ReturnType<typeof userEvent.setup>,
    id: string,
    action: 'edit' | 'move-up' | 'move-down' | 'delete',
  ) {
    await user.click(costMenu(id));
    await user.click(await screen.findByTestId(`cost-categories-${action}-${id}`));
  }

  describe('page identity', () => {
    it('renders exactly one level-1 heading, "Project setup"', async () => {
      await loaded();

      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveTextContent(/^Project setup$/);
    });

    it('sets the tab title from the same word with the Settings section', async () => {
      await loaded();

      expect(document.title).toBe('Project setup · Settings · Cornerstone');
    });

    it('has no tab row and no "You are here" trail', async () => {
      await loaded();

      expect(screen.queryByRole('tablist')).toBeNull();
      expect(screen.queryByRole('tab')).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'You are here' })).toBeNull();
    });

    it('has unique test ids across the whole page', async () => {
      await loaded();

      expect(findDuplicateTestIds()).toEqual([]);
    });
  });

  describe('section order', () => {
    const sectionHeadings = () =>
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    it('shows House, Cost categories, Purchase categories, Photo orientations, then pointers', async () => {
      await loaded();

      expect(sectionHeadings()).toEqual([
        'House',
        'Cost categories (2)',
        'Purchase categories (2)',
        'Photo orientations (2)',
        'Managed on other pages',
      ]);
    });

    it('no longer renders an Areas list or card here (the Areas page owns it)', async () => {
      await loaded();

      expect(screen.queryByTestId('project-setup-areas')).toBeNull();
      expect(mockUseAreas).not.toHaveBeenCalled();
    });

    it('anchors every section by its id', async () => {
      await loaded();

      for (const id of [
        'house',
        'cost-categories',
        'purchase-categories',
        'orientations',
        'areas',
        'pointers',
      ]) {
        expect(document.getElementById(id)).not.toBeNull();
      }
      expect(document.getElementById('trades')).not.toBeNull();
    });
  });

  describe('pointer rows', () => {
    it('points Trades at the Companies page with the Trades sheet open', async () => {
      await loaded();

      const link = screen.getByTestId('project-setup-pointer-trades');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/companies?trades=1');
      expect(link).toHaveAttribute('id', 'trades');
      expect(within(link).getByText('Managed on Companies')).toBeInTheDocument();
    });

    it('always points Areas at the Areas page, keeping the #areas anchor on the row', async () => {
      await loaded();

      const link = screen.getByTestId('project-setup-pointer-areas');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/areas');
      expect(link).toHaveAttribute('id', 'areas');
      expect(screen.queryByTestId('project-setup-areas')).toBeNull();
    });

    it('navigates to Companies on a plain click of the Trades pointer', async () => {
      const user = userEvent.setup();
      const { log } = await loaded();

      await user.click(screen.getByTestId('project-setup-pointer-trades'));

      expect(log.actions.at(-1)).toMatch(/^PUSH \/companies\?trades=1/);
    });
  });

  describe('URL handling (D-10, #2204)', () => {
    it('D-10: writes nothing to the URL on load and pushes no history entry', async () => {
      const { log } = await loaded('/settings/manage');

      expect(log.actions).toEqual([]);
      expect(screen.getByTestId('probe-search')).toHaveTextContent('');
      expect(`${screen.getByTestId('probe-path').textContent}`).toBe('/settings/manage');
      expect(log.entries).toEqual(['/start', '/settings/manage']);
    });

    it('D-10: keeps a section hash as it is and writes nothing', async () => {
      const { log } = await loaded('/settings/manage#cost-categories');

      expect(log.actions).toEqual([]);
      expect(log.entries).toEqual(['/start', '/settings/manage#cost-categories']);
    });

    it.each([
      ['household', '#house'],
      ['orientations', '#orientations'],
      ['budget-categories', '#cost-categories'],
      ['hi-categories', '#purchase-categories'],
      ['trades', '#trades'],
    ])('replaces ?tab=%s with %s and does not grow the history', async (tab, hash) => {
      const { log } = await loaded(`/settings/manage?tab=${tab}`);

      expect(log.actions).toEqual([`REPLACE /settings/manage${hash}`]);
      expect(log.entries).toEqual(['/start', `/settings/manage${hash}`]);
    });

    it('drops an unknown ?tab without moving anywhere else', async () => {
      const { log } = await loaded('/settings/manage?tab=bogus&x=1');

      expect(log.actions).toEqual(['REPLACE /settings/manage?x=1']);
    });

    it('sends ?tab=areas to the Areas page', async () => {
      const { log } = renderPage('/settings/manage?tab=areas');
      await screen.findByTestId('project-setup-house');

      expect(log.actions).toEqual(['REPLACE /areas']);
    });

    it('moves focus to the section heading named by the hash once the page has loaded', async () => {
      await loaded('/settings/manage#purchase-categories');

      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById('purchase-categories-heading')),
      );
    });

    it('focuses the heading of a legacy ?tab= section after the rewrite', async () => {
      await loaded('/settings/manage?tab=orientations');

      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById('orientations-heading')),
      );
    });
  });

  describe('status region', () => {
    it('is mounted from the first render, polite and not atomic', async () => {
      renderPage();

      const region = statusRegion();
      expect(region).toHaveAttribute('role', 'status');
      expect(region).not.toHaveAttribute('aria-atomic');
      expect(region).toHaveTextContent('');
      await screen.findByTestId('cost-categories-row-bc-1');
      expect(statusRegion()).toBe(region);
    });

    it('announces a created entry after the next frame', async () => {
      const user = userEvent.setup();
      budgetApi.createBudgetCategory.mockResolvedValue(
        costRow({ id: 'bc-3', name: 'Paint', sortOrder: 2 }),
      );
      await loaded();

      await user.click(screen.getByTestId('cost-categories-new'));
      await user.type(screen.getByTestId('cost-categories-name'), 'Paint');
      await user.click(screen.getByTestId('cost-categories-save'));

      await waitFor(() => expect(statusRegion()).toHaveTextContent('Paint added.'));
    });
  });

  describe('cost categories', () => {
    it('lists built-in names translated and user names as typed, in server order', async () => {
      await loaded();

      const names = within(screen.getByTestId('project-setup-cost-categories'))
        .getAllByRole('listitem')
        .map((li) => li.querySelector('[title]')?.getAttribute('title'));
      expect(names).toEqual(['Materials', 'Tiles']);
    });

    it('shows no position numbers on any row', async () => {
      await loaded();

      for (const li of screen.getAllByRole('listitem')) {
        expect(li.textContent).not.toMatch(/#\s*\d/);
      }
    });

    it('marks the colour swatch only for rows that have a colour', async () => {
      await loaded();

      const swatch = (id: string) =>
        screen.getByTestId(`cost-categories-row-${id}`).querySelector('[class*="swatch"]');
      expect(swatch('bc-1')).not.toHaveAttribute('data-color');
      expect(swatch('bc-2')).toHaveAttribute('data-color', 'set');
    });

    it('creates with name, description and colour and appends the row at the end', async () => {
      const user = userEvent.setup();
      budgetApi.createBudgetCategory.mockResolvedValue(
        costRow({ id: 'bc-3', name: 'Paint', sortOrder: 2 }),
      );
      await loaded();

      await user.click(screen.getByTestId('cost-categories-new'));
      await user.type(screen.getByTestId('cost-categories-name'), 'Paint');
      await user.click(screen.getByTestId('cost-categories-save'));

      await waitFor(() =>
        expect(screen.getByTestId('cost-categories-row-bc-3')).toBeInTheDocument(),
      );
      expect(budgetApi.createBudgetCategory).toHaveBeenCalledWith({
        name: 'Paint',
        description: null,
        color: null,
      });
      const rows = within(screen.getByTestId('project-setup-cost-categories')).getAllByRole(
        'listitem',
      );
      expect(rows.at(-1)).toBe(screen.getByTestId('cost-categories-row-bc-3'));
      await waitFor(() => expect(costMenu('bc-3')).toHaveFocus());
    });

    it('shows the duplicate-name copy and keeps the dialog open on a 409 CONFLICT', async () => {
      const user = userEvent.setup();
      budgetApi.createBudgetCategory.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'RAW-SERVER-SENTINEL' }),
      );
      await loaded();

      await user.click(screen.getByTestId('cost-categories-new'));
      await user.type(screen.getByTestId('cost-categories-name'), 'Tiles');
      await user.click(screen.getByTestId('cost-categories-save'));

      expect(
        await screen.findByText(enSettings.projectSetup.costCategories.duplicateName),
      ).toBeVisible();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('edits only the changed field and announces the save', async () => {
      const user = userEvent.setup();
      budgetApi.updateBudgetCategory.mockResolvedValue({ ...TILES, name: 'Wall tiles' });
      await loaded();

      await chooseCostAction(user, 'bc-2', 'edit');
      await user.clear(screen.getByTestId('cost-categories-name'));
      await user.type(screen.getByTestId('cost-categories-name'), 'Wall tiles');
      await user.click(screen.getByTestId('cost-categories-save'));

      await waitFor(() =>
        expect(budgetApi.updateBudgetCategory).toHaveBeenCalledWith('bc-2', { name: 'Wall tiles' }),
      );
      await waitFor(() => expect(statusRegion()).toHaveTextContent('Wall tiles saved.'));
    });

    it('does not send the name of an unchanged built-in category', async () => {
      const user = userEvent.setup();
      budgetApi.updateBudgetCategory.mockResolvedValue(BUILT_IN);
      await loaded();

      await chooseCostAction(user, 'bc-1', 'edit');
      expect((screen.getByTestId('cost-categories-name') as HTMLInputElement).value).toBe(
        'Materials',
      );
      await user.type(screen.getByTestId('cost-categories-description'), 'Notes');
      await user.click(screen.getByTestId('cost-categories-save'));

      await waitFor(() => expect(budgetApi.updateBudgetCategory).toHaveBeenCalledTimes(1));
      expect(budgetApi.updateBudgetCategory).toHaveBeenCalledWith('bc-1', { description: 'Notes' });
    });

    it('deletes after confirming and focuses the neighbouring row actions', async () => {
      const user = userEvent.setup();
      budgetApi.deleteBudgetCategory.mockResolvedValue(undefined);
      await loaded();

      await chooseCostAction(user, 'bc-1', 'delete');
      await user.click(screen.getByTestId('cost-categories-delete-dialog-confirm'));

      await waitFor(() =>
        expect(screen.queryByTestId('cost-categories-row-bc-1')).not.toBeInTheDocument(),
      );
      expect(budgetApi.deleteBudgetCategory).toHaveBeenCalledWith('bc-1');
      await waitFor(() => expect(costMenu('bc-2')).toHaveFocus());
      await waitFor(() => expect(statusRegion()).toHaveTextContent('Materials deleted.'));
    });

    it('blocked delete: fixed sentence, no counts and no Delete button', async () => {
      const user = userEvent.setup();
      budgetApi.deleteBudgetCategory.mockRejectedValue(
        new ApiClientError(409, {
          code: 'CATEGORY_IN_USE',
          message: 'RAW-SERVER-SENTINEL',
          details: { workItemCount: 7, subsidyProgramCount: 3 },
        }),
      );
      await loaded();

      await chooseCostAction(user, 'bc-2', 'delete');
      await user.click(screen.getByTestId('cost-categories-delete-dialog-confirm'));

      const dialog = await screen.findByRole('alertdialog');
      await within(dialog).findByText(
        "Tiles is still used by cost lines or grants, so it can't be deleted.",
      );
      expect(screen.queryByTestId('cost-categories-delete-dialog-confirm')).toBeNull();
      expect(dialog.textContent).not.toMatch(/[0-9]/);
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      expect(screen.getByTestId('cost-categories-row-bc-2')).toBeInTheDocument();
    });

    it('does not ask for delete consequences for a cost category', async () => {
      const user = userEvent.setup();
      await loaded();

      await chooseCostAction(user, 'bc-2', 'delete');
      await screen.findByRole('alertdialog');

      expect(screen.queryByTestId('cost-categories-delete-dialog-consequences')).toBeNull();
    });

    it('shows a load error with Retry that reloads only this list', async () => {
      const user = userEvent.setup();
      budgetApi.fetchBudgetCategories.mockRejectedValueOnce(new Error('offline'));
      renderPage();

      await user.click(await screen.findByTestId('cost-categories-retry'));

      await screen.findByTestId('cost-categories-row-bc-1');
      expect(budgetApi.fetchBudgetCategories).toHaveBeenCalledTimes(2);
      expect(householdApi.fetchHouseholdItemCategories).toHaveBeenCalledTimes(1);
      expect(orientationApi.fetchOrientations).toHaveBeenCalledTimes(1);
    });
  });

  describe('purchase categories', () => {
    it('creates with name and colour only', async () => {
      const user = userEvent.setup();
      householdApi.createHouseholdItemCategory.mockResolvedValue(
        purchaseRow({ id: 'hic-3', name: 'Lamps', sortOrder: 2 }),
      );
      await loaded();

      await user.click(screen.getByTestId('purchase-categories-new'));
      expect(screen.queryByTestId('purchase-categories-description')).toBeNull();
      await user.type(screen.getByTestId('purchase-categories-name'), 'Lamps');
      await user.click(screen.getByTestId('purchase-categories-save'));

      await waitFor(() =>
        expect(householdApi.createHouseholdItemCategory).toHaveBeenCalledWith({
          name: 'Lamps',
          color: null,
        }),
      );
    });

    it('blocked delete uses the purchase wording', async () => {
      const user = userEvent.setup();
      householdApi.deleteHouseholdItemCategory.mockRejectedValue(
        new ApiClientError(409, { code: 'CATEGORY_IN_USE', message: 'x' }),
      );
      await loaded();

      await user.click(screen.getByTestId('purchase-categories-menu-hic-1'));
      await user.click(await screen.findByTestId('purchase-categories-delete-hic-1'));
      await user.click(screen.getByTestId('purchase-categories-delete-dialog-confirm'));

      await screen.findByText("Furniture is still used by purchases, so it can't be deleted.");
      expect(screen.queryByTestId('purchase-categories-delete-dialog-confirm')).toBeNull();
    });
  });

  describe('photo orientations', () => {
    it('creates with name and description and no colour', async () => {
      const user = userEvent.setup();
      orientationApi.createOrientation.mockResolvedValue(
        orientationRow({ id: 'or-3', name: 'East', sortOrder: 2 }),
      );
      await loaded();

      await user.click(screen.getByTestId('photo-orientations-new'));
      expect(screen.queryByTestId('photo-orientations-color')).toBeNull();
      await user.type(screen.getByTestId('photo-orientations-name'), 'East');
      await user.type(screen.getByTestId('photo-orientations-description'), 'Faces the garden');
      await user.click(screen.getByTestId('photo-orientations-save'));

      await waitFor(() =>
        expect(orientationApi.createOrientation).toHaveBeenCalledWith({
          name: 'East',
          description: 'Faces the garden',
        }),
      );
    });

    it('asks what a delete also changes and lists the counts in the confirm', async () => {
      const user = userEvent.setup();
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'orientation',
        id: 'or-1',
        effects: [{ kind: 'photosLoseOrientation', count: 4 }],
      } as unknown as Awaited<ReturnType<typeof DeleteImpactApiTypes.fetchDeleteImpact>>);
      await loaded();

      await user.click(screen.getByTestId('photo-orientations-menu-or-1'));
      await user.click(await screen.findByTestId('photo-orientations-delete-or-1'));

      const list = await screen.findByTestId('photo-orientations-delete-dialog-consequences');
      expect(list).toHaveTextContent('4');
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('orientation', 'or-1');
    });

    it('deletes after confirming', async () => {
      const user = userEvent.setup();
      orientationApi.deleteOrientation.mockResolvedValue(undefined);
      await loaded();

      await user.click(screen.getByTestId('photo-orientations-menu-or-1'));
      await user.click(await screen.findByTestId('photo-orientations-delete-or-1'));
      const confirm = await screen.findByTestId('photo-orientations-delete-dialog-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
      await user.click(confirm);

      await waitFor(() => expect(orientationApi.deleteOrientation).toHaveBeenCalledWith('or-1'));
      await waitFor(() =>
        expect(screen.queryByTestId('photo-orientations-row-or-1')).not.toBeInTheDocument(),
      );
    });
  });

  describe('list search (#2234)', () => {
    const many = <T,>(make: (i: number) => T): T[] =>
      Array.from({ length: 8 }, (_, i) => make(i + 1));

    it('shows no search field while each list has fewer than 8 rows', async () => {
      await loaded();

      expect(screen.queryByTestId('cost-categories-search')).toBeNull();
      expect(screen.queryByTestId('purchase-categories-search')).toBeNull();
      expect(screen.queryByTestId('photo-orientations-search')).toBeNull();
    });

    it('names each list search after its own items and words no-match per list', async () => {
      const user = userEvent.setup();
      budgetApi.fetchBudgetCategories.mockResolvedValue({
        categories: many((i) => costRow({ id: `bc-${i}`, name: `Cost ${i}`, sortOrder: i })),
      });
      householdApi.fetchHouseholdItemCategories.mockResolvedValue({
        categories: many((i) =>
          purchaseRow({ id: `hic-${i}`, name: `Purchase ${i}`, sortOrder: i }),
        ),
      });
      orientationApi.fetchOrientations.mockResolvedValue({
        orientations: many((i) =>
          orientationRow({ id: `or-${i}`, name: `View ${i}`, sortOrder: i }),
        ),
      });
      renderPage();
      await screen.findByTestId('cost-categories-search');

      expect(screen.getByTestId('cost-categories-search')).toHaveAttribute(
        'placeholder',
        'Search cost categories',
      );
      expect(screen.getByTestId('purchase-categories-search')).toHaveAttribute(
        'placeholder',
        'Search purchase categories',
      );
      expect(screen.getByTestId('photo-orientations-search')).toHaveAttribute(
        'placeholder',
        'Search orientations',
      );

      await user.type(screen.getByTestId('cost-categories-search'), 'zzz');
      await user.type(screen.getByTestId('purchase-categories-search'), 'zzz');
      await user.type(screen.getByTestId('photo-orientations-search'), 'zzz');
      expect(screen.getByText('No cost categories match.')).toBeInTheDocument();
      expect(screen.getByText('No purchase categories match.')).toBeInTheDocument();
      expect(screen.getByText('No orientations match.')).toBeInTheDocument();
    });
  });

  describe('reorder', () => {
    it('Move down sends one request with the full id list and shows the server order', async () => {
      const user = userEvent.setup();
      budgetApi.reorderBudgetCategories.mockResolvedValue([
        { ...TILES, sortOrder: 0 },
        { ...BUILT_IN, sortOrder: 1 },
      ]);
      await loaded();

      await chooseCostAction(user, 'bc-1', 'move-down');

      await waitFor(() =>
        expect(budgetApi.reorderBudgetCategories).toHaveBeenCalledWith(['bc-2', 'bc-1']),
      );
      expect(budgetApi.reorderBudgetCategories).toHaveBeenCalledTimes(1);
      const rows = within(screen.getByTestId('project-setup-cost-categories')).getAllByRole(
        'listitem',
      );
      expect(rows.map((li) => li.getAttribute('data-testid'))).toEqual([
        'cost-categories-row-bc-2',
        'cost-categories-row-bc-1',
      ]);
      await waitFor(() => expect(costMenu('bc-1')).toHaveFocus());
      await waitFor(() => expect(statusRegion()).toHaveTextContent('moved to position 2 of 2'));
    });

    it('reorders the purchase categories and the orientations through their own endpoints', async () => {
      const user = userEvent.setup();
      householdApi.reorderHouseholdItemCategories.mockResolvedValue([APPLIANCES, FURNITURE]);
      orientationApi.reorderOrientations.mockResolvedValue([SOUTH, NORTH]);
      await loaded();

      await user.click(screen.getByTestId('purchase-categories-menu-hic-1'));
      await user.click(await screen.findByTestId('purchase-categories-move-down-hic-1'));
      await waitFor(() =>
        expect(householdApi.reorderHouseholdItemCategories).toHaveBeenCalledWith([
          'hic-2',
          'hic-1',
        ]),
      );
      await user.click(screen.getByTestId('photo-orientations-menu-or-2'));
      await user.click(await screen.findByTestId('photo-orientations-move-up-or-2'));

      await waitFor(() =>
        expect(orientationApi.reorderOrientations).toHaveBeenCalledWith(['or-2', 'or-1']),
      );
    });

    it('rolls back, shows the banner and reloads the list on REORDER_SET_MISMATCH', async () => {
      const user = userEvent.setup();
      budgetApi.reorderBudgetCategories.mockRejectedValue(
        new ApiClientError(409, {
          code: 'REORDER_SET_MISMATCH',
          message: 'RAW-SERVER-SENTINEL',
          details: { missingIds: ['bc-9'], unknownIds: [] },
        }),
      );
      const fresh = [TILES, BUILT_IN, costRow({ id: 'bc-9', name: 'Added elsewhere' })];
      budgetApi.fetchBudgetCategories.mockResolvedValueOnce({ categories: [BUILT_IN, TILES] });
      budgetApi.fetchBudgetCategories.mockResolvedValueOnce({ categories: fresh });
      await loaded();

      await chooseCostAction(user, 'bc-1', 'move-down');

      expect(await screen.findByTestId('cost-categories-reorder-error')).toHaveAttribute(
        'role',
        'alert',
      );
      await screen.findByTestId('cost-categories-row-bc-9');
      expect(budgetApi.fetchBudgetCategories).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      const rows = within(screen.getByTestId('project-setup-cost-categories')).getAllByRole(
        'listitem',
      );
      expect(rows.map((li) => li.getAttribute('data-testid'))).toEqual([
        'cost-categories-row-bc-2',
        'cost-categories-row-bc-1',
        'cost-categories-row-bc-9',
      ]);
    });

    it('restores the previous order and shows the banner on another failure, without reloading', async () => {
      const user = userEvent.setup();
      budgetApi.reorderBudgetCategories.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      await loaded();

      await chooseCostAction(user, 'bc-1', 'move-down');

      await screen.findByTestId('cost-categories-reorder-error');
      const rows = within(screen.getByTestId('project-setup-cost-categories')).getAllByRole(
        'listitem',
      );
      expect(rows.map((li) => li.getAttribute('data-testid'))).toEqual([
        'cost-categories-row-bc-1',
        'cost-categories-row-bc-2',
      ]);
      expect(budgetApi.fetchBudgetCategories).toHaveBeenCalledTimes(1);
      expect(costMenu('bc-1')).toHaveFocus();
    });
  });

  describe('language of user text', () => {
    it('sets lang on user-entered names and descriptions from the entries language', async () => {
      mockEntriesLanguage = 'de';
      await loaded();

      const tiles = screen.getByTestId('cost-categories-row-bc-2');
      expect(within(tiles).getByText('Tiles')).toHaveAttribute('lang', 'de');
      expect(within(tiles).getByText('Floor and wall')).toHaveAttribute('lang', 'de');
      const north = screen.getByTestId('photo-orientations-row-or-1');
      expect(within(north).getByText('North')).toHaveAttribute('lang', 'de');
    });

    it('leaves built-in translated names without a lang attribute', async () => {
      mockEntriesLanguage = 'de';
      await loaded();

      const builtIn = screen.getByTestId('cost-categories-row-bc-1');
      expect(within(builtIn).getByText('Materials')).not.toHaveAttribute('lang');
    });

    it('sets no lang while the entries language is unknown', async () => {
      await loaded();

      expect(
        within(screen.getByTestId('cost-categories-row-bc-2')).getByText('Tiles'),
      ).not.toHaveAttribute('lang');
    });
  });

  describe('House section on the page', () => {
    it('loads the settings once and shows the entries-language select', async () => {
      await loaded();

      expect(mockFetchSettings).toHaveBeenCalledTimes(1);
      expect((screen.getByTestId('project-setup-language') as HTMLSelectElement).value).toBe('en');
    });

    it('sends a changed language to the context and the server', async () => {
      const user = userEvent.setup();
      mockUpdateSettings.mockResolvedValue({ ...SETTINGS, entriesLanguage: 'de' });
      await loaded();

      await user.selectOptions(screen.getByTestId('project-setup-language'), 'de');
      await user.click(screen.getByTestId('project-setup-house-save'));

      await waitFor(() => expect(mockSetEntriesLanguage).toHaveBeenCalledWith('de'));
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ entriesLanguage: 'de' }),
      );
    });
  });
});
