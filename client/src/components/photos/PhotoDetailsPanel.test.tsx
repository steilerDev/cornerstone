import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { createRef } from 'react';
import type { RefObject } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  AreaResponse,
  AreaSummary,
  Photo,
  UndoToken,
  UpdatePhotoRequest,
  UpdatePhotoResponse,
} from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeArea, makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import type {
  PhotoDetailsPanel as PanelType,
  PhotoDetailsPanelPhoto,
  PhotoDetailsPanelProps,
} from './PhotoDetailsPanel.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

const UNDO: UndoToken = { token: 'tok-1', expiresAt: '2026-09-11T10:00:30.000Z' };

const mockUpdatePhotoDetails =
  jest.fn<(id: string, data: UpdatePhotoRequest) => Promise<UpdatePhotoResponse>>();
jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  updatePhotoDetails: mockUpdatePhotoDetails,
}));

const areasState: { areas: AreaResponse[]; isLoading: boolean } = { areas: [], isLoading: false };
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ ...areasState }),
}));

// Pickers: expose value / nullable and let tests change the value.
jest.unstable_mockModule('../AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: {
    id?: string;
    value: string;
    nullable?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    onChange: (id: string) => void;
  }) => (
    <div
      data-testid="area-picker"
      data-value={props.value}
      data-nullable={String(props.nullable)}
      data-autofocus={String(Boolean(props.autoFocus))}
    >
      {props.value !== '' ? (
        <button type="button" data-testid="area-chip-clear" aria-label="Clear Area">
          chip
        </button>
      ) : null}
      <input
        id={props.id}
        aria-label="area input"
        disabled={props.disabled}
        readOnly
        onKeyDown={(e) => {
          // an open picker consumes Escape (closes its list)
          if (e.key === 'Escape' && e.currentTarget.dataset.open === 'true') e.preventDefault();
        }}
        data-testid="area-input"
      />
      <button type="button" onClick={() => props.onChange('area-2')}>
        pick area
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear area
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../OrientationPicker/OrientationPicker.js', () => ({
  OrientationPicker: (props: {
    id?: string;
    value: string;
    initialOrientationName?: string;
    nullable?: boolean;
    disabled?: boolean;
    onChange: (id: string) => void;
  }) => (
    <div
      data-testid="orientation-picker"
      data-value={props.value}
      data-name={props.initialOrientationName ?? ''}
    >
      <button type="button" onClick={() => props.onChange('ori-2')}>
        pick orientation
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear orientation
      </button>
    </div>
  ),
}));

let PhotoDetailsPanel: typeof PanelType;

beforeAll(async () => {
  ({ PhotoDetailsPanel } = await import('./PhotoDetailsPanel.js'));
});

const AREAS: AreaResponse[] = [
  makeArea('house', 'House', { color: null }),
  makeArea('kitchen', 'Kitchen', { parentId: 'house', color: '#336699' }),
  makeArea('area-2', 'Garage', { color: '#00aa00' }),
];

const PHOTO: PhotoDetailsPanelPhoto = {
  id: 'p1',
  caption: 'Fresh plaster',
  areaId: 'kitchen',
  orientationId: 'o1',
  orientation: { id: 'o1', name: 'Ceiling', description: null },
};

function serverPhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'p1',
    entityType: 'diary_entry',
    entityId: 'e1',
    originalFilename: 'a.jpg',
    mimeType: 'image/jpeg',
    fileSize: 100,
    width: 800,
    height: 600,
    takenAt: null,
    caption: 'Fresh plaster',
    areaId: 'kitchen',
    orientationId: 'o1',
    orientation: { id: 'o1', name: 'Ceiling', description: null },
    sortOrder: 0,
    createdBy: null,
    annotatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    fileUrl: '/api/photos/p1/file',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    ...overrides,
  };
}

function setup(overrides: Partial<PhotoDetailsPanelProps> = {}) {
  const props: PhotoDetailsPanelProps = {
    photo: PHOTO,
    diaryDate: '2026-09-11',
    onSaved: jest.fn(),
    onEditingChange: jest.fn(),
    ...overrides,
  };
  const view = render(
    <MemoryRouter initialEntries={['/photos/spot/kitchen/o1']}>
      <PhotoDetailsPanel {...props} />
      <OriginProbe />
    </MemoryRouter>,
  );
  const rerenderWith = (next: Partial<PhotoDetailsPanelProps>) =>
    view.rerender(
      <MemoryRouter initialEntries={['/photos/spot/kitchen/o1']}>
        <PhotoDetailsPanel {...props} {...next} />
        <OriginProbe />
      </MemoryRouter>,
    );
  return { props, rerenderWith, ...view };
}

const editButton = () => screen.getByTestId('photo-details-edit-tags');

async function openEditor() {
  const user = userEvent.setup();
  await user.click(editButton());
  return user;
}

beforeEach(() => {
  mockUpdatePhotoDetails.mockReset();
  areasState.areas = AREAS;
  areasState.isLoading = false;
});

describe('PhotoDetailsPanel read mode', () => {
  it('is a labelled aside with the details heading', () => {
    setup();
    expect(screen.getByRole('complementary', { name: 'Photo details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Photo details' })).toBeInTheDocument();
  });

  it('shows the diary date in long form', () => {
    setup();
    expect(screen.getByText('Diary date')).toBeInTheDocument();
    expect(screen.getByTestId('photo-details-date')).toHaveTextContent('September 11, 2026');
  });

  it('omits the diary date row when there is no date', () => {
    setup({ diaryDate: null });
    expect(screen.queryByText('Diary date')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photo-details-date')).not.toBeInTheDocument();
  });

  it('shows the area path as an AreaLink on the photo surface with its colour dot', () => {
    const { container } = setup();
    const link = screen.getByTestId('area-link-kitchen');
    expect(link).toHaveTextContent('House › Kitchen');
    expect(link.className).toMatch(/onPhoto/);
    expect(container.querySelector('span[style*="--area-color"]')).not.toBeNull();
  });

  it('opens the Areas index with this page as origin when the area link is used', () => {
    setup();
    fireEvent.click(screen.getByTestId('area-link-kitchen'));
    expect(probedPath()).toBe('/areas');
    expect(probedOrigin()?.to).toBe('/photos/spot/kitchen/o1');
  });

  it('omits the dot for an area without colour', () => {
    const { container } = setup({ photo: { ...PHOTO, areaId: 'house' } });
    expect(screen.getByTestId('area-link-house')).toHaveTextContent('House');
    expect(container.querySelector('span[style*="--area-color"]')).toBeNull();
  });

  it('shows a muted "No area" for a photo without an area', () => {
    setup({ photo: { ...PHOTO, areaId: null } });
    expect(screen.getByTestId('photo-details-area')).toHaveTextContent('No area');
    expect(screen.queryByTestId('area-link-kitchen')).not.toBeInTheDocument();
  });

  it('shows "No area" when the area id is unknown to the loaded list and no hint matches', () => {
    setup({ photo: { ...PHOTO, areaId: 'ghost' } });
    expect(screen.getByTestId('photo-details-area')).toHaveTextContent('No area');
  });

  it('shows a skeleton while the area list loads and no hint is available', () => {
    areasState.areas = [];
    areasState.isLoading = true;
    const { container } = setup();
    expect(screen.queryByTestId('area-link-kitchen')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('photo-details-area').querySelector('[class*="skeleton" i]'),
    ).not.toBeNull();
    expect(container).toBeInTheDocument();
  });

  it('uses the area hint (path and colour) while the list loads', () => {
    areasState.areas = [];
    areasState.isLoading = true;
    const hint: AreaSummary = {
      id: 'kitchen',
      name: 'Kitchen',
      color: '#112233',
      ancestors: [{ id: 'house', name: 'House', color: null }],
    };
    const { container } = setup({ area: hint });
    expect(screen.getByTestId('area-link-kitchen')).toHaveTextContent('House › Kitchen');
    expect(container.querySelector('span[style*="--area-color"]')).not.toBeNull();
  });

  it('ignores a hint for a different area', () => {
    areasState.areas = [];
    areasState.isLoading = true;
    const hint: AreaSummary = { id: 'other', name: 'Other', color: null, ancestors: [] };
    setup({ area: hint });
    expect(screen.queryByTestId('area-link-kitchen')).not.toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('falls back to the hint after loading when the list lacks the area', () => {
    areasState.areas = [];
    areasState.isLoading = false;
    const hint: AreaSummary = { id: 'kitchen', name: 'Kitchen', color: null, ancestors: [] };
    setup({ area: hint });
    expect(screen.getByTestId('area-link-kitchen')).toHaveTextContent('Kitchen');
  });

  it('shows the orientation name, or a muted "No orientation"', () => {
    const { unmount } = setup();
    expect(screen.getByTestId('photo-details-orientation')).toHaveTextContent('Ceiling');
    unmount();

    setup({ photo: { ...PHOTO, orientationId: null, orientation: null } });
    expect(screen.getByTestId('photo-details-orientation')).toHaveTextContent('No orientation');
  });

  it('shows the caption, or a muted "No caption" for none and for blank text', () => {
    const first = setup();
    expect(screen.getByTestId('photo-details-caption-value')).toHaveTextContent('Fresh plaster');
    first.unmount();

    const second = setup({ photo: { ...PHOTO, caption: null } });
    expect(screen.getByTestId('photo-details-caption-value')).toHaveTextContent('No caption');
    second.unmount();

    setup({ photo: { ...PHOTO, caption: '   ' } });
    expect(screen.getByTestId('photo-details-caption-value')).toHaveTextContent('No caption');
  });

  it('uses a custom testIdPrefix for the panel, its facts and the controls', () => {
    setup({ testIdPrefix: 'spot-viewer-details-panel' });
    expect(screen.getByTestId('spot-viewer-details-panel')).toBeInTheDocument();
    expect(screen.getByTestId('spot-viewer-details-panel-date')).toBeInTheDocument();
    expect(screen.getByTestId('spot-viewer-details-panel-edit-tags')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-details')).not.toBeInTheDocument();
  });

  it('renders the history slot children after the cards', () => {
    setup({ children: <h2>Same spot over time</h2> });
    expect(screen.getByRole('heading', { name: 'Same spot over time' })).toBeInTheDocument();
  });
});

describe('PhotoDetailsPanel diary entry card', () => {
  const ENTRY = {
    id: 'e0',
    entryType: 'daily_log' as const,
    title: 'Plastering',
    entryDate: '2026-09-20',
  };

  it('is absent when no entry is given (entry page)', () => {
    setup();
    expect(screen.queryByText('From diary entry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spot-viewer-diary-link')).not.toBeInTheDocument();
  });

  it('shows type badge, title, long date and an Open diary entry link', () => {
    setup({ entry: ENTRY });
    expect(screen.getByRole('heading', { level: 2, name: 'From diary entry' })).toBeInTheDocument();
    expect(screen.getByTestId('diary-type-badge-daily_log')).toHaveTextContent('Daily log');
    expect(screen.getByText('Plastering')).toBeInTheDocument();
    expect(screen.getByText('September 20, 2026')).toBeInTheDocument();
    const link = screen.getByTestId('spot-viewer-diary-link');
    expect(link).toHaveAttribute('href', '/diary/e0');
    expect(link).toHaveTextContent('Open diary entry');
  });

  it('shows "Untitled entry" for a null or blank title', () => {
    const first = setup({ entry: { ...ENTRY, title: null } });
    expect(screen.getByText('Untitled entry')).toBeInTheDocument();
    first.unmount();

    setup({ entry: { ...ENTRY, title: '   ' } });
    expect(screen.getByText('Untitled entry')).toBeInTheDocument();
  });

  it('passes entryLinkState as origin and carries none without it', () => {
    const first = setup({
      entry: ENTRY,
      entryLinkState: { origin: { to: '/photos/spot/kitchen/o1', name: 'Kitchen · Ceiling' } },
    });
    fireEvent.click(screen.getByTestId('spot-viewer-diary-link'));
    expect(probedPath()).toBe('/diary/e0');
    expect(probedOrigin()).toEqual({ to: '/photos/spot/kitchen/o1', name: 'Kitchen · Ceiling' });
    first.unmount();

    setup({ entry: ENTRY });
    fireEvent.click(screen.getByTestId('spot-viewer-diary-link'));
    expect(probedOrigin()).toBeNull();
  });
});

describe('PhotoDetailsPanel locked (signed entry)', () => {
  it('marks Edit tags aria-disabled with a visible reason', () => {
    setup({ locked: true });
    const button = editButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    const reason = screen.getByText("Signed entries can't be changed");
    expect(button).toHaveAttribute('aria-describedby', reason.id);
  });

  it('does not open the editor when clicked', async () => {
    const { props } = setup({ locked: true });
    const user = userEvent.setup();
    await user.click(editButton());
    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
    expect(props.onEditingChange).not.toHaveBeenCalledWith(true);
  });

  it('an unlocked panel has no aria-disabled, no describedby and no reason', () => {
    setup();
    expect(editButton()).not.toHaveAttribute('aria-disabled');
    expect(editButton()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText("Signed entries can't be changed")).not.toBeInTheDocument();
  });
});

describe('PhotoDetailsPanel editor', () => {
  it('opens the editor with the current values and hides the Edit tags button', async () => {
    const { props } = setup();
    await openEditor();

    expect(screen.getByTestId('photo-details-form')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-details-edit-tags')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', 'kitchen');
    expect(screen.getByTestId('area-picker')).toHaveAttribute('data-nullable', 'true');
    expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', 'o1');
    expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-name', 'Ceiling');
    expect(screen.getByLabelText('Caption')).toHaveValue('Fresh plaster');
    expect(screen.getByRole('button', { name: 'Save tags' })).toBeInTheDocument();
    expect(props.onEditingChange).toHaveBeenLastCalledWith(true);
  });

  it('asks the Area picker to take focus when the editor opens (the picker owns the focus move)', async () => {
    setup();
    expect(screen.queryByTestId('area-picker')).not.toBeInTheDocument();
    await openEditor();
    expect(screen.getByTestId('area-picker')).toHaveAttribute('data-autofocus', 'true');
  });

  it('also asks for focus when no area is set yet', async () => {
    setup({ photo: { ...PHOTO, areaId: null } });
    await openEditor();
    expect(screen.getByTestId('area-picker')).toHaveAttribute('data-autofocus', 'true');
  });

  it('does not throw when the panel unmounts while the editor is open', async () => {
    const { unmount } = setup();
    const user = userEvent.setup();
    await user.click(editButton());
    expect(() => unmount()).not.toThrow();
  });

  it('opens with empty values for a photo with no tags and no caption', async () => {
    setup({
      photo: { ...PHOTO, areaId: null, orientationId: null, orientation: null, caption: null },
    });
    await openEditor();
    expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', '');
    expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', '');
    expect(screen.getByLabelText('Caption')).toHaveValue('');
  });

  it('labels the Area and Orientation fields', async () => {
    setup();
    await openEditor();
    expect(screen.getByLabelText('Area')).toBe(screen.getByTestId('area-input'));
    expect(screen.getAllByText('Orientation').length).toBeGreaterThan(0);
  });

  it('Cancel leaves the editor without a request, discards edits and refocuses Edit tags', async () => {
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'Something else');

    await user.click(screen.getByTestId('photo-details-cancel'));

    expect(mockUpdatePhotoDetails).not.toHaveBeenCalled();
    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
    expect(props.onEditingChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(editButton()).toHaveFocus());
    expect(screen.getByTestId('photo-details-caption-value')).toHaveTextContent('Fresh plaster');

    // reopening starts from the stored values again
    await user.click(editButton());
    expect(screen.getByLabelText('Caption')).toHaveValue('Fresh plaster');
  });

  it('Escape in the form cancels the editor and stops the event', async () => {
    setup();
    const user = await openEditor();
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    try {
      await user.type(screen.getByLabelText('Caption'), '{Escape}');
    } finally {
      document.removeEventListener('keydown', outer);
    }
    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
    await waitFor(() => expect(editButton()).toHaveFocus());
    expect(outer).not.toHaveBeenCalled();
  });

  it('Escape consumed by an open picker does not cancel the editor', async () => {
    setup();
    await openEditor();
    const input = screen.getByTestId('area-input');
    input.dataset.open = 'true';
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('photo-details-form')).toBeInTheDocument();
  });

  it('other keys do not cancel', async () => {
    setup();
    await openEditor();
    fireEvent.keyDown(screen.getByLabelText('Caption'), { key: 'a' });
    expect(screen.getByTestId('photo-details-form')).toBeInTheDocument();
  });

  it('does not steal focus back to Edit tags when focus sits outside the panel', async () => {
    setup();
    await openEditor();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      // A bare click keeps focus where it is: the effect runs with the active element outside.
      fireEvent.click(screen.getByTestId('photo-details-cancel'));
      await waitFor(() => expect(screen.queryByTestId('photo-details-form')).toBeNull());
      expect(outside).toHaveFocus();
    } finally {
      outside.remove();
    }
  });

  it('uses the supplied editTagsButtonRef for the button and the focus return', async () => {
    const ref = createRef<HTMLButtonElement>() as RefObject<HTMLButtonElement | null>;
    setup({ editTagsButtonRef: ref });
    expect(ref.current).toBe(editButton());
    const user = await openEditor();
    await user.click(screen.getByTestId('photo-details-cancel'));
    await waitFor(() => expect(ref.current).toHaveFocus());
  });
});

describe('PhotoDetailsPanel saving', () => {
  it('with nothing changed it just leaves the editor, with no request and no onSaved', async () => {
    const { props } = setup();
    const user = await openEditor();
    await user.click(screen.getByTestId('photo-details-save-tags'));

    expect(mockUpdatePhotoDetails).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
    await waitFor(() => expect(editButton()).toHaveFocus());
    await waitFor(() => expect(editButton()).toHaveFocus());
    expect(screen.getByTestId('photo-details-saved')).toBeEmptyDOMElement();
  });

  it('a whitespace-only edit of an unchanged caption counts as no change', async () => {
    setup();
    const user = await openEditor();
    await user.type(screen.getByLabelText('Caption'), '   ');
    await user.click(screen.getByTestId('photo-details-save-tags'));
    expect(mockUpdatePhotoDetails).not.toHaveBeenCalled();
  });

  it('caption only: sends just the caption, reports tagsChanged false and no undo', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({ photo: serverPhoto({ caption: 'New words' }) });
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), '  New words  ');
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { caption: 'New words' });
    expect(props.onSaved).toHaveBeenCalledWith({
      photo: expect.objectContaining({ caption: 'New words' }),
      undo: null,
      tagsChanged: false,
      spotLabel: 'House › Kitchen · Ceiling',
    });
  });

  it('clearing the caption sends null', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({ photo: serverPhoto({ caption: null }) });
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { caption: null });
  });

  it('clearing a caption that was already empty sends nothing', async () => {
    setup({ photo: { ...PHOTO, caption: null } });
    const user = await openEditor();
    await user.click(screen.getByTestId('photo-details-save-tags'));
    expect(mockUpdatePhotoDetails).not.toHaveBeenCalled();
  });

  it('area change: sends only areaId, passes the undo token and the new spot label', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: serverPhoto({ areaId: 'area-2' }),
      undo: UNDO,
    });
    const { props } = setup();
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'pick area' }));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { areaId: 'area-2' });
    expect(props.onSaved).toHaveBeenCalledWith({
      photo: expect.objectContaining({ areaId: 'area-2' }),
      undo: UNDO,
      tagsChanged: true,
      spotLabel: 'Garage · Ceiling',
    });
  });

  it('clearing the area sends null and labels the spot "No area"', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: serverPhoto({ areaId: null }),
      undo: UNDO,
    });
    const { props } = setup();
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'clear area' }));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { areaId: null });
    expect(props.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ spotLabel: 'No area · Ceiling', tagsChanged: true }),
    );
  });

  it('labels an area missing from the list as "No area" in the spot label', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: serverPhoto({ areaId: 'brand-new' }),
      undo: UNDO,
    });
    const { props } = setup();
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'pick area' }));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(props.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ spotLabel: 'No area · Ceiling' }),
    );
  });

  it('orientation change: sends only orientationId; clearing sends null and labels "No orientation"', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: serverPhoto({ orientationId: null, orientation: null }),
      undo: UNDO,
    });
    const { props } = setup();
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'clear orientation' }));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { orientationId: null });
    expect(props.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ spotLabel: 'House › Kitchen · No orientation' }),
    );
  });

  it('a picked orientation is sent by id', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: serverPhoto({
        orientationId: 'ori-2',
        orientation: { id: 'ori-2', name: 'Floor', description: null },
      }),
      undo: UNDO,
    });
    const { props } = setup();
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'pick orientation' }));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { orientationId: 'ori-2' });
    expect(props.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ spotLabel: 'House › Kitchen · Floor' }),
    );
  });

  it('tags a photo that has none: area and orientation are sent by id', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: serverPhoto({ areaId: 'area-2', orientationId: 'ori-2' }),
      undo: UNDO,
    });
    setup({
      photo: { ...PHOTO, areaId: null, orientationId: null, orientation: null },
    });
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'pick area' }));
    await user.click(screen.getByRole('button', { name: 'pick orientation' }));
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(mockUpdatePhotoDetails).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', {
      areaId: 'area-2',
      orientationId: 'ori-2',
    });
  });

  it('sends all three fields when all changed', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({ photo: serverPhoto(), undo: UNDO });
    setup();
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'pick area' }));
    await user.click(screen.getByRole('button', { name: 'pick orientation' }));
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'x');
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(mockUpdatePhotoDetails).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', {
      caption: 'x',
      areaId: 'area-2',
      orientationId: 'ori-2',
    });
  });

  it('after a save: read mode, a "Tags saved" status, focus on Edit tags, editing false', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({ photo: serverPhoto({ caption: 'N' }) });
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'N');
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Tags saved');
    expect(status).not.toHaveAttribute('aria-live');
    expect(status).not.toHaveAttribute('aria-atomic');
    await waitFor(() => expect(editButton()).toHaveFocus());
    expect(props.onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('clears the "Tags saved" note when the editor is opened again', async () => {
    mockUpdatePhotoDetails.mockResolvedValue({ photo: serverPhoto({ caption: 'N' }) });
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'N');
    await user.click(screen.getByTestId('photo-details-save-tags'));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());

    await user.click(editButton());
    expect(screen.getByTestId('photo-details-saved')).toBeEmptyDOMElement();
  });

  it('while saving: Save shows "Saving...", controls are disabled and Escape and a second submit do nothing', async () => {
    let resolve!: (value: UpdatePhotoResponse) => void;
    mockUpdatePhotoDetails.mockReturnValue(
      new Promise<UpdatePhotoResponse>((r) => {
        resolve = r;
      }),
    );
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'N');
    await user.click(screen.getByTestId('photo-details-save-tags'));

    const save = screen.getByTestId('photo-details-save-tags');
    expect(save).toHaveTextContent('Saving…');
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('photo-details-cancel')).toBeDisabled();
    expect(screen.getByLabelText('Caption')).toBeDisabled();

    fireEvent.keyDown(screen.getByTestId('area-input'), { key: 'Escape' });
    expect(screen.getByTestId('photo-details-form')).toBeInTheDocument();
    fireEvent.submit(screen.getByTestId('photo-details-form'));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ photo: serverPhoto({ caption: 'N' }) });
    });
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
  });
});

describe('PhotoDetailsPanel save errors', () => {
  async function failWith(error: unknown) {
    mockUpdatePhotoDetails.mockRejectedValue(error);
    const view = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'Kept text');
    await user.click(screen.getByTestId('photo-details-save-tags'));
    await screen.findByRole('alert');
    return { ...view, user };
  }

  it('translates an API error code and keeps the editor and the typed values', async () => {
    const { props } = await failWith(
      new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'locked' }),
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('IMMUTABLE_ENTRY');
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect(screen.getByTestId('photo-details-form')).toBeInTheDocument();
    expect(screen.getByLabelText('Caption')).toHaveValue('Kept text');
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId('photo-details-save-tags')).toBeEnabled();
    expect(screen.getByTestId('photo-details-save-tags')).toHaveTextContent('Save tags');
  });

  it('shows the network message for a NetworkError', async () => {
    await failWith(new NetworkError('offline', null));
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server");
  });

  it('shows the generic message for any other error', async () => {
    await failWith(new Error('boom'));
    expect(screen.getByRole('alert')).toHaveTextContent('The tags could not be saved.');
  });

  it('clears the error when the editor is cancelled', async () => {
    const { user } = await failWith(new Error('boom'));
    await user.click(screen.getByTestId('photo-details-cancel'));
    await user.click(editButton());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('succeeds on a retry after an error', async () => {
    mockUpdatePhotoDetails.mockRejectedValueOnce(new Error('boom'));
    mockUpdatePhotoDetails.mockResolvedValueOnce({ photo: serverPhoto({ caption: 'N' }) });
    const { props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'N');
    await user.click(screen.getByTestId('photo-details-save-tags'));
    await screen.findByRole('alert');
    await user.click(screen.getByTestId('photo-details-save-tags'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PhotoDetailsPanel photo changes and editing notifications', () => {
  it('leaves the editor and forgets the saved note and error when another photo is shown', async () => {
    mockUpdatePhotoDetails.mockRejectedValue(new Error('boom'));
    const { rerenderWith, props } = setup();
    const user = await openEditor();
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'N');
    await user.click(screen.getByTestId('photo-details-save-tags'));
    await screen.findByRole('alert');

    rerenderWith({ photo: { ...PHOTO, id: 'p2', caption: 'Second' } });

    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('photo-details-caption-value')).toHaveTextContent('Second');
    expect(props.onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('a new photo starts a fresh editor with that photo values', async () => {
    const { rerenderWith } = setup();
    await openEditor();
    rerenderWith({ photo: { ...PHOTO, id: 'p2', caption: 'Second', areaId: null } });

    const user = userEvent.setup();
    await user.click(editButton());
    expect(screen.getByLabelText('Caption')).toHaveValue('Second');
    expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', '');
  });

  it('tells the host editing is over when the panel unmounts', async () => {
    const { props, unmount } = setup();
    await openEditor();
    (props.onEditingChange as jest.Mock).mockClear();
    unmount();
    expect(props.onEditingChange).toHaveBeenCalledWith(false);
  });

  it('works without an onEditingChange callback', async () => {
    setup({ onEditingChange: undefined });
    const user = await openEditor();
    await user.click(screen.getByTestId('photo-details-cancel'));
    expect(screen.queryByTestId('photo-details-form')).not.toBeInTheDocument();
  });
});
