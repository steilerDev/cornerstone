import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { routePattern } from '@cornerstone/shared';
import {
  AREAS,
  ORIENTATIONS,
  entry as entryFixture,
  makeEngine,
  photo,
} from '../../test/captureFixtures.js';
import type { FakeEngine } from '../../test/captureFixtures.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as PageModule from './DiaryCapturePage.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as PhotoApiTypes from '../../lib/photoApi.js';

let engine: FakeEngine;
let stripMounts = 0;

const mockGetEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();
const mockCreate = jest.fn<typeof DiaryApiTypes.createDiaryEntry>();
const mockUpdate = jest.fn<typeof DiaryApiTypes.updateDiaryEntry>();
const mockGetPhotos = jest.fn<typeof PhotoApiTypes.getPhotosForEntity>();

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'Alex Owner', email: 'alex@example.test' },
  }),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: AREAS, isLoading: false }),
}));
jest.unstable_mockModule('../../hooks/useOrientations.js', () => ({
  useOrientations: () => ({ orientations: ORIENTATIONS, isLoading: false }),
}));
jest.unstable_mockModule('../../capture/captureUploadsContext.js', () => ({
  useCaptureUploads: () => engine.api,
}));
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  getDiaryEntry: mockGetEntry,
  createDiaryEntry: mockCreate,
  updateDiaryEntry: mockUpdate,
  promoteDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  // Suggestions are a convenience; they stay pending so no update lands outside act().
  listDiaryEntries: jest.fn(() => new Promise(() => {})),
  lookupDiaryEntries: jest.fn(async () => ({ matches: [] })),
}));
jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  getPhotosForEntity: mockGetPhotos,
  deletePhoto: jest.fn(),
  updatePhoto: jest.fn(),
  fetchPhotoBlob: jest.fn(),
  uploadPhoto: jest.fn(),
  uploadAnnotation: jest.fn(),
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: jest.fn(async () => ({ items: [] })),
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: jest.fn(async () => []),
}));
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast: jest.fn(), showUndoToast: jest.fn() }),
}));
// Stand-ins for the photo components. The strip counts how often CaptureScreen mounted.
jest.unstable_mockModule('../../components/photos/PhotoStrip/PhotoStrip.js', () => ({
  PhotoStrip: () => {
    useEffect(() => {
      stripMounts += 1;
    }, []);
    return <div data-testid="photo-strip" />;
  },
}));
jest.unstable_mockModule('../../components/photos/PhotoStrip/PhotoTagSheet.js', () => ({
  PhotoTagSheet: () => null,
}));
jest.unstable_mockModule('../../components/photos/PhotoStrip/PhotoAnnotateDialog.js', () => ({
  PhotoAnnotateDialog: () => null,
}));
jest.unstable_mockModule('../../components/photos/PhotoStrip/PhotosWaitingNotice.js', () => ({
  PhotosWaitingNotice: () => null,
}));
jest.unstable_mockModule('../../components/photos/TagChips/TagChips.js', () => ({
  TagChips: () => <div data-testid="tag-chips" />,
}));
jest.unstable_mockModule('../../components/RapidCamera/RapidCamera.js', () => ({
  isLiveCameraSupported: () => false,
  isCameraDeniedThisSession: () => false,
  RapidCamera: () => null,
}));

let DiaryCapturePage: typeof PageModule.default;
let media: MatchMediaControl;

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function GoToNew() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/diary/new')}>
      go to new entry
    </button>
  );
}

function GoToStart({ start }: { start: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/diary/new?start=${start}`)}>
      go to start {start}
    </button>
  );
}

function renderPage(path: string, state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: path.split('?')[0]!,
          search: path.split('?')[1] ? `?${path.split('?')[1]}` : '',
          state,
        },
      ]}
    >
      <Routes>
        <Route
          path={routePattern('diaryEntryNew')}
          element={<DiaryCapturePage key="diary-capture" />}
        />
        <Route
          path={routePattern('diaryEntryEdit')}
          element={<DiaryCapturePage key="diary-capture" />}
        />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
      <Probe />
      <GoToNew />
      <GoToStart start="note" />
      <GoToStart start="delivery" />
    </MemoryRouter>,
  );
}

const heading = () => screen.getByRole('heading', { level: 1 });

beforeEach(async () => {
  engine = makeEngine();
  stripMounts = 0;
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  document.title = '';
  mockGetEntry.mockResolvedValue(entryFixture());
  mockGetPhotos.mockResolvedValue([]);
  mockCreate.mockResolvedValue(entryFixture({ id: 'created-1', title: null, body: '' }));
  mockUpdate.mockResolvedValue(entryFixture());
  media = installMatchMedia();
  jest.useFakeTimers({
    now: new Date(2026, 9, 19, 10, 0, 0),
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'queueMicrotask',
      'nextTick',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  if (!DiaryCapturePage) ({ default: DiaryCapturePage } = await import('./DiaryCapturePage.js'));
});

afterEach(() => {
  jest.useRealTimers();
  media.restore();
});

describe('DiaryCapturePage: new entry', () => {
  it('renders the capture screen without loading anything', () => {
    renderPage('/diary/new');

    expect(heading()).toHaveTextContent(/^New entry · /);
    expect(mockGetEntry).not.toHaveBeenCalled();
    expect(mockGetPhotos).not.toHaveBeenCalled();
    expect(screen.getByTestId('capture-title-input')).toHaveValue('');
    expect(document.title).toContain('New entry');
  });

  it('never resumes an earlier entry (AC10)', async () => {
    renderPage('/diary/new');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetEntry).not.toHaveBeenCalled();
    expect(screen.getByTestId('capture-title-input')).toHaveValue('');
  });

  it('shows the breadcrumb trail with the Site diary parent', () => {
    renderPage('/diary/new');

    expect(screen.getByRole('link', { name: 'Site diary' })).toBeInTheDocument();
  });

  it('pre-selects the date from ?date=', () => {
    renderPage('/diary/new?date=2026-10-12');

    expect(heading().textContent).toMatch(/12/);
    expect(screen.getByTestId('date-chips-pick')).toHaveTextContent(/12/);
  });

  it('stays mounted when the draft is created, keeping focus, value and the URL (AC13)', async () => {
    const user = userEvent.setup();
    renderPage('/diary/new');
    const input = screen.getByTestId('capture-title-input');
    await user.click(input);
    expect(stripMounts).toBe(1);

    await user.type(input, 'Screed');

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/created-1/edit'),
    );
    expect(mockGetEntry).not.toHaveBeenCalled();
    expect(screen.getByTestId('capture-title-input')).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Screed');
    expect(stripMounts).toBe(1);
  });
});

describe('DiaryCapturePage: moving from an entry to a new one', () => {
  it('starts an empty new entry instead of keeping the earlier form', async () => {
    const user = userEvent.setup();
    renderPage('/diary/draft-1/edit');
    expect(await screen.findByTestId('capture-title-input')).toHaveValue('Screed');
    mockGetEntry.mockClear();

    await user.click(screen.getByRole('button', { name: 'go to new entry' }));

    await waitFor(() => expect(screen.getByTestId('capture-title-input')).toHaveValue(''));
    expect(mockGetEntry).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/new');
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('DiaryCapturePage: draft', () => {
  it('loads the entry and its photos in parallel and shows the draft form', async () => {
    mockGetPhotos.mockResolvedValue([photo('p1')]);
    renderPage('/diary/draft-1/edit');

    expect(await screen.findByTestId('capture-title-input')).toHaveValue('Screed');
    expect(mockGetEntry).toHaveBeenCalledWith('draft-1');
    expect(mockGetPhotos).toHaveBeenCalledWith('diary_entry', 'draft-1');
    expect(screen.getByTestId('capture-text-input')).toHaveValue('Poured');
    expect(heading()).toHaveTextContent(/^New entry · /);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('shows a loading state first: one h1, skeleton and the trail', async () => {
    mockGetEntry.mockReturnValue(new Promise(() => {}));
    renderPage('/diary/draft-1/edit');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading()).toHaveTextContent('Diary entry');
    expect(document.title).toContain('Diary entry');
    expect(screen.getByRole('link', { name: 'Site diary' })).toBeInTheDocument();
    expect(screen.queryByTestId('capture-title-input')).not.toBeInTheDocument();
  });
});

describe('DiaryCapturePage: saved entry', () => {
  it('shows the edit form titled with the entry in the trail', async () => {
    mockGetEntry.mockResolvedValue(entryFixture({ id: 'e1', status: 'saved', title: 'Screed' }));
    renderPage('/diary/e1/edit');

    expect(await screen.findByTestId('capture-save')).toHaveTextContent('Save changes');
    expect(heading()).toHaveTextContent(/^Edit entry · /);
    expect(screen.queryByRole('group', { name: 'Entry type' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Screed' })).toHaveAttribute('href', '/diary/e1');
  });

  it('uses the untitled name in the trail for a saved entry without a title', async () => {
    mockGetEntry.mockResolvedValue(entryFixture({ id: 'e1', status: 'saved', title: null }));
    renderPage('/diary/e1/edit');

    await screen.findByTestId('capture-save');
    expect(screen.getByRole('link', { name: /^Daily log · / })).toBeInTheDocument();
  });
});

describe('DiaryCapturePage: locked entries', () => {
  it('shows a signed saved entry as locked, with no form, and opens the entry', async () => {
    const user = userEvent.setup();
    mockGetEntry.mockResolvedValue(
      entryFixture({ id: 'e1', status: 'saved', isSigned: true, title: 'Screed' }),
    );
    renderPage('/diary/e1/edit');

    expect(
      await screen.findByText("This entry is signed and can't be changed."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('capture-title-input')).not.toBeInTheDocument();
    expect(heading()).toHaveTextContent('Diary entry');
    expect(screen.getByRole('link', { name: 'Site diary' })).toBeInTheDocument();
    expect(document.title).toContain('Diary entry');

    await user.click(screen.getByRole('button', { name: 'Open the entry' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/e1');
  });

  it('shows an automatic entry as locked', async () => {
    mockGetEntry.mockResolvedValue(entryFixture({ id: 'e2', status: 'saved', isAutomatic: true }));
    renderPage('/diary/e2/edit');

    expect(await screen.findByText("Automatic entries can't be changed.")).toBeInTheDocument();
    expect(screen.queryByTestId('capture-title-input')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the entry' })).toBeInTheDocument();
  });

  it('a signed draft is still editable (signatures lock only on saving)', async () => {
    mockGetEntry.mockResolvedValue(entryFixture({ id: 'd2', status: 'draft', isSigned: true }));
    renderPage('/diary/d2/edit');

    expect(await screen.findByTestId('capture-title-input')).toBeInTheDocument();
  });
});

describe('DiaryCapturePage: not found and load errors', () => {
  it('shows "not found" for a 404 with a way back to the diary', async () => {
    const user = userEvent.setup();
    mockGetEntry.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    renderPage('/diary/missing/edit');

    expect(await screen.findByText("This entry doesn't exist.")).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Diary entry not found');
    expect(document.title).toContain('Diary entry not found');
    const links = screen.getAllByRole('link', { name: 'Site diary' });
    expect(links).toHaveLength(2);
    expect(screen.queryByTestId('capture-title-input')).not.toBeInTheDocument();

    await user.click(links[1]!);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary$/);
  });

  describe('Try again', () => {
    function pendingRetry() {
      let resolve!: (value: ReturnType<typeof entryFixture>) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<ReturnType<typeof entryFixture>>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      mockGetEntry.mockRejectedValueOnce(new Error('down'));
      mockGetEntry.mockReturnValueOnce(promise);
      return { resolve, reject };
    }

    it('keeps the message mounted and focused while retrying, then shows the form', async () => {
      const user = userEvent.setup();
      const retry = pendingRetry();
      renderPage('/diary/draft-1/edit');
      const message = await screen.findByText("Couldn't load this entry.");
      expect(heading()).toHaveTextContent('Diary entry');
      expect(screen.getByRole('link', { name: 'Site diary' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      const trying = await screen.findByText('Trying again…');
      expect(trying).toBe(message);
      expect(trying).toHaveFocus();
      expect(document.body).not.toHaveFocus();
      expect(screen.queryByText("Couldn't load this entry.")).not.toBeInTheDocument();
      expect(mockGetEntry).toHaveBeenCalledTimes(2);

      await act(async () => retry.resolve(entryFixture()));

      expect(await screen.findByTestId('capture-title-input')).toHaveValue('Screed');
      expect(screen.queryByText('Trying again…')).not.toBeInTheDocument();
    });

    it('shows the error again, with the original text, when the retry fails', async () => {
      const user = userEvent.setup();
      const retry = pendingRetry();
      renderPage('/diary/draft-1/edit');
      await screen.findByText("Couldn't load this entry.");
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByText('Trying again…')).toHaveFocus();

      await act(async () => retry.reject(new Error('still down')));

      const message = await screen.findByText("Couldn't load this entry.");
      expect(message).toBeInTheDocument();
      expect(screen.queryByText('Trying again…')).not.toBeInTheDocument();
      expect(screen.queryByTestId('capture-title-input')).not.toBeInTheDocument();
      expect(document.body).not.toHaveFocus();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  it('treats a failing photo request as a load error', async () => {
    mockGetPhotos.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPage('/diary/draft-1/edit');

    expect(await screen.findByText("Couldn't load this entry.")).toBeInTheDocument();
  });
});

describe('DiaryCapturePage: Log now start (#2222)', () => {
  const frame = () =>
    act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  it('hands ?start= from the URL to the capture screen, then removes it from the URL', async () => {
    renderPage('/diary/new?areaId=bath&start=note');
    await frame();

    expect(screen.getByTestId('capture-type-more')).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('capture-type-more')).toHaveTextContent('Note');
    expect(screen.getByTestId('capture-title-input')).toHaveFocus();
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/new?areaId=bath'),
    );
    expect(screen.getByTestId('location').textContent).not.toContain('start');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('ignores an unknown start value', async () => {
    renderPage('/diary/new?start=video');
    await frame();

    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/new?start=video');
  });

  it('remounts when a new start arrives on /diary/new and applies it', async () => {
    const user = userEvent.setup();
    renderPage('/diary/new');
    await user.type(screen.getByTestId('capture-title-input'), 'x');
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const mountsBefore = stripMounts;
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'go to start delivery' }));

    await waitFor(() =>
      expect(screen.getByTestId('capture-type-delivery')).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(stripMounts).toBe(mountsBefore + 1);
  });

  it('starting Note from an untouched /diary/new switches the type and focuses the title', async () => {
    const user = userEvent.setup();
    renderPage('/diary/new');

    await user.click(screen.getByRole('button', { name: 'go to start note' }));
    await frame();

    await waitFor(() =>
      expect(screen.getByTestId('capture-type-more')).toHaveAttribute('data-current', 'true'),
    );
    expect(screen.getByTestId('capture-title-input')).toHaveFocus();
  });

  it('consuming start does not remount: a typed title survives and the screen mounts once', async () => {
    const user = userEvent.setup();
    renderPage('/diary/new?start=note');
    await frame();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/new$/));
    const input = screen.getByTestId('capture-title-input');

    await user.type(input, 'Screed');

    expect(screen.getByTestId('capture-title-input')).toBe(input);
    expect(input).toHaveValue('Screed');
    expect(stripMounts).toBe(1);
  });

  it('does not remount when start goes back to null while typing', async () => {
    const user = userEvent.setup();
    renderPage('/diary/new?start=note');
    await frame();
    await user.type(screen.getByTestId('capture-title-input'), 'Abc');
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());

    expect(screen.getByTestId('capture-title-input')).toHaveValue('Abc');
    expect(stripMounts).toBe(1);
  });
});
