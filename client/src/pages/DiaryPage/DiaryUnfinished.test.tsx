/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as UnfinishedModule from './DiaryUnfinished.js';
import { readStickyTags, writeStickyTags } from '../../capture/stickyTags.js';
import { CaptureUploadsContext } from '../../capture/captureUploadsContext.js';
import type { CaptureItem } from '../../capture/captureTypes.js';
import { makeEngine } from '../../test/captureFixtures.js';
import type { FakeEngine } from '../../test/captureFixtures.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { ToastProvider, useToast } from '../../components/Toast/ToastContext.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockDeleteDiaryEntry = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
  deleteDiaryEntry: mockDeleteDiaryEntry,
}));

let DiaryUnfinished: typeof UnfinishedModule.DiaryUnfinished;
let engine: FakeEngine;

function draft(id: string, overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    entryDate: '2026-10-12',
    title: `Draft ${id}`,
    body: '',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'draft',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: null,
    createdAt: '2026-10-12T09:00:00.000Z',
    updatedAt: '2026-10-12T09:00:00.000Z',
    ...overrides,
  };
}

function response(items: DiaryEntrySummary[], totalItems = items.length): DiaryEntryListResponse {
  return {
    items,
    pagination: { page: 1, pageSize: 3, totalPages: 1, totalItems },
  };
}

function waitingItem(id: string, draftId: string): CaptureItem {
  return {
    id,
    draftId,
    source: 'camera',
    name: `${id}.jpg`,
    previewUrl: `blob:${id}`,
    state: 'waiting',
    progress: null,
    persisted: true,
    createdAt: '2026-10-12T09:00:00.000Z',
    areaId: null,
    orientationId: null,
  } as CaptureItem;
}

/** The provider renders no toasts itself; list them so the tests can read the message. */
function ToastList() {
  const { toasts } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id}>{`${toast.variant}: ${toast.message}`}</li>
      ))}
    </ul>
  );
}

function Harness({
  onShowAll,
  withHeading = true,
}: {
  onShowAll: () => void;
  withHeading?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <ToastList />
      {withHeading ? (
        <h1 ref={headingRef} tabIndex={-1} data-testid="page-h1">
          Site diary
        </h1>
      ) : null}
      <DiaryUnfinished onShowAll={onShowAll} headingRef={headingRef} />
    </>
  );
}

function setup(onShowAll: () => void = jest.fn(), withHeading = true) {
  const log = createRouterLog();
  render(
    <LocaleProvider>
      <ToastProvider>
        <CaptureUploadsContext value={engine.api}>
          <RecordingRouter entries={['/diary?q=slab']} log={log}>
            <Harness onShowAll={onShowAll} withHeading={withHeading} />
          </RecordingRouter>
        </CaptureUploadsContext>
      </ToastProvider>
    </LocaleProvider>,
  );
  return { log, onShowAll };
}

beforeEach(async () => {
  if (!DiaryUnfinished) ({ DiaryUnfinished } = await import('./DiaryUnfinished.js'));
  mockListDiaryEntries.mockReset();
  mockDeleteDiaryEntry.mockReset();
  mockDeleteDiaryEntry.mockResolvedValue(undefined);
  engine = makeEngine();
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

const section = () => screen.getByTestId('diary-unfinished');

describe('DiaryUnfinished: visibility', () => {
  it('requests the first three drafts of manual entries', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    setup();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
    expect(mockListDiaryEntries).toHaveBeenCalledWith({
      automatic: false,
      status: 'draft',
      page: 1,
      pageSize: 3,
    });
  });

  it('renders nothing without drafts', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    setup();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    expect(screen.queryByTestId('diary-unfinished')).toBeNull();
  });

  it('renders nothing when loading the drafts fails', async () => {
    mockListDiaryEntries.mockRejectedValue(new Error('network'));
    setup();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    expect(screen.queryByTestId('diary-unfinished')).toBeNull();
  });

  it('renders nothing while the drafts load', () => {
    mockListDiaryEntries.mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.queryByTestId('diary-unfinished')).toBeNull();
  });
});

describe('DiaryUnfinished: rows', () => {
  it('shows a labelled "Unfinished" section with one row per draft', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1'), draft('d2'), draft('d3')]));
    setup();
    expect(await screen.findByRole('heading', { level: 2, name: 'Unfinished' })).toBeVisible();
    expect(section()).toHaveAttribute('aria-labelledby', 'diary-unfinished-heading');
    expect(within(section()).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('diary-unfinished-d1')).toHaveTextContent('Draft d1');
    expect(screen.getByTestId('diary-unfinished-d1')).toHaveTextContent(/Oct(ober)? 12/);
  });

  it('falls back to "Type · day month" for an untitled draft', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1', { title: null })]));
    setup();
    expect(await screen.findByTestId('diary-unfinished-d1')).toHaveTextContent(
      /Daily log · Oct(ober)? 12/,
    );
  });

  it('Continue is a link to the capture screen carrying the origin, named after the draft', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    const { log } = setup();
    const link = await screen.findByTestId('diary-unfinished-d1-continue');
    expect(link).toHaveAttribute('href', '/diary/d1/edit');
    expect(link).toHaveAccessibleName('Continue Draft d1');
    expect(link).toHaveTextContent('Continue');
    fireEvent.click(link);
    expect(log.actions).toEqual(['PUSH /diary/d1/edit']);
    expect(JSON.stringify(log.states[0])).toContain('/diary?q=slab');
  });

  it('Discard is a button named after the draft', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    setup();
    const discard = await screen.findByTestId('diary-unfinished-d1-discard');
    expect(discard.tagName).toBe('BUTTON');
    expect(discard).toHaveAccessibleName('Discard Draft d1');
    expect(discard).toHaveTextContent('Discard');
  });

  it('shows no "Show all" for up to three drafts', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1'), draft('d2'), draft('d3')], 3));
    setup();
    await screen.findByTestId('diary-unfinished');
    expect(screen.queryByTestId('diary-unfinished-show-all')).toBeNull();
  });

  it('shows "Show all n" for more than three drafts and calls onShowAll', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1'), draft('d2'), draft('d3')], 7));
    const { onShowAll } = setup();
    const showAll = await screen.findByTestId('diary-unfinished-show-all');
    expect(showAll).toHaveTextContent('Show all 7');
    await userEvent.setup().click(showAll);
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});

describe('DiaryUnfinished: discard dialog', () => {
  async function openDiscard(id = 'd1') {
    const user = userEvent.setup();
    await user.click(await screen.findByTestId(`diary-unfinished-${id}-discard`));
    return user;
  }

  it('asks before discarding and names what is lost, with the photos of the draft', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1', { photoCount: 2 })]));
    setup();
    await openDiscard();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Discard this entry?');
    expect(dialog).toHaveTextContent('2 photos');
    expect(screen.getByTestId('diary-draft-discard-confirm')).toHaveTextContent('Discard');
    expect(screen.getByTestId('diary-draft-discard-cancel')).toHaveTextContent('Keep entry');
  });

  it('counts photos still waiting to upload into the lead and says so', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1', { photoCount: 1 })]));
    engine.items = [waitingItem('w1', 'd1'), waitingItem('w2', 'd1'), waitingItem('x', 'other')];
    setup();
    await openDiscard();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('3 photos');
    expect(dialog).toHaveTextContent(/waiting/i);
  });

  it('has no lead for a draft without photos', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1', { photoCount: 0 })]));
    setup();
    await openDiscard();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).not.toHaveTextContent(/photo/);
  });

  it('Keep entry closes the dialog and discards nothing', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    setup();
    const user = await openDiscard();
    await user.click(screen.getByTestId('diary-draft-discard-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(engine.discardDraft).not.toHaveBeenCalled();
    expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
    expect(screen.getByTestId('diary-unfinished-d1')).toBeInTheDocument();
  });

  it("after Keep entry focus is back on that draft's Discard button", async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    setup();
    const user = await openDiscard();
    await user.click(screen.getByTestId('diary-draft-discard-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByTestId('diary-unfinished-d1-discard')).toHaveFocus();
  });
});

describe('DiaryUnfinished: discarding', () => {
  async function confirm(id = 'd1') {
    const user = userEvent.setup();
    await user.click(await screen.findByTestId(`diary-unfinished-${id}-discard`));
    await user.click(await screen.findByTestId('diary-draft-discard-confirm'));
  }

  it('discards the waiting uploads before deleting the entry, then clears the sticky tags', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    writeStickyTags('d1', { areaId: 'area-1', orientationId: null });
    writeStickyTags('d2', { areaId: 'area-2', orientationId: null });
    const order: string[] = [];
    engine.discardDraft.mockImplementation(async () => {
      order.push('uploads');
    });
    mockDeleteDiaryEntry.mockImplementation(async () => {
      order.push('delete');
    });
    setup();
    await confirm();
    await waitFor(() => expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('d1'));
    expect(engine.discardDraft).toHaveBeenCalledWith('d1');
    expect(order).toEqual(['uploads', 'delete']);
    await waitFor(() => expect(readStickyTags('d1')).toBeNull());
    expect(readStickyTags('d2')).toEqual({ areaId: 'area-2', orientationId: null });
  });

  it('shows the "Draft discarded" toast and removes the row', async () => {
    mockListDiaryEntries
      .mockResolvedValueOnce(response([draft('d1'), draft('d2')]))
      .mockResolvedValue(response([draft('d2')]));
    setup();
    await confirm('d1');
    expect(await screen.findByText('success: Draft discarded')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('diary-unfinished-d1')).toBeNull());
    expect(screen.getByTestId('diary-unfinished-d2')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('reloads the drafts after a discard', async () => {
    mockListDiaryEntries
      .mockResolvedValueOnce(response([draft('d1')]))
      .mockResolvedValue(response([]));
    setup();
    await confirm();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(2));
  });

  it("moves focus to the next row's Continue after discarding", async () => {
    mockListDiaryEntries
      .mockResolvedValueOnce(response([draft('d1'), draft('d2'), draft('d3')]))
      .mockResolvedValue(response([draft('d2'), draft('d3')]));
    setup();
    await confirm('d1');
    await waitFor(() => expect(screen.getByTestId('diary-unfinished-d2-continue')).toHaveFocus());
  });

  it("moves focus to the previous row's Continue when the last row is discarded", async () => {
    mockListDiaryEntries
      .mockResolvedValueOnce(response([draft('d1'), draft('d2')]))
      .mockResolvedValue(response([draft('d1')]));
    setup();
    await confirm('d2');
    await waitFor(() => expect(screen.getByTestId('diary-unfinished-d1-continue')).toHaveFocus());
  });

  it('moves focus to the page heading when the only draft is discarded', async () => {
    mockListDiaryEntries
      .mockResolvedValueOnce(response([draft('d1')]))
      .mockResolvedValue(response([]));
    setup();
    await confirm();
    await waitFor(() => expect(screen.queryByTestId('diary-unfinished')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('page-h1')).toHaveFocus());
  });

  it('does not fail when there is no heading to focus after the last draft is discarded', async () => {
    mockListDiaryEntries
      .mockResolvedValueOnce(response([draft('d1')]))
      .mockResolvedValue(response([]));
    setup(jest.fn(), false);
    await confirm();
    await waitFor(() => expect(screen.queryByTestId('diary-unfinished')).toBeNull());
    expect(screen.getByTestId('toasts')).toHaveTextContent('Draft discarded');
  });

  it('ignores Escape while the discard is running', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    let release: () => void = () => {};
    engine.discardDraft.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    setup();
    await confirm();
    await waitFor(() => expect(engine.discardDraft).toHaveBeenCalled());
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('keeps the dialog open with the generic message when the delete fails', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    mockDeleteDiaryEntry.mockRejectedValue(new Error('boom'));
    setup();
    await confirm();
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Couldn't discard the entry. Try again.",
    );
    expect(screen.getByTestId('diary-unfinished-d1')).toBeInTheDocument();
    expect(screen.getByTestId('toasts')).toBeEmptyDOMElement();
  });

  it('translates an API error code from a failed delete', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    mockDeleteDiaryEntry.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw server text' }),
    );
    setup();
    await confirm();
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).not.toHaveTextContent('raw server text');
  });

  it('clears an earlier error when the dialog is opened again', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    mockDeleteDiaryEntry.mockRejectedValueOnce(new Error('boom'));
    setup();
    await confirm();
    await within(await screen.findByRole('alertdialog')).findByRole('alert');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('diary-draft-discard-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(screen.getByTestId('diary-unfinished-d1-discard'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('keeps the dialog open while the discard is running (Keep entry does nothing)', async () => {
    mockListDiaryEntries.mockResolvedValue(response([draft('d1')]));
    let release: () => void = () => {};
    engine.discardDraft.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    setup();
    await confirm();
    await waitFor(() => expect(engine.discardDraft).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discarding');
    fireEvent.click(screen.getByTestId('diary-draft-discard-cancel'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
