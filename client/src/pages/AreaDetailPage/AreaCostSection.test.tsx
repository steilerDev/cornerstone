/**
 * @jest-environment jsdom
 *
 * Cost (#2251): the read-only cost lines of the tasks and purchases in the area and below,
 * grouped by owner, with a link on to Money. Only the areas API client and the locale are mocked;
 * the table is real. All data is synthetic.
 *
 * Mutations these tests catch:
 *  - the section loading another area's lines or not reloading when the area changes;
 *  - lines grouped by something other than their owner (one group per task / purchase);
 *  - a row action (edit / menu) leaking into the read-only table;
 *  - the overview link missing in the empty or error state, or without the origin;
 *  - the error blocking the card (no Retry) or Retry not reloading.
 */
import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeAreaCostLine } from '../../test/areaPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as AreasApiTypes from '../../lib/areasApi.js';
import type * as SectionModule from './AreaCostSection.js';
import enAreas from '../../i18n/en/areas.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

const mockFetchAreaCostLines = jest.fn<typeof AreasApiTypes.fetchAreaCostLines>();
const realAreasApi = await import('../../lib/areasApi.js');
jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  ...realAreasApi,
  fetchAreaCostLines: mockFetchAreaCostLines,
}));

let AreaCostSection: typeof SectionModule.AreaCostSection;

beforeAll(async () => {
  ({ AreaCostSection } = await import('./AreaCostSection.js'));
});

const ORIGIN = { origin: { to: '/areas/floor', name: 'Ground floor' } };
const cost = enAreas.detail.cost;

const LINES = [
  makeAreaCostLine('l1', {
    description: 'Oak flooring',
    plannedAmount: 595,
    itemType: 'work_item',
    itemId: 'wi-1',
    itemTitle: 'Lay floors',
  }),
  makeAreaCostLine('l2', {
    description: 'Underlay',
    plannedAmount: 100,
    itemType: 'work_item',
    itemId: 'wi-1',
    itemTitle: 'Lay floors',
  }),
  makeAreaCostLine('l3', {
    description: 'Sofa frame',
    plannedAmount: 800,
    itemType: 'household_item',
    itemId: 'hi-1',
    itemTitle: 'Sofa',
  }),
];

function renderSection(areaId = 'floor', areaName = 'Ground floor') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/areas/floor']}>
        <AreaCostSection areaId={areaId} areaName={areaName} originState={ORIGIN} />
        <OriginProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AreaCostSection', () => {
  beforeEach(() => {
    mockFetchAreaCostLines.mockReset();
    mockFetchAreaCostLines.mockResolvedValue(LINES);
  });

  it('loads the lines of the area once and renders the card heading "Cost"', async () => {
    renderSection('floor');

    await screen.findByTestId('area-cost-lines');
    expect(mockFetchAreaCostLines).toHaveBeenCalledTimes(1);
    expect(mockFetchAreaCostLines).toHaveBeenCalledWith('floor');
    expect(screen.getByRole('region', { name: enAreas.detail.sections.cost })).toHaveAttribute(
      'data-testid',
      'section-area-cost',
    );
  });

  it('shows a skeleton while loading and already offers the overview link', () => {
    mockFetchAreaCostLines.mockReturnValue(new Promise(() => {}));
    renderSection();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('area-cost-lines')).toBeNull();
    expect(screen.getByTestId('area-cost-overview')).toBeInTheDocument();
  });

  describe('groups', () => {
    it('makes one group per owning task or purchase, each headed by its title link', async () => {
      renderSection();

      await screen.findByTestId('area-cost-lines');
      const tableGroups = screen
        .getAllByTestId(/^area-cost-lines-group-target-/)
        .map((el) => el.getAttribute('data-testid'));
      expect(tableGroups).toEqual([
        'area-cost-lines-group-target-work_item-wi-1',
        'area-cost-lines-group-target-household_item-hi-1',
      ]);
      const task = screen.getByTestId('area-cost-lines-group-target-work_item-wi-1');
      expect(within(task).getByRole('link', { name: /Lay floors/ })).toHaveAttribute(
        'href',
        '/project/work-items/wi-1',
      );
      const purchase = screen.getByTestId('area-cost-lines-group-target-household_item-hi-1');
      expect(within(purchase).getByRole('link', { name: /Sofa/ })).toHaveAttribute(
        'href',
        '/project/household-items/hi-1',
      );
    });

    it('puts the lines of one owner in its group and the other owner elsewhere', async () => {
      renderSection();

      await screen.findByTestId('area-cost-lines');
      const taskGroup = screen
        .getByTestId('area-cost-lines-group-target-work_item-wi-1')
        .closest('tbody') as HTMLElement;
      expect(within(taskGroup).getByTestId('area-cost-lines-row-l1')).toBeInTheDocument();
      expect(within(taskGroup).getByTestId('area-cost-lines-row-l2')).toBeInTheDocument();
      expect(within(taskGroup).queryByTestId('area-cost-lines-row-l3')).toBeNull();
      const purchaseGroup = screen
        .getByTestId('area-cost-lines-group-target-household_item-hi-1')
        .closest('tbody') as HTMLElement;
      expect(within(purchaseGroup).getByTestId('area-cost-lines-row-l3')).toBeInTheDocument();
      expect(within(purchaseGroup).queryByTestId('area-cost-lines-row-l1')).toBeNull();
    });

    it('shows gross amounts per line and the owner total in the group heading', async () => {
      renderSection();

      await screen.findByTestId('area-cost-lines');
      expect(screen.getByTestId('area-cost-lines-row-l1')).toHaveTextContent('€595.00');
      expect(screen.getByTestId('area-cost-lines-row-l2')).toHaveTextContent('€100.00');
      expect(screen.getByTestId('area-cost-lines-group-target-work_item-wi-1')).toHaveTextContent(
        'Total €695.00',
      );
      expect(
        screen.getByTestId('area-cost-lines-group-target-household_item-hi-1'),
      ).toHaveTextContent('Total €800.00');
    });

    it('is read-only: no row menu and no edit button', async () => {
      renderSection();

      await screen.findByTestId('area-cost-lines');
      expect(screen.queryByRole('button', { name: /actions|edit/i })).toBeNull();
    });

    it('carries the origin state when an owner link is used', async () => {
      renderSection();

      const task = await screen.findByTestId('area-cost-lines-group-target-work_item-wi-1');
      fireEvent.click(within(task).getByRole('link', { name: /Lay floors/ }));

      expect(probedPath()).toBe('/project/work-items/wi-1');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('empty', () => {
    it('shows the empty message with the area name and still the overview link', async () => {
      mockFetchAreaCostLines.mockResolvedValue([]);
      renderSection('attic', 'Attic');

      expect(await screen.findByText(cost.empty.replace('{{area}}', 'Attic'))).toBeInTheDocument();
      expect(screen.queryByTestId('area-cost-lines')).toBeNull();
      expect(screen.getByTestId('area-cost-overview')).toBeInTheDocument();
    });
  });

  describe('overview link', () => {
    it('reads "Open Money" with a hidden arrow and opens the budget overview with the origin', async () => {
      renderSection();

      const link = await screen.findByTestId('area-cost-overview');
      expect(link).toHaveTextContent(cost.overview);
      expect(cost.overview).toBe('Open Money');
      expect(link.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
      fireEvent.click(link);
      expect(probedPath()).toBe(link.getAttribute('href'));
      expect(probedPath()).toBe('/budget/overview');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('errors', () => {
    it('shows an error with Retry inside the card, keeps the overview link, reloads on Retry', async () => {
      mockFetchAreaCostLines.mockRejectedValueOnce(new Error('offline'));
      renderSection();

      const card = screen.getByRole('region', { name: enAreas.detail.sections.cost });
      expect(await within(card).findByText(cost.loadError)).toBeInTheDocument();
      expect(within(card).getByTestId('area-cost-overview')).toBeInTheDocument();

      fireEvent.click(within(card).getByRole('button', { name: enAreas.index.retry }));

      expect(await screen.findByTestId('area-cost-lines')).toBeInTheDocument();
      expect(mockFetchAreaCostLines).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(cost.loadError)).toBeNull();
    });
  });

  describe('area change', () => {
    it('loads the lines of the new area when the id changes', async () => {
      const view = renderSection('floor');
      await screen.findByTestId('area-cost-lines');
      mockFetchAreaCostLines.mockResolvedValue([]);

      view.rerender(
        <ToastProvider>
          <MemoryRouter initialEntries={['/areas/attic']}>
            <AreaCostSection areaId="attic" areaName="Attic" originState={ORIGIN} />
          </MemoryRouter>
        </ToastProvider>,
      );

      await waitFor(() => expect(mockFetchAreaCostLines).toHaveBeenLastCalledWith('attic'));
      expect(await screen.findByText(cost.empty.replace('{{area}}', 'Attic'))).toBeInTheDocument();
    });
  });
});
