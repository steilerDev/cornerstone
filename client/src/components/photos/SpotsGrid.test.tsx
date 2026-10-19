import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OriginState } from '../../navigation/origin.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type { SpotsGrid as SpotsGridType } from './SpotsGrid.js';
import type { NoAreaSelectProps } from './SpotsTable.js';
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

describe('SpotsGrid area links and the No area section (#2226)', () => {
  function renderWith(noArea?: NoAreaSelectProps, linkState?: OriginState) {
    const groups = buildSpotGroups(areas, orientations, spots);
    return render(
      <MemoryRouter initialEntries={['/photos']}>
        <SpotsGrid groups={groups} linkState={linkState} noArea={noArea} />
        <OriginProbe />
      </MemoryRouter>,
    );
  }

  function selectProps(overrides: Partial<NoAreaSelectProps> = {}): NoAreaSelectProps {
    return {
      selecting: false,
      onToggleSelect: jest.fn(),
      toggleRef: createRef<HTMLButtonElement>(),
      selectContent: <div data-testid="select-content">tiles</div>,
      ...overrides,
    };
  }

  it('makes each area heading an AreaLink to the Areas index with the origin', () => {
    renderWith();
    const link = screen.getByTestId('area-link-kitchen');
    expect(link).toHaveAttribute('href', '/areas');
    expect(link.closest('h2')).not.toBeNull();
    fireEvent.click(link);
    expect(probedPath()).toBe('/areas');
    expect(probedOrigin()?.to).toBe('/photos');
  });

  it('renders the No area heading as plain text with a muted photo count beside it', () => {
    renderWith();
    const heading = screen.getByRole('heading', { level: 2, name: 'No area' });
    expect(within(heading).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('2 photos')).toBeInTheDocument();
    expect(heading.className).not.toMatch(/muted/i);
  });

  it('uses the singular count for one photo', () => {
    const groups = buildSpotGroups(areas, orientations, [
      makeSpot(null, 'o1', { photoCount: 1, latestPhotoId: 'pOnly' }),
    ]);
    render(
      <MemoryRouter>
        <SpotsGrid groups={groups} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('links the No area card to the group viewer at its latest photo (D-31)', () => {
    renderWith();
    expect(screen.getByTestId('spot-card-none:o2')).toHaveAttribute(
      'href',
      '/photos/spot/none/none?photo=pN',
    );
  });

  it('shows no Select photos toggle without the noArea slot and no count outside the group', () => {
    renderWith();
    expect(screen.queryByTestId('no-area-select-toggle')).not.toBeInTheDocument();
    expect(screen.getAllByText(/\d+ photos?$/)).toHaveLength(1);
  });

  it('with the slot, the heading row ends in a Select photos text button wired to the host', () => {
    const props = selectProps();
    renderWith(props);
    const toggle = screen.getByTestId('no-area-select-toggle');
    expect(toggle).toHaveTextContent('Select photos');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(props.toggleRef.current).toBe(toggle);
    expect(toggle.closest('section')).toContainElement(
      screen.getByRole('heading', { level: 2, name: 'No area' }),
    );

    fireEvent.click(toggle);
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('select-content')).not.toBeInTheDocument();
  });

  it('while selecting, Done replaces the label and the select content replaces the cards', () => {
    renderWith(selectProps({ selecting: true }));
    expect(screen.getByTestId('no-area-select-toggle')).toHaveTextContent('Done');
    expect(screen.getByTestId('select-content')).toBeInTheDocument();
    expect(screen.queryByTestId('spot-card-none:o2')).not.toBeInTheDocument();
    // other groups keep their cards
    expect(screen.getByTestId('spot-card-kitchen:o1')).toBeInTheDocument();
  });

  it('the No area section survives filtering to its chip', () => {
    renderWith(selectProps());
    fireEvent.click(screen.getByTestId('spot-group-chip-none'));
    expect(screen.getByTestId('no-area-select-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('spot-card-kitchen:o1')).not.toBeInTheDocument();
  });

  it('carries the origin on a No area card link', () => {
    renderWith(undefined, { origin: { to: '/photos' } });
    fireEvent.click(screen.getByTestId('spot-card-none:o2'));
    expect(probedPath()).toBe('/photos/spot/none/none');
    expect(probedOrigin()).toEqual({ to: '/photos' });
  });
});
