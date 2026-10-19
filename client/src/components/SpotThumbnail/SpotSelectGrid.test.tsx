import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpotSelectGrid } from './SpotSelectGrid.js';
import type { SpotSelectGridItem, SpotSelectGridProps } from './SpotSelectGrid.js';

const ITEMS: SpotSelectGridItem[] = [
  { id: 'p3', thumbnailUrl: '/t/p3.jpg', label: 'Photo from September 20, Ceiling', locked: false },
  { id: 'p2', thumbnailUrl: '/t/p2.jpg', label: 'Photo from September 11, Floor', locked: true },
  {
    id: 'p1',
    thumbnailUrl: '/t/p1.jpg',
    label: 'Photo from September 1, No orientation',
    locked: false,
  },
];

function setup(props: Partial<SpotSelectGridProps> = {}) {
  const onToggle = jest.fn();
  const utils = render(
    <MemoryRouter>
      <SpotSelectGrid
        items={ITEMS}
        selectedIds={new Set<string>()}
        onToggle={onToggle}
        groupLabel="Photos with no area"
        lockedLabel="Signed entry"
        imageUnavailableLabel="Image unavailable"
        testIdPrefix="no-area-photo"
        {...props}
      />
    </MemoryRouter>,
  );
  return { onToggle, ...utils };
}

describe('SpotSelectGrid', () => {
  it('is a labelled group holding one list item per photo, in the given order', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Photos with no area' });
    const tiles = within(group).getAllByTestId(/^no-area-photo-/);
    expect(tiles.map((t) => t.getAttribute('data-testid'))).toEqual([
      'no-area-photo-p3',
      'no-area-photo-p2',
      'no-area-photo-p1',
    ]);
    expect(within(group).getAllByRole('listitem')).toHaveLength(3);
  });

  it('gives each unlocked tile a checkbox named by its label and none to locked ones', () => {
    setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(
      screen.getByRole('checkbox', { name: 'Photo from September 20, Ceiling' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /September 11/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('no-area-photo-p2')).toHaveTextContent('Signed entry');
  });

  it('reflects the selected ids', () => {
    setup({ selectedIds: new Set(['p1']) });
    expect(screen.getByRole('checkbox', { name: /September 1,/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /September 20/ })).not.toBeChecked();
  });

  it('reports the id of the toggled photo', () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: /September 20/ }));
    expect(onToggle).toHaveBeenCalledWith('p3');
    fireEvent.click(screen.getByRole('checkbox', { name: /September 1,/ }));
    expect(onToggle).toHaveBeenLastCalledWith('p1');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('does not toggle a locked tile when it is clicked', () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByTestId('no-area-photo-p2'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders an empty group for no items', () => {
    setup({ items: [] });
    expect(screen.getByRole('group', { name: 'Photos with no area' })).toBeEmptyDOMElement();
  });
});
