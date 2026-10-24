import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { UndoToken } from '@cornerstone/shared';
import type * as ListModule from './RelatedList.js';
import type { RelatedListAction, RelatedListProps, RelatedListRow } from './types.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { ToastProvider, useToast } from '../Toast/ToastContext.js';

const mockUndoChange = jest.fn<(token: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/undoApi.js', () => ({
  undoChange: mockUndoChange,
}));

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

let RelatedList: (typeof ListModule)['RelatedList'];

const TOKEN: UndoToken = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

// ─── Fixtures: one per relation named in AC1 ────────────────────────────────

interface Relation {
  readonly name: string;
  readonly title: string;
  readonly emptyMessage: string;
  readonly rows: RelatedListRow[];
  readonly editable: boolean;
}

const OFFERS_AND_INVOICES_ROWS: RelatedListRow[] = [
  {
    id: 'i1',
    title: 'Invoice 2026-001',
    to: '/project/invoices/i1',
    badges: <span data-testid="badge-i1">Paid</span>,
    amount: <span data-testid="amount-i1">€1,200.00</span>,
  },
  { id: 'i2', title: 'Offer A', to: '/project/invoices/i2', amount: '€800.00' },
];

const RELATIONS: Relation[] = [
  {
    name: 'dependencies',
    title: 'Dependencies',
    emptyMessage: 'No dependencies yet.',
    editable: true,
    rows: [
      {
        id: 'd1',
        title: 'Pour foundation',
        to: '/project/work-items/d1',
        facts: 'Finish to start, +2 days',
      },
      { id: 'd2', title: 'Frame walls', to: '/project/work-items/d2', facts: 'Start to start' },
    ],
  },
  {
    name: 'milestones',
    title: 'Milestones',
    emptyMessage: 'No milestones yet.',
    editable: false,
    rows: [
      { id: 'm1', title: 'Roof closed', to: '/project/milestones/m1', facts: '12 Mar' },
      { id: 'm2', title: 'Windows in', to: '/project/milestones/m2', facts: '30 Apr' },
    ],
  },
  {
    name: 'offers and invoices',
    title: 'Offers and invoices',
    emptyMessage: 'No offers or invoices yet.',
    editable: false,
    rows: OFFERS_AND_INVOICES_ROWS,
  },
  {
    name: 'payments',
    title: 'Payments',
    emptyMessage: 'No payments yet.',
    editable: true,
    rows: [
      { id: 'p1', title: 'Deposit 1', amount: '€300.00', facts: '1 Feb' },
      { id: 'p2', title: 'Deposit 2', amount: '€200.00', facts: '1 Mar' },
    ],
  },
  {
    name: 'contact persons',
    title: 'Contact persons',
    emptyMessage: 'No contact persons yet.',
    editable: true,
    rows: [
      { id: 'c1', title: 'Pat Sample', facts: 'Foreman' },
      { id: 'c2', title: 'Alex Example', facts: 'Office' },
    ],
  },
  {
    name: 'covered items',
    title: 'Covered items',
    emptyMessage: 'No covered items yet.',
    editable: false,
    rows: [
      { id: 'h1', title: 'Heat pump', to: '/project/purchases/h1' },
      { id: 'h2', title: 'Solar panels', to: '/project/purchases/h2' },
    ],
  },
];

const makeRows = (n: number): RelatedListRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`,
    title: `Row ${i + 1}`,
    to: `/project/things/r${i + 1}`,
  }));

// ─── Harness ─────────────────────────────────────────────────────────────────

type HostProps = Partial<Omit<RelatedListProps, 'rows' | 'onRemove'>> & {
  initialRows?: RelatedListRow[] | null;
  removeFails?: boolean;
  noRemove?: boolean;
  noRestored?: boolean;
  noToastView?: boolean;
  /** The host keeps the row listed after Remove (it reloads later). */
  keepRowsOnRemove?: boolean;
  onRemoveCalled?: (row: RelatedListRow) => void;
  onRestoredSpy?: (row: RelatedListRow) => void;
};

function ToastView() {
  const { toasts, undoToast } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id} data-dedupe={toast.dedupeKey}>
          <span>{toast.message}</span>
          {toast.variant === 'undo' && (
            <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Host(props: HostProps) {
  const [original] = useState<RelatedListRow[] | null>(
    props.initialRows === undefined ? makeRows(3) : props.initialRows,
  );
  const [rows, setRows] = useState<RelatedListRow[] | null>(original);
  return (
    <>
      <RelatedList
        title={props.title ?? 'Things'}
        rows={rows}
        emptyMessage={props.emptyMessage ?? 'Nothing here yet.'}
        testId={props.testId ?? 'rel'}
        {...(props.headingLevel ? { headingLevel: props.headingLevel } : {})}
        {...(props.loadError !== undefined ? { loadError: props.loadError } : {})}
        {...(props.onRetry ? { onRetry: props.onRetry } : {})}
        {...(props.action ? { action: props.action } : {})}
        {...(props.onEdit ? { onEdit: props.onEdit } : {})}
        {...(props.collapsedLimit ? { collapsedLimit: props.collapsedLimit } : {})}
        {...(props.linkState ? { linkState: props.linkState } : {})}
        {...(props.noRemove
          ? {}
          : {
              onRemove: async (row: RelatedListRow) => {
                props.onRemoveCalled?.(row);
                if (props.removeFails) throw new Error('boom');
                if (!props.keepRowsOnRemove) {
                  setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
                }
                return TOKEN;
              },
            })}
        {...(props.noRestored
          ? {}
          : {
              onRestored: async (row: RelatedListRow) => {
                props.onRestoredSpy?.(row);
                const order = original ?? [];
                setRows((prev) =>
                  [...(prev ?? []), row].sort(
                    (a, b) =>
                      order.findIndex((r) => r.id === a.id) - order.findIndex((r) => r.id === b.id),
                  ),
                );
              },
            })}
      />
      {props.noToastView ? null : <ToastView />}
    </>
  );
}

function renderHost(props: HostProps = {}, extra?: ReactNode) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/project/work-items/wi-1']}>
        <OriginProbe />
        <Host {...props} />
        {extra}
      </MemoryRouter>
    </ToastProvider>,
  );
}

const trigger = (id: string, testId = 'rel') => screen.getByTestId(`${testId}-actions-${id}`);

async function removeRow(id: string, testId = 'rel') {
  fireEvent.click(trigger(id, testId));
  const item = await screen.findByTestId(`${testId}-remove-${id}`);
  await act(async () => {
    fireEvent.click(item);
  });
}

async function clickUndo() {
  const button = await screen.findByTestId('toast-undo');
  await act(async () => {
    fireEvent.click(button);
  });
}

const buttonAction = (
  onActivate = jest.fn<(opener: HTMLButtonElement) => void>(),
  label = 'Add thing',
  disabledReason?: string,
): RelatedListAction => ({
  kind: 'button',
  label,
  onActivate,
  ...(disabledReason ? { disabledReason } : {}),
});

beforeEach(async () => {
  mockUndoChange.mockReset();
  mockUndoChange.mockResolvedValue({ restored: [] });
  ({ RelatedList } = (await import('./RelatedList.js')) as typeof ListModule);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RelatedList: one fixture per relation', () => {
  it.each(RELATIONS)(
    '$name: shows the count in the h2, rows, the Edit icon only when editable, and Remove with Undo',
    async ({ title, rows, editable, emptyMessage }) => {
      const onEdit = jest.fn<NonNullable<RelatedListProps['onEdit']>>();
      renderHost({
        title,
        emptyMessage,
        initialRows: rows,
        ...(editable ? { onEdit } : {}),
      });

      expect(screen.getByRole('heading', { level: 2, name: `${title} (2)` })).toBeInTheDocument();
      const first = rows[0] as RelatedListRow;
      const row = screen.getByTestId(`rel-row-${first.id}`);
      expect(within(row).getByText(first.title)).toBeInTheDocument();
      if (editable) {
        const edit = screen.getByRole('button', { name: `Edit ${first.title}` });
        fireEvent.click(edit);
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: first.id }), edit);
      } else {
        expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
      }

      await removeRow(first.id);

      expect(screen.getByRole('heading', { level: 2, name: `${title} (1)` })).toBeInTheDocument();
      expect(screen.getByTestId('toasts')).toHaveTextContent(
        `${first.title} removed from ${title}.`,
      );
    },
  );

  it('renders badges, facts and amount of an offers-and-invoices row', () => {
    renderHost({ title: 'Offers and invoices', initialRows: OFFERS_AND_INVOICES_ROWS });

    const row = screen.getByTestId('rel-row-i1');
    expect(within(row).getByTestId('badge-i1')).toHaveTextContent('Paid');
    expect(within(row).getByTestId('amount-i1')).toHaveTextContent('€1,200.00');
    expect(screen.getByText('€800.00')).toBeInTheDocument();
  });

  it('shows a row without a target as plain text, not a link', () => {
    renderHost({ initialRows: [{ id: 'p1', title: 'Deposit 1' }] });

    expect(screen.getByText('Deposit 1')).toBeInTheDocument();
    expect(screen.queryByTestId('rel-link-p1')).toBeNull();
  });
});

describe('RelatedList: heading, loading and error', () => {
  it('renders an h3 when headingLevel is 3', () => {
    renderHost({ headingLevel: 3 });

    expect(screen.getByRole('heading', { level: 3, name: 'Things (3)' })).toBeInTheDocument();
  });

  it('hides the count and the action while loading and shows no list', () => {
    renderHost({ initialRows: null, action: buttonAction() });

    expect(screen.getByRole('heading', { name: 'Things' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add thing' })).toBeNull();
    expect(within(screen.getByTestId('rel')).queryByRole('list')).toBeNull();
  });

  it('shows (0) with the empty state when there are no rows', () => {
    renderHost({ initialRows: [], emptyMessage: 'No things yet.' });

    expect(screen.getByRole('heading', { name: 'Things (0)' })).toBeInTheDocument();
    expect(screen.getByText('No things yet.')).toBeInTheDocument();
  });

  it('hides the count, the action and the rows on a load error, and Retry calls onRetry', () => {
    const onRetry = jest.fn();
    renderHost({ loadError: 'Could not load things.', onRetry, action: buttonAction() });

    expect(screen.getByRole('heading', { name: 'Things' })).toBeInTheDocument();
    expect(screen.getByText('Could not load things.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add thing' })).toBeNull();
    expect(within(screen.getByTestId('rel')).queryByRole('list')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the Retry button when the host gives no onRetry', () => {
    renderHost({ loadError: 'Could not load things.' });

    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('RelatedList: row link and origin', () => {
  it('navigates to the row target carrying the origin state', () => {
    renderHost({
      initialRows: makeRows(1),
      linkState: { origin: { to: '/project/work-items/wi-1', name: 'Task A' } },
    });

    fireEvent.click(screen.getByTestId('rel-link-r1'));

    expect(probedPath()).toBe('/project/things/r1');
    expect(probedOrigin()).toEqual({ to: '/project/work-items/wi-1', name: 'Task A' });
  });
});

describe('RelatedList: action button', () => {
  it('shows the action in the header while rows exist and calls onActivate with the opener', () => {
    const onActivate = jest.fn<(opener: HTMLButtonElement) => void>();
    renderHost({ action: buttonAction(onActivate) });

    const add = screen.getByRole('button', { name: 'Add thing' });
    expect(add).not.toHaveAttribute('aria-expanded');
    fireEvent.click(add);

    expect(onActivate).toHaveBeenCalledWith(add);
  });

  it('moves the action into the empty state while empty (no second header button)', () => {
    const onActivate = jest.fn<(opener: HTMLButtonElement) => void>();
    renderHost({ initialRows: [], action: buttonAction(onActivate) });

    expect(screen.queryByTestId('rel-add')).toBeNull();
    const empty = screen.getByRole('button', { name: 'Add thing' });
    fireEvent.click(empty);

    expect(onActivate).toHaveBeenCalledWith(empty);
  });

  it('shows no action control when the host gives none', () => {
    renderHost({ initialRows: [] });

    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
  });

  it('uses aria-disabled with the reason as description and does not activate', () => {
    const onActivate = jest.fn<(opener: HTMLButtonElement) => void>();
    renderHost({ action: buttonAction(onActivate, 'Add thing', 'Save the task first.') });

    const add = screen.getByTestId('rel-add');
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).not.toBeDisabled();
    expect(add).toHaveAccessibleDescription('Save the task first.');
    fireEvent.click(add);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('keeps a disabled picker action closed', () => {
    renderHost({
      action: {
        kind: 'picker',
        label: 'Link thing',
        disabledReason: 'Nothing to link.',
        renderPicker: () => <input aria-label="Pick thing" />,
      },
    });

    fireEvent.click(screen.getByTestId('rel-add'));

    expect(screen.queryByLabelText('Pick thing')).toBeNull();
  });
});

describe('RelatedList: inline picker action', () => {
  function pickerAction(): RelatedListAction {
    return {
      kind: 'picker',
      label: 'Link thing',
      renderPicker: ({ close }) => (
        <div>
          <input aria-label="Pick thing" />
          <button type="button" onClick={close}>
            Done picking
          </button>
        </div>
      ),
    };
  }

  it('opens the picker inline, marks the button expanded and closes it with Escape', () => {
    renderHost({ action: pickerAction() });
    const link = screen.getByRole('button', { name: 'Link thing' });
    expect(link).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(link);

    const input = screen.getByLabelText('Pick thing');
    expect(link).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByLabelText('Pick thing')).toBeNull();
    expect(link).toHaveFocus();
  });

  it('ignores other keys and an Escape another handler already claimed', () => {
    renderHost({ action: pickerAction() });
    fireEvent.click(screen.getByRole('button', { name: 'Link thing' }));
    const input = screen.getByLabelText('Pick thing');

    fireEvent.keyDown(input, { key: 'a' });
    const claimed = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    claimed.preventDefault();
    act(() => {
      input.dispatchEvent(claimed);
    });

    expect(screen.getByLabelText('Pick thing')).toBeInTheDocument();
  });

  it('closes through the render api and returns focus to the opener', () => {
    renderHost({ action: pickerAction() });
    const link = screen.getByRole('button', { name: 'Link thing' });
    fireEvent.click(link);

    fireEvent.click(screen.getByRole('button', { name: 'Done picking' }));

    expect(screen.queryByLabelText('Pick thing')).toBeNull();
    expect(link).toHaveFocus();
  });

  it('returns focus to the empty-state button when the picker was opened from there', () => {
    renderHost({ initialRows: [], action: pickerAction() });
    fireEvent.click(screen.getByRole('button', { name: 'Link thing' }));

    fireEvent.keyDown(screen.getByLabelText('Pick thing'), { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Link thing' })).toHaveFocus();
  });
});

describe('RelatedList: row menu and Remove', () => {
  it('lists host items before Remove', () => {
    const onHost = jest.fn();
    renderHost({
      initialRows: [
        {
          id: 'r1',
          title: 'Row 1',
          menuItems: [{ id: 'open', label: 'Open elsewhere', onClick: onHost }],
        },
      ],
    });

    fireEvent.click(trigger('r1'));
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);

    expect(items).toEqual(['Open elsewhere', 'Remove']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open elsewhere' }));
    expect(onHost).toHaveBeenCalledTimes(1);
  });

  it('names the trigger "<title>, actions"', () => {
    renderHost({ initialRows: makeRows(1) });

    expect(screen.getByRole('button', { name: 'Row 1, actions' })).toBe(trigger('r1'));
  });

  it('omits the menu when the host gives no onRemove and the row has no host items', () => {
    renderHost({ noRemove: true, initialRows: makeRows(1) });

    expect(screen.queryByTestId('rel-actions-r1')).toBeNull();
  });

  it('omits Remove for a row with removable false', () => {
    renderHost({
      initialRows: [
        { id: 'r1', title: 'Row 1', removable: false },
        { id: 'r2', title: 'Row 2' },
      ],
    });

    expect(screen.queryByTestId('rel-actions-r1')).toBeNull();
    expect(trigger('r2')).toBeInTheDocument();
  });

  it('hides the Edit icon for a row with editable false', () => {
    renderHost({
      onEdit: jest.fn(),
      initialRows: [
        { id: 'r1', title: 'Row 1', editable: false },
        { id: 'r2', title: 'Row 2' },
      ],
    });

    expect(screen.queryByTestId('rel-edit-r1')).toBeNull();
    expect(screen.getByTestId('rel-edit-r2')).toBeInTheDocument();
  });

  it('removes at once without a confirmation dialog, with an Undo toast keyed per row', async () => {
    const onRemoveCalled = jest.fn();
    renderHost({ onRemoveCalled });

    await removeRow('r2');

    expect(onRemoveCalled).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByTestId('rel-row-r2')).toBeNull();
    expect(screen.getByText('Row 2 removed from Things.')).toBeInTheDocument();
    expect(screen.getByTestId('toasts').querySelector('li')).toHaveAttribute(
      'data-dedupe',
      'rel-remove-r2',
    );
  });

  it('Undo calls undoChange with the token, then onRestored, and the row comes back', async () => {
    const onRestoredSpy = jest.fn();
    renderHost({ onRestoredSpy });
    await removeRow('r2');

    await clickUndo();

    await waitFor(() => expect(screen.getByTestId('rel-row-r2')).toBeInTheDocument());
    expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
    expect(onRestoredSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
    expect(mockUndoChange.mock.invocationCallOrder[0] as number).toBeLessThan(
      onRestoredSpy.mock.invocationCallOrder[0] as number,
    );
  });

  it('works without an onRestored handler', async () => {
    renderHost({ noRestored: true });
    await removeRow('r1');

    await clickUndo();

    await waitFor(() => expect(mockUndoChange).toHaveBeenCalledWith('tok-1'));
  });

  it('shows a FormError and keeps the row when Remove fails, with no Undo toast', async () => {
    renderHost({ removeFails: true });

    await removeRow('r1');

    expect(screen.getByRole('alert')).toHaveTextContent('Row 1 could not be removed. Try again.');
    expect(screen.getByTestId('rel-row-r1')).toBeInTheDocument();
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Things (3)' })).toBeInTheDocument();
  });

  it('adds no second status node of its own (the toast region is the announcement)', async () => {
    renderHost();

    await removeRow('r1');

    expect(screen.getByTestId('rel').querySelector('[role="status"]')).toBeNull();
  });
});

describe('RelatedList: focus after Remove', () => {
  it('moves focus to the next row’s menu trigger', async () => {
    renderHost();

    await removeRow('r1');

    expect(trigger('r2')).toHaveFocus();
  });

  it('moves focus to the previous row’s trigger when the last row is removed', async () => {
    renderHost();

    await removeRow('r3');

    expect(trigger('r2')).toHaveFocus();
  });

  it('moves focus to the empty-state button when the only row is removed', async () => {
    renderHost({ initialRows: makeRows(1), action: buttonAction() });

    await removeRow('r1');

    expect(screen.getByRole('button', { name: 'Add thing' })).toHaveFocus();
  });

  it('moves focus to the heading when the only row goes and there is no action', async () => {
    renderHost({ initialRows: makeRows(1) });

    await removeRow('r1');

    expect(screen.getByRole('heading', { name: 'Things (0)' })).toHaveFocus();
  });
});

describe('RelatedList: focus after Undo', () => {
  it('returns focus to the restored row’s trigger when focus is on body', async () => {
    renderHost({ initialRows: makeRows(2) });
    await removeRow('r1');
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.body).toHaveFocus();

    await clickUndo();

    await waitFor(() => expect(trigger('r1')).toHaveFocus());
  });

  it('returns focus to the restored row’s trigger when focus is inside the list', async () => {
    renderHost({ initialRows: makeRows(2) });
    await removeRow('r1');
    expect(trigger('r2')).toHaveFocus();

    await clickUndo();

    await waitFor(() => expect(trigger('r1')).toHaveFocus());
  });

  it('does not steal focus the user moved elsewhere', async () => {
    renderHost(
      { initialRows: makeRows(2) },
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>,
    );
    await removeRow('r1');
    screen.getByTestId('elsewhere').focus();

    await clickUndo();

    await waitFor(() => expect(screen.getByTestId('rel-row-r1')).toBeInTheDocument());
    expect(screen.getByTestId('elsewhere')).toHaveFocus();
  });
});

describe('RelatedList: Undo after the list is gone', () => {
  // The toast region outlives the list: only the list is unmounted
  function Page({ show, keep = false }: { show: boolean; keep?: boolean }) {
    return (
      <ToastProvider>
        <MemoryRouter initialEntries={['/project/work-items/wi-1']}>
          {show ? <Host initialRows={makeRows(2)} noToastView keepRowsOnRemove={keep} /> : null}
          <ToastView />
          <button type="button" data-testid="elsewhere">
            elsewhere
          </button>
        </MemoryRouter>
      </ToastProvider>
    );
  }

  it('throws nothing and moves no focus when the toast Undo runs after the list unmounted', async () => {
    const view = render(<Page show />);
    await removeRow('r1');
    view.rerender(<Page show={false} />);
    screen.getByTestId('elsewhere').focus();

    await expect(clickUndo()).resolves.toBeUndefined();

    expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
    expect(screen.getByTestId('elsewhere')).toHaveFocus();
  });

  it('finds no trigger and moves no focus when the row is still listed but the list is gone', async () => {
    const view = render(<Page show keep />);
    await removeRow('r1');
    view.rerender(<Page show={false} keep />);
    screen.getByTestId('elsewhere').focus();

    await expect(clickUndo()).resolves.toBeUndefined();

    expect(screen.getByTestId('elsewhere')).toHaveFocus();
  });
});

describe('RelatedList: Show all', () => {
  it('shows ten rows and a Show all (n) button when there are more than ten', () => {
    renderHost({ initialRows: makeRows(13) });

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    const showAll = screen.getByRole('button', { name: 'Show all (13)' });
    expect(showAll).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: 'Things (13)' })).toBeInTheDocument();
  });

  it('expands in place and focuses the first newly shown row’s link', () => {
    renderHost({ initialRows: makeRows(13) });

    fireEvent.click(screen.getByRole('button', { name: 'Show all (13)' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(13);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
    expect(screen.getByTestId('rel-link-r11')).toHaveFocus();
  });

  it('focuses the first newly shown row’s menu when that row is plain text', () => {
    renderHost({
      initialRows: Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, title: `Text ${i}` })),
      collapsedLimit: 2,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show all (4)' }));

    expect(screen.getByTestId('rel-actions-t2')).toHaveFocus();
  });

  it('shows no Show all at exactly the limit', () => {
    renderHost({ initialRows: makeRows(10) });

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});

describe('RelatedList: expanded list and changing hosts', () => {
  it('keeps the list expanded and focuses the next row when a row is removed after Show all', async () => {
    renderHost({ initialRows: makeRows(12) });
    fireEvent.click(screen.getByRole('button', { name: 'Show all (12)' }));
    expect(screen.getByTestId('rel-link-r11')).toHaveFocus();

    await removeRow('r12');

    expect(within(screen.getByTestId('rel')).getAllByRole('listitem')).toHaveLength(11);
    expect(trigger('r11')).toHaveFocus();
  });

  function bare(rows: RelatedListRow[], action?: RelatedListAction) {
    const element = (r: RelatedListRow[], a?: RelatedListAction) => (
      <ToastProvider>
        <MemoryRouter>
          <RelatedList
            title="Things"
            rows={r}
            emptyMessage="Nothing."
            testId="rel"
            {...(a ? { action: a } : {})}
          />
        </MemoryRouter>
      </ToastProvider>
    );
    const view = render(element(rows, action));
    return {
      rerender: (r: RelatedListRow[], a?: RelatedListAction) => view.rerender(element(r, a)),
    };
  }

  const picker: RelatedListAction = {
    kind: 'picker',
    label: 'Link thing',
    renderPicker: () => <input aria-label="Pick thing" />,
  };

  it('drops an open picker when the host removes the picker action', () => {
    const view = bare(makeRows(1), picker);
    fireEvent.click(screen.getByRole('button', { name: 'Link thing' }));
    expect(screen.getByLabelText('Pick thing')).toBeInTheDocument();

    view.rerender(makeRows(1));

    expect(screen.queryByLabelText('Pick thing')).toBeNull();
  });

  it('drops an open picker when the host swaps it for a button action', () => {
    const view = bare(makeRows(1), picker);
    fireEvent.click(screen.getByRole('button', { name: 'Link thing' }));

    view.rerender(makeRows(1), buttonAction());

    expect(screen.queryByLabelText('Pick thing')).toBeNull();
  });

  it('focuses the empty-state button on Escape when the header button that opened the picker is gone', () => {
    const view = bare(makeRows(1), picker);
    fireEvent.click(screen.getByRole('button', { name: 'Link thing' }));

    view.rerender([], picker);
    fireEvent.keyDown(screen.getByLabelText('Pick thing'), { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Link thing' })).toHaveFocus();
  });
});
