import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { PHOTO_SPOT_ANY, routeUrl } from '@cornerstone/shared';
import type {
  AreaResponse,
  PhotoSpotPhotosResponse,
  UpdatePhotoRequest,
  UpdatePhotoResponse,
} from '@cornerstone/shared';
import { PhotoDialogsContext } from '../../photos/photoDialogsContext.js';
import { ImmersiveShellContext } from '../../components/AppShell/immersiveShellContext.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type PhotoSpotViewerPageType from './PhotoSpotViewerPage.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import {
  makeSpotPhoto,
  makeServerPhoto,
  makeLocaleContextMock,
} from '../../test/photoSpotFixtures.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockGetPhotoSpotPhotos = jest.fn() as AnyMock;
const mockUpdatePhotoDetails =
  jest.fn<(id: string, data: UpdatePhotoRequest) => Promise<UpdatePhotoResponse>>();
const mockUndoChange = jest.fn() as AnyMock;
const mockShowUndoToast = jest.fn() as AnyMock;
const mockAnnotate = jest.fn() as AnyMock;

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  getPhotoSpotPhotos: mockGetPhotoSpotPhotos,
  updatePhotoDetails: mockUpdatePhotoDetails,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ showUndoToast: mockShowUndoToast }),
}));
const areasState: { areas: AreaResponse[] } = { areas: [] };
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: areasState.areas, isLoading: false }),
}));
jest.unstable_mockModule('../../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: { id?: string; onChange: (id: string) => void }) => (
    <div>
      <input id={props.id} aria-label="area input" readOnly />
      <button type="button" onClick={() => props.onChange('a-other')}>
        pick other area
      </button>
      <button type="button" onClick={() => props.onChange('a1')}>
        pick this area
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear area
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../components/OrientationPicker/OrientationPicker.js', () => ({
  OrientationPicker: (props: { id?: string; onChange: (id: string) => void }) => (
    <div>
      <input id={props.id} aria-label="orientation input" readOnly />
      <button type="button" onClick={() => props.onChange('o-other')}>
        pick other orientation
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let PhotoSpotViewerPage: typeof PhotoSpotViewerPageType;

beforeAll(async () => {
  ({ default: PhotoSpotViewerPage } = await import('./PhotoSpotViewerPage.js'));
});

const DATA: PhotoSpotPhotosResponse = {
  area: {
    id: 'a1',
    name: 'Kitchen',
    color: null,
    ancestors: [{ id: 'r', name: 'House', color: null }],
  },
  orientation: { id: 'o1', name: 'Ceiling', description: null },
  photos: [
    makeSpotPhoto('p0', {
      diaryEntry: {
        id: 'e0',
        entryType: 'daily_log',
        title: 'Newest',
        entryDate: '2026-09-20',
        isSigned: false,
      },
    }),
    makeSpotPhoto('p1', {
      diaryEntry: {
        id: 'e1',
        entryType: 'daily_log',
        title: 'Middle',
        entryDate: '2026-09-11',
        isSigned: false,
      },
    }),
    makeSpotPhoto('p2', {
      diaryEntry: {
        id: 'e2',
        entryType: 'daily_log',
        title: 'Oldest',
        entryDate: '2026-09-01',
        isSigned: false,
      },
    }),
  ],
};

let currentLocation: { pathname: string; search: string; state: unknown; navType: string } | null =
  null;

function LocationProbe() {
  const loc = useLocation();
  const navType = useNavigationType();
  currentLocation = { pathname: loc.pathname, search: loc.search, state: loc.state, navType };
  return null;
}

const immersiveRegister = jest.fn<() => () => void>();
const immersiveUnregister = jest.fn<() => void>();

function renderPage(entry: string | { pathname: string; search?: string; state?: unknown }) {
  return render(
    <PhotoDialogsContext value={{ annotate: mockAnnotate, bulkTag: jest.fn() as AnyMock }}>
      <ImmersiveShellContext value={{ register: immersiveRegister }}>
        <MemoryRouter initialEntries={[entry]}>
          <LocationProbe />
          <Routes>
            <Route path="/photos" element={<div data-testid="photos-list-stub">list</div>} />
            <Route path="/diary/:id" element={<OriginProbe />} />
            <Route path="/photos/spot/:areaKey/:orientationKey" element={<PhotoSpotViewerPage />} />
          </Routes>
        </MemoryRouter>
      </ImmersiveShellContext>
    </PhotoDialogsContext>,
  );
}

const PHONE = '(max-width: 767px)';
let media: MatchMediaControl | null = null;

describe('PhotoSpotViewerPage', () => {
  beforeEach(() => {
    mockGetPhotoSpotPhotos.mockReset();
    mockUpdatePhotoDetails.mockReset();
    mockUndoChange.mockReset();
    mockShowUndoToast.mockReset();
    mockAnnotate.mockReset();
    immersiveRegister.mockReset();
    immersiveUnregister.mockReset();
    immersiveRegister.mockReturnValue(immersiveUnregister);
    areasState.areas = [];
    currentLocation = null;
    document.title = 'Before';
  });

  afterEach(() => {
    media?.restore();
    media = null;
  });

  it('shows a loading skeleton first', () => {
    mockGetPhotoSpotPhotos.mockReturnValue(new Promise(() => {}));
    renderPage('/photos/spot/a1/o1');
    expect(screen.getByLabelText('Loading photo')).toBeInTheDocument();
  });

  it('selects the photo named by ?photo=', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p1');

    expect(await screen.findByTestId('spot-viewer-position')).toHaveTextContent('2 of 3');
    expect(screen.getByTestId('spot-viewer-details-panel-date')).toHaveTextContent(
      'September 11, 2026',
    );
  });

  it('falls back to the newest photo for an unknown ?photo=', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=nope');
    expect(await screen.findByTestId('spot-viewer-position')).toHaveTextContent('1 of 3');
  });

  it('falls back to the newest photo when ?photo= is absent', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1');
    expect(await screen.findByTestId('spot-viewer-position')).toHaveTextContent('1 of 3');
  });

  it('calls the API with the decoded ids', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![0]).toBe('a1');
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![1]).toBe('o1');
  });

  it('maps a "none" area key to a null id and an orientation key to its id', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...DATA, area: null });
    renderPage('/photos/spot/none/o1');
    await screen.findByTestId('spot-viewer-position');
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![0]).toBeNull();
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![1]).toBe('o1');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No area \u00B7 Ceiling');
  });

  it('Next/Prev rewrite ?photo= with replace so history does not grow', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');
    expect(currentLocation?.navType).toBe('POP');

    fireEvent.click(screen.getByTestId('spot-viewer-next'));
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p0'));
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('1 of 3');
    expect(currentLocation?.navType).toBe('REPLACE');

    fireEvent.click(screen.getByTestId('spot-viewer-prev'));
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p1'));
    expect(currentLocation?.navType).toBe('REPLACE');
    fireEvent.click(screen.getByTestId('spot-viewer-prev'));
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p2'));
    expect(currentLocation?.navType).toBe('REPLACE');
  });

  it('keeps the incoming router state (origin) when stepping through photos', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({
      pathname: '/photos/spot/a1/o1',
      search: '?photo=p1',
      state: { origin: { to: '/photos?x=1' } },
    });
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-viewer-next'));

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p0'));
    // Mutation: dropping state from setSearchParams loses the origin after one step.
    expect(currentLocation?.state).toEqual({ origin: { to: '/photos?x=1' } });
  });

  it('focuses the visually hidden h1 once after the first load', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');
    const heading = screen.getByRole('heading', { level: 1 });

    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading).toHaveTextContent('House \u203A Kitchen \u00B7 Ceiling');
  });

  it('does not re-focus the heading when stepping to another photo of the same spot', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');
    const heading = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(document.activeElement).toBe(heading));

    const diaryLink = screen.getByTestId('spot-viewer-diary-link');
    diaryLink.focus();
    fireEvent.click(screen.getByTestId('spot-viewer-next'));
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p0'));

    expect(document.activeElement).toBe(screen.getByTestId('spot-viewer-diary-link'));
  });

  it('sets the tab title to "<spot> · Photos · Cornerstone" once ready and keeps it on unmount', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    const { unmount } = renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');

    expect(document.title).toBe(
      'House \u203A Kitchen \u00B7 Ceiling \u00B7 Photos \u00B7 Cornerstone',
    );
    unmount();
    // Mutation: a restore-on-unmount cleanup would turn this back into 'Before'.
    expect(document.title).not.toBe('Before');
  });

  it('titles the tab "Photos \u00B7 Cornerstone" while loading (no spot segment yet)', () => {
    mockGetPhotoSpotPhotos.mockReturnValue(new Promise(() => {}));
    renderPage('/photos/spot/a1/o1');
    expect(document.title).toBe('Photos \u00B7 Cornerstone');
  });

  it('shows the not-found state for a 404 and navigates back to /photos from its action', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Area not found' }),
    );
    renderPage('/photos/spot/gone/o1');

    expect(await screen.findByText('This spot no longer exists')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Photos' }));

    expect(await screen.findByTestId('photos-list-stub')).toBeInTheDocument();
    expect(currentLocation?.pathname).toBe('/photos');
  });

  it('shows the empty state for a spot without photos', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...DATA, photos: [] });
    renderPage('/photos/spot/a1/o1');

    expect(await screen.findByText('No photos at this spot')).toBeInTheDocument();
    expect(screen.queryByTestId('spot-viewer-position')).not.toBeInTheDocument();
  });

  it('shows the translated load error (not the server message) and retries', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'SQLITE leaked' }),
    );
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(DATA);
    renderPage('/photos/spot/a1/o1');

    expect(await screen.findByText("This spot's photos could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText(/SQLITE/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('spot-viewer-position')).toBeInTheDocument();
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2);
  });

  it('renders a focused h1 "Photos" in the not-found state', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Area not found' }),
    );
    renderPage('/photos/spot/gone/o1');
    await screen.findByText('This spot no longer exists');

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Photos');
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('renders a focused h1 "Photos" in the load-error state', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValue(new Error('network down'));
    renderPage('/photos/spot/a1/o1');
    await screen.findByText("This spot's photos could not be loaded.");

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Photos');
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('renders a focused h1 with the spot label in the empty-photos state', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...DATA, photos: [] });
    renderPage('/photos/spot/a1/o1');
    await screen.findByText('No photos at this spot');

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('House \u203A Kitchen \u00B7 Ceiling');
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('renders an h1 while loading', () => {
    mockGetPhotoSpotPhotos.mockReturnValue(new Promise(() => {}));
    renderPage('/photos/spot/a1/o1');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Photos');
    expect(document.activeElement).toBe(document.body);
  });

  it('treats a non-ApiClientError rejection as a load error, not not-found', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValue(new Error('network down'));
    renderPage('/photos/spot/a1/o1');
    expect(await screen.findByText("This spot's photos could not be loaded.")).toBeInTheDocument();
  });

  it('ignores an AbortError rejection', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    mockGetPhotoSpotPhotos.mockRejectedValue(abort);
    renderPage('/photos/spot/a1/o1');
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("This spot's photos could not be loaded.")).not.toBeInTheDocument();
    expect(screen.queryByText('This spot no longer exists')).not.toBeInTheDocument();
  });

  it('labels the back link "Photos" and restores the Photos query from the origin, passing focusSpotId', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({
      pathname: '/photos/spot/a1/o1',
      search: '?photo=p1',
      state: { origin: { to: '/photos?group=g1' } },
    });
    const back = await screen.findByTestId('spot-viewer-back');
    // Mutation: ignoring origin.to (plain /photos) fails the href.
    expect(back).toHaveTextContent('Photos');
    expect(back).toHaveAttribute('href', '/photos?group=g1');

    fireEvent.click(back);

    expect(await screen.findByTestId('photos-list-stub')).toBeInTheDocument();
    expect(currentLocation?.search).toBe('?group=g1');
    expect(currentLocation?.state).toEqual({ focusSpotId: 'spot-a1:o1' });
  });

  it('defaults the back link to "Photos" at /photos without router state', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1');
    const back = await screen.findByTestId('spot-viewer-back');
    expect(back).toHaveAttribute('href', '/photos');
    expect(back).toHaveTextContent('Photos');
    expect(back).not.toHaveTextContent('Back to');
  });

  it('reads "Back to <name>" for an origin on another page, without focusSpotId', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({
      pathname: '/photos/spot/a1/o1',
      state: { origin: { to: '/diary/d-1', name: 'Synthetic entry' } },
    });
    const back = await screen.findByTestId('spot-viewer-back');
    expect(back).toHaveTextContent('Back to Synthetic entry');
    expect(back).toHaveAttribute('href', '/diary/d-1');

    fireEvent.click(back);

    // Mutation: focusSpotId must not leak to a non-Photos page.
    expect(currentLocation?.pathname).toBe('/diary/d-1');
    expect(currentLocation?.state).toBeNull();
  });

  it('uses the NavConfig label of an unnamed origin on another page', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({
      pathname: '/photos/spot/a1/o1',
      state: { origin: { to: routeUrl('home') } },
    });
    const back = await screen.findByTestId('spot-viewer-back');
    expect(back).toHaveTextContent('Back to Home');
    expect(back).toHaveAttribute('href', routeUrl('home'));
  });

  it('falls back to "Photos" for an unlabelled origin without a name', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({
      pathname: '/photos/spot/a1/o1',
      state: { origin: { to: '/diary/d-1' } },
    });
    const back = await screen.findByTestId('spot-viewer-back');
    expect(back).toHaveTextContent(/^Photos$/);
    expect(back).toHaveAttribute('href', '/photos');
  });

  it('ignores an unsafe origin (//evil) and links to /photos', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({ pathname: '/photos/spot/a1/o1', state: { origin: { to: '//evil.example' } } });
    expect(await screen.findByTestId('spot-viewer-back')).toHaveAttribute('href', '/photos');
  });

  it('keeps the origin back label after stepping to another photo', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage({
      pathname: '/photos/spot/a1/o1',
      search: '?photo=p1',
      state: { origin: { to: '/diary/d-1', name: 'Synthetic entry' } },
    });
    await screen.findByTestId('spot-viewer-position');
    fireEvent.click(screen.getByTestId('spot-viewer-next'));
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p0'));
    expect(screen.getByTestId('spot-viewer-back')).toHaveTextContent('Back to Synthetic entry');
  });

  it('gives the Open diary entry link an origin named after the spot label', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p1');
    fireEvent.click(await screen.findByTestId('spot-viewer-diary-link'));

    // Mutation: omitting entryLinkState, or passing no name, fails here.
    expect(probedOrigin()).toEqual({
      to: '/photos/spot/a1/o1?photo=p1',
      name: 'House \u203A Kitchen \u00B7 Ceiling',
    });
  });

  it('labels the not-found action "Back to <origin name>" when opened from elsewhere', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
    );
    renderPage({
      pathname: '/photos/spot/gone/o1',
      state: { origin: { to: '/diary/d-1', name: 'Synthetic entry' } },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Back to Synthetic entry' }));
    expect(currentLocation?.pathname).toBe('/diary/d-1');
  });

  it('Escape navigates back to the list with the focus state', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(await screen.findByTestId('photos-list-stub')).toBeInTheDocument();
    expect(currentLocation?.state).toEqual({ focusSpotId: 'spot-a1:o1' });
  });

  it('keyboard ArrowLeft steps to the earlier photo', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p0');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p1'));
  });

  it('selecting a history item rewrites ?photo=', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(DATA);
    renderPage('/photos/spot/a1/o1?photo=p0');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-history-item-p2'));

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p2'));
  });
});

// ─── #2226 ──────────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  media?.restore();
  media = null;
});

const O1 = { id: 'o1', name: 'Ceiling', description: null };
const O2 = { id: 'o2', name: 'Floor', description: null };

function entryOf(id: string, date: string, title: string | null = null) {
  return {
    id: `e-${id}`,
    entryType: 'daily_log' as const,
    title,
    entryDate: date,
    isSigned: false,
  };
}

const SPOT_AREA = {
  id: 'a1',
  name: 'Kitchen',
  color: null,
  ancestors: [{ id: 'r', name: 'House', color: null }],
};

/** Three photos tagged with the spot a1 / o1 (newest first). */
const SPOT_DATA: PhotoSpotPhotosResponse = {
  area: SPOT_AREA,
  orientation: O1,
  photos: ['p0', 'p1', 'p2'].map((id, i) =>
    makeSpotPhoto(id, {
      areaId: 'a1',
      orientationId: 'o1',
      orientation: O1,
      diaryEntry: entryOf(id, `2026-09-${20 - i * 5}`, `Entry ${id}`),
    }),
  ),
};

/** The 'No area' group: untagged photos of several orientations. */
const GROUP_DATA: PhotoSpotPhotosResponse = {
  area: null,
  orientation: null,
  photos: [
    makeSpotPhoto('g0', {
      orientationId: 'o2',
      orientation: O2,
      diaryEntry: entryOf('g0', '2026-09-20'),
    }),
    makeSpotPhoto('g1', {
      orientationId: 'o1',
      orientation: O1,
      diaryEntry: entryOf('g1', '2026-09-11'),
    }),
    makeSpotPhoto('g2', { diaryEntry: entryOf('g2', '2026-09-01') }),
  ],
};

describe('PhotoSpotViewerPage D-31: the No area group', () => {
  beforeEach(() => {
    mockGetPhotoSpotPhotos.mockReset();
    mockShowUndoToast.mockReset();
    immersiveRegister.mockReset();
    immersiveRegister.mockReturnValue(immersiveUnregister);
    currentLocation = null;
    document.title = 'Before';
  });

  it('D-31: none/none lists every orientation (null area, __any__ orientation)', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    renderPage('/photos/spot/none/none');
    await screen.findByTestId('spot-viewer-position');

    expect(mockGetPhotoSpotPhotos.mock.calls[0]![0]).toBeNull();
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![1]).toBe(PHOTO_SPOT_ANY);
  });

  it('D-31: the visible h1 and the tab title read "No area"', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    renderPage('/photos/spot/none/none');
    await screen.findByTestId('spot-viewer-position');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^No area$/);
    expect(document.title).toBe('No area · Photos · Cornerstone');
  });

  it('D-31: the list heading reads "Photos with no area", not "Same spot over time"', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    renderPage('/photos/spot/none/none');
    await screen.findByTestId('spot-viewer-position');

    expect(screen.getByRole('heading', { level: 2, name: 'Photos with no area' })).toBeVisible();
    expect(screen.queryByText('Same spot over time')).not.toBeInTheDocument();
  });

  it('D-31: "n of N" counts the whole group with 1 = newest', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    renderPage('/photos/spot/none/none?photo=g1');
    expect(await screen.findByTestId('spot-viewer-position')).toHaveTextContent('2 of 3');
  });

  it('D-31: an empty group shows "No photos without an area"', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...GROUP_DATA, photos: [] });
    renderPage('/photos/spot/none/none');

    expect(await screen.findByText('No photos without an area')).toBeInTheDocument();
    expect(
      screen.getByText('Photos you add to diary entries without an area appear here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No photos at this spot')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No area');
  });

  it('D-31: an old none/<orientation> link keeps its filter, titled "No area · <orientation>"', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...GROUP_DATA, orientation: O1 });
    renderPage('/photos/spot/none/o1');
    await screen.findByTestId('spot-viewer-position');

    expect(mockGetPhotoSpotPhotos.mock.calls[0]![1]).toBe('o1');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No area · Ceiling');
    expect(document.title).toBe('No area · Ceiling · Photos · Cornerstone');
    expect(screen.getByRole('heading', { level: 2, name: 'Photos with no area' })).toBeVisible();
  });

  it('D-31: an old none/<orientation> link with no photos uses the no-area empty copy', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...GROUP_DATA, orientation: O1, photos: [] });
    renderPage('/photos/spot/none/o1');
    expect(await screen.findByText('No photos without an area')).toBeInTheDocument();
  });

  it('a spot with an area keeps the spot copy for its empty state', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...SPOT_DATA, photos: [] });
    renderPage('/photos/spot/a1/o1');
    expect(await screen.findByText('No photos at this spot')).toBeInTheDocument();
  });

  it('D-31: Back focuses the cell of the photo being shown', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    renderPage('/photos/spot/none/none?photo=g1');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-viewer-back'));

    expect(await screen.findByTestId('photos-list-stub')).toBeInTheDocument();
    expect(currentLocation?.state).toEqual({ focusSpotId: 'spot-none:o1' });
  });

  it('D-31: Back focuses the no-orientation cell for an untagged-orientation photo', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    renderPage('/photos/spot/none/none?photo=g2');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-viewer-back'));

    expect(await screen.findByTestId('photos-list-stub')).toBeInTheDocument();
    expect(currentLocation?.state).toEqual({ focusSpotId: 'spot-none:none' });
  });

  it('D-31: Escape from an empty group still goes back with a focus target', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...GROUP_DATA, photos: [] });
    renderPage('/photos/spot/none/none');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to Photos' }));
    expect(await screen.findByTestId('photos-list-stub')).toBeInTheDocument();
    expect(currentLocation?.state).toEqual({ focusSpotId: 'spot-none:none' });
  });
});

describe('PhotoSpotViewerPage immersive phone mode', () => {
  beforeEach(() => {
    mockGetPhotoSpotPhotos.mockReset();
    immersiveRegister.mockReset();
    immersiveUnregister.mockReset();
    immersiveRegister.mockReturnValue(immersiveUnregister);
  });

  it('registers with the shell on a phone once the viewer shows photos, and unregisters on leaving', async () => {
    media = installMatchMedia({ [PHONE]: true });
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    const { unmount } = renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');

    expect(immersiveRegister).toHaveBeenCalledTimes(1);
    expect(immersiveUnregister).not.toHaveBeenCalled();

    unmount();
    expect(immersiveUnregister).toHaveBeenCalledTimes(1);
  });

  it('does not register on a wider screen', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');
    expect(immersiveRegister).not.toHaveBeenCalled();
  });

  it('does not register while loading', () => {
    media = installMatchMedia({ [PHONE]: true });
    mockGetPhotoSpotPhotos.mockReturnValue(new Promise(() => {}));
    renderPage('/photos/spot/a1/o1');
    expect(immersiveRegister).not.toHaveBeenCalled();
  });

  it('does not register for an empty spot, a not-found spot or a load error', async () => {
    media = installMatchMedia({ [PHONE]: true });

    mockGetPhotoSpotPhotos.mockResolvedValueOnce({ ...SPOT_DATA, photos: [] });
    const empty = renderPage('/photos/spot/a1/o1');
    await screen.findByText('No photos at this spot');
    empty.unmount();

    mockGetPhotoSpotPhotos.mockRejectedValueOnce(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
    );
    const missing = renderPage('/photos/spot/gone/o1');
    await screen.findByText('This spot no longer exists');
    missing.unmount();

    mockGetPhotoSpotPhotos.mockRejectedValueOnce(new Error('down'));
    renderPage('/photos/spot/a1/o1');
    await screen.findByText("This spot's photos could not be loaded.");

    expect(immersiveRegister).not.toHaveBeenCalled();
  });

  it('uses a secondary Try again button on the load error', async () => {
    mockGetPhotoSpotPhotos.mockRejectedValue(new Error('down'));
    renderPage('/photos/spot/a1/o1');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(retry.className).toMatch(/retryButton/);
    expect(retry.className).not.toMatch(/btnPrimary/);
  });
});

describe('PhotoSpotViewerPage Annotate', () => {
  beforeEach(() => {
    mockGetPhotoSpotPhotos.mockReset();
    mockAnnotate.mockReset();
  });

  it('opens the annotate dialog for the current photo with the toolbar button as focus return', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockAnnotate.mockResolvedValue(null);
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-viewer-annotate'));

    expect(mockAnnotate).toHaveBeenCalledTimes(1);
    const req = mockAnnotate.mock.calls[0]![0] as {
      photo: { id: string };
      returnFocusRef: { current: HTMLElement | null };
    };
    expect(req.photo.id).toBe('p1');
    expect(req.returnFocusRef.current).toBe(screen.getByTestId('spot-viewer-annotate'));
  });

  it('refetches the list after a saved annotation and keeps ?photo=', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockAnnotate.mockResolvedValue(makeServerPhoto({ id: 'p1' }));
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-viewer-annotate'));

    await waitFor(() => expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2));
    expect(currentLocation?.search).toBe('?photo=p1');
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('2 of 3');
  });

  it('does not refetch when the dialog is cancelled', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockAnnotate.mockResolvedValue(null);
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    fireEvent.click(screen.getByTestId('spot-viewer-annotate'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(1);
  });
});

describe('PhotoSpotViewerPage saved details', () => {
  const UNDO = { token: 'tok-9', expiresAt: '2026-09-11T10:00:30.000Z' };

  beforeEach(() => {
    mockGetPhotoSpotPhotos.mockReset();
    mockUpdatePhotoDetails.mockReset();
    mockUndoChange.mockReset();
    mockShowUndoToast.mockReset();
    areasState.areas = [
      { ...makeAreaFixture('a1', 'Kitchen') },
      { ...makeAreaFixture('a-other', 'Garage') },
    ];
  });

  function makeAreaFixture(id: string, name: string): AreaResponse {
    return {
      id,
      name,
      parentId: null,
      color: null,
      description: null,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  const toast = () =>
    mockShowUndoToast.mock.calls[mockShowUndoToast.mock.calls.length - 1]![0] as {
      message: string;
      dedupeKey: string;
      onUndo: () => Promise<void>;
      focusFallback: () => HTMLElement | null;
    };

  async function editAndSave(pick: string) {
    const user = userEvent.setup();
    await user.click(screen.getByTestId('spot-viewer-details-panel-edit-tags'));
    await user.click(screen.getByRole('button', { name: pick }));
    await user.click(screen.getByTestId('spot-viewer-details-panel-save-tags'));
  }

  const movedTo = (id: string, areaId: string, orientation = O1) =>
    makeServerPhoto({
      id,
      areaId,
      orientationId: orientation.id,
      orientation,
    });

  it('a photo moved out of the spot: next photo, spot label toast with Undo, heading focused', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(SPOT_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[0]!, SPOT_DATA.photos[2]!],
    });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p2'));
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('2 of 2');
    expect(currentLocation?.navType).toBe('REPLACE');
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    expect(toast().message).toBe('Photo moved to Garage · Ceiling');
    expect(toast().dedupeKey).toBe('photo-tags-tok-9');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('moving the last photo of the spot away shows the empty state and focuses the heading', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[0]!],
    });
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({ ...SPOT_DATA, photos: [] });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p0', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    expect(await screen.findByText('No photos at this spot')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
  });

  it('unmounting before the empty-list focus frame fires throws nothing', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[0]!],
    });
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({ ...SPOT_DATA, photos: [] });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p0', 'a-other'), undo: UNDO });
    const view = renderPage('/photos/spot/a1/o1');
    await screen.findByTestId('spot-viewer-position');

    const pending: FrameRequestCallback[] = [];
    const spy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      pending.push(cb);
      return 0;
    });
    try {
      await editAndSave('pick other area');
      await screen.findByText('No photos at this spot');
      view.unmount();
      expect(() => pending.forEach((cb) => cb(0))).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('moving the newest photo selects the new newest one (index clamped at 0)', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(SPOT_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[1]!, SPOT_DATA.photos[2]!],
    });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p0', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p0');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p1'));
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('1 of 2');
  });

  it('Undo restores the photo, refetches and selects it again', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(SPOT_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[0]!, SPOT_DATA.photos[2]!],
    });
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockUndoChange.mockResolvedValue({ restored: [] });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');
    await editAndSave('pick other area');
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p2'));

    await act(async () => {
      await toast().onUndo();
    });

    expect(mockUndoChange).toHaveBeenCalledWith('tok-9');
    expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p1'));
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('2 of 3');
  });

  it('Undo rejects (the toast then explains) when the server refuses, and changes nothing', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockUndoChange.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'changed' }),
    );
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');
    await editAndSave('pick other area');
    await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
    const callsBefore = mockGetPhotoSpotPhotos.mock.calls.length;

    await act(async () => {
      await expect(toast().onUndo()).rejects.toBeInstanceOf(ApiClientError);
    });

    expect(mockGetPhotoSpotPhotos.mock.calls.length).toBe(callsBefore);
  });

  it('the toast focus fallback is the page heading', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');
    await editAndSave('pick other area');
    await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());

    expect(toast().focusFallback()).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('a move whose refetch fails keeps what is shown, still offers Undo and does not navigate', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(SPOT_DATA);
    mockGetPhotoSpotPhotos.mockRejectedValue(new Error('offline'));
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a-other'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalledTimes(1));
    expect(currentLocation?.search).toBe('?photo=p1');
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('2 of 3');
  });

  it('a move without an undo token shows no toast', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(SPOT_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[0]!, SPOT_DATA.photos[2]!],
    });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a-other') });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=p2'));
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });

  it('a tag change that still belongs to this spot refetches silently (no toast, no navigation)', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a1'), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    await waitFor(() => expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2));
    expect(mockShowUndoToast).not.toHaveBeenCalled();
    expect(currentLocation?.search).toBe('?photo=p1');
    expect(screen.getByTestId('spot-viewer-details-panel-saved')).toHaveTextContent('Tags saved');
  });

  it('a different orientation also moves the photo out of a spot', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(SPOT_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...SPOT_DATA,
      photos: [SPOT_DATA.photos[0]!, SPOT_DATA.photos[2]!],
    });
    mockUpdatePhotoDetails.mockResolvedValue({ photo: movedTo('p1', 'a1', O2), undo: UNDO });
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other orientation');

    await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalledTimes(1));
    expect(toast().message).toBe('Photo moved to Kitchen · Floor');
  });

  it('a caption-only edit refetches silently', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(SPOT_DATA);
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: makeServerPhoto({
        id: 'p1',
        caption: 'New words',
        areaId: 'a1',
        orientationId: 'o1',
        orientation: O1,
      }),
    });
    const user = userEvent.setup();
    renderPage('/photos/spot/a1/o1?photo=p1');
    await screen.findByTestId('spot-viewer-position');

    await user.click(screen.getByTestId('spot-viewer-details-panel-edit-tags'));
    await user.type(screen.getByLabelText('Caption'), 'New words');
    await user.click(screen.getByTestId('spot-viewer-details-panel-save-tags'));

    await waitFor(() => expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p1', { caption: 'New words' });
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });

  it('in the No area group a photo that gets an area leaves the group', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValueOnce(GROUP_DATA);
    mockGetPhotoSpotPhotos.mockResolvedValueOnce({
      ...GROUP_DATA,
      photos: [GROUP_DATA.photos[0]!, GROUP_DATA.photos[2]!],
    });
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: movedTo('g1', 'a-other'),
      undo: UNDO,
    });
    renderPage('/photos/spot/none/none?photo=g1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other area');

    await waitFor(() => expect(currentLocation?.search).toBe('?photo=g2'));
    expect(toast().message).toBe('Photo moved to Garage · Ceiling');
  });

  it('in the No area group a photo that stays without an area (orientation change) stays', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue(GROUP_DATA);
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: makeServerPhoto({
        id: 'g1',
        areaId: null,
        orientationId: 'o2',
        orientation: O2,
      }),
      undo: UNDO,
    });
    renderPage('/photos/spot/none/none?photo=g1');
    await screen.findByTestId('spot-viewer-position');

    await editAndSave('pick other orientation');

    await waitFor(() => expect(mockGetPhotoSpotPhotos).toHaveBeenCalledTimes(2));
    expect(mockShowUndoToast).not.toHaveBeenCalled();
    expect(currentLocation?.search).toBe('?photo=g1');
  });
});
