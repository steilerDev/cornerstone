/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import type { AttentionRow } from '@cornerstone/shared';
import * as realApiClient from '../../lib/apiClient.js';
import type * as ListModule from './AttentionList.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { renderInAttentionProviders } from '../../test/attentionHarness.js';
import { makeRow } from '../../test/attentionFixtures.js';
import { item, makeEngine } from '../../test/captureFixtures.js';
import { readStickyTags, writeStickyTags } from '../../capture/stickyTags.js';
import type { CaptureItem } from '../../capture/captureTypes.js';

const mockPatch = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const mockPost = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const mockDel = jest.fn<(path: string) => Promise<unknown>>();
const mockGet = jest.fn<(path: string) => Promise<unknown>>();

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  ...realApiClient,
  patch: mockPatch,
  post: mockPost,
  del: mockDel,
  get: mockGet,
}));

let AttentionList: typeof ListModule.AttentionList;
let media: MatchMediaControl;

const onRemove = jest.fn<(key: string, reason: 'done' | 'notNow') => void>();
const onRefresh = jest.fn<() => void>();
const onNavigate = jest.fn<() => void>();

interface HostProps {
  initial: AttentionRow[];
  initialLimit?: number;
  totalCount?: number;
  showGroups?: boolean;
  withHeading?: boolean;
  withNavigate?: boolean;
}

function Host({
  initial,
  initialLimit,
  totalCount,
  showGroups,
  withHeading = true,
  withNavigate,
}: HostProps) {
  const [rows, setRows] = useState(initial);
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <>
      {withHeading ? (
        <h2 ref={headingRef} tabIndex={-1} data-testid="heading">
          Needs attention
        </h2>
      ) : null}
      <AttentionList
        rows={rows}
        today="2026-03-10"
        initialLimit={initialLimit}
        totalCount={totalCount}
        showGroups={showGroups}
        onRemove={(key, reason) => {
          onRemove(key, reason);
          setRows((prev) => prev.filter((row) => row.key !== key));
        }}
        onRefresh={onRefresh}
        onNavigate={withNavigate ? onNavigate : undefined}
        emptyFocusRef={headingRef}
        listId="list-1"
        testIdPrefix="needs-attention"
      />
    </>
  );
}

function renderList(props: HostProps, engine = makeEngine()) {
  return renderInAttentionProviders(<Host {...props} />, { engine });
}

const lateTasks = (n: number): AttentionRow[] =>
  Array.from({ length: n }, (_, i) =>
    makeRow('N1', {
      subject: { type: 'work_item', id: `t${i}`, label: `Task ${i}`, area: null },
      link: { route: 'workItem', params: { id: `t${i}` }, query: {} },
    }),
  );

const rowTid = (row: AttentionRow) => `needs-attention-row-${row.key}`;

beforeEach(async () => {
  if (!AttentionList) ({ AttentionList } = await import('./AttentionList.js'));
  mockPatch.mockReset();
  mockPost.mockReset();
  mockDel.mockReset();
  mockGet.mockReset();
  // The Discard dialog loads what the delete would also change (nothing by default).
  mockGet.mockResolvedValue({ entityType: 'diary_entry', id: 'de-2', effects: [] });
  onRemove.mockReset();
  onRefresh.mockReset();
  onNavigate.mockReset();
  mockPost.mockResolvedValue({ key: 'k', snoozedUntil: '2026-03-17' });
  mockDel.mockResolvedValue(undefined);
  media = installMatchMedia({ '(min-width: 1024px)': true });
  sessionStorage.clear();
});

afterEach(() => {
  media.restore();
  sessionStorage.clear();
});

describe('AttentionList: rendering', () => {
  it('renders nothing for an empty list', () => {
    renderList({ initial: [] });
    expect(screen.queryByTestId('needs-attention-list')).toBeNull();
    expect(screen.queryByTestId('needs-attention-show-all')).toBeNull();
  });

  it('renders one list item per row under the given list id and test-id prefix', () => {
    const rows = [makeRow('N1'), makeRow('N3')];
    renderList({ initial: rows });
    const list = screen.getByTestId('needs-attention-list');
    expect(list).toHaveAttribute('id', 'list-1');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId(rowTid(rows[0] as AttentionRow))).toBeInTheDocument();
    expect(screen.getByTestId(rowTid(rows[1] as AttentionRow))).toBeInTheDocument();
  });

  it('D-01: a milestone row in the list links to the milestone page', () => {
    const row = makeRow('N3');
    renderList({ initial: [row] });
    expect(screen.getByTestId(`${rowTid(row)}-link`)).toHaveAttribute(
      'href',
      '/project/milestones/7',
    );
  });

  it('passes showGroups through to group rows', () => {
    const group = makeRow('N2', {
      subject: { type: 'group', id: 'n2', label: null, area: null },
      params: {
        kind: 'group',
        plannedStartDate: '2026-03-06',
        items: [
          {
            id: 'g1',
            label: 'Task G1',
            area: null,
            daysLate: 2,
            holdsUp: { count: 0, startingWithin14Days: 0 },
          },
        ],
      } as never,
    });
    renderList({ initial: [group], showGroups: false });
    expect(screen.queryByTestId(`${rowTid(group)}-group-toggle`)).toBeNull();
    expect(screen.getByTestId(`${rowTid(group)}-item-g1`)).toBeVisible();
  });

  it('passes onNavigate through to link actions', () => {
    const row = makeRow('N1');
    renderList({ initial: [row], withNavigate: true });
    fireEvent.click(screen.getByTestId(`${rowTid(row)}-reschedule`));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('Reschedule links to the Constraints section of the task page', () => {
    const row = makeRow('N1');
    renderList({ initial: [row] });
    expect(screen.getByTestId(`${rowTid(row)}-reschedule`).getAttribute('href')).toMatch(
      /\/project\/work-items\/wi-1#constraints$/,
    );
  });
});

describe('AttentionList: Show all', () => {
  it('shows only the initial rows and a "Show all (n)" button', () => {
    renderList({ initial: lateTasks(10), initialLimit: 8, totalCount: 10 });
    expect(
      within(screen.getByTestId('needs-attention-list')).getAllByRole('listitem'),
    ).toHaveLength(8);
    const button = screen.getByTestId('needs-attention-show-all');
    expect(button).toHaveTextContent('Show all (10)');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'list-1');
  });

  it('D-02: Show all lists every row, none sampled, in the original order', () => {
    const rows = lateTasks(12);
    renderList({ initial: rows, initialLimit: 8, totalCount: 12 });
    fireEvent.click(screen.getByTestId('needs-attention-show-all'));
    const items = within(screen.getByTestId('needs-attention-list')).getAllByRole('listitem');
    expect(items).toHaveLength(12);
    rows.forEach((row) => expect(screen.getByTestId(rowTid(row))).toBeInTheDocument());
    const links = rows.map((row) => screen.getByTestId(`${rowTid(row)}-link`).textContent);
    expect(links).toEqual(rows.map((_, i) => `Task ${i}`));
  });

  it('toggles to "Show fewer", announces each state and keeps focus on the button', () => {
    renderList({ initial: lateTasks(10), initialLimit: 8, totalCount: 10 });
    const button = screen.getByTestId('needs-attention-show-all');
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Show fewer');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 10 items');
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Show all (10)');
    expect(screen.getByRole('status')).toHaveTextContent('Showing the first 8 items');
    expect(
      within(screen.getByTestId('needs-attention-list')).getAllByRole('listitem'),
    ).toHaveLength(8);
    expect(button).toHaveFocus();
  });

  it('falls back to the row count when no total is given', () => {
    renderList({ initial: lateTasks(5), initialLimit: 3 });
    expect(screen.getByTestId('needs-attention-show-all')).toHaveTextContent('Show all (5)');
  });

  it('has no button when the rows fit the limit or no limit is set', () => {
    renderList({ initial: lateTasks(8), initialLimit: 8 });
    expect(screen.queryByTestId('needs-attention-show-all')).toBeNull();
  });

  it('has no button without a limit', () => {
    renderList({ initial: lateTasks(20) });
    expect(screen.queryByTestId('needs-attention-show-all')).toBeNull();
    expect(
      within(screen.getByTestId('needs-attention-list')).getAllByRole('listitem'),
    ).toHaveLength(20);
  });

  it('keeps an always-mounted status region', () => {
    renderList({ initial: lateTasks(2) });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('AttentionList: focus after a row leaves', () => {
  const notNow = (row: AttentionRow) =>
    fireEvent.click(screen.getByTestId(`${rowTid(row)}-not-now`));
  const titleLink = (row: AttentionRow) => screen.getByTestId(`${rowTid(row)}-link`);

  it('moves focus to the title of the next row', async () => {
    const rows = lateTasks(3);
    renderList({ initial: rows });
    notNow(rows[1] as AttentionRow);
    await waitFor(() => expect(screen.queryByTestId(rowTid(rows[1] as AttentionRow))).toBeNull());
    expect(titleLink(rows[2] as AttentionRow)).toHaveFocus();
    expect(onRemove).toHaveBeenCalledWith((rows[1] as AttentionRow).key, 'notNow');
  });

  it('moves focus to the title of the previous row when the last row leaves', async () => {
    const rows = lateTasks(3);
    renderList({ initial: rows });
    notNow(rows[2] as AttentionRow);
    await waitFor(() => expect(screen.queryByTestId(rowTid(rows[2] as AttentionRow))).toBeNull());
    expect(titleLink(rows[1] as AttentionRow)).toHaveFocus();
  });

  it('moves focus to the section heading when the only row leaves', async () => {
    const rows = lateTasks(1);
    renderList({ initial: rows });
    notNow(rows[0] as AttentionRow);
    await waitFor(() => expect(screen.queryByTestId('needs-attention-list')).toBeNull());
    expect(screen.getByTestId('heading')).toHaveFocus();
  });

  it('does not fail when the heading is missing', async () => {
    const rows = lateTasks(1);
    renderList({ initial: rows, withHeading: false });
    notNow(rows[0] as AttentionRow);
    await waitFor(() => expect(screen.queryByTestId('needs-attention-list')).toBeNull());
    expect(document.body).toHaveFocus();
  });

  it('keeps the row and its focus when Not now fails', async () => {
    mockPost.mockRejectedValue(new Error('network'));
    const rows = lateTasks(2);
    renderList({ initial: rows });
    const button = screen.getByTestId(`${rowTid(rows[0] as AttentionRow)}-not-now`);
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByTestId('toast-item-error')).toBeInTheDocument();
    expect(screen.getByTestId(rowTid(rows[0] as AttentionRow))).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('refetches silently after Not now and Undo calls the delete then refetches again', async () => {
    const rows = lateTasks(2);
    renderList({ initial: rows });
    notNow(rows[0] as AttentionRow);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/attention/not-now', {
      key: (rows[0] as AttentionRow).key,
    });
    fireEvent.click(await screen.findByTestId('toast-undo'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2));
    expect(mockDel).toHaveBeenCalledWith(
      `/attention/not-now/${encodeURIComponent((rows[0] as AttentionRow).key)}`,
    );
  });

  it('moves focus on after a status change removes the row', async () => {
    mockPatch.mockResolvedValue({ invoice: { id: 'inv-1' } });
    const first = makeRow('N4');
    const second = makeRow('N5');
    renderList({ initial: [first, second] });
    fireEvent.click(screen.getByTestId(`${rowTid(first)}-mark_paid`));
    await waitFor(() => expect(screen.queryByTestId(rowTid(first))).toBeNull());
    expect(titleLink(second)).toHaveFocus();
    expect(onRemove).toHaveBeenCalledWith(first.key, 'done');
  });
});

describe('AttentionList: discarding an unfinished log', () => {
  const draftRow = () => makeRow('H1');
  const other = () => makeRow('H4');

  const open = (row: AttentionRow) => fireEvent.click(screen.getByTestId(`${rowTid(row)}-discard`));

  it('asks before discarding and Keep entry closes the dialog without discarding', async () => {
    const row = draftRow();
    const { engine } = renderList({ initial: [row] });
    open(row);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Discard this entry?');
    fireEvent.click(screen.getByTestId('needs-attention-discard-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(engine.discardDraft).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('discards the uploads, deletes the entry, clears tags, removes the row and focuses the next', async () => {
    const row = draftRow();
    const next = other();
    writeStickyTags('de-2', { areaId: 'a', orientationId: null });
    const order: string[] = [];
    const engine = makeEngine();
    engine.discardDraft.mockImplementation(async () => {
      order.push('uploads');
    });
    mockDel.mockImplementation(async () => {
      order.push('delete');
    });
    renderList({ initial: [row, next] }, engine);
    open(row);
    fireEvent.click(await screen.findByTestId('needs-attention-discard-confirm'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(row.key, 'done'));
    expect(order).toEqual(['uploads', 'delete']);
    expect(mockDel).toHaveBeenCalledWith('/diary-entries/de-2');
    expect(readStickyTags('de-2')).toBeNull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('success: Draft discarded')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(screen.getByTestId(`${rowTid(next)}-link`)).toHaveFocus());
  });

  it('moves focus to the heading after the only draft is discarded', async () => {
    const row = draftRow();
    renderList({ initial: [row] });
    open(row);
    fireEvent.click(await screen.findByTestId('needs-attention-discard-confirm'));
    await waitFor(() => expect(screen.getByTestId('heading')).toHaveFocus());
  });

  function waitingItems(count: number): CaptureItem[] {
    return Array.from({ length: count }, (_v, i) =>
      item(`p${i}`, { draftId: 'de-2', state: 'waiting' }),
    );
  }

  it('asks the server what discarding the diary entry also changes', async () => {
    const row = draftRow();
    renderList({ initial: [row] });
    open(row);
    await screen.findByRole('alertdialog');
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/delete-impact/diary_entry/de-2'));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('does not ask before the Discard dialog is opened', () => {
    renderList({ initial: [draftRow()] });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('lists the consequences the server returns and keeps Discard disabled while loading', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGet.mockReturnValue(new Promise((r) => (resolve = r)));
    const row = draftRow();
    renderList({ initial: [row] });
    open(row);
    const confirm = await screen.findByTestId('needs-attention-discard-confirm');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    resolve({
      entityType: 'diary_entry',
      id: 'de-2',
      effects: [{ kind: 'photosLoseArea', count: 2 }],
    });
    expect(await screen.findByTestId('needs-attention-discard-consequences')).toHaveTextContent(
      '2',
    );
    expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('names one photo still waiting in the dialog (singular wording)', async () => {
    const row = draftRow();
    const engine = makeEngine();
    engine.items = waitingItems(1);
    renderList({ initial: [row] }, engine);
    open(row);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '1 photo still waiting to upload is deleted too.',
    );
  });

  it('names several photos still waiting in the dialog (plural wording)', async () => {
    const row = draftRow();
    const engine = makeEngine();
    engine.items = waitingItems(3);
    renderList({ initial: [row] }, engine);
    open(row);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '3 photos still waiting to upload are deleted too.',
    );
  });

  it('counts only the waiting photos of this draft', async () => {
    const row = draftRow();
    const engine = makeEngine();
    engine.items = [...waitingItems(2), item('other', { draftId: 'someone-else' })];
    renderList({ initial: [row] }, engine);
    open(row);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '2 photos still waiting to upload are deleted too.',
    );
  });

  it('shows no photo lead without waiting photos', async () => {
    const row = draftRow();
    renderList({ initial: [row] });
    open(row);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).not.toHaveTextContent('still waiting');
  });

  it('keeps the dialog open with the generic message when the delete fails', async () => {
    mockDel.mockRejectedValue(new Error('boom'));
    const row = draftRow();
    renderList({ initial: [row] });
    open(row);
    fireEvent.click(await screen.findByTestId('needs-attention-discard-confirm'));
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Couldn't discard the entry. Try again.",
    );
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId(rowTid(row))).toBeInTheDocument();
  });

  it('translates an API error code and clears it when the dialog is reopened', async () => {
    mockDel.mockRejectedValueOnce(
      new realApiClient.ApiClientError(404, { code: 'NOT_FOUND', message: 'raw server text' }),
    );
    const row = draftRow();
    renderList({ initial: [row] });
    open(row);
    fireEvent.click(await screen.findByTestId('needs-attention-discard-confirm'));
    const dialog = await screen.findByRole('alertdialog');
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The requested resource was not found.');
    expect(alert).not.toHaveTextContent('raw server text');
    fireEvent.click(screen.getByTestId('needs-attention-discard-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    open(row);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
