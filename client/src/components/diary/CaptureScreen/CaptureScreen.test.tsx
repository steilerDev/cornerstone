import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StrictMode } from 'react';
import { createRouterLog, RecordingRouter } from '../../../test/recordingRouter.js';
import type { QuickLogMode } from '../../../navigation/createQuery.js';
import type { DiaryEntryDetail, DiaryEntryLookupMatch } from '@cornerstone/shared';
import {
  AREAS,
  ORIENTATIONS,
  entry as entryFixture,
  item,
  makeEngine,
  photo,
} from '../../../test/captureFixtures.js';
import type { FakeEngine } from '../../../test/captureFixtures.js';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import { ApiClientError } from '../../../lib/apiClient.js';
import type * as ScreenModule from './CaptureScreen.js';
import type * as DiaryApiTypes from '../../../lib/diaryApi.js';
import type * as PhotoApiTypes from '../../../lib/photoApi.js';
import type * as MoveTypes from './moveToEntry.js';
import type { ShowUndoToastOptions } from '../../Toast/ToastContext.js';

// ── Mocks ───────────────────────────────────────────────────────────────────────────────────────

let engine: FakeEngine;

const mockCreate = jest.fn<typeof DiaryApiTypes.createDiaryEntry>();
const mockUpdate = jest.fn<typeof DiaryApiTypes.updateDiaryEntry>();
const mockPromote = jest.fn<typeof DiaryApiTypes.promoteDiaryEntry>();
const mockDelete = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();
const mockList = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockLookup = jest.fn<typeof DiaryApiTypes.lookupDiaryEntries>();
const mockDeletePhoto = jest.fn<typeof PhotoApiTypes.deletePhoto>();
const mockGetPhotos = jest.fn<typeof PhotoApiTypes.getPhotosForEntity>();
const mockUpdatePhoto = jest.fn<typeof PhotoApiTypes.updatePhoto>();
const mockListWorkItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn<(options: ShowUndoToastOptions) => void>();
const mockMove = jest.fn<typeof MoveTypes.moveToEntry>();
const mockLiveSupported = jest.fn(() => false);
const mockDenied = jest.fn(() => false);

jest.unstable_mockModule('../../../contexts/LocaleContext.js', () => ({
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
jest.unstable_mockModule('../../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'Alex Owner', email: 'alex@example.test' },
  }),
}));
jest.unstable_mockModule('../../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: AREAS, isLoading: false }),
}));
jest.unstable_mockModule('../../../hooks/useOrientations.js', () => ({
  useOrientations: () => ({ orientations: ORIENTATIONS, isLoading: false }),
}));
jest.unstable_mockModule('../../../capture/captureUploadsContext.js', () => ({
  useCaptureUploads: () => engine.api,
}));
jest.unstable_mockModule('../../../lib/diaryApi.js', () => ({
  createDiaryEntry: mockCreate,
  updateDiaryEntry: mockUpdate,
  promoteDiaryEntry: mockPromote,
  deleteDiaryEntry: mockDelete,
  listDiaryEntries: mockList,
  lookupDiaryEntries: mockLookup,
  getDiaryEntry: jest.fn(),
}));
jest.unstable_mockModule('../../../lib/photoApi.js', () => ({
  deletePhoto: mockDeletePhoto,
  getPhotosForEntity: mockGetPhotos,
  updatePhoto: mockUpdatePhoto,
}));
jest.unstable_mockModule('../../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));
jest.unstable_mockModule('../../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));
jest.unstable_mockModule('../../../lib/vendorsApi.js', () => ({
  searchCompanies: jest.fn(async () => []),
}));
jest.unstable_mockModule('../../Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast: mockShowToast, showUndoToast: mockShowUndoToast }),
}));
jest.unstable_mockModule('./moveToEntry.js', () => ({
  moveToEntry: mockMove,
  newMoveProgress: () => ({ itemIds: null, photoIds: new Set(), textDone: false }),
}));

// Light stand-ins for the photo components (they have their own tests).
jest.unstable_mockModule('../../photos/PhotoStrip/PhotoStrip.js', () => ({
  PhotoStrip: (props: {
    tiles: readonly { key: string; state: string }[];
    selectedKeys: ReadonlySet<string>;
    onToggleSelect: (key: string) => void;
    onOpen: (key: string) => void;
    onRetry: (key: string) => void;
    onRemove: (key: string) => void;
  }) => (
    <div data-testid="photo-strip">
      {props.tiles.map((tile) => (
        <div key={tile.key} data-testid={`tile-${tile.key}`} data-state={tile.state}>
          <button
            type="button"
            aria-pressed={props.selectedKeys.has(tile.key)}
            onClick={() => props.onToggleSelect(tile.key)}
          >
            select {tile.key}
          </button>
          <button type="button" onClick={() => props.onOpen(tile.key)}>
            open {tile.key}
          </button>
          <button type="button" onClick={() => props.onRemove(tile.key)}>
            remove {tile.key}
          </button>
          <button type="button" onClick={() => props.onRetry(tile.key)}>
            retry {tile.key}
          </button>
        </div>
      ))}
    </div>
  ),
}));
jest.unstable_mockModule('../../photos/PhotoStrip/PhotoTagSheet.js', () => ({
  PhotoTagSheet: (props: { onClose: () => void; onRemove: () => void; onAnnotate: () => void }) => (
    <div data-testid="tag-sheet">
      <button type="button" onClick={props.onAnnotate}>
        sheet annotate
      </button>
      <button type="button" onClick={props.onRemove}>
        sheet remove
      </button>
      <button type="button" onClick={props.onClose}>
        sheet close
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../photos/PhotoStrip/PhotoAnnotateDialog.js', () => ({
  PhotoAnnotateDialog: (props: { photo: { id: string }; onClose: () => void }) => (
    <div data-testid="annotate-dialog" data-photo={props.photo.id}>
      <button type="button" onClick={props.onClose}>
        annotate close
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../photos/PhotoStrip/PhotosWaitingNotice.js', () => ({
  PhotosWaitingNotice: (props: { draftId: string }) => (
    <div data-testid="waiting-notice" data-draft={props.draftId} />
  ),
}));
jest.unstable_mockModule('../../photos/TagChips/TagChips.js', () => ({
  TagChips: (props: {
    idPrefix: string;
    areaId: string | null;
    orientationId: string | null;
    onAreaChange: (id: string | null) => void;
    onOrientationChange: (id: string | null) => void;
  }) => (
    <div data-testid={`tag-chips-${props.idPrefix}`} data-area={props.areaId ?? ''}>
      <button type="button" onClick={() => props.onAreaChange('kitchen')}>
        {props.idPrefix} area kitchen
      </button>
      <button type="button" onClick={() => props.onAreaChange('bath')}>
        {props.idPrefix} area bath
      </button>
      <button type="button" onClick={() => props.onOrientationChange('north')}>
        {props.idPrefix} orientation north
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../RapidCamera/RapidCamera.js', () => ({
  isLiveCameraSupported: mockLiveSupported,
  isCameraDeniedThisSession: mockDenied,
  RapidCamera: (props: { onClose: () => void; children: React.ReactNode }) => (
    <div data-testid="rapid-camera">
      {props.children}
      <button type="button" onClick={props.onClose}>
        camera done
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../SignatureSection/index.js', () => ({
  SignatureSection: (props: { signatures: unknown[] }) => (
    <div data-testid="signature-section">{props.signatures.length} slots</div>
  ),
}));

let CaptureScreen: typeof ScreenModule.CaptureScreen;
let media: MatchMediaControl;

// ── Harness ─────────────────────────────────────────────────────────────────────────────────────

function Probe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </output>
  );
}

interface RenderOptions {
  mode?: 'new' | 'draft' | 'saved';
  entry?: DiaryEntryDetail | null;
  photos?: ReturnType<typeof photo>[];
  prefill?: { areaId: string | null; date: string | null };
  entries?: string[];
  state?: unknown;
  history?: unknown[];
}

function renderScreen(options: RenderOptions = {}) {
  const onDraftCreated = jest.fn();
  const mode = options.mode ?? 'new';
  const entry = options.entry === undefined ? null : options.entry;
  const initialEntries = options.history ?? [
    { pathname: mode === 'new' ? '/diary/new' : '/diary/draft-1/edit', state: options.state },
  ];
  const view = render(
    <MemoryRouter initialEntries={initialEntries as never} initialIndex={initialEntries.length - 1}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <CaptureScreen
                mode={mode}
                entry={entry}
                photos={options.photos ?? []}
                prefill={options.prefill ?? { areaId: null, date: null }}
                breadcrumbs={<nav data-testid="crumbs" />}
                onDraftCreated={onDraftCreated}
              />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...view, onDraftCreated };
}

function locationState(): Record<string, unknown> | null {
  return JSON.parse(screen.getByTestId('location').getAttribute('data-state') ?? 'null');
}

function listResponse(entries: Array<Partial<DiaryEntryDetail>>) {
  return {
    items: entries,
    pagination: { page: 1, pageSize: 50, totalPages: 1, totalItems: entries.length },
  } as never;
}

function match(overrides: Partial<DiaryEntryLookupMatch> = {}): DiaryEntryLookupMatch {
  return {
    id: 'm1',
    entryType: 'daily_log',
    title: 'Screed',
    status: 'saved',
    photoCount: 2,
    ...overrides,
  };
}

/**
 * Waits for the draft to exist by its real signals (the create call resolved and the screen moved
 * to the draft URL), not for the autosave text, which flips to "Saving…" on a slow runner.
 */
async function draftCreated() {
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit'),
  );
  await act(async () => {});
}

const heading = () => screen.getByRole('heading', { level: 1 });
const saveButton = () => screen.getByTestId('capture-save');

beforeEach(async () => {
  engine = makeEngine();
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  document.title = '';
  mockCreate.mockResolvedValue(entryFixture({ id: 'draft-1', title: null, body: '' }));
  mockUpdate.mockResolvedValue(entryFixture());
  mockPromote.mockResolvedValue(entryFixture({ status: 'saved' }));
  mockDelete.mockResolvedValue(undefined);
  mockList.mockResolvedValue(listResponse([]));
  mockLookup.mockResolvedValue({ matches: [] });
  mockListWorkItems.mockResolvedValue({ items: [] });
  mockGetPhotos.mockResolvedValue([]);
  mockLiveSupported.mockReturnValue(false);
  mockDenied.mockReturnValue(false);
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
  if (!CaptureScreen) ({ CaptureScreen } = await import('./CaptureScreen.js'));
});

afterEach(() => {
  jest.useRealTimers();
  media.restore();
});

// ── New entry ───────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: a new entry', () => {
  it('shows the photo controls first, then date, title, text, type, details and Save (AC1)', async () => {
    renderScreen();

    const order = [
      screen.getByTestId('capture-choose-photos'),
      screen.getByRole('group', { name: 'Date' }),
      screen.getByTestId('capture-title-input'),
      screen.getByTestId('capture-text-input'),
      screen.getByRole('group', { name: 'Entry type' }),
      screen.getByRole('heading', { level: 2, name: 'Site details' }),
      saveButton(),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('is a daily log dated today, with Today pressed and nothing pre-filled (AC6)', () => {
    renderScreen();

    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('date-chips-today')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('capture-title-input')).toHaveValue('');
    expect(screen.getByTestId('capture-text-input')).toHaveValue('');
    const company = screen.getByRole('group', { name: 'Company' });
    expect(within(company).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect(screen.getByTestId('capture-workers-chip-2')).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes the h1 and the tab title from the date chip (AC4)', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(heading()).toHaveTextContent(/^New entry · Mon, /);
    expect(heading().textContent).toMatch(/19/);
    expect(document.title).toContain('New entry');

    await user.click(screen.getByTestId('date-chips-yesterday'));

    expect(heading()).toHaveTextContent(/^New entry · Sun, /);
    expect(heading().textContent).toMatch(/18/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('honours the prefilled date and area', () => {
    renderScreen({ prefill: { areaId: 'bath', date: '2026-10-10' } });

    expect(screen.getByTestId('tag-chips-capture')).toHaveAttribute('data-area', 'bath');
    expect(heading().textContent).toMatch(/10/);
    expect(screen.getByTestId('date-chips-pick')).toHaveTextContent(/10/);
  });

  it('writes nothing for chips, a date or a type alone (AC13)', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByTestId('capture-workers-chip-2'));
    await user.click(screen.getByTestId('date-chips-yesterday'));
    await user.click(screen.getByTestId('capture-type-delivery'));
    await user.click(screen.getByTestId('capture-choose-photos'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('waiting-notice')).not.toBeInTheDocument();
  });

  it('creates the draft on the first character of the title and moves to the draft URL (AC13)', async () => {
    const user = userEvent.setup();
    const { onDraftCreated } = renderScreen({ state: { origin: { to: '/diary' } } });

    await user.type(screen.getByTestId('capture-title-input'), 'Sc');

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      entryType: 'daily_log',
      status: 'draft',
      entryDate: '2026-10-19',
    });
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit'),
    );
    expect(onDraftCreated).toHaveBeenCalledWith('draft-1');
    expect(locationState()).toEqual({ origin: { to: '/diary' } });
    expect(screen.getByTestId('waiting-notice')).toHaveAttribute('data-draft', 'draft-1');
    expect(screen.getByTestId('capture-title-input')).toHaveValue('Sc');
  });

  it('creates the draft on the first character of the text', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByTestId('capture-text-input'), 'x');

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({ body: 'x' });
  });

  it('creates the draft on the first photo and hands the waiting photos to it', async () => {
    engine.add.mockResolvedValue(['n1']);
    renderScreen();
    const input = screen.getByTestId('capture-library-input');

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(engine.assignDraft).toHaveBeenCalledWith(['n1'], 'draft-1'));
  });

  it('shows the draft failure with a Retry that tries again', async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValueOnce(new Error('down'));
    renderScreen();

    await user.type(screen.getByTestId('capture-title-input'), 'S');

    expect(await screen.findByText("Couldn't start the entry. Try again.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Couldn't start the entry. Try again.")).not.toBeInTheDocument(),
    );
  });

  it('shows "Saved ‹time›" in the bar once the draft exists (AC9)', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.queryByText(/^Saved /)).not.toBeInTheDocument();

    await user.type(screen.getByTestId('capture-title-input'), 'S');

    await draftCreated();
    await waitFor(() => expect(screen.getByText(/^Saved \d/)).toBeInTheDocument());
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent('Draft saved.');
  });

  it('limits the title and the text', () => {
    renderScreen();

    expect(screen.getByTestId('capture-title-input')).toHaveAttribute('maxlength', '1000');
    expect(screen.getByTestId('capture-text-input')).toHaveAttribute('maxlength', '10000');
    expect(screen.getByTestId('capture-title-input')).toHaveAttribute('autocomplete', 'off');
  });

  it('shows the hint under the date once a photo exists', () => {
    engine.items = [item('i1', { draftId: null })];
    renderScreen();

    expect(screen.getByText('Photos use this date.')).toBeInTheDocument();
  });
});

// ── Save ────────────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: saving a new entry', () => {
  it('keeps Save aria-disabled with a reason until there is a title, text or photo', async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(saveButton()).not.toBeDisabled();
    const reason = document.getElementById(saveButton().getAttribute('aria-describedby')!);
    expect(reason).toHaveTextContent('Add a photo, a title or some text.');

    await user.click(saveButton());
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPromote).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('capture-title-input'), 'P');
    await waitFor(() => expect(saveButton()).not.toHaveAttribute('aria-disabled'));
    expect(saveButton()).not.toHaveAttribute('aria-describedby');
  });

  it('explains when the only content is photos that have not finished uploading', () => {
    engine.items = [item('i1', { draftId: null })];
    renderScreen();

    const reason = document.getElementById(saveButton().getAttribute('aria-describedby')!);
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(reason).toHaveTextContent('Wait until a photo has finished uploading.');
  });

  it('saves with only a title (AC5) and lands on the entry with the heading focused', async () => {
    const user = userEvent.setup();
    renderScreen({ state: { origin: { to: '/diary' } } });
    await user.type(screen.getByTestId('capture-title-input'), 'Plaster');
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    await draftCreated();

    await user.click(saveButton());

    await waitFor(() => expect(mockPromote).toHaveBeenCalledTimes(1));
    expect(mockPromote.mock.calls[0]).toEqual([
      'draft-1',
      { entryDate: '2026-10-19', title: 'Plaster', body: '', metadata: null },
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/draft-1$/),
    );
    expect(locationState()).toEqual({ origin: { to: '/diary' }, focusHeading: true });
  });

  it('shows the server error above the bar and keeps the form', async () => {
    const user = userEvent.setup();
    mockPromote.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw server text' }),
    );
    renderScreen();
    await user.type(screen.getByTestId('capture-title-input'), 'Plaster');
    await draftCreated();

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).not.toHaveTextContent('raw server text');
    expect(screen.getByTestId('capture-title-input')).toHaveValue('Plaster');
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit');
  });

  it('maps "photos missing" from the server to the Save reason', async () => {
    const user = userEvent.setup();
    mockPromote.mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: { fields: ['photos'] },
      }),
    );
    renderScreen();
    await user.type(screen.getByTestId('capture-title-input'), 'Plaster');
    await draftCreated();

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add a photo, a title or some text.',
    );
  });

  it('a site visit without inspector and outcome is not saved: errors, focus and a plural announcement', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('capture-type-site_visit'));
    // Wait one animation frame so the screen's focus return to the chip (after a type change) has
    // run before typing; otherwise a slow runner lands the text on the chip.
    await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    await user.type(screen.getByTestId('capture-title-input'), 'Inspection');
    await draftCreated();

    await user.click(saveButton());

    expect(await screen.findByText('Enter the inspector.')).toBeInTheDocument();
    expect(screen.getByText('Choose an outcome.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Inspector')).toHaveFocus());
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent('2 things to fix.');
    expect(mockPromote).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Inspector'), 'Ines');
    await user.click(screen.getByTestId('capture-outcome-pass'));
    await user.click(saveButton());
    await waitFor(() => expect(mockPromote).toHaveBeenCalledTimes(1));
    expect(mockPromote.mock.calls[0]![1].metadata).toEqual({
      inspectorName: 'Ines',
      outcome: 'pass',
    });
  });

  it('blocks the save while a signature is unfinished and announces one thing to fix', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByTestId('capture-title-input'), 'Plaster');
    await draftCreated();
    await user.click(screen.getByTestId('capture-more-details'));
    await user.click(screen.getByRole('button', { name: '+ Add Signature' }));

    await user.click(saveButton());

    expect(
      await screen.findByText('Accept or remove the unfinished signature before saving.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent('1 thing to fix.');
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it('rejects an end time before the start', async () => {
    const user = userEvent.setup();
    renderScreen({
      mode: 'draft',
      entry: entryFixture({ metadata: { workStart: '10:00', workEnd: '09:00' } }),
    });

    await user.click(saveButton());

    expect((await screen.findAllByText('End must be after start.')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent('1 thing to fix.');
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it('shows the signed-lock note once a complete signature exists', async () => {
    const user = userEvent.setup();
    renderScreen({
      mode: 'draft',
      entry: entryFixture({
        metadata: {
          signatures: [{ signerName: 'Sam', signerType: 'self', signatureDataUrl: 'data:x' }],
        },
      }),
    });

    expect(screen.getByText('Saving locks this entry because it is signed.')).toBeInTheDocument();
    await user.click(screen.getByTestId('capture-type-delivery').closest('div')!);
  });
});

// ── Autosave of a draft ─────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: a draft', () => {
  it('has the ⋯ menu, type chips and "Save entry"', () => {
    renderScreen({ mode: 'draft', entry: entryFixture() });

    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Entry type' })).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent('Save entry');
    expect(heading()).toHaveTextContent(/^New entry · /);
    expect(screen.queryByTestId('capture-cancel')).not.toBeInTheDocument();
  });

  it('saves a chip tap at once with the full metadata (second trade needs no extra taps)', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByTestId('capture-workers-chip-3'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ metadata: { workersOnSite: 3 } });
    await act(async () => {});
    await waitFor(() => expect(screen.getByText(/^Saved \d/)).toBeInTheDocument());
  });

  it('autosaves typed text after the pause', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.type(screen.getByTestId('capture-text-input'), '!');
    expect(mockUpdate).not.toHaveBeenCalled();

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1), { timeout: 2500 });
    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ body: 'Poured!' });
  });

  it('shows a failed save with Retry in the bar, and Retry saves again', async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValueOnce(new Error('down'));
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByTestId('capture-workers-chip-3'));

    expect(await screen.findAllByText("Couldn't save. Trying again.")).not.toHaveLength(0);
    await user.click(screen.getByTestId('capture-retry-save'));
    await waitFor(() => expect(screen.queryByTestId('capture-retry-save')).not.toBeInTheDocument());
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent('Saved again.');
  });

  it('shows the offline message when the browser is offline', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    try {
      renderScreen({ mode: 'draft', entry: entryFixture() });
      await user.click(screen.getByTestId('capture-workers-chip-3'));

      expect(
        await screen.findByText("You're offline. Changes are kept on this screen."),
      ).toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    }
  });

  it('promotes the draft with the typed fields', async () => {
    const user = userEvent.setup();
    renderScreen({
      mode: 'draft',
      entry: entryFixture({ metadata: { weather: 'sunny' } }),
    });

    await user.click(saveButton());

    await waitFor(() => expect(mockPromote).toHaveBeenCalledTimes(1));
    expect(mockPromote.mock.calls[0]).toEqual([
      'draft-1',
      {
        entryDate: '2026-10-18',
        title: 'Screed',
        body: 'Poured',
        metadata: { weather: 'sunny' },
      },
    ]);
  });
});

// ── Entry type ──────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: entry type (AC8)', () => {
  it('switches at once when nothing would be lost and focuses the pressed chip', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByTestId('capture-type-delivery'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('draft-1', { entryType: 'delivery', metadata: null }),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('capture-type-delivery')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByTestId('capture-type-delivery')).toHaveFocus());
    expect(screen.getByRole('checkbox', { name: 'Delivered as expected' })).toBeInTheDocument();
  });

  it('switches to Defect and Note through More', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByTestId('capture-type-more'));
    await user.click(screen.getByTestId('capture-type-issue'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(screen.getByTestId('capture-type-more')).toHaveTextContent('Defect');
    expect(screen.getByTestId('capture-status-open')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByTestId('capture-type-more')).toHaveFocus());
    // The choice menu stays open after a pick (see EntryTypeChips); close it before reopening.
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('capture-type-more'));
    await user.click(screen.getByTestId('capture-type-general_note'));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Site details' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('asks to confirm a switch that drops details, listing them, and keeps the type on Keep editing', async () => {
    const user = userEvent.setup();
    renderScreen({
      mode: 'draft',
      entry: entryFixture({ metadata: { weather: 'sunny', workStart: '07:00', workEnd: '09:00' } }),
    });

    await user.click(screen.getByTestId('capture-type-more'));
    await user.click(screen.getByTestId('capture-type-general_note'));

    const dialog = await screen.findByRole('alertdialog', { name: 'Switch to Note?' });
    expect(within(dialog).getByText(/entries don't keep these details/)).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Weather', 'Start and end time']);
    expect(mockUpdate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('applies the confirmed switch, announces what was removed and returns focus', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture({ metadata: { weather: 'sunny' } }) });
    await user.click(screen.getByTestId('capture-type-more'));
    await user.click(screen.getByTestId('capture-type-general_note'));
    const dialog = await screen.findByRole('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: 'Switch type' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockUpdate).toHaveBeenCalledWith('draft-1', {
      entryType: 'general_note',
      metadata: null,
    });
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent(
      'Changed to Note. Removed: Weather.',
    );
    await waitFor(() => expect(screen.getByTestId('capture-type-more')).toHaveFocus());
  });

  it('keeps the dialog open with an error when the switch fails', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture({ metadata: { weather: 'sunny' } }) });
    await user.click(screen.getByTestId('capture-type-more'));
    await user.click(screen.getByTestId('capture-type-general_note'));
    const dialog = await screen.findByRole('alertdialog');
    mockUpdate.mockRejectedValueOnce(new Error('down'));

    await user.click(within(dialog).getByRole('button', { name: 'Switch type' }));

    expect(
      await within(dialog).findByText("Couldn't change the entry type. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an error when a plain switch fails', async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValueOnce(new Error('down'));
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByTestId('capture-type-delivery'));

    expect(
      await screen.findByText("Couldn't change the entry type. Try again."),
    ).toBeInTheDocument();
  });

  it('a new entry switches locally, with a confirm when details would be dropped', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('capture-more-details'));
    await user.click(screen.getByTestId('capture-weather-rainy'));

    await user.click(screen.getByTestId('capture-type-site_visit'));

    const dialog = await screen.findByRole('alertdialog', { name: 'Switch to Site visit?' });
    expect(within(dialog).getByText('Weather')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Switch type' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('capture-more-details')).toHaveAttribute('aria-expanded', 'false');
  });
});

// ── Discard ─────────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: discard', () => {
  it('without a draft leaves at once for the origin, removing this session’s photos', async () => {
    const user = userEvent.setup();
    engine.add.mockResolvedValue(['n1']);
    mockCreate.mockReturnValue(new Promise(() => {}));
    renderScreen({ state: { origin: { to: '/diary?type=issue' } } });
    fireEvent.change(screen.getByTestId('capture-library-input'), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));

    expect(engine.remove).toHaveBeenCalledWith('n1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/diary'));
    expect(locationState()).toMatchObject({ focusHeading: true });
  });

  it('without a draft and without an origin leaves for the diary list', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary$/));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('with a draft asks first, counting the photos, and Keep entry cancels', async () => {
    const user = userEvent.setup();
    renderScreen({
      mode: 'draft',
      entry: entryFixture(),
      photos: [photo('p1'), photo('p2', { sortOrder: 1 })],
    });

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));

    const dialog = await screen.findByRole('alertdialog', { name: 'Discard this entry?' });
    expect(within(dialog).getByText('Its 2 photos are deleted too.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep entry' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus());
  });

  it('mentions photos still waiting, and has no lead without photos', async () => {
    const user = userEvent.setup();
    engine.items = [item('w1')];
    renderScreen({ mode: 'draft', entry: entryFixture(), photos: [photo('p1')] });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));
    expect(
      await screen.findByText('Its 2 photos, including 1 still waiting, are deleted too.'),
    ).toBeInTheDocument();
  });

  it('has no lead when the draft has no photos', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture() });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByText(/are deleted too|is deleted too/)).not.toBeInTheDocument();
  });

  it('confirming deletes the draft and its photos and returns to the origin', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('cornerstone.capture.tags.draft-1', JSON.stringify({ areaId: 'bath' }));
    renderScreen({
      mode: 'draft',
      entry: entryFixture(),
      state: { origin: { to: '/diary' } },
    });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));
    const dialog = await screen.findByRole('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('draft-1'));
    expect(engine.discardDraft).toHaveBeenCalledWith('draft-1');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary$/));
    expect(locationState()).toEqual({ origin: { to: '/diary' }, focusHeading: true });
    expect(sessionStorage.getItem('cornerstone.capture.tags.draft-1')).toBeNull();
  });

  it('keeps the dialog open with the error when the discard fails', async () => {
    const user = userEvent.setup();
    mockDelete.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderScreen({ mode: 'draft', entry: entryFixture() });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));
    const dialog = await screen.findByRole('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Discard' })).toBeEnabled();
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit');
  });

  it('uses the generic message for a failure that is not an API error', async () => {
    const user = userEvent.setup();
    mockDelete.mockRejectedValueOnce(new Error('network'));
    renderScreen({ mode: 'draft', entry: entryFixture() });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('capture-discard'));

    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );

    expect(await screen.findByText("Couldn't discard the entry. Try again.")).toBeInTheDocument();
  });
});

// ── Saved entry ─────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: a saved entry', () => {
  const saved = (overrides: Partial<DiaryEntryDetail> = {}) =>
    entryFixture({ id: 'e1', status: 'saved', ...overrides });

  it('has a read-only type, Save changes and Cancel, and no ⋯ menu or autosave', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'saved', entry: saved(), history: ['/diary/e1', '/diary/e1/edit'] });

    expect(heading()).toHaveTextContent(/^Edit entry · /);
    expect(screen.queryByRole('group', { name: 'Entry type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    expect(screen.getByTestId('diary-type-badge-daily_log')).toHaveAccessibleName(
      'Entry type: Daily log',
    );
    expect(saveButton()).toHaveTextContent('Save changes');
    expect(screen.getByTestId('capture-cancel')).toBeInTheDocument();
    expect(screen.queryByText(/^Saved \d/)).not.toBeInTheDocument();

    await user.type(screen.getByTestId('capture-text-input'), '!');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('has no Status control for a saved defect', () => {
    renderScreen({
      mode: 'saved',
      entry: saved({
        entryType: 'issue',
        metadata: { severity: 'high', resolutionStatus: 'open' },
      }),
      history: ['/diary/e1/edit'],
    });

    expect(screen.getByRole('group', { name: 'Severity' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('Save changes sends the edit and goes back one step when opened from the entry', async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(saved());
    renderScreen({
      mode: 'saved',
      entry: saved({ metadata: { weather: 'sunny' } }),
      history: [
        { pathname: '/diary/e1' },
        { pathname: '/diary/e1/edit', state: { origin: { to: '/diary/e1' } } },
      ],
    });
    await user.type(screen.getByTestId('capture-title-input'), '2');

    await user.click(saveButton());

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0]).toEqual([
      'e1',
      { entryDate: '2026-10-18', title: 'Screed2', body: 'Poured', metadata: { weather: 'sunny' } },
    ]);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/e1$/));
  });

  it('Save changes replaces with the entry when there is no origin', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'saved', entry: saved(), history: ['/elsewhere', '/diary/e1/edit'] });
    await user.type(screen.getByTestId('capture-title-input'), '2');

    await user.click(saveButton());

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/e1$/));
    expect(locationState()).toEqual({ focusHeading: true });
  });

  it('Cancel leaves at once when nothing changed', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'saved', entry: saved(), history: ['/other', '/diary/e1/edit'] });

    await user.click(screen.getByTestId('capture-cancel'));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/e1$/));
  });

  it('Cancel with changes asks "Discard changes?"; Keep editing stays, Discard leaves', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'saved', entry: saved(), history: ['/other', '/diary/e1/edit'] });
    await user.type(screen.getByTestId('capture-title-input'), '2');

    await user.click(screen.getByTestId('capture-cancel'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('capture-title-input')).toHaveValue('Screed2');

    await user.click(screen.getByTestId('capture-cancel'));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/e1$/));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('Cancel goes back in history when the entry is the origin', async () => {
    const user = userEvent.setup();
    renderScreen({
      mode: 'saved',
      entry: saved(),
      history: [
        { pathname: '/diary/e1' },
        { pathname: '/diary/e1/edit', state: { origin: { to: '/diary/e1' } } },
      ],
    });

    await user.click(screen.getByTestId('capture-cancel'));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/e1$/));
    expect(locationState()).toBeNull();
  });

  it('shows the server error and stays when saving changes fails', async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(
      new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'raw' }),
    );
    renderScreen({ mode: 'saved', entry: saved(), history: ['/diary/e1/edit'] });
    await user.type(screen.getByTestId('capture-title-input'), '2');

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).not.toHaveTextContent('raw');
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/e1/edit');
    expect(saveButton()).not.toHaveAttribute('aria-disabled');
  });

  it('warns before the browser unloads only while there are unsaved edits', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'saved', entry: saved(), history: ['/diary/e1/edit'] });
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByTestId('capture-title-input'), '2');

    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

// ── Same title and day ──────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: same date and title', () => {
  async function typeTitle(user: ReturnType<typeof userEvent.setup>, text = 'Screed') {
    await user.type(screen.getByTestId('capture-title-input'), text);
  }

  it('offers the existing entry after the pause, with the count, and announces it once', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match()] });
    renderScreen();

    await typeTitle(user);

    const notice = await screen.findByTestId('capture-lookup', undefined, { timeout: 3000 });
    const dateText = heading().textContent!.replace('New entry · ', '');
    expect(dateText).toMatch(/^Mon, /);
    expect(notice).toHaveTextContent(`You already have an entry called Screed on ${dateText}.`);
    expect(notice).toHaveTextContent('Daily log · 2 photos');
    expect(mockLookup.mock.calls.at(-1)![0]).toMatchObject({
      entryDate: '2026-10-19',
      title: 'Screed',
      excludeId: 'draft-1',
    });
    expect(screen.getByTestId('sticky-action-bar-status')).toHaveTextContent(
      'An entry with this title already exists on this day.',
    );
    const button = screen.getByTestId('capture-add-to-that');
    expect(button).toHaveTextContent('Add to that entry instead');
    expect(document.getElementById(button.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Photos and text move to that entry.',
    );
  });

  it('warns that site details are not copied when the draft has some', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match()] });
    renderScreen({
      mode: 'draft',
      entry: entryFixture({ title: null, metadata: { workersOnSite: 2 } }),
    });

    await typeTitle(user);

    const button = await screen.findByTestId('capture-add-to-that', undefined, { timeout: 3000 });
    expect(document.getElementById(button.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Site details are not copied.',
    );
  });

  it('moves everything to that entry and navigates there with a toast', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match()] });
    mockMove.mockResolvedValue({ status: 'done' });
    renderScreen({
      mode: 'draft',
      entry: entryFixture({ title: null, body: 'Notes' }),
      photos: [photo('p1')],
      state: { origin: { to: '/diary' } },
    });
    await typeTitle(user);

    await user.click(
      await screen.findByTestId('capture-add-to-that', undefined, { timeout: 3000 }),
    );

    await waitFor(() => expect(mockMove).toHaveBeenCalledTimes(1));
    const args = mockMove.mock.calls[0]![0];
    expect(args).toMatchObject({ draftId: 'draft-1', match: { id: 'm1' }, body: 'Notes' });
    expect(args.serverPhotos.map((p) => p.id)).toEqual(['p1']);
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Added to Screed.');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/m1$/));
    expect(locationState()).toEqual({ origin: { to: '/diary' }, focusHeading: true });
  });

  it('shows busy state while moving and ignores a second click', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match()] });
    let finish: (value: { status: 'done' }) => void = () => {};
    mockMove.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen({ mode: 'draft', entry: entryFixture({ title: null }) });
    await typeTitle(user);
    const button = await screen.findByTestId('capture-add-to-that', undefined, { timeout: 3000 });

    await user.click(button);
    expect(button).toHaveTextContent('Adding…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);

    expect(mockMove).toHaveBeenCalledTimes(1);
    await act(async () => finish({ status: 'done' }));
  });

  it('tells the person when that entry is signed, and offers to try again', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match()] });
    mockMove.mockResolvedValue({ status: 'signed' });
    renderScreen({ mode: 'draft', entry: entryFixture({ title: null }) });
    await typeTitle(user);

    await user.click(
      await screen.findByTestId('capture-add-to-that', undefined, { timeout: 3000 }),
    );

    expect(
      await screen.findByText("That entry is signed and can't be changed."),
    ).toBeInTheDocument();
    expect(screen.getByTestId('capture-add-to-that')).toHaveTextContent(
      'Add to that entry instead',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit');
  });

  it('on a failure replaces the button with "Open that entry" and deletes nothing', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match()] });
    mockMove.mockResolvedValue({ status: 'failed' });
    renderScreen({ mode: 'draft', entry: entryFixture({ title: null }) });
    await typeTitle(user);

    await user.click(
      await screen.findByTestId('capture-add-to-that', undefined, { timeout: 3000 }),
    );

    expect(await screen.findByText("Couldn't move everything to that entry.")).toBeInTheDocument();
    expect(screen.queryByTestId('capture-add-to-that')).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open that entry' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/m1$/));
  });

  it('does not offer anything before the draft exists or without a match', async () => {
    renderScreen();
    expect(screen.queryByTestId('capture-lookup')).not.toBeInTheDocument();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

// ── Suggestions ─────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: suggestions', () => {
  const saved = (id: string, title: string, extra: Partial<DiaryEntryDetail> = {}) => ({
    id,
    title,
    entryType: 'daily_log' as const,
    status: 'saved' as const,
    metadata: null,
    ...extra,
  });

  it('shows no title chips without saved entries', async () => {
    renderScreen();
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    expect(screen.queryByTestId('capture-title-chip-Screed')).not.toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith({ status: 'saved', automatic: false, pageSize: 50 });
  });

  it('offers the recent distinct titles; a tap fills the title and starts the draft', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(
      listResponse([saved('a', 'Screed'), saved('b', 'screed'), saved('c', 'Plaster')]),
    );
    renderScreen();

    const chip = await screen.findByTestId('capture-title-chip-Screed');
    expect(screen.getAllByTestId(/^capture-title-chip-/).map((c) => c.textContent)).toEqual([
      'Screed',
      'Plaster',
    ]);
    await user.click(chip);

    expect(screen.getByTestId('capture-title-input')).toHaveValue('Screed');
    expect(screen.getByTestId('capture-title-chip-Screed')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('capture-title-chip-Screed'));
    expect(screen.getByTestId('capture-title-input')).toHaveValue('');
  });

  it('ranks companies of same-title entries first with nothing pre-selected (AC6)', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(
      listResponse([
        saved('a', 'Screed', { metadata: { vendorId: 'v1', vendorName: 'Alpha Build' } as never }),
        saved('b', 'Screed', { metadata: { vendorId: 'v2', vendorName: 'Beta Roofing' } as never }),
        saved('c', 'Screed', { metadata: { vendorId: 'v2', vendorName: 'Beta Roofing' } as never }),
        saved('d', 'Plaster', { metadata: { vendorId: 'v3', vendorName: 'Gamma' } as never }),
      ]),
    );
    renderScreen();
    await user.click(await screen.findByTestId('capture-title-chip-Screed'));

    const group = screen.getByRole('group', { name: 'Company' });
    await waitFor(() =>
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Beta Roofing', 'Alpha Build', 'Other company…']),
    );
    expect(within(group).queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('adds the companies with work on the floor of the tagged area', async () => {
    const user = userEvent.setup();
    mockListWorkItems.mockResolvedValue({
      items: [{ assignedVendor: { id: 'f1', name: 'Floor Company' } }],
    });
    renderScreen();

    await user.click(screen.getByText('capture area kitchen'));

    await waitFor(() =>
      expect(mockListWorkItems).toHaveBeenCalledWith(
        { areaId: expect.any(String), pageSize: 100 },
        expect.anything(),
      ),
    );
    expect(await screen.findByTestId('capture-company-chip-f1')).toHaveTextContent('Floor Company');
  });

  it('suggests recent start and end times', async () => {
    mockList.mockResolvedValue(
      listResponse([
        saved('a', 'Screed', { metadata: { workStart: '07:30', workEnd: '16:00' } as never }),
      ]),
    );
    renderScreen();

    expect(await screen.findByTestId('capture-start-07:30')).toBeInTheDocument();
    expect(screen.getByTestId('capture-end-16:00')).toBeInTheDocument();
  });
});

// ── Photos ──────────────────────────────────────────────────────────────────────────────────────

describe('CaptureScreen: photos and tags (AC2)', () => {
  it('offers Select all from two photos, then Clear selection with a count', async () => {
    const user = userEvent.setup();
    engine.items = [item('a'), item('b')];
    renderScreen({ mode: 'draft', entry: entryFixture() });
    expect(screen.getByTestId('capture-tags-apply')).toHaveTextContent('Tags apply to new photos');

    await user.click(screen.getByRole('button', { name: 'Select all' }));

    expect(screen.getByTestId('capture-tags-apply')).toHaveTextContent(
      'Tags apply to 2 selected photos',
    );
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByTestId('capture-tags-apply')).toHaveTextContent('Tags apply to new photos');
  });

  it('hides Select all for a single photo, and says "1 selected photo"', async () => {
    const user = userEvent.setup();
    engine.items = [item('a')];
    renderScreen({ mode: 'draft', entry: entryFixture() });
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'select a' }));

    expect(screen.getByTestId('capture-tags-apply')).toHaveTextContent(
      'Tags apply to 1 selected photo',
    );
  });

  it('applies a chip to the selected photos only, otherwise to untagged and retro photos', async () => {
    const user = userEvent.setup();
    engine.items = [item('a'), item('b'), item('c', { areaId: 'bath', areaSource: 'hand' })];
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByRole('button', { name: 'select b' }));
    await user.click(screen.getByText('capture area kitchen'));
    expect(engine.updateTags.mock.calls).toEqual([
      ['b', { areaId: 'kitchen', areaSource: 'hand' }],
    ]);

    engine.updateTags.mockClear();
    await user.click(screen.getByText('capture area bath'));
    expect(engine.updateTags.mock.calls.map((call) => call[0]).sort()).toEqual(['a', 'b']);
    expect(engine.updateTags.mock.calls.find((call) => call[0] === 'b')![1]).toEqual({
      areaId: 'bath',
      areaSource: 'retro',
    });
  });

  it('shows the waiting notice only once a draft exists', () => {
    const { unmount } = renderScreen();
    expect(screen.queryByTestId('waiting-notice')).not.toBeInTheDocument();
    unmount();

    renderScreen({ mode: 'draft', entry: entryFixture() });
    expect(screen.getByTestId('waiting-notice')).toBeInTheDocument();
  });

  it('removes a server photo through DELETE with the Undo toast, no confirm', async () => {
    const user = userEvent.setup();
    mockDeletePhoto.mockResolvedValue({ undo: { token: 'u_tok', expiresAt: 'x' } } as never);
    renderScreen({ mode: 'draft', entry: entryFixture(), photos: [photo('p1')] });

    await user.click(screen.getByRole('button', { name: 'remove p1' }));

    await waitFor(() => expect(mockDeletePhoto).toHaveBeenCalledWith('p1'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    expect(mockShowUndoToast.mock.calls[0]![0].message).toBe('Photo removed.');
    await waitFor(() => expect(screen.queryByTestId('tile-p1')).not.toBeInTheDocument());
  });

  it('a saved entry removes a photo the same way, without a confirm', async () => {
    const user = userEvent.setup();
    mockDeletePhoto.mockResolvedValue({ undo: { token: 'u_tok', expiresAt: 'x' } } as never);
    renderScreen({
      mode: 'saved',
      entry: entryFixture({ id: 'draft-1', status: 'saved' }),
      photos: [photo('p1')],
      history: ['/diary/draft-1/edit'],
    });

    await user.click(screen.getByRole('button', { name: 'remove p1' }));

    await waitFor(() => expect(mockDeletePhoto).toHaveBeenCalledWith('p1'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('removes a waiting photo through the engine and retries failed ones', async () => {
    const user = userEvent.setup();
    engine.items = [item('w1', { state: 'failed' })];
    renderScreen({ mode: 'draft', entry: entryFixture() });

    await user.click(screen.getByRole('button', { name: 'retry w1' }));
    await user.click(screen.getByRole('button', { name: 'remove w1' }));

    expect(engine.retry).toHaveBeenCalledWith('draft-1');
    expect(engine.remove).toHaveBeenCalledWith('w1');
  });

  it('opens the photo sheet and annotation from a tile', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture(), photos: [photo('p1')] });

    await user.click(screen.getByRole('button', { name: 'open p1' }));
    expect(screen.getByTestId('tag-sheet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'sheet annotate' }));
    expect(screen.getByTestId('annotate-dialog')).toHaveAttribute('data-photo', 'p1');
    await user.click(screen.getByRole('button', { name: 'annotate close' }));
    expect(screen.queryByTestId('annotate-dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'sheet close' }));
    expect(screen.queryByTestId('tag-sheet')).not.toBeInTheDocument();
  });

  it('shows Take photos on a coarse pointer and opens the camera with the same chips', async () => {
    const user = userEvent.setup();
    media.set('(pointer: coarse)', true);
    mockLiveSupported.mockReturnValue(true);
    renderScreen();

    await user.click(screen.getByTestId('capture-take-photos'));

    const camera = screen.getByTestId('rapid-camera');
    expect(within(camera).getByTestId('tag-chips-camera')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'camera done' }));
    expect(screen.queryByTestId('rapid-camera')).not.toBeInTheDocument();
  });

  it('hides Take photos on a fine pointer without a camera', () => {
    renderScreen();

    expect(screen.queryByTestId('capture-take-photos')).not.toBeInTheDocument();
    expect(screen.getByText('or drop photos here')).toBeInTheDocument();
  });

  it('marks the drop zone while files are dragged over it', () => {
    renderScreen();
    const zone = screen.getByTestId('capture-drop-zone');

    fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(zone.className).toMatch(/dropActive/);
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toMatch(/dropActive/);
  });

  it('adds only images from a drop', async () => {
    renderScreen();
    const zone = screen.getByTestId('capture-drop-zone');

    fireEvent.drop(zone, {
      dataTransfer: {
        types: ['Files'],
        files: [
          new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
          new File(['x'], 'b.pdf', { type: 'application/pdf' }),
        ],
      },
    });

    await waitFor(() => expect(engine.add).toHaveBeenCalledTimes(1));
    expect(engine.add.mock.calls[0]![0].map((f) => f.name)).toEqual(['a.jpg']);
  });

  it('guards the browser unload only while photos exist only in memory', () => {
    engine.items = [item('m1', { persisted: false })];
    const { unmount } = renderScreen({ mode: 'draft', entry: entryFixture() });
    const guarded = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(guarded);
    expect(guarded.defaultPrevented).toBe(true);
    unmount();

    engine.items = [item('d1', { persisted: true })];
    renderScreen({ mode: 'draft', entry: entryFixture() });
    const free = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });
});

describe('CaptureScreen: photos left by an earlier session', () => {
  it('offers Continue and Discard only on a new entry', async () => {
    const user = userEvent.setup();
    engine.orphans = [item('o1', { draftId: null }), item('o2', { draftId: null })];
    engine.items = [...engine.orphans];
    renderScreen();

    const row = screen.getByTestId('capture-orphans');
    expect(row).toHaveTextContent('2 photos from your last session are waiting.');
    expect(screen.queryByTestId('tile-o1')).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(engine.adoptOrphans).toHaveBeenCalledWith('draft-1'));
  });

  it('Discard drops them without a dialog', async () => {
    const user = userEvent.setup();
    engine.orphans = [item('o1', { draftId: null })];
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(engine.discardOrphans).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows no orphan row on a draft', () => {
    engine.orphans = [item('o1', { draftId: null })];
    renderScreen({ mode: 'draft', entry: entryFixture() });

    expect(screen.queryByTestId('capture-orphans')).not.toBeInTheDocument();
  });
});

describe('CaptureScreen: Enter key', () => {
  it('Enter in the title does not save the entry', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByTestId('capture-title-input'), 'Plaster{Enter}');
    await draftCreated();

    expect(mockPromote).not.toHaveBeenCalled();
    expect(screen.getByTestId('capture-title-input')).toHaveValue('Plaster');
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit');
  });

  it('Enter in another text input (inspector) does not save either', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture({ entryType: 'site_visit' }) });

    await user.type(screen.getByLabelText('Inspector'), 'Ines{Enter}');

    expect(mockPromote).not.toHaveBeenCalled();
  });

  it('Save still works from the keyboard', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByTestId('capture-title-input'), 'Plaster');
    await draftCreated();
    saveButton().focus();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(mockPromote).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/diary\/draft-1$/),
    );
  });

  it('Space on Save also saves', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture() });
    saveButton().focus();

    await user.keyboard(' ');

    await waitFor(() => expect(mockPromote).toHaveBeenCalledTimes(1));
  });

  it('Enter in the text area still adds a newline', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByTestId('capture-text-input'), 'one{Enter}two');

    expect(screen.getByTestId('capture-text-input')).toHaveValue('one\ntwo');
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it('Enter in the materials input still adds the material without saving', async () => {
    const user = userEvent.setup();
    renderScreen({ mode: 'draft', entry: entryFixture({ entryType: 'delivery' }) });

    await user.type(screen.getByPlaceholderText('Add a material'), 'Bricks{Enter}');

    expect(screen.getByRole('button', { name: 'Remove Bricks' })).toBeInTheDocument();
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it('Enter on a chip button is not swallowed', async () => {
    const user = userEvent.setup();
    renderScreen();
    const chip = screen.getByTestId('capture-workers-chip-2');
    chip.focus();

    await user.keyboard('{Enter}');

    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CaptureScreen: accessibility', () => {
  it('uses a form without native validation and never natively disables Save', () => {
    renderScreen();

    expect(saveButton().closest('form')).toHaveAttribute('novalidate');
    expect(saveButton()).toHaveAttribute('type', 'submit');
    expect(saveButton()).not.toBeDisabled();
  });

  it('labels the date, entry type and company groups and exposes a status region', () => {
    renderScreen();

    expect(screen.getByRole('group', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Entry type' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Company' })).toBeInTheDocument();
    expect(screen.getByTestId('sticky-action-bar-status')).toBeInTheDocument();
    expect(screen.getByLabelText('Title text')).toBe(screen.getByTestId('capture-title-input'));
    expect(screen.getByLabelText('Text (optional)')).toBe(screen.getByTestId('capture-text-input'));
  });
});

// ── Log now start (#2222) ───────────────────────────────────────────────────────────────────────

describe('CaptureScreen: ?start= from a Log now tile', () => {
  const originalDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

  function setDevices(devices: ReadonlyArray<{ kind: string }> | 'reject' | null) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value:
        devices === null
          ? undefined
          : {
              enumerateDevices: () =>
                devices === 'reject' ? Promise.reject(new Error('no')) : Promise.resolve(devices),
            },
    });
  }

  afterEach(() => {
    if (originalDevices) Object.defineProperty(navigator, 'mediaDevices', originalDevices);
    else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
  });

  interface StartOptions {
    start?: QuickLogMode | null;
    mode?: 'new' | 'draft' | 'saved';
    entry?: DiaryEntryDetail | null;
    url?: string;
    strict?: boolean;
  }

  function renderStart(options: StartOptions = {}) {
    const log = createRouterLog();
    const mode = options.mode ?? 'new';
    const tree = (
      <RecordingRouter
        entries={[
          {
            url: options.url ?? '/diary/new?areaId=bath&date=2026-10-10&start=note',
            state: { origin: { to: '/diary' } },
          },
        ]}
        log={log}
      >
        <CaptureScreen
          mode={mode}
          entry={options.entry ?? null}
          photos={[]}
          prefill={{ areaId: 'bath', date: '2026-10-10' }}
          breadcrumbs={<nav data-testid="crumbs" />}
          onDraftCreated={jest.fn()}
          start={options.start === undefined ? 'note' : options.start}
        />
      </RecordingRouter>
    );
    const view = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
    return { log, ...view };
  }

  const frame = () =>
    act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  it('note: sets the Note type, focuses the title and writes nothing', async () => {
    renderStart({ start: 'note' });
    await frame();

    expect(screen.getByTestId('capture-type-more')).toHaveTextContent('Note');
    expect(screen.getByTestId('capture-type-more')).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('capture-title-input')).toHaveFocus();
    expect(screen.queryByRole('heading', { level: 2, name: 'Site details' })).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('delivery: presses the Delivery chip, shows its fields and focuses the title', async () => {
    renderStart({ start: 'delivery', url: '/diary/new?start=delivery' });
    await frame();

    expect(screen.getByTestId('capture-type-delivery')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('capture-company')).toBeInTheDocument();
    expect(screen.getByTestId('capture-materials')).toBeInTheDocument();
    expect(screen.getByTestId('capture-title-input')).toHaveFocus();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('photo with a supported live camera on a coarse pointer opens it without a draft', async () => {
    media.set('(pointer: coarse)', true);
    mockLiveSupported.mockReturnValue(true);
    renderStart({ start: 'photo' });

    expect(await screen.findByTestId('rapid-camera')).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
  });

  it('photo with an unsupported camera focuses "Take photos"', async () => {
    media.set('(pointer: coarse)', true);
    mockLiveSupported.mockReturnValue(false);
    renderStart({ start: 'photo' });
    await frame();

    expect(screen.queryByTestId('rapid-camera')).toBeNull();
    expect(screen.getByTestId('capture-take-photos')).toHaveFocus();
  });

  it('photo with the camera denied this session focuses "Take photos"', async () => {
    media.set('(pointer: coarse)', true);
    mockLiveSupported.mockReturnValue(true);
    mockDenied.mockReturnValue(true);
    renderStart({ start: 'photo' });
    await frame();

    expect(screen.queryByTestId('rapid-camera')).toBeNull();
    expect(screen.getByTestId('capture-take-photos')).toHaveFocus();
  });

  it('photo on a fine pointer without a video input focuses the library button once devices are known', async () => {
    mockLiveSupported.mockReturnValue(true);
    setDevices([{ kind: 'audioinput' }]);
    renderStart({ start: 'photo' });
    await frame();

    await waitFor(() => expect(screen.getByTestId('capture-choose-photos')).toHaveFocus());
    expect(screen.queryByTestId('rapid-camera')).toBeNull();
    expect(screen.queryByTestId('capture-take-photos')).toBeNull();
  });

  it('photo on a fine pointer with a video input opens the camera after the device list resolves', async () => {
    mockLiveSupported.mockReturnValue(true);
    setDevices([{ kind: 'videoinput' }]);
    renderStart({ start: 'photo' });

    expect(await screen.findByTestId('rapid-camera')).toBeInTheDocument();
  });

  it('consumes start with exactly one REPLACE that keeps the other params and the origin', async () => {
    const { log } = renderStart({ start: 'note' });
    await frame();

    expect(log.actions).toEqual(['REPLACE /diary/new?areaId=bath&date=2026-10-10']);
    expect(log.states).toEqual([{ origin: { to: '/diary' } }]);
  });

  it('consumes a lone start down to a bare path', async () => {
    const { log } = renderStart({ start: 'delivery', url: '/diary/new?start=delivery' });
    await frame();

    expect(log.actions).toEqual(['REPLACE /diary/new']);
  });

  it('under StrictMode still replaces once and opens the camera once', async () => {
    media.set('(pointer: coarse)', true);
    mockLiveSupported.mockReturnValue(true);
    const { log } = renderStart({ start: 'photo', strict: true });

    expect(await screen.findAllByTestId('rapid-camera')).toHaveLength(1);
    await frame();
    expect(log.actions).toEqual(['REPLACE /diary/new?areaId=bath&date=2026-10-10']);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not reapply after the consume replace: closing the camera keeps it closed', async () => {
    media.set('(pointer: coarse)', true);
    mockLiveSupported.mockReturnValue(true);
    const user = userEvent.setup();
    renderStart({ start: 'photo' });
    await user.click(await screen.findByRole('button', { name: 'camera done' }));
    await frame();

    expect(screen.queryByTestId('rapid-camera')).toBeNull();
  });

  it('ignores start in draft mode: no replace, type from the entry', async () => {
    const { log } = renderStart({
      start: 'delivery',
      mode: 'draft',
      entry: entryFixture({ entryType: 'daily_log' }),
    });
    await frame();

    expect(log.actions).toEqual([]);
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('capture-type-delivery')).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores start in saved mode', async () => {
    const { log } = renderStart({
      start: 'note',
      mode: 'saved',
      entry: entryFixture({ entryType: 'daily_log', status: 'saved' }),
    });
    await frame();

    expect(log.actions).toEqual([]);
    expect(heading()).toHaveTextContent('Edit entry');
    expect(screen.queryByTestId('capture-type-more')).toBeNull();
    expect(screen.getByTestId('capture-title-input')).not.toHaveFocus();
  });

  it('does nothing without a start', async () => {
    const { log } = renderStart({ start: null, url: '/diary/new' });
    await frame();

    expect(log.actions).toEqual([]);
    expect(screen.getByTestId('capture-title-input')).not.toHaveFocus();
  });

  it('after a Note start, a same-date title match still offers "Add to that entry instead"', async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue({ matches: [match({ entryType: 'general_note' })] });
    renderStart({ start: 'note' });
    await frame();

    await user.type(screen.getByTestId('capture-title-input'), 'Screed');

    const button = await screen.findByTestId('capture-add-to-that', undefined, { timeout: 3000 });
    expect(button).toHaveTextContent('Add to that entry instead');
  });
});
