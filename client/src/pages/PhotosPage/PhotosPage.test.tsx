import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PHOTO_SPOT_ANY } from '@cornerstone/shared';
import type { PhotoSpotsResponse } from '@cornerstone/shared';
import { PhotoDialogsContext } from '../../photos/photoDialogsContext.js';
import type { BulkTagResult } from '../../photos/photoDialogsContext.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type PhotosPageType from './PhotosPage.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import {
  makeArea,
  makeOrientation,
  makeSpot,
  makeSpotPhoto,
  makeLocaleContextMock,
} from '../../test/photoSpotFixtures.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockGetPhotoSpots = jest.fn() as AnyMock;
const mockGetPhotoSpotPhotos = jest.fn() as AnyMock;
const mockUndoChange = jest.fn() as AnyMock;
const mockShowUndoToast = jest.fn() as AnyMock;
const mockBulkTag = jest.fn() as AnyMock;

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  getPhotoSpots: mockGetPhotoSpots,
  getPhotoSpotPhotos: mockGetPhotoSpotPhotos,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ showUndoToast: mockShowUndoToast }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let PhotosPage: typeof PhotosPageType;

beforeAll(async () => {
  ({ default: PhotosPage } = await import('./PhotosPage.js'));
});

const DATA: PhotoSpotsResponse = {
  areas: [makeArea('a1', 'Kitchen'), makeArea('a2', 'Bath')],
  orientations: [makeOrientation('o1', 'Ceiling', 1), makeOrientation('o2', 'Floor', 2)],
  spots: [makeSpot('a1', 'o1', { photoCount: 2, latestPhotoId: 'pK' })],
};

let currentLocation: { pathname: string; search: string; state: unknown } | null = null;

function LocationProbe() {
  const loc = useLocation();
  currentLocation = { pathname: loc.pathname, search: loc.search, state: loc.state };
  return null;
}

function renderPage(entry: string | { pathname: string; state: unknown } = '/photos') {
  return render(
    <PhotoDialogsContext value={{ annotate: jest.fn() as AnyMock, bulkTag: mockBulkTag }}>
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Routes>
          <Route path="/photos" element={<PhotosPage />} />
          <Route path="/photos/spot/:a/:o" element={<OriginProbe />} />
        </Routes>
      </MemoryRouter>
    </PhotoDialogsContext>,
  );
}

const originalMatchMedia = window.matchMedia;

function mockViewport(mobile: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: mobile && query === '(max-width: 767px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('PhotosPage', () => {
  beforeEach(() => {
    mockGetPhotoSpots.mockReset();
    mockGetPhotoSpotPhotos.mockReset();
    mockUndoChange.mockReset();
    mockShowUndoToast.mockReset();
    mockBulkTag.mockReset();
    mockViewport(false);
    currentLocation = null;
    document.title = 'Before';
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('shows a loading skeleton while the request is pending', () => {
    mockGetPhotoSpots.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByLabelText('Loading photos')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the spots table by default on a wide viewport', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByTestId('spot-cell-a1:o1')).toHaveAttribute(
      'href',
      '/photos/spot/a1/o1?photo=pK',
    );
  });

  it('renders the card grid and no table on a mobile viewport', async () => {
    mockViewport(true);
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage();

    expect(await screen.findByTestId('spot-card-a1:o1')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty state and no table when there are no spots', async () => {
    mockGetPhotoSpots.mockResolvedValue({ ...DATA, spots: [] });
    renderPage();

    expect(await screen.findByText('No diary photos yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the translated error (never the server message) and retries on click', async () => {
    mockGetPhotoSpots.mockRejectedValueOnce(new Error('SQLITE_BUSY: leaked server detail'));
    mockGetPhotoSpots.mockResolvedValueOnce(DATA);
    renderPage();

    expect(await screen.findByText('Photos could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText(/SQLITE_BUSY/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(mockGetPhotoSpots).toHaveBeenCalledTimes(2);
  });

  it('shows the error state for a non-Error rejection', async () => {
    mockGetPhotoSpots.mockRejectedValueOnce('boom');
    renderPage();
    expect(await screen.findByText('Photos could not be loaded.')).toBeInTheDocument();
  });

  it('ignores an aborted request on unmount (no error state, no state update)', async () => {
    let rejectFn: (e: unknown) => void = () => {};
    mockGetPhotoSpots.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFn = reject;
      }),
    );
    const { unmount } = renderPage();
    unmount();

    const abort = new Error('aborted');
    abort.name = 'AbortError';
    rejectFn(abort);
    await Promise.resolve();

    expect(screen.queryByText('Photos could not be loaded.')).not.toBeInTheDocument();
  });

  it('passes the page URL with its filters as the origin of the viewer links', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage('/photos?x=1');
    fireEvent.click(await screen.findByTestId('spot-cell-a1:o1'));

    expect(probedPath()).toBe('/photos/spot/a1/o1');
    // Mutation: the old { fromSearch } state (or an origin without the query) fails here.
    expect(probedOrigin()).toEqual({ to: '/photos?x=1' });
  });

  it('has exactly one h1 "Photos"', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage();
    await screen.findByRole('table');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Photos');
  });

  it('restores focus to the spot returned from and clears the router state', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage({ pathname: '/photos', state: { focusSpotId: 'spot-a1:o1' } });

    await screen.findByRole('table');

    await waitFor(() => expect(document.activeElement?.id).toBe('spot-a1:o1'));
    await waitFor(() => expect(currentLocation?.state).toBeNull());
  });

  it('does nothing special when there is no focus state', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage();
    await screen.findByRole('table');
    expect(document.activeElement).toBe(document.body);
  });

  it('survives a focus target that no longer exists', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage({ pathname: '/photos', state: { focusSpotId: 'spot-gone:gone' } });
    await screen.findByRole('table');
    await waitFor(() => expect(currentLocation?.state).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('focuses the page heading when returning to an empty list with a focus target', async () => {
    mockGetPhotoSpots.mockResolvedValue({ ...DATA, spots: [] });
    renderPage({ pathname: '/photos', state: { focusSpotId: 'spot-a1:o1' } });
    await screen.findByText('No diary photos yet');

    await waitFor(() => expect(currentLocation?.state).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('sets the tab title once ready and leaves it alone on unmount (no cleanup)', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    const { unmount } = renderPage();
    await screen.findByRole('table');

    expect(document.title).toBe('Photos \u00B7 Cornerstone');
    unmount();
    // Mutation: restoring the previous title on unmount makes this 'Before'.
    expect(document.title).toBe('Photos \u00B7 Cornerstone');
  });

  it('emits no duplicate data-testid values', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    const { container } = renderPage();
    await screen.findByRole('table');
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  it('emits no duplicate data-testid values on the mobile grid', async () => {
    mockViewport(true);
    mockGetPhotoSpots.mockResolvedValue(DATA);
    const { container } = renderPage();
    await screen.findByTestId('spot-card-a1:o1');
    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});

// ─── #2226: No area group, select mode, bulk tags ────────────────────────────────────────────

const CEILING = { id: 'o1', name: 'Ceiling', description: null };

function noAreaPhoto(id: string, opts: { signed?: boolean; orientation?: boolean } = {}) {
  return makeSpotPhoto(id, {
    orientationId: opts.orientation === false ? null : 'o1',
    orientation: opts.orientation === false ? null : CEILING,
    diaryEntry: {
      id: `e-${id}`,
      entryType: 'daily_log',
      title: null,
      entryDate: '2026-09-11',
      isSigned: opts.signed ?? false,
    },
  });
}

const NO_AREA_DATA: PhotoSpotsResponse = {
  areas: [makeArea('house', 'House'), makeArea('kitchen', 'Kitchen', { parentId: 'house' })],
  orientations: [makeOrientation('o1', 'Ceiling', 1), makeOrientation('o2', 'Floor', 2)],
  spots: [
    makeSpot('kitchen', 'o1', { photoCount: 2, latestPhotoId: 'pK' }),
    makeSpot(null, 'o1', { photoCount: 2, latestPhotoId: 'n1' }),
    makeSpot(null, null, { photoCount: 1, latestPhotoId: 'n3' }),
  ],
};
const NO_AREA_PHOTOS = [
  noAreaPhoto('n1'),
  noAreaPhoto('n2', { signed: true }),
  noAreaPhoto('n3', { orientation: false }),
];
const UNDO = { token: 'tok-1', expiresAt: '2026-09-11T10:00:30.000Z' };

function result(overrides: Partial<BulkTagResult> = {}): BulkTagResult {
  return { areaId: 'kitchen', updated: 2, undo: UNDO, ...overrides };
}

async function openSelectMode() {
  const view = renderPage();
  fireEvent.click(await screen.findByTestId('no-area-select-toggle'));
  await screen.findByRole('group', { name: 'Photos with no area' });
  return view;
}

const selectBar = () => screen.queryByTestId('no-area-selection-bar');
const tile = (id: string) => screen.getByTestId(`no-area-photo-${id}`);
const checkbox = (id: string) => within(tile(id)).getByRole('checkbox');

describe('PhotosPage No area group (#2226)', () => {
  beforeEach(() => {
    mockGetPhotoSpots.mockReset();
    mockGetPhotoSpotPhotos.mockReset();
    mockUndoChange.mockReset();
    mockShowUndoToast.mockReset();
    mockBulkTag.mockReset();
    mockViewport(false);
    mockGetPhotoSpots.mockResolvedValue(NO_AREA_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValue({
      area: null,
      orientation: null,
      photos: NO_AREA_PHOTOS,
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('shows the No area band last, with the group count and a quiet Select photos button', async () => {
    renderPage();
    const toggle = await screen.findByTestId('no-area-select-toggle');
    expect(toggle).toHaveTextContent('Select photos');
    expect(screen.getByText('3 photos')).toBeInTheDocument();
    expect(screen.getByText('No area')).toBeInTheDocument();
    expect(toggle.className).not.toMatch(/btnPrimary/);
  });

  it('never uses the words Unsorted or Tidy up', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(document.body.textContent).not.toMatch(/unsorted|tidy/i);
  });

  it('shows neither the band nor a toggle when no photo lacks an area', async () => {
    mockGetPhotoSpots.mockResolvedValue(DATA);
    renderPage();
    await screen.findByRole('table');
    expect(screen.queryByTestId('no-area-select-toggle')).not.toBeInTheDocument();
    expect(screen.queryByText('No area')).not.toBeInTheDocument();
  });

  it('offers the same toggle on the mobile card grid', async () => {
    mockViewport(true);
    renderPage();
    expect(await screen.findByTestId('no-area-select-toggle')).toHaveTextContent('Select photos');
    expect(screen.getByRole('heading', { level: 2, name: 'No area' })).toBeInTheDocument();
  });

  it('does not fetch the no-area photo list until select mode is entered', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(mockGetPhotoSpotPhotos).not.toHaveBeenCalled();
  });

  it('uses a secondary (not primary) Try again button on the load error', async () => {
    mockGetPhotoSpots.mockReset();
    mockGetPhotoSpots.mockRejectedValue(new Error('x'));
    renderPage();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(retry.className).toMatch(/retryButton/);
    expect(retry.className).not.toMatch(/btnPrimary/);
  });
});

describe('PhotosPage select mode (#2226)', () => {
  beforeEach(() => {
    mockGetPhotoSpots.mockReset();
    mockGetPhotoSpotPhotos.mockReset();
    mockUndoChange.mockReset();
    mockShowUndoToast.mockReset();
    mockBulkTag.mockReset();
    mockViewport(false);
    mockGetPhotoSpots.mockResolvedValue(NO_AREA_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValue({
      area: null,
      orientation: null,
      photos: NO_AREA_PHOTOS,
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('fetches every no-area photo of any orientation with an abortable request', async () => {
    await openSelectMode();
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(1);
    const [area, orientation, options] = mockGetPhotoSpotPhotos.mock.calls[0] as [
      null,
      string,
      { signal: AbortSignal },
    ];
    expect(area).toBeNull();
    expect(orientation).toBe(PHOTO_SPOT_ANY);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('shows a loading skeleton while the photos load', async () => {
    mockGetPhotoSpotPhotos.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByTestId('no-area-select-toggle'));
    expect(screen.getByLabelText('Loading photos with no area')).toBeInTheDocument();
  });

  it('shows the photos as labelled checkbox tiles and turns the toggle into Done', async () => {
    await openSelectMode();
    expect(screen.getByTestId('no-area-select-toggle')).toHaveTextContent('Done');
    expect(
      screen.getByRole('checkbox', { name: 'Photo from September 11, 2026, Ceiling' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Photo from September 11, 2026, No orientation' }),
    ).toBeInTheDocument();
    // the spot row of the matrix is replaced
    expect(screen.queryByTestId('spot-cell-none:o1')).not.toBeInTheDocument();
    expect(selectBar()).not.toBeInTheDocument();
  });

  it('shows signed-entry photos as locked, unselectable tiles', async () => {
    await openSelectMode();
    expect(within(tile('n2')).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(tile('n2')).toHaveTextContent('Signed entry');
  });

  it('shows the selection bar with a singular then plural count', async () => {
    await openSelectMode();
    fireEvent.click(checkbox('n1'));
    const bar = selectBar()!;
    expect(bar).toHaveTextContent('1 photo selected');
    expect(within(bar).getByTestId('no-area-set-tags')).toHaveTextContent('Set tags');
    expect(within(bar).getByTestId('no-area-set-tags').className).toMatch(/setTagsButton/);
    expect(within(bar).getByTestId('no-area-select-all').className).toMatch(/barButton/);
    expect(within(bar).getByTestId('no-area-clear').className).toMatch(/barButton/);

    fireEvent.click(checkbox('n3'));
    expect(selectBar()).toHaveTextContent('2 photos selected');
    expect(checkbox('n1')).toBeChecked();

    fireEvent.click(checkbox('n1'));
    expect(selectBar()).toHaveTextContent('1 photo selected');
    expect(checkbox('n1')).not.toBeChecked();
  });

  it('hides the bar again when the last photo is deselected', async () => {
    await openSelectMode();
    fireEvent.click(checkbox('n1'));
    fireEvent.click(checkbox('n1'));
    expect(selectBar()).not.toBeInTheDocument();
  });

  it('Select all selects every unlocked photo and skips locked ones', async () => {
    await openSelectMode();
    fireEvent.click(checkbox('n1'));
    fireEvent.click(screen.getByTestId('no-area-select-all'));
    expect(selectBar()).toHaveTextContent('2 photos selected');
    expect(checkbox('n1')).toBeChecked();
    expect(checkbox('n3')).toBeChecked();
    expect(within(tile('n2')).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('Clear empties the selection and removes the bar', async () => {
    await openSelectMode();
    fireEvent.click(checkbox('n1'));
    fireEvent.click(screen.getByTestId('no-area-clear'));
    expect(selectBar()).not.toBeInTheDocument();
    expect(checkbox('n1')).not.toBeChecked();
  });

  it('Done leaves select mode, drops the selection and keeps the toggle', async () => {
    await openSelectMode();
    fireEvent.click(checkbox('n1'));

    fireEvent.click(screen.getByTestId('no-area-select-toggle'));

    expect(screen.queryByRole('group', { name: 'Photos with no area' })).not.toBeInTheDocument();
    expect(selectBar()).not.toBeInTheDocument();
    expect(screen.getByTestId('no-area-select-toggle')).toHaveTextContent('Select photos');
    expect(screen.getByTestId('spot-cell-none:o1')).toBeInTheDocument();

    // entering again starts with nothing selected
    fireEvent.click(screen.getByTestId('no-area-select-toggle'));
    await screen.findByRole('group', { name: 'Photos with no area' });
    expect(selectBar()).not.toBeInTheDocument();
    expect(checkbox('n1')).not.toBeChecked();
  });

  it('shows a load error with a secondary Try again that refetches', async () => {
    mockGetPhotoSpotPhotos.mockReset();
    mockGetPhotoSpotPhotos.mockRejectedValueOnce(new Error('SQLITE_BUSY leak'));
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      area: null,
      orientation: null,
      photos: NO_AREA_PHOTOS,
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('no-area-select-toggle'));

    expect(await screen.findByText('These photos could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText(/SQLITE_BUSY/)).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry.className).toMatch(/retryButton/);

    fireEvent.click(retry);

    await screen.findByRole('group', { name: 'Photos with no area' });
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2);
  });

  it('ignores an aborted no-area request (no error state)', async () => {
    let rejectFn: (e: unknown) => void = () => {};
    mockGetPhotoSpotPhotos.mockReset();
    mockGetPhotoSpotPhotos.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFn = reject;
      }),
    );
    renderPage();
    const toggle = await screen.findByTestId('no-area-select-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle); // leaves select mode: the request is aborted

    const abort = new Error('aborted');
    abort.name = 'AbortError';
    await act(async () => {
      rejectFn(abort);
    });

    expect(screen.queryByText('These photos could not be loaded.')).not.toBeInTheDocument();
  });

  it('emits no duplicate data-testid values in select mode', async () => {
    const { container } = await openSelectMode();
    fireEvent.click(checkbox('n1'));
    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});

describe('PhotosPage bulk Set tags (#2226)', () => {
  beforeEach(() => {
    mockGetPhotoSpots.mockReset();
    mockGetPhotoSpotPhotos.mockReset();
    mockUndoChange.mockReset();
    mockShowUndoToast.mockReset();
    mockBulkTag.mockReset();
    mockViewport(false);
    mockGetPhotoSpots.mockResolvedValue(NO_AREA_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValue({
      area: null,
      orientation: null,
      photos: NO_AREA_PHOTOS,
    });
    mockUndoChange.mockResolvedValue({ restored: [] });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  async function selectTwoAndSetTags(res: BulkTagResult | null) {
    mockBulkTag.mockResolvedValue(res);
    const view = await openSelectMode();
    fireEvent.click(checkbox('n1'));
    fireEvent.click(checkbox('n3'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('no-area-set-tags'));
    });
    return view;
  }

  const lastToast = () =>
    mockShowUndoToast.mock.calls[mockShowUndoToast.mock.calls.length - 1]![0] as {
      message: string;
      dedupeKey: string;
      onUndo: () => Promise<void>;
      focusFallback: () => HTMLElement | null;
    };

  it('opens the dialog with the selected ids, the areas and the Set tags button as focus return', async () => {
    await selectTwoAndSetTags(null);
    expect(mockBulkTag).toHaveBeenCalledTimes(1);
    const req = mockBulkTag.mock.calls[0]![0] as {
      photoIds: string[];
      areas: unknown[];
      returnFocusRef: { current: HTMLElement | null };
    };
    expect(req.photoIds.sort()).toEqual(['n1', 'n3']);
    expect(req.areas).toEqual(NO_AREA_DATA.areas);
    expect(req.returnFocusRef.current).toBe(screen.getByTestId('no-area-set-tags'));
  });

  it('a cancelled dialog changes nothing: selection kept, no toast, no refetch', async () => {
    await selectTwoAndSetTags(null);
    expect(mockShowUndoToast).not.toHaveBeenCalled();
    expect(selectBar()).toHaveTextContent('2 photos selected');
    expect(mockGetPhotoSpots).toHaveBeenCalledTimes(1);
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(1);
  });

  it('on success: clears the selection, refetches the matrix and the list, shows an Undo toast', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      area: null,
      orientation: null,
      photos: NO_AREA_PHOTOS,
    });
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      area: null,
      orientation: null,
      photos: [NO_AREA_PHOTOS[1]!],
    });
    await selectTwoAndSetTags(result());

    await waitFor(() => expect(mockGetPhotoSpots).toHaveBeenCalledTimes(2));
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2);
    expect(mockGetPhotoSpotPhotos.mock.calls[1]).toEqual([null, PHOTO_SPOT_ANY]);
    expect(selectBar()).not.toBeInTheDocument();
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    expect(lastToast().message).toBe('2 photos moved to House › Kitchen');
    expect(lastToast().dedupeKey).toBe('photo-tags-tok-1');
    // the refreshed list now holds one (locked) photo
    await waitFor(() => expect(screen.queryByTestId('no-area-photo-n1')).not.toBeInTheDocument());
    expect(screen.getByTestId('no-area-photo-n2')).toBeInTheDocument();
  });

  it('focuses the Select photos toggle when photos without an area remain', async () => {
    await selectTwoAndSetTags(result());
    await waitFor(() => expect(screen.getByTestId('no-area-select-toggle')).toHaveFocus());
    expect(screen.getByTestId('no-area-select-toggle')).toHaveTextContent('Done');
  });

  it('leaves select mode and focuses the page heading when the group is empty now', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      area: null,
      orientation: null,
      photos: NO_AREA_PHOTOS,
    });
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({ area: null, orientation: null, photos: [] });
    mockGetPhotoSpots.mockResolvedValueOnce(NO_AREA_DATA);
    mockGetPhotoSpots.mockResolvedValueOnce({
      ...NO_AREA_DATA,
      spots: [NO_AREA_DATA.spots[0]!],
    });
    await selectTwoAndSetTags(result());

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Photos' })).toHaveFocus(),
    );
    expect(screen.queryByTestId('no-area-select-toggle')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Photos with no area' })).not.toBeInTheDocument();
  });

  it('words the toast for area plus orientation as "spot · orientation"', async () => {
    await selectTwoAndSetTags(result({ orientationId: 'o2', updated: 2 }));
    expect(lastToast().message).toBe('2 photos moved to House › Kitchen · Floor');
  });

  it('words the toast for a cleared orientation as "No orientation" and uses the singular', async () => {
    await selectTwoAndSetTags(result({ orientationId: null, updated: 1 }));
    expect(lastToast().message).toBe('1 photo moved to House › Kitchen · No orientation');
  });

  it('words the toast for a cleared area as "No area"', async () => {
    await selectTwoAndSetTags(result({ areaId: null }));
    expect(lastToast().message).toBe('2 photos moved to No area');
  });

  it('falls back to "No area" for an area id missing from the list', async () => {
    await selectTwoAndSetTags(result({ areaId: 'brand-new' }));
    expect(lastToast().message).toBe('2 photos moved to No area');
  });

  it('leaves the orientation name empty for an orientation id missing from the list', async () => {
    await selectTwoAndSetTags(result({ orientationId: 'brand-new' }));
    expect(lastToast().message).toBe('2 photos moved to House › Kitchen · ');
  });

  it('words an orientation-only change as "Orientation set on n photos"', async () => {
    await selectTwoAndSetTags({ orientationId: 'o2', updated: 2, undo: UNDO });
    expect(lastToast().message).toBe('Orientation set on 2 photos');
  });

  it('words a single orientation-only change in the singular', async () => {
    await selectTwoAndSetTags({ orientationId: null, updated: 1, undo: UNDO });
    expect(lastToast().message).toBe('Orientation set on 1 photo');
  });

  it('Undo restores through the server token and refetches both lists', async () => {
    await selectTwoAndSetTags(result());
    await waitFor(() => expect(mockGetPhotoSpots).toHaveBeenCalledTimes(2));

    await act(async () => {
      await lastToast().onUndo();
    });

    expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
    expect(mockGetPhotoSpots).toHaveBeenCalledTimes(3);
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(3);
  });

  it('Undo still succeeds when the follow-up refetch fails', async () => {
    await selectTwoAndSetTags(result());
    await waitFor(() => expect(mockGetPhotoSpots).toHaveBeenCalledTimes(2));
    mockGetPhotoSpots.mockRejectedValue(new Error('offline'));

    await act(async () => {
      await expect(lastToast().onUndo()).resolves.toBeUndefined();
    });

    expect(mockUndoChange).toHaveBeenCalledTimes(1);
  });

  it('Undo rejects (so the toast can explain) when the server refuses', async () => {
    mockUndoChange.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'changed' }),
    );
    await selectTwoAndSetTags(result());

    await act(async () => {
      await expect(lastToast().onUndo()).rejects.toBeInstanceOf(ApiClientError);
    });
    expect(mockGetPhotoSpots).toHaveBeenCalledTimes(2);
  });

  it('the toast focus fallback is the Select photos toggle, else the page heading', async () => {
    await selectTwoAndSetTags(result());
    await waitFor(() => expect(mockGetPhotoSpots).toHaveBeenCalledTimes(2));
    expect(lastToast().focusFallback()).toBe(screen.getByTestId('no-area-select-toggle'));
  });

  it('when the refresh after saving fails: error state, selection mode kept, focus on the heading', async () => {
    mockGetPhotoSpots.mockReset();
    mockGetPhotoSpots.mockResolvedValueOnce(NO_AREA_DATA);
    mockGetPhotoSpots.mockRejectedValue(new Error('offline'));
    await selectTwoAndSetTags(result());

    expect(await screen.findByText('Photos could not be loaded.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Photos' })).toHaveFocus(),
    );
    expect(lastToast().focusFallback()).toBe(screen.getByRole('heading', { level: 1 }));
  });
});
