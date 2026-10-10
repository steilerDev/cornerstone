import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PhotoSpotsResponse } from '@cornerstone/shared';
import type PhotosPageType from './PhotosPage.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import {
  makeArea,
  makeOrientation,
  makeSpot,
  makeLocaleContextMock,
} from '../../test/photoSpotFixtures.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockGetPhotoSpots = jest.fn() as AnyMock;

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  getPhotoSpots: mockGetPhotoSpots,
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
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/photos" element={<PhotosPage />} />
        <Route path="/photos/spot/:a/:o" element={<OriginProbe />} />
      </Routes>
    </MemoryRouter>,
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
