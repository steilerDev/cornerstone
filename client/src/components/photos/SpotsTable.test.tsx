import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OriginState } from '../../navigation/origin.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type { SpotsTable as SpotsTableType, NoAreaSelectProps } from './SpotsTable.js';
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

describe('SpotsTable area links and the No area group (#2226)', () => {
  const areas = [
    makeArea('house', 'House'),
    makeArea('kitchen', 'Kitchen', { parentId: 'house' }),
    makeArea('garden', 'Garden', { color: null }),
  ];
  const spots = [
    makeSpot('kitchen', 'o1', { photoCount: 3, latestPhotoId: 'pK' }),
    makeSpot(null, 'o1', { photoCount: 2, latestPhotoId: 'pN1' }),
    makeSpot(null, 'o2', { photoCount: 4, latestPhotoId: 'pN2' }),
    makeSpot(null, null, { photoCount: 1, latestPhotoId: 'pN3' }),
  ];

  function renderNoArea(noArea?: NoAreaSelectProps, linkState?: OriginState) {
    const groups = buildSpotGroups(areas, orientations, spots);
    return render(
      <MemoryRouter initialEntries={['/photos']}>
        <SpotsTable
          groups={groups}
          orientations={orientations}
          linkState={linkState}
          noArea={noArea}
        />
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

  it('makes a row header an AreaLink to the Areas index, outside the colour dot', () => {
    renderNoArea();
    const link = screen.getByTestId('area-link-kitchen');
    expect(link).toHaveAttribute('href', '/areas');
    expect(link).toHaveAccessibleName('Kitchen, open in Areas');
    expect(link.closest('th')).toHaveAttribute('scope', 'row');
    fireEvent.click(link);
    expect(probedPath()).toBe('/areas');
    expect(probedOrigin()?.to).toBe('/photos');
  });

  it('makes the root band label an AreaLink', () => {
    const { container } = renderNoArea();
    const band = container.querySelector('th[scope="rowgroup"]')!;
    expect(within(band as HTMLElement).getByTestId('area-link-house')).toHaveAttribute(
      'href',
      '/areas',
    );
  });

  it('shows the No area band as plain text, last, without a link', () => {
    const { container } = renderNoArea();
    const bands = container.querySelectorAll('th[scope="rowgroup"]');
    const last = bands[bands.length - 1] as HTMLElement;
    expect(last).toHaveTextContent('No area');
    expect(within(last).queryByRole('link')).not.toBeInTheDocument();
    expect(last).toHaveAttribute('colspan', String(orientations.length + 2));
  });

  it('shows the photo count of the group as a plain row header', () => {
    const { container } = renderNoArea();
    const rows = container.querySelectorAll('tbody:last-of-type tr');
    const header = rows[rows.length - 1]!.querySelector('th[scope="row"]') as HTMLElement;
    expect(header).toHaveTextContent('7 photos');
    expect(within(header).queryByRole('link')).not.toBeInTheDocument();
    expect(header.querySelector('span[style*="--area-color"]')).toBeNull();
  });

  it('uses the singular for a group of one photo', () => {
    const groups = buildSpotGroups(areas, orientations, [
      makeSpot(null, 'o1', { photoCount: 1, latestPhotoId: 'pOnly' }),
    ]);
    render(
      <MemoryRouter>
        <SpotsTable groups={groups} orientations={orientations} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('links every No area cell to the group viewer at that cell latest photo (D-31)', () => {
    renderNoArea();
    expect(screen.getByTestId('spot-cell-none:o1')).toHaveAttribute(
      'href',
      '/photos/spot/none/none?photo=pN1',
    );
    expect(screen.getByTestId('spot-cell-none:o2')).toHaveAttribute(
      'href',
      '/photos/spot/none/none?photo=pN2',
    );
    expect(screen.getByTestId('spot-cell-none:none')).toHaveAttribute(
      'href',
      '/photos/spot/none/none?photo=pN3',
    );
    expect(screen.getByTestId('spot-cell-none:o1')).toHaveAttribute('id', 'spot-none:o1');
  });

  it('still links a real area cell to its own spot viewer', () => {
    renderNoArea();
    expect(screen.getByTestId('spot-cell-kitchen:o1')).toHaveAttribute(
      'href',
      '/photos/spot/kitchen/o1?photo=pK',
    );
  });

  it('carries the origin on a No area cell link', () => {
    renderNoArea(undefined, { origin: { to: '/photos' } });
    fireEvent.click(screen.getByTestId('spot-cell-none:o1'));
    expect(probedPath()).toBe('/photos/spot/none/none');
    expect(probedOrigin()).toEqual({ to: '/photos' });
  });

  it('without the noArea slot there is no Select photos toggle', () => {
    renderNoArea();
    expect(screen.queryByTestId('no-area-select-toggle')).not.toBeInTheDocument();
  });

  it('with the slot, the band ends in a text button "Select photos" wired to the host ref', () => {
    const props = selectProps();
    renderNoArea(props);
    const toggle = screen.getByTestId('no-area-select-toggle');
    expect(toggle).toHaveTextContent('Select photos');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(props.toggleRef.current).toBe(toggle);
    expect(toggle.closest('th')).toHaveAttribute('scope', 'rowgroup');

    fireEvent.click(toggle);
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it('keeps the spot row and its cells while not selecting', () => {
    renderNoArea(selectProps());
    expect(screen.queryByTestId('select-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('spot-cell-none:o1')).toBeInTheDocument();
  });

  it('while selecting, the label turns into Done and the select content replaces the spot row', () => {
    const { container } = renderNoArea(selectProps({ selecting: true }));
    expect(screen.getByTestId('no-area-select-toggle')).toHaveTextContent('Done');
    const content = screen.getByTestId('select-content');
    expect(content.closest('td')).toHaveAttribute('colspan', String(orientations.length + 2));
    expect(screen.queryByTestId('spot-cell-none:o1')).not.toBeInTheDocument();
    expect(screen.queryByText('7 photos')).not.toBeInTheDocument();
    // Other groups are untouched
    expect(screen.getByTestId('spot-cell-kitchen:o1')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody')).toHaveLength(3);
  });
});
