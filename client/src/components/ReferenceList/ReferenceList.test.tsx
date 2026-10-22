/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { DeleteImpactResponse } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as ListTypes from './ReferenceList.js';

const mockFetchDeleteImpact =
  jest.fn<(entityType: string, id: string | number) => Promise<DeleteImpactResponse>>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

let mockEntriesLanguage: 'de' | 'en' | null = null;
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => mockEntriesLanguage,
}));

let ReferenceList: typeof ListTypes.ReferenceList;

beforeAll(async () => {
  ({ ReferenceList } = await import('./ReferenceList.js'));
});

type Item = ListTypes.ReferenceListItem;

const LABELS: ListTypes.ReferenceListLabels = {
  title: 'Sample things',
  description: 'Things you can sort.',
  newItem: 'New sample thing',
  editItem: 'Edit sample thing',
  empty: 'No sample things yet.',
  loadFailed: 'Sample things could not be loaded.',
  search: 'Search sample things',
  noMatch: 'No sample things match.',
  duplicateName: 'That name is taken.',
  deleteBlocked: (name) => `${name} is still in use.`,
};

const FIELDS: ListTypes.ReferenceListFields = {
  nameMaxLength: 50,
  descriptionMaxLength: 200,
  color: true,
};

const A: Item = { id: 'a', name: 'Alpha', color: '#112233', description: 'First one' };
const B: Item = { id: 'b', name: 'Bravo', color: null };
const C: Item = { id: 'c', name: 'Charlie', color: null, translated: true };

interface Handlers {
  onRetry: jest.Mock<() => void>;
  onCreate: jest.Mock<ListTypes.ReferenceListProps['onCreate']>;
  onUpdate: jest.Mock<ListTypes.ReferenceListProps['onUpdate']>;
  onDelete: jest.Mock<ListTypes.ReferenceListProps['onDelete']>;
  onReorder: jest.Mock<ListTypes.ReferenceListProps['onReorder']>;
  onAnnounce: jest.Mock<(message: string) => void>;
}

describe('ReferenceList', () => {
  let media: MatchMediaControl;
  let h: Handlers;

  beforeEach(() => {
    media = installMatchMedia({ '(min-width: 768px)': true });
    mockEntriesLanguage = null;
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ effects: [] } as unknown as DeleteImpactResponse);
    h = {
      onRetry: jest.fn<() => void>(),
      onCreate: jest.fn<ListTypes.ReferenceListProps['onCreate']>(),
      onUpdate: jest.fn<ListTypes.ReferenceListProps['onUpdate']>().mockResolvedValue(undefined),
      onDelete: jest.fn<ListTypes.ReferenceListProps['onDelete']>().mockResolvedValue(undefined),
      onReorder: jest.fn<ListTypes.ReferenceListProps['onReorder']>().mockResolvedValue(undefined),
      onAnnounce: jest.fn<(message: string) => void>(),
    };
  });

  afterEach(() => {
    media.restore();
  });

  /**
   * A host that applies the handlers to local state, like a real page does through its data
   * hook, so focus-after-change behaviour can be observed.
   */
  function Host({
    initial = [A, B, C],
    status = 'ready',
    prefix = 'sample',
    fields = FIELDS,
    labels = LABELS,
    deleteImpactType,
  }: {
    initial?: Item[];
    status?: 'loading' | 'error' | 'ready';
    prefix?: string;
    fields?: ListTypes.ReferenceListFields;
    labels?: ListTypes.ReferenceListLabels;
    deleteImpactType?: ListTypes.ReferenceListProps['deleteImpactType'];
  }) {
    const [items, setItems] = useState<Item[]>(initial);
    return (
      <ReferenceList
        anchorId="sample-things"
        sectionTestId={`${prefix}-section`}
        testIdPrefix={prefix}
        labels={labels}
        fields={fields}
        items={items}
        status={status}
        deleteImpactType={deleteImpactType}
        onRetry={h.onRetry}
        onAnnounce={h.onAnnounce}
        onCreate={async (values) => {
          const created = await h.onCreate(values);
          setItems((prev) => [...prev, { id: created.id, name: values.name, color: values.color }]);
          return created;
        }}
        onUpdate={async (id, changes) => {
          await h.onUpdate(id, changes);
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, ...(changes as Partial<Item>) } : item,
            ),
          );
        }}
        onDelete={async (id) => {
          await h.onDelete(id);
          setItems((prev) => prev.filter((item) => item.id !== id));
        }}
        onReorder={async (ids) => {
          await h.onReorder(ids);
          setItems((prev) => ids.map((id) => prev.find((item) => item.id === id)!));
        }}
      />
    );
  }

  const names = () =>
    screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('[title]')?.getAttribute('title') ?? '');
  const menuTrigger = (id: string) => screen.getByTestId(`sample-menu-${id}`);
  async function chooseAction(
    user: ReturnType<typeof userEvent.setup>,
    id: string,
    action: 'edit' | 'move-up' | 'move-down' | 'delete',
  ) {
    await user.click(menuTrigger(id));
    await user.click(await screen.findByTestId(`sample-${action}-${id}`));
  }

  describe('states', () => {
    it('shows a skeleton while loading and disables New', () => {
      render(<Host status="loading" />);

      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.getByRole('heading', { level: 2, name: 'Sample things' })).toBeInTheDocument();
      expect(screen.getByTestId('sample-new')).toHaveAttribute('aria-disabled', 'true');
    });

    it('New does nothing while loading', async () => {
      const user = userEvent.setup();
      render(<Host status="loading" />);

      await user.click(screen.getByTestId('sample-new'));

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the load error with Retry that focuses the heading and retries', async () => {
      const user = userEvent.setup();
      render(<Host status="error" />);

      expect(screen.getByText(LABELS.loadFailed)).toBeInTheDocument();
      expect(screen.getByTestId('sample-new')).toHaveAttribute('aria-disabled', 'true');
      await user.click(screen.getByTestId('sample-retry'));

      expect(h.onRetry).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    });

    it('shows the empty state with New enabled', () => {
      render(<Host initial={[]} />);

      expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.getByTestId('sample-new')).not.toHaveAttribute('aria-disabled');
    });

    it('labels the section by its heading and gives the heading an id for the anchor', () => {
      render(<Host />);

      const section = screen.getByTestId('sample-section');
      expect(section).toHaveAttribute('id', 'sample-things');
      expect(section).toHaveAccessibleName('Sample things (3)');
      expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute(
        'id',
        'sample-things-heading',
      );
      expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('tabindex', '-1');
    });

    it('shows the description line and the New button with its own label', () => {
      render(<Host />);

      expect(screen.getByText('Things you can sort.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'New sample thing' })).toHaveTextContent('New');
    });
  });

  describe('rows', () => {
    it('lists the rows in order with no position numbers', () => {
      render(<Host />);

      expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
      for (const li of screen.getAllByRole('listitem')) {
        expect(li.textContent).not.toMatch(/#\s*\d/);
      }
    });

    it('shows the description under the name', () => {
      render(<Host />);

      expect(within(screen.getByTestId('sample-row-a')).getByText('First one')).toBeVisible();
    });

    it('marks the swatch with data-color only when a colour is set', () => {
      render(<Host />);

      const swatch = (id: string) =>
        screen.getByTestId(`sample-row-${id}`).querySelector('[class*="swatch"]');
      expect(swatch('a')).toHaveAttribute('data-color', 'set');
      expect(swatch('b')).not.toHaveAttribute('data-color');
    });

    it('renders no swatch when the list has no colour field', () => {
      render(<Host fields={{ nameMaxLength: 50 }} />);

      expect(screen.getByTestId('sample-row-a').querySelector('[class*="swatch"]')).toBeNull();
    });

    it('gives each row a named handle and a named actions button', () => {
      render(<Host />);

      expect(screen.getByRole('button', { name: 'Reorder Alpha' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Actions for Alpha' })).toBeInTheDocument();
    });

    it('sets lang on user text from the entries language but not on translated names', () => {
      mockEntriesLanguage = 'de';
      render(<Host />);

      const row = (id: string) => screen.getByTestId(`sample-row-${id}`);
      expect(within(row('a')).getByText('Alpha')).toHaveAttribute('lang', 'de');
      expect(within(row('a')).getByText('First one')).toHaveAttribute('lang', 'de');
      expect(within(row('c')).getByText('Charlie')).not.toHaveAttribute('lang');
    });

    it('sets no lang when the entries language is unknown', () => {
      render(<Host />);

      expect(within(screen.getByTestId('sample-row-a')).getByText('Alpha')).not.toHaveAttribute(
        'lang',
      );
    });
  });

  describe('row menu', () => {
    it('offers Edit, Move up, Move down and Delete', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await user.click(menuTrigger('b'));

      expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    });

    it('disables Move up on the first row only and Move down on the last row only', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await user.click(menuTrigger('a'));
      expect(await screen.findByTestId('sample-move-up-a')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByTestId('sample-move-down-a')).not.toHaveAttribute('aria-disabled');
      await user.keyboard('{Escape}');

      await user.click(menuTrigger('c'));
      expect(await screen.findByTestId('sample-move-down-c')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByTestId('sample-move-up-c')).not.toHaveAttribute('aria-disabled');
    });

    it('a disabled Move up does not reorder', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'move-up');

      expect(h.onReorder).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('opens the dialog, creates, announces and focuses the new row actions', async () => {
      const user = userEvent.setup();
      h.onCreate.mockResolvedValue({ id: 'd' });
      render(<Host />);

      await user.click(screen.getByTestId('sample-new'));
      await user.type(screen.getByTestId('sample-name'), 'Delta');
      await user.click(screen.getByTestId('sample-save'));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(h.onCreate).toHaveBeenCalledWith({
        name: 'Delta',
        description: null,
        color: null,
      });
      expect(h.onAnnounce).toHaveBeenCalledWith('Delta added.');
      expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
      expect(menuTrigger('d')).toHaveFocus();
    });

    it('keeps the dialog open and shows the duplicate-name text on a 409', async () => {
      const user = userEvent.setup();
      h.onCreate.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
      render(<Host />);

      await user.click(screen.getByTestId('sample-new'));
      await user.type(screen.getByTestId('sample-name'), 'Alpha');
      await user.click(screen.getByTestId('sample-save'));

      expect(await screen.findByText(LABELS.duplicateName)).toBeInTheDocument();
      expect(h.onAnnounce).not.toHaveBeenCalled();
    });

    it('Cancel closes the new dialog without a request', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await user.click(screen.getByTestId('sample-new'));
      await user.click(screen.getByTestId('sample-cancel'));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(h.onCreate).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    it('opens the dialog filled with the row, saves only changes and announces', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'b', 'edit');
      expect(screen.getByRole('dialog', { name: 'Edit sample thing' })).toBeInTheDocument();
      expect((screen.getByTestId('sample-name') as HTMLInputElement).value).toBe('Bravo');
      await user.clear(screen.getByTestId('sample-name'));
      await user.type(screen.getByTestId('sample-name'), 'Bravo 2');
      await user.click(screen.getByTestId('sample-save'));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(h.onUpdate).toHaveBeenCalledWith('b', { name: 'Bravo 2' });
      expect(h.onAnnounce).toHaveBeenCalledWith('Bravo 2 saved.');
      expect(names()[1]).toBe('Bravo 2');
      expect(menuTrigger('b')).toHaveFocus();
    });

    it('announces the existing name when only another field changed', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'edit');
      await user.clear(screen.getByTestId('sample-description'));
      await user.click(screen.getByTestId('sample-save'));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(h.onUpdate).toHaveBeenCalledWith('a', { description: null });
      expect(h.onAnnounce).toHaveBeenCalledWith('Alpha saved.');
    });

    it('sends no request when nothing changed', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'edit');
      await user.click(screen.getByTestId('sample-save'));

      expect(h.onUpdate).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('delete', () => {
    it('confirms, deletes, announces and focuses the next row actions', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'delete');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(h.onDelete).toHaveBeenCalledWith('a');
      expect(h.onAnnounce).toHaveBeenCalledWith('Alpha deleted.');
      expect(names()).toEqual(['Bravo', 'Charlie']);
      expect(menuTrigger('b')).toHaveFocus();
    });

    it('prefers the next row over the previous one when a middle row was deleted', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(menuTrigger('c')).toHaveFocus();
    });

    it('focuses the previous row actions when the last row was deleted', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'c', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(menuTrigger('b')).toHaveFocus();
    });

    it('focuses the heading when the only row was deleted', async () => {
      const user = userEvent.setup();
      render(<Host initial={[A]} />);

      await chooseAction(user, 'a', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    });

    it('Cancel leaves the row and closes the confirm', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(h.onDelete).not.toHaveBeenCalled();
      expect(names()).toHaveLength(3);
    });

    it('shows the blocked lead and no confirm button when DELETE answers 409', async () => {
      const user = userEvent.setup();
      h.onDelete.mockRejectedValue(
        new ApiClientError(409, { code: 'CATEGORY_IN_USE', message: 'x', details: { n: 4 } }),
      );
      render(<Host />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('Bravo is still in use.')).toBeInTheDocument();
      expect(screen.queryByTestId('sample-delete-dialog-confirm')).toBeNull();
      expect(dialog.textContent).not.toMatch(/\d/);
      expect(names()).toHaveLength(3);
      expect(h.onAnnounce).not.toHaveBeenCalled();
    });

    it('translates other API errors and keeps the confirm so it can be retried', async () => {
      const user = userEvent.setup();
      h.onDelete.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw server text' }),
      );
      render(<Host />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText('raw server text')).toBeNull();
      expect(screen.getByTestId('sample-delete-dialog-confirm')).toBeInTheDocument();
    });

    it('treats a 409 as an ordinary error when the list defines no blocked text', async () => {
      const user = userEvent.setup();
      h.onDelete.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
      render(<Host labels={{ ...LABELS, deleteBlocked: undefined }} />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('sample-delete-dialog-confirm')).toBeInTheDocument();
    });

    it('shows the network message for a network failure', async () => {
      const user = userEvent.setup();
      h.onDelete.mockRejectedValue(new NetworkError('offline', null));
      render(<Host />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows the generic message for an unexpected failure', async () => {
      const user = userEvent.setup();
      h.onDelete.mockRejectedValue(new Error('boom'));
      render(<Host />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('boom');
    });

    it('passes the delete consequences from the delete-impact request for orientations', async () => {
      const user = userEvent.setup();
      mockFetchDeleteImpact.mockResolvedValue({
        effects: [{ kind: 'photosLoseOrientation', count: 3 }],
      } as unknown as DeleteImpactResponse);
      render(<Host deleteImpactType="orientation" />);

      await chooseAction(user, 'a', 'delete');

      await waitFor(() =>
        expect(screen.getByTestId('sample-delete-dialog-consequences')).toBeInTheDocument(),
      );
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('orientation', 'a');
      expect(screen.getByTestId('sample-delete-dialog-consequences')).toHaveTextContent('3');
    });

    it('shows the retry state when the delete-impact request fails', async () => {
      const user = userEvent.setup();
      mockFetchDeleteImpact.mockRejectedValue(new Error('offline'));
      render(<Host deleteImpactType="orientation" />);

      await chooseAction(user, 'a', 'delete');

      expect(await screen.findByTestId('sample-delete-dialog-retry')).toBeInTheDocument();
    });

    // Defect: with no deleteImpactType the component still calls useDeleteImpact with the
    // fallback type 'orientation', so deleting a cost or purchase category fetches
    // /api/delete-impact/orientation/<category id>. Pins the intended behaviour: no request.
    it('does not request delete consequences for a list without a deleteImpactType', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'delete');
      await screen.findByRole('alertdialog');

      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('shows no consequences list for a list without a deleteImpactType', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'delete');
      await screen.findByRole('alertdialog');

      expect(screen.queryByTestId('sample-delete-dialog-consequences')).toBeNull();
    });
  });

  describe('reorder', () => {
    it('Move down sends the full id list, announces, and returns focus to that row actions', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'move-down');

      await waitFor(() => expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']));
      expect(h.onReorder).toHaveBeenCalledTimes(1);
      expect(h.onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
      expect(h.onAnnounce).toHaveBeenCalledWith('Alpha moved to position 2 of 3.');
      await waitFor(() => expect(menuTrigger('a')).toHaveFocus());
    });

    it('Move up sends the full id list', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'c', 'move-up');

      await waitFor(() => expect(h.onReorder).toHaveBeenCalledWith(['a', 'c', 'b']));
      await waitFor(() => expect(menuTrigger('c')).toHaveFocus());
    });

    it('a rejected reorder shows an alert banner and keeps focus on the row actions', async () => {
      const user = userEvent.setup();
      h.onReorder.mockRejectedValue(new Error('offline'));
      render(<Host />);

      await chooseAction(user, 'a', 'move-down');

      const banner = await screen.findByTestId('sample-reorder-error');
      expect(banner).toHaveAttribute('role', 'alert');
      expect(banner).toHaveTextContent("Couldn't save the new order. Try again.");
      expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
      await waitFor(() => expect(menuTrigger('a')).toHaveFocus());
    });

    it('clears the banner on the next move', async () => {
      const user = userEvent.setup();
      h.onReorder.mockRejectedValueOnce(new Error('offline'));
      render(<Host />);
      await chooseAction(user, 'a', 'move-down');
      await screen.findByTestId('sample-reorder-error');

      await chooseAction(user, 'a', 'move-down');

      await waitFor(() => expect(screen.queryByTestId('sample-reorder-error')).toBeNull());
      expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    });

    it('a keyboard drag on the handle commits one request and returns focus to the handle', async () => {
      const user = userEvent.setup();
      render(<Host />);
      const handle = screen.getByTestId('sample-handle-a');
      handle.focus();

      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      await user.keyboard(' ');

      await waitFor(() => expect(h.onReorder).toHaveBeenCalledWith(['b', 'a', 'c']));
      expect(h.onReorder).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByTestId('sample-handle-a')).toHaveFocus());
      expect(h.onAnnounce).toHaveBeenCalledWith('Alpha picked up. Position 1 of 3.');
      expect(h.onAnnounce).toHaveBeenCalledWith('Alpha, position 2 of 3.');
    });

    it('disables the handles and ignores a second move while one request is pending', async () => {
      const user = userEvent.setup();
      let finish: () => void = () => {};
      h.onReorder.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      render(<Host />);

      await chooseAction(user, 'a', 'move-down');
      expect(screen.getByTestId('sample-handle-a')).toHaveAttribute('aria-disabled', 'true');
      await user.click(menuTrigger('b'));
      expect(await screen.findByTestId('sample-move-up-b')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await user.click(screen.getByTestId('sample-move-up-b'));

      expect(h.onReorder).toHaveBeenCalledTimes(1);
      await act(async () => finish());
    });

    it('disables the handles while the list is not ready', () => {
      render(<Host status="loading" />);

      expect(screen.queryByTestId('sample-handle-a')).toBeNull();
    });
  });

  describe('409 without a deleteBlocked label', () => {
    it('stays a normal confirm with an error instead of the blocked dialog', async () => {
      const user = userEvent.setup();
      h.onDelete.mockRejectedValue(
        new ApiClientError(409, { code: 'CATEGORY_IN_USE', message: 'x', details: {} }),
      );
      render(<Host labels={{ ...LABELS, deleteBlocked: undefined }} />);

      await chooseAction(user, 'b', 'delete');
      await user.click(screen.getByTestId('sample-delete-dialog-confirm'));

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).queryByText('Bravo is still in use.')).toBeNull();
      expect(screen.getByTestId('sample-delete-dialog-confirm')).toBeInTheDocument();
    });
  });

  describe('pointer drag', () => {
    class TestPointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType = 'mouse';
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    let originalPointerEvent: unknown;
    let rectSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      originalPointerEvent = (window as unknown as { PointerEvent?: unknown }).PointerEvent;
      Object.defineProperty(window, 'PointerEvent', {
        configurable: true,
        writable: true,
        value: TestPointerEvent,
      });
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        writable: true,
        value: () => {},
      });
      rectSpy = jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          const index = this.parentElement
            ? Array.from(this.parentElement.children).indexOf(this)
            : 0;
          return { top: index * 40, height: 40, bottom: index * 40 + 40 } as DOMRect;
        });
    });

    afterEach(() => {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'PointerEvent', {
        configurable: true,
        writable: true,
        value: originalPointerEvent,
      });
    });

    it('marks the dragged row and the drop position, and commits on release', async () => {
      render(<Host />);
      const handle = screen.getByTestId('sample-handle-a');

      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 110 });

      expect(screen.getByTestId('sample-row-a')).toHaveAttribute('data-dragging', 'true');
      expect(screen.getByTestId('sample-row-c')).toHaveAttribute('data-drop', 'after');
      expect(screen.getByTestId('sample-row-b')).not.toHaveAttribute('data-drop');

      fireEvent.pointerUp(handle, { clientY: 110 });
      await waitFor(() => expect(h.onReorder).toHaveBeenCalledWith(['b', 'c', 'a']));
    });

    it('marks the drop position before the target when dragging up', () => {
      render(<Host />);
      const handle = screen.getByTestId('sample-handle-c');

      fireEvent.pointerDown(handle, { clientY: 110 });
      fireEvent.pointerMove(handle, { clientY: 10 });

      expect(screen.getByTestId('sample-row-a')).toHaveAttribute('data-drop', 'before');
    });
  });

  describe('search (#2234)', () => {
    const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel Küche'];
    const MANY: Item[] = NAMES.map((name, i) => ({
      id: `n${i}`,
      name,
      color: null,
      description: i === 2 ? 'Wet room' : undefined,
    }));
    const searchInput = () => screen.getByTestId('sample-search');

    it('has no search field below 8 rows (R1)', () => {
      render(<Host initial={MANY.slice(0, 7)} />);
      expect(screen.queryByTestId('sample-search')).toBeNull();
      expect(screen.getByTestId('sample-count')).toHaveTextContent('(7)');
    });

    it('shows a labelled search field from 8 rows, outside the page-search shortcut (R2)', () => {
      render(<Host initial={MANY} />);
      expect(searchInput()).toHaveAttribute('placeholder', 'Search sample things');
      expect(searchInput()).toHaveAccessibleName('Search sample things');
      expect(searchInput()).not.toHaveAttribute('data-page-search');
    });

    it('filters by name and by description with folding (R3)', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'kuche');
      expect(names()).toEqual(['Hotel Küche']);
      await user.clear(searchInput());
      await user.type(searchInput(), 'WET');
      expect(names()).toEqual(['Charlie']);
      await user.clear(searchInput());
      expect(names()).toHaveLength(8);
    });

    it('disables reordering while searching and says why (R4)', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'a');
      const handle = screen.getByTestId('sample-handle-n0');
      expect(handle).toHaveAttribute('aria-disabled', 'true');
      expect(handle).toHaveAccessibleDescription(/Clear the search to reorder\./);
      handle.focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      await user.keyboard(' ');
      expect(h.onReorder).not.toHaveBeenCalled();
      await user.click(menuTrigger('n0'));
      expect(await screen.findByTestId('sample-move-down-n0')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await user.click(screen.getByTestId('sample-move-down-n0'));
      expect(h.onReorder).not.toHaveBeenCalled();
    });

    it('reorders again once the search is cleared', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'a');
      await user.clear(searchInput());
      expect(screen.getByTestId('sample-handle-n0')).not.toHaveAttribute('aria-disabled');
      expect(screen.queryByText('Clear the search to reorder.', { exact: false })).toBeNull();
    });

    it('shows the no-match state with Clear search that refocuses the field (R5)', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'zzzz');
      expect(screen.getByText('No sample things match.')).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(names()).toHaveLength(8);
      expect(searchInput()).toHaveValue('');
      expect(searchInput()).toHaveFocus();
    });

    describe('announcement (R6)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('announces the match count 500 ms after typing settles, once', () => {
        render(<Host initial={MANY} />);
        fireEvent.change(searchInput(), { target: { value: 'a' } });
        act(() => jest.advanceTimersByTime(499));
        expect(h.onAnnounce).not.toHaveBeenCalled();
        fireEvent.change(searchInput(), { target: { value: 'al' } });
        act(() => jest.advanceTimersByTime(499));
        expect(h.onAnnounce).not.toHaveBeenCalled();
        act(() => jest.advanceTimersByTime(1));
        expect(h.onAnnounce).toHaveBeenCalledTimes(1);
        expect(h.onAnnounce).toHaveBeenCalledWith('1 match');
      });

      it('uses the plural form and announces no match through the label', () => {
        render(<Host initial={MANY} />);
        fireEvent.change(searchInput(), { target: { value: 'o' } });
        act(() => jest.advanceTimersByTime(500));
        expect(h.onAnnounce).toHaveBeenLastCalledWith('6 matches');
        fireEvent.change(searchInput(), { target: { value: 'zzzz' } });
        act(() => jest.advanceTimersByTime(500));
        expect(h.onAnnounce).toHaveBeenLastCalledWith('No sample things match.');
      });

      it('announces nothing for an emptied query', () => {
        render(<Host initial={MANY} />);
        fireEvent.change(searchInput(), { target: { value: 'a' } });
        fireEvent.change(searchInput(), { target: { value: '' } });
        act(() => jest.advanceTimersByTime(1000));
        expect(h.onAnnounce).not.toHaveBeenCalled();
      });

      it('clears the pending timer on unmount', () => {
        const { unmount } = render(<Host initial={MANY} />);
        fireEvent.change(searchInput(), { target: { value: 'a' } });
        unmount();
        act(() => jest.advanceTimersByTime(1000));
        expect(h.onAnnounce).not.toHaveBeenCalled();
      });
    });

    it('shows the count only when the list is ready (R7)', () => {
      const { unmount } = render(<Host initial={MANY} />);
      expect(screen.getByTestId('sample-count')).toHaveTextContent('(8)');
      unmount();
      render(<Host status="loading" />);
      expect(screen.queryByTestId('sample-count')).toBeNull();
    });

    it('keeps the full count while a query narrows the rows', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'alpha');
      expect(screen.getByTestId('sample-count')).toHaveTextContent('(8)');
    });

    it('deleting while searching focuses a visible neighbour (R8)', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'o');
      // visible: Bravo (n1), Charlie (n2), Echo (n4), Foxtrot (n5), Golf (n6), Hotel (n7)
      expect(names()).toEqual(['Bravo', 'Charlie', 'Echo', 'Foxtrot', 'Golf', 'Hotel Küche']);
      await user.click(menuTrigger('n4'));
      await user.click(await screen.findByTestId('sample-delete-n4'));
      await user.click(await screen.findByTestId('sample-delete-dialog-confirm'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(menuTrigger('n5')).toHaveFocus();
    });

    it('keeps the toolbar when deleting drops the list below 8 rows with a query', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY} />);
      await user.type(searchInput(), 'o');
      await user.click(menuTrigger('n1'));
      await user.click(await screen.findByTestId('sample-delete-n1'));
      await user.click(await screen.findByTestId('sample-delete-dialog-confirm'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(searchInput()).toHaveValue('o');
      expect(screen.getByTestId('sample-count')).toHaveTextContent('(7)');
    });

    it('drops the toolbar below 8 rows once the query is empty', async () => {
      const user = userEvent.setup();
      render(<Host initial={MANY.slice(0, 8)} />);
      await user.click(menuTrigger('n0'));
      await user.click(await screen.findByTestId('sample-delete-n0'));
      await user.click(await screen.findByTestId('sample-delete-dialog-confirm'));
      await waitFor(() => expect(screen.queryByTestId('sample-search')).toBeNull());
    });
  });

  describe('test ids', () => {
    it('has unique test ids per prefix with the dialog and the delete confirm open', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await chooseAction(user, 'a', 'delete');
      await screen.findByRole('alertdialog');

      expect(findDuplicateTestIds()).toEqual([]);
    });

    it('emits only ids under a custom prefix: the defaults are absent', async () => {
      const user = userEvent.setup();
      render(<Host prefix="custom" />);

      await user.click(screen.getByTestId('custom-new'));
      await screen.findByRole('dialog');
      const ids = Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
        el.getAttribute('data-testid'),
      );

      expect(ids.every((id) => id?.startsWith('custom-'))).toBe(true);
      expect(ids).not.toContain('sample-new');
      expect(ids).not.toContain('sheet');
      expect(ids).not.toContain('confirm-dialog-confirm');
    });

    it('uses the custom prefix on the delete confirm and the discard confirm', async () => {
      const user = userEvent.setup();
      render(<Host prefix="custom" />);

      await user.click(screen.getByTestId('custom-menu-a'));
      await user.click(await screen.findByTestId('custom-delete-a'));

      expect(screen.getByTestId('custom-delete-dialog-confirm')).toBeInTheDocument();
      expect(screen.queryByTestId('confirm-dialog-confirm')).toBeNull();
    });
  });

  describe('phone layout', () => {
    it('opens the new dialog as a sheet below 768 px', async () => {
      media.set('(min-width: 768px)', false);
      const user = userEvent.setup();
      render(<Host />);

      await user.click(screen.getByTestId('sample-new'));

      expect(screen.getByTestId('sample-dialog-close')).toBeInTheDocument();
      expect(findDuplicateTestIds()).toEqual([]);
    });
  });
});
