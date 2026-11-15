/**
 * @jest-environment jsdom
 *
 * Rooms / Sub-areas (#2251): the direct children, each opening its own area page. The heading is
 * "Rooms" for a building or floor (depth 0 and 1) and "Sub-areas" below that.
 *
 * Mutations these tests catch:
 *  - the heading rule off by one (a floor shown as "Sub-areas", a room as "Rooms");
 *  - the children not linking to /areas/:childId with the origin state, the colour dot exposed to
 *    assistive technology or missing for a coloured child;
 *  - photos shown as a count at 0 (must be the muted "No photos"), open tasks shown at 0, the
 *    singular/plural of photos wrong.
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AreaPageSummary } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeAreaChild, makeAreaSummary } from '../../test/areaPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as ListModule from './AreaRoomsList.js';
import enAreas from '../../i18n/en/areas.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

let AreaRoomsList: typeof ListModule.AreaRoomsList;

beforeAll(async () => {
  ({ AreaRoomsList } = await import('./AreaRoomsList.js'));
});

const ORIGIN = { origin: { to: '/areas/floor', name: 'Ground floor' } };
const sections = enAreas.detail.sections;

function renderList(summary: AreaPageSummary) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/areas/floor']}>
        <AreaRoomsList summary={summary} originState={ORIGIN} />
        <OriginProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const ancestors = (n: number) =>
  Array.from({ length: n }, (_v, i) => ({ id: `anc-${i}`, name: `Ancestor ${i}`, color: null }));

function summaryAt(depth: number, children = [makeAreaChild('r1')]): AreaPageSummary {
  const base = makeAreaSummary();
  return makeAreaSummary({
    area: { ...base.area, ancestors: ancestors(depth) },
    children,
  });
}

const row = (id: string) => screen.getByTestId(`area-rooms-row-${id}`);

describe('AreaRoomsList heading', () => {
  it.each([
    [0, sections.rooms, 'a top-level building'],
    [1, sections.rooms, 'a floor'],
    [2, sections.subAreas, 'a room'],
    [3, sections.subAreas, 'a sub-area of a room'],
  ])('at %i ancestors the heading is "%s" (%s)', (depth, expected) => {
    renderList(summaryAt(depth, [makeAreaChild('r1'), makeAreaChild('r2')]));

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${expected} (2)`);
    expect(screen.getByTestId('area-rooms')).toBeInTheDocument();
  });
});

describe('AreaRoomsList rows', () => {
  it('links each child to its own area page and carries the origin', () => {
    renderList(summaryAt(1, [makeAreaChild('r1', { name: 'Kitchen' })]));

    const link = within(row('r1')).getByRole('link', { name: 'Kitchen' });
    expect(link).toHaveAttribute('href', '/areas/r1');
    fireEvent.click(link);
    expect(probedPath()).toBe('/areas/r1');
    expect(probedOrigin()).toEqual(ORIGIN.origin);
  });

  it('keeps the order of the children', () => {
    renderList(
      summaryAt(1, [
        makeAreaChild('b', { name: 'Bath' }),
        makeAreaChild('a', { name: 'Attic' }),
        makeAreaChild('c', { name: 'Cellar' }),
      ]),
    );

    expect(
      screen.getAllByTestId(/^area-rooms-row-/).map((el) => el.getAttribute('data-testid')),
    ).toEqual(['area-rooms-row-b', 'area-rooms-row-a', 'area-rooms-row-c']);
  });

  it('shows the photo count and the open tasks as facts', () => {
    renderList(summaryAt(1, [makeAreaChild('r1', { photoCount: 3, openTaskCount: 2 })]));

    expect(row('r1')).toHaveTextContent('3 photos · 2 open');
  });

  it('uses the singular for one photo', () => {
    renderList(summaryAt(1, [makeAreaChild('r1', { photoCount: 1 })]));

    expect(row('r1')).toHaveTextContent('1 photo');
    expect(row('r1')).not.toHaveTextContent('1 photos');
  });

  it('shows a muted "No photos" at 0 photos and hides the open count at 0', () => {
    renderList(summaryAt(1, [makeAreaChild('r1', { photoCount: 0, openTaskCount: 0 })]));

    const muted = within(row('r1')).getByText(enAreas.detail.rooms.noPhotos);
    expect(muted).toHaveClass('muted');
    expect(row('r1')).not.toHaveTextContent('open');
    expect(row('r1')).not.toHaveTextContent(' · ');
  });

  it('shows open tasks together with "No photos" when only tasks exist', () => {
    renderList(summaryAt(1, [makeAreaChild('r1', { photoCount: 0, openTaskCount: 4 })]));

    expect(row('r1')).toHaveTextContent('No photos · 4 open');
  });

  describe('colour dot', () => {
    it('renders an aria-hidden dot before a coloured child and an empty outline otherwise', () => {
      renderList(
        summaryAt(1, [
          makeAreaChild('r1', { name: 'Kitchen', color: '#336699' }),
          makeAreaChild('r2', { name: 'Bath', color: null }),
        ]),
      );

      const dot1 = row('r1').querySelector('[data-color="set"]') as HTMLElement;
      expect(dot1.style.getPropertyValue('--tree-color')).toBe('#336699');
      expect(dot1.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(row('r2').querySelector('[data-color]')).toBeNull();
      expect(row('r2').querySelector('[aria-hidden="true"]')).not.toBeNull();
    });

    it('keeps the dot out of the link name', () => {
      renderList(summaryAt(1, [makeAreaChild('r1', { name: 'Kitchen', color: '#336699' })]));

      expect(screen.getByRole('link', { name: 'Kitchen' })).toHaveAccessibleName('Kitchen');
    });
  });
});
