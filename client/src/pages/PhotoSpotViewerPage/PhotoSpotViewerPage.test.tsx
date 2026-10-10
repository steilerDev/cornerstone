import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import type { PhotoSpotPhotosResponse } from '@cornerstone/shared';
import type PhotoSpotViewerPageType from './PhotoSpotViewerPage.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import { makeSpotPhoto, makeLocaleContextMock } from '../../test/photoSpotFixtures.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockGetPhotoSpotPhotos = jest.fn() as AnyMock;

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  getPhotoSpotPhotos: mockGetPhotoSpotPhotos,
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
      diaryEntry: { id: 'e0', entryType: 'daily_log', title: 'Newest', entryDate: '2026-09-20' },
    }),
    makeSpotPhoto('p1', {
      diaryEntry: { id: 'e1', entryType: 'daily_log', title: 'Middle', entryDate: '2026-09-11' },
    }),
    makeSpotPhoto('p2', {
      diaryEntry: { id: 'e2', entryType: 'daily_log', title: 'Oldest', entryDate: '2026-09-01' },
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

function renderPage(entry: string | { pathname: string; search?: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/photos" element={<div data-testid="photos-list-stub">list</div>} />
        <Route path="/diary/:id" element={<OriginProbe />} />
        <Route path="/photos/spot/:areaKey/:orientationKey" element={<PhotoSpotViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PhotoSpotViewerPage', () => {
  beforeEach(() => {
    mockGetPhotoSpotPhotos.mockReset();
    currentLocation = null;
    document.title = 'Before';
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
    expect(screen.getByTestId('spot-viewer-date')).toHaveTextContent('September 11, 2026');
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

  it('maps the "none" url keys to null ids for the API', async () => {
    mockGetPhotoSpotPhotos.mockResolvedValue({ ...DATA, area: null, orientation: null });
    renderPage('/photos/spot/none/none');
    await screen.findByTestId('spot-viewer-position');
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![0]).toBeNull();
    expect(mockGetPhotoSpotPhotos.mock.calls[0]![1]).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'No area \u00B7 No orientation',
    );
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
      state: { origin: { to: '/project/overview' } },
    });
    const back = await screen.findByTestId('spot-viewer-back');
    expect(back).toHaveTextContent('Back to Home');
    expect(back).toHaveAttribute('href', '/project/overview');
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
