/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { KITCHEN, makeTaskRow } from '../../test/taskListFixtures.js';
import type * as BulkModule from './TaskBulkActions.js';
import type { TaskActions } from './useTaskActions.js';

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [
      { id: 'a-1', name: 'Ground floor', parentId: null, sortOrder: 0 },
      { id: 'a-3', name: 'Kitchen', parentId: 'a-1', sortOrder: 0 },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let TaskBulkActions: typeof BulkModule.TaskBulkActions;
let media: MatchMediaControl;

const SELECTED = [
  makeTaskRow({ id: 'wi-a', title: 'Pour the slab' }),
  makeTaskRow({ id: 'wi-b', title: 'Frame the walls', area: KITCHEN }),
];

const bulkSetStatus = jest.fn<TaskActions['bulkSetStatus']>();
const bulkSetArea = jest.fn<TaskActions['bulkSetArea']>();
const clear = jest.fn();

function mount() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TaskBulkActions
          selected={SELECTED}
          clear={clear}
          actions={{ bulkSetStatus, bulkSetArea }}
        />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  media = installMatchMedia();
  media.set('(min-width: 768px)', true);
  if (!TaskBulkActions) ({ TaskBulkActions } = await import('./TaskBulkActions.js'));
  bulkSetStatus.mockReset();
  bulkSetStatus.mockResolvedValue();
  bulkSetArea.mockReset();
  bulkSetArea.mockResolvedValue();
  clear.mockReset();
});

afterEach(() => media.restore());

describe('Set status', () => {
  it('offers the three status words and applies the pick to the selection', async () => {
    mount();
    await userEvent.click(screen.getByTestId('tasks-bulk-status'));
    const menu = await screen.findByTestId('tasks-bulk-status-menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Not started', 'In progress', 'Done']);
    await userEvent.click(screen.getByTestId('tasks-bulk-status-completed'));
    expect(bulkSetStatus).toHaveBeenCalledWith(SELECTED, 'completed', clear);
  });

  it('ignores a second pick while the first run is still in flight', async () => {
    let finish: () => void = () => undefined;
    bulkSetStatus.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    mount();
    await userEvent.click(screen.getByTestId('tasks-bulk-status'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status-in_progress'));
    await userEvent.click(screen.getByTestId('tasks-bulk-status'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status-completed'));
    expect(bulkSetStatus).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(bulkSetStatus).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByTestId('tasks-bulk-status'));
    await userEvent.click(await screen.findByTestId('tasks-bulk-status-completed'));
    expect(bulkSetStatus).toHaveBeenCalledTimes(2);
  });
});

describe('Set area', () => {
  it('opens the area dialog titled with the count, and Close cancels without a change', async () => {
    mount();
    await userEvent.click(screen.getByTestId('tasks-bulk-set-area'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Set area for 2 tasks');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bulkSetArea).not.toHaveBeenCalled();
  });

  it('a pick applies at once to the selection', async () => {
    mount();
    await userEvent.click(screen.getByTestId('tasks-bulk-set-area'));
    await userEvent.click(await screen.findByRole('textbox', { name: 'Set area for 2 tasks' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Ground floor, Kitchen' }));
    expect(bulkSetArea).toHaveBeenCalledWith(SELECTED, 'a-3', clear);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
