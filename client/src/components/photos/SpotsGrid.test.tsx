import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OriginState } from '../../navigation/origin.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type { SpotsGrid as SpotsGridType } from './SpotsGrid.js';
import { buildSpotGroups } from '../../lib/photoSpots.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import {
  makeArea,
  makeOrientation,
  makeSpot,
  makeLocaleContextMock,
} from '../../test/photoSpotFixtures.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let SpotsGrid: typeof SpotsGridType;

beforeAll(async () => {
  ({ SpotsGrid } = await import('./SpotsGrid.js'));
});

const orientations = [makeOrientation('o1', 'Ceiling', 1), makeOrientation('o2', 'Floor', 2)];
const areas = [
  makeArea('house', 'House'),
  makeArea('kitchen', 'Kitchen', { parentId: 'house' }),
  makeArea('bath', 'Bathroom', { parentId: 'house' }),
  makeArea('garden', 'Garden', { color: null }),
];
const spots = [
  makeSpot('kitchen', 'o1', { photoCount: 3, latestPhotoId: 'pK' }),
  makeSpot('garden', null, { photoCount: 1, latestPhotoId: 'pG' }),
  makeSpot(null, 'o2', { photoCount: 2, latestPhotoId: 'pN' }),
];

function renderGrid(linkState?: OriginState) {
  const groups = buildSpotGroups(areas, orientations, spots);
  return render(
    <MemoryRouter>
      <SpotsGrid groups={groups} linkState={linkState} />
      <OriginProbe />
    </MemoryRouter>,
  );
}

describe('SpotsGrid', () => {
  it('selects "All" by default and shows every group heading', () => {
    renderGrid();

    expect(screen.getByTestId('spot-group-chip-all')).toHaveAttribute('aria-pressed', 'true');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Kitchen', 'Bathroom', 'Garden', 'No area']);
  });

  it('renders a chip per group plus All, and a "No area" chip for the no-area group', () => {
    renderGrid();
    const group = screen.getByRole('group', { name: 'Area groups' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'House', 'Garden', 'No area']);
  });

  it('has an empty status region on mount', () => {
    renderGrid();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('filters to the selected group and announces it with the card count', () => {
    renderGrid();

    fireEvent.click(screen.getByTestId('spot-group-chip-house'));

    expect(screen.getByTestId('spot-group-chip-house')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('spot-group-chip-all')).toHaveAttribute('aria-pressed', 'false');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Kitchen', 'Bathroom']);
    // 2 rows x (2 orientations + no orientation) = 6 cards
    expect(screen.getByRole('status')).toHaveTextContent('Showing House: 6 spots');
  });

  it('announces the singular for a single-card group and the All label when resetting', () => {
    renderGrid();

    fireEvent.click(screen.getByTestId('spot-group-chip-garden'));
    expect(screen.getByRole('status')).toHaveTextContent(/^Showing Garden: 3 spots$/);

    fireEvent.click(screen.getByTestId('spot-group-chip-all'));
    // 2 + 1 + 1 rows... = Kitchen, Bathroom, Garden, No area = 4 rows x 3 cards
    expect(screen.getByRole('status')).toHaveTextContent('Showing All: 12 spots');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4);
  });

  it('names the no-area group chip and announcement "No area"', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('spot-group-chip-none'));
    expect(screen.getByRole('status')).toHaveTextContent('Showing No area: 3 spots');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'No area',
    ]);
  });

  it('links populated cards to the viewer with ?photo= and an accessible label', () => {
    renderGrid();
    const card = screen.getByTestId('spot-card-kitchen:o1');
    expect(card).toHaveAttribute('href', '/photos/spot/kitchen/o1?photo=pK');
    expect(card).toHaveAttribute(
      'aria-label',
      'Kitchen, Ceiling: 3 photos, latest September 11, 2026',
    );
    expect(within(card).getByText('Ceiling')).toBeInTheDocument();
    expect(within(card).getByText('Sep 11, 2026')).toBeInTheDocument();
  });

  it('renders the null-orientation card as "No orientation" and the no-area card with "No area"', () => {
    renderGrid();
    expect(screen.getByTestId('spot-card-garden:none')).toHaveAttribute(
      'aria-label',
      'Garden, No orientation: 1 photo, latest September 11, 2026',
    );
    expect(screen.getByTestId('spot-card-none:o2')).toHaveAttribute(
      'aria-label',
      'No area, Floor: 2 photos, latest September 11, 2026',
    );
  });

  it('renders empty cards as non-links with context for screen readers', () => {
    renderGrid();
    const empty = screen.getByTestId('spot-card-kitchen:o2');
    expect(empty.tagName).toBe('DIV');
    expect(empty).toHaveTextContent('Kitchen, Floor: No photos');
    expect(within(empty).queryByRole('link')).not.toBeInTheDocument();
  });

  it('has no hardcoded compass orientation names', () => {
    renderGrid();
    expect(screen.queryByText('North')).not.toBeInTheDocument();
  });

  it('shows the colour dot only for coloured areas', () => {
    const { container } = renderGrid();
    // Kitchen, Bathroom, No area (none) -> coloured: kitchen + bath (2); garden/no-area have none
    expect(container.querySelectorAll('span[style*="--area-color"]')).toHaveLength(2);
  });

  it('emits no duplicate data-testid values', () => {
    const { container } = renderGrid();
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  it('announces a group made of a single childless root', () => {
    const groups = buildSpotGroups([makeArea('solo', 'Solo')], orientations, []);
    render(
      <MemoryRouter>
        <SpotsGrid groups={groups} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('spot-group-chip-solo'));
    expect(screen.getByRole('status')).toHaveTextContent('Showing Solo: 3 spots');
  });

  it('passes linkState to the viewer link as its origin', () => {
    renderGrid({ origin: { to: '/photos?group=g1' } });
    fireEvent.click(screen.getByTestId('spot-card-kitchen:o1'));
    expect(probedPath()).toBe('/photos/spot/kitchen/o1');
    // Mutation: dropping state={linkState} from the card link makes the origin null.
    expect(probedOrigin()).toEqual({ to: '/photos?group=g1' });
  });

  it('carries no origin when no linkState is given', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('spot-card-kitchen:o1'));
    expect(probedOrigin()).toBeNull();
  });
});
