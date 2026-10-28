/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SubtaskResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type * as SubtasksApiTypes from '../../lib/subtasksApi.js';
import type * as CardModule from './TaskChecklistCard.js';

const mockCreateSubtask = jest.fn<typeof SubtasksApiTypes.createSubtask>();
const mockUpdateSubtask = jest.fn<typeof SubtasksApiTypes.updateSubtask>();
const mockDeleteSubtask = jest.fn<typeof SubtasksApiTypes.deleteSubtask>();
const mockReorderSubtasks = jest.fn<typeof SubtasksApiTypes.reorderSubtasks>();
jest.unstable_mockModule('../../lib/subtasksApi.js', () => ({
  createSubtask: mockCreateSubtask,
  updateSubtask: mockUpdateSubtask,
  deleteSubtask: mockDeleteSubtask,
  reorderSubtasks: mockReorderSubtasks,
}));

let Card: typeof CardModule;
const onChanged = jest.fn<() => Promise<void>>();
const onEmptied = jest.fn<() => void>();

const item = (id: string, title: string, isCompleted = false): SubtaskResponse => ({
  id,
  title,
  isCompleted,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const ITEMS = [item('s1', 'Order gravel'), item('s2', 'Book digger', true), item('s3', 'Mark out')];

function renderCard(items: readonly SubtaskResponse[] = ITEMS) {
  const addInputRef = createRef<HTMLInputElement>();
  const view = render(
    <MemoryRouter>
      <Card.TaskChecklistCard
        workItemId="wi-1"
        items={items}
        onChanged={onChanged}
        addInputRef={addInputRef}
        onEmptied={onEmptied}
      />
    </MemoryRouter>,
  );
  return { ...view, addInputRef };
}

async function openMenu(title: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${title}` }));
}
async function choose(title: string, action: string) {
  await openMenu(title);
  await act(async () => {
    fireEvent.click(await screen.findByRole('menuitem', { name: action }));
  });
}

describe('TaskChecklistCard', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockCreateSubtask,
      mockUpdateSubtask,
      mockDeleteSubtask,
      mockReorderSubtasks,
      onChanged,
      onEmptied,
    ]) {
      mock.mockReset();
    }
    mockCreateSubtask.mockResolvedValue({} as never);
    mockUpdateSubtask.mockResolvedValue({} as never);
    mockDeleteSubtask.mockResolvedValue(undefined);
    mockReorderSubtasks.mockResolvedValue({} as never);
    onChanged.mockResolvedValue(undefined);
    if (!Card) Card = await import('./TaskChecklistCard.js');
  });

  it('lists the items with their checked state', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Checklist' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Order gravel' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Book digger' })).toBeChecked();
  });

  it('checks and unchecks an item and refreshes', async () => {
    renderCard();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Order gravel' }));
    await waitFor(() =>
      expect(mockUpdateSubtask).toHaveBeenCalledWith('wi-1', 's1', { isCompleted: true }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Book digger' }));
    await waitFor(() =>
      expect(mockUpdateSubtask).toHaveBeenLastCalledWith('wi-1', 's2', { isCompleted: false }),
    );
  });

  describe('add', () => {
    it('ignores a blank title', async () => {
      renderCard();
      fireEvent.change(screen.getByTestId('task-checklist-add-input'), {
        target: { value: '   ' },
      });
      fireEvent.click(screen.getByTestId('task-checklist-add'));
      expect(mockCreateSubtask).not.toHaveBeenCalled();
    });

    it('adds the trimmed title, clears the field, refreshes and refocuses the field', async () => {
      const { addInputRef } = renderCard();
      const input = screen.getByTestId('task-checklist-add-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  Pay deposit  ' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('task-checklist-add'));
      });
      expect(mockCreateSubtask).toHaveBeenCalledWith('wi-1', { title: 'Pay deposit' });
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(input.value).toBe('');
      expect(input).toBe(addInputRef.current);
      expect(input).toHaveFocus();
    });

    it('adds fine when the field ref is not attached', async () => {
      const detached = { current: null } as React.RefObject<HTMLInputElement | null>;
      Object.defineProperty(detached, 'current', { get: () => null, set: () => undefined });
      render(
        <MemoryRouter>
          <Card.TaskChecklistCard
            workItemId="wi-1"
            items={ITEMS}
            onChanged={onChanged}
            addInputRef={detached}
            onEmptied={onEmptied}
          />
        </MemoryRouter>,
      );
      fireEvent.change(screen.getByTestId('task-checklist-add-input'), { target: { value: 'x' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('task-checklist-add'));
      });
      expect(mockCreateSubtask).toHaveBeenCalledWith('wi-1', { title: 'x' });
    });

    it('keeps the text and shows the translated error when adding fails', async () => {
      mockCreateSubtask.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderCard();
      const input = screen.getByTestId('task-checklist-add-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Pay deposit' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('task-checklist-add'));
      });
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(input.value).toBe('Pay deposit');
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('uses the fallback sentence for a network failure', async () => {
      mockCreateSubtask.mockRejectedValueOnce(new Error('down'));
      renderCard();
      fireEvent.change(screen.getByTestId('task-checklist-add-input'), { target: { value: 'x' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('task-checklist-add'));
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't add the checklist item.",
      );
    });
  });

  describe('reorder', () => {
    it('moves an item up', async () => {
      renderCard();
      await choose('Book digger', 'Move up');
      expect(mockReorderSubtasks).toHaveBeenCalledWith('wi-1', { subtaskIds: ['s2', 's1', 's3'] });
      expect(onChanged).toHaveBeenCalled();
    });

    it('moves an item down', async () => {
      renderCard();
      await choose('Book digger', 'Move down');
      expect(mockReorderSubtasks).toHaveBeenCalledWith('wi-1', { subtaskIds: ['s1', 's3', 's2'] });
    });

    it.each([
      ['Order gravel', 'Move up'],
      ['Mark out', 'Move down'],
    ])('cannot move %s with "%s"', async (title, action) => {
      renderCard();
      await openMenu(title);
      const item = await screen.findByRole('menuitem', { name: action });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      await act(async () => {
        fireEvent.click(item);
      });
      expect(mockReorderSubtasks).not.toHaveBeenCalled();
    });

    it('announces the new position in a polite status region, again for a repeated move', async () => {
      renderCard();
      const status = screen.getByTestId('task-checklist-status');
      expect(status).toHaveAttribute('role', 'status');
      expect(status).toHaveTextContent('');
      await choose('Book digger', 'Move up');
      await waitFor(() =>
        expect(status).toHaveTextContent('Book digger moved to position 1 of 3.'),
      );
      await choose('Book digger', 'Move up');
      await waitFor(() =>
        expect(status).toHaveTextContent('Book digger moved to position 1 of 3.'),
      );
    });

    it('announces the position of an item moved down', async () => {
      renderCard();
      await choose('Order gravel', 'Move down');
      await waitFor(() =>
        expect(screen.getByTestId('task-checklist-status')).toHaveTextContent(
          'Order gravel moved to position 2 of 3.',
        ),
      );
    });

    it('does not announce a failed move, and a pending announcement is dropped on unmount', async () => {
      mockReorderSubtasks.mockRejectedValueOnce(new Error('down'));
      const { unmount } = renderCard();
      await choose('Book digger', 'Move up');
      await screen.findByRole('alert');
      expect(screen.getByTestId('task-checklist-status')).toHaveTextContent('');
      await choose('Book digger', 'Move up');
      unmount();
    });

    it('shows an error when reordering fails', async () => {
      mockReorderSubtasks.mockRejectedValueOnce(new Error('down'));
      renderCard();
      await choose('Book digger', 'Move up');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't update the checklist item.",
      );
    });
  });

  describe('rename', () => {
    it('opens the rename dialog with the name and saves the new one', async () => {
      renderCard();
      await choose('Order gravel', 'Rename');
      const input = (await screen.findByTestId('checklist-item-form-title')) as HTMLInputElement;
      expect(input.value).toBe('Order gravel');
      fireEvent.change(input, { target: { value: 'Order sand' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('checklist-item-form-save'));
      });
      await waitFor(() =>
        expect(mockUpdateSubtask).toHaveBeenCalledWith('wi-1', 's1', { title: 'Order sand' }),
      );
      expect(onChanged).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('Cancel closes the dialog and returns focus to the row menu trigger', async () => {
      renderCard();
      await choose('Order gravel', 'Rename');
      await screen.findByTestId('checklist-item-form-title');
      fireEvent.click(screen.getByTestId('checklist-item-form-cancel'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByRole('button', { name: 'Actions for Order gravel' })).toHaveFocus();
    });
  });

  describe('delete', () => {
    it('asks first, then deletes, refreshes and does not report an emptied list', async () => {
      renderCard();
      await choose('Order gravel', 'Delete');
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Order gravel');
      expect(mockDeleteSubtask).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(within(dialog).getByTestId('subtask-delete-confirm'));
      });
      expect(mockDeleteSubtask).toHaveBeenCalledWith('wi-1', 's1');
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(onEmptied).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('reports the card emptied when the last item is deleted', async () => {
      renderCard([item('s1', 'Order gravel')]);
      await choose('Order gravel', 'Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      await waitFor(() => expect(onEmptied).toHaveBeenCalledTimes(1));
    });

    it('Cancel closes the confirmation without deleting and returns focus to the add field', async () => {
      const { addInputRef } = renderCard();
      await choose('Order gravel', 'Delete');
      fireEvent.click(await screen.findByTestId('subtask-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(addInputRef.current).toHaveFocus();
      expect(mockDeleteSubtask).not.toHaveBeenCalled();
    });

    it('keeps the dialog with the translated error when deleting fails, and a retry works', async () => {
      mockDeleteSubtask.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderCard();
      await choose('Order gravel', 'Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByTestId('subtask-delete-confirm'));
      });
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('uses the fallback sentence for a network failure', async () => {
      mockDeleteSubtask.mockRejectedValueOnce(new Error('down'));
      renderCard();
      await choose('Order gravel', 'Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      expect(await screen.findByText("Couldn't delete the checklist item.")).toBeInTheDocument();
    });
  });
});
