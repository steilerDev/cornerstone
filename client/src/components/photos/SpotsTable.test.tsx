import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OriginState } from '../../navigation/origin.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type { SpotsTable as SpotsTableType } from './SpotsTable.js';
import { buildSpotGroups } from '../../lib/photoSpots.js';
import {
  makeArea,
  makeOrientation,
  makeSpot,
  makeLocaleContextMock,
} from '../../test/photoSpotFixtures.js';

// useFormatters() needs a locale context; supply one without a LocaleProvider.
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let SpotsTable: typeof SpotsTableType;

beforeAll(async () => {
  ({ SpotsTable } = await import('./SpotsTable.js'));
});

const orientations = [makeOrientation('o1', 'Ceiling', 1), makeOrientation('o2', 'Floor', 2)];

function renderTable(
  areas = [makeArea('a1', 'Kitchen')],
  spots = [makeSpot('a1', 'o1', { photoCount: 3, latestPhotoId: 'pX' })],
  linkState?: OriginState,
) {
  const groups = buildSpotGroups(areas, orientations, spots);
  return render(
    <MemoryRouter>
      <SpotsTable groups={groups} orientations={orientations} linkState={linkState} />
      <OriginProbe />
    </MemoryRouter>,
  );
}

describe('SpotsTable', () => {
  it('has a (screen-reader) caption', () => {
    renderTable();
    expect(
      screen.getByRole('table', { name: 'Photos by area and orientation' }),
    ).toBeInTheDocument();
  });

  it('shows column headers: Area, each orientation in order from the API, then "No orientation"', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Area', 'Ceiling', 'Floor', 'No orientation']);
  });

  it('follows the supplied orientation names rather than hardcoded compass names', () => {
    renderTable();
    expect(screen.queryByText('North')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ceiling' })).toBeInTheDocument();
  });

  it('renders a group header spanning orientations + 2 columns for areas with children', () => {
    const areas = [makeArea('r', 'House'), makeArea('c', 'Kitchen', { parentId: 'r' })];
    const { container } = renderTable(areas, [makeSpot('c', 'o1')]);

    const header = container.querySelector('th[scope="rowgroup"]')!;
    expect(header).toHaveTextContent('House');
    expect(header).toHaveAttribute('colspan', String(orientations.length + 2));
  });

  it('does not render a group header for a root without children', () => {
    const { container } = renderTable();
    expect(container.querySelector('th[scope="rowgroup"]')).toBeNull();
  });

  it('renders a "No area" row only when a spot without area exists', () => {
    const { unmount } = renderTable();
    expect(screen.queryByRole('rowheader', { name: 'No area' })).not.toBeInTheDocument();
    unmount();

    renderTable([makeArea('a1', 'Kitchen')], [makeSpot(null, 'o1')]);
    expect(screen.getByRole('rowheader', { name: 'No area' })).toBeInTheDocument();
  });

  it('links a populated cell to the viewer with ?photo=<latestPhotoId>', () => {
    renderTable();
    const link = screen.getByTestId('spot-cell-a1:o1');
    expect(link).toHaveAttribute('href', '/photos/spot/a1/o1?photo=pX');
    expect(link).toHaveAttribute('id', 'spot-a1:o1');
  });

  it('builds the plural-aware accessible label for 3 photos', () => {
    renderTable();
    expect(screen.getByTestId('spot-cell-a1:o1')).toHaveAttribute(
      'aria-label',
      'Kitchen, Ceiling: 3 photos, latest September 11, 2026',
    );
  });

  it('builds the singular accessible label for 1 photo, using "No orientation" for the null column', () => {
    renderTable([makeArea('a1', 'Kitchen')], [makeSpot('a1', null, { photoCount: 1 })]);
    expect(screen.getByTestId('spot-cell-a1:none')).toHaveAttribute(
      'aria-label',
      'Kitchen, No orientation: 1 photo, latest September 11, 2026',
    );
  });

  it('shows the short date with year in the cell', () => {
    renderTable();
    expect(
      within(screen.getByTestId('spot-cell-a1:o1')).getByText('Sep 11, 2026'),
    ).toBeInTheDocument();
  });

  it('renders empty cells as non-links with context for screen readers', () => {
    renderTable();
    const empty = screen.getByTestId('spot-cell-a1:o2');
    expect(empty.tagName).toBe('DIV');
    expect(empty).toHaveTextContent('Kitchen, Floor: No photos');
    expect(within(empty).queryByRole('link')).not.toBeInTheDocument();
  });

  it('uses "No area" in the empty-cell context for the null-area row', () => {
    renderTable([makeArea('a1', 'Kitchen')], [makeSpot(null, 'o1')]);
    expect(screen.getByTestId('spot-cell-none:o2')).toHaveTextContent('No area, Floor: No photos');
  });

  it('shows the colour dot only when the area has a colour', () => {
    const { container, unmount } = renderTable([makeArea('a1', 'Kitchen', { color: '#123456' })]);
    expect(container.querySelector('span[style*="--area-color"]')).not.toBeNull();
    unmount();

    const second = renderTable([makeArea('a1', 'Kitchen', { color: null })]);
    expect(second.container.querySelector('span[style*="--area-color"]')).toBeNull();
  });

  it('indents nested rows through data-depth, capped at 3', () => {
    const areas = [
      makeArea('r', 'L0'),
      makeArea('c1', 'L1', { parentId: 'r' }),
      makeArea('c2', 'L2', { parentId: 'c1' }),
      makeArea('c3', 'L3', { parentId: 'c2' }),
      makeArea('c4', 'L4', { parentId: 'c3' }),
      makeArea('c5', 'L5', { parentId: 'c4' }),
    ];
    const { container } = renderTable(areas, []);
    const depths = [...container.querySelectorAll('th[scope="row"]')].map((th) =>
      th.getAttribute('data-depth'),
    );
    expect(depths).toEqual(['0', '1', '2', '3', '3']);
  });

  it('passes linkState to router links as the origin of the viewer', () => {
    renderTable(undefined, undefined, { origin: { to: '/photos?x=1' } });
    fireEvent.click(screen.getByTestId('spot-cell-a1:o1'));
    expect(probedPath()).toBe('/photos/spot/a1/o1');
    // Mutation: dropping state={linkState} from the cell link makes the origin null.
    expect(probedOrigin()).toEqual({ to: '/photos?x=1' });
  });

  it('carries no origin when no linkState is given', () => {
    renderTable();
    fireEvent.click(screen.getByTestId('spot-cell-a1:o1'));
    expect(probedOrigin()).toBeNull();
  });
});
