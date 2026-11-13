/**
 * @jest-environment jsdom
 *
 * The Area page shell (#2251): route and states, the one h1, breadcrumbs, the Log here primary
 * (pre-filled with the area through the create context), the room chips, the strip and the order
 * of the sections. Only the areas and diary API clients and the locale are mocked; the sections,
 * the strip and the header are real. All data is synthetic.
 *
 * Mutations these tests catch:
 *  - a route without an id staying on the page, or the page not remounting when the id changes;
 *  - Log here missing the area (or carrying a date), chips shown for a leaf, a chip not linking to
 *    its own page, the Rooms section shown for a leaf;
 *  - not found offering Retry, an error without Retry or without focusing the h1;
 *  - the breadcrumb leaving out an ancestor or listing the area itself, sections out of order.
 */
import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import {
  makeAreaChild,
  makeAreaCompany,
  makeAreaSummary,
  makeNowTask,
} from '../../test/areaPageFixtures.js';
import { CreateMenuProvider } from '../../components/CreateMenu/CreateMenuContext.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as AreasApiTypes from '../../lib/areasApi.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as PageModule from './AreaDetailPage.js';
import enAreas from '../../i18n/en/areas.json';
import enCommon from '../../i18n/en/common.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({
    houseName: null,
    setHouseName: jest.fn(),
    entriesLanguage: null,
    setEntriesLanguage: jest.fn(),
  }),
  useEntriesLanguage: () => 'en',
}));

const mockFetchAreaSummary = jest.fn<typeof AreasApiTypes.fetchAreaSummary>();
const mockFetchAreaCostLines = jest.fn<typeof AreasApiTypes.fetchAreaCostLines>();
const realAreasApi = await import('../../lib/areasApi.js');
jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  ...realAreasApi,
  fetchAreaSummary: mockFetchAreaSummary,
  fetchAreaCostLines: mockFetchAreaCostLines,
}));

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const realDiaryApi = await import('../../lib/diaryApi.js');
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  ...realDiaryApi,
  listDiaryEntries: mockListDiaryEntries,
}));

let Page: typeof PageModule;

beforeAll(async () => {
  Page = await import('./AreaDetailPage.js');
});

const detail = enAreas.detail;

interface Seen {
  type: string;
  path: string;
  search: string;
  state: unknown;
}
const seen: Seen = { type: '', path: '', search: '', state: null };

function Probe() {
  const location = useLocation();
  seen.type = useNavigationType();
  seen.path = location.pathname;
  seen.search = location.search;
  seen.state = location.state;
  return null;
}

function renderPage(entry = '/areas/floor', state?: unknown) {
  return render(
    <ToastProvider>
      <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
        <MemoryRouter initialEntries={[{ pathname: entry, state }]}>
          <Probe />
          <Routes>
            <Route path="/areas/:id" element={<Page.default />} />
            <Route path="/areas" element={<div data-testid="areas-index" />} />
            <Route path="/needs-no-id" element={<Page.AreaDetailPage />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
        </MemoryRouter>
      </CreateMenuProvider>
    </ToastProvider>,
  );
}

async function loaded(entry?: string) {
  const view = renderPage(entry);
  await screen.findByRole('heading', { level: 1, name: /Ground floor|Kitchen|Attic/ });
  return view;
}

const FLOOR_WITH_ROOMS = makeAreaSummary({
  area: {
    id: 'floor',
    name: 'Ground floor',
    description: 'Living level',
    color: '#336699',
    parentId: 'house',
    ancestors: [{ id: 'house', name: 'House', color: null }],
  },
  children: [
    makeAreaChild('kitchen', { name: 'Kitchen', color: '#112233', photoCount: 2 }),
    makeAreaChild('bath', { name: 'Bath' }),
  ],
  counts: {
    workItems: { total: 2, open: 2, late: 1 },
    householdItems: { total: 0, open: 0 },
    photos: { total: 2, latestDate: '2026-03-05' },
    companies: 1,
  },
  nowAndNext: [makeNowTask('t1', { title: 'Tile floors' })],
  companies: [makeAreaCompany('c1', { name: 'Alpha Build' })],
  money: { expectedCost: 1200, paid: 0 },
});

const LEAF = makeAreaSummary({
  area: { ...FLOOR_WITH_ROOMS.area, id: 'attic', name: 'Attic', ancestors: [], parentId: null },
});

const h1s = () => screen.queryAllByRole('heading', { level: 1 });

describe('AreaDetailPage', () => {
  beforeEach(() => {
    installMatchMedia({ '(min-width: 768px)': true });
    mockFetchAreaSummary.mockReset();
    mockFetchAreaCostLines.mockReset();
    mockListDiaryEntries.mockReset();
    mockFetchAreaSummary.mockResolvedValue(FLOOR_WITH_ROOMS);
    mockFetchAreaCostLines.mockResolvedValue([]);
    mockListDiaryEntries.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 3, totalItems: 0, totalPages: 0 },
    } as never);
    document.title = 'initial';
    seen.type = '';
  });

  describe('route and states', () => {
    it('sends a route without an area id back to the Areas index with a replace', async () => {
      renderPage('/needs-no-id');

      await waitFor(() => expect(seen.path).toBe('/areas'));
      expect(seen.type).toBe('REPLACE');
      expect(mockFetchAreaSummary).not.toHaveBeenCalled();
    });

    it('loads the summary of the area in the route', async () => {
      await loaded('/areas/floor');

      expect(mockFetchAreaSummary).toHaveBeenCalledWith('floor');
      expect(mockFetchAreaSummary).toHaveBeenCalledTimes(1);
    });

    it('shows the typed h1 "Area" and a loading skeleton while loading', () => {
      mockFetchAreaSummary.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(screen.getByRole('heading', { name: detail.typeLabel, level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('status', { name: detail.loading })).toBeInTheDocument();
      expect(screen.queryByTestId('area-header')).toBeNull();
    });

    it('shows one "Area not found" h1 and Back to Areas on a 404, without Retry', async () => {
      mockFetchAreaSummary.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Area not found' }),
      );
      renderPage('/areas/nope');

      expect(await screen.findByRole('heading', { name: detail.notFound, level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: enAreas.index.retry })).toBeNull();
      expect(document.title).toContain(detail.notFound);
      fireEvent.click(
        screen.getByRole('button', {
          name: enCommon.navigation.backTo.replace('{{origin}}', enCommon.navigation.areas),
        }),
      );
      expect(await screen.findByTestId('areas-index')).toBeInTheDocument();
    });

    it('shows an error card with Back and Retry, focuses the h1 and reloads on Retry', async () => {
      mockFetchAreaSummary.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'boom' }),
      );
      renderPage();

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByRole('button', { name: /Back to Areas/ })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());

      fireEvent.click(within(alert).getByRole('button', { name: enAreas.index.retry }));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Ground floor' }),
      ).toBeInTheDocument();
      expect(mockFetchAreaSummary).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the area name as the one h1 and in the document title once loaded', async () => {
      await loaded();

      expect(h1s()).toHaveLength(1);
      expect(h1s()[0]).toHaveTextContent('Ground floor');
      expect(document.title).toContain('Ground floor');
    });
  });

  describe('header', () => {
    it('shows the description and an aria-hidden colour dot before the name', async () => {
      await loaded();

      const header = screen.getByTestId('area-header');
      expect(within(header).getByText('Living level')).toBeInTheDocument();
      const dot = header.querySelector('[data-color="set"]') as HTMLElement;
      expect(dot.style.getPropertyValue('--tree-color')).toBe('#336699');
      expect(dot.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('shows no description paragraph for an area without one', async () => {
      mockFetchAreaSummary.mockResolvedValue(
        makeAreaSummary({ area: { ...FLOOR_WITH_ROOMS.area, description: null } }),
      );
      await loaded();

      expect(screen.queryByTestId('area-header-description')).toBeNull();
    });

    it('lists the ancestors as breadcrumb links after Areas, never the area itself', async () => {
      await loaded();

      const nav = screen.getByRole('navigation', { name: 'You are here' });
      const links = within(nav).getAllByRole('link');
      expect(links.map((a) => [a.textContent?.replace('‹', ''), a.getAttribute('href')])).toEqual([
        ['Areas', '/areas'],
        ['House', '/areas/house'],
      ]);
      expect(within(nav).queryByText('Ground floor')).toBeNull();
    });

    it('shows only Areas for a top-level area', async () => {
      mockFetchAreaSummary.mockResolvedValue(LEAF);
      await loaded('/areas/attic');

      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getAllByRole('link')).toHaveLength(1);
    });

    it('offers Log here as the primary, linking to the diary capture for this area and never a date', async () => {
      await loaded();

      const log = screen.getByTestId('area-primary-log');
      expect(log).toHaveTextContent(detail.logHere);
      await waitFor(() => expect(log.getAttribute('href')).toContain('areaId=floor'));
      const url = new URL(log.getAttribute('href')!, 'http://localhost');
      expect(url.pathname).toBe('/diary/new');
      expect(url.searchParams.get('areaId')).toBe('floor');
      expect(url.searchParams.has('date')).toBe(false);
    });

    it('carries this page as the origin when Log here is used', async () => {
      await loaded();
      await waitFor(() =>
        expect(screen.getByTestId('area-primary-log').getAttribute('href')).toContain('areaId'),
      );

      fireEvent.click(screen.getByTestId('area-primary-log'));

      expect(seen.path).toBe('/diary/new');
      expect((seen.state as { origin: { to: string } }).origin.to).toBe('/areas/floor');
    });
  });

  describe('room chips', () => {
    it('shows a labelled group with one link chip per child, each to its own page', async () => {
      await loaded();

      const group = screen.getByRole('group', {
        name: detail.subAreasOf.replace('{{area}}', 'Ground floor'),
      });
      const chips = within(group).getAllByRole('link');
      expect(chips.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ['Kitchen', '/areas/kitchen'],
        ['Bath', '/areas/bath'],
      ]);
      chips.forEach((chip) => expect(chip).not.toHaveAttribute('aria-pressed'));
      expect(chips[0]).toHaveAttribute('title', 'Kitchen');
    });

    it('shows a colour dot only on a coloured chip, aria-hidden', async () => {
      await loaded();

      const kitchen = screen.getByTestId('area-chip-kitchen');
      expect(kitchen.querySelector('[data-color="set"]')).not.toBeNull();
      expect(screen.getByTestId('area-chip-bath').querySelector('[data-color]')).toBeNull();
      expect(kitchen).toHaveAccessibleName('Kitchen');
    });

    it('shows no chip group for a leaf area', async () => {
      mockFetchAreaSummary.mockResolvedValue(LEAF);
      await loaded('/areas/attic');

      expect(screen.queryByRole('group')).toBeNull();
      expect(screen.queryByTestId('area-chip-kitchen')).toBeNull();
    });

    it('opens the child page on click and remounts with the child data and this page as origin', async () => {
      await loaded();
      mockFetchAreaSummary.mockResolvedValue(
        makeAreaSummary({
          area: {
            id: 'kitchen',
            name: 'Kitchen',
            description: null,
            color: null,
            parentId: 'floor',
            ancestors: [
              { id: 'house', name: 'House', color: null },
              { id: 'floor', name: 'Ground floor', color: null },
            ],
          },
        }),
      );

      fireEvent.click(screen.getByTestId('area-chip-kitchen'));

      expect(await screen.findByRole('heading', { level: 1, name: 'Kitchen' })).toBeInTheDocument();
      expect(mockFetchAreaSummary).toHaveBeenLastCalledWith('kitchen');
      expect(mockFetchAreaSummary).toHaveBeenCalledTimes(2);
      expect(seen.path).toBe('/areas/kitchen');
      // the chip carried this page as the origin; it is the nearest parent of the child, so the
      // trail already offers it and Back stays suppressed
      expect((seen.state as { origin: { to: string; name?: string } }).origin).toEqual({
        to: '/areas/floor',
        name: 'Ground floor',
      });
      expect(screen.queryByTestId('breadcrumbs-back')).toBeNull();
      const trail = within(screen.getByRole('navigation', { name: 'You are here' })).getAllByRole(
        'link',
      );
      expect(trail.map((a) => a.getAttribute('href'))).toEqual([
        '/areas',
        '/areas/house',
        '/areas/floor',
      ]);
    });
  });

  describe('strip and sections', () => {
    it('renders the 4-column strip "Area summary" with the four facts', async () => {
      await loaded();

      const strip = screen.getByRole('region', {
        name: enCommon.summaryStrip.label.replace('{{type}}', detail.typeLabel),
      });
      expect(strip.querySelector('dl')).toHaveAttribute('data-columns', '4');
      expect(within(strip).getAllByRole('link')).toHaveLength(4);
      expect(screen.getByTestId('summary-fact-cost')).toHaveTextContent('€1,200.00');
    });

    it('renders the sections in order: now, site, companies, rooms, cost', async () => {
      await loaded();
      await screen.findByTestId('area-companies');

      const order = Array.from(document.querySelectorAll('h2')).map((h) => h.textContent);
      expect(order).toEqual([
        detail.sections.now,
        detail.sections.site,
        `${detail.sections.companies} (1)`,
        `${detail.sections.rooms} (2)`,
        detail.sections.cost,
      ]);
    });

    it('wraps each section in its jump target id', async () => {
      await loaded();

      for (const id of ['area-now', 'area-site', 'area-companies', 'area-rooms', 'area-cost']) {
        expect(document.getElementById(id)).not.toBeNull();
      }
      expect(document.getElementById('area-cost')).toContainElement(
        screen.getByRole('heading', { level: 2, name: detail.sections.cost }),
      );
    });

    it('leaves the Rooms section out for a leaf and keeps the others', async () => {
      mockFetchAreaSummary.mockResolvedValue(LEAF);
      await loaded('/areas/attic');

      expect(document.getElementById('area-rooms')).toBeNull();
      expect(screen.queryByTestId('area-rooms')).toBeNull();
      expect(Array.from(document.querySelectorAll('h2')).map((h) => h.textContent)).toEqual([
        detail.sections.now,
        detail.sections.site,
        `${detail.sections.companies} (0)`,
        detail.sections.cost,
      ]);
    });

    it('titles the children section "Sub-areas" for a room', async () => {
      mockFetchAreaSummary.mockResolvedValue(
        makeAreaSummary({
          area: {
            ...FLOOR_WITH_ROOMS.area,
            ancestors: [
              { id: 'house', name: 'House', color: null },
              { id: 'floor', name: 'Floor', color: null },
            ],
          },
          children: [makeAreaChild('sink')],
        }),
      );
      await loaded();

      expect(
        screen.getByRole('heading', { level: 2, name: `${detail.sections.subAreas} (1)` }),
      ).toBeInTheDocument();
    });

    it('loads the cost lines and the diary entries of this area, not another', async () => {
      await loaded();

      await waitFor(() => expect(mockFetchAreaCostLines).toHaveBeenCalledWith('floor'));
      expect(mockListDiaryEntries).toHaveBeenCalledWith({
        areaId: 'floor',
        status: 'saved',
        pageSize: 3,
      });
    });

    it('keeps the page usable when a section fails to load', async () => {
      mockFetchAreaCostLines.mockRejectedValue(new Error('offline'));
      await loaded();

      expect(await screen.findByText(detail.cost.loadError)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Ground floor' })).toBeInTheDocument();
      expect(screen.getByTestId('area-now-work_item-t1')).toBeInTheDocument();
    });

    it('renders no duplicate test ids', async () => {
      await loaded();
      await screen.findByTestId('area-companies');

      const ids = Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
        el.getAttribute('data-testid'),
      );
      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    });
  });
});
