/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TradeListItem, TradeMergeResponse, TradeResponse } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as ManagerTypes from './TradesManager.js';

const hook = {
  trades: [] as TradeListItem[],
  isLoading: false,
  isInitialLoading: false,
  error: null as string | null,
  refetch: jest.fn<() => void>(),
  createTrade: jest.fn<(data: { name: string }) => Promise<TradeResponse>>(),
  updateTrade: jest.fn<(id: string, data: { name: string }) => Promise<TradeResponse>>(),
  deleteTrade: jest.fn<(id: string) => Promise<void>>(),
  mergeTrade: jest.fn<(id: string, targetId: string) => Promise<TradeMergeResponse>>(),
};
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({ useTrades: () => hook }));

// The merge dialog's "Keep this trade" field is an EntityPicker (kind trade): it lists the trades
// through the trades API, answered from the same fixtures as the manager's own list.
const mockFetchTrades = jest.fn<() => Promise<{ trades: TradeListItem[] }>>();
jest.unstable_mockModule('../../lib/tradesApi.js', () => ({ fetchTrades: mockFetchTrades }));

const mockShowToast = jest.fn<(variant: string, message: string) => void>();
jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const trade = (id: string, name: string, over: Partial<TradeListItem> = {}): TradeListItem => ({
  id,
  name,
  color: null,
  description: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  vendorCount: 0,
  ...over,
});

const PLUMBING = trade('t-plumb', 'Plumbing', {
  translationKey: 'trades.plumbing',
  vendorCount: 3,
});
const ROOFING = trade('t-roof', 'Roofing', { translationKey: 'trades.roofing', vendorCount: 1 });
const MASONRY = trade('t-mason', 'Mauerwerk Meier', { vendorCount: 0 });

const tradeResponse = (id: string, name: string): TradeResponse => ({
  ...trade(id, name),
});

describe('TradesManager', () => {
  let Manager: typeof ManagerTypes.TradesManager;
  let media: MatchMediaControl;
  const onClose = jest.fn<() => void>();
  const onChanged = jest.fn<(change: ManagerTypes.TradesChange) => void>();

  beforeEach(async () => {
    hook.trades = [PLUMBING, ROOFING, MASONRY];
    hook.isLoading = false;
    hook.isInitialLoading = false;
    hook.error = null;
    hook.refetch.mockReset();
    hook.createTrade.mockReset();
    hook.updateTrade.mockReset();
    hook.deleteTrade.mockReset();
    hook.mergeTrade.mockReset();
    mockFetchTrades.mockReset();
    mockFetchTrades.mockImplementation(() => Promise.resolve({ trades: hook.trades }));
    onClose.mockReset();
    onChanged.mockReset();
    mockShowToast.mockReset();
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Manager) {
      ({ TradesManager: Manager } = await import('./TradesManager.js'));
    }
  });

  afterEach(async () => {
    media.restore();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  function renderManager() {
    return render(<Manager onClose={onClose} onChanged={onChanged} />);
  }

  const rowNames = () =>
    screen.getAllByRole('listitem').map((li) => li.querySelector('span')?.textContent ?? '');
  const newInput = () => screen.getByTestId('trades-manager-new-input') as HTMLInputElement;
  const actions = (name: string) => screen.getByRole('button', { name: `Actions for ${name}` });
  async function openAction(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
    await user.click(actions(name));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  }

  describe('without an onChanged listener', () => {
    it('adds, renames, merges and deletes without one', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockResolvedValue(tradeResponse('t-new', 'Tiling'));
      hook.updateTrade.mockResolvedValue(tradeResponse('t-mason', 'Maurer Meier'));
      hook.mergeTrade.mockResolvedValue({ trade: ROOFING, movedVendorCount: 3 });
      hook.deleteTrade.mockResolvedValue(undefined);
      render(<Manager onClose={onClose} />);

      await user.type(newInput(), 'Tiling{Enter}');
      await waitFor(() => expect(hook.createTrade).toHaveBeenCalledWith({ name: 'Tiling' }));

      await openAction(user, 'Mauerwerk Meier', 'Rename');
      const input = (await screen.findByTestId('trades-manager-rename-input')) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, 'Maurer Meier{Enter}');
      await waitFor(() => expect(hook.updateTrade).toHaveBeenCalled());

      await openAction(user, 'Plumbing', 'Merge duplicates…');
      await user.click(
        within(await screen.findByRole('alertdialog')).getByLabelText('Keep this trade'),
      );
      await user.click(await screen.findByRole('option', { name: 'Roofing' }));
      await user.click(screen.getByTestId('trades-manager-merge-dialog-confirm'));
      await waitFor(() => expect(hook.mergeTrade).toHaveBeenCalledWith('t-plumb', 't-roof'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

      await openAction(user, 'Mauerwerk Meier', 'Delete');
      await user.click(await screen.findByTestId('trades-manager-delete-dialog-confirm'));
      await waitFor(() => expect(hook.deleteTrade).toHaveBeenCalledWith('t-mason'));
    });
  });

  describe('container', () => {
    it('is a dialog titled "Trades" from 768 px up', () => {
      renderManager();
      expect(screen.getByRole('dialog', { name: 'Trades' })).toBeInTheDocument();
      expect(screen.queryByTestId('trades-manager-sheet')).toBeNull();
    });

    it('is a bottom sheet below 768 px', () => {
      media.set('(min-width: 768px)', false);
      renderManager();
      expect(screen.getByTestId('trades-manager-sheet')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Trades' })).toBeInTheDocument();
    });

    it('focuses the new-trade input first', () => {
      renderManager();
      expect(newInput()).toHaveFocus();
    });

    it('Done closes it', async () => {
      const user = userEvent.setup();
      renderManager();
      await user.click(screen.getByTestId('trades-manager-done'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape closes it when nothing else is open', async () => {
      const user = userEvent.setup();
      renderManager();
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('sorts by the displayed English name', () => {
      renderManager();
      expect(rowNames()).toEqual(['Mauerwerk Meier', 'Plumbing', 'Roofing']);
    });

    it('sorts by the displayed German name when the language is German', async () => {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      renderManager();
      // Dacharbeiten (Roofing), Mauerwerk Meier, Sanitär (Plumbing)
      expect(rowNames()).toEqual(['Dacharbeiten', 'Mauerwerk Meier', 'Sanitär']);
    });

    it('shows the company count: none, one, many', () => {
      renderManager();
      const meta = (name: string) =>
        screen.getByText(name).closest('li')!.querySelector('span:nth-of-type(2)')!.textContent;
      expect(meta('Mauerwerk Meier')).toBe('No companies');
      expect(meta('Roofing')).toBe('1 company');
      expect(meta('Plumbing')).toBe('3 companies');
    });

    it('shows a skeleton and no list on the first load', () => {
      hook.isInitialLoading = true;
      hook.isLoading = true;
      hook.trades = [];
      renderManager();
      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
    });

    it('keeps the list mounted on a refetch (isLoading without isInitialLoading)', () => {
      hook.isLoading = true;
      hook.isInitialLoading = false;
      renderManager();
      expect(screen.getByRole('list', { name: 'Trades' })).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: /loading/i })).toBeNull();
    });

    it('shows a load error with Try again, which refetches', async () => {
      const user = userEvent.setup();
      hook.error = 'x';
      hook.trades = [];
      renderManager();
      expect(screen.getByText('Trades could not be loaded.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(hook.refetch).toHaveBeenCalledTimes(1);
    });

    it('shows the empty state when there are no trades', () => {
      hook.trades = [];
      renderManager();
      expect(screen.getByText('No trades yet. Add one above.')).toBeInTheDocument();
    });
  });

  describe('add', () => {
    it('creates a trade on Enter with the trimmed name, then clears and refocuses the input', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockResolvedValue(tradeResponse('t-new', 'Tiling'));
      renderManager();

      await user.type(newInput(), '  Tiling  {Enter}');

      await waitFor(() => expect(hook.createTrade).toHaveBeenCalledWith({ name: 'Tiling' }));
      await waitFor(() => expect(newInput()).toHaveValue(''));
      expect(newInput()).toHaveFocus();
      expect(onChanged).toHaveBeenCalledWith({ kind: 'created', tradeId: 't-new' });
      expect(screen.getByText('Tiling added')).toBeInTheDocument();
    });

    it('creates a trade with the Add button', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockResolvedValue(tradeResponse('t-new', 'Tiling'));
      renderManager();

      await user.type(newInput(), 'Tiling');
      await user.click(screen.getByTestId('trades-manager-add'));

      await waitFor(() => expect(hook.createTrade).toHaveBeenCalledTimes(1));
    });

    it('asks for a name when it is blank and does not call the server', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.type(newInput(), '   {Enter}');

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(newInput()).toHaveAttribute('aria-invalid', 'true');
      expect(newInput()).toHaveFocus();
      expect(hook.createTrade).not.toHaveBeenCalled();
    });

    it('shows the duplicate-name message on a 409 and keeps the typed text', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'exists' }),
      );
      renderManager();

      await user.type(newInput(), 'Roofing{Enter}');

      expect(await screen.findByText('A trade with this name exists already.')).toBeInTheDocument();
      expect(newInput()).toHaveAttribute('aria-invalid', 'true');
      expect(newInput()).toHaveValue('Roofing');
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('shows the translated API error for another failure', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'SQLITE raw' }),
      );
      renderManager();

      await user.type(newInput(), 'Tiling{Enter}');

      expect(
        await screen.findByText('An unexpected error occurred. Please try again.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE raw');
    });

    it('shows the network message when the server cannot be reached', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockRejectedValue(new NetworkError('offline', null));
      renderManager();

      await user.type(newInput(), 'Tiling{Enter}');

      expect(
        await screen.findByText("Can't reach the server. Check your connection and try again."),
      ).toBeInTheDocument();
    });

    it('ignores a second submit while the first is running', async () => {
      const user = userEvent.setup();
      let finish: (t: TradeResponse) => void = () => {};
      hook.createTrade.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderManager();

      await user.type(newInput(), 'Tiling{Enter}');
      await user.click(screen.getByTestId('trades-manager-add'));
      expect(hook.createTrade).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('trades-manager-add')).toHaveAttribute('aria-disabled', 'true');

      await act(async () => {
        finish(tradeResponse('t-new', 'Tiling'));
      });
    });
  });

  describe('rename', () => {
    async function startRename(user: ReturnType<typeof userEvent.setup>, name: string) {
      await openAction(user, name, 'Rename');
      return (await screen.findByTestId('trades-manager-rename-input')) as HTMLInputElement;
    }

    it('starts with the displayed name selected', async () => {
      const user = userEvent.setup();
      renderManager();
      const input = await startRename(user, 'Plumbing');
      expect(input).toHaveValue('Plumbing');
      expect(input).toHaveFocus();
      expect(input).toHaveAccessibleName('New name for Plumbing');
    });

    it('sends no request when the name is unchanged (a built-in trade keeps its translation)', async () => {
      const user = userEvent.setup();
      renderManager();
      await startRename(user, 'Plumbing');

      await user.keyboard('{Enter}');

      expect(hook.updateTrade).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
      expect(screen.queryByTestId('trades-manager-rename-input')).toBeNull();
      await waitFor(() => expect(actions('Plumbing')).toHaveFocus());
    });

    it('treats a name that only differs by surrounding spaces as unchanged', async () => {
      const user = userEvent.setup();
      renderManager();
      const input = await startRename(user, 'Plumbing');

      await user.clear(input);
      await user.type(input, '  Plumbing  {Enter}');

      expect(hook.updateTrade).not.toHaveBeenCalled();
    });

    it('renames with the trimmed name, announces it and returns focus to the row menu', async () => {
      const user = userEvent.setup();
      hook.updateTrade.mockResolvedValue(tradeResponse('t-mason', 'Maurer Meier'));
      renderManager();
      const input = await startRename(user, 'Mauerwerk Meier');

      await user.clear(input);
      await user.type(input, '  Maurer Meier  {Enter}');

      await waitFor(() =>
        expect(hook.updateTrade).toHaveBeenCalledWith('t-mason', { name: 'Maurer Meier' }),
      );
      expect(onChanged).toHaveBeenCalledWith({ kind: 'renamed', tradeId: 't-mason' });
      expect(await screen.findByText('Maurer Meier renamed')).toBeInTheDocument();
      expect(screen.queryByTestId('trades-manager-rename-input')).toBeNull();
      await waitFor(() => expect(actions('Mauerwerk Meier')).toHaveFocus());
    });

    it('shows the replace-translation hint for a built-in trade only', async () => {
      const user = userEvent.setup();
      renderManager();

      await startRename(user, 'Plumbing');
      expect(screen.getByText('Renaming replaces the built-in translation.')).toBeInTheDocument();

      await user.click(screen.getByTestId('trades-manager-rename-cancel'));
      await startRename(user, 'Mauerwerk Meier');
      expect(screen.queryByText('Renaming replaces the built-in translation.')).toBeNull();
    });

    it('Escape cancels the rename only: the dialog stays open', async () => {
      const user = userEvent.setup();
      renderManager();
      await startRename(user, 'Plumbing');

      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('trades-manager-rename-input')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Trades' })).toBeInTheDocument();
      await waitFor(() => expect(actions('Plumbing')).toHaveFocus());
    });

    it('Cancel leaves the name as it was', async () => {
      const user = userEvent.setup();
      renderManager();
      const input = await startRename(user, 'Plumbing');
      await user.type(input, 'xyz');

      await user.click(screen.getByTestId('trades-manager-rename-cancel'));

      expect(hook.updateTrade).not.toHaveBeenCalled();
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
    });

    it('asks for a name when it is cleared', async () => {
      const user = userEvent.setup();
      renderManager();
      const input = await startRename(user, 'Plumbing');

      await user.clear(input);
      await user.keyboard('{Enter}');

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(hook.updateTrade).not.toHaveBeenCalled();
    });

    it('shows the duplicate-name message on a 409 and stays in edit mode', async () => {
      const user = userEvent.setup();
      hook.updateTrade.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'exists' }),
      );
      renderManager();
      const input = await startRename(user, 'Mauerwerk Meier');

      await user.clear(input);
      await user.type(input, 'Roofing{Enter}');

      expect(await screen.findByText('A trade with this name exists already.')).toBeInTheDocument();
      expect(screen.getByTestId('trades-manager-rename-input')).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('shows the network message on a failure that is not an API error', async () => {
      const user = userEvent.setup();
      hook.updateTrade.mockRejectedValue(new NetworkError('offline', null));
      renderManager();
      const input = await startRename(user, 'Mauerwerk Meier');

      await user.clear(input);
      await user.type(input, 'Other{Enter}');

      expect(
        await screen.findByText("Can't reach the server. Check your connection and try again."),
      ).toBeInTheDocument();
    });

    it('ignores a second submit while the first save is still running', async () => {
      const user = userEvent.setup();
      let finish: (t: TradeResponse) => void = () => {};
      hook.updateTrade.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderManager();
      const input = await startRename(user, 'Mauerwerk Meier');

      await user.clear(input);
      await user.type(input, 'Maurer{Enter}');
      // Save is only aria-disabled, so Enter submits the form again.
      await user.type(input, '{Enter}');

      expect(hook.updateTrade).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish(tradeResponse('t-mason', 'Maurer'));
      });
    });

    it('falls back to the New-trade field when the renamed row disappears from the list', async () => {
      const user = userEvent.setup();
      const v = renderManager();
      hook.updateTrade.mockImplementation(async () => {
        // The refetched list no longer contains the renamed row.
        hook.trades = [PLUMBING, ROOFING];
        queueMicrotask(() => v.rerender(<Manager onClose={onClose} onChanged={onChanged} />));
        return tradeResponse('t-mason', 'Maurer');
      });
      const input = await startRename(user, 'Mauerwerk Meier');

      await user.clear(input);
      await user.type(input, 'Maurer{Enter}');

      // The row never shows up: after the bounded retries, focus lands on the field, not body.
      await waitFor(() => expect(newInput()).toHaveFocus(), { timeout: 3000 });
    });
  });

  describe('merge', () => {
    const mergeDialog = () => screen.getByRole('alertdialog');
    const mergeAction = () => screen.getByTestId('trades-manager-merge-dialog-confirm');

    async function openMerge(user: ReturnType<typeof userEvent.setup>, name: string) {
      await openAction(user, name, 'Merge duplicates…');
      await screen.findByRole('alertdialog');
    }

    async function choose(user: ReturnType<typeof userEvent.setup>, optionName: string) {
      await user.click(within(mergeDialog()).getByLabelText('Keep this trade'));
      await user.click(await screen.findByRole('option', { name: optionName }));
    }

    it('opens a dialog named for the trade, with the action disabled until a target is chosen', async () => {
      const user = userEvent.setup();
      renderManager();

      await openMerge(user, 'Roofing');

      expect(
        screen.getByRole('alertdialog', { name: 'Merge Roofing into another trade?' }),
      ).toBeInTheDocument();
      expect(mergeAction()).toHaveAttribute('aria-disabled', 'true');
      expect(mergeAction()).toHaveAccessibleDescription('Choose the trade to keep');
      await user.click(mergeAction());
      expect(hook.mergeTrade).not.toHaveBeenCalled();
    });

    it('does not offer the trade being merged as the one to keep', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Roofing');

      await user.click(within(mergeDialog()).getByLabelText('Keep this trade'));

      expect(await screen.findByRole('option', { name: 'Plumbing' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Mauerwerk Meier' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Roofing' })).not.toBeInTheDocument();
    });

    it('lists the trades through the trades API and offers no inline "New trade" row', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Roofing');

      await user.type(within(mergeDialog()).getByLabelText('Keep this trade'), 'Brand new trade');

      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());
      expect(screen.queryByRole('option', { name: /New trade/ })).not.toBeInTheDocument();
    });

    it('filters the trades to keep by their translated name as the person types', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Roofing');

      await user.type(within(mergeDialog()).getByLabelText('Keep this trade'), 'plumb');

      expect(await screen.findByRole('option', { name: 'Plumbing' })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole('option', { name: 'Mauerwerk Meier' })).not.toBeInTheDocument(),
      );
    });

    it('shows the chosen trade to keep by its display name', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Roofing');

      await choose(user, 'Mauerwerk Meier');

      expect(within(mergeDialog()).getAllByText('Mauerwerk Meier').length).toBeGreaterThan(0);
      expect(
        within(mergeDialog()).getByRole('button', { name: 'Clear selection' }),
      ).toBeInTheDocument();
    });

    it('shows how many companies move once a target is chosen, and enables the action', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Plumbing');

      await choose(user, 'Roofing');

      expect(within(mergeDialog()).getByRole('status')).toHaveTextContent(
        '3 companies move to Roofing',
      );
      expect(mergeAction()).not.toHaveAttribute('aria-disabled');
    });

    it('says one company moves, and that none move for an unused trade', async () => {
      const user = userEvent.setup();
      renderManager();

      await openMerge(user, 'Roofing');
      await choose(user, 'Plumbing');
      expect(within(mergeDialog()).getByRole('status')).toHaveTextContent(
        '1 company moves to Plumbing',
      );
      await user.click(screen.getByTestId('trades-manager-merge-dialog-cancel'));

      await openMerge(user, 'Mauerwerk Meier');
      await choose(user, 'Plumbing');
      expect(within(mergeDialog()).getByRole('status')).toHaveTextContent(
        'No companies move to Plumbing',
      );
    });

    it('merges, toasts, reports the change and focuses the kept row menu', async () => {
      const user = userEvent.setup();
      hook.mergeTrade.mockResolvedValue({
        trade: { ...ROOFING, vendorCount: 4 },
        movedVendorCount: 3,
      });
      renderManager();
      await openMerge(user, 'Plumbing');
      await choose(user, 'Roofing');

      await user.click(mergeAction());

      await waitFor(() => expect(hook.mergeTrade).toHaveBeenCalledWith('t-plumb', 't-roof'));
      expect(onChanged).toHaveBeenCalledWith({
        kind: 'merged',
        fromId: 't-plumb',
        intoId: 't-roof',
      });
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('success', 'Plumbing merged into Roofing'),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() => expect(actions('Roofing')).toHaveFocus());
    });

    it('keeps the dialog open with a message when the merge fails', async () => {
      const user = userEvent.setup();
      hook.mergeTrade.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'gone' }),
      );
      renderManager();
      await openMerge(user, 'Plumbing');
      await choose(user, 'Roofing');

      await user.click(mergeAction());

      expect(await within(mergeDialog()).findByRole('alert')).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
      expect(mergeAction()).not.toHaveAttribute('aria-disabled');
    });

    it('Cancel closes only the dialog and focuses the row menu of the trade', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Plumbing');

      await user.click(screen.getByTestId('trades-manager-merge-dialog-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      await waitFor(() => expect(actions('Plumbing')).toHaveFocus());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('Escape closes only the confirm: the manager stays open', async () => {
      const user = userEvent.setup();
      renderManager();
      await openMerge(user, 'Plumbing');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Trades' })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('disables Merge duplicates when there is only one trade', async () => {
      const user = userEvent.setup();
      hook.trades = [ROOFING];
      renderManager();

      await user.click(actions('Roofing'));

      expect(await screen.findByRole('menuitem', { name: 'Merge duplicates…' })).toBeDisabled();
    });
  });

  describe('delete', () => {
    async function openDelete(user: ReturnType<typeof userEvent.setup>, name: string) {
      await openAction(user, name, 'Delete');
      await screen.findByRole('alertdialog');
    }

    it('blocks a trade that companies use and offers Merge instead', async () => {
      const user = userEvent.setup();
      renderManager();

      await openDelete(user, 'Plumbing');

      const dialog = screen.getByRole('alertdialog', { name: 'Delete Plumbing?' });
      expect(dialog).toHaveTextContent('3 companies still use this trade.');
      expect(screen.queryByTestId('trades-manager-delete-dialog-confirm')).toBeNull();
      expect(screen.getByTestId('trades-manager-merge-instead')).toBeInTheDocument();
    });

    it('uses the singular for one company', async () => {
      const user = userEvent.setup();
      renderManager();

      await openDelete(user, 'Roofing');

      expect(screen.getByRole('alertdialog')).toHaveTextContent('1 company still uses this trade.');
    });

    it('Merge instead swaps the delete dialog for the merge dialog of the same trade', async () => {
      const user = userEvent.setup();
      renderManager();
      await openDelete(user, 'Plumbing');

      await user.click(screen.getByTestId('trades-manager-merge-instead'));

      expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
      expect(
        screen.getByRole('alertdialog', { name: 'Merge Plumbing into another trade?' }),
      ).toBeInTheDocument();
    });

    it('deletes an unused trade after confirming, toasts and focuses the next row', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      renderManager();
      await openDelete(user, 'Mauerwerk Meier');
      expect(screen.getByRole('alertdialog')).toHaveTextContent("This can't be undone.");

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      await waitFor(() => expect(hook.deleteTrade).toHaveBeenCalledWith('t-mason'));
      expect(onChanged).toHaveBeenCalledWith({ kind: 'deleted', tradeId: 't-mason' });
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('success', 'Mauerwerk Meier deleted'),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() => expect(actions('Plumbing')).toHaveFocus());
    });

    it('focuses the next row when a middle row is deleted', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = [trade('t-a', 'Alpha'), trade('t-b', 'Beta'), trade('t-c', 'Gamma')];
      renderManager();
      await openDelete(user, 'Beta');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      await waitFor(() => expect(actions('Gamma')).toHaveFocus());
    });

    it('focuses the previous row when the last one is deleted', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = [trade('t-a', 'Alpha'), trade('t-z', 'Zeta')];
      renderManager();
      await openDelete(user, 'Zeta');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      await waitFor(() => expect(actions('Alpha')).toHaveFocus());
    });

    it('focuses the new-trade input when the only trade is deleted', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = [trade('t-a', 'Alpha')];
      renderManager();
      await openDelete(user, 'Alpha');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      await waitFor(() => expect(newInput()).toHaveFocus());
    });

    it('switches to the blocked form with the count from the 409 details', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockRejectedValue(
        new ApiClientError(409, {
          code: 'TRADE_IN_USE',
          message: 'in use',
          details: { vendorCount: 7 },
        }),
      );
      renderManager();
      await openDelete(user, 'Mauerwerk Meier');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      await waitFor(() =>
        expect(screen.getByRole('alertdialog')).toHaveTextContent(
          '7 companies still use this trade.',
        ),
      );
      expect(screen.queryByTestId('trades-manager-delete-dialog-confirm')).toBeNull();
      expect(screen.getByTestId('trades-manager-merge-instead')).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it.each([
      ['no details', undefined],
      ['a non-numeric count', { vendorCount: 'many' }],
      ['a zero count', { vendorCount: 0 }],
    ])('falls back to one company when the 409 carries %s', async (_label, details) => {
      const user = userEvent.setup();
      hook.deleteTrade.mockRejectedValue(
        new ApiClientError(409, { code: 'TRADE_IN_USE', message: 'in use', details }),
      );
      renderManager();
      await openDelete(user, 'Mauerwerk Meier');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      await waitFor(() =>
        expect(screen.getByRole('alertdialog')).toHaveTextContent(
          '1 company still uses this trade.',
        ),
      );
    });

    it('keeps the dialog open with a message on another failure', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockRejectedValue(new NetworkError('offline', null));
      renderManager();
      await openDelete(user, 'Mauerwerk Meier');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));

      expect(
        await within(screen.getByRole('alertdialog')).findByText(
          "Can't reach the server. Check your connection and try again.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('trades-manager-delete-dialog-confirm')).toBeInTheDocument();
    });

    it('Escape closes only the confirm: the manager stays open', async () => {
      const user = userEvent.setup();
      renderManager();
      await openDelete(user, 'Mauerwerk Meier');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      await waitFor(() => expect(actions('Mauerwerk Meier')).toHaveFocus());
    });
  });

  describe('focus after actions (never on body, #2213)', () => {
    /** Active element on each of the next `frames` animation frames. */
    function sampleFocus(frames: number): Promise<Array<Element | null>> {
      return new Promise((resolve) => {
        const seen: Array<Element | null> = [];
        const step = () => {
          seen.push(document.activeElement);
          if (seen.length >= frames) resolve(seen);
          else window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
      });
    }
    const neverBody = (seen: Array<Element | null>) =>
      seen.every((el) => el !== null && el !== document.body);

    const three = () => [trade('t-a', 'Alpha'), trade('t-b', 'Beta'), trade('t-c', 'Gamma')];

    async function chooseKeep(user: ReturnType<typeof userEvent.setup>, name: string) {
      await screen.findByRole('alertdialog');
      await user.click(within(screen.getByRole('alertdialog')).getByLabelText('Keep this trade'));
      await user.click(await screen.findByRole('option', { name }));
    }

    it('delete: next row, kept for several frames and never on body', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = three();
      renderManager();
      await openAction(user, 'Beta', 'Delete');
      await screen.findByRole('alertdialog');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Gamma'));
    });

    it('delete: keeps retrying while the next row refuses focus on the first frames', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = three();
      renderManager();
      await openAction(user, 'Beta', 'Delete');
      await screen.findByRole('alertdialog');
      const realFocus = HTMLElement.prototype.focus;
      let refused = 0;
      const spy = jest.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        if (this === actions('Gamma') && refused < 2) {
          refused += 1;
          return;
        }
        realFocus.call(this, options);
      });

      try {
        await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));
        await waitFor(() => expect(actions('Gamma')).toHaveFocus());
        expect(refused).toBe(2);
      } finally {
        spy.mockRestore();
      }
    });

    it('delete of the last row: the previous row', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = three();
      renderManager();
      await openAction(user, 'Gamma', 'Delete');
      await screen.findByRole('alertdialog');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Beta'));
    });

    it('delete of the only row: the New-trade field', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = [trade('t-a', 'Alpha')];
      renderManager();
      await openAction(user, 'Alpha', 'Delete');
      await screen.findByRole('alertdialog');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(newInput());
    });

    it('merge: the kept trade row, never on body', async () => {
      const user = userEvent.setup();
      hook.mergeTrade.mockResolvedValue({
        trade: { ...trade('t-c', 'Gamma'), vendorCount: 1 },
        movedVendorCount: 0,
      });
      hook.trades = three();
      renderManager();
      await openAction(user, 'Alpha', 'Merge duplicates…');
      await chooseKeep(user, 'Gamma');

      await user.click(screen.getByTestId('trades-manager-merge-dialog-confirm'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Gamma'));
    });

    it('merge: falls back to the New-trade field when the kept row never shows up, and stops retrying', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      const view = renderManager();
      hook.mergeTrade.mockImplementation(async () => {
        // The refetched list no longer contains the kept trade.
        hook.trades = [trade('t-a', 'Alpha')];
        queueMicrotask(() => view.rerender(<Manager onClose={onClose} onChanged={onChanged} />));
        return { trade: { ...trade('t-c', 'Gamma'), vendorCount: 0 }, movedVendorCount: 0 };
      });
      await openAction(user, 'Alpha', 'Merge duplicates…');
      await chooseKeep(user, 'Gamma');
      const raf = jest.spyOn(window, 'requestAnimationFrame');

      await user.click(screen.getByTestId('trades-manager-merge-dialog-confirm'));

      await waitFor(() => expect(newInput()).toHaveFocus(), { timeout: 3000 });
      // Let the 30-frame budget run out (the dialogs' own restore may focus the field earlier).
      const during = await sampleFocus(45);
      expect(neverBody(during)).toBe(true);
      expect(newInput()).toHaveFocus();

      // Bounded: afterwards nothing keeps scheduling frames except this sampler.
      const before = raf.mock.calls.length;
      await sampleFocus(10);
      expect(raf.mock.calls.length - before).toBe(10);
      raf.mockRestore();
    });

    it('merge: waits for a kept row that renders late, then focuses its ⋯', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      const view = renderManager();
      hook.mergeTrade.mockImplementation(async () => {
        // The refetch is slow: the list loses the kept trade now and shows it ~100 ms later.
        hook.trades = [trade('t-a', 'Alpha')];
        queueMicrotask(() => view.rerender(<Manager onClose={onClose} onChanged={onChanged} />));
        setTimeout(() => {
          hook.trades = three();
          view.rerender(<Manager onClose={onClose} onChanged={onChanged} />);
        }, 100);
        return { trade: { ...trade('t-c', 'Gamma'), vendorCount: 0 }, movedVendorCount: 0 };
      });
      await openAction(user, 'Alpha', 'Merge duplicates…');
      await chooseKeep(user, 'Gamma');

      await user.click(screen.getByTestId('trades-manager-merge-dialog-confirm'));

      await waitFor(() => expect(actions('Gamma')).toHaveFocus(), { timeout: 3000 });
      expect(document.activeElement).not.toBe(document.body);
    });

    it('delete cancel: the ⋯ of that row', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      renderManager();
      await openAction(user, 'Beta', 'Delete');
      await screen.findByRole('alertdialog');

      await user.click(screen.getByTestId('trades-manager-delete-dialog-cancel'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Beta'));
    });

    it('merge cancel: the ⋯ of the merged trade', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      renderManager();
      await openAction(user, 'Beta', 'Merge duplicates…');
      await screen.findByRole('alertdialog');

      await user.click(screen.getByTestId('trades-manager-merge-dialog-cancel'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Beta'));
    });

    it('rename save: the ⋯ of the renamed row', async () => {
      const user = userEvent.setup();
      hook.updateTrade.mockResolvedValue(tradeResponse('t-b', 'Bravo'));
      hook.trades = three();
      renderManager();
      await openAction(user, 'Beta', 'Rename');
      const input = await screen.findByTestId('trades-manager-rename-input');
      await user.clear(input);
      await user.type(input, 'Bravo{Enter}');

      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Beta'));
    });

    it('rename cancel by button: the ⋯ of that row', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      renderManager();
      await openAction(user, 'Beta', 'Rename');
      await screen.findByTestId('trades-manager-rename-input');

      await user.click(screen.getByTestId('trades-manager-rename-cancel'));
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Beta'));
    });

    it('add: the New-trade field keeps focus after the list re-renders', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockResolvedValue(tradeResponse('t-new', 'Delta'));
      hook.trades = three();
      renderManager();

      await user.type(newInput(), 'Delta{Enter}');
      const seen = await sampleFocus(8);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(newInput());
    });

    it('a late re-render does not pull focus off the target', async () => {
      const user = userEvent.setup();
      hook.deleteTrade.mockResolvedValue(undefined);
      hook.trades = three();
      const view = renderManager();
      await openAction(user, 'Alpha', 'Delete');
      await screen.findByRole('alertdialog');
      await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));
      await waitFor(() => expect(actions('Beta')).toHaveFocus());

      hook.trades = [trade('t-b', 'Beta'), trade('t-c', 'Gamma')];
      view.rerender(<Manager onClose={onClose} onChanged={onChanged} />);
      const seen = await sampleFocus(6);

      expect(neverBody(seen)).toBe(true);
      expect(seen[seen.length - 1]).toBe(actions('Beta'));
    });
  });

  describe('focus safety net after the list changes (#2213)', () => {
    const frames = (n: number) =>
      new Promise<void>((resolve) => {
        let left = n;
        const step = () => {
          left -= 1;
          if (left <= 0) resolve();
          else window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
      });
    const three = () => [trade('t-a', 'Alpha'), trade('t-b', 'Beta'), trade('t-c', 'Gamma')];
    const view = (v: ReturnType<typeof renderManager>) =>
      v.rerender(<Manager onClose={onClose} onChanged={onChanged} />);

    it('a refetch that removes the focused row sends focus to the New-trade field, not body', async () => {
      hook.trades = three();
      const v = renderManager();
      actions('Beta').focus();
      expect(actions('Beta')).toHaveFocus();

      hook.trades = [trade('t-a', 'Alpha'), trade('t-c', 'Gamma')];
      view(v);
      await frames(4);

      expect(document.activeElement).not.toBe(document.body);
      expect(newInput()).toHaveFocus();
    });

    it('leaves focus alone when the changed list keeps the focused row', async () => {
      hook.trades = three();
      const v = renderManager();
      actions('Beta').focus();

      hook.trades = [...three(), trade('t-d', 'Delta')];
      view(v);
      await frames(4);

      expect(actions('Beta')).toHaveFocus();
    });

    it('stays out of the way of a pending explicit focus request', async () => {
      const user = userEvent.setup();
      hook.createTrade.mockResolvedValue(tradeResponse('t-new', 'Delta'));
      hook.trades = three();
      const v = renderManager();

      await user.type(newInput(), 'Delta{Enter}');
      hook.trades = [...three(), trade('t-new', 'Delta')];
      view(v);
      await frames(6);

      expect(newInput()).toHaveFocus();
    });

    it('focus on Done is left alone', async () => {
      hook.trades = three();
      const v = renderManager();
      screen.getByTestId('trades-manager-done').focus();

      hook.trades = [trade('t-a', 'Alpha')];
      view(v);
      await frames(4);

      expect(screen.getByTestId('trades-manager-done')).toHaveFocus();
    });

    it('focus inside a nested confirm dialog is left alone', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      const v = renderManager();
      await openAction(user, 'Beta', 'Delete');
      await screen.findByRole('alertdialog');
      const cancel = screen.getByTestId('trades-manager-delete-dialog-cancel');
      expect(cancel).toHaveFocus();

      hook.trades = [trade('t-b', 'Beta'), trade('t-c', 'Gamma')];
      view(v);
      await frames(4);

      expect(cancel).toHaveFocus();
    });

    it('focus on an open menu item is left alone', async () => {
      const user = userEvent.setup();
      hook.trades = three();
      const v = renderManager();
      await user.click(actions('Beta'));
      const item = await screen.findByRole('menuitem', { name: 'Rename' });
      item.focus();

      hook.trades = [...three(), trade('t-d', 'Delta')];
      view(v);
      await frames(4);

      expect(item).toHaveFocus();
    });

    describe('delete candidates resolved against the refetched list', () => {
      async function deleteBeta(
        user: ReturnType<typeof userEvent.setup>,
        refetched: ReturnType<typeof three>,
      ) {
        hook.trades = three();
        const v = renderManager();
        hook.deleteTrade.mockImplementation(async () => {
          hook.trades = refetched;
          queueMicrotask(() => view(v));
        });
        await openAction(user, 'Beta', 'Delete');
        await screen.findByRole('alertdialog');
        await user.click(screen.getByTestId('trades-manager-delete-dialog-confirm'));
      }

      it('uses the next row when it survives the refetch', async () => {
        const user = userEvent.setup();
        await deleteBeta(user, [trade('t-a', 'Alpha'), trade('t-c', 'Gamma')]);

        await waitFor(() => expect(actions('Gamma')).toHaveFocus());
      });

      it('falls back to the previous row when the next one disappeared too', async () => {
        const user = userEvent.setup();
        await deleteBeta(user, [trade('t-a', 'Alpha')]);

        await waitFor(() => expect(actions('Alpha')).toHaveFocus());
        expect(document.activeElement).not.toBe(document.body);
      });

      it('falls back to the New-trade field when both neighbours disappeared', async () => {
        const user = userEvent.setup();
        await deleteBeta(user, [trade('t-z', 'Zulu')].slice(0, 0));

        await waitFor(() => expect(newInput()).toHaveFocus(), { timeout: 3000 });
        await frames(3);
        expect(document.activeElement).not.toBe(document.body);
        expect(newInput()).toHaveFocus();
      });

      it('falls back to the field when only unrelated rows are left', async () => {
        const user = userEvent.setup();
        await deleteBeta(user, [trade('t-z', 'Zulu')]);

        await waitFor(() => expect(newInput()).toHaveFocus(), { timeout: 3000 });
        expect(actions('Zulu')).not.toHaveFocus();
      });
    });
  });
});
