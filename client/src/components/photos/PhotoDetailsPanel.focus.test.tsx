/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AreaResponse } from '@cornerstone/shared';
import { makeArea, makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import type {
  PhotoDetailsPanel as PanelType,
  PhotoDetailsPanelPhoto,
} from './PhotoDetailsPanel.js';

// Real EntityPicker (area) and SearchPicker here: this file checks what the user sees when Edit tags opens.
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../lib/photoApi.js', () => ({ updatePhotoDetails: jest.fn() }));

const AREAS: AreaResponse[] = [
  makeArea('house', 'House', { color: null }),
  makeArea('kitchen', 'Kitchen', { parentId: 'house' }),
];
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: AREAS, isLoading: false }),
}));
// The orientation picker is real too; its list call is answered empty.
jest.unstable_mockModule('../../lib/orientationApi.js', () => ({
  fetchOrientations: jest.fn(() => Promise.resolve({ orientations: [] })),
}));

let PhotoDetailsPanel: typeof PanelType;

beforeAll(async () => {
  ({ PhotoDetailsPanel } = await import('./PhotoDetailsPanel.js'));
});

const PHOTO: PhotoDetailsPanelPhoto = {
  id: 'p1',
  caption: null,
  areaId: 'kitchen',
  orientationId: null,
  orientation: null,
};

function setup(photo: PhotoDetailsPanelPhoto) {
  return render(
    <MemoryRouter>
      <PhotoDetailsPanel photo={photo} diaryDate="2026-09-11" onSaved={jest.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  document.body.focus();
});

describe('PhotoDetailsPanel Edit tags focus (real Area picker)', () => {
  it('focuses the Area input with the list closed when no area is set', async () => {
    setup({ ...PHOTO, areaId: null });
    await userEvent.setup().click(screen.getByTestId('photo-details-edit-tags'));

    const input = screen.getByLabelText('Area');
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('focuses the Clear button of the shown area with the list closed', async () => {
    setup(PHOTO);
    await userEvent.setup().click(screen.getByTestId('photo-details-edit-tags'));

    const clear = await screen.findByRole('button', { name: 'Clear selection' });
    await waitFor(() => expect(clear).toHaveFocus());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('the list opens afterwards when the user presses ArrowDown in the focused input', async () => {
    setup({ ...PHOTO, areaId: null });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('photo-details-edit-tags'));
    await waitFor(() => expect(screen.getByLabelText('Area')).toHaveFocus());

    await user.keyboard('{ArrowDown}');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });
});
