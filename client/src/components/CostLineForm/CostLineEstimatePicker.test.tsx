/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type * as PickerModule from './CostLineEstimatePicker.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

const mockFetchWork = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockFetchHousehold = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWork,
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHousehold,
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

let CostLineEstimatePicker: typeof PickerModule.CostLineEstimatePicker;

beforeEach(async () => {
  jest.clearAllMocks();
  installMatchMedia({ '(min-width: 768px)': true });
  ({ CostLineEstimatePicker } = await import('./CostLineEstimatePicker.js'));
});

const TASK = { type: 'work_item' as const, id: 'w1', label: 'Tiling', area: null };
const HOUSE = { type: 'household_item' as const, id: 'h1', label: 'Sofa', area: null };
const line = (id: string, description: string | null, plannedAmount: number) => ({
  id,
  description,
  plannedAmount,
  includesVat: true,
  invoiceLink: null,
});

function setup(target: typeof TASK | typeof HOUSE | null, takenIds: string[] = []) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  const user = userEvent.setup();
  const view = render(
    <CostLineEstimatePicker
      target={target}
      takenIds={new Set(takenIds)}
      onPick={onPick}
      onClose={onClose}
    />,
  );
  return { ...view, user, onPick, onClose };
}

describe('CostLineEstimatePicker', () => {
  it('asks to pick a task or purchase first without a target', () => {
    setup(null);
    expect(screen.getByText('Pick a task or purchase in this row first.')).toBeInTheDocument();
    expect(mockFetchWork).not.toHaveBeenCalled();
  });

  it('lists the unlinked lines of a task, skips linked and taken ones and picks one', async () => {
    mockFetchWork.mockResolvedValue([
      line('a', 'Tiles', 119),
      line('b', 'Taken', 10),
      { ...line('c', 'Linked', 5), invoiceLink: { id: 'x' } },
      line('d', null, 50),
    ]);
    const { user, onPick } = setup(TASK, ['b']);
    const dialog = screen.getByRole('dialog', { name: 'Use an existing cost line' });
    expect(await within(dialog).findByText('Tiles')).toBeInTheDocument();
    expect(within(dialog).queryByText('Taken')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Linked')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Line without a description')).toBeInTheDocument();
    await user.click(within(dialog).getByTestId('cost-line-existing-use-a'));
    expect(onPick).toHaveBeenCalledWith({
      id: 'a',
      type: 'work_item',
      description: 'Tiles',
      gross: 119,
    });
  });

  it('loads the lines of a purchase', async () => {
    mockFetchHousehold.mockResolvedValue([line('h', 'Cushions', 40)]);
    setup(HOUSE);
    expect(await screen.findByText('Cushions')).toBeInTheDocument();
    expect(mockFetchHousehold).toHaveBeenCalledWith('h1');
  });

  it('says when there is nothing to use and when loading fails', async () => {
    mockFetchWork.mockResolvedValueOnce([]);
    const first = setup(TASK);
    expect(
      await screen.findByText('Tiling has no lines without an offer or invoice.'),
    ).toBeInTheDocument();
    first.unmount();
    mockFetchWork.mockRejectedValueOnce(new Error('x'));
    setup(TASK);
    expect(await screen.findByText('The cost lines could not be loaded.')).toBeInTheDocument();
  });

  it('shows the lines of the newest target when it changes while loading', async () => {
    let resolve!: (v: unknown) => void;
    mockFetchWork.mockReturnValue(new Promise((r) => (resolve = r)));
    const { rerender } = setup(TASK);
    expect(screen.queryByText('Tiles')).not.toBeInTheDocument();
    mockFetchHousehold.mockResolvedValue([line('h', 'Cushions', 40)]);
    rerender(
      <CostLineEstimatePicker
        target={HOUSE}
        takenIds={new Set()}
        onPick={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByText('Cushions')).toBeInTheDocument();
    resolve([line('a', 'Tiles', 1)]);
    await waitFor(() => expect(screen.queryByText('Tiles')).not.toBeInTheDocument());
  });

  it('ignores a failure that arrives after it was closed', async () => {
    let reject!: (e: unknown) => void;
    mockFetchWork.mockReturnValue(new Promise((_r, rj) => (reject = rj)));
    const { unmount } = setup(TASK);
    unmount();
    reject(new Error('late'));
    await Promise.resolve();
    expect(screen.queryByText('The cost lines could not be loaded.')).not.toBeInTheDocument();
  });

  it('closes with Cancel', async () => {
    mockFetchWork.mockResolvedValue([]);
    const { user, onClose } = setup(TASK);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
