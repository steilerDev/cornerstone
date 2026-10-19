/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DeleteImpactResponse } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as DialogTypes from './AreaDeleteDialog.js';

const mockFetchDeleteImpact =
  jest.fn<(entityType: string, id: string | number) => Promise<DeleteImpactResponse>>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

let AreaDeleteDialog: typeof DialogTypes.AreaDeleteDialog;

beforeAll(async () => {
  ({ AreaDeleteDialog } = await import('./AreaDeleteDialog.js'));
});

const IMPACT: DeleteImpactResponse = {
  entityType: 'area',
  id: 'a1',
  effects: [
    { kind: 'childAreas', count: 2 },
    { kind: 'photosLoseArea', count: 5 },
  ],
};

describe('AreaDeleteDialog', () => {
  let media: MatchMediaControl;
  let onConfirm: jest.Mock<() => void>;
  let onCancel: jest.Mock<() => void>;
  let onNavigate: jest.Mock<() => void>;

  beforeEach(() => {
    media = installMatchMedia({ '(min-width: 768px)': true });
    onConfirm = jest.fn<() => void>();
    onCancel = jest.fn<() => void>();
    onNavigate = jest.fn<() => void>();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue(IMPACT);
  });

  afterEach(() => {
    media.restore();
  });

  function renderDialog(props: Partial<DialogTypes.AreaDeleteDialogProps> = {}) {
    return render(
      <MemoryRouter>
        <AreaDeleteDialog
          areaId="a1"
          path="House › Ground floor"
          tasks={0}
          purchases={0}
          busy={false}
          error={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onNavigate={onNavigate}
          {...props}
        />
      </MemoryRouter>,
    );
  }

  describe('confirm (nothing booked)', () => {
    it('asks to delete the area by its full path and loads the consequences of that area', async () => {
      renderDialog();
      expect(
        screen.getByRole('alertdialog', { name: 'Delete House › Ground floor?' }),
      ).toBeInTheDocument();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('area', 'a1');
      const list = await screen.findByTestId('areas-delete-dialog-consequences');
      expect(within(list).getAllByRole('listitem')).toHaveLength(2);
      expect(list).toHaveTextContent('2');
      expect(list).toHaveTextContent('5');
    });

    it('offers Cancel and a Delete action, and shows no blocked text or links', async () => {
      renderDialog();
      await screen.findByTestId('areas-delete-dialog-consequences');
      expect(screen.getByTestId('areas-delete-dialog-cancel')).toHaveTextContent('Cancel');
      expect(screen.getByTestId('areas-delete-dialog-confirm')).toHaveTextContent('Delete');
      expect(screen.queryByText(/can't be deleted yet/)).toBeNull();
      expect(screen.queryByTestId('areas-delete-show-tasks')).toBeNull();
    });

    it('confirms and cancels through the callbacks', async () => {
      const user = userEvent.setup();
      renderDialog();
      await screen.findByTestId('areas-delete-dialog-consequences');
      await user.click(screen.getByTestId('areas-delete-dialog-confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      await user.click(screen.getByTestId('areas-delete-dialog-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('shows the busy label while deleting', async () => {
      renderDialog({ busy: true });
      await screen.findByTestId('areas-delete-dialog-consequences');
      expect(screen.getByTestId('areas-delete-dialog-confirm')).toHaveTextContent('Deleting…');
    });

    it('shows a delete error in the dialog', async () => {
      renderDialog({ error: 'Something went wrong.' });
      await screen.findByTestId('areas-delete-dialog-consequences');
      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });

    it('shows a failed consequences load with a retry', async () => {
      mockFetchDeleteImpact.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      renderDialog();
      const retry = await screen.findByTestId('areas-delete-dialog-retry');
      await user.click(retry);
      await waitFor(() => expect(mockFetchDeleteImpact).toHaveBeenCalledTimes(2));
    });
  });

  describe('blocked (rolled-up totals above zero)', () => {
    it('explains the block with the path and the task count, and only offers Close', async () => {
      renderDialog({ tasks: 3 });
      expect(screen.getByText("House › Ground floor can't be deleted yet.")).toBeInTheDocument();
      expect(
        screen.getByText('3 tasks are booked here or in a sub-area. Move or delete them first.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('areas-delete-dialog-cancel')).toHaveTextContent('Close');
      expect(screen.queryByTestId('areas-delete-dialog-confirm')).toBeNull();
    });

    it('does not load the consequences while blocked', async () => {
      renderDialog({ tasks: 1 });
      await Promise.resolve();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('uses the singular for one task', () => {
      renderDialog({ tasks: 1 });
      expect(
        screen.getByText('1 task is booked here or in a sub-area. Move or delete them first.'),
      ).toBeInTheDocument();
    });

    it('names purchases when only purchases are in the way', () => {
      renderDialog({ purchases: 2 });
      expect(
        screen.getByText(
          '2 purchases are booked here or in a sub-area. Move or delete them first.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('areas-delete-show-tasks')).toBeNull();
      expect(screen.getByTestId('areas-delete-show-purchases')).toBeInTheDocument();
    });

    it('names both when tasks and purchases are in the way', () => {
      renderDialog({ tasks: 1, purchases: 4 });
      expect(
        screen.getByText(
          '1 task and 4 purchases are booked here or in a sub-area. Move or delete them first.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('areas-delete-show-tasks')).toBeInTheDocument();
      expect(screen.getByTestId('areas-delete-show-purchases')).toBeInTheDocument();
    });

    it('links to the filtered task and purchase lists of this area', () => {
      renderDialog({ areaId: 'area-9', tasks: 1, purchases: 1 });
      const tasks = screen.getByTestId('areas-delete-show-tasks');
      const purchases = screen.getByTestId('areas-delete-show-purchases');
      expect(tasks).toHaveTextContent('Show these tasks');
      expect(purchases).toHaveTextContent('Show these purchases');
      expect(tasks.getAttribute('href')).toMatch(/areaId=area-9/);
      expect(purchases.getAttribute('href')).toMatch(/areaId=area-9/);
      expect(tasks.getAttribute('href')).not.toBe(purchases.getAttribute('href'));
    });

    it('closes the dialog when a link is followed', async () => {
      const user = userEvent.setup();
      renderDialog({ tasks: 1 });
      await user.click(screen.getByTestId('areas-delete-show-tasks'));
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('Close calls onCancel', async () => {
      const user = userEvent.setup();
      renderDialog({ tasks: 1 });
      await user.click(screen.getByTestId('areas-delete-dialog-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('forceBlocked blocks although the loaded counts are zero, with only the generic lead', () => {
      renderDialog({ forceBlocked: true });
      expect(screen.getByText("House › Ground floor can't be deleted yet.")).toBeInTheDocument();
      expect(screen.getByText('Move or delete them first.')).toBeInTheDocument();
      expect(screen.queryByTestId('areas-delete-dialog-confirm')).toBeNull();
      expect(screen.queryByTestId('areas-delete-show-tasks')).toBeNull();
      expect(screen.queryByTestId('areas-delete-show-purchases')).toBeNull();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('switches from confirm to blocked when the 409 arrives (forceBlocked flips)', async () => {
      const { rerender } = renderDialog();
      await screen.findByTestId('areas-delete-dialog-consequences');
      expect(screen.getByTestId('areas-delete-dialog-confirm')).toBeInTheDocument();
      rerender(
        <MemoryRouter>
          <AreaDeleteDialog
            areaId="a1"
            path="House › Ground floor"
            tasks={0}
            purchases={0}
            forceBlocked
            busy={false}
            error={null}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onNavigate={onNavigate}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId('areas-delete-dialog-confirm')).toBeNull();
      expect(screen.getByText("House › Ground floor can't be deleted yet.")).toBeInTheDocument();
    });
  });
});
